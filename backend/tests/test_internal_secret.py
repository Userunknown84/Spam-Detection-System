import os
import sys
from pathlib import Path
import pytest
from unittest.mock import patch

BASE_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = BASE_DIR / "backend"

os.environ.setdefault("MODEL_PATH", str(BASE_DIR / "linear_svm_model.pkl"))
os.environ.setdefault("VECTORIZER_PATH", str(BACKEND_DIR / "tfidf_vectorizer.pkl"))
os.environ.setdefault("LABEL_ENCODER_PATH", str(BASE_DIR / "label_encoder.pkl"))
os.environ.setdefault("URL_MODEL_PATH", str(BACKEND_DIR / "url_detector.pkl"))
os.environ.setdefault("URL_VECTORIZER_PATH", str(BACKEND_DIR / "url_vectorizer.pkl"))

sys.path.insert(0, str(BACKEND_DIR))

import api as api_module
from flask_jwt_extended import create_access_token
from conftest import TEST_INTERNAL_SECRET

@pytest.fixture
def client():
    api_module.app.config["TESTING"] = True
    api_module.app.config["JWT_SECRET_KEY"] = "super-secret"
    with api_module.app.test_client() as c:
        yield c

def test_gmail_emails_with_valid_secret(client):
    headers = {
        "X-Internal-Secret": TEST_INTERNAL_SECRET,
        "X-User-Username": "test_user"
    }
    api_module.TOKEN_STORE["test_user"] = {
        "gmail": {
            "access_token": "mock_gmail_access_token"
        }
    }
    
    with patch("api.fetch_gmail_emails") as mock_fetch:
        mock_fetch.return_value = []
        res = client.get("/gmail/emails", headers=headers)
        assert res.status_code == 200

def test_gmail_emails_missing_auth(client):
    res = client.get("/gmail/emails")
    assert res.status_code == 401

def test_gmail_emails_invalid_secret(client):
    headers = {
        "X-Internal-Secret": "wrong-secret",
        "X-User-Username": "test_user"
    }
    res = client.get("/gmail/emails", headers=headers)
    assert res.status_code == 401

def test_imap_require_username_with_secret(client):
    headers = {
        "X-Internal-Secret": TEST_INTERNAL_SECRET,
        "X-User-Username": "test_user"
    }
    
    with patch("imap_store.get_connection") as mock_get_conn:
        mock_get_conn.return_value = None
        res = client.get("/imap/status", headers=headers)
        assert res.status_code == 200
        assert res.get_json() == {"connected": False}

def test_imap_require_username_missing_secret(client):
    headers = {
        "X-User-Username": "test_user"
    }
    res = client.get("/imap/status", headers=headers)
    assert res.status_code == 401
    assert res.get_json() == {"error": "Missing X-User-Username header"}
