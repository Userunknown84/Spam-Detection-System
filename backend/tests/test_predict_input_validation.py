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


def test_oversized_payload_rejected(client):
    oversized = "a" * (api_module.MAX_MESSAGE_LENGTH + 1)
    response = client.post("/predict", json={"text": oversized, "type": "message"})
    assert response.status_code == 400
    data = response.get_json()
    assert "maximum length" in data["error"]


def test_payload_at_limit_accepted(client):
    at_limit = "a" * api_module.MAX_MESSAGE_LENGTH
    response = client.post("/predict", json={"text": at_limit, "type": "message"})
    assert response.status_code == 200


@pytest.mark.parametrize("bad_text", [123, 4.5, True, ["a", "b"], {"nested": "object"}])
def test_non_string_text_rejected(client, bad_text):
    response = client.post("/predict", json={"text": bad_text, "type": "message"})
    assert response.status_code == 400
    data = response.get_json()
    assert "must be a string" in data["error"]


def test_missing_text_rejected(client):
    response = client.post("/predict", json={"type": "message"})
    assert response.status_code == 400
    assert response.get_json()["error"] == "No text provided"


def test_empty_text_rejected(client):
    response = client.post("/predict", json={"text": "   ", "type": "message"})
    assert response.status_code == 400
    assert response.get_json()["error"] == "No text provided"


def test_non_object_body_rejected(client):
    response = client.post(
        "/predict", data="not json", content_type="application/json"
    )
    assert response.status_code == 400
    assert "JSON object" in response.get_json()["error"]


def test_valid_message_still_works(client):
    response = client.post(
        "/predict", json={"text": "Win a free prize now!", "type": "message"}
    )
    assert response.status_code == 200
    assert response.get_json()["result"] in {"spam", "ham", "smishing", "unknown"}
