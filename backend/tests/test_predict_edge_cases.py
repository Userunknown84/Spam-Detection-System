"""Regression tests for issue #355: edge-case input must be rejected (not
passed to the model), and identical input must always produce identical
output (deterministic preprocessing / language detection)."""

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
    with api_module.app.test_client() as c:
        yield c


@pytest.mark.parametrize("blank", ["", "   ", "\t", "\n", " \t\n ", " "])
def test_blank_input_rejected(client, blank):
    res = client.post("/predict", json={"text": blank, "type": "message"})
    assert res.status_code == 400
    assert res.get_json()["error"] == "No text provided"


def test_missing_text_rejected(client):
    res = client.post("/predict", json={"type": "message"})
    assert res.status_code == 400
    assert res.get_json()["error"] == "No text provided"


def test_identical_input_yields_identical_output(client):
    payload = {"text": "Win a free prize now, click here!", "type": "message"}
    results = []
    for _ in range(5):
        res = client.post("/predict", json=payload)
        assert res.status_code == 200
        body = res.get_json()
        results.append((body["result"], body.get("confidence")))
    # Every resubmission of identical input must produce the identical label
    # and confidence.
    assert len(set(results)) == 1, f"Non-deterministic output: {results}"


def test_borderline_short_input_is_deterministic(client):
    # Short / borderline input previously flipped labels because language
    # detection was non-deterministic; it must now be stable across calls.
    payload = {"text": "hi", "type": "message"}
    results = [
        client.post("/predict", json=payload).get_json()["result"]
        for _ in range(5)
    ]
    assert len(set(results)) == 1, f"Non-deterministic output: {results}"


def test_language_detection_seed_is_fixed(client):
    # Exercising /predict must leave langdetect seeded for reproducibility.
    # Skipped where the optional langdetect dependency isn't installed (the
    # endpoint then falls back to "en" and stays deterministic anyway).
    pytest.importorskip("langdetect")
    client.post("/predict", json={"text": "hello world", "type": "message"})
    from langdetect import DetectorFactory

    assert DetectorFactory.seed == 0


def test_predict_no_unbound_local_or_name_error(client):
    # Regression test for NameError: name 'final_output' is not defined.
    # Ensure both URL and message prediction flows complete successfully without NameError/UnboundLocalError.
    res_msg = client.post("/predict", json={"text": "Hello, this is a test message!", "type": "message"})
    assert res_msg.status_code == 200
    assert "prediction" in res_msg.get_json()
    assert res_msg.get_json()["prediction"] is not None

    res_url = client.post("/predict", json={"text": "http://example.com/spam-link", "type": "url"})
    assert res_url.status_code == 200
    assert "prediction" in res_url.get_json()
    assert res_url.get_json()["prediction"] is not None

