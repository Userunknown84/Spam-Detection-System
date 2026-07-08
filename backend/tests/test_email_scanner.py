import os
import sys
import pytest
from pathlib import Path
from unittest.mock import patch

BASE_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = BASE_DIR / "backend"

# Ensure env variables are set for testing ML modules
os.environ.setdefault("MODEL_PATH", str(BACKEND_DIR / "linear_svm_model.pkl"))
os.environ.setdefault("VECTORIZER_PATH", str(BACKEND_DIR / "tfidf_vectorizer.pkl"))
os.environ.setdefault("LABEL_ENCODER_PATH", str(BACKEND_DIR / "label_encoder.pkl"))

sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(BACKEND_DIR / "email_connectors"))

import api as api_module
from email_scanner import scan_emails_with_model

@pytest.fixture(autouse=True)
def mock_default_domain_checker():
    default_return = {
        "url": "example.com",
        "age_days": 365,
        "creation_date": "2025-01-01",
        "blacklisted": False,
        "blacklist_details": {},
        "threat_intel_details": {},
        "risk_score": 5,
        "risk_level": "LOW",
        "recommendation": "SAFE"
    }
    with patch("domain_checker.analyze_domain", return_value=default_return) as mock:
        yield mock

def test_scan_emails_with_model():
    # Push Flask application context so that current_app can resolve model attributes
    with api_module.app.app_context():
        emails = [
            {
                "id": "1",
                "subject": "Urgent: Claim your $1000 lottery cash prize now!",
                "body": "Dear customer, you won a free reward. Click this link to redeem your money immediately.",
                "sender": "lottery@spamdomain.com",
                "date": "2026-06-18",
                "raw_headers": "From: lottery@spamdomain.com\nSubject: Urgent: Claim your prize\nReturn-Path: spoofed@another.com\nSPF: fail"
            },
            {
                "id": "2",
                "subject": "Weekly Team Meeting Agenda",
                "body": "Hi everyone, please find the agenda for our synchronization meeting tomorrow. Best regards.",
                "sender": "lead@company.com",
                "date": "2026-06-18",
                "raw_headers": "From: lead@company.com\nSubject: Weekly Team Meeting Agenda\nReturn-Path: lead@company.com\nSPF: pass\nDKIM: pass"
            }
        ]
        
        results = scan_emails_with_model(emails)
        
        assert results["total_scanned"] == 2
        assert "spam_count" in results
        assert "safe_count" in results
        assert len(results["emails"]) == 2
        
        # Verify structure
        email_1 = results["emails"][0]
        assert email_1["id"] == "1"
        assert "prediction" in email_1
        assert "risk_score" in email_1
        assert email_1["trust_level"] in ("Trusted", "Suspicious", "High Risk")

        email_2 = results["emails"][1]
        assert email_2["id"] == "2"
        assert "prediction" in email_2
        assert email_2["trust_level"] == "Trusted"

def test_scan_emails_with_model_no_headers_fallback():
    with api_module.app.app_context():
        emails = [
            {
                "id": "3",
                "subject": "Hello",
                "body": "Hi there",
                "sender": "newdomain@scammy.com",
                "date": "2026-06-18"
                # raw_headers is missing!
            }
        ]
        
        # Mock recently registered domain (< 30 days old)
        mock_result = {
            "url": "scammy.com",
            "age_days": 15,
            "creation_date": "2026-06-11",
            "blacklisted": False,
            "blacklist_details": {},
            "threat_intel_details": {},
            "risk_score": 70,  # 40 + 30
            "risk_level": "HIGH",
            "recommendation": "BLOCK"
        }
        
        with patch("domain_checker.analyze_domain", return_value=mock_result):
            results = scan_emails_with_model(emails)
            assert results["total_scanned"] == 1
            email = results["emails"][0]
            assert email["id"] == "3"
            assert email["risk_score"] == 70
            assert email["trust_level"] == "High Risk"
