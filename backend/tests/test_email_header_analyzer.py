import io
import os
import sys
from pathlib import Path
from unittest.mock import patch
import pytest

BASE_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = BASE_DIR / "backend"

# Ensure environment variables are loaded for testing ML endpoints if needed
os.environ.setdefault("MODEL_PATH", str(BASE_DIR / "linear_svm_model.pkl"))
os.environ.setdefault("VECTORIZER_PATH", str(BACKEND_DIR / "tfidf_vectorizer.pkl"))
os.environ.setdefault("LABEL_ENCODER_PATH", str(BASE_DIR / "label_encoder.pkl"))
os.environ.setdefault("URL_MODEL_PATH", str(BACKEND_DIR / "url_detector.pkl"))
os.environ.setdefault("URL_VECTORIZER_PATH", str(BACKEND_DIR / "url_vectorizer.pkl"))

sys.path.insert(0, str(BACKEND_DIR))

import api as api_module  # noqa: E402
from email_header_analyzer import analyze_headers  # noqa: E402

LEGIT_HEADERS = """From: Alice <alice@example.com>
Return-Path: <alice@example.com>
Authentication-Results: mx.google.com; spf=pass (google.com: domain of alice@example.com designates 192.0.2.1 as permitted sender) smtp.mailfrom=alice@example.com; dkim=pass header.i=@example.com; dmarc=pass header.from=example.com
DKIM-Signature: v=1; a=rsa-sha256; d=example.com; s=selector; h=from:to:subject; bh=hash; b=sig
Received: from mail.example.com (mail.example.com [192.0.2.1]) by mx.google.com; Wed, 17 Jun 2026 12:00:00 -0700
Subject: Hello
"""

SPF_FAIL_HEADERS = """From: Alice <alice@example.com>
Return-Path: <alice@example.com>
Authentication-Results: mx.google.com; spf=fail; dkim=pass header.i=@example.com; dmarc=pass header.from=example.com
DKIM-Signature: v=1; a=rsa-sha256; d=example.com; s=selector; h=from:to:subject; bh=hash; b=sig
Received: from mail.example.com (mail.example.com [192.0.2.1]) by mx.google.com; Wed, 17 Jun 2026 12:00:00 -0700
Subject: Hello
"""

DKIM_FAIL_HEADERS = """From: Alice <alice@example.com>
Return-Path: <alice@example.com>
Authentication-Results: mx.google.com; spf=pass; dkim=fail; dmarc=pass header.from=example.com
DKIM-Signature: v=1; a=rsa-sha256; d=example.com; s=selector; h=from:to:subject; bh=hash; b=sig
Received: from mail.example.com (mail.example.com [192.0.2.1]) by mx.google.com; Wed, 17 Jun 2026 12:00:00 -0700
Subject: Hello
"""

DMARC_FAIL_HEADERS = """From: Alice <alice@example.com>
Return-Path: <alice@example.com>
Authentication-Results: mx.google.com; spf=pass; dkim=pass; dmarc=fail
DKIM-Signature: v=1; a=rsa-sha256; d=example.com; s=selector; h=from:to:subject; bh=hash; b=sig
Received: from mail.example.com (mail.example.com [192.0.2.1]) by mx.google.com; Wed, 17 Jun 2026 12:00:00 -0700
Subject: Hello
"""

RETURN_PATH_MISMATCH_HEADERS = """From: Alice <alice@example.com>
Return-Path: <spammer@evil.com>
Authentication-Results: mx.google.com; spf=pass; dkim=pass; dmarc=pass
DKIM-Signature: v=1; a=rsa-sha256; d=example.com; s=selector; h=from:to:subject; bh=hash; b=sig
Received: from mail.example.com (mail.example.com [192.0.2.1]) by mx.google.com; Wed, 17 Jun 2026 12:00:00 -0700
Subject: Hello
"""

DOMAIN_MISMATCH_HEADERS = """From: Alice <alice@microsoft.com>
Return-Path: <alice@microsoft.com>
Authentication-Results: mx.google.com; spf=pass smtp.mailfrom=attacker.com; dkim=pass header.d=attacker.com; dmarc=pass header.from=attacker.com
DKIM-Signature: v=1; a=rsa-sha256; d=attacker.com; s=selector; h=from:to:subject; bh=hash; b=sig
Received: from mail.example.com (mail.example.com [192.0.2.1]) by mx.google.com; Wed, 17 Jun 2026 12:00:00 -0700
Subject: Hello
"""

@pytest.fixture
def client():
    api_module.app.config["TESTING"] = True
    with api_module.app.test_client() as c:
        yield c

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

