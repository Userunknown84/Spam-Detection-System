import csv
import os
import re
from collections import Counter

# Custom stop words list
STOP_WORDS = {
    "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours", 
    "yourself", "yourselves", "he", "him", "his", "himself", "she", "her", "hers", 
    "herself", "it", "its", "itself", "they", "them", "their", "theirs", "themselves", 
    "what", "which", "who", "whom", "this", "that", "these", "those", "am", "is", "are", 
    "was", "were", "be", "been", "being", "have", "has", "had", "having", "do", "does", 
    "did", "doing", "a", "an", "the", "and", "but", "if", "or", "because", "as", "until", 
    "while", "of", "at", "by", "for", "with", "about", "against", "between", "into", 
    "through", "during", "before", "after", "above", "below", "to", "from", "up", "down", 
    "in", "out", "on", "off", "over", "under", "again", "further", "then", "once", "here", 
    "there", "when", "where", "why", "how", "all", "any", "both", "each", "few", "more", 
    "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", 
    "than", "too", "very", "s", "t", "can", "will", "just", "don", "should", "now",
    "get", "would", "could", "should", "send", "received"
}

# Fallback statistics data
FALLBACK_KEYWORDS = {
    "spam": [
        {"keyword": "free", "count": 45},
        {"keyword": "prize", "count": 35},
        {"keyword": "winner", "count": 30},
        {"keyword": "claim", "count": 28},
        {"keyword": "offer", "count": 25},
        {"keyword": "urgent", "count": 22},
        {"keyword": "guaranteed", "count": 19},
        {"keyword": "cash", "count": 18},
        {"keyword": "bonus", "count": 15},
        {"keyword": "now", "count": 14}
    ],
    "smishing": [
        {"keyword": "otp", "count": 40},
        {"keyword": "verify", "count": 38},
        {"keyword": "bank", "count": 35},
        {"keyword": "account", "count": 32},
        {"keyword": "suspended", "count": 28},
        {"keyword": "login", "count": 25},
        {"keyword": "secure", "count": 22},
        {"keyword": "alert", "count": 20},
        {"keyword": "update", "count": 19},
        {"keyword": "link", "count": 17}
    ],
    "offensive": [
        {"keyword": "hate", "count": 15},
        {"keyword": "trash", "count": 12},
        {"keyword": "stupid", "count": 10},
        {"keyword": "abusive", "count": 8},
        {"keyword": "fake", "count": 7}
    ]
}

FALLBACK_PHRASES = [
    {"phrase": "click here now", "count": 25},
    {"phrase": "claim your prize", "count": 20},
    {"phrase": "urgent account update", "count": 18},
    {"phrase": "verify your identity", "count": 15},
    {"phrase": "congratulations you won", "count": 12},
    {"phrase": "action required immediately", "count": 10},
    {"phrase": "unsecured crypto giveaway", "count": 8},
    {"phrase": "reset your password", "count": 7}
]

FALLBACK_SUSPICIOUS_TERMS = [
    "crypto giveaway",
    "verify wallet",
    "account suspended",
    "urgent action required",
    "claim bonus reward",
    "confirm credit card",
    "unauthorized login attempt",
    "exclusive cashback offer"
]

FALLBACK_CATEGORY_INDICATORS = {
    "spam": ["free", "prize", "winner", "offer", "claim"],
    "smishing": ["otp", "verify", "bank", "account", "login"],
    "offensive": ["abusive", "hate", "trash", "stupid", "fake"]
}

def tokenize(text):
    """Lowercases text and extracts alphabetical words of length >= 3."""
    if not text:
        return []
    return re.findall(r'\b[a-z]{3,}\b', text.lower())

