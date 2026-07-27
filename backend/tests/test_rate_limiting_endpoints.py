"""
Integration tests for endpoint-specific rate limiting (issue #939, PR 2).

PR 1 added the reusable infrastructure; this suite covers the layer built on top
of it: the per-endpoint policies wired onto the expensive routes, their JSON 429
behaviour, and the violation logging. The real ``api`` module pulls in the whole
model/connector stack, so -- like ``test_rate_limiting.py`` -- these exercise the
policies on a throwaway app whose views are named after the real endpoints,
keeping the test hermetic while still asserting the decorator wiring.
"""

import logging
import os
from pathlib import Path
import sys

from flask import Flask, jsonify
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from rate_limiting import (RateLimitPolicy, configure_rate_limiting, limiter,
                           rate_limit, resolve_policy_limit)

_MANAGED_ENV = [
    "BULK_PREDICT_RATE_LIMIT",
    "BULK_PREDICT_RATE_LIMIT_MAX",
    "BULK_PREDICT_RATE_LIMIT_WINDOW_MS",
    "EMAIL_FETCH_RATE_LIMIT",
    "THREAT_INTEL_RATE_LIMIT",
    "REDIS_URL",
    "RATE_LIMIT_STORAGE_URI",
]


@pytest.fixture(autouse=True)
def _clean_env():
    saved = {k: os.environ.pop(k, None) for k in _MANAGED_ENV}
    yield
    for key, value in saved.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value


_app_counter = 0


def _make_app(policy, endpoint_name):
    """A one-route app whose view is named like the real protected endpoint.

    The limiter keys registered limits by the view's ``__qualname__``; a unique
    name per app stops one test's limit from stacking onto another's.
    """
    global _app_counter
    _app_counter += 1
    unique = f"{endpoint_name}_{_app_counter}"

    app = Flask(__name__)
    app.config["TESTING"] = True
    configure_rate_limiting(app)
    limiter.reset()

    def view():
        return jsonify({"ok": True})

    view.__name__ = unique
    view.__qualname__ = unique
    app.add_url_rule(f"/{endpoint_name}", unique, rate_limit(policy)(view))
    return app


def test_new_policies_have_expected_defaults():
    assert resolve_policy_limit(RateLimitPolicy.BULK) == "10 per minute"
    assert resolve_policy_limit(RateLimitPolicy.EMAIL_FETCH) == "15 per minute"


def test_bulk_policy_honours_node_style_env_pair():
    os.environ["BULK_PREDICT_RATE_LIMIT_MAX"] = "4"
    os.environ["BULK_PREDICT_RATE_LIMIT_WINDOW_MS"] = "60000"
    assert resolve_policy_limit(RateLimitPolicy.BULK) == "4 per 60 second"


def test_bulk_predict_endpoint_throttled_after_limit():
    os.environ["BULK_PREDICT_RATE_LIMIT"] = "2 per minute"
    client = _make_app(RateLimitPolicy.BULK, "bulk-predict").test_client()

    statuses = [client.get("/bulk-predict").status_code for _ in range(4)]
    assert statuses.count(200) == 2
    assert statuses.count(429) == 2


def test_email_fetch_endpoint_returns_json_429_with_retry_after():
    os.environ["EMAIL_FETCH_RATE_LIMIT"] = "1 per minute"
    client = _make_app(RateLimitPolicy.EMAIL_FETCH, "gmail-emails").test_client()

    assert client.get("/gmail-emails").status_code == 200
    blocked = client.get("/gmail-emails")

    assert blocked.status_code == 429
    assert blocked.is_json
    assert blocked.get_json()["error"] == "Too Many Requests"
    assert "Retry-After" in blocked.headers


def test_scan_emails_endpoint_throttled_and_logs_violation(caplog):
    os.environ["THREAT_INTEL_RATE_LIMIT"] = "1 per minute"
    client = _make_app(RateLimitPolicy.THREAT_INTEL, "scan-emails").test_client()

    assert client.get("/scan-emails").status_code == 200
    with caplog.at_level(logging.WARNING, logger="rate_limiting"):
        assert client.get("/scan-emails").status_code == 429

    assert any("Rate limit exceeded" in r.message for r in caplog.records)
