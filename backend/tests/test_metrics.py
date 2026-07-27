"""Tests for the Prometheus /metrics endpoint and its instrumentation (#984).

Like test_ml_api_internal_secret_gate.py, these import the real ``api`` module
(which loads the models and wires the request-lifecycle hooks) so the endpoint,
the PUBLIC_PATHS exemption, and the after_request counters are exercised end to
end rather than against a stand-in app.
"""

import os
from   pathlib                  import Path
import sys

import pytest

BASE_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = BASE_DIR / "backend"

os.environ.setdefault("MODEL_PATH", str(BASE_DIR / "linear_svm_model.pkl"))
os.environ.setdefault("VECTORIZER_PATH", str(BACKEND_DIR / "tfidf_vectorizer.pkl"))
os.environ.setdefault("LABEL_ENCODER_PATH", str(BASE_DIR / "label_encoder.pkl"))
os.environ.setdefault("URL_MODEL_PATH", str(BACKEND_DIR / "url_detector.pkl"))
os.environ.setdefault("URL_VECTORIZER_PATH", str(BACKEND_DIR / "url_vectorizer.pkl"))

sys.path.insert(0, str(BACKEND_DIR))

import api as api_module # noqa: E402
import metrics as metrics_module # noqa: E402

from   conftest                 import TEST_INTERNAL_SECRET # noqa: E402

VALID_SECRET = {"X-Internal-Secret": TEST_INTERNAL_SECRET}

METRIC_NAMES = [
    "spam_predictions_total",
    "spam_request_latency_seconds",
    "spam_requests_total",
    "spam_errors_total",
    "spam_rate_limit_rejections_total",
    "spam_model_loaded",
]


@pytest.fixture
def client():
    api_module.app.config["TESTING"] = True
    with api_module.app.test_client() as c:
        yield c


def test_metrics_public_and_prometheus_content_type(client):
    # No internal secret supplied: /metrics must be reachable by a scraper.
    res = client.get("/metrics")
    assert res.status_code == 200
    assert res.headers["Content-Type"].startswith("text/plain")
    assert "version=0.0.4" in res.headers["Content-Type"]


def test_metrics_output_lists_all_metric_names(client):
    body = client.get("/metrics").get_data(as_text=True)
    for name in METRIC_NAMES:
        assert name in body


def test_model_loaded_gauge_set_at_startup(client):
    # Models load at import time, which flips the gauge to 1.
    assert metrics_module.registry.get_sample_value("spam_model_loaded") == 1.0


def test_request_increments_request_counter(client):
    labels = {"endpoint": "health", "method": "GET", "status": "200"}
    before = (
        metrics_module.registry.get_sample_value("spam_requests_total", labels) or 0.0
    )

    client.get("/health")

    after = metrics_module.registry.get_sample_value("spam_requests_total", labels)
    assert after == before + 1.0


def test_prediction_increments_prediction_counter(client):
    def spam_count():
        total = 0.0
        for input_type in ("message", "url"):
            for result in ("spam", "ham", "smishing", "unknown", "safe", "malicious"):
                total += (
                    metrics_module.registry.get_sample_value(
                        "spam_predictions_total",
                        {"result": result, "input_type": input_type},
                    )
                    or 0.0
                )
        return total

    before = spam_count()
    res = client.post(
        "/predict",
        json={"text": "Win a free prize now!", "type": "message"},
        headers=VALID_SECRET,
    )
    assert res.status_code == 200
    assert spam_count() >= before + 1.0
