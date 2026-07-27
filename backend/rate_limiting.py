"""
Reusable rate-limiting infrastructure for the Flask ML API.

Computationally expensive endpoints (ML inference, OCR, WHOIS lookups, external
threat-intelligence requests) need dedicated throttling so a single caller can't
exhaust CPU or burn through rate-limited third-party APIs (issue #939). This
module wraps Flask-Limiter — already a project dependency — with three things
the raw extension doesn't give us out of the box:

* **Named policies** whose limit/window are configurable per deployment through
  environment variables, so limits can be tuned without code changes.
* **Distributed storage**: Redis is used when ``REDIS_URL`` /
  ``RATE_LIMIT_STORAGE_URI`` is set and reachable, otherwise it degrades to an
  in-memory store so local dev works with no extra services running.
* **A ``rate_limit`` decorator** that endpoints use to opt into a named policy,
  plus a JSON ``429`` handler.

Environment-variable naming mirrors the Node/Express backend
(``RATE_LIMIT_WINDOW_MS`` / ``RATE_LIMIT_MAX`` and the ``<FEATURE>_RATE_LIMIT_*``
pattern) so the two services stay configurable the same way. Per-policy limits
may also be expressed directly in Flask-Limiter's native ``"<n> per <window>"``
string form (e.g. ``PREDICT_RATE_LIMIT="50 per minute"``).
"""

from   dataclasses              import dataclass
from   enum                     import Enum
import logging
import os

from   errors                   import ErrorCode, error_detail
from   flask                    import g, jsonify, request
from   flask_limiter            import Limiter
from   flask_limiter.errors     import RateLimitExceeded
from   flask_limiter.util       import get_remote_address

__all__ = [
    "RateLimitPolicy",
    "limiter",
    "rate_limit",
    "configure_rate_limiting",
    "resolve_policy_limit",
    "rate_limit_exceeded_handler",
]

logger = logging.getLogger(__name__)

# In-memory store used for local dev and whenever Redis is unconfigured or
# unreachable. It is per-process, so it does not enforce limits across multiple
# workers — acceptable for dev, which is exactly why Redis is preferred in prod.
_MEMORY_STORAGE_URI = "memory://"

# Fixed-window keeps the "N requests then 429" behaviour deterministic, matching
# how the Node express-rate-limit limiters and their tests count requests.
_STRATEGY = "fixed-window"


class RateLimitPolicy(str, Enum):
    """Named throttling policies expensive endpoints can opt into.

    >>> RateLimitPolicy("ocr") is RateLimitPolicy.OCR
    True
    """

    PREDICT = "predict"
    OCR = "ocr"
    WHOIS = "whois"
    THREAT_INTEL = "threat_intel"
    BULK = "bulk"
    EMAIL_FETCH = "email_fetch"
    DEFAULT = "default"


@dataclass(frozen=True, slots=True)
class _PolicySpec:
    """How one policy reads its limit from the environment.

    ``native_env`` holds a Flask-Limiter string (``"50 per minute"``) and wins
    when set. Otherwise the Node-style ``max_env`` / ``window_ms_env`` pair is
    combined into an equivalent limit. ``default_limit`` applies when neither is
    configured.
    """

    native_env: str
    max_env: str
    window_ms_env: str
    default_limit: str


_POLICY_SPECS = {
    RateLimitPolicy.PREDICT: _PolicySpec(
        "PREDICT_RATE_LIMIT",
        "PREDICT_RATE_LIMIT_MAX",
        "PREDICT_RATE_LIMIT_WINDOW_MS",
        "50 per minute",
    ),
    RateLimitPolicy.OCR: _PolicySpec(
        "OCR_RATE_LIMIT",
        "OCR_RATE_LIMIT_MAX",
        "OCR_RATE_LIMIT_WINDOW_MS",
        "10 per minute",
    ),
    RateLimitPolicy.WHOIS: _PolicySpec(
        "WHOIS_RATE_LIMIT",
        "WHOIS_RATE_LIMIT_MAX",
        "WHOIS_RATE_LIMIT_WINDOW_MS",
        "20 per minute",
    ),
    RateLimitPolicy.THREAT_INTEL: _PolicySpec(
        "THREAT_INTEL_RATE_LIMIT",
        "THREAT_INTEL_RATE_LIMIT_MAX",
        "THREAT_INTEL_RATE_LIMIT_WINDOW_MS",
        "20 per minute",
    ),
    # Batch inference over an uploaded file is the heaviest CPU path, so it gets
    # a tighter cap than single /predict calls. BULK_PREDICT_* mirrors the knob
    # the Node backend already exposes for the same route.
    RateLimitPolicy.BULK: _PolicySpec(
        "BULK_PREDICT_RATE_LIMIT",
        "BULK_PREDICT_RATE_LIMIT_MAX",
        "BULK_PREDICT_RATE_LIMIT_WINDOW_MS",
        "10 per minute",
    ),
    # Fetching a user's Gmail/Outlook inbox hits rate-limited third-party APIs,
    # so throttle it independently of local ML work to protect those quotas.
    RateLimitPolicy.EMAIL_FETCH: _PolicySpec(
        "EMAIL_FETCH_RATE_LIMIT",
        "EMAIL_FETCH_RATE_LIMIT_MAX",
        "EMAIL_FETCH_RATE_LIMIT_WINDOW_MS",
        "15 per minute",
    ),
    # DEFAULT reuses the shared RATE_LIMIT_MAX / RATE_LIMIT_WINDOW_MS pair the
    # Node backend already reads, so both services honour the same global knobs.
    RateLimitPolicy.DEFAULT: _PolicySpec(
        "RATE_LIMIT_DEFAULT", "RATE_LIMIT_MAX", "RATE_LIMIT_WINDOW_MS", "50 per minute"
    ),
}


