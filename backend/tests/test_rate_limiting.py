"""
Tests for the reusable rate-limiting infrastructure (issue #939).

Mirrors the Node ``rateLimiter.test.js`` approach: policies are exercised on a
throwaway Flask app so no models, DB, or the internal-secret gate are involved.
Covers policy resolution from env, the Redis/in-memory storage fallback, and
end-to-end limit enforcement with JSON 429 responses.
"""

import os
from   pathlib                  import Path
import sys

from   flask                    import Flask, jsonify
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from   rate_limiting            import (RateLimitPolicy,
                                        configure_rate_limiting, limiter,
                                        rate_limit, resolve_policy_limit)

# Env vars each test may set; cleared before/after so cases don't leak into
# each other or read a developer's real configuration.
_MANAGED_ENV = [
    "PREDICT_RATE_LIMIT",
    "PREDICT_RATE_LIMIT_MAX",
    "PREDICT_RATE_LIMIT_WINDOW_MS",
    "OCR_RATE_LIMIT",
    "OCR_RATE_LIMIT_MAX",
    "OCR_RATE_LIMIT_WINDOW_MS",
    "RATE_LIMIT_DEFAULT",
    "RATE_LIMIT_MAX",
    "RATE_LIMIT_WINDOW_MS",
    "REDIS_URL",
    "RATE_LIMIT_STORAGE_URI",
]


def _reset_limiter():
    # No-op until a limiter has been bound to an app (storage isn't set up yet).
    try:
        limiter.reset()
    except Exception:
        pass


@pytest.fixture(autouse=True)
def _clean_env():
    saved = {k: os.environ.pop(k, None) for k in _MANAGED_ENV}
    _reset_limiter()
    yield
    for key, value in saved.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value
    _reset_limiter()


_app_counter = 0


def _make_app(policy, route="/expensive"):
    """Build a minimal app with one route throttled under ``policy``.

    The limiter is a process-wide singleton that registers decorated limits by
    the view's ``__qualname__``. Each app therefore gets a uniquely named view,
    otherwise this test's limit would stack on top of earlier tests' limits for
    an identically named view and cause spurious double counting.
    """
    global _app_counter
    _app_counter += 1
    endpoint = f"endpoint_{_app_counter}"

    app = Flask(__name__)
    app.config["TESTING"] = True
    configure_rate_limiting(app)
    limiter.reset()

    def view():
        return jsonify({"ok": True})

    view.__name__ = endpoint
    view.__qualname__ = endpoint

    app.add_url_rule(route, endpoint, rate_limit(policy)(view))
    return app


# ── Policy resolution ────────────────────────────────────────────────────────


def test_default_limits_when_no_env():
    assert resolve_policy_limit(RateLimitPolicy.PREDICT) == "50 per minute"
    assert resolve_policy_limit(RateLimitPolicy.OCR) == "10 per minute"
    assert resolve_policy_limit(RateLimitPolicy.WHOIS) == "20 per minute"


def test_native_string_env_overrides_default():
    os.environ["OCR_RATE_LIMIT"] = "3 per minute"
    assert resolve_policy_limit(RateLimitPolicy.OCR) == "3 per minute"


def test_node_style_window_max_pair_is_converted():
    os.environ["OCR_RATE_LIMIT_MAX"] = "7"
    os.environ["OCR_RATE_LIMIT_WINDOW_MS"] = "30000"
    assert resolve_policy_limit(RateLimitPolicy.OCR) == "7 per 30 second"


def test_native_string_wins_over_window_max_pair():
    os.environ["OCR_RATE_LIMIT"] = "3 per minute"
    os.environ["OCR_RATE_LIMIT_MAX"] = "99"
    os.environ["OCR_RATE_LIMIT_WINDOW_MS"] = "1000"
    assert resolve_policy_limit(RateLimitPolicy.OCR) == "3 per minute"


def test_default_policy_reads_shared_node_knobs():
    os.environ["RATE_LIMIT_MAX"] = "100"
    os.environ["RATE_LIMIT_WINDOW_MS"] = "900000"
    assert resolve_policy_limit(RateLimitPolicy.DEFAULT) == "100 per 900 second"


# ── Storage selection ────────────────────────────────────────────────────────


def test_storage_defaults_to_memory_without_redis():
    from rate_limiting import _resolve_storage_uri

    assert _resolve_storage_uri() == "memory://"


def test_storage_falls_back_to_memory_when_redis_unreachable():
    from rate_limiting import _resolve_storage_uri

    # Nothing is listening here, so the connectivity check must fail closed.
    os.environ["REDIS_URL"] = "redis://127.0.0.1:6390/0"
    assert _resolve_storage_uri() == "memory://"


# ── Enforcement ──────────────────────────────────────────────────────────────


def test_allows_up_to_limit_then_returns_429():
    os.environ["OCR_RATE_LIMIT"] = "3 per minute"
    client = _make_app(RateLimitPolicy.OCR).test_client()

    statuses = [client.get("/expensive").status_code for _ in range(5)]
    assert statuses.count(200) == 3
    assert statuses.count(429) == 2


def test_429_response_is_json_with_retry_after_header():
    os.environ["OCR_RATE_LIMIT"] = "1 per minute"
    client = _make_app(RateLimitPolicy.OCR).test_client()

    assert client.get("/expensive").status_code == 200
    blocked = client.get("/expensive")

    assert blocked.status_code == 429
    assert blocked.is_json
    body = blocked.get_json()
    assert body["success"] is False
    assert body["error"] == "Too Many Requests"
    assert "Retry-After" in blocked.headers


def test_limits_are_tracked_per_client_ip():
    os.environ["OCR_RATE_LIMIT"] = "1 per minute"
    client = _make_app(RateLimitPolicy.OCR).test_client()

    first_ip = {"REMOTE_ADDR": "10.0.0.1"}
    second_ip = {"REMOTE_ADDR": "10.0.0.2"}

    assert client.get("/expensive", environ_base=first_ip).status_code == 200
    assert client.get("/expensive", environ_base=first_ip).status_code == 429
    # A different client starts with a fresh allowance.
    assert client.get("/expensive", environ_base=second_ip).status_code == 200