class TestEmailHeaderAnalyzer:
    def test_valid_trusted_email(self):
        res = analyze_headers(LEGIT_HEADERS)
        assert res["success"] is True
        assert res["trust_level"] == "Trusted"
        assert res["risk_score"] == 0
        assert len(res["findings"]) == 0

    def test_spf_failure(self):
        res = analyze_headers(SPF_FAIL_HEADERS)
        assert res["success"] is True
        assert res["trust_level"] == "Suspicious"
        assert res["risk_score"] == 30
        assert "SPF validation failed" in res["findings"]

    def test_dkim_failure(self):
        res = analyze_headers(DKIM_FAIL_HEADERS)
        assert res["success"] is True
        assert res["trust_level"] == "Suspicious"
        assert res["risk_score"] == 30
        assert "DKIM validation failed" in res["findings"]

    def test_dmarc_failure(self):
        res = analyze_headers(DMARC_FAIL_HEADERS)
        assert res["success"] is True
        assert res["trust_level"] == "Suspicious"
        assert res["risk_score"] == 30
        assert "DMARC validation failed" in res["findings"]

    def test_return_path_mismatch(self):
        res = analyze_headers(RETURN_PATH_MISMATCH_HEADERS)
        assert res["success"] is True
        assert res["risk_score"] == 20
        assert res["trust_level"] == "Trusted"
        assert "Return-Path mismatch detected" in res["findings"]

    def test_domain_mismatch(self):
        res = analyze_headers(DOMAIN_MISMATCH_HEADERS)
        assert res["success"] is True
        assert res["risk_score"] == 20
        assert res["trust_level"] == "Trusted"
        assert "Sender domain mismatch detected" in res["findings"]

    def test_domain_age_under_30_days(self):
        mock_result = {
            "url": "newdomain.com",
            "age_days": 10,
            "creation_date": "2026-06-16",
            "blacklisted": False,
            "blacklist_details": {},
            "threat_intel_details": {},
            "risk_score": 70,
            "risk_level": "HIGH",
            "recommendation": "BLOCK"
        }
        with patch("domain_checker.analyze_domain", return_value=mock_result):
            res = analyze_headers(LEGIT_HEADERS)
            assert res["success"] is True
            assert res["risk_score"] == 30
            assert res["trust_level"] == "Suspicious"
            assert any("recently registered" in f for f in res["findings"])

    def test_domain_blacklisted(self):
        mock_result = {
            "url": "malicious.com",
            "age_days": 365,
            "creation_date": "2025-01-01",
            "blacklisted": True,
            "blacklist_details": {"zen.spamhaus.org": True},
            "threat_intel_details": {"urlhaus": True},
            "risk_score": 100,
            "risk_level": "HIGH",
            "recommendation": "BLOCK"
        }
        with patch("domain_checker.analyze_domain", return_value=mock_result):
            res = analyze_headers(LEGIT_HEADERS)
            assert res["success"] is True
            assert res["risk_score"] == 100
            assert res["trust_level"] == "High Risk"
            assert any("blacklisted" in f for f in res["findings"])

    def test_invalid_header_input(self, client):
        # API post empty payload
        response = client.post("/analyze-email-header", json={})
        assert response.status_code == 400
        assert "error" in response.get_json()

        # API post empty headers string
        response = client.post("/analyze-email-header", json={"headers": ""})
        assert response.status_code == 400

    def test_empty_file_upload(self, client):
        data = {
            "file": (io.BytesIO(b""), "empty.eml")
        }
        response = client.post("/analyze-email-header", data=data, content_type="multipart/form-data")
        assert response.status_code == 400
        assert "No email headers provided" in response.get_json()["error"]

    def test_api_endpoint_json_trusted(self, client):
        response = client.post("/analyze-email-header", json={"headers": LEGIT_HEADERS})
        assert response.status_code == 200
        data = response.get_json()
        assert data["success"] is True
        assert data["trust_level"] == "Trusted"
        assert data["risk_score"] == 0
        assert len(data["findings"]) == 0

    def test_api_endpoint_multipart_eml_trusted(self, client):
        data = {
            "file": (io.BytesIO(LEGIT_HEADERS.encode("utf-8")), "legit.eml")
        }
        response = client.post("/analyze-email-header", data=data, content_type="multipart/form-data")
        assert response.status_code == 200
        data = response.get_json()
        assert data["success"] is True
        assert data["trust_level"] == "Trusted"
        assert data["risk_score"] == 0

    def test_api_endpoint_multipart_eml_non_utf8(self, client):
        headers_non_utf8 = LEGIT_HEADERS + "X-Custom: ñ\n"
        data = {
            "file": (io.BytesIO(headers_non_utf8.encode("latin-1")), "latin1.eml")
        }
        response = client.post("/analyze-email-header", data=data, content_type="multipart/form-data")
        assert response.status_code == 200
        data = response.get_json()
        assert data["success"] is True
        assert data["trust_level"] == "Trusted"
