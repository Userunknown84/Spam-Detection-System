import os
import joblib
import time
import logging
import numpy as np
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from fastapi.middleware.cors import CORSMiddleware
from backend.xai_service import XAIService
from backend.explanation_engine import ExplanationEngine
from backend.config import FRONTEND_URL, BASE_URL, PORT

# ── Configure Logging ──────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("spam_detection_logger")

# ── Resolve model paths relative to this file ────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent

# ── Load ML models ────────────────────────────────────────────────────────────
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

URL_LABELS = {0: "malicious", 1: "safe"}
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
xai_engine = ExplanationEngine()

app = FastAPI(title="Spam Detection System")

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
import os
import logging
from fastapi.responses import JSONResponse

# ── Internal secret gate ──────────────────────────────────────────────────────
INTERNAL_SECRET_MIN_LENGTH = 32

def _load_internal_secret() -> str:
    secret = os.getenv("INTERNAL_SECRET")
    if not secret:
        raise RuntimeError(
            "INTERNAL_SECRET is not set. This shared secret authenticates "
            "requests from the trusted backend and is mandatory. Generate "
            "one with `python -c \"import secrets; print(secrets.token_urlsafe(32))\"` "
            "and set it (identically) for both the Node and FastAPI services."
        )
    if len(secret) < INTERNAL_SECRET_MIN_LENGTH:
        raise RuntimeError(
            f"INTERNAL_SECRET is too short ({len(secret)} characters); it must be at least {INTERNAL_SECRET_MIN_LENGTH} characters."
        )
    return secret

INTERNAL_SECRET = _load_internal_secret()
PUBLIC_PATHS = {"/", "/health"}

import secrets

@app.middleware("http")
async def enforce_internal_secret(request: Request, call_next):
    # Allow CORS preflight and public health checks
    if request.method == "OPTIONS" or request.url.path in PUBLIC_PATHS:
        return await call_next(request)
    provided = request.headers.get("X-Internal-Secret")
    if not provided or not secrets.compare_digest(provided, INTERNAL_SECRET):
        return JSONResponse(status_code=403, content={"error": "Forbidden: requests must originate from the trusted backend"})
    return await call_next(request)

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

class PredictionResponse(BaseModel):
    input: str
    result: str
    prediction: str
    confidence: float
    confidence_score: float
    decision_score: Optional[float] = None
    confidence_level: str
    detected_language: Optional[str] = "en"
    translated: Optional[bool] = False
    translated_text: Optional[str] = None
    domain_analysis: Optional[Dict[str, Any]] = None
    explanation: Optional[Dict[str, Any]] = None

# ── Prediction route ──────────────────────────────────────────────────────────
@app.post("/predict", response_model=PredictionResponse)
def predict(body: PredictIn):
    """
    Classify a message as ham, spam, or smishing.
    """
    try:
        input_type = body.type.lower()
        if input_type == "url":
            if not url_model or not url_vectorizer:
                raise HTTPException(status_code=500, detail="URL model or vectorizer not loaded.")
            
            vectorized_text = url_vectorizer.transform([body.text])
            raw_prediction = url_model.predict(vectorized_text)[0]
            label = URL_LABELS.get(int(raw_prediction), "unknown")
            if label == "safe" and heuristic_url_is_malicious(body.text):
                label = "malicious"
            
            # Compute confidence score
            decision_score = None
            confidence_score = 95.0
            if hasattr(url_model, "predict_proba"):
                proba = url_model.predict_proba(vectorized_text)
                confidence_score = round(float(max(proba[0])) * 100, 2)
                decision = url_model.decision_function(vectorized_text)
                if isinstance(decision, np.ndarray):
                    decision_score = float(np.max(np.abs(decision)))
                else:
                    decision_score = float(abs(decision))
            elif hasattr(url_model, "decision_function"):
                decision = url_model.decision_function(vectorized_text)
                if isinstance(decision, np.ndarray):
                    decision_score = float(np.max(np.abs(decision)))
                else:
                    decision_score = float(abs(decision))
                prob = 1.0 / (1.0 + np.exp(-decision_score))
                confidence_score = round(prob * 100, 2)
                
            explanation = None
            domain_analysis = None
        else:
            vectorized_text = vectorizer.transform([body.text])
            raw_prediction = model.predict(vectorized_text)[0]
            label = label_encoder.inverse_transform([raw_prediction])[0]
            
            decision_score = None
            confidence_score = 95.0
            if hasattr(model, "decision_function"):
                decision = model.decision_function(vectorized_text)
                if isinstance(decision, np.ndarray):
                    decision_score = float(np.max(np.abs(decision)))
                else:
                    decision_score = float(abs(decision))
                prob = 1.0 / (1.0 + np.exp(-decision_score))
                confidence_score = round(prob * 100, 2)
            
            try:
                explanation = xai_engine.analyze(body.text, input_type=input_type)
            except Exception:
                explanation = None
            domain_analysis = None

        if confidence_score >= 80:
            confidence_level = "high"
        elif confidence_score >= 60:
            confidence_level = "medium"
        else:
            confidence_level = "low"
            
        return {
            "input": body.text,
            "result": label,
            "prediction": label,
            "confidence": round(confidence_score / 100.0, 4),
            "confidence_score": confidence_score,
            "decision_score": decision_score,
            "confidence_level": confidence_level,
            "detected_language": "en",
            "translated": False,
            "domain_analysis": domain_analysis,
            "explanation": explanation
        }
    except HTTPException:
        raise
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

# ── Run directly ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("fastapi_backend.main:app", host="0.0.0.0", port=PORT, reload=True)