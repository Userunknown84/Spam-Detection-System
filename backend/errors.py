"""Machine-readable error envelope for the Flask ML API (issue #986).

Error responses used to vary in shape across handlers, which made reliable
client-side branching impossible and leaked raw exception strings. This module
defines a single typed envelope that is added *additively*: the legacy
top-level ``error`` string is kept on every error response so existing clients
that read ``error`` keep working, and a structured ``error_detail`` block
(stable ``code`` + ``message`` + ``request_id``) is added for modern consumers.

Envelope shape::

    {
      "error": "Human readable message",        # legacy, backward compatible
      "error_detail": {
        "code": "NO_TEXT_PROVIDED",              # stable ErrorCode value
        "message": "Human readable message",
        "request_id": "…"                         # correlates with g.request_id
      }
    }

Endpoints either return :func:`error_response` directly or ``raise ApiError``;
a single registered handler renders raised errors through the same builder.

>>> error_detail(ErrorCode.FORBIDDEN, "nope", request_id="r2")
{'code': 'FORBIDDEN', 'message': 'nope', 'request_id': 'r2'}
"""

from   enum                     import StrEnum

from   flask                    import jsonify

__all__ = [
    "ErrorCode",
    "ApiError",
    "error_detail",
    "error_response",
]


class ErrorCode(StrEnum):
    """Stable, machine-readable vocabulary clients branch on.

    The member *value* is the wire code; it must stay stable even when the
    human-readable message changes. Values are spelled explicitly (rather than
    via ``auto()``) because the exact UPPER_SNAKE token is part of the API
    contract consumed by external clients.

    >>> ErrorCode.NO_TEXT_PROVIDED.value
    'NO_TEXT_PROVIDED'
    """

    # ── Input / validation (core endpoints, PR 1/2) ──────────────────────
    INVALID_JSON_BODY = "INVALID_JSON_BODY"
    NO_TEXT_PROVIDED = "NO_TEXT_PROVIDED"
    INVALID_TEXT_TYPE = "INVALID_TEXT_TYPE"
    TEXT_TOO_LONG = "TEXT_TOO_LONG"
    INVALID_FEEDBACK = "INVALID_FEEDBACK"
    BAD_REQUEST = "BAD_REQUEST"

    # ── Auth / access (PR 1/2) ───────────────────────────────────────────
    FORBIDDEN = "FORBIDDEN"
    NOT_FOUND = "NOT_FOUND"
    RATE_LIMITED = "RATE_LIMITED"

    # ── Server / dependency failures on core endpoints (PR 1/2) ──────────
    FEEDBACK_LOCKED = "FEEDBACK_LOCKED"
    FEEDBACK_WRITE_FAILED = "FEEDBACK_WRITE_FAILED"
    FEEDBACK_READ_FAILED = "FEEDBACK_READ_FAILED"
    IMPORTANCE_FAILED = "IMPORTANCE_FAILED"
    INSIGHTS_FAILED = "INSIGHTS_FAILED"
    WORDCLOUD_FAILED = "WORDCLOUD_FAILED"
    WORD_OF_DAY_FAILED = "WORD_OF_DAY_FAILED"
    INTERNAL_ERROR = "INTERNAL_ERROR"

    # ── Email / OAuth / IMAP provider paths (PR 2/2) ─────────────────────
    MISSING_USERNAME = "MISSING_USERNAME"
    MISSING_AUTH_CODE = "MISSING_AUTH_CODE"
    NO_HEADERS_PROVIDED = "NO_HEADERS_PROVIDED"
    HEADER_READ_FAILED = "HEADER_READ_FAILED"
    HEADER_ANALYSIS_FAILED = "HEADER_ANALYSIS_FAILED"
    INVALID_PROVIDER = "INVALID_PROVIDER"
    PROVIDER_NOT_CONNECTED = "PROVIDER_NOT_CONNECTED"
    OAUTH_EXCHANGE_FAILED = "OAUTH_EXCHANGE_FAILED"
    UPSTREAM_FETCH_FAILED = "UPSTREAM_FETCH_FAILED"
    EMAIL_SCAN_FAILED = "EMAIL_SCAN_FAILED"
    INVALID_IMAP_CONFIG = "INVALID_IMAP_CONFIG"
    INVALID_SCAN_INTERVAL = "INVALID_SCAN_INTERVAL"
    CONSENT_REQUIRED = "CONSENT_REQUIRED"
    IMAP_AUTH_FAILED = "IMAP_AUTH_FAILED"
    IMAP_CONNECT_FAILED = "IMAP_CONNECT_FAILED"


class ApiError(Exception):
    """A typed, client-facing error an endpoint can ``raise``.

    Raising composes with normal control flow (e.g. inside a nested
    ``try/except`` that translates an upstream failure), and the registered
    ``ApiError`` handler renders it through :func:`error_response`, so raising
    is equivalent to returning the envelope but does not require threading the
    response tuple back through every call site.

    >>> err = ApiError(ErrorCode.NO_TEXT_PROVIDED, "No text provided")
    >>> err.status
    400
    >>> err.code is ErrorCode.NO_TEXT_PROVIDED
    True
    """

    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code = ErrorCode(code)
        self.message = message
        self.status = status


def error_detail(code, message, request_id=None):
    """Return just the structured ``error_detail`` block.

    Used to merge the block into responses that already carry extra top-level
    fields (e.g. the 429 payload, which keeps ``success`` / ``message``), where
    replacing the whole body would drop those fields.
    """
    return {
        "code": ErrorCode(code).value,
        "message": message,
        "request_id": request_id,
    }


def error_response(code, message, status, request_id=None, extra=None):
    """Build the full error envelope as a Flask ``(response, status)`` tuple.

    ``extra`` merges additional top-level keys into the envelope for handlers
    that must preserve a legacy field beyond ``error`` (e.g. ``success`` on the
    zero-trust 403 and word-cloud paths).

    >>> from flask import Flask
    >>> with Flask(__name__).app_context():
    ...     body, status = error_response(
    ...         ErrorCode.NO_TEXT_PROVIDED, "No text provided", 400, request_id="r1"
    ...     )
    ...     (status, body.get_json()["error_detail"]["code"])
    (400, 'NO_TEXT_PROVIDED')
    """
    envelope = {
        "error": message,
        "error_detail": error_detail(code, message, request_id),
    }
    if extra:
        envelope.update(extra)
    return jsonify(envelope), status
