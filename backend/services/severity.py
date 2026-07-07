import re
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

try:
    from backend.email_header_analyzer import analyze_headers
except ImportError:  # pragma: no cover - supports direct script execution
    from email_header_analyzer import analyze_headers

SUSPICIOUS_URL_PATTERN = re.compile(
    r"https?://(?:www\.)?(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|lnkd\.in)/",
    re.IGNORECASE,
)
URL_PATTERN = re.compile(r"https?://[^\s]+", re.IGNORECASE)
CREDENTIAL_THEFT_WORDS = (
    "password",
    "login",
    "verify account",
    "otp",
    "bank account",
    "update payment",
)
URGENCY_WORDS = ("now", "immediately", "urgent", "final notice")
FINANCIAL_REWARD_WORDS = ("prize", "lottery", "reward", "winner")
THREAT_LANGUAGE_WORDS = ("account suspended", "legal action", "blocked")
PHONE_CALLBACK_PATTERN = re.compile(r"\b(?:\+?\d[\d(). -]{7,}\d)\b")
SUSPICIOUS_TLDS = {"tk", "ml", "ga", "cf", "gq", "xyz", "top", "work", "click", "loan", "men", "review"}
HEADER_RISK_WEIGHTS = {
    "trusted": 0.0,
    "suspicious": 2.0,
    "high risk": 4.0,
}


def _contains_any(text: str, phrases: tuple[str, ...]) -> bool:
    lowered = text.lower()
    return any(phrase in lowered for phrase in phrases)


def _is_many_capitals(text: str) -> bool:
    letters = [char for char in text if char.isalpha()]
    if not letters:
        return False
    uppercase_ratio = sum(1 for char in letters if char.isupper()) / len(letters)
    return uppercase_ratio > 0.25 and len(letters) >= 8


def _has_many_punctuation(text: str) -> bool:
    punctuation_count = sum(1 for char in text if char in "!?.,;:")
    return punctuation_count >= 5


def _extract_domains(text: str) -> List[str]:
    domains: List[str] = []
    for match in URL_PATTERN.finditer(text):
        parsed = urlparse(match.group(0))
        host = parsed.hostname or ""
        if host:
            domains.append(host.lower())
    return domains


def _detect_header_risk(text: str, input_type: str) -> Optional[str]:
    if input_type == "email" or re.search(r"(?im)^(from|return-path|subject|received|dkim-signature|authentication-results):", text):
        try:
            analysis = analyze_headers(text)
            return str(analysis.get("risk_level", "")).strip().lower()
        except Exception:
            return None
    return None


def calculate_spam_severity(text: str, input_type: str = "message", header_risk: Optional[str] = None) -> Dict[str, Any]:
    """Calculate an independent severity score for spam-like content."""
    if not text or not text.strip():
        return {
            "score": 0.0,
            "level": "Low",
            "color": "green",
            "indicators": [],
            "breakdown": {},
        }

    normalized_text = text.strip()
    breakdown: Dict[str, float] = {}
    indicators: List[str] = []
    score = 0.0

    if URL_PATTERN.search(normalized_text):
        score += 3.0
        breakdown["url"] = 3.0
        indicators.append("Suspicious URL")

    if SUSPICIOUS_URL_PATTERN.search(normalized_text):
        score += 2.0
        breakdown["shortened_url"] = 2.0
        indicators.append("Shortened URL")

    if _contains_any(normalized_text, CREDENTIAL_THEFT_WORDS):
        score += 2.0
        breakdown["credentials"] = 2.0
        indicators.append("Credential Theft Keywords")

    if _contains_any(normalized_text, URGENCY_WORDS):
        score += 1.5
        breakdown["urgency"] = 1.5
        indicators.append("Urgent Language")

    if _contains_any(normalized_text, FINANCIAL_REWARD_WORDS):
        score += 1.0
        breakdown["financial"] = 1.0
        indicators.append("Financial Reward Language")

    if _contains_any(normalized_text, THREAT_LANGUAGE_WORDS):
        score += 2.0
        breakdown["threat"] = 2.0
        indicators.append("Threat Language")

    if _is_many_capitals(normalized_text):
        score += 1.0
        breakdown["caps"] = 1.0
        indicators.append("Many Capital Letters")

    if _has_many_punctuation(normalized_text):
        score += 0.5
        breakdown["punctuation"] = 0.5
        indicators.append("Many Punctuation Marks")

    if PHONE_CALLBACK_PATTERN.search(normalized_text) and _contains_any(normalized_text, ("call", "callback", "contact", "reply")):
        score += 1.0
        breakdown["callback"] = 1.0
        indicators.append("Phone Callback Request")

    for domain in _extract_domains(normalized_text):
        if any(domain.endswith(suspicious_tld) for suspicious_tld in SUSPICIOUS_TLDS):
            score += 2.0
            breakdown["domain"] = 2.0
            indicators.append("Suspicious Domain")
            break

    resolved_header_risk = header_risk or _detect_header_risk(normalized_text, input_type)
    if resolved_header_risk:
        header_weight = HEADER_RISK_WEIGHTS.get(resolved_header_risk.lower(), 0.0)
        if header_weight:
            score += header_weight
            breakdown["headers"] = header_weight
            indicators.append("Email Header Risk")

    score = round(min(max(score, 0.0), 10.0), 1)
    if score < 2.0:
        level = "Low"
        color = "green"
    elif score < 5.0:
        level = "Moderate"
        color = "yellow"
    elif score < 8.0:
        level = "High"
        color = "orange"
    else:
        level = "Critical"
        color = "red"

    if len(indicators) >= 3:
        indicators.append("Multiple Spam Signals")

    return {
        "score": score,
        "level": level,
        "color": color,
        "indicators": indicators,
        "breakdown": breakdown,
    }
