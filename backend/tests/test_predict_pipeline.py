"""Regression tests for issue #972: the /predict handler used to return a raw
label-encoded prediction near the top of its try block, short-circuiting the
entire enrichment pipeline (length validation, translation, domain/URL risk,
confidence scoring, explanation, severity) and emitting a numeric, sometimes
non-JSON-serializable label.

These tests lock in the full standardized response schema across the three
prediction paths (plain message, URL, and translated non-English input) so the
premature-return regression cannot silently return.
"""

import os
import sys
from pathlib import Path
from unittest.mock import patch

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

MESSAGE_LABELS = {"ham", "spam", "smishing", "unknown"}
URL_LABELS = {"safe", "malicious", "unknown"}


@pytest.fixture
def client():
    api_module.app.config["TESTING"] = True
    with api_module.app.test_client() as c:
        yield c


def _assert_native_json_types(data):
    # The original bug returned a raw numpy label-encoded int, which is not
    # reliably JSON-serializable. Every scalar the schema promises must be a
    # native Python type.
    assert isinstance(data["result"], str)
    assert data["result"] == data["prediction"]
    # A decoded word label, never a stringified class index like "0"/"1".
    assert not data["result"].lstrip("-").isdigit()
    assert isinstance(data["confidence"], float)
    assert isinstance(data["confidence_score"], float)
    assert isinstance(data["confidence_level"], str)
    assert data["decision_score"] is None or isinstance(data["decision_score"], float)


def _assert_full_schema(data):
    for key in (
        "input",
        "result",
        "prediction",
        "confidence",
        "confidence_score",
        "confidence_level",
        "detected_language",
        "translated",
        "domain_analysis",
        "url_risk",
        "explanation",
        "severity",
    ):
        assert key in data, f"missing '{key}' in standardized response"
    _assert_native_json_types(data)
    assert isinstance(data["explanation"], dict)
    assert isinstance(data["domain_analysis"], dict)
    assert set(data["url_risk"]) == {"is_url_present", "score", "level"}
    # The dead-code response shape must be gone for good.
    assert "normalized_text" not in data
    assert "original_text" not in data


def test_message_path_returns_full_schema(client):
    res = client.post(
        "/predict", json={"text": "Win a free prize now, click here!", "type": "message"}
    )
    assert res.status_code == 200
    data = res.get_json()
    _assert_full_schema(data)
    assert data["result"] in MESSAGE_LABELS
    assert data["detected_language"] == "en"
    assert data["translated"] is False


def test_url_path_returns_full_schema(client):
    res = client.post(
        "/predict", json={"text": "http://example.com/login-verify", "type": "url"}
    )
    assert res.status_code == 200
    data = res.get_json()
    _assert_full_schema(data)
    assert data["result"] in URL_LABELS


def test_translation_path_returns_full_schema(client):
    spanish_text = "¡Reclama tu recompensa gratis ahora!"
    with patch("langdetect.detect", return_value="es"), patch(
        "deep_translator.GoogleTranslator.translate",
        return_value="Claim your free reward now!",
    ):
        res = client.post("/predict", json={"text": spanish_text, "type": "message"})
    assert res.status_code == 200
    data = res.get_json()
    _assert_full_schema(data)
    assert data["result"] in MESSAGE_LABELS
    assert data["input"] == spanish_text
    assert data["detected_language"] == "es"
    assert data["translated"] is True
    assert data["translated_text"] == "Claim your free reward now!"


def test_oversized_input_rejected_before_inference(client):
    # Length validation must run ahead of any vectorization/inference so the
    # model is never handed an oversized payload.
    oversized = "a" * (api_module.MAX_MESSAGE_LENGTH + 1)
    with patch.object(api_module.model, "predict") as mock_predict:
        res = client.post("/predict", json={"text": oversized, "type": "message"})
    assert res.status_code == 400
    assert "maximum length" in res.get_json()["error"]
    mock_predict.assert_not_called()
