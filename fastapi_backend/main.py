import os
import joblib
import time
import logging
import numpy as np
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from backend.xai_service import XAIService
from backend.config import FRONTEND_URL, BASE_URL, PORT
from fastapi_backend.pipeline import SpamDetectionPipeline

# ── Configure Logging ──────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("spam_detection_logger")

# ── Resolve model paths relative to this file ────────────────────────────────
# FIX: Use pathlib.Path so the app works regardless of the working directory.
# Previously, hardcoded relative strings like "linear_svm_model.pkl" would
# break whenever the process was not launched from the repo root.
BASE_DIR = Path(__file__).resolve().parent.parent

# ── Load ML models ────────────────────────────────────────────────────────────
# FIX: label_encoder.pkl was never loaded here, causing /predict to return
# a raw integer (0, 1, 2) instead of a human-readable label string like
# "ham", "spam", or "smishing". The frontend's string comparisons
# (result === "ham") would always evaluate to false with the old code.
model         = joblib.load(BASE_DIR / "linear_svm_model.pkl")
vectorizer    = joblib.load(BASE_DIR / "backend" / "tfidf_vectorizer.pkl")
label_encoder = joblib.load(BASE_DIR / "label_encoder.pkl")

# ── Load URL models if they exist ─────────────────────────────────────────────
URL_MODEL_PATH = BASE_DIR / "url_detector.pkl"
URL_VECTORIZER_PATH = BASE_DIR / "backend" / "url_vectorizer.pkl"
if not URL_VECTORIZER_PATH.exists():
    URL_VECTORIZER_PATH = BASE_DIR / "url_vectorizer.pkl"

if URL_MODEL_PATH.exists() and URL_VECTORIZER_PATH.exists():
    url_model = joblib.load(URL_MODEL_PATH)
    url_vectorizer = joblib.load(URL_VECTORIZER_PATH)
else:
    url_model = None
    url_vectorizer = None

URL_LABELS = {0: "safe", 1: "malicious"}
SUSPICIOUS_TLDS = {
    "tk", "ml", "ga", "cf", "gq", "xyz", "top", "work", "click", "loan", "men", "review",
}
import re
from urllib.parse import urlparse
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

xai_service = XAIService(model=model, vectorizer=vectorizer, label_encoder=label_encoder)

# ── Initialize 5-Step Spam Detection Pipeline ──────────────────────────────────
# Try to load XGBoost model if available, otherwise pipeline falls back to SVM
XGBOOST_MODEL_PATH = BASE_DIR / "xgboost_model.pkl"
xgboost_model = None
if XGBOOST_MODEL_PATH.exists():
    try:
        xgboost_model = joblib.load(XGBOOST_MODEL_PATH)
        logger.info("XGBoost model loaded for final classification")
    except Exception as e:
        logger.warning(f"Failed to load XGBoost model: {e}. Falling back to SVM only.")

spam_detection_pipeline = SpamDetectionPipeline(
    svm_model=model,
    tfidf_vectorizer=vectorizer,
    xgboost_model=xgboost_model,
    label_encoder=label_encoder
)

app = FastAPI(title="Spam Detection System")

# ── Share ML objects with routers via app state (Issue #129) ─────────────────
# FastAPI has no Flask-style `current_app`. Routers that need the model,
# vectorizer, or label_encoder (e.g. bulk_predict) read them off
# request.app.state instead of relying on globals or a circular import.
app.state.model = model
app.state.vectorizer = vectorizer
app.state.label_encoder = label_encoder
app.state.pipeline = spam_detection_pipeline

# ── CORS setup ────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_URL,
        os.getenv("FRONTEND_DEV_URL", "http://localhost:3000"),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Logging Middleware ────────────────────────────────────────────────────────
@app.middleware("http")
async def log_requests_middleware(request: Request, call_next):
    start_time = time.time()
    method = request.method
    path = request.url.path
    client_host = request.client.host if request.client else "unknown"
    
    logger.info(f"Incoming request: {method} {path} from {client_host}")

    response = await call_next(request)

    process_time = (time.time() - start_time) * 1000  # Duration in milliseconds
    status_code = response.status_code
    
    logger.info(f"Completed request: {method} {path} | Status: {status_code} | Duration: {process_time:.2f}ms")
    
    # Inject processing metrics into response headers for visibility
    response.headers["X-Process-Time"] = f"{process_time:.2f}ms"
    
    return response

# ── Request schema ────────────────────────────────────────────────────────────
class PredictIn(BaseModel):
    text: str
    type: str

# ── Prediction route ──────────────────────────────────────────────────────────
@app.post("/predict")
def predict(body: PredictIn):
    """
    Classify a message as ham, spam, or smishing.

    Returns:
        prediction (str): Human-readable label — "ham", "spam", or "smishing".
        confidence (float): SVM decision-function score for the winning class.
                            Higher absolute value = more confident prediction.
    """
    try:
        vectorized_text = vectorizer.transform([body.text])

        # Get the raw predicted class index (0, 1, or 2)
        raw_prediction = model.predict(vectorized_text)[0]

        # FIX: Convert class index → string label using the label encoder
        label = label_encoder.inverse_transform([raw_prediction])[0]

        # ENHANCEMENT: Return a confidence score.
        # LinearSVC does not support predict_proba(); use decision_function()
        # instead. The score for each class is its distance from the boundary —
        # a higher value means the model is more certain of that class.
        scores = model.decision_function(vectorized_text)[0]
        confidence = round(float(np.max(scores)), 4)

        return {
            "prediction": label,       # e.g. "ham", "spam", "smishing"
            "confidence": confidence,  # e.g. 1.2345
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

# ── Advanced Pipeline Prediction route (5-step architecture) ──────────────────
@app.post("/predict-pipeline")
def predict_pipeline(body: PredictIn):
    """
    Classify a message using the 5-step Spam Detection Pipeline:
    
    Step 1: Raw Input - Accept raw email text
    Step 2: Text Vectorization - Apply TF-IDF (max_features=2000)
    Step 3: Parallel Processing - Linear SVM + Metadata Extraction
    Step 4: Feature Fusion - Combine spam score + metadata
    Step 5: Final Classification - XGBoost (or SVM fallback)
    
    Returns:
        prediction: Human-readable label ("ham", "spam", "smishing")
        confidence: Confidence score
        spam_score: Spam score from parallel SVM classifier
        metadata: Extracted metadata features
        fused_features: Combined features used for final classification
    """
    try:
        result = spam_detection_pipeline.process(body.text)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

# ── Health / root ─────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {
        "status":   "ok",
        "message":  "Spam Detection API is running",
        "base_url": BASE_URL,
    }

@app.get("/health")
def health():
    return {"status": "healthy"}

# ── Routers ───────────────────────────────────────────────────────────────────
# EMAIL DATABASE ROUTES (Issue #13)
from fastapi_backend.emails import router as emails_router
# from fastapi_backend.database import init_db  # Uncomment once DB is configured
# init_db()
app.include_router(emails_router)

# EXPORT ROUTES (Issue #23)
from fastapi_backend.export import router as export_router
app.include_router(export_router)

# BULK PREDICTION ROUTES (Issue #129)
from fastapi_backend.bulk_predict import router as bulk_predict_router
app.include_router(bulk_predict_router)

# ── Run directly ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("fastapi_backend.main:app", host="0.0.0.0", port=PORT, reload=True)