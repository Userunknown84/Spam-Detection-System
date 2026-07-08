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

from explanation_engine import ExplanationEngine  # noqa: E402


class TestExplanationEngine:
    @pytest.fixture
    def engine(self):
        return ExplanationEngine()

    def test_detects_urls_and_promotional_keywords(self, engine):
        text = "Claim your reward now at https://example.com/free-offer!"
        explanation = engine.analyze(text)

        assert explanation["score"] > 0
        assert "Suspicious URL detected" in explanation["reasons"]
        assert "Promotional keywords found" in explanation["reasons"]
        assert "https://example.com/free-offer" not in explanation["matched_keywords"]
        assert "free" in explanation["matched_keywords"]
        assert explanation["spam_patterns"]["urls"] is True
        assert explanation["spam_patterns"]["promotional"] is True

    def test_detects_urgency_and_repeated_punctuation(self, engine):
        text = "This is urgent!!! Act now!!!"
        explanation = engine.analyze(text)

        assert "Urgency language detected" in explanation["reasons"]
        assert "Repeated punctuation detected" in explanation["reasons"]
        assert explanation["spam_patterns"]["urgency"] is True
        assert explanation["spam_patterns"]["punctuation"] is True

    def test_scores_capitalization_and_phone_numbers(self, engine):
        text = "CALL NOW 123-456-7890 to verify your account"
        explanation = engine.analyze(text)

        assert explanation["spam_patterns"]["capitalization"] is True
        assert explanation["spam_patterns"]["phone_number"] is True
        assert any(k in explanation["matched_keywords"] for k in ["verify your account"])
        assert explanation["num_indicators"] >= 2

    def test_returns_consistent_summary_fields(self, engine):
        text = "Free bitcoin offer, click here now"
        explanation = engine.analyze(text)

        assert explanation["score"] >= 0
        assert isinstance(explanation["reasons"], list)
        assert isinstance(explanation["matched_keywords"], list)
        assert isinstance(explanation["spam_patterns"], dict)
        assert "summary" in explanation
        assert explanation["summary"].startswith(str(len(explanation["reasons"])))
