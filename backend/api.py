from flask import Flask, request, jsonify, g
import csv
import json
import joblib
import numpy as np
import os
import re
import hmac
from collections import Counter
from urllib.parse import urlparse
from functools import wraps
from dotenv import load_dotenv
from domain_checker import analyze_text
from email_header_analyzer import analyze_headers
from explanation_engine import ExplanationEngine
from pathlib import Path
from flask_cors import CORS
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent / "email_connectors"))
from utils.spamSeverity import calculate_spam_severity
from filelock import FileLock
import requests
import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
from routes.analytics import analytics_bp
from routes.analytics import record_scan
from flask_limiter import Limiter
from flask_limiter.errors import RateLimitExceeded
from flask_limiter.util import get_remote_address
from gmail_connector import get_gmail_auth_url, get_gmail_tokens, refresh_gmail_token, fetch_gmail_emails
from outlook_connector import get_outlook_auth_url, get_outlook_tokens, refresh_outlook_token, fetch_outlook_emails
from email_scanner import scan_emails_with_model
import imap_connector
import imap_store
import oauth_store
from crypto_utils import encrypt_secret, decrypt_secret, CredentialEncryptionError
from apscheduler.schedulers.background import BackgroundScheduler


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

app = Flask(__name__)

xai_engine = ExplanationEngine()
CORS(app, resources={r"/*": {"origins": "http://localhost:5173"}})

# ── Rate limiting (ML inference protection) ──────────────────────────────────
PREDICT_RATE_LIMIT = os.getenv("PREDICT_RATE_LIMIT", "50 per minute")

from extensions import limiter
limiter.init_app(app)

# Flask-Limiter uses a default 429 HTML response; standardize to JSON.
@app.errorhandler(RateLimitExceeded)
def ratelimit_handler(e):
    return jsonify({"error": "Too Many Requests", "rate_limit": PREDICT_RATE_LIMIT}), 429


# ============================================
# ZERO TRUST - INTERNAL SECRET
# ============================================

# Shared secret that the trusted Node/Express backend attaches to every request.
# This is mandatory configuration: there is intentionally NO hardcoded fallback.
INTERNAL_SECRET_MIN_LENGTH = 32

def _load_internal_secret():
    secret = os.getenv("INTERNAL_SECRET")
    if not secret:
        raise RuntimeError(
            "INTERNAL_SECRET is not set. This shared secret authenticates "
            "requests from the Node/Express backend and is mandatory. Generate "
            "one with `python -c \"import secrets; print(secrets.token_urlsafe(32))\"` "
            "and set it (identically) for both the Node and Flask services."
        )
    if len(secret) < INTERNAL_SECRET_MIN_LENGTH:
        raise RuntimeError(
            f"INTERNAL_SECRET is too short ({len(secret)} characters); it must "
            f"be at least {INTERNAL_SECRET_MIN_LENGTH} characters."
        )
    return secret

INTERNAL_SECRET = _load_internal_secret()

# Paths reachable without the internal secret (liveness/readiness probes)
PUBLIC_PATHS = {"/", "/health", "/api/roles", "/api/rate-limit-status"}


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
            app.logger.warning(f"⚠️  Unauthorized internal request from {request.remote_addr}")
            return jsonify({
                "success": False,
                "error": "Forbidden: requests must originate from the trusted backend"
            }), 403
        
        # Log internal request
        app.logger.info(f"🔐 [ZERO-TRUST] Internal request to {request.path} from {request.remote_addr}")
        return f(*args, **kwargs)
    return decorated_function

# Apply to all routes by default (except public paths)
@app.before_request
def require_internal_secret():
    if app.config.get("TESTING") and not app.config.get("ENFORCE_INTERNAL_SECRET"):
        return None
    if request.method == "OPTIONS":
        return None
    if request.path in PUBLIC_PATHS:
        return None
    provided = request.headers.get("X-Internal-Secret", "")
    if not provided or not hmac.compare_digest(provided, INTERNAL_SECRET):
        return jsonify({
            "success": False,
            "error": "Forbidden: requests must originate from the trusted backend"
        }), 403


# ============================================
# ZERO TRUST - IP ALLOWLISTING
# ============================================

