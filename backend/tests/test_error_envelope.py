"""Envelope contract for the core Flask ML API error paths (issue #986, PR 1/2).

Every migrated 4xx/5xx must carry the legacy top-level ``error`` string (so
existing clients keep working) *and* the structured ``error_detail`` block with
a stable ``code``, the same ``message``, and the ``request_id`` taken from
``g.request_id``.
"""

import os
from   pathlib                  import Path
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

REQUEST_ID = "test-req-envelope-1"
REQUEST_ID_HEADER = {"X-Request-ID": REQUEST_ID}


@pytest.fixture
def client():
    api_module.app.config["TESTING"] = True
    with api_module.app.test_client() as c:
        yield c


def assert_envelope(body, expected_code, *, expect_request_id=REQUEST_ID):
    """Assert the additive envelope shape and a stable code."""
    assert isinstance(body.get("error"), str) and body["error"]
    detail = body["error_detail"]
    assert detail["code"] == expected_code
    # Legacy field and structured message must agree.
    assert detail["message"] == body["error"]
    assert detail["request_id"] == expect_request_id


def test_predict_missing_text(client):
    res = client.post("/predict", json={"type": "message"}, headers=REQUEST_ID_HEADER)
    assert res.status_code == 400
    body = res.get_json()
    assert body["error"] == "No text provided"
    assert_envelope(body, ErrorCode.NO_TEXT_PROVIDED)


def test_predict_oversized_text(client):
    oversized = "a" * (api_module.MAX_MESSAGE_LENGTH + 1)
    res = client.post("/predict", json={"text": oversized}, headers=REQUEST_ID_HEADER)
    assert res.status_code == 400
    assert_envelope(res.get_json(), ErrorCode.TEXT_TOO_LONG)


def test_predict_non_string_text(client):
    res = client.post("/predict", json={"text": 123}, headers=REQUEST_ID_HEADER)
    assert res.status_code == 400
    assert_envelope(res.get_json(), ErrorCode.INVALID_TEXT_TYPE)


def test_predict_malformed_json(client):
    res = client.post(
        "/predict",
        data="not json",
        content_type="application/json",
        headers=REQUEST_ID_HEADER,
    )
    assert res.status_code == 400
    body = res.get_json()
    assert_envelope(body, ErrorCode.INVALID_JSON_BODY)
    assert "valid JSON object" in body["error"]


def test_feedback_invalid(client):
    res = client.post(
        "/feedback",
        json={"text": "", "predicted_label": "ham", "correct_label": "nope"},
        headers=REQUEST_ID_HEADER,
    )
    assert res.status_code == 400
    body = res.get_json()
    assert body["error"] == "Invalid feedback data"
    assert_envelope(body, ErrorCode.INVALID_FEEDBACK)


def test_unknown_route_is_not_found_envelope(client):
    res = client.get("/no-such-route", headers=REQUEST_ID_HEADER)
    assert res.status_code == 404
    assert_envelope(res.get_json(), ErrorCode.NOT_FOUND)


def test_importance_failure_envelope(client, monkeypatch):
    def boom():
        raise RuntimeError("importance blew up")

    monkeypatch.setattr(api_module.xai_service, "get_global_importance", boom)
    res = client.get("/importance", headers=REQUEST_ID_HEADER)
    assert res.status_code == 500
    assert_envelope(res.get_json(), ErrorCode.IMPORTANCE_FAILED)


def test_wordcloud_failure_preserves_success_flag(client, monkeypatch):
    def boom():
        raise RuntimeError("db down")

    monkeypatch.setattr(api_module, "get_wordcloud_data", boom)
    res = client.get("/api/wordcloud", headers=REQUEST_ID_HEADER)
    assert res.status_code == 500
    body = res.get_json()
    # Legacy shape for this endpoint carries success:false; keep it.
    assert body["success"] is False
    assert_envelope(body, ErrorCode.WORDCLOUD_FAILED)


class TestZeroTrustForbidden:
    @pytest.fixture
    def enforced_client(self):
        api_module.app.config["TESTING"] = True
        api_module.app.config["ENFORCE_INTERNAL_SECRET"] = True
        with api_module.app.test_client() as c:
            yield c
        api_module.app.config["ENFORCE_INTERNAL_SECRET"] = False

    def test_missing_secret_returns_forbidden_envelope(self, enforced_client):
        res = enforced_client.post(
            "/predict", json={"text": "hi"}, headers=REQUEST_ID_HEADER
        )
        assert res.status_code == 403
        body = res.get_json()
        assert body["success"] is False
        assert "Forbidden" in body["error"]
        # The zero-trust gate short-circuits before capture_request_id runs, so
        # request_id falls back to "unknown" rather than the X-Request-ID header.
        assert_envelope(body, ErrorCode.FORBIDDEN, expect_request_id="unknown")
