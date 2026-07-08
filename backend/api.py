from flask import Flask, request, jsonify, g
import csv
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
from filelock import FileLock
import requests
from routes.analytics import analytics_bp
from routes.analytics import record_scan
from flask_limiter import Limiter
from flask_limiter.errors import RateLimitExceeded
from flask_limiter.util import get_remote_address


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


sys.path.insert(0, str(Path(__file__).resolve().parent / "email_connectors"))
from gmail_connector import get_gmail_auth_url, get_gmail_tokens, refresh_gmail_token, fetch_gmail_emails
from outlook_connector import get_outlook_auth_url, get_outlook_tokens, refresh_outlook_token, fetch_outlook_emails
from email_scanner import scan_emails_with_model
import imap_connector
import imap_store
from crypto_utils import encrypt_secret, decrypt_secret, CredentialEncryptionError
from apscheduler.schedulers.background import BackgroundScheduler
load_dotenv()

app = Flask(__name__)

xai_engine = ExplanationEngine()
CORS(app, resources={r"/*": {"origins": "http://localhost:5173"}})

# ── Rate limiting (ML inference protection) ──────────────────────────────────
# Limit expensive prediction endpoints per client IP to mitigate CPU spikes.
# Default: ~50 predictions per minute per IP.
PREDICT_RATE_LIMIT = os.getenv("PREDICT_RATE_LIMIT", "50 per minute")

limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=[PREDICT_RATE_LIMIT],
)

# Flask-Limiter uses a default 429 HTML response; standardize to JSON.
@app.errorhandler(RateLimitExceeded)
def ratelimit_handler(e):
    return jsonify({"error": "Too Many Requests", "rate_limit": PREDICT_RATE_LIMIT}), 429



# Shared secret that the trusted Node/Express backend attaches to every request
# (see the axios interceptor in server.js). Enforcing it on every ML API call
# ensures the model endpoints can't be hit directly by clients that merely have
# network access to the Flask port.
#
# This is mandatory configuration: there is intentionally NO hardcoded fallback,
# because a default baked into source code is public and would defeat the gate
# entirely. The service refuses to start unless a sufficiently long secret is
# supplied via the environment (matching the value the Node service sends).
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
            f"be at least {INTERNAL_SECRET_MIN_LENGTH} characters. Generate a "
            "strong value with "
            "`python -c \"import secrets; print(secrets.token_urlsafe(32))\"`."
        )
    return secret


INTERNAL_SECRET = _load_internal_secret()

# Paths reachable without the internal secret (liveness/readiness probes).
PUBLIC_PATHS = {"/", "/health"}


@app.errorhandler(500)
@app.errorhandler(Exception)
def handle_internal_error(e):
    # Never leak tracebacks or the interactive debugger to clients. Werkzeug
    # HTTP errors (404, 403, ...) keep their own status; everything else is a
    # generic 500 so internal details stay in the server logs only.
    from werkzeug.exceptions import HTTPException
    if isinstance(e, HTTPException):
        return e
    app.logger.exception("Unhandled exception while processing request")
    return jsonify({"error": "Internal server error"}), 500


@app.before_request
def require_internal_secret():
    # During automated tests the gate is off by default so unit tests can call
    # ML routes directly; the dedicated security test opts in by setting
    # app.config["ENFORCE_INTERNAL_SECRET"] = True. In real deployments TESTING
    # is never set, so the gate is always active.
    if app.config.get("TESTING") and not app.config.get("ENFORCE_INTERNAL_SECRET"):
        return None
    # Let CORS preflight requests through; they never carry custom headers.
    if request.method == "OPTIONS":
        return None
    if request.path in PUBLIC_PATHS:
        return None
    provided = request.headers.get("X-Internal-Secret", "")
    # Constant-time comparison avoids leaking the secret via timing.
    if not provided or not hmac.compare_digest(provided, INTERNAL_SECRET):
        return jsonify({
            "error": "Forbidden: requests must originate from the trusted backend"
        }), 403

