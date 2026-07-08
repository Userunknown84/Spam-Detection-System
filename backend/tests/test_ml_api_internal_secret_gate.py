"""Verifies the ML API rejects direct calls that don't carry the internal
shared secret the trusted Node/Express backend attaches to every request
(issue #354). Enforcement is opted into per-test via ENFORCE_INTERNAL_SECRET
so these tests exercise the production behavior (TESTING never disables it in
deployment)."""

import os
import sys
from pathlib import Path

import pytest

BASE_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = BASE_DIR / "backend"

os.environ.setdefault("MODEL_PATH", str(BASE_DIR / "linear_svm_model.pkl"))
os.environ.setdefault("VECTORIZER_PATH", str(BACKEND_DIR / "tfidf_vectorizer.pkl"))
os.environ.setdefault("LABEL_ENCODER_PATH", str(BASE_DIR / "label_encoder.pkl"))
os.environ.setdefault("URL_MODEL_PATH", str(BACKEND_DIR / "url_detector.pkl"))
os.environ.setdefault("URL_VECTORIZER_PATH", str(BACKEND_DIR / "url_vectorizer.pkl"))

sys.path.insert(0, str(BACKEND_DIR))

import api as api_module  # noqa: E402


@pytest.fixture
def client():
    api_module.app.config["TESTING"] = True
    # Opt in to enforcement so we test the real gate behavior.
    api_module.app.config["ENFORCE_INTERNAL_SECRET"] = True
    with api_module.app.test_client() as c:
        yield c
    api_module.app.config["ENFORCE_INTERNAL_SECRET"] = False


from conftest import TEST_INTERNAL_SECRET

VALID_SECRET = {"X-Internal-Secret": TEST_INTERNAL_SECRET}


def test_predict_rejected_without_secret(client):
    res = client.post("/predict", json={"text": "Win a prize!", "type": "message"})
    assert res.status_code == 403
    assert "Forbidden" in res.get_json()["error"]


def test_predict_rejected_with_wrong_secret(client):
    res = client.post(
        "/predict",
        json={"text": "Win a prize!", "type": "message"},
        headers={"X-Internal-Secret": "not-the-real-secret"},
    )
    assert res.status_code == 403


def test_predict_allowed_with_valid_secret(client):
    res = client.post(
        "/predict",
        json={"text": "Win a prize!", "type": "message"},
        headers=VALID_SECRET,
    )
    assert res.status_code == 200
    assert res.get_json()["result"] in {"spam", "ham", "smishing", "unknown"}


@pytest.mark.parametrize("path", ["/importance", "/api/wordcloud", "/spam-insights", "/api/word-of-the-day"])
def test_other_ml_routes_rejected_without_secret(client, path):
    res = client.get(path)
    assert res.status_code == 403


def test_health_check_allowed_without_secret(client):
    # Liveness/readiness probes must remain reachable without the secret.
    assert client.get("/health").status_code == 200
    assert client.get("/").status_code == 200


def test_preflight_allowed_without_secret(client):
    res = client.open("/predict", method="OPTIONS")
    assert res.status_code != 403