def load_data():
    """Loads text classifications from feedback store and dataset."""
    messages = []
    
    # Try feedback_store.csv in backend directory
    base_dir = os.path.dirname(__file__)
    feedback_path = os.path.join(base_dir, "output", "feedback_store.csv")
    if os.path.isfile(feedback_path):
        try:
            with open(feedback_path, newline="", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    text = row.get("text")
                    # Prefer corrected label if user supplied it, otherwise fallback to predicted
                    category = row.get("correct_label") or row.get("predicted_label")
                    if text and category:
                        messages.append({
                            "text": text.strip(),
                            "category": category.strip().lower()
                        })
        except Exception:
            pass
            
    # Try dataset.csv in backend directory or workspace root
    dataset_paths = [
        os.path.join(base_dir, "dataset.csv"),
        os.path.join(os.path.dirname(base_dir), "dataset.csv")
    ]
    for path in dataset_paths:
        if os.path.isfile(path):
            try:
                with open(path, newline="", encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        text = row.get("text") or row.get("message")
                        category = row.get("label")
                        if text and category:
                            messages.append({
                                "text": text.strip(),
                                "category": category.strip().lower()
                            })
                break  # Stop after loading the first found dataset
            except Exception:
                pass
                
    return messages

import threading
import time
import hashlib
import json
from collections import OrderedDict

# Configuration
_MAX_CACHE_ENTRIES = int(os.getenv("SPAM_INSIGHTS_MAX_CACHE_ENTRIES", "5"))
_CACHE_TTL_SECONDS = int(os.getenv("SPAM_INSIGHTS_CACHE_TTL_SECONDS", "60"))

# Helper to compute a lightweight file hash based on size and mtime
def _hash_file(path: str) -> str:
    try:
        stat = os.stat(path)
        identifier = f"{stat.st_size}-{int(stat.st_mtime)}"
        return hashlib.sha256(identifier.encode()).hexdigest()
    except OSError:
        return ""

# In‑process cache holding multiple entries identified by a source hash
_CACHE_LOCK = threading.Lock()
_CACHE = {
    "entries": OrderedDict()  # source_hash -> {"expires_at", "mtimes", "messages", "aggregates"}
}

def _get_source_paths():
    base_dir = os.path.dirname(__file__)
    feedback_path = os.path.join(base_dir, "output", "feedback_store.csv")
    dataset_paths = [
        os.path.join(base_dir, "dataset.csv"),
        os.path.join(os.path.dirname(base_dir), "dataset.csv"),
    ]
    dataset_path = next((p for p in dataset_paths if os.path.isfile(p)), dataset_paths[0])
    return feedback_path, dataset_path


def _get_mtime_or_none(path):
    try:
        return os.path.getmtime(path)
    except OSError:
        return None


def _tokenize_cached_messages(messages):
    # Pre-tokenize to avoid re-tokenizing for each category/limit.
    tokenized = []
    for m in messages:
        tokens = tokenize(m.get("text", ""))
        # Apply stopword filtering once.
        tokens_filtered = [w for w in tokens if w not in STOP_WORDS]
        tokenized.append({"category": (m.get("category") or "").lower(), "text": m.get("text", ""), "words": tokens_filtered})
    return tokenized


def _compute_aggregates(messages):
    """Compute full aggregates once, then serve per-request slices."""
    tokenized = _tokenize_cached_messages(messages)

    def filter_msgs(cat):
        if cat:
            cat_l = cat.lower()
            return [m for m in tokenized if m["category"] == cat_l]
        # Exclude ham/safe by default
        return [m for m in tokenized if m["category"] not in ("ham", "safe")]

    aggregates = {}

    # Overall / default aggregations (category=None)
    overall_msgs = filter_msgs(None)

    # Category-specific indicator (always based on full messages list)
    category_indicators = {}
    for cat in ("spam", "smishing", "offensive"):
        cat_msgs_raw = [m for m in tokenized if m["category"] == cat]
        cat_counter = Counter()
        for m in cat_msgs_raw:
            cat_counter.update(m["words"])
        cat_inds = [item[0] for item in cat_counter.most_common(5)]
        if not cat_inds:
            cat_inds = FALLBACK_CATEGORY_INDICATORS.get(cat, [])
        category_indicators[cat] = cat_inds

    # Keyword frequency + trending phrases + recent suspicious terms for each category request.
    def compute_for_msgs(msgs):
        # keywords
        keywords_counter = Counter()
        for m in msgs:
            keywords_counter.update(m["words"])
        top_keywords_all = [{"keyword": k, "count": c} for k, c in keywords_counter.most_common()]

        # trending phrases (bigrams + trigrams)
        phrases_counter = Counter()
        for m in msgs:
            words = m["words"]
            # bigrams
            for i in range(len(words) - 1):
                phrases_counter[f"{words[i]} {words[i+1]}"] += 1
            # trigrams
            for i in range(len(words) - 2):
                phrases_counter[f"{words[i]} {words[i+1]} {words[i+2]}"] += 1
        trending_phrases_all = [{"phrase": p, "count": c} for p, c in phrases_counter.most_common()]

        # recent terms: last 20 messages (based on original load order)
        recent_msgs = msgs[-20:]
        recent_counter = Counter()
        for m in recent_msgs:
            words = m["words"]
            for w in words:
                recent_counter[w] += 1
            for i in range(len(words) - 1):
                recent_counter[f"{words[i]} {words[i+1]}"] += 1
        recent_terms_all = [item[0] for item in recent_counter.most_common()]
        return top_keywords_all, trending_phrases_all, recent_terms_all

    # Precompute for category=None and category=spam/smishing/offensive.
    aggregates["default"] = {}
    aggregates["default"]["top_keywords_all"], aggregates["default"]["trending_phrases_all"], aggregates["default"]["recent_terms_all"] = compute_for_msgs(overall_msgs)

    for cat in ("spam", "smishing", "offensive"):
        msgs = filter_msgs(cat)
        top_keywords_all, trending_phrases_all, recent_terms_all = compute_for_msgs(msgs)
        aggregates[cat] = {
            "top_keywords_all": top_keywords_all,
            "trending_phrases_all": trending_phrases_all,
            "recent_terms_all": recent_terms_all,
        }

    aggregates["category_indicators"] = category_indicators
    return aggregates

def _get_cached_aggregates():
    feedback_path, dataset_path = _get_source_paths()
    feedback_mtime = _get_mtime_or_none(feedback_path)
    dataset_mtime = _get_mtime_or_none(dataset_path)
    source_hash = _hash_file(feedback_path) + "-" + _hash_file(dataset_path)
    now = time.time()

    # Quick check without lock
    entry = _CACHE["entries"].get(source_hash)
    if entry and entry.get("expires_at", 0) > now:
        if entry.get("mtimes", {}).get("feedback") == feedback_mtime and entry.get("mtimes", {}).get("dataset") == dataset_mtime:
            return entry.get("aggregates", {})

    # Acquire lock to recompute if needed
    with _CACHE_LOCK:
        # Re-check under lock
        entry = _CACHE["entries"].get(source_hash)
        if entry and entry.get("expires_at", 0) > now:
            if entry.get("mtimes", {}).get("feedback") == feedback_mtime and entry.get("mtimes", {}).get("dataset") == dataset_mtime:
                return entry.get("aggregates", {})

        messages = load_data()
        aggregates = _compute_aggregates(messages) if len(messages) >= 5 else {}
        new_entry = {
            "expires_at": now + _CACHE_TTL_SECONDS,
            "mtimes": {"feedback": feedback_mtime, "dataset": dataset_mtime},
            "messages": messages,
            "aggregates": aggregates,
        }
        # Insert/replace entry
        _CACHE["entries"][source_hash] = new_entry
        # Evict oldest if exceeding max entries
        while len(_CACHE["entries"]) > _MAX_CACHE_ENTRIES:
            _CACHE["entries"].popitem(last=False)
        return aggregates

def get_spam_insights(limit=10, category=None):
    """Analyzes message data and returns top keywords, phrases, recent terms, and indicators."""
    # Ensure cache is populated and retrieve the appropriate entry
    feedback_path, dataset_path = _get_source_paths()
    source_hash = _hash_file(feedback_path) + "-" + _hash_file(dataset_path)
    entry = _CACHE["entries"].get(source_hash)
    if not entry:
        aggregates = _get_cached_aggregates()
        entry = _CACHE["entries"].get(source_hash)
    else:
        aggregates = entry.get("aggregates", {})
    messages = entry.get("messages", []) if entry else []

    if len(messages) < 5:
        # Fallback logic (unchanged)
        if category:
            cat_lower = category.lower()
            if cat_lower in FALLBACK_KEYWORDS:
                top_k = FALLBACK_KEYWORDS[cat_lower][:limit]
            else:
                top_k = []
            
            # Simple category filtering for phrases / terms
            indicators = FALLBACK_CATEGORY_INDICATORS.get(cat_lower, [])
            top_p = [p for p in FALLBACK_PHRASES if any(w in p["phrase"] for w in indicators)][:limit]
            if not top_p:
                top_p = FALLBACK_PHRASES[:limit]
                
            recent = [t for t in FALLBACK_SUSPICIOUS_TERMS if any(w in t for w in indicators)][:limit]
            if not recent:
                recent = FALLBACK_SUSPICIOUS_TERMS[:limit]
        else:
            # Combine keywords across categories
            combined_k = {}
            for cat, kws in FALLBACK_KEYWORDS.items():
                for kw in kws:
                    combined_k[kw["keyword"]] = combined_k.get(kw["keyword"], 0) + kw["count"]
            top_k = [{"keyword": k, "count": v} for k, v in sorted(combined_k.items(), key=lambda x: x[1], reverse=True)][:limit]
            top_p = FALLBACK_PHRASES[:limit]
            recent = FALLBACK_SUSPICIOUS_TERMS[:limit]
            
        return {
            "top_keywords": top_k,
            "trending_phrases": top_p,
            "recent_suspicious_terms": recent,
            "category_indicators": FALLBACK_CATEGORY_INDICATORS
        }

    # If real data is loaded, serve from precomputed aggregates (no CSV reads / no tokenization here).
    if category:
        cat_key = category.lower()
    else:
        cat_key = None

    if cat_key and cat_key in aggregates:
        src = aggregates[cat_key]
    else:
        # Unknown category: follow existing behavior by using fallback filtering.
        # We already handled fallback for tiny datasets; for real datasets, default to "default" aggregates.
        src = aggregates.get("default", {})

    top_keywords = src.get("top_keywords_all", [])[:limit]
    trending_phrases = src.get("trending_phrases_all", [])[:limit]
    recent_suspicious_terms = src.get("recent_terms_all", [])[:limit]

    if len(recent_suspicious_terms) < 3:
        recent_suspicious_terms = list(dict.fromkeys(recent_suspicious_terms + FALLBACK_SUSPICIOUS_TERMS))[:limit]

    category_indicators = aggregates.get("category_indicators", FALLBACK_CATEGORY_INDICATORS)

    return {
        "top_keywords": top_keywords,
        "trending_phrases": trending_phrases,
        "recent_suspicious_terms": recent_suspicious_terms,
        "category_indicators": category_indicators,
    }

