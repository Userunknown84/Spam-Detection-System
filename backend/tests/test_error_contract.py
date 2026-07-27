"""Error-envelope contract for the email / OAuth / IMAP endpoints (#986, PR 2/2).

These handlers previously returned ``{"error": str(e)}`` with no code. This
module drives each error path and asserts the standard envelope shape, and adds
a source-level guard that no handler in ``api.py`` still returns a bare
``str(e)`` without a stable code.
"""

import os
from   pathlib                  import Path
import re
import sys

import pytest

BASE_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = BASE_DIR / "backend"

os.environ.setdefault("MODEL_PATH", str(BASE_DIR / "linear_svm_model.pkl"))
os.environ.setdefault("VECTORIZER_PATH", str(BACKEND_DIR / "tfidf_vectorizer.pkl"))
os.environ.setdefault("LABEL_ENCODER_PATH", str(BASE_DIR / "label_encoder.pkl"))
os.environ.setdefault("URL_MODEL_PATH", str(BACKEND_DIR / "url_detector.pkl"))
os.environ.setdefault("URL_VECTORIZER_PATH", str(BACKEND_DIR / "url_vectorizer.pkl"))

sys.path.insert(0, str(BACKEND_DIR))

import api as api_module # noqa: E402
from   errors                   import ErrorCode # noqa: E402

REQUEST_ID = "test-req-contract-1"
VALID_CODES = {c.value for c in ErrorCode}


@pytest.fixture
def client():
    api_module.app.config["TESTING"] = True
    with api_module.app.test_client() as c:
        yield c


def _secret_headers(username="contract_user"):
    return {
        "X-Internal-Secret": api_module.INTERNAL_SECRET,
        "X-User-Username": username,
        "X-Request-ID": REQUEST_ID,
    }


def assert_error_envelope(res, expected_status, expected_code):
    assert res.status_code == expected_status
    body = res.get_json()
    # Legacy field preserved and non-empty.
    assert isinstance(body.get("error"), str) and body["error"]
    detail = body["error_detail"]
    assert detail["code"] == expected_code
    assert detail["code"] in VALID_CODES
    assert detail["message"] == body["error"]
    assert detail["request_id"] == REQUEST_ID


def test_scan_emails_missing_username(client):
    # No internal secret => _require_username returns None.
    res = client.post(
        "/scan-emails", json={"provider": "gmail"}, headers={"X-Request-ID": REQUEST_ID}
    )
    assert_error_envelope(res, 401, ErrorCode.MISSING_USERNAME)


def test_scan_emails_invalid_provider(client):
    res = client.post(
        "/scan-emails", json={"provider": "carrierpigeon"}, headers=_secret_headers()
    )
    assert_error_envelope(res, 400, ErrorCode.INVALID_PROVIDER)


def test_scan_emails_provider_not_connected(client, monkeypatch):
    monkeypatch.setattr(
        api_module.oauth_store, "get_oauth_tokens", lambda *a, **k: None
    )
    res = client.post(
        "/scan-emails", json={"provider": "gmail"}, headers=_secret_headers()
    )
    assert_error_envelope(res, 401, ErrorCode.PROVIDER_NOT_CONNECTED)


def test_gmail_emails_provider_not_connected(client, monkeypatch):
    monkeypatch.setattr(
        api_module.oauth_store, "get_oauth_tokens", lambda *a, **k: None
    )
    res = client.get("/gmail/emails", headers=_secret_headers())
    assert_error_envelope(res, 401, ErrorCode.PROVIDER_NOT_CONNECTED)


def test_gmail_callback_missing_code(client):
    res = client.get("/gmail/callback", headers=_secret_headers())
    assert_error_envelope(res, 400, ErrorCode.MISSING_AUTH_CODE)


def test_gmail_emails_upstream_failure(client, monkeypatch):
    monkeypatch.setattr(
        api_module.oauth_store,
        "get_oauth_tokens",
        lambda *a, **k: {"access_token": "x", "refresh_token": None},
    )

    def boom(*a, **k):
        raise RuntimeError("gmail api down")

    monkeypatch.setattr(api_module, "fetch_gmail_emails", boom)
    res = client.get("/gmail/emails", headers=_secret_headers())
    assert_error_envelope(res, 500, ErrorCode.UPSTREAM_FETCH_FAILED)


def test_analyze_email_header_missing_headers(client):
    res = client.post("/analyze-email-header", json={}, headers=_secret_headers())
    assert_error_envelope(res, 400, ErrorCode.NO_HEADERS_PROVIDED)


def test_imap_connect_missing_fields(client):
    res = client.post(
        "/imap/connect", json={"consent": True}, headers=_secret_headers()
    )
    assert_error_envelope(res, 400, ErrorCode.INVALID_IMAP_CONFIG)


def test_imap_connect_invalid_interval(client):
    res = client.post(
        "/imap/connect",
        json={
            "host": "imap.example.com",
            "imap_username": "me@example.com",
            "password": "secret",
            "scan_interval_minutes": 999,
        },
        headers=_secret_headers(),
    )
    assert_error_envelope(res, 400, ErrorCode.INVALID_SCAN_INTERVAL)


def test_no_handler_returns_bare_str_e_without_code():
    """Static guard: api.py must not ship a ``{"error": str(e)}`` response.

    Every error must now flow through the envelope (error_response / ApiError)
    which forces a stable code, so this leak pattern must not reappear.
    """
    source = (BACKEND_DIR / "api.py").read_text(encoding="utf-8")
    leaks = re.findall(r'jsonify\(\s*\{[^}]*"error"\s*:\s*str\(e\)', source)
    assert leaks == [], f"bare str(e) error responses without a code: {leaks}"
