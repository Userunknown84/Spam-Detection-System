import os
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock
import pytest

BASE_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = BASE_DIR / "backend"

# Ensure environment variables are loaded for ML modules
os.environ.setdefault("MODEL_PATH", str(BASE_DIR / "linear_svm_model.pkl"))
os.environ.setdefault("VECTORIZER_PATH", str(BACKEND_DIR / "tfidf_vectorizer.pkl"))
os.environ.setdefault("LABEL_ENCODER_PATH", str(BASE_DIR / "label_encoder.pkl"))
os.environ.setdefault("URL_MODEL_PATH", str(BACKEND_DIR / "url_detector.pkl"))
os.environ.setdefault("URL_VECTORIZER_PATH", str(BACKEND_DIR / "url_vectorizer.pkl"))

sys.path.insert(0, str(BACKEND_DIR))

import api as api_module
import app as app_module

@pytest.fixture
def api_client():
    api_module.app.config["TESTING"] = True
    with api_module.app.test_client() as c:
        yield c

@pytest.fixture
def app_client():
    app_module.app.config["TESTING"] = True
    with app_module.app.test_client() as c:
        yield c

class TestMultilingualSupport:
    @patch("langdetect.detect", return_value="es")
    @patch("deep_translator.GoogleTranslator.translate", return_value="Claim your free reward now!")
    def test_api_predict_spanish_translation(self, mock_translate, mock_detect, api_client):
        # Sending a Spanish spam-like message
        spanish_text = "¡Reclama tu recompensa gratis ahora!"
        
        response = api_client.post("/predict", json={"text": spanish_text})
        assert response.status_code == 200
        data = response.get_json()
        
        # Verify inputs and translation metadata are returned
        assert data["input"] == spanish_text
        assert data["detected_language"] == "es"
        assert data["translated"] is True
        assert data["translated_text"] == "Claim your free reward now!"
        
        # Since the translation has "free reward", it should be predicted as spam/smishing
        assert data["prediction"] in ("spam", "smishing")
        
        # Verify calls
        mock_detect.assert_called_once_with(spanish_text)
        mock_translate.assert_called_once_with(spanish_text)

    @patch("langdetect.detect", return_value="en")
    @patch("deep_translator.GoogleTranslator.translate")
    def test_api_predict_english_no_translation(self, mock_translate, mock_detect, api_client):
        english_text = "Hello, can we meet tomorrow for lunch?"
        
        response = api_client.post("/predict", json={"text": english_text})
        assert response.status_code == 200
        data = response.get_json()
        
        assert data["input"] == english_text
        assert data["detected_language"] == "en"
        assert data["translated"] is False
        assert "translated_text" not in data
        
        # No translation call should have been made
        mock_translate.assert_not_called()

    @patch("langdetect.detect", return_value="fr")
    @patch("deep_translator.GoogleTranslator.translate", return_value="Urgent: Check your bank account status.")
    def test_app_predict_french_translation(self, mock_translate, mock_detect, app_client):
        french_text = "Urgent: Vérifiez l'état de votre compte bancaire."
        
        # Bypass rate limiter for testing if needed, or hit limit normally
        response = app_client.post("/predict", json={"text": french_text})
        assert response.status_code == 200
        data = response.get_json()
        
        assert data["input"] == french_text
        assert data["detected_language"] == "fr"
        assert data["translated"] is True
        assert data["translated_text"] == "Urgent: Check your bank account status."
        
        mock_detect.assert_called_once_with(french_text)
        mock_translate.assert_called_once_with(french_text)