# Shared singleton. Endpoints in api.py / bulk_predict.py apply limits against
# this instance at import time; storage is bound later in configure_rate_limiting
# once the app config/env is known. swallow_errors keeps a Redis outage from
# turning every request into a 500 — a degraded limiter must not take the API down.
limiter = Limiter(
    key_func=get_remote_address,
    strategy=_STRATEGY,
    swallow_errors=True,
    headers_enabled=True,
)


def resolve_policy_limit(policy):
    """Return the Flask-Limiter limit string configured for ``policy``.

    Resolved live (per call) so environment changes take effect without a
    reimport, which also lets the decorator re-read overrides per request.
    """
    policy = RateLimitPolicy(policy)
    spec = _POLICY_SPECS[policy]

    native = os.getenv(spec.native_env)
    if native and native.strip():
        return native.strip()

    max_requests = os.getenv(spec.max_env)
    window_ms = os.getenv(spec.window_ms_env)
    if max_requests and window_ms:
        return _limit_from_window_max(window_ms, max_requests)

    return spec.default_limit


def rate_limit(policy, **limit_kwargs):
    """Decorator that throttles an endpoint under a named :class:`RateLimitPolicy`.

    Usage::

        @app.route("/predict", methods=["POST"])
        @rate_limit(RateLimitPolicy.PREDICT)
        def predict():
            ...

    The limit is supplied as a callable so it is re-evaluated per request,
    honouring environment overrides picked up after import.
    """
    policy = RateLimitPolicy(policy)
    return limiter.limit(lambda: resolve_policy_limit(policy), **limit_kwargs)


def rate_limit_exceeded_handler(exc):
    """Render a throttled request as JSON ``429`` instead of Flask-Limiter's HTML.

    Flask-Limiter still attaches the ``Retry-After`` / ``RateLimit-*`` headers,
    so clients keep their machine-readable backoff signal.
    """
    limit = getattr(exc, "description", None) or "rate limit"
    # Operational visibility: one WARNING per rejected request so abuse of an
    # expensive endpoint is greppable without enabling Flask-Limiter debug logs.
    logger.warning(
        "Rate limit exceeded: client=%s endpoint=%s limit=%s",
        get_remote_address(),
        request.endpoint,
        limit,
    )
    message = f"Rate limit exceeded ({limit}). Please retry later."
    # Additive envelope (#986): keep the legacy success/error/message fields the
    # existing 429 callers read, and add the structured error_detail block.
    response = jsonify(
        {
            "success": False,
            "error": "Too Many Requests",
            "message": message,
            "error_detail": error_detail(
                ErrorCode.RATE_LIMITED,
                message,
                request_id=getattr(g, "request_id", "unknown"),
            ),
        }
    )
    return response, 429


def configure_rate_limiting(app):
    """Bind the shared limiter to ``app`` and register the JSON 429 handler.

    Call once during app setup. Storage is resolved here (not at import) so the
    Redis/in-memory decision reflects the running environment.
    """
    app.config.setdefault("RATELIMIT_STORAGE_URI", _resolve_storage_uri())
    app.config.setdefault("RATELIMIT_HEADERS_ENABLED", True)
    app.config.setdefault(
        "RATELIMIT_DEFAULT", resolve_policy_limit(RateLimitPolicy.DEFAULT)
    )

    limiter.init_app(app)
    app.register_error_handler(RateLimitExceeded, rate_limit_exceeded_handler)
    return limiter


def _limit_from_window_max(window_ms, max_requests):
    """Turn a Node-style ``(windowMs, max)`` pair into a Flask-Limiter string."""
    seconds = max(1, round(int(window_ms) / 1000))
    return f"{int(max_requests)} per {seconds} second"


def _resolve_storage_uri():
    """Pick a storage backend, preferring a reachable Redis over in-memory.

    Falls back to ``memory://`` when Redis is unconfigured or fails a
    connectivity check, so the API starts cleanly in local dev.
    """
    uri = os.getenv("RATE_LIMIT_STORAGE_URI") or os.getenv("REDIS_URL")
    if not uri:
        return _MEMORY_STORAGE_URI

    try:
        from limits.storage import storage_from_string

        storage = storage_from_string(uri)
        if storage.check():
            return uri
        logger.warning(
            "Rate-limit storage %r failed its health check; using in-memory fallback.",
            uri,
        )
    except (
        Exception
    ) as exc:  # noqa: BLE001 - any storage/driver error must degrade gracefully
        logger.warning(
            "Rate-limit storage %r unavailable (%s); using in-memory fallback.",
            uri,
            exc,
        )

    return _MEMORY_STORAGE_URI