def internal_endpoint_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if app.config.get("TESTING") and not app.config.get("ENFORCE_INTERNAL_SECRET"):
            return f(*args, **kwargs)
        auth_header = request.headers.get("X-Internal-Secret", "")
        if not auth_header or not hmac.compare_digest(auth_header, INTERNAL_SECRET):
            return jsonify({"error": "Forbidden: requests must originate from the trusted backend"}), 403
        return f(*args, **kwargs)
    return decorated_function
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

# SQLite Persistent Storage for spam words
import sqlite3
from datetime import datetime, timezone

def _db_connection():
    conn = sqlite3.connect(imap_store.DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_spam_words_db():
    with _db_connection() as conn:
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
    with _db_connection() as conn:
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
    with _db_connection() as conn:
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
    with _db_connection() as conn:
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
# url_detector.pkl predicts numeric classes with no bundled label encoder
URL_LABELS = {0: "malicious", 1: "safe"}

# Heuristic checks to catch obviously malicious URL patterns that the
# model is too biased toward "safe" to flag on its own.
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


# Maximum number of characters accepted by the /predict endpoint. Anything
# longer is rejected up front to avoid slow ML inference and memory spikes.
MAX_MESSAGE_LENGTH = int(os.getenv("MAX_MESSAGE_LENGTH", 10000))

OUTPUT_DIR = BASE_DIR / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

FEEDBACK_FILE = OUTPUT_DIR / "feedback_store.csv"
LOG_FILE = OUTPUT_DIR / "api.log"
FEEDBACK_LABELS = set(label_encoder.classes_)


# ==========================================
# DISTRIBUTED TRACING & OBSERVABILITY (Issue #500)
# ==========================================
@app.before_request
def capture_request_id():
    """Extracts the unique Request ID sent from the Node.js API Gateway"""
    # Exclude public paths from strict tracing if needed, but capture if available
    g.request_id = request.headers.get("X-Request-ID", "unknown-ml-req")

@app.errorhandler(Exception)
def handle_global_exception(e):
    """Global error handler that includes the Correlation ID in logs and responses"""
    request_id = getattr(g, 'request_id', 'unknown-ml-req')
    with open(LOG_FILE, "a") as f:
        from datetime import datetime
        f.write(f"{datetime.now()} - [Request-ID: {request_id}] CRITICAL ERROR: {str(e)}\n")
    
    return jsonify({
        "error": "Internal ML Server Error",
        "message": str(e),
        "request_id": request_id
    }), 500

@app.route("/")
def home():
    return "ML API Running 🚀"

@app.route("/health")
def health():
    return jsonify({"status": "ok"})


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
    explanation=None
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
    return response


@app.route("/predict", methods=["POST"])
@limiter.limit(PREDICT_RATE_LIMIT)
def predict():
    # Initialize final_output to prevent NameError/UnboundLocalError in case of early/conditional references
    final_output = None

    try:
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"error": "Request body must be a JSON object"}), 400

        text = data.get("text")

        input_type = data.get("type", "message")

        # Reject missing/empty input.
        if text is None or (isinstance(text, str) and not text.strip()):
            with open(LOG_FILE, "a") as f:
                f.write(f"WARNING: No text provided at {__import__('datetime').datetime.now()}\n")
            return jsonify({"error": "No text provided"}), 400

        # Strict type checking: the message field must be a string.
        if not isinstance(text, str):
            return jsonify({
                "error": f"'text' must be a string, got {type(text).__name__}"
            }), 400

        # Maximum-length validation before any vectorization/inference work.
        if len(text) > MAX_MESSAGE_LENGTH:
            return jsonify({
                "error": (
                    f"'text' exceeds maximum length of {MAX_MESSAGE_LENGTH} "
                    f"characters (got {len(text)})"
                )
            }), 400


        # Translate incoming text to English if it is not in English
        original_text = text
        detected_language = "en"
        translated = False

        # Reject whitespace-only input before it reaches the model: a blank
        # string would otherwise be vectorized to an arbitrary, meaningless
        # label. (Missing/empty text is already handled by the check above.)
        if isinstance(text, str) and not text.strip():
            return jsonify({"error": "No text provided"}), 400


        if input_type != "url" and text.strip():
            try:
                from langdetect import detect, DetectorFactory
                # langdetect is non-deterministic by default: the same text can
                # be detected as different languages across calls, which would
                # translate (or not) inconsistently and flip the final label.
                # A fixed seed makes detection — and thus the prediction —
                # reproducible for identical input.
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

        # Get domain analysis
        domain_analysis = analyze_text(text)

        # Prediction (supports both message and url)
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

        confidence_score = 95.0  # fallback percentage
        decision_score = None
        try:
            active_model = url_model if input_type == "url" else model
            if hasattr(active_model, "predict_proba"):
                proba = active_model.predict_proba(text_vector)
                confidence_score = round(float(max(proba[0])) * 100, 2)
                # Decision score is the raw distance for the winning class
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
                # Convert to pseudo‑probability
                prob = 1.0 / (1.0 + np.exp(-decision_score))
                confidence_score = round(prob * 100, 2)
        except Exception:
            confidence_score = 0.0
            decision_score = None

        # ─── DETERMINE CONFIDENCE LEVEL ───────────────────────────────

        if confidence_score >= 80:
            confidence_level = "high"
            level_color = "green"
            level_emoji = "🟢"
        elif confidence_score >= 60:
            confidence_level = "medium"
            level_color = "yellow"
            level_emoji = "🟡"
        else:
            confidence_level = "low"
            level_color = "red"
            level_emoji = "🔴"

        # Store words if prediction is spam
        if final_output == "spam":
            words = extract_words(text)
            for word in words:
                try:
                    increment_spam_word_frequency(word)
                except Exception as e:
                    print(f"[db-wordcloud] failed to increment word '{word}': {e}")

       # Log prediction with Trace ID
        # Record the scan now that the prediction label is known.
        record_scan(text, final_output, input_type)

        # Log prediction
        text_preview = text[:50] + "..." if len(text) > 50 else text
        with open(LOG_FILE, "a") as f:
            from datetime import datetime
            f.write(f"{datetime.now()} - [Request-ID: {getattr(g, 'request_id', 'unknown')}] Prediction: '{text_preview}' -> {final_output}\n")
        
        # Generate XAI explanation for the input text
        explanation = xai_engine.analyze(text, input_type=input_type)

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
            explanation=explanation
        )

        return jsonify(response_data)

    except Exception as e:
        request_id = getattr(g, 'request_id', 'unknown')
        with open(LOG_FILE, "a") as f:
            from datetime import datetime
            f.write(f"{datetime.now()} - [Request-ID: {request_id}] ERROR: {str(e)}\n")
        return jsonify({"error": str(e), "request_id": request_id}), 500

