import csv
from   domain_checker           import analyze_text
from   dotenv                   import load_dotenv
from   email_header_analyzer    import analyze_headers
from   explanation_engine       import ExplanationEngine
from   flask                    import Flask, g, jsonify, request
from   flask_cors               import CORS
from   functools                import wraps
import hmac
import joblib
import json
import metrics
import numpy as np
import os
from   pathlib                  import Path
import re
import sys
from   time                     import perf_counter
from   urllib.parse             import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent / "email_connectors"))

sys.path.insert(0, str(Path(__file__).resolve().parent / "email_connectors"))

from   apscheduler.schedulers.background \
                                import BackgroundScheduler
from   crypto_utils             import decrypt_secret, encrypt_secret
from   email_scanner            import scan_emails_with_model
from   errors                   import ApiError, ErrorCode, error_response
from   filelock                 import FileLock, Timeout
from   gmail_connector          import (fetch_gmail_emails, get_gmail_auth_url,
                                        get_gmail_tokens, refresh_gmail_token)
import imap_connector
import imap_store
import nltk
from   nltk.corpus              import stopwords
from   nltk.tokenize            import word_tokenize
import oauth_store
from   outlook_connector        import (fetch_outlook_emails,
                                        get_outlook_auth_url,
                                        get_outlook_tokens,
                                        refresh_outlook_token)
from   rate_limiting            import (RateLimitPolicy,
                                        configure_rate_limiting, rate_limit)
import requests
from   routes.analytics         import analytics_bp, record_scan
from   utils.spamSeverity       import calculate_spam_severity


# Try to import NLTK for stopwords (optional)
try:
    import nltk
    from nltk.corpus import stopwords
    from nltk.tokenize import word_tokenize

    # Do NOT download NLTK corpora at runtime. In restricted / read-only
    # containers this can crash the app on startup with PermissionError.
    # Ensure required corpora (punkt, stopwords) are installed during Docker
    # build and/or via a writable NLTK_DATA location.

    NLTK_AVAILABLE = True
except ImportError:
    NLTK_AVAILABLE = False


load_dotenv()

# Validate the entire ML API configuration once, up front. load_settings()
# aggregates every problem (missing/short INTERNAL_SECRET, bad port, unusable
# model files, an unsafe FLASK_DEBUG/host combination, ...) into a single
# ConfigError, so a misconfigured deployment fails fast at boot instead of on
# the first request. See settings.py.
settings = load_settings()

app = Flask(__name__)

xai_engine = ExplanationEngine()
CORS(app, resources={r"/*": {"origins": "http://localhost:5173"}})

# ── Rate limiting for expensive endpoints (issue #939) ───────────────────
# Reusable, distributed (Redis with in-memory fallback) throttling. Endpoints
# opt into named policies with the @rate_limit decorator; the shared limiter and
# JSON 429 handler are configured here. See rate_limiting.py.
configure_rate_limiting(app)


# ============================================
# ZERO TRUST - INTERNAL SECRET
# ============================================

# Shared secret the trusted Node/Express backend attaches to every request.
# Presence and minimum length are validated by load_settings(); this alias is
# what the request gates below compare against.
INTERNAL_SECRET = settings.internal_secret

# Paths reachable without the internal secret (liveness/readiness probes and
# the public API documentation surface).
# Paths reachable without the internal secret (liveness/readiness probes, the
# public OpenAPI document, and the Prometheus /metrics endpoint — it exposes only
# aggregate counters, never message content).
PUBLIC_PATHS = {
    "/",
    "/health",
    "/api/roles",
    "/api/rate-limit-status",
    "/openapi.json",
    "/docs",
    "/metrics",
}


# ============================================
# ZERO TRUST - SERVICE-TO-SERVICE AUTH
# ============================================


def validate_internal_request(f):
    """Decorator to validate internal API key for service-to-service communication"""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip in testing mode if not enforced
        if app.config.get("TESTING") and not app.config.get("ENFORCE_INTERNAL_SECRET"):
            return f(*args, **kwargs)

        # Let CORS preflight requests through
        if request.method == "OPTIONS":
            return f(*args, **kwargs)

        # Public paths are exempt
        if request.path in PUBLIC_PATHS:
            return f(*args, **kwargs)

        # Check internal secret
        provided = request.headers.get("X-Internal-Secret", "")
        if not provided or not hmac.compare_digest(provided, INTERNAL_SECRET):
            app.logger.warning(
                f"⚠️  Unauthorized internal request from {request.remote_addr}"
            )
            return error_response(
                ErrorCode.FORBIDDEN,
                "Forbidden: requests must originate from the trusted backend",
                403,
                request_id=getattr(g, "request_id", "unknown"),
                extra={"success": False},
            )

        # Log internal request
        app.logger.info(
            f"🔐 [ZERO-TRUST] Internal request to {request.path} from {request.remote_addr}"
        )
        return f(*args, **kwargs)

    return decorated_function


# Alias used by routes that gate on the internal service-to-service secret.
internal_endpoint_required = validate_internal_request


# Apply to all routes by default (except public paths)
@app.before_request
def require_internal_secret():
    # Stamp the request start here (the first before_request to run) so latency
    # is measured for every request, including ones this hook short-circuits
    # with a 403 before later before_request hooks can run.
    g._metrics_start = perf_counter()
    if app.config.get("TESTING") and not app.config.get("ENFORCE_INTERNAL_SECRET"):
        return None
    if request.method == "OPTIONS":
        return None
    if request.path in PUBLIC_PATHS:
        return None
    provided = request.headers.get("X-Internal-Secret", "")
    if not provided or not hmac.compare_digest(provided, INTERNAL_SECRET):
        return error_response(
            ErrorCode.FORBIDDEN,
            "Forbidden: requests must originate from the trusted backend",
            403,
            request_id=getattr(g, "request_id", "unknown"),
            extra={"success": False},
        )


# ============================================
# ZERO TRUST - IP ALLOWLISTING
# ============================================


def ip_allowlist(f):
    """Decorator to restrict access to specific IPs"""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip in development
        if settings.node_env == "development":
            return f(*args, **kwargs)

        allowed_list = settings.service_ip_allowlist

        client_ip = request.headers.get("X-Forwarded-For", request.remote_addr) or ""
        # Get first IP if multiple
        if "," in client_ip:
            client_ip = client_ip.split(",")[0].strip()

        if client_ip not in allowed_list:
            app.logger.warning(f"⚠️  Blocked request from unauthorized IP: {client_ip}")
            return (
                jsonify(
                    {"success": False, "error": "Access denied from this IP address"}
                ),
                403,
            )

        return f(*args, **kwargs)

    return decorated_function


# ============================================

# ZERO TRUST - REQUEST VALIDATION
# ============================================


