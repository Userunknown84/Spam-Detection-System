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


def test_predict_includes_explanation(client):
    response = client.post("/predict", json={"text": "Win a free prize now!", "type": "message"})
    assert response.status_code == 200
    data = response.get_json()
    assert data["result"] in {"spam", "ham", "smishing", "unknown"}
    assert "explanation" in data
    explanation = data["explanation"]
    assert isinstance(explanation, dict)
    assert "score" in explanation
    assert "reasons" in explanation
    assert "matched_keywords" in explanation
    assert "spam_patterns" in explanation
    assert explanation["spam_patterns"]["promotional"] is True
    assert explanation["spam_patterns"]["urls"] is False
    assert explanation["score"] >= 0