def ip_allowlist(f):
    """Decorator to restrict access to specific IPs"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip in development
        if os.getenv("NODE_ENV") == "development":
            return f(*args, **kwargs)
        
        allowed_ips = os.getenv("SERVICE_IP_ALLOWLIST", "127.0.0.1,::1")
        allowed_list = [ip.strip() for ip in allowed_ips.split(",")]
        
        client_ip = request.headers.get("X-Forwarded-For", request.remote_addr)
        # Get first IP if multiple
        if "," in client_ip:
            client_ip = client_ip.split(",")[0].strip()
        
        if client_ip not in allowed_list:
            app.logger.warning(f"⚠️  Blocked request from unauthorized IP: {client_ip}")
            return jsonify({
                "success": False,
                "error": "Access denied from this IP address"
            }), 403
        

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
                if any(p in value.lower() for p in ['<script', 'javascript:', 'onerror', 'onload']):
                    app.logger.warning(f"⚠️  Suspicious query param: {key}={value[:50]}")
                    return jsonify({
                        "success": False,
                        "error": "Invalid request parameters"
                    }), 400
        
        # Validate request body
        if request.is_json:
            data = request.get_json(silent=True) or {}
            # Check for suspicious patterns in JSON data
            import json
            data_str = json.dumps(data).lower()
            if any(p in data_str for p in ['<script', 'javascript:', 'onerror']):
                app.logger.warning(f"⚠️  Suspicious request body from {request.remote_addr}")
                return jsonify({
                    "success": False,
                    "error": "Invalid request body"
                }), 400
        

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
                if any(p in value.lower() for p in ['<script', 'javascript:', 'onerror', 'onload']):
                    app.logger.warning(f"⚠️  Suspicious query param: {key}={value[:50]}")
                    return jsonify({
                        "success": False,
                        "error": "Invalid request parameters"
                    }), 400
        
        # Validate request body
        if request.is_json:
            data = request.get_json(silent=True) or {}
            # Check for suspicious patterns in JSON data
            import json
            data_str = json.dumps(data).lower()
            if any(p in data_str for p in ['<script', 'javascript:', 'onerror']):
                app.logger.warning(f"⚠️  Suspicious request body from {request.remote_addr}")
                return jsonify({
                    "success": False,
                    "error": "Invalid request body"
                }), 400
        
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
            request_id = getattr(g, 'request_id', 'unknown')
            app.logger.info(f"📝 [AUDIT] {action.__name__} - {resource_type} - User: {user} - Request-ID: {request_id}")
            
            # Execute the function
            response = f(*args, **kwargs)
            
            # Log response
            status = getattr(response, 'status_code', 200)
            app.logger.info(f"📝 [AUDIT] {action.__name__} - Status: {status} - User: {user}")
            
            return response
        return decorated_function
    return decorator


# ============================================
# GLOBAL ERROR HANDLING
# ============================================

@app.errorhandler(500)
@app.errorhandler(Exception)
def handle_internal_error(e):
    from werkzeug.exceptions import HTTPException
    if isinstance(e, HTTPException):
        return e
    request_id = getattr(g, 'request_id', 'unknown')
    app.logger.exception(f"❌ [Request-ID: {request_id}] Unhandled exception")
    return jsonify({"error": "Internal server error", "request_id": request_id}), 500


# ============================================
# MODEL LOADING
# ============================================

BASE_DIR = Path(__file__).resolve().parent

def resolve_path(env_var, default_filename):
    val = os.getenv(env_var)
    if val:
        p = Path(val)
        if p.is_absolute():
            return val
        if p.exists() and p.stat().st_size > 0:
            return val
        p_base = BASE_DIR / p
        if p_base.exists() and p_base.stat().st_size > 0:
            return str(p_base)
        p_name = BASE_DIR / p.name
        if p_name.exists() and p_name.stat().st_size > 0:
            return str(p_name)
        return val
    return str(BASE_DIR / default_filename)

MODEL_PATH = resolve_path("MODEL_PATH", "linear_svm_model.pkl")
VECTORIZER_PATH = resolve_path("VECTORIZER_PATH", "tfidf_vectorizer.pkl")
LABEL_ENCODER_PATH = resolve_path("LABEL_ENCODER_PATH", "label_encoder.pkl")
URL_MODEL_PATH = resolve_path("URL_MODEL_PATH", "url_detector.pkl")
URL_VECTORIZER_PATH = resolve_path("URL_VECTORIZER_PATH", "url_vectorizer.pkl")

model = joblib.load(MODEL_PATH)
vectorizer = joblib.load(VECTORIZER_PATH)
label_encoder = joblib.load(LABEL_ENCODER_PATH)

from xai_service import XAIService
xai_service = XAIService(model=model, vectorizer=vectorizer, label_encoder=label_encoder)


# In-memory storage for spam words
spam_words_storage = {}


# In-memory storage for spam words
spam_words_storage = {}


# SQLite Persistent Storage for spam words
import sqlite3
from datetime import datetime, timezone



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
            (word, day)
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
        "tips": "Be highly skeptical of 'free' offers; they are often bait for phishing, subscriptions, or malware."
    },
    "win": {
        "definition": "Be successful or victorious in a contest or raffle, typically fake in spam/phishing messages.",
        "context": "You have won a $1000 Walmart Gift Card! Claim here.",
        "tips": "If you didn't enter a contest, you didn't win anything. Never enter personal details to claim a 'prize'."
    },
    "urgent": {
        "definition": "Requiring immediate action or attention, used to induce panic and quick, unthinking decisions.",
        "context": "URGENT: Your account has been compromised. Verify your details within 24 hours.",
        "tips": "Phishers use artificial urgency to make you act before you think. Verify independently with the service."
    },
    "prize": {
        "definition": "An award given to the winner of a competition, often used as bait in promotional spam.",
        "context": "Your special prize is waiting! Click here to claim.",
        "tips": "Legitimate organizations don't send SMS/emails with sketchy links to claim randomly awarded prizes."
    },
    "cash": {
        "definition": "Money in coins or notes, commonly promised in financial spam and advance-fee fraud schemes.",
        "context": "Earn quick cash from home! Make $500/day.",
        "tips": "Beware of 'get rich quick' or easy work-from-home offers. They are often scams or money-laundering operations."
    },
    "offer": {
        "definition": "A proposal or bid, frequently restricted in time to force immediate response.",
        "context": "Exclusive limited time offer: Save 90% on this software.",
        "tips": "Always check the domain of the offer. Avoid clicking promotional links from unknown senders."
    },
    "guaranteed": {
        "definition": "Formally assured, commonly used in deceptive promises of loans, earnings, or cures.",
        "context": "Guaranteed approval for home loans up to $50,000.",
        "tips": "No financial service can guarantee approval without screening. This is a common trap for upfront fees."
    },
    "click": {
        "definition": "Press a link or button, directing users to external phishing or credential harvesting pages.",
        "context": "Click this link to restore access to your banking portal.",
        "tips": "Never click direct links in unexpected emails/texts requesting login credentials. Go to the site manually."
    }
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
            (day,)
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
        
    metadata = SPAM_WORD_METADATA.get(word, {
        "definition": "A keyword commonly appearing in unsolicited messages, flagged by the system as a potential spam indicator.",
        "context": f"Important notification: Please review this {word}.",
        "tips": f"Treat messages containing '{word}' with caution. Verify the sender's identity and watch out for unsolicited requests."
    })
    
    return {
        "word": word,
        "count": count if count > 0 else None,
        "definition": metadata["definition"],
        "context": metadata["context"],
        "tips": metadata["tips"]
    }


app.model = model
app.vectorizer = vectorizer
app.label_encoder = label_encoder

from bulk_predict import bulk_predict_bp
app.register_blueprint(bulk_predict_bp)
app.register_blueprint(analytics_bp)

url_model = joblib.load(URL_MODEL_PATH)
url_vectorizer = joblib.load(URL_VECTORIZER_PATH)
URL_LABELS = {0: "malicious", 1: "safe"}
# url_detector.pkl predicts numeric classes with no bundled label encoder
URL_LABELS = {0: "safe", 1: "malicious"}



URL_LABELS = {0: "malicious", 1: "safe"}

# url_detector.pkl predicts numeric classes with no bundled label encoder
URL_LABELS = {0: "safe", 1: "malicious"}



# Heuristic checks
SUSPICIOUS_TLDS = {
    "tk", "ml", "ga", "cf", "gq", "xyz", "top", "work", "click", "loan", "men", "review",
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

MAX_MESSAGE_LENGTH = int(os.getenv("MAX_MESSAGE_LENGTH", 10000))
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

@app.route("/api/roles", methods=["GET"])
@validate_request
def get_roles():
    """Get all available roles and permissions"""
    return jsonify({
        "success": True,
        "roles": ["user", "moderator", "admin"],
        "permissions": [
            "predict", "bulk_predict", "view_analytics", "manage_webhooks",
            "export_data", "manage_users", "view_reports", "manage_roles",
            "view_logs", "system_config", "manage_all"
        ],
        "role_permissions": {
            "user": ["predict", "bulk_predict", "view_analytics", "manage_webhooks", "export_data"],
            "moderator": ["predict", "bulk_predict", "view_analytics", "manage_webhooks", "export_data", "manage_users", "view_reports"],
            "admin": ["predict", "bulk_predict", "view_analytics", "manage_webhooks", "export_data", "manage_users", "view_reports", "manage_roles", "view_logs", "system_config", "manage_all"]
        }
    })

@app.route("/api/rate-limit-status", methods=["GET"])
@validate_request
def rate_limit_status():
    return jsonify({
        "success": True,
        "limits": {
            "predict": {"window": "1 minute", "max": 50}
        }
    })


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
    severity=None
):
    """Enforces a strict standardized response schema for all predictions."""
    response = {
        "input": input_text,
        "result": result,
        "prediction": result,
        "confidence": round(float(confidence_score) / 100.0, 4) if confidence_score is not None else 0.0,
        "confidence_score": float(confidence_score) if confidence_score is not None else 0.0,
        "decision_score": float(decision_score) if decision_score is not None else None,
        "confidence_level": confidence_level,
        "detected_language": detected_language,
        "translated": translated
    }
    if translated and translated_text:
        response["translated_text"] = translated_text
    if domain_analysis is not None:
        response["domain_analysis"] = domain_analysis
    if explanation is not None:
        response["explanation"] = explanation
    if severity is not None:
        response["severity"] = severity
    return response


@app.route("/predict", methods=["POST"])
@validate_request
@validate_internal_request
@ip_allowlist
@limiter.limit(PREDICT_RATE_LIMIT)
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
                    return jsonify({
                        "error": "Request body must be a valid JSON object"
                    }), 400
                return jsonify({
                    "error": "Request body must be a JSON object, got NoneType"
                }), 400
            data = {}
        elif not isinstance(data, dict):
            return jsonify({
                "error": f"Request body must be a JSON object, got {type(data).__name__}"
            }), 400

        text = data.get("text")
        input_type = data.get("type", "message")

        if text is None or (isinstance(text, str) and not text.strip()):
            with open(LOG_FILE, "a") as f:
                f.write(f"WARNING: No text provided at {__import__('datetime').datetime.now()}\n")
            return jsonify({"error": "No text provided"}), 400

        if not isinstance(text, str):
            return jsonify({
                "error": f"'text' must be a string, got {type(text).__name__}"
            }), 400

        if len(text) > MAX_MESSAGE_LENGTH:
            return jsonify({
                "error": (
                    f"'text' exceeds maximum length of {MAX_MESSAGE_LENGTH} "
                    f"characters (got {len(text)})"
                )
            }), 400

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
                    translated_text = GoogleTranslator(source='auto', target='en').translate(text)
                    if translated_text and translated_text.strip().lower() != text.strip().lower():
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
            text_vector = vectorizer.transform([text])
            prediction = model.predict(text_vector)
            final_output = label_encoder.inverse_transform(prediction)[0]

        confidence_score = 95.0
        decision_score = None
        try:
            active_model = url_model if input_type == "url" else model
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

        if final_output == "spam":
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
            f.write(f"{datetime.now()} - [Request-ID: {getattr(g, 'request_id', 'unknown')}] Prediction: '{text_preview}' -> {final_output}\n")
        
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
            "confidence_level": confidence_level
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
            severity=severity
        )


        return jsonify(response_data)

    except Exception as e:
        request_id = getattr(g, 'request_id', 'unknown')
        with open(LOG_FILE, "a") as f:
            from datetime import datetime
            f.write(f"{datetime.now()} - [Request-ID: {request_id}] ERROR: {str(e)}\n")
        return jsonify({"error": str(e), "request_id": request_id}), 500


# ============================================
# HELPER FUNCTIONS
# ============================================

def extract_words(text):
    text = re.sub(r'[^\w\s]', '', text.lower())
    words = text.split()
    if NLTK_AVAILABLE:
        stop_words = set(stopwords.words('english'))
        words = [w for w in words if w not in stop_words and len(w) > 2]
    else:
        basic_stopwords = {'the', 'a', 'an', 'of', 'for', 'on', 'at', 'to', 'in', 'is', 'it', 'and', 'or', 'but', 'with', 'from', 'by', 'as', 'was', 'are', 'were', 'been'}
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
    'free': 145, 'win': 98, 'click': 76, 'urgent': 54, 'prize': 42,
    'limited': 38, 'offer': 35, 'money': 32, 'cash': 28, 'bonus': 25,
    'guaranteed': 22, 'credit': 20, 'loan': 18, 'insurance': 15, 'debt': 14,
    'winner': 14, 'congratulations': 13, 'exclusive': 12, 'opportunity': 10,
    'investment': 9, 'profit': 9, 'earn': 8, 'income': 8, 'million': 7,
    'billion': 6, 'rich': 6, 'secret': 6, 'miracle': 5, 'amazing': 5
}


@app.route('/api/wordcloud', methods=['GET'])
@validate_request
def get_wordcloud():
    try:
        words_data = get_wordcloud_data()
        if words_data:
            return jsonify({"success": True, "data": words_data, "source": "database"})
        sample_data = [{"word": w, "count": c} for w, c in SPAM_WORDS.items()]
        return jsonify({"success": True, "data": sample_data, "source": "sample"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/word-of-the-day', methods=['GET'])
def get_word_of_the_day():
    """
    Get the spam word of the day with metadata (definition, context, safety tips).
    """
    try:
        word_data = get_word_of_the_day_data()
        return jsonify({
            "success": True,
            "data": word_data
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route("/importance", methods=["GET"])
@validate_request
@validate_internal_request
def get_feature_importance():
    try:
        top_features = [
            {"feature": word, "importance": score}
            for word, score in xai_service.get_global_importance()
        ]
        return jsonify({"top_features": top_features})
    except Exception as e:
        app.logger.error(f"Failed to compute feature importance: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/feedback", methods=["POST"])
@validate_request
@validate_internal_request
def feedback():
    data = request.get_json(silent=True) or {}
    text = str(data.get("text", "")).strip()
    predicted_label = str(data.get("predicted_label", "")).strip()
    correct_label = str(data.get("correct_label", "")).strip()

    if not text or correct_label not in FEEDBACK_LABELS:
        return jsonify({"error": "Invalid feedback data"}), 400

    lock_path = str(FEEDBACK_FILE) + '.lock'

    try:
        with FileLock(lock_path, timeout=5):
            file_exists = os.path.isfile(FEEDBACK_FILE)
            with open(FEEDBACK_FILE, "a", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                if not file_exists:
                    writer.writerow(["text", "predicted_label", "correct_label", "submitted_at"])
                from datetime import datetime, timezone
                writer.writerow([text, predicted_label, correct_label, datetime.now(timezone.utc).isoformat()])

        return jsonify({"message": "Feedback recorded. Thank you!"}), 201
    except Timeout:
        return jsonify({"error": "Could not acquire lock on feedback file, please try again later."}), 503
    except Exception as e:
        app.logger.error(f"Failed to write feedback: {e}")
        return jsonify({"error": "Failed to record feedback."}), 500


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
                    return jsonify({"error": f"Failed to read EML file: {str(e)}"}), 400
            else:
                return jsonify({"error": "No email headers provided"}), 400
        else:
            data = request.get_json(silent=True) or {}
            headers = data.get("headers", "")

        if not headers or not isinstance(headers, str) or not headers.strip():
            return jsonify({"error": "No email headers provided"}), 400
            
        analysis = analyze_headers(headers)
        return jsonify({
            "success": True,
            "trust_level": analysis.get("trust_level", "Suspicious"),
            "risk_score": analysis.get("risk_score", 0),
            "findings": analysis.get("findings", []),
            "status": analysis.get("risk_level", "Suspicious"),
            "analysis": analysis
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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
        return jsonify({"error": str(e)}), 500



# ============================================
# EMAIL PROVIDER ROUTES
# ============================================

TOKEN_STORE = {}


@app.route("/gmail/auth-url", methods=["GET"])
@validate_request
def gmail_auth_url():
    redirect_uri = request.args.get("redirect_uri") or "http://localhost:3000/gmail/callback"
    url = get_gmail_auth_url(redirect_uri)
    return jsonify({"auth_url": url})

@app.route("/gmail/callback", methods=["GET"])
@validate_request
def gmail_callback():
    code = request.args.get("code")
    redirect_uri = request.args.get("redirect_uri") or "http://localhost:3000/gmail/callback"
    username = _require_username()
    if not username:
        return jsonify({"error": "Missing X-User-Username header"}), 401
    if not code:
        return jsonify({"error": "Authorization code is missing"}), 400
    try:
        tokens = get_gmail_tokens(code, redirect_uri)
        oauth_store.save_oauth_tokens(username, "gmail", tokens)
        return jsonify({"message": "Gmail connected successfully"})
    except Exception as e:
        return jsonify({"error": f"Failed to exchange Google code: {str(e)}"}), 500

@app.route("/gmail/emails", methods=["GET"])
@validate_request
@validate_internal_request
def gmail_emails():
    username = _require_username()
    if not username:
        return jsonify({"error": "Missing X-User-Username header"}), 401

    user_tokens = TOKEN_STORE.get(username, {}).get("gmail")

    user_tokens = oauth_store.get_oauth_tokens(username, "gmail")
    

    if not user_tokens:
        return jsonify({"error": "Gmail account not connected"}), 401
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
        return jsonify({"error": f"Failed to fetch Gmail emails: {str(e)}"}), 500


# ============================================
# OUTLOOK ROUTES
# ============================================

@app.route("/outlook/auth-url", methods=["GET"])
@validate_request
def outlook_auth_url():
    redirect_uri = request.args.get("redirect_uri") or "http://localhost:3000/outlook/callback"
    url = get_outlook_auth_url(redirect_uri)
    return jsonify({"auth_url": url})

@app.route("/outlook/callback", methods=["GET"])
@validate_request
def outlook_callback():
    code = request.args.get("code")
    redirect_uri = request.args.get("redirect_uri") or "http://localhost:3000/outlook/callback"
    username = _require_username()
    if not username:
        return jsonify({"error": "Missing X-User-Username header"}), 401
    if not code:
        return jsonify({"error": "Authorization code is missing"}), 400
    try:
        tokens = get_outlook_tokens(code, redirect_uri)
        oauth_store.save_oauth_tokens(username, "outlook", tokens)
        return jsonify({"message": "Outlook connected successfully"})
    except Exception as e:
        return jsonify({"error": f"Failed to exchange Outlook code: {str(e)}"}), 500


@app.route("/outlook/emails", methods=["GET"])
@validate_internal_request
def outlook_emails():
    username = _require_username()
    if not username:
        return jsonify({"error": "Missing X-User-Username header"}), 401
    user_tokens = oauth_store.get_oauth_tokens(username, "outlook")
    
    if not user_tokens:
        return jsonify({"error": "Outlook account not connected"}), 401
        
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
        return jsonify({"error": f"Failed to fetch Outlook emails: {str(e)}"}), 500

@app.route("/scan-emails", methods=["POST"])
@validate_internal_request
def scan_emails_route():
    data = request.get_json(silent=True) or {}
    provider = data.get("provider", "").lower()
    username = _require_username()
    if not username:
        return jsonify({"error": "Missing X-User-Username header"}), 401
    
    if provider not in ("gmail", "outlook"):
        return jsonify({"error": "Invalid provider. Must be 'gmail' or 'outlook'."}), 400
        
    user_tokens = oauth_store.get_oauth_tokens(username, provider)
    if not user_tokens:
        return jsonify({"error": f"{provider.capitalize()} account not connected."}), 401
        
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
                        emails = fetch_gmail_emails(user_tokens["access_token"], limit=50)
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
                        emails = fetch_outlook_emails(user_tokens["access_token"], limit=50)
                    except Exception as refresh_err:
                        raise refresh_err
                else:
                    raise err
                    
        scan_results = scan_emails_with_model(emails)
        return jsonify(scan_results)
    except Exception as e:
        return jsonify({"error": f"Email scan execution failed: {str(e)}"}), 500


# ============================================
# IMAP ROUTES
# ============================================

imap_store.init_db()
oauth_store.init_db()
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
            print(f"[oauth-refresh] successfully refreshed token for {username} ({provider})")
        except requests.exceptions.HTTPError as err:
            is_auth_error = False
            try:
                if err.response is not None:
                    if err.response.status_code in (400, 401):
                        err_json = err.response.json()
                        err_desc = err_json.get("error", "")
                        if "invalid_grant" in err_desc or err_json.get("error_description", ""):
                            is_auth_error = True
            except Exception:
                pass

            if is_auth_error or (err.response is not None and err.response.status_code == 400):
                print(f"[oauth-refresh] Token revoked/invalid for {username} ({provider}). Deleting from DB.")
                oauth_store.delete_oauth_tokens(username, provider)
            else:
                print(f"[oauth-refresh] Temporary HTTP error refreshing token for {username} ({provider}): {err}")
        except Exception as e:
            print(f"[oauth-refresh] failed to refresh token for {username} ({provider}): {e}")


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
            conn_row["host"], conn_row["port"], conn_row["imap_username"], password, limit=50
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
        return jsonify({"error": "Missing X-User-Username header"}), 401
    data = request.get_json(silent=True) or {}

    host = data.get("host", "").strip()
    port = data.get("port", 993)
    imap_username = data.get("imap_username", "").strip()
    password = data.get("password", "")
    scan_interval_minutes = data.get("scan_interval_minutes")
    consent = data.get("consent", False)

    if not host or not imap_username or not password:
        return jsonify({"error": "host, imap_username and password are required"}), 400

    if scan_interval_minutes not in imap_store.ALLOWED_INTERVALS:
        return jsonify({"error": f"scan_interval_minutes must be one of {imap_store.ALLOWED_INTERVALS}"}), 400

    if not consent:
        return jsonify({"error": "Explicit consent is required before connecting an inbox"}), 400

    try:
        imap_connector.test_imap_connection(host, port, imap_username, password)
    except imap_connector.ImapAuthError as e:
        return jsonify({"error": f"Could not authenticate with the IMAP server: {e}"}), 401
    except Exception as e:
        return jsonify({"error": f"Could not connect to the IMAP server: {e}"}), 502

    encrypted_password = encrypt_secret(password)
    imap_store.save_connection(username, host, port, imap_username, encrypted_password, scan_interval_minutes)
    _schedule_user_job(username, scan_interval_minutes)

    return jsonify({
        "message": "Inbox connected. Scheduled scanning is now active.",
        "scan_interval_minutes": scan_interval_minutes,
    })


# ============================================
# MAIN
# ============================================

def _env_flag(name, default=False):
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


if __name__ == "__main__":
    FLASK_PORT = int(os.getenv("FLASK_PORT", 5000))
    FLASK_DEBUG = _env_flag("FLASK_DEBUG", default=False)
    FLASK_HOST = os.getenv("FLASK_HOST", "127.0.0.1")

    if FLASK_DEBUG and FLASK_HOST not in ("127.0.0.1", "localhost", "::1"):
        raise SystemExit(
            "Refusing to start: FLASK_DEBUG is enabled while binding to "
            f"'{FLASK_HOST}'. The interactive debugger must never be exposed on "
            "a non-loopback interface."
        )

    app.run(host=FLASK_HOST, port=FLASK_PORT, debug=FLASK_DEBUG)