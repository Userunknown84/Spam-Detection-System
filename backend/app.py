import time
import logging
from logging.handlers import RotatingFileHandler
from flask import request, g
from flask import Flask,request,jsonify
import os
import csv
import joblib
import re
from collections import Counter
from datetime import datetime
from dotenv import load_dotenv
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import numpy as np
from utils.spamSeverity import calculate_spam_severity

load_dotenv()

app=Flask(__name__)

# ─── LOGGING CONFIGURATION ──────────────────────────────────────
log_handler = RotatingFileHandler('api.log', maxBytes=10485760, backupCount=5)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        log_handler,
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)
app.logger.addHandler(log_handler)

# ─── REQUEST LOGGING MIDDLEWARE ────────────────────────────────
@app.before_request
def start_timer():
    g.start = time.time()
    g.client_ip = request.remote_addr

@app.after_request
def log_request(response):
    duration = time.time() - g.start
    logger.info(f"{request.method} {request.path} → {response.status_code} ({duration:.3f}s) from {g.client_ip}")
    return response

# ─── RATE LIMITER ────────────────────────────────────────────────
def get_forwarded_address():
    return request.headers.get("X-Forwarded-For", request.remote_addr)

limiter = Limiter(
    app=app,
    key_func=get_forwarded_address,
    default_limits=["10 per minute"],
    storage_uri="memory://",
    strategy="fixed-window",
)

# ─── RATE LIMIT ERROR HANDLER ──────────────────────────────────
@app.errorhandler(429)
def ratelimit_handler(e):
    return jsonify({
        "error": "rate_limit_exceeded",
        "message": "Too many requests. Limit is 10 per minute. Please try again in 60 seconds.",
        "retry_after": 60
    }), 429 

FEEDBACK_FILE = 'feedback_store.csv'

def ensure_feedback_file():
    if not os.path.exists(FEEDBACK_FILE):
        with open(FEEDBACK_FILE, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['text', 'predicted_label', 'correct_label', 'submitted_at'])

# ─── LOAD MODELS ────────────────────────────────────────────────
MODEL_PATH=os.getenv("MODEL_PATH")
VECTORIZER_PATH=os.getenv("VECTORIZER_PATH")
LABEL_ENCODER_PATH = os.getenv("LABEL_ENCODER_PATH")

if not MODEL_PATH or not VECTORIZER_PATH or not LABEL_ENCODER_PATH:
    raise ValueError("Required environment variables are missing")

model = joblib.load(MODEL_PATH)
vectorizer = joblib.load(VECTORIZER_PATH)
label_encoder = joblib.load(LABEL_ENCODER_PATH)


@app.route("/")
def home():
    return "ML API Running 🚀"


# ─── HEALTH CHECK ENDPOINT ───────────────────────────────────────
@app.route("/health", methods=["GET"])
def health_check():
    """Check if the API and all components are healthy."""
    status = {
        "status": "healthy",
        "model_loaded": model is not None,
        "vectorizer_loaded": vectorizer is not None,
        "label_encoder_loaded": label_encoder is not None,
        "timestamp": datetime.now().isoformat()
    }
    
    # Check if all components are loaded
    if not status["model_loaded"] or not status["vectorizer_loaded"] or not status["label_encoder_loaded"]:
        status["status"] = "degraded"
        status["message"] = "One or more components failed to load"
        return jsonify(status), 503
    
    # Check if model can predict (optional smoke test)
    try:
        test_result = model.predict(vectorizer.transform(["test"]))
        status["smoke_test"] = "passed"
    except Exception as e:
        status["smoke_test"] = "failed"
        status["smoke_test_error"] = str(e)
        status["status"] = "degraded"
        return jsonify(status), 503
    
    return jsonify(status), 200


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


# ─── PREDICT ENDPOINT ────────────────────────────────────────────
@app.route("/predict", methods=["POST"])
@limiter.limit("10 per minute")
def predict():
    try:
        data = request.get_json()
        text = data.get("text")
        
        if not text:
            logger.warning("No text provided for prediction")
            return jsonify({"error": "No text provided"}), 400

        # Translate incoming text to English if it is not in English
        original_text = text
        detected_language = "en"
        translated = False
        
        if text.strip():
            try:
                from langdetect import detect
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

        text_vector = vectorizer.transform([text])
        prediction = model.predict(text_vector)
        final_output = label_encoder.inverse_transform(prediction)[0]

        logger.info(f"Prediction: '{text[:50]}...' -> {final_output}")
            
        import numpy as np
        decision_score = None
        confidence_score = 95.0
        try:
            if hasattr(model, "decision_function"):
                decision = model.decision_function(text_vector)
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

        if confidence_score >= 80:
            confidence_level = "high"
        elif confidence_score >= 60:
            confidence_level = "medium"
        else:
            confidence_level = "low"

        response_data = make_prediction_response(
            input_text=original_text,
            result=final_output,
            confidence_score=confidence_score,
            decision_score=decision_score,
            confidence_level=confidence_level,
            detected_language=detected_language,
            translated=translated,
            translated_text=text if translated else None,
            severity=calculate_spam_severity(original_text)
        )
        return jsonify(response_data)

    except Exception as e:
        logger.error(f"Prediction error: {str(e)}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    FLASK_PORT = int(os.getenv("FLASK_PORT", 5000))
    app.run(host="0.0.0.0", port=FLASK_PORT, debug=True)