def validate_request(f):
    """Validate every request - Assume Breach mindset"""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Validate query parameters
        for key, value in request.args.items():
            if isinstance(value, str):
                # Check for suspicious patterns
                if any(
                    p in value.lower()
                    for p in ["<script", "javascript:", "onerror", "onload"]
                ):
                    app.logger.warning(
                        f"⚠️  Suspicious query param: {key}={value[:50]}"
                    )
                    return (
                        jsonify(
                            {"success": False, "error": "Invalid request parameters"}
                        ),
                        400,
                    )

        # Validate request body
        if request.is_json:
            data = request.get_json(silent=True) or {}
            # Check for suspicious patterns in JSON data
            import json

            data_str = json.dumps(data).lower()
            if any(p in data_str for p in ["<script", "javascript:", "onerror"]):
                app.logger.warning(
                    f"⚠️  Suspicious request body from {request.remote_addr}"
                )
                return jsonify({"success": False, "error": "Invalid request body"}), 400

        return f(*args, **kwargs)

    return decorated_function


# ZERO TRUST - AUDIT LOGGING
# ============================================


def audit_log(action, resource_type):
    """Decorator to log every authenticated action"""

    @wraps(action)
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Log request
            user = request.headers.get("X-User-Username", "anonymous")
            request_id = getattr(g, "request_id", "unknown")
            app.logger.info(
                f"📝 [AUDIT] {action.__name__} - {resource_type} - User: {user} - Request-ID: {request_id}"
            )

            # Execute the function
            response = f(*args, **kwargs)

            # Log response
            status = getattr(response, "status_code", 200)
            app.logger.info(
                f"📝 [AUDIT] {action.__name__} - Status: {status} - User: {user}"
            )

            return response

        return decorated_function

    return decorator


# ============================================
# GLOBAL ERROR HANDLING
# ============================================


def _current_request_id():
    return getattr(g, "request_id", "unknown")


@app.errorhandler(ApiError)
def handle_api_error(e):
    """Render a raised ApiError through the shared error envelope (#986)."""
    return error_response(e.code, e.message, e.status, request_id=_current_request_id())


@app.errorhandler(400)
def handle_bad_request(e):
    message = getattr(e, "description", None) or "Bad request"
    return error_response(
        ErrorCode.BAD_REQUEST, message, 400, request_id=_current_request_id()
    )


@app.errorhandler(403)
def handle_forbidden(e):
    message = getattr(e, "description", None) or "Forbidden"
    # success:false is part of the zero-trust JSON shape existing callers read.
    return error_response(
        ErrorCode.FORBIDDEN,
        message,
        403,
        request_id=_current_request_id(),
        extra={"success": False},
    )


@app.errorhandler(404)
def handle_not_found(e):
    message = getattr(e, "description", None) or "Not found"
    return error_response(
        ErrorCode.NOT_FOUND, message, 404, request_id=_current_request_id()
    )


@app.errorhandler(500)
@app.errorhandler(Exception)
def handle_internal_error(e):
    from werkzeug.exceptions import HTTPException

    if isinstance(e, HTTPException):
        return e
    request_id = _current_request_id()
    app.logger.exception(f"❌ [Request-ID: {request_id}] Unhandled exception")
    # Keep the legacy top-level request_id alongside the new envelope so clients
    # that already read it keep working.
    return error_response(
        ErrorCode.INTERNAL_ERROR,
        "Internal server error",
        500,
        request_id=request_id,
        extra={"request_id": request_id},
    )


# ============================================
# MODEL LOADING
# ============================================

BASE_DIR = Path(__file__).resolve().parent

# Resolved and existence-checked by load_settings(); aliased here so the rest of
# the module keeps its familiar names.
MODEL_PATH = settings.model_path
VECTORIZER_PATH = settings.vectorizer_path
LABEL_ENCODER_PATH = settings.label_encoder_path
URL_MODEL_PATH = settings.url_model_path
URL_VECTORIZER_PATH = settings.url_vectorizer_path

model = joblib.load(MODEL_PATH)
vectorizer = joblib.load(VECTORIZER_PATH)
label_encoder = joblib.load(LABEL_ENCODER_PATH)

from   xai_service              import XAIService

xai_service = XAIService(
    model=model, vectorizer=vectorizer, label_encoder=label_encoder
)


# ============================================
# HOT-RELOADABLE SERVING STATE
# ============================================

# The objects above are what request handlers actually serve. Install them in a
# shared, thread-safe holder so POST /reload-model can atomically hot-swap in a
# freshly retrained model without a restart (issue #973); handlers read from
# serving_state.STATE rather than these module globals so the swap is visible.
import serving_state


def _load_serving_objects():
    """Reload the serving object set from disk (used by /reload-model)."""
    fresh_model = joblib.load(MODEL_PATH)
    fresh_vectorizer = joblib.load(VECTORIZER_PATH)
    fresh_label_encoder = joblib.load(LABEL_ENCODER_PATH)
    fresh_xai_service = XAIService(
        model=fresh_model,
        vectorizer=fresh_vectorizer,
        label_encoder=fresh_label_encoder,
    )
    return {
        "model": fresh_model,
        "vectorizer": fresh_vectorizer,
        "label_encoder": fresh_label_encoder,
        "xai_service": fresh_xai_service,
    }


serving_state.init_state(
    model=model,
    vectorizer=vectorizer,
    label_encoder=label_encoder,
    xai_service=xai_service,
    loader=_load_serving_objects,
)


# SQLite Persistent Storage for spam words
from   datetime                 import datetime, timezone


def init_spam_words_db():
    with imap_store.get_db_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS spam_word_frequencies (
                word TEXT NOT NULL,
                day TEXT NOT NULL,
                count INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (word, day)
            )
            """
        )
        conn.commit()


def increment_spam_word_frequency(word):
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    with imap_store.get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO spam_word_frequencies (word, day, count)
            VALUES (?, ?, 1)
            ON CONFLICT(word, day) DO UPDATE SET count = count + 1
            """,
            (word, day),
        )
        conn.commit()