def extract_words(text):
    """Extract words from text, remove stopwords and punctuation."""
    # Convert to lowercase and remove punctuation
    text = re.sub(r'[^\w\s]', '', text.lower())
    words = text.split()
    
    # Remove stopwords if NLTK available
    if NLTK_AVAILABLE:
        stop_words = set(stopwords.words('english'))
        words = [w for w in words if w not in stop_words and len(w) > 2]
    else:
        # Basic stopword list (fallback)
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


# Common spam words (fallback sample data)
SPAM_WORDS = {
    'free': 145, 'win': 98, 'click': 76, 'urgent': 54, 'prize': 42,
    'limited': 38, 'offer': 35, 'money': 32, 'cash': 28, 'bonus': 25,
    'guaranteed': 22, 'credit': 20, 'loan': 18, 'insurance': 15, 'debt': 14,
    'winner': 14, 'congratulations': 13, 'exclusive': 12, 'opportunity': 10,
    'investment': 9, 'profit': 9, 'earn': 8, 'income': 8, 'million': 7,
    'billion': 6, 'rich': 6, 'secret': 6, 'miracle': 5, 'amazing': 5
}


@app.route('/api/wordcloud', methods=['GET'])
def get_wordcloud():
    """
    Get word frequency data for spam messages.
    Returns top words with frequencies for word cloud visualization.
    """
    try:
        # Try to get stored data
        words_data = get_wordcloud_data()
        
        if words_data:
            return jsonify({
                "success": True,
                "data": words_data,
                "source": "database"
            })
        
        # Fallback to sample data
        sample_data = [{"word": w, "count": c} for w, c in SPAM_WORDS.items()]
        return jsonify({
            "success": True,
            "data": sample_data,
            "source": "sample"
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


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
def get_feature_importance():
    """
    Get global feature importance (top words driving spam/smishing
    classifications), computed via SHAP over the trained model.
    """
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
@internal_endpoint_required
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

@app.route("/analyze-email-header", methods=["POST"])
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
def get_insights():
    try:
        limit = request.args.get("limit", default=10, type=int)
        category = request.args.get("category", default=None, type=str)
        
        from spam_insights import get_spam_insights
        insights = get_spam_insights(limit=limit, category=category)
        return jsonify(insights)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


TOKEN_STORE = {}

@app.route("/gmail/auth-url", methods=["GET"])
def gmail_auth_url():
    redirect_uri = request.args.get("redirect_uri") or "http://localhost:3000/gmail/callback"
    url = get_gmail_auth_url(redirect_uri)
    return jsonify({"auth_url": url})

@app.route("/gmail/callback", methods=["GET"])
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
        if username not in TOKEN_STORE:
            TOKEN_STORE[username] = {}
        TOKEN_STORE[username]["gmail"] = tokens
        return jsonify({"message": "Gmail connected successfully"})
    except Exception as e:
        return jsonify({"error": f"Failed to exchange Google code: {str(e)}"}), 500

@app.route("/gmail/emails", methods=["GET"])
@internal_endpoint_required
def gmail_emails():
    username = _require_username()
    if not username:
        return jsonify({"error": "Missing X-User-Username header"}), 401
    user_tokens = TOKEN_STORE.get(username, {}).get("gmail")
    
    if not user_tokens:
        return jsonify({"error": "Gmail account not connected"}), 401
        
    try:
        try:
            emails = fetch_gmail_emails(user_tokens.get("access_token"), limit=50)
        except requests.exceptions.HTTPError as err:
            if err.response.status_code == 401 and user_tokens.get("refresh_token"):
                new_tokens = refresh_gmail_token(user_tokens["refresh_token"])
                user_tokens["access_token"] = new_tokens["access_token"]
                if "refresh_token" in new_tokens:
                    user_tokens["refresh_token"] = new_tokens["refresh_token"]
                emails = fetch_gmail_emails(user_tokens["access_token"], limit=50)
            else:
                raise err
        return jsonify({"emails": emails})
    except Exception as e:
        return jsonify({"error": f"Failed to fetch Gmail emails: {str(e)}"}), 500

@app.route("/outlook/auth-url", methods=["GET"])
def outlook_auth_url():
    redirect_uri = request.args.get("redirect_uri") or "http://localhost:3000/outlook/callback"
    url = get_outlook_auth_url(redirect_uri)
    return jsonify({"auth_url": url})

@app.route("/outlook/callback", methods=["GET"])
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
        if username not in TOKEN_STORE:
            TOKEN_STORE[username] = {}
        TOKEN_STORE[username]["outlook"] = tokens
        return jsonify({"message": "Outlook connected successfully"})
    except Exception as e:
        return jsonify({"error": f"Failed to exchange Outlook code: {str(e)}"}), 500

@app.route("/outlook/emails", methods=["GET"])
@internal_endpoint_required
def outlook_emails():
    username = _require_username()
    if not username:
        return jsonify({"error": "Missing X-User-Username header"}), 401
    user_tokens = TOKEN_STORE.get(username, {}).get("outlook")
    
    if not user_tokens:
        return jsonify({"error": "Outlook account not connected"}), 401
        
    try:
        try:
            emails = fetch_outlook_emails(user_tokens.get("access_token"), limit=50)
        except requests.exceptions.HTTPError as err:
            if err.response.status_code == 401 and user_tokens.get("refresh_token"):
                new_tokens = refresh_outlook_token(user_tokens["refresh_token"])
                user_tokens["access_token"] = new_tokens["access_token"]
                if "refresh_token" in new_tokens:
                    user_tokens["refresh_token"] = new_tokens["refresh_token"]
                emails = fetch_outlook_emails(user_tokens["access_token"], limit=50)
            else:
                raise err
        return jsonify({"emails": emails})
    except Exception as e:
        return jsonify({"error": f"Failed to fetch Outlook emails: {str(e)}"}), 500

@app.route("/scan-emails", methods=["POST"])
@internal_endpoint_required
def scan_emails_route():
    data = request.get_json(silent=True) or {}
    provider = data.get("provider", "").lower()
    username = _require_username()
    if not username:
        return jsonify({"error": "Missing X-User-Username header"}), 401
    
    if provider not in ("gmail", "outlook"):
        return jsonify({"error": "Invalid provider. Must be 'gmail' or 'outlook'."}), 400
        
    user_tokens = TOKEN_STORE.get(username, {}).get(provider)
    if not user_tokens:
        return jsonify({"error": f"{provider.capitalize()} account not connected."}), 401
        
    try:
        if provider == "gmail":
            try:
                emails = fetch_gmail_emails(user_tokens.get("access_token"), limit=50)
            except requests.exceptions.HTTPError as err:
                if err.response.status_code == 401 and user_tokens.get("refresh_token"):
                    new_tokens = refresh_gmail_token(user_tokens["refresh_token"])
                    user_tokens["access_token"] = new_tokens["access_token"]
                    emails = fetch_gmail_emails(user_tokens["access_token"], limit=50)
                else:
                    raise err
        else:
            try:
                emails = fetch_outlook_emails(user_tokens.get("access_token"), limit=50)
            except requests.exceptions.HTTPError as err:
                if err.response.status_code == 401 and user_tokens.get("refresh_token"):
                    new_tokens = refresh_outlook_token(user_tokens["refresh_token"])
                    user_tokens["access_token"] = new_tokens["access_token"]
                    emails = fetch_outlook_emails(user_tokens["access_token"], limit=50)
                else:
                    raise err
                    
        scan_results = scan_emails_with_model(emails)
        return jsonify(scan_results)
    except Exception as e:
        return jsonify({"error": f"Email scan execution failed: {str(e)}"}), 500


imap_store.init_db()
init_spam_words_db()
scheduler = BackgroundScheduler()
scheduler.start()


def _run_imap_scan(username):
    """Runs inside the scheduler thread: fetches, classifies and persists new emails."""
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


# Re-arm scheduled jobs for connections that were already active before this restart.
for _row in imap_store.get_all_active_connections():
    _schedule_user_job(_row["username"], _row["scan_interval_minutes"])


def _require_username():
    """The Node gateway authenticates the user and forwards their identity via this
    header. We also verify the internal secret for security.
    """
    secret = request.headers.get("X-Internal-Secret", "")
    if not secret or not hmac.compare_digest(secret, INTERNAL_SECRET):
        return None
    username = request.headers.get("X-User-Username")
    if not username:
        return None
    return username


@app.route("/imap/connect", methods=["POST"])
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


@app.route("/imap/status", methods=["GET"])
def imap_status():
    username = _require_username()
    if not username:
        return jsonify({"error": "Missing X-User-Username header"}), 401
    conn_row = imap_store.get_connection(username)
    if not conn_row:
        return jsonify({"connected": False})

    return jsonify({
        "connected": True,
        "host": conn_row["host"],
        "imap_username": conn_row["imap_username"],
        "scan_interval_minutes": conn_row["scan_interval_minutes"],
        "consent_given_at": conn_row["consent_given_at"],
        "last_scan_at": conn_row["last_scan_at"],
    })


@app.route("/imap/schedule", methods=["PUT"])
def imap_schedule():
    username = _require_username()
    if not username:
        return jsonify({"error": "Missing X-User-Username header"}), 401
    data = request.get_json(silent=True) or {}
    scan_interval_minutes = data.get("scan_interval_minutes")

    if scan_interval_minutes not in imap_store.ALLOWED_INTERVALS:
        return jsonify({"error": f"scan_interval_minutes must be one of {imap_store.ALLOWED_INTERVALS}"}), 400

    if not imap_store.get_connection(username):
        return jsonify({"error": "No connected inbox found for this account"}), 404

    imap_store.update_schedule(username, scan_interval_minutes)
    _schedule_user_job(username, scan_interval_minutes)
    return jsonify({"message": "Scan schedule updated", "scan_interval_minutes": scan_interval_minutes})


@app.route("/imap/disconnect", methods=["POST"])
def imap_disconnect():
    username = _require_username()
    if not username:
        return jsonify({"error": "Missing X-User-Username header"}), 401
    if not imap_store.get_connection(username):
        return jsonify({"error": "No connected inbox found for this account"}), 404

    job_id = f"imap_scan_{username}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
    imap_store.delete_connection(username)
    return jsonify({"message": "Inbox disconnected and stored credentials removed."})


@app.route("/imap/scan-now", methods=["POST"])
def imap_scan_now():
    username = _require_username()
    if not username:
        return jsonify({"error": "Missing X-User-Username header"}), 401
    conn_row = imap_store.get_connection(username)
    if not conn_row:
        return jsonify({"error": "No connected inbox found for this account"}), 404

    try:
        password = decrypt_secret(conn_row["encrypted_password"])
    except CredentialEncryptionError as e:
        return jsonify({"error": str(e)}), 500

    try:
        emails = imap_connector.fetch_imap_emails(
            conn_row["host"], conn_row["port"], conn_row["imap_username"], password, limit=50
        )
        scan_results = scan_emails_with_model(emails)
        imap_store.save_scan_results(username, scan_results["emails"])
        imap_store.update_last_scan(username)
        return jsonify(scan_results)
    except imap_connector.ImapAuthError as e:
        return jsonify({"error": f"IMAP authentication failed: {e}"}), 401
    except Exception as e:
        return jsonify({"error": f"Email scan execution failed: {e}"}), 500


@app.route("/imap/scan-results", methods=["GET"])
def imap_scan_results():
    username = _require_username()
    if not username:
        return jsonify({"error": "Missing X-User-Username header"}), 401
    limit = request.args.get("limit", default=100, type=int)
    page = request.args.get("page", default=1, type=int)
    offset = max(0, (page - 1) * limit)
    history = imap_store.get_scan_history(username, limit=limit, offset=offset)
    return jsonify({"results": history, "page": page, "limit": limit})


def _env_flag(name, default=False):
    """Parse a boolean-ish environment variable (1/true/yes/on -> True)."""
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


if __name__ == "__main__":
    FLASK_PORT = int(os.getenv("FLASK_PORT", 5000))
    # Safe defaults: debug OFF and bind to localhost only. Both are opt-in via env.
    FLASK_DEBUG = _env_flag("FLASK_DEBUG", default=False)
    FLASK_HOST = os.getenv("FLASK_HOST", "127.0.0.1")

    # Exposing the Werkzeug debugger on a network-reachable interface allows
    # arbitrary remote code execution, so refuse this unsafe combination.
    if FLASK_DEBUG and FLASK_HOST not in ("127.0.0.1", "localhost", "::1"):
        raise SystemExit(
            "Refusing to start: FLASK_DEBUG is enabled while binding to "
            f"'{FLASK_HOST}'. The interactive debugger must never be exposed on "
            "a non-loopback interface. Set FLASK_HOST=127.0.0.1 or disable "
            "FLASK_DEBUG."
        )

    app.run(host=FLASK_HOST, port=FLASK_PORT, debug=FLASK_DEBUG)