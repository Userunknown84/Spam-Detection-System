import re
from typing import Dict, List


class ExplanationEngine:
    """Explainable AI engine for spam prediction text analysis."""

    URL_PATTERN = re.compile(r"https?://[^\s]+|www\.[^\s]+", re.IGNORECASE)
    SHORT_URL_PATTERN = re.compile(
        r"\b(?:bit\.ly|tinyurl\.com|goo\.gl|ow\.ly|t\.co|is\.gd|buff\.ly|rb\.gy|shorte\.st|lnkd\.in|qr\.ae)\b",
        re.IGNORECASE,
    )
    PHONE_PATTERN = re.compile(r"\b(?:\+?\d[\d\s().-]{7,}\d)\b")
    EMOJI_PATTERN = re.compile("[\U0001F300-\U0001FAFF\U00002600-\U000027BF]+")
    EXCESSIVE_PUNCTUATION_PATTERN = re.compile(r"([!?])\1{1,}|\.{3,}|[,;:]{3,}")
    WORD_PATTERN = re.compile(r"\b[\w']+\b")
    SUSPICIOUS_TLDS = {
        "tk",
        "ml",
        "ga",
        "cf",
        "gq",
        "xyz",
        "top",
        "click",
        "loan",
        "men",
        "review",
        "work",
        "party",
        "kim",
        "cricket",
        "trade",
    }

    PROMOTIONAL_KEYWORDS = [
        "free",
        "offer",
        "winner",
        "claim",
        "reward",
        "discount",
        "sale",
        "exclusive",
        "limited",
        "buy now",
        "shop now",
        "congratulations",
    ]

    FINANCIAL_KEYWORDS = [
        "bank",
        "account",
        "loan",
        "salary",
        "credit",
        "debit",
        "payment",
        "transfer",
        "invoice",
        "refund",
    ]

    BANKING_KEYWORDS = [
        "atm",
        "online banking",
        "account number",
        "pin",
        "password",
        "verify your account",
        "bank account",
        "security alert",
    ]

    OTP_KEYWORDS = [
        "otp",
        "one-time password",
        "verification code",
        "auth code",
        "secure code",
    ]

    CRYPTO_KEYWORDS = [
        "bitcoin",
        "crypto",
        "ethereum",
        "wallet",
        "blockchain",
        "token",
        "invest",
        "mining",
        "btc",
        "ethereum",
    ]

    LOTTERY_KEYWORDS = [
        "lottery",
        "jackpot",
        "prize",
        "draw",
        "winning",
        "million",
        "rich",
    ]

    URGENCY_KEYWORDS = [
        "urgent",
        "immediately",
        "now",
        "asap",
        "act fast",
        "limited time",
        "don’t miss",
        "final notice",
        "today only",
        "last chance",
    ]

    THREAT_KEYWORDS = [
        "suspend",
        "cancel",
        "blocked",
        "danger",
        "warning",
        "legal action",
        "unauthorized",
        "risk",
        "compromise",
    ]

    SUSPICIOUS_PHRASES = [
        "click here",
        "verify now",
        "confirm your identity",
        "receive money",
        "urgent action required",
        "account suspended",
        "payment failed",
    ]

    def __init__(self, extra_keywords: Dict[str, List[str]] = None):
        self.extra_keywords = extra_keywords or {}

    def _find_keywords(self, text: str, keywords: List[str]) -> List[str]:
        found = []
        for token in keywords:
            pattern = rf"\b{re.escape(token)}\b"
            if re.search(pattern, text, re.IGNORECASE):
                found.append(token)
        return found

    def _find_suspicious_domain(self, text: str) -> bool:
        matches = re.findall(r"\b(?:[a-zA-Z0-9-]+\.)+(?:[a-zA-Z]{2,})\b", text)
        for domain in matches:
            if domain.split(".")[-1].lower() in self.SUSPICIOUS_TLDS:
                return True
        return False

    def _count_excessive_caps(self, text: str) -> bool:
        words = self.WORD_PATTERN.findall(text)
        all_caps = [word for word in words if len(word) >= 3 and word.isupper()]
        return len(all_caps) >= 2

    def analyze(self, text: str, input_type: str = "message") -> Dict:
        normalized = text.strip()
        lower = normalized.lower()

        reasons = []
        matched_keywords = []
        spam_patterns = {
            "urls": False,
            "capitalization": False,
            "punctuation": False,
            "urgency": False,
            "promotional": False,
            "financial": False,
            "banking": False,
            "otp": False,
            "crypto": False,
            "lottery": False,
            "threat": False,
            "emoji": False,
            "suspicious_domain": False,
            "phone_number": False,
            "shortened_url": False,
        }

        if self.URL_PATTERN.search(normalized):
            spam_patterns["urls"] = True
            reasons.append("Suspicious URL detected")

        if self.SHORT_URL_PATTERN.search(lower):
            spam_patterns["shortened_url"] = True
            reasons.append("Shortened URL detected")

        if self._find_suspicious_domain(lower):
            spam_patterns["suspicious_domain"] = True
            reasons.append("Suspicious domain detected")

        if self.EXCESSIVE_PUNCTUATION_PATTERN.search(normalized):
            spam_patterns["punctuation"] = True
            reasons.append("Repeated punctuation detected")

        if self._count_excessive_caps(normalized):
            spam_patterns["capitalization"] = True
            reasons.append("Excessive capitalization detected")

        if self.EMOJI_PATTERN.search(normalized):
            spam_patterns["emoji"] = True
            reasons.append("Emoji abuse detected")

        if self.PHONE_PATTERN.search(normalized):
            spam_patterns["phone_number"] = True
            reasons.append("Phone number or contact prompt detected")

        promotional = self._find_keywords(lower, self.PROMOTIONAL_KEYWORDS)
        if promotional:
            spam_patterns["promotional"] = True
            reasons.append("Promotional keywords found")
            matched_keywords.extend(promotional)

        financial = self._find_keywords(lower, self.FINANCIAL_KEYWORDS)
        if financial:
            spam_patterns["financial"] = True
            reasons.append("Financial scam language detected")
            matched_keywords.extend(financial)

        banking = self._find_keywords(lower, self.BANKING_KEYWORDS)
        if banking:
            spam_patterns["banking"] = True
            reasons.append("Banking scam language detected")
            matched_keywords.extend(banking)

        otp = self._find_keywords(lower, self.OTP_KEYWORDS)
        if otp:
            spam_patterns["otp"] = True
            reasons.append("OTP or verification scam detected")
            matched_keywords.extend(otp)

        crypto = self._find_keywords(lower, self.CRYPTO_KEYWORDS)
        if crypto:
            spam_patterns["crypto"] = True
            reasons.append("Crypto scam language detected")
            matched_keywords.extend(crypto)

        lottery = self._find_keywords(lower, self.LOTTERY_KEYWORDS)
        if lottery:
            spam_patterns["lottery"] = True
            reasons.append("Lottery or prize language detected")
            matched_keywords.extend(lottery)

        urgency = self._find_keywords(lower, self.URGENCY_KEYWORDS)
        if urgency:
            spam_patterns["urgency"] = True
            reasons.append("Urgency language detected")
            matched_keywords.extend(urgency)

        threat = self._find_keywords(lower, self.THREAT_KEYWORDS)
        if threat:
            spam_patterns["threat"] = True
            reasons.append("Threat language detected")
            matched_keywords.extend(threat)

        suspicious_phrases = self._find_keywords(lower, self.SUSPICIOUS_PHRASES)
        if suspicious_phrases:
            matched_keywords.extend(suspicious_phrases)
            reasons.append("Suspicious phrase detected")

        for custom_category, keywords in self.extra_keywords.items():
            extra_matches = self._find_keywords(lower, keywords)
            if extra_matches:
                matched_keywords.extend(extra_matches)
                reasons.append(f"{custom_category.replace('_', ' ').capitalize()} detected")

        unique_reasons = list(dict.fromkeys(reasons))
        unique_keywords = sorted(set(matched_keywords))

        weights = {
            "urls": 18,
            "shortened_url": 12,
            "suspicious_domain": 14,
            "capitalization": 8,
            "punctuation": 8,
            "urgency": 12,
            "promotional": 10,
            "financial": 11,
            "banking": 11,
            "otp": 11,
            "crypto": 10,
            "lottery": 10,
            "threat": 12,
            "emoji": 5,
            "phone_number": 8,
        }

        score = 0
        for pattern, triggered in spam_patterns.items():
            if triggered:
                score += weights.get(pattern, 0)

        score += min(12, len(unique_keywords) * 2)
        score = min(max(score, 0), 100)

        explanation = {
            "score": score,
            "reasons": unique_reasons,
            "matched_keywords": unique_keywords,
            "spam_patterns": spam_patterns,
            "num_indicators": len(unique_reasons),
            "top_indicators": unique_reasons[:5],
            "summary": f"{len(unique_reasons)} indicators triggered",
        }

        return explanation