def get_db_wordcloud_data():
    with imap_store.get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT word, SUM(count) as total_count
            FROM spam_word_frequencies
            GROUP BY word
            ORDER BY total_count DESC
            LIMIT 50
            """
        ).fetchall()
        return [{"word": row["word"], "count": row["total_count"]} for row in rows]


SPAM_WORD_METADATA = {
    "free": {
        "definition": "Offered without cost or payment, frequently used in spam messages to lure users into clicking links.",
        "context": "Get FREE access now! No credit card required.",
        "tips": "Be highly skeptical of 'free' offers; they are often bait for phishing, subscriptions, or malware.",
    },
    "win": {
        "definition": "Be successful or victorious in a contest or raffle, typically fake in spam/phishing messages.",
        "context": "You have won a $1000 Walmart Gift Card! Claim here.",
        "tips": "If you didn't enter a contest, you didn't win anything. Never enter personal details to claim a 'prize'.",
    },
    "urgent": {
        "definition": "Requiring immediate action or attention, used to induce panic and quick, unthinking decisions.",
        "context": "URGENT: Your account has been compromised. Verify your details within 24 hours.",
        "tips": "Phishers use artificial urgency to make you act before you think. Verify independently with the service.",
    },
    "prize": {
        "definition": "An award given to the winner of a competition, often used as bait in promotional spam.",
        "context": "Your special prize is waiting! Click here to claim.",
        "tips": "Legitimate organizations don't send SMS/emails with sketchy links to claim randomly awarded prizes.",
    },
    "cash": {
        "definition": "Money in coins or notes, commonly promised in financial spam and advance-fee fraud schemes.",
        "context": "Earn quick cash from home! Make $500/day.",
        "tips": "Beware of 'get rich quick' or easy work-from-home offers. They are often scams or money-laundering operations.",
    },
    "offer": {
        "definition": "A proposal or bid, frequently restricted in time to force immediate response.",
        "context": "Exclusive limited time offer: Save 90% on this software.",
        "tips": "Always check the domain of the offer. Avoid clicking promotional links from unknown senders.",
    },
    "guaranteed": {
        "definition": "Formally assured, commonly used in deceptive promises of loans, earnings, or cures.",
        "context": "Guaranteed approval for home loans up to $50,000.",
        "tips": "No financial service can guarantee approval without screening. This is a common trap for upfront fees.",
    },
    "click": {
        "definition": "Press a link or button, directing users to external phishing or credential harvesting pages.",
        "context": "Click this link to restore access to your banking portal.",
        "tips": "Never click direct links in unexpected emails/texts requesting login credentials. Go to the site manually.",
    },
}


def get_word_of_the_day_data():
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    word_row = None
    with imap_store.get_db_connection() as conn:
        word_row = conn.execute(
            """
            SELECT word, SUM(count) as total_count
            FROM spam_word_frequencies
            WHERE day = ?
            GROUP BY word
            ORDER BY total_count DESC
            LIMIT 1
            """,
            (day,),
        ).fetchone()

        if not word_row:
            word_row = conn.execute(
                """
                SELECT word, SUM(count) as total_count
                FROM spam_word_frequencies
                GROUP BY word
                ORDER BY total_count DESC
                LIMIT 1
                """
            ).fetchone()

    if word_row:
        word = word_row["word"]
        count = word_row["total_count"]
    else:
        word = "free"
        count = 0

    metadata = SPAM_WORD_METADATA.get(
        word,
        {
            "definition": "A keyword commonly appearing in unsolicited messages, flagged by the system as a potential spam indicator.",
            "context": f"Important notification: Please review this {word}.",
            "tips": f"Treat messages containing '{word}' with caution. Verify the sender's identity and watch out for unsolicited requests.",
        },
    )

    return {
        "word": word,
        "count": count if count > 0 else None,
        "definition": metadata["definition"],
        "context": metadata["context"],
        "tips": metadata["tips"],
    }


app.model = model  # type: ignore[attr-defined]
app.vectorizer = vectorizer  # type: ignore[attr-defined]
app.label_encoder = label_encoder  # type: ignore[attr-defined]

from   bulk_predict             import bulk_predict_bp

app.register_blueprint(bulk_predict_bp)
app.register_blueprint(analytics_bp)

from   routes.reload            import register_reload_endpoint

register_reload_endpoint(app)

url_model = joblib.load(URL_MODEL_PATH)
url_vectorizer = joblib.load(URL_VECTORIZER_PATH)

# All models loaded successfully; surface readiness as a scrapeable gauge (#984).
metrics.set_model_loaded(True)

URL_LABELS = {0: "malicious", 1: "safe"}
# url_detector.pkl predicts numeric classes with no bundled label encoder
URL_LABELS = {0: "safe", 1: "malicious"}


URL_LABELS = {0: "malicious", 1: "safe"}

# url_detector.pkl predicts numeric classes with no bundled label encoder
URL_LABELS = {0: "safe", 1: "malicious"}


# Heuristic checks
SUSPICIOUS_TLDS = {
    "tk",
    "ml",
    "ga",
    "cf",
    "gq",
    "xyz",
    "top",
    "work",
    "click",
    "loan",
    "men",
    "review",
}
IPV4_RE = re.compile(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$")


def heuristic_url_is_malicious(url):
    candidate = url if "://" in url else f"http://{url}"
    host = urlparse(candidate).hostname or ""
    if not host:
        return False
    if "@" in url:
        return True
    if IPV4_RE.match(host):
        return True
    if host.startswith("xn--") or ".xn--" in host:
        return True
    if host.count("-") >= 3:
        return True
    tld = host.rsplit(".", 1)[-1] if "." in host else ""
    return tld in SUSPICIOUS_TLDS


MAX_MESSAGE_LENGTH = settings.max_message_length
OUTPUT_DIR = BASE_DIR / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

FEEDBACK_FILE = OUTPUT_DIR / "feedback_store.csv"
LOG_FILE = OUTPUT_DIR / "api.log"
FEEDBACK_LABELS = set(label_encoder.classes_)


# ============================================
# DISTRIBUTED TRACING
# ============================================


@app.before_request
def capture_request_id():
    g.request_id = request.headers.get("X-Request-ID", "unknown-ml-req")


# Maps the Flask endpoint that emitted a 429 to the rate-limit policy label, so
# rejections are attributed to a policy without re-deriving limiter internals.
# The 429 itself is produced by rate_limiting.rate_limit_exceeded_handler; it is
# observed here as the response leaves the app.
_RATE_LIMIT_POLICY_BY_ENDPOINT = {
    "predict": RateLimitPolicy.PREDICT.value,
    "gmail_emails": RateLimitPolicy.EMAIL_FETCH.value,
    "outlook_emails": RateLimitPolicy.EMAIL_FETCH.value,
    "scan_emails_route": RateLimitPolicy.THREAT_INTEL.value,
    "bulk_predict": RateLimitPolicy.BULK.value,
    "bulk_predict_export": RateLimitPolicy.BULK.value,
}


@app.after_request
def record_request_metrics(response):
    endpoint = request.endpoint or "unknown"
    start = getattr(g, "_metrics_start", None)
    latency = perf_counter() - start if start is not None else 0.0
    metrics.observe_request(
        endpoint=endpoint,
        method=request.method,
        status=response.status_code,
        latency=latency,
    )
    if response.status_code >= 500:
        metrics.record_error(endpoint)
    elif response.status_code == 429:
        policy = _RATE_LIMIT_POLICY_BY_ENDPOINT.get(
            endpoint, RateLimitPolicy.DEFAULT.value
        )
        metrics.record_rate_limit_rejection(policy)
    return response


# ============================================
# PUBLIC ROUTES
# ============================================


@app.route("/")
@validate_request
def home():
    return "ML API Running 🚀"


@app.route("/health")
@validate_request
def health():
    return jsonify({"status": "ok"})


@app.route("/metrics")
def metrics_endpoint():
    """Prometheus exposition endpoint (issue #984).

    Public (see PUBLIC_PATHS): a scraper reaches it without the internal secret
    since it exposes only aggregate counters, never message content.
    """
    payload, content_type = metrics.render()
    return payload, 200, {"Content-Type": content_type}


@app.route("/api/roles", methods=["GET"])
@validate_request
def get_roles():
    """Get all available roles and permissions"""
    return jsonify(
        {
            "success": True,
            "roles": ["user", "moderator", "admin"],
            "permissions": [
                "predict",
                "bulk_predict",
                "view_analytics",
                "manage_webhooks",
                "export_data",
                "manage_users",
                "view_reports",
                "manage_roles",
                "view_logs",
                "system_config",
                "manage_all",
            ],
            "role_permissions": {
                "user": [
                    "predict",
                    "bulk_predict",
                    "view_analytics",
                    "manage_webhooks",
                    "export_data",
                ],
                "moderator": [
                    "predict",
                    "bulk_predict",
                    "view_analytics",
                    "manage_webhooks",
                    "export_data",
                    "manage_users",
                    "view_reports",
                ],
                "admin": [
                    "predict",
                    "bulk_predict",
                    "view_analytics",
                    "manage_webhooks",
                    "export_data",
                    "manage_users",
                    "view_reports",
                    "manage_roles",
                    "view_logs",
                    "system_config",
                    "manage_all",
                ],
            },
        }
    )


@app.route("/api/rate-limit-status", methods=["GET"])
@validate_request
def rate_limit_status():
    return jsonify(
        {"success": True, "limits": {"predict": {"window": "1 minute", "max": 50}}}
    )


# ============================================
# API DOCUMENTATION (OpenAPI 3.0 + Swagger UI)
# ============================================


@app.route("/openapi.json", methods=["GET"])
@validate_request
def openapi_json():
    """Machine-readable OpenAPI 3.0 contract for this service (issue #985)."""
    return jsonify(build_spec())


# Swagger UI is loaded from a pinned CDN bundle rather than vendored assets so
# the docs page adds no build step or Python dependency; it reads the spec that
# /openapi.json already serves.
_SWAGGER_UI_VERSION = "5.17.14"
_SWAGGER_UI_HTML = f"""<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Spam Detection System - ML API Reference</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@{_SWAGGER_UI_VERSION}/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@{_SWAGGER_UI_VERSION}/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.onload = () => {{
        window.ui = SwaggerUIBundle({{
          url: "/openapi.json",
          dom_id: "#swagger-ui",
        }});
      }};
    </script>
  </body>
</html>"""


@app.route("/docs", methods=["GET"])
@validate_request
def swagger_ui():
    """Interactive Swagger UI rendering /openapi.json (issue #985)."""
    return _SWAGGER_UI_HTML, 200, {"Content-Type": "text/html; charset=utf-8"}


# ============================================
# PREDICT ROUTE (Protected)
# ============================================


def make_prediction_response(
    input_text,
    result,
    confidence_score,
    decision_score,
    confidence_level,
    detected_language="en",
    translated=False,
    translated_text=None,
    domain_analysis=None,
    explanation=None,
    severity=None,
):
    """Enforces a strict standardized response schema for all predictions."""
    response = {
        "input": input_text,
        "result": result,
        "prediction": result,
        "confidence": round(float(confidence_score) / 100.0, 4)
        if confidence_score is not None
        else 0.0,
        "confidence_score": float(confidence_score)
        if confidence_score is not None
        else 0.0,
        "decision_score": float(decision_score) if decision_score is not None else None,
        "confidence_level": confidence_level,
        "detected_language": detected_language,
        "translated": translated,
    }
    if translated and translated_text:
        response["translated_text"] = translated_text
    if domain_analysis is not None:
        response["domain_analysis"] = domain_analysis
        # Thin, top-level summary of domain_analysis for consumers that just
        # want a quick URL risk signal without parsing the full breakdown.
        response["url_risk"] = {
            "is_url_present": bool(domain_analysis.get("domains_found")),
            "score": domain_analysis.get("max_risk_score", 0),
            "level": domain_analysis.get("overall_risk", "SAFE"),
        }
    if explanation is not None:
        response["explanation"] = explanation
    if severity is not None:
        response["severity"] = severity
    return response


@app.route("/predict", methods=["POST"])
@validate_request
@validate_internal_request
@ip_allowlist
@rate_limit(RateLimitPolicy.PREDICT)
def predict():
    # Initialize final_output to prevent NameError/UnboundLocalError in case of early/conditional references
    final_output = None

    try:
        data = request.get_json(silent=True)
        if data is None:
            raw_body = request.get_data(cache=True)
            if raw_body:
                # get_json(silent=True) returns None both for malformed JSON
                # and for the valid JSON literal `null` - tell those apart so
                # the error message doesn't call a well-formed `null` invalid.
                try:
                    json.loads(raw_body)
                except ValueError:
                    return error_response(
                        ErrorCode.INVALID_JSON_BODY,
                        "Request body must be a valid JSON object",
                        400,
                        request_id=_current_request_id(),
                    )
                return error_response(
                    ErrorCode.INVALID_JSON_BODY,
                    "Request body must be a JSON object, got NoneType",
                    400,
                    request_id=_current_request_id(),
                )
            data = {}
        elif not isinstance(data, dict):
            return error_response(
                ErrorCode.INVALID_JSON_BODY,
                f"Request body must be a JSON object, got {type(data).__name__}",
                400,
                request_id=_current_request_id(),
            )

        text = data.get("text")
        input_type = data.get("type", "message")

        if text is None or (isinstance(text, str) and not text.strip()):
            with open(LOG_FILE, "a") as f:
                f.write(
                    f"WARNING: No text provided at {__import__('datetime').datetime.now()}\n"
                )
            return error_response(
                ErrorCode.NO_TEXT_PROVIDED,
                "No text provided",
                400,
                request_id=_current_request_id(),
            )

        if not isinstance(text, str):
            return error_response(
                ErrorCode.INVALID_TEXT_TYPE,
                f"'text' must be a string, got {type(text).__name__}",
                400,
                request_id=_current_request_id(),
            )

        # Read the live serving objects through the shared state so a
        # POST /reload-model hot-swap is picked up here without a restart
        # (#973). One snapshot per request keeps the model, vectorizer and
        # label encoder mutually consistent even if a reload lands mid-request.
        serving = serving_state.STATE.snapshot()

        # Maximum-length validation before any vectorization/inference work.
        if len(text) > MAX_MESSAGE_LENGTH:
            return error_response(
                ErrorCode.TEXT_TOO_LONG,
                (
                    f"'text' exceeds maximum length of {MAX_MESSAGE_LENGTH} "
                    f"characters (got {len(text)})"
                ),
                400,
                request_id=_current_request_id(),
            )

        original_text = text
        detected_language = "en"
        translated = False

        if input_type != "url" and text.strip():
            try:
                from langdetect import detect, DetectorFactory

                DetectorFactory.seed = 0
                detected_language = detect(text)
            except Exception:
                detected_language = "en"

            if detected_language != "en":
                try:
                    from deep_translator import GoogleTranslator

                    translated_text = GoogleTranslator(
                        source="auto", target="en"
                    ).translate(text)
                    if (
                        translated_text
                        and translated_text.strip().lower() != text.strip().lower()
                    ):
                        text = translated_text
                        translated = True
                except Exception:
                    pass

        domain_analysis = analyze_text(text)

        if input_type == "url":
            text_vector = url_vectorizer.transform([text])
            prediction = url_model.predict(text_vector)
            final_output = URL_LABELS.get(int(prediction[0]), "unknown")
            if final_output == "safe" and heuristic_url_is_malicious(text):
                final_output = "malicious"
        else:
            text_vector = serving.vectorizer.transform([text])
            prediction = serving.model.predict(text_vector)
            final_output = serving.label_encoder.inverse_transform(prediction)[0]

        confidence_score = 95.0
        decision_score = None
        try:
            active_model = url_model if input_type == "url" else serving.model
            if hasattr(active_model, "predict_proba"):
                proba = active_model.predict_proba(text_vector)
                confidence_score = round(float(max(proba[0])) * 100, 2)
                decision = active_model.decision_function(text_vector)
                if isinstance(decision, np.ndarray):
                    decision_score = float(np.max(np.abs(decision)))
                else:
                    decision_score = float(abs(decision))
            elif hasattr(active_model, "decision_function"):
                decision = active_model.decision_function(text_vector)
                if isinstance(decision, np.ndarray):
                    decision_score = float(np.max(np.abs(decision)))
                else:
                    decision_score = float(abs(decision))
                prob = 1.0 / (1.0 + np.exp(-decision_score))
                confidence_score = round(prob * 100, 2)
        except Exception:
            confidence_score = 0.0
            decision_score = None

        if confidence_score >= 80:
            confidence_level = "high"
        elif confidence_score >= 60:
            confidence_level = "medium"
        else:
            confidence_level = "low"

        if final_output != "ham":
            words = extract_words(text)
            for word in words:
                try:
                    increment_spam_word_frequency(word)
                except Exception as e:
                    print(f"[db-wordcloud] failed to increment word '{word}': {e}")

        record_scan(text, final_output, input_type)

        text_preview = text[:50] + "..." if len(text) > 50 else text
        with open(LOG_FILE, "a") as f:
            from datetime import datetime

            f.write(
                f"{datetime.now()} - [Request-ID: {getattr(g, 'request_id', 'unknown')}] Prediction: '{text_preview}' -> {final_output}\n"
            )

        explanation = xai_engine.analyze(text, input_type=input_type)
        severity = calculate_spam_severity(original_text)

        response_data = {
            "input": original_text,
            "result": final_output,
            "prediction": final_output,
            "domain_analysis": domain_analysis,
            "explanation": explanation,
            "detected_language": detected_language,
            "translated": translated,
            "confidence_score": confidence_score,
            "confidence_level": confidence_level,
        }
        if translated:
            response_data["translated_text"] = text
        if decision_score is not None:
            response_data["decision_score"] = decision_score

        # Return response using helper
        response_data = make_prediction_response(
            input_text=original_text,
            result=final_output,
            confidence_score=confidence_score,
            decision_score=decision_score,
            confidence_level=confidence_level,
            detected_language=detected_language,
            translated=translated,
            translated_text=text if translated else None,
            domain_analysis=domain_analysis,
            explanation=explanation,
            severity=severity,
        )

        metrics.record_prediction(result=final_output, input_type=input_type)

        return jsonify(response_data)

    except Exception as e:
        request_id = getattr(g, "request_id", "unknown")
        with open(LOG_FILE, "a") as f:
            from datetime import datetime

            f.write(f"{datetime.now()} - [Request-ID: {request_id}] ERROR: {str(e)}\n")
        # Don't leak the raw exception string to the client; log it above and
        # return the standard envelope. request_id is also kept top-level for
        # backward compatibility with the previous 500 shape.
        return error_response(
            ErrorCode.INTERNAL_ERROR,
            "Internal server error",
            500,
            request_id=request_id,
            extra={"request_id": request_id},
        )


# ============================================
# HELPER FUNCTIONS
# ============================================


def extract_words(text):
    text = re.sub(r"[^\w\s]", "", text.lower())
    words = text.split()
    if NLTK_AVAILABLE:
        stop_words = set(stopwords.words("english"))
        words = [w for w in words if w not in stop_words and len(w) > 2]
    else:
        basic_stopwords = {
            "the",
            "a",
            "an",
            "of",
            "for",
            "on",
            "at",
            "to",
            "in",
            "is",
            "it",
            "and",
            "or",
            "but",
            "with",
            "from",
            "by",
            "as",
            "was",
            "are",
            "were",
            "been",
        }
        words = [w for w in words if w not in basic_stopwords and len(w) > 2]
    return words


def get_wordcloud_data():
    """Return stored spam word frequencies from database."""
    try:
        data = get_db_wordcloud_data()
        return data if data else None
    except Exception as e:
        print(f"[db-wordcloud] failed to get wordcloud data: {e}")
        return None


SPAM_WORDS = {
    "free": 145,
    "win": 98,
    "click": 76,
    "urgent": 54,
    "prize": 42,
    "limited": 38,
    "offer": 35,
    "money": 32,
    "cash": 28,
    "bonus": 25,
    "guaranteed": 22,
    "credit": 20,
    "loan": 18,
    "insurance": 15,
    "debt": 14,
    "winner": 14,
    "congratulations": 13,
    "exclusive": 12,
    "opportunity": 10,
    "investment": 9,
    "profit": 9,
    "earn": 8,
    "income": 8,
    "million": 7,
    "billion": 6,
    "rich": 6,
    "secret": 6,
    "miracle": 5,
    "amazing": 5,
}


@app.route("/api/wordcloud", methods=["GET"])
@validate_request
def get_wordcloud():
    try:
        words_data = get_wordcloud_data()
        if words_data:
            return jsonify({"success": True, "data": words_data, "source": "database"})
        sample_data = [{"word": w, "count": c} for w, c in SPAM_WORDS.items()]
        return jsonify({"success": True, "data": sample_data, "source": "sample"})
    except Exception as e:
        app.logger.error(f"Failed to build word cloud data: {e}")
        return error_response(
            ErrorCode.WORDCLOUD_FAILED,
            "Failed to build word cloud data.",
            500,
            request_id=_current_request_id(),
            extra={"success": False},
        )


@app.route("/api/word-of-the-day", methods=["GET"])
def get_word_of_the_day():
    """
    Get the spam word of the day with metadata (definition, context, safety tips).
    """
    try:
        word_data = get_word_of_the_day_data()
        return jsonify({"success": True, "data": word_data})
    except Exception as e:
        app.logger.error(f"Failed to build word of the day: {e}")
        return error_response(
            ErrorCode.WORD_OF_DAY_FAILED,
            "Failed to build word of the day.",
            500,
            request_id=_current_request_id(),
            extra={"success": False},
        )


@app.route("/importance", methods=["GET"])
@validate_request
@validate_internal_request
def get_feature_importance():
    try:
        top_features = [
            {"feature": word, "importance": score}
            for word, score in serving_state.STATE.snapshot().xai_service.get_global_importance()
        ]
        return jsonify({"top_features": top_features})
    except Exception as e:
        app.logger.error(f"Failed to compute feature importance: {e}")
        return error_response(
            ErrorCode.IMPORTANCE_FAILED,
            "Failed to compute feature importance.",
            500,
            request_id=_current_request_id(),
        )


@app.route("/feedback", methods=["POST"])
@validate_request
@validate_internal_request
def feedback():
    data = request.get_json(silent=True) or {}
    text = str(data.get("text", "")).strip()
    predicted_label = str(data.get("predicted_label", "")).strip()
    correct_label = str(data.get("correct_label", "")).strip()

    if not text or correct_label not in FEEDBACK_LABELS:
        return error_response(
            ErrorCode.INVALID_FEEDBACK,
            "Invalid feedback data",
            400,
            request_id=_current_request_id(),
        )

    lock_path = str(FEEDBACK_FILE) + ".lock"

    try:
        with FileLock(lock_path, timeout=5):
            file_exists = os.path.isfile(FEEDBACK_FILE)
            with open(FEEDBACK_FILE, "a", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                if not file_exists:
                    writer.writerow(
                        ["text", "predicted_label", "correct_label", "submitted_at"]
                    )
                from datetime import datetime, timezone

                writer.writerow(
                    [
                        text,
                        predicted_label,
                        correct_label,
                        datetime.now(timezone.utc).isoformat(),
                    ]
                )

        return jsonify({"message": "Feedback recorded. Thank you!"}), 201
    except Timeout:
        return error_response(
            ErrorCode.FEEDBACK_LOCKED,
            "Could not acquire lock on feedback file, please try again later.",
            503,
            request_id=_current_request_id(),
        )
    except Exception as e:
        app.logger.error(f"Failed to write feedback: {e}")
        return error_response(
            ErrorCode.FEEDBACK_WRITE_FAILED,
            "Failed to record feedback.",
            500,
            request_id=_current_request_id(),
        )


@app.route("/feedback/stats", methods=["GET"])
@validate_request
@validate_internal_request
def feedback_stats():
    """Aggregate view of submitted feedback (issue #823): the /feedback
    endpoint has always been write-only, with no way to see what's been
    collected without opening the CSV by hand."""
    if not os.path.isfile(FEEDBACK_FILE):
        return jsonify(
            {
                "total": 0,
                "corrections": 0,
                "correction_rate": 0.0,
                "by_predicted_label": {},
                "recent": [],
            }
        )

    try:
        rows = []
        with open(FEEDBACK_FILE, "r", newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                rows.append(row)
    except Exception as e:
        app.logger.error(f"Failed to read feedback stats: {e}")
        return error_response(
            ErrorCode.FEEDBACK_READ_FAILED,
            "Failed to read feedback data.",
            500,
            request_id=_current_request_id(),
        )

    total = len(rows)
    corrections = 0
    by_predicted_label = {}

    for row in rows:
        predicted = row.get("predicted_label") or "unknown"
        correct = row.get("correct_label") or "unknown"
        is_correction = predicted != correct

        bucket = by_predicted_label.setdefault(
            predicted,
            {
                "total": 0,
                "corrections": 0,
                "corrected_to": {},
            },
        )
        bucket["total"] += 1
        if is_correction:
            corrections += 1
            bucket["corrections"] += 1
            bucket["corrected_to"][correct] = bucket["corrected_to"].get(correct, 0) + 1

    recent = list(reversed(rows))[:20]
    recent = [
        {
            "text_preview": (row.get("text") or "")[:100],
            "predicted_label": row.get("predicted_label"),
            "correct_label": row.get("correct_label"),
            "submitted_at": row.get("submitted_at"),
        }
        for row in recent
    ]

    return jsonify(
        {
            "total": total,
            "corrections": corrections,
            "correction_rate": round(corrections / total, 4) if total else 0.0,
            "by_predicted_label": by_predicted_label,
            "recent": recent,
        }
    )


# ============================================
# EMAIL HEADER ANALYSIS
# ============================================


@app.route("/analyze-email-header", methods=["POST"])
@validate_request
@validate_internal_request
def analyze_email_header():
    try:
        headers = None
        if "file" in request.files:
            file = request.files["file"]
            if file and file.filename != "":
                try:
                    raw_bytes = file.read()
                    try:
                        headers = raw_bytes.decode("utf-8")
                    except UnicodeDecodeError:
                        headers = raw_bytes.decode("latin-1", errors="replace")
                except Exception as e:
                    app.logger.error(f"Failed to read EML file: {e}")
                    raise ApiError(
                        ErrorCode.HEADER_READ_FAILED, "Failed to read EML file", 400
                    ) from e
            else:
                raise ApiError(
                    ErrorCode.NO_HEADERS_PROVIDED, "No email headers provided", 400
                )
        else:
            data = request.get_json(silent=True) or {}
            headers = data.get("headers", "")

        if not headers or not isinstance(headers, str) or not headers.strip():
            raise ApiError(
                ErrorCode.NO_HEADERS_PROVIDED, "No email headers provided", 400
            )

        analysis = analyze_headers(headers)
        return jsonify(
            {
                "success": True,
                "trust_level": analysis.get("trust_level", "Suspicious"),
                "risk_score": analysis.get("risk_score", 0),
                "findings": analysis.get("findings", []),
                "status": analysis.get("risk_level", "Suspicious"),
                "analysis": analysis,
            }
        )
    except ApiError:
        # Typed validation errors raised above must reach the ApiError handler
        # unchanged rather than being flattened into a generic 500.
        raise
    except Exception as e:
        app.logger.error(f"Email header analysis failed: {e}")
        raise ApiError(
            ErrorCode.HEADER_ANALYSIS_FAILED, "Failed to analyze email headers", 500
        ) from e


@app.route("/spam-insights", methods=["GET"])
@validate_request
def get_insights():
    try:
        limit = request.args.get("limit", default=10, type=int)
        category = request.args.get("category", default=None, type=str)
        from spam_insights import get_spam_insights

        insights = get_spam_insights(limit=limit, category=category)
        return jsonify(insights)
    except Exception as e:
        app.logger.error(f"Failed to compute spam insights: {e}")
        return error_response(
            ErrorCode.INSIGHTS_FAILED,
            "Failed to compute spam insights.",
            500,
            request_id=_current_request_id(),
        )


# ============================================
# EMAIL PROVIDER ROUTES
# ============================================


@app.route("/gmail/auth-url", methods=["GET"])
@validate_request
def gmail_auth_url():
    redirect_uri = (
        request.args.get("redirect_uri") or "http://localhost:3000/gmail/callback"
    )
    url = get_gmail_auth_url(redirect_uri)
    return jsonify({"auth_url": url})


@app.route("/gmail/callback", methods=["GET"])
@validate_request
def gmail_callback():
    code = request.args.get("code")
    redirect_uri = (
        request.args.get("redirect_uri") or "http://localhost:3000/gmail/callback"
    )
    username = _require_username()
    if not username:
        raise ApiError(
            ErrorCode.MISSING_USERNAME, "Missing X-User-Username header", 401
        )
    if not code:
        raise ApiError(
            ErrorCode.MISSING_AUTH_CODE, "Authorization code is missing", 400
        )
    try:
        tokens = get_gmail_tokens(code, redirect_uri)
        oauth_store.save_oauth_tokens(username, "gmail", tokens)
        return jsonify({"message": "Gmail connected successfully"})
    except Exception as e:
        app.logger.error(f"Failed to exchange Google code: {e}")
        raise ApiError(
            ErrorCode.OAUTH_EXCHANGE_FAILED,
            "Failed to exchange Google authorization code",
            500,
        ) from e


@app.route("/gmail/emails", methods=["GET"])
@validate_request
@validate_internal_request
@rate_limit(RateLimitPolicy.EMAIL_FETCH)
def gmail_emails():
    username = _require_username()
    if not username:
        raise ApiError(
            ErrorCode.MISSING_USERNAME, "Missing X-User-Username header", 401
        )

    user_tokens = oauth_store.get_oauth_tokens(username, "gmail")

    if not user_tokens:
        raise ApiError(
            ErrorCode.PROVIDER_NOT_CONNECTED, "Gmail account not connected", 401
        )
    try:
        try:
            emails = fetch_gmail_emails(user_tokens.get("access_token"), limit=50)
        except requests.exceptions.HTTPError as err:
            if err.response.status_code == 401 and user_tokens.get("refresh_token"):
                try:
                    new_tokens = refresh_gmail_token(user_tokens["refresh_token"])
                    oauth_store.save_oauth_tokens(username, "gmail", new_tokens)
                    user_tokens = oauth_store.get_oauth_tokens(username, "gmail")
                    emails = fetch_gmail_emails(user_tokens["access_token"], limit=50)
                except Exception as refresh_err:
                    raise refresh_err
            else:
                raise err
        return jsonify({"emails": emails})
    except Exception as e:
        app.logger.error(f"Failed to fetch Gmail emails: {e}")
        raise ApiError(
            ErrorCode.UPSTREAM_FETCH_FAILED, "Failed to fetch Gmail emails", 500
        ) from e


# ============================================
# OUTLOOK ROUTES
# ============================================


@app.route("/outlook/auth-url", methods=["GET"])
@validate_request
def outlook_auth_url():
    redirect_uri = (
        request.args.get("redirect_uri") or "http://localhost:3000/outlook/callback"
    )
    url = get_outlook_auth_url(redirect_uri)
    return jsonify({"auth_url": url})


@app.route("/outlook/callback", methods=["GET"])
@validate_request
def outlook_callback():
    code = request.args.get("code")
    redirect_uri = (
        request.args.get("redirect_uri") or "http://localhost:3000/outlook/callback"
    )
    username = _require_username()
    if not username:
        raise ApiError(
            ErrorCode.MISSING_USERNAME, "Missing X-User-Username header", 401
        )
    if not code:
        raise ApiError(
            ErrorCode.MISSING_AUTH_CODE, "Authorization code is missing", 400
        )
    try:
        tokens = get_outlook_tokens(code, redirect_uri)
        oauth_store.save_oauth_tokens(username, "outlook", tokens)
        return jsonify({"message": "Outlook connected successfully"})
    except Exception as e:
        app.logger.error(f"Failed to exchange Outlook code: {e}")
        raise ApiError(
            ErrorCode.OAUTH_EXCHANGE_FAILED,
            "Failed to exchange Outlook authorization code",
            500,
        ) from e


@app.route("/outlook/emails", methods=["GET"])
@validate_internal_request
@rate_limit(RateLimitPolicy.EMAIL_FETCH)
def outlook_emails():
    username = _require_username()
    if not username:
        raise ApiError(
            ErrorCode.MISSING_USERNAME, "Missing X-User-Username header", 401
        )
    user_tokens = oauth_store.get_oauth_tokens(username, "outlook")

    if not user_tokens:
        raise ApiError(
            ErrorCode.PROVIDER_NOT_CONNECTED, "Outlook account not connected", 401
        )

    try:
        try:
            emails = fetch_outlook_emails(user_tokens.get("access_token"), limit=50)
        except requests.exceptions.HTTPError as err:
            if err.response.status_code == 401 and user_tokens.get("refresh_token"):
                try:
                    new_tokens = refresh_outlook_token(user_tokens["refresh_token"])
                    oauth_store.save_oauth_tokens(username, "outlook", new_tokens)
                    user_tokens = oauth_store.get_oauth_tokens(username, "outlook")
                    emails = fetch_outlook_emails(user_tokens["access_token"], limit=50)
                except Exception as refresh_err:
                    raise refresh_err
            else:
                raise err
        return jsonify({"emails": emails})
    except Exception as e:
        app.logger.error(f"Failed to fetch Outlook emails: {e}")
        raise ApiError(
            ErrorCode.UPSTREAM_FETCH_FAILED, "Failed to fetch Outlook emails", 500
        ) from e


@app.route("/scan-emails", methods=["POST"])
@validate_internal_request
@rate_limit(RateLimitPolicy.THREAT_INTEL)
def scan_emails_route():
    data = request.get_json(silent=True) or {}
    provider = data.get("provider", "").lower()
    username = _require_username()
    if not username:
        raise ApiError(
            ErrorCode.MISSING_USERNAME, "Missing X-User-Username header", 401
        )

    if provider not in ("gmail", "outlook"):
        raise ApiError(
            ErrorCode.INVALID_PROVIDER,
            "Invalid provider. Must be 'gmail' or 'outlook'.",
            400,
        )

    user_tokens = oauth_store.get_oauth_tokens(username, provider)
    if not user_tokens:
        raise ApiError(
            ErrorCode.PROVIDER_NOT_CONNECTED,
            f"{provider.capitalize()} account not connected.",
            401,
        )

    try:
        if provider == "gmail":
            try:
                emails = fetch_gmail_emails(user_tokens.get("access_token"), limit=50)
            except requests.exceptions.HTTPError as err:
                if err.response.status_code == 401 and user_tokens.get("refresh_token"):
                    try:
                        new_tokens = refresh_gmail_token(user_tokens["refresh_token"])
                        oauth_store.save_oauth_tokens(username, "gmail", new_tokens)
                        user_tokens = oauth_store.get_oauth_tokens(username, "gmail")
                        emails = fetch_gmail_emails(
                            user_tokens["access_token"], limit=50
                        )
                    except Exception as refresh_err:
                        raise refresh_err
                else:
                    raise err
        else:
            try:
                emails = fetch_outlook_emails(user_tokens.get("access_token"), limit=50)
            except requests.exceptions.HTTPError as err:
                if err.response.status_code == 401 and user_tokens.get("refresh_token"):
                    try:
                        new_tokens = refresh_outlook_token(user_tokens["refresh_token"])
                        oauth_store.save_oauth_tokens(username, "outlook", new_tokens)
                        user_tokens = oauth_store.get_oauth_tokens(username, "outlook")
                        emails = fetch_outlook_emails(
                            user_tokens["access_token"], limit=50
                        )
                    except Exception as refresh_err:
                        raise refresh_err
                else:
                    raise err

        scan_results = scan_emails_with_model(emails)
        return jsonify(scan_results)
    except Exception as e:
        app.logger.error(f"Email scan execution failed: {e}")
        raise ApiError(
            ErrorCode.EMAIL_SCAN_FAILED, "Email scan execution failed", 500
        ) from e


# ============================================
# IMAP ROUTES
# ============================================

imap_store.init_db()
oauth_store.init_db()
init_spam_words_db()
scheduler = BackgroundScheduler()
scheduler.start()


def _refresh_oauth_tokens():
    """Runs inside the scheduler thread: refreshes OAuth tokens close to expiration."""
    try:
        expiring = oauth_store.get_expiring_oauth_tokens(threshold_minutes=10)
    except Exception as e:
        print(f"[oauth-refresh] failed to fetch expiring tokens: {e}")
        return

    for token_entry in expiring:
        username = token_entry["username"]
        provider = token_entry["provider"]
        refresh_token = token_entry["refresh_token"]

        if not refresh_token:
            print(f"[oauth-refresh] No refresh token for {username} ({provider})")
            continue

        try:
            if provider == "gmail":
                new_tokens = refresh_gmail_token(refresh_token)
            elif provider == "outlook":
                new_tokens = refresh_outlook_token(refresh_token)
            else:
                continue

            oauth_store.save_oauth_tokens(username, provider, new_tokens)
            print(
                f"[oauth-refresh] successfully refreshed token for {username} ({provider})"
            )
        except requests.exceptions.HTTPError as err:
            is_auth_error = False
            try:
                if err.response is not None:
                    if err.response.status_code in (400, 401):
                        err_json = err.response.json()
                        err_desc = err_json.get("error", "")
                        if "invalid_grant" in err_desc or err_json.get(
                            "error_description", ""
                        ):
                            is_auth_error = True
            except Exception:
                pass

            if is_auth_error or (
                err.response is not None and err.response.status_code == 400
            ):
                print(
                    f"[oauth-refresh] Token revoked/invalid for {username} ({provider}). Deleting from DB."
                )
                oauth_store.delete_oauth_tokens(username, provider)
            else:
                print(
                    f"[oauth-refresh] Temporary HTTP error refreshing token for {username} ({provider}): {err}"
                )
        except Exception as e:
            print(
                f"[oauth-refresh] failed to refresh token for {username} ({provider}): {e}"
            )


scheduler.add_job(
    _refresh_oauth_tokens,
    "interval",
    minutes=5,
    id="oauth_token_refresh",
    replace_existing=True,
)


def _run_imap_scan(username):
    conn_row = imap_store.get_connection(username)
    if not conn_row:
        return
    try:
        password = decrypt_secret(conn_row["encrypted_password"])
        emails = imap_connector.fetch_imap_emails(
            conn_row["host"],
            conn_row["port"],
            conn_row["imap_username"],
            password,
            limit=50,
        )
        with app.app_context():
            scan_results = scan_emails_with_model(emails)
        imap_store.save_scan_results(username, scan_results["emails"])
        imap_store.update_last_scan(username)
    except Exception as e:
        print(f"[imap-scan] scheduled scan failed for {username}: {e}")


def _schedule_user_job(username, interval_minutes):
    scheduler.add_job(
        _run_imap_scan,
        "interval",
        minutes=interval_minutes,
        id=f"imap_scan_{username}",
        args=[username],
        replace_existing=True,
    )


for _row in imap_store.get_all_active_connections():
    _schedule_user_job(_row["username"], _row["scan_interval_minutes"])


def _require_username():
    secret = request.headers.get("X-Internal-Secret", "")
    if not secret or not hmac.compare_digest(secret, INTERNAL_SECRET):
        return None
    return request.headers.get("X-User-Username")


@app.route("/imap/connect", methods=["POST"])
@validate_request
@validate_internal_request
def imap_connect():
    username = _require_username()
    if not username:
        raise ApiError(
            ErrorCode.MISSING_USERNAME, "Missing X-User-Username header", 401
        )
    data = request.get_json(silent=True) or {}

    host = data.get("host", "").strip()
    port = data.get("port", 993)
    imap_username = data.get("imap_username", "").strip()
    password = data.get("password", "")
    scan_interval_minutes = data.get("scan_interval_minutes")
    consent = data.get("consent", False)

    if not host or not imap_username or not password:
        raise ApiError(
            ErrorCode.INVALID_IMAP_CONFIG,
            "host, imap_username and password are required",
            400,
        )

    if scan_interval_minutes not in imap_store.ALLOWED_INTERVALS:
        raise ApiError(
            ErrorCode.INVALID_SCAN_INTERVAL,
            f"scan_interval_minutes must be one of {imap_store.ALLOWED_INTERVALS}",
            400,
        )

    if not consent:
        raise ApiError(
            ErrorCode.CONSENT_REQUIRED,
            "Explicit consent is required before connecting an inbox",
            400,
        )

    try:
        imap_connector.test_imap_connection(host, port, imap_username, password)
    except imap_connector.ImapAuthError as e:
        raise ApiError(
            ErrorCode.IMAP_AUTH_FAILED,
            f"Could not authenticate with the IMAP server: {e}",
            401,
        ) from e
    except Exception as e:
        raise ApiError(
            ErrorCode.IMAP_CONNECT_FAILED,
            f"Could not connect to the IMAP server: {e}",
            502,
        ) from e

    encrypted_password = encrypt_secret(password)
    imap_store.save_connection(
        username, host, port, imap_username, encrypted_password, scan_interval_minutes
    )
    _schedule_user_job(username, scan_interval_minutes)

    return jsonify(
        {
            "message": "Inbox connected. Scheduled scanning is now active.",
            "scan_interval_minutes": scan_interval_minutes,
        }
    )


# ============================================
# MAIN
# ============================================


if __name__ == "__main__":
    # load_settings() already refuses an unsafe FLASK_DEBUG/non-loopback host
    # combination at import; this mirrors the check at the run site as a final
    # guard before the debugger could ever be exposed.
    if settings.flask_debug and settings.flask_host not in (
        "127.0.0.1",
        "localhost",
        "::1",
    ):
        raise SystemExit(
            "Refusing to start: FLASK_DEBUG is enabled while binding to "
            f"'{settings.flask_host}'. The interactive debugger must never be "
            "exposed on a non-loopback interface."
        )

    app.run(
        host=settings.flask_host,
        port=settings.flask_port,
        debug=settings.flask_debug,
    )
