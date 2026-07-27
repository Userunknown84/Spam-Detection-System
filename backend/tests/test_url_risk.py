"""Tests for issue #822: a top-level `url_risk` field on /predict responses,
summarizing the existing domain_analysis signal (domain age, DNSBL/threat
intel checks, suspicious-TLD/IP heuristics) that was already computed for
every prediction but never surfaced outside the nested `domain_analysis`
object."""

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


@pytest.fixture
def client():
    api_module.app.config["TESTING"] = True
    with api_module.app.test_client() as c:
        yield c


def test_url_risk_absent_when_no_url_in_text(client):
    res = client.post("/predict", json={"text": "hello there, how are you?", "type": "message"})
    assert res.status_code == 200
    data = res.get_json()
    assert "url_risk" in data
    assert data["url_risk"] == {"is_url_present": False, "score": 0, "level": "SAFE"}


def test_url_risk_reflects_low_risk_domain(client):
    safe_domain = {
        "url": "example.com",
        "age_days": 3650,
        "creation_date": "2015-01-01",
        "blacklisted": False,
        "blacklist_details": {},
        "threat_intel_details": {},
        "risk_score": 5,
        "risk_level": "LOW",
        "recommendation": "SAFE",
    }
    with patch("domain_checker.analyze_domain", return_value=safe_domain):
        res = client.post(
            "/predict",
            json={"text": "Check out https://example.com for details", "type": "message"},
        )
    assert res.status_code == 200
    data = res.get_json()
    assert data["url_risk"]["is_url_present"] is True
    assert data["url_risk"]["score"] == 5
    assert data["url_risk"]["level"] == "SAFE"
    # url_risk is a thin summary; the full breakdown must still be present
    # and unchanged, for backward compatibility.
    assert data["domain_analysis"]["max_risk_score"] == 5


def test_url_risk_flags_high_risk_domain(client):
    malicious_domain = {
        "url": "bit.ly",
        "age_days": 2,
        "creation_date": "2026-07-01",
        "blacklisted": True,
        "blacklist_details": {"spamhaus_zen": True},
        "threat_intel_details": {"urlhaus": True},
        "risk_score": 90,
        "risk_level": "HIGH",
        "recommendation": "BLOCK",
    }
    with patch("domain_checker.analyze_domain", return_value=malicious_domain):
        res = client.post(
            "/predict",
            json={"text": "Urgent! Verify your account at http://bit.ly/xyz now", "type": "message"},
        )
    assert res.status_code == 200
    data = res.get_json()
    assert data["url_risk"]["is_url_present"] is True
    assert data["url_risk"]["score"] == 90
    assert data["url_risk"]["level"] == "BLOCK"


def test_make_prediction_response_derives_url_risk_from_domain_analysis():
    domain_analysis = {
        "domains_found": ["evil.tk"],
        "max_risk_score": 75,
        "overall_risk": "BLOCK",
        "details": [{"url": "evil.tk", "risk_score": 75}],
    }
    response = api_module.make_prediction_response(
        input_text="text",
        result="spam",
        confidence_score=90.0,
        decision_score=None,
        confidence_level="high",
        domain_analysis=domain_analysis,
    )
    assert response["url_risk"] == {"is_url_present": True, "score": 75, "level": "BLOCK"}
    # domain_analysis itself must remain untouched (backward compatible).
    assert response["domain_analysis"] is domain_analysis


def test_make_prediction_response_omits_url_risk_without_domain_analysis():
    response = api_module.make_prediction_response(
        input_text="text",
        result="ham",
        confidence_score=90.0,
        decision_score=None,
        confidence_level="high",
    )
    assert "url_risk" not in response
    assert "domain_analysis" not in response
