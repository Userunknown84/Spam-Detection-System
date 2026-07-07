from flask import Flask,request,jsonify
import os
import joblib
import re
from collections import Counter
from datetime import datetime
from dotenv import load_dotenv
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from backend.services.severity import calculate_spam_severity

load_dotenv()

app=Flask(__name__)

# ─── RATE LIMITER ────────────────────────────────────────────────
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
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


# ─── PREDICT ENDPOINT ────────────────────────────────────────────
@app.route("/predict", methods=["POST"])
@limiter.limit("10 per minute")
def predict():
    try:
        data = request.get_json()
        text = data.get("text")
        
        if not text:
            with open("api.log", "a") as f:
                f.write(f"WARNING: No text provided at {datetime.now()}\n")
            return jsonify({"error": "No text provided"}), 400

        text_vector = vectorizer.transform([text])
        prediction = model.predict(text_vector)
        final_output = label_encoder.inverse_transform(prediction)[0]

        severity = calculate_spam_severity(text)

        with open("api.log", "a") as f:
            f.write(f"{datetime.now()} - Prediction: '{text[:50]}...' -> {final_output}\n")
            
        return jsonify({"input": text, "prediction": final_output, "severity": severity})

    except Exception as e:
        with open("api.log", "a") as f:
            f.write(f"{datetime.now()} - ERROR: {str(e)}\n")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    FLASK_PORT = int(os.getenv("FLASK_PORT", 5000))
    app.run(host="0.0.0.0", port=FLASK_PORT, debug=True)

