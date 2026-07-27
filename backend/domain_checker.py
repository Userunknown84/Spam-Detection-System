"""
Domain Age & Reputation Checker for Spam Detection
Extracts domains from text, checks age and blacklist status.

Reputation lookups (WHOIS + DNSBL + threat-intel) are expensive and mostly
repeat the same handful of domains on the /predict hot path, so
``analyze_domain`` is fronted by an in-process TTL cache keyed on the domain
(issue #974). Definitive verdicts are cached longer than transient lookup
failures, and per-domain locking collapses concurrent duplicate lookups so a
burst of identical domains triggers a single underlying analysis.
"""

import re
import os
import threading
import time
import requests
import whois
import dns.resolver
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Dict, List, Tuple

# Per-provider HTTP request timeout (seconds); THREAT_INTEL_OVERALL_TIMEOUT
# caps the wait while aggregating the concurrent provider results.
THREAT_INTEL_REQUEST_TIMEOUT = 3
THREAT_INTEL_OVERALL_TIMEOUT = 5

# Common DNSBL (blacklist) providers
DNSBL_PROVIDERS = [
    "zen.spamhaus.org",      # Spamhaus Zen - most comprehensive
    "bl.spamcop.net",        # SpamCop
    "b.barracudacentral.org", # Barracuda
    "dbl.spamhaus.org",      # Domain blocklist
]

# Cap the text scanned for domains so a pathologically large, attacker-supplied
# body cannot turn extraction into a performance sink (issue #940).
MAX_TEXT_LENGTH = 100_000

# Maximum length of a fully-qualified domain name (RFC 1035).
_MAX_HOSTNAME_LENGTH = 253

# Known public TLDs used to validate extraction candidates (issue #974).
#
# extract_domains used to match any "<label>.<2+ letters>" token, so ordinary
# prose -- "file.txt", "e.g", "the end.Then" -- produced fake domains that then
# incurred real WHOIS / DNSBL / threat-intel lookups on non-domains. Requiring
# the final label to be a real TLD is what turns the loose token match into a
# hostname test.
#
# The set is curated and self-contained rather than sourced from a public-suffix
# dependency: the repo ships no such library, and pulling one in (plus keeping
# its suffix data refreshed) is disproportionate for a spam heuristic. It covers
# the ISO-3166 ccTLDs and the widely used gTLDs. Filename-extension look-alikes
# that also happen to be registry TLDs (e.g. .zip, .mov) are intentionally
# omitted: in email/message text a "name.zip" token is far more likely a file
# than a domain, and under-extracting there is the safe direction for a
# precision fix. An exotic gTLD that is absent is simply not treated as a
# domain -- again the safe direction.
_CC_TLDS = frozenset(
    """
ac ad ae af ag ai al am ao aq ar as at au aw ax az
ba bb bd be bf bg bh bi bj bm bn bo br bs bt bw by bz
ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz
de dj dk dm do dz
ec ee eg er es et eu
fi fj fk fm fo fr
ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy
hk hm hn hr ht hu
id ie il im in io iq ir is it
je jm jo jp
ke kg kh ki km kn kp kr kw ky kz
la lb lc li lk lr ls lt lu lv ly
ma mc md me mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz
na nc ne nf ng ni nl no np nr nu nz
om
pa pe pf pg ph pk pl pm pn pr ps pt pw py
qa
re ro rs ru rw
sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st su sv sx sy sz
tc td tf tg th tj tk tl tm tn to tr tt tv tw tz
ua ug uk us uy uz
va vc ve vg vi vn vu
wf ws
ye yt
za zm zw
""".split()
)

_G_TLDS = frozenset(
    """
com net org edu gov mil int info biz name pro mobi asia tel travel jobs
coop aero museum cat post arpa
app dev page xyz online site tech store shop blog cloud email live news
media agency solutions digital finance systems network global world today
ventures capital studio design software cyou icu top vip club fun space
""".split()
)

KNOWN_TLDS = _CC_TLDS | _G_TLDS

# A single DNS label: 1-63 chars, alphanumeric plus hyphen, no leading/trailing
# hyphen. Anchored so it validates one already-split label at a time.
_LABEL_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")

# Host candidate: one or more dot-separated labels followed by an alphabetic
# TLD. Quantifiers are bounded (labels <= 63 chars, <= 10 levels deep) so the
# scan stays linear on adversarial label runs (issue #940). The lookbehind stops
# a match from starting mid-token (so a longer host isn't split); the lookahead
# stops the alphabetic TLD from being truncated before a trailing label char.
# The preceding "@" or "/" is deliberately allowed so hosts inside email
# addresses and scheme-prefixed URLs are still captured.
_HOST_CANDIDATE_RE = re.compile(
    r"(?<![\w.-])" r"((?:[a-z0-9-]{1,63}\.){1,10}[a-z]{2,63})" r"(?![a-z0-9-])",
    re.IGNORECASE,
)


def _normalize_host(host: str) -> str:
    """Lower-case, drop a trailing root dot, and strip a leading ``www.``.

    ``www`` is stripped so ``https://www.example.com`` and a bare
    ``example.com`` collapse to the same registrable host for downstream
    lookups and de-duplication.
    """
    host = host.rstrip(".").lower()
    if host.startswith("www."):
        host = host[len("www.") :]
    return host


def _is_valid_domain(host: str) -> bool:
    """True when ``host`` is a syntactically valid hostname with a known TLD."""
    if not host or len(host) > _MAX_HOSTNAME_LENGTH:
        return False
    labels = host.split(".")
    if len(labels) < 2:
        return False
    if not all(_LABEL_RE.match(label) for label in labels):
        return False
    return labels[-1] in KNOWN_TLDS

def extract_domains(text: str) -> List[str]:
    """
    Extract domains from text.

    Returns the unique, normalized domains found in the message, sorted for
    determinism. Only tokens that are shaped like a real hostname *and* end in a
    known public TLD are returned, so non-domain text (``file.txt``, ``e.g``,
    ``example.``, bare filenames, sentence fragments with dots) is rejected
    before it can reach the WHOIS / DNSBL / threat-intel lookups (issue #974).
    """
    if not text:
        return []
    if len(text) > MAX_TEXT_LENGTH:
        text = text[:MAX_TEXT_LENGTH]

    found = set()
    for match in _HOST_CANDIDATE_RE.finditer(text):
        host = _normalize_host(match.group(1))
        if _is_valid_domain(host):
            found.add(host)
    return sorted(found)

def check_domain_age(domain: str) -> Tuple[Optional[int], Optional[str]]:
    """
    Check domain age using WHOIS.
    Returns (age_days, creation_date) or (None, error_message)
    """
    try:
        w = whois.whois(domain)
        creation_date = w.creation_date
        
        if not creation_date:
            return None, "No creation date found"
        
        # Handle if creation_date is a list (sometimes multiple dates)
        if isinstance(creation_date, list):
            creation_date = creation_date[0]
        
        # Handle string parsing if creation_date is returned as a string
        if isinstance(creation_date, str):
            from dateutil import parser as date_parser
            try:
                creation_date = date_parser.parse(creation_date)
            except Exception:
                for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%SZ", "%d-%b-%Y", "%Y.%m.%d"):
                    try:
                        creation_date = datetime.strptime(creation_date, fmt)
                        break
                    except ValueError:
                        continue
        
        if isinstance(creation_date, str):
            return None, f"Could not parse creation date string: {creation_date}"
            
        # Handle timezone-aware datetime
        now = datetime.now()
        if creation_date.tzinfo is not None:
            # If creation_date has timezone, make now timezone-aware
            from datetime import timezone
            now = datetime.now(timezone.utc)
        
        age_days = (now - creation_date).days
        return age_days, creation_date.strftime("%Y-%m-%d")
        
    except Exception as e:
        return None, f"WHOIS lookup failed: {str(e)}"

def check_blacklist(domain: str) -> Dict[str, bool]:
    """
    Check if domain is blacklisted on DNSBL providers.
    Returns dict with provider names and boolean status.
    """
    results = {}
    
    for provider in DNSBL_PROVIDERS:
        query = f"{domain}.{provider}"
        try:
            resolver = dns.resolver.Resolver()
            resolver.timeout = 5
            resolver.lifetime = 5
            
            answers = resolver.resolve(query, 'A')
            results[provider] = len(answers) > 0
            
        except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.exception.Timeout):
            results[provider] = False
        except Exception:
            results[provider] = False
    
    return results

def _check_urlhaus(domain: str) -> Tuple[str, bool]:
    """URLHaus lookup (keyless, free public check)."""
    try:
        urlhaus_url = "https://urlhaus-api.abuse.ch/v1/host/"
        response = requests.post(urlhaus_url, json={"host": domain}, timeout=THREAT_INTEL_REQUEST_TIMEOUT)
        if response.status_code == 200 and response.json().get("query_status") == "ok":
            return "urlhaus", True
    except Exception:
        pass
    return "urlhaus", False


def _check_google_safe_browsing(domain: str) -> Tuple[str, bool]:
    """Google Safe Browsing lookup. Returns False (no-op) without an API key."""
    gsb_api_key = os.getenv("SAFE_BROWSING_API_KEY")
    if not gsb_api_key:
        return "google_safe_browsing", False
    try:
        gsb_url = f"https://safebrowsing.googleapis.com/v4/threatMatches:find?key={gsb_api_key}"
        payload = {
            "client": {
                "clientId": "spam-detection-system",
                "clientVersion": "1.0.0"
            },
            "threatInfo": {
                "threatTypes": ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
                "platformTypes": ["ANY_PLATFORM"],
                "threatEntryTypes": ["URL"],
                "threatEntries": [
                    {"url": domain}
                ]
            }
        }
        response = requests.post(gsb_url, json=payload, timeout=THREAT_INTEL_REQUEST_TIMEOUT)
        if response.status_code == 200 and "matches" in response.json():
            return "google_safe_browsing", True
    except Exception:
        pass
    return "google_safe_browsing", False


def _check_virustotal(domain: str) -> Tuple[str, bool]:
    """VirusTotal domain lookup. Returns False (no-op) without an API key."""
    vt_api_key = os.getenv("VIRUSTOTAL_API_KEY")
    if not vt_api_key:
        return "virustotal", False
    try:
        vt_url = f"https://www.virustotal.com/api/v3/domains/{domain}"
        headers = {"x-apikey": vt_api_key}
        response = requests.get(vt_url, headers=headers, timeout=THREAT_INTEL_REQUEST_TIMEOUT)
        if response.status_code == 200:
            stats = response.json().get("data", {}).get("attributes", {}).get("last_analysis_stats", {})
            if stats.get("malicious", 0) > 0 or stats.get("suspicious", 0) > 1:
                return "virustotal", True
    except Exception:
        pass
    return "virustotal", False


# Independent threat-intel providers. Each returns (result_key, flagged) and
# swallows its own errors, so they can be dispatched concurrently and aggregated
# without one provider affecting another.
_THREAT_INTEL_PROVIDERS = (
    _check_urlhaus,
    _check_google_safe_browsing,
    _check_virustotal,
)


def check_threat_intelligence(domain: str) -> Dict[str, bool]:
    """
    Query threat intelligence APIs to check if the domain is flagged/blacklisted.

    The providers are independent external services, so they are queried
    concurrently: total latency is bounded by the slowest single provider rather
    than the sum of all of them. Each provider applies its own request timeout and
    handles its own failures, so a slow or failing provider degrades to a False
    result without blocking the others.
    """
    results = {
        "google_safe_browsing": False,
        "virustotal": False,
        "urlhaus": False
    }

    with ThreadPoolExecutor(max_workers=len(_THREAT_INTEL_PROVIDERS)) as executor:
        futures = [executor.submit(provider, domain) for provider in _THREAT_INTEL_PROVIDERS]
        for future in futures:
            try:
                key, flagged = future.result(timeout=THREAT_INTEL_OVERALL_TIMEOUT)
                results[key] = flagged
            except (FuturesTimeoutError, Exception):
                # Individual provider timeout/failure: keep its default False and
                # keep aggregating the rest.
                continue

    return results

def calculate_risk_score(age_days: Optional[int], blacklist_results: Dict[str, bool]) -> Tuple[int, str]:
    """
    Calculate risk score based on domain age and blacklist status.
    Returns (score, recommendation)
    """
    score = 0
    
    # Age-based scoring (newer domains are more suspicious)
    if age_days is not None:
        if age_days < 7:
            score += 60  # Very new - high risk
        elif age_days < 30:
            score += 40  # New - medium risk
        elif age_days < 90:
            score += 20  # Moderately new - low risk
        else:
            score += 5   # Old - minimal risk
    else:
        score += 10  # Unknown - assume slightly suspicious
    
    # Blacklist-based scoring
    blacklisted_count = sum(blacklist_results.values())
    if blacklisted_count > 0:
        score += 30 + (blacklisted_count * 5)  # Base 30 + extra per blacklist
        
    # If domain is flagged on any blacklisting/threat service, set risk score to 100 immediately
    if any(blacklist_results.values()):
        score = 100
    
    # Cap at 100
    score = min(score, 100)
    
    # Determine recommendation
    if score >= 70:
        recommendation = "BLOCK"
    elif score >= 40:
        recommendation = "WARNING"
    else:
        recommendation = "SAFE"
    
    return score, recommendation

# ============================================
# DOMAIN REPUTATION TTL CACHE (issue #974)
# ============================================
#
# Reputation lookups are pure functions of the domain over the cache window, so
# results are memoised in-process to keep repeated/duplicate domains off the
# WHOIS/DNSBL/threat-intel network path. This is deliberately an in-process
# dict-with-locking cache (not Redis): the ML API runs as a single Flask worker,
# and the goal is to *not repeat* work within a process, not to share state
# across hosts.
#
# TTLs are split so a definitive verdict (real WHOIS age, or a blacklist/threat
# hit) is trusted for DOMAIN_CACHE_POSITIVE_TTL, while a transient lookup
# failure (e.g. WHOIS timing out with no reputation signal) is only held for the
# much shorter DOMAIN_CACHE_NEGATIVE_TTL so a blip is retried soon instead of
# being frozen in as a fake "unknown" verdict.
#
# Environment variables (all optional; resolved live per call so overrides take
# effect without a reimport, matching rate_limiting.py):
#   DOMAIN_CACHE_ENABLED       -- "false"/"0"/"no"/"off" disables caching. Default: enabled.
#   DOMAIN_CACHE_POSITIVE_TTL  -- seconds to cache a definitive verdict. Default: 3600.
#   DOMAIN_CACHE_NEGATIVE_TTL  -- seconds to cache a transient-failure verdict. Default: 60.
#   DOMAIN_CACHE_MAX_SIZE      -- max distinct domains held (LRU eviction). Default: 1024.

_DOMAIN_CACHE_POSITIVE_TTL_DEFAULT = 3600
_DOMAIN_CACHE_NEGATIVE_TTL_DEFAULT = 60
_DOMAIN_CACHE_MAX_SIZE_DEFAULT = 1024


@dataclass(slots=True)
class _CacheEntry:
    """One memoised domain verdict and when it stops being trusted."""

    value: Dict
    expires_at: float
    is_negative: bool


# Guards _cache, _domain_locks and _counters. Held only for O(1) bookkeeping,
# never across an actual lookup, so a slow lookup can't block cache readers.
_cache_lock = threading.Lock()

# Insertion-ordered so the oldest entry is cheapest to evict; move_to_end on a
# hit turns it into an LRU.
_cache: "OrderedDict[str, _CacheEntry]" = OrderedDict()

# Per-domain locks give thundering-herd protection: the first thread to miss a
# domain computes it while every other thread asking for the same domain waits
# on this lock and then reuses the freshly cached result.
_domain_locks: "Dict[str, threading.Lock]" = {}

_counters = {"hits": 0, "misses": 0, "evictions": 0}


def _now() -> float:
    """Monotonic clock for TTLs; indirected so tests can freeze time."""
    return time.monotonic()


def _env_int(name: str, default: int) -> int:
    """Read a non-negative int env override, falling back on unset/garbage."""
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = int(raw.strip())
    except ValueError:
        return default
    return value if value >= 0 else default


def _cache_enabled() -> bool:
    raw = os.getenv("DOMAIN_CACHE_ENABLED")
    if raw is None:
        return True
    return raw.strip().lower() not in {"false", "0", "no", "off"}


def get_cache_stats() -> Dict:
    """Return domain-cache counters for the analytics dashboard.

    Mirrors the plain-dict stats surface used elsewhere in the backend (e.g.
    ``evo_mail`` / ``/feedback/stats``). ``hits + misses`` is the total number
    of ``analyze_domain`` calls that consulted the cache, and ``misses`` equals
    the number of underlying reputation lookups actually performed.
    """
    with _cache_lock:
        hits = _counters["hits"]
        misses = _counters["misses"]
        total = hits + misses
        return {
            "hits": hits,
            "misses": misses,
            "evictions": _counters["evictions"],
            "size": len(_cache),
            "max_size": _env_int(
                "DOMAIN_CACHE_MAX_SIZE", _DOMAIN_CACHE_MAX_SIZE_DEFAULT
            ),
            "hit_rate": (hits / total) if total else 0.0,
        }


def reset_cache_stats() -> None:
    """Zero the hit/miss/eviction counters without dropping cached entries."""
    with _cache_lock:
        _counters["hits"] = 0
        _counters["misses"] = 0
        _counters["evictions"] = 0


def clear_domain_cache() -> None:
    """Drop all cached verdicts, per-domain locks and counters.

    Primarily a test seam so cases start from a clean cache; also usable to force
    a cold re-check operationally.
    """
    with _cache_lock:
        _cache.clear()
        _domain_locks.clear()
        _counters["hits"] = 0
        _counters["misses"] = 0
        _counters["evictions"] = 0


def _get_fresh_locked(domain: str, now: float) -> Optional[_CacheEntry]:
    """Return a live entry (and mark it MRU), or None. Caller holds _cache_lock."""
    entry = _cache.get(domain)
    if entry is not None and entry.expires_at > now:
        _cache.move_to_end(domain)
        return entry
    return None


def _store_locked(domain: str, entry: _CacheEntry) -> None:
    """Insert/refresh an entry, evicting the LRU domain past the size cap.

    Caller holds _cache_lock.
    """
    _cache[domain] = entry
    _cache.move_to_end(domain)
    max_size = _env_int("DOMAIN_CACHE_MAX_SIZE", _DOMAIN_CACHE_MAX_SIZE_DEFAULT)
    while max_size >= 1 and len(_cache) > max_size:
        evicted, _ = _cache.popitem(last=False)
        _domain_locks.pop(evicted, None)
        _counters["evictions"] += 1


def analyze_domain(domain: str) -> Dict:
    """Complete risk analysis for a single domain, served from a TTL cache.

    On a hit the cached verdict is returned without touching the network. On a
    miss the expensive lookup runs under a per-domain lock so concurrent callers
    asking for the same domain collapse into one underlying analysis (issue
    #974). A fresh copy of the verdict dict is returned each time so callers
    can't mutate the cached value.
    """
    if not _cache_enabled():
        return _analyze_domain_uncached(domain)[0]

    now = _now()
    with _cache_lock:
        entry = _get_fresh_locked(domain, now)
        if entry is not None:
            _counters["hits"] += 1
            return dict(entry.value)
        lock = _domain_locks.setdefault(domain, threading.Lock())

    with lock:
        # Re-check under the per-domain lock: a peer thread may have populated the
        # cache while we were queued, in which case we reuse it (coalesced hit)
        # rather than launching a duplicate lookup.
        now = _now()
        with _cache_lock:
            entry = _get_fresh_locked(domain, now)
            if entry is not None:
                _counters["hits"] += 1
                return dict(entry.value)
            _counters["misses"] += 1

        result, is_transient = _analyze_domain_uncached(domain)
        ttl = (
            _env_int("DOMAIN_CACHE_NEGATIVE_TTL", _DOMAIN_CACHE_NEGATIVE_TTL_DEFAULT)
            if is_transient
            else _env_int(
                "DOMAIN_CACHE_POSITIVE_TTL", _DOMAIN_CACHE_POSITIVE_TTL_DEFAULT
            )
        )
        with _cache_lock:
            _store_locked(
                domain,
                _CacheEntry(
                    value=dict(result),
                    expires_at=_now() + ttl,
                    is_negative=is_transient,
                ),
            )
        return dict(result)


def _analyze_domain_uncached(domain: str) -> Tuple[Dict, bool]:
    """Run the raw WHOIS/DNSBL/threat-intel analysis for one domain.

    Returns ``(verdict, is_transient_failure)``. ``is_transient_failure`` is True
    only when the WHOIS lookup errored AND nothing flagged the domain: there is
    then no real reputation signal, so the caller caches the result briefly (and
    does not treat the "unknown" verdict as permanent). A blacklist/threat hit is
    always a definitive verdict regardless of WHOIS.
    """
    age_days, creation_date = check_domain_age(domain)
    blacklist_results = check_blacklist(domain)
    threat_intel = check_threat_intelligence(domain)

    # Merge blacklist results and threat intel results for calculate_risk_score
    all_blacklists = {**blacklist_results, **threat_intel}

    risk_score, recommendation = calculate_risk_score(age_days, all_blacklists)

    # Determine risk level
    if risk_score >= 70:
        risk_level = "HIGH"
    elif risk_score >= 40:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    is_flagged = any(all_blacklists.values())
    # check_domain_age only reports an actual WHOIS error via this prefix; a
    # legitimately date-less domain ("No creation date found") is not transient.
    whois_failed = (
        age_days is None
        and isinstance(creation_date, str)
        and creation_date.startswith("WHOIS lookup failed")
    )
    is_transient = whois_failed and not is_flagged

    verdict = {
        "url": domain,
        "age_days": age_days if age_days is not None else "unknown",
        "creation_date": creation_date if creation_date else "unknown",
        "blacklisted": is_flagged,
        "blacklist_details": blacklist_results,
        "threat_intel_details": threat_intel,
        "risk_score": risk_score,
        "risk_level": risk_level,
        "recommendation": recommendation,
    }
    return verdict, is_transient


def analyze_text(text: str) -> Dict:
    """
    Analyze all domains in text and return consolidated results.
    """
    domains = extract_domains(text)
    
    if not domains:
        return {
            "domains_found": [],
            "max_risk_score": 0,
            "overall_risk": "SAFE",
            "details": []
        }
    
    domain_analyses = []
    max_score = 0
    
    for domain in domains[:5]:  # Limit to first 5 domains for performance
        analysis = analyze_domain(domain)
        domain_analyses.append(analysis)
        max_score = max(max_score, analysis["risk_score"])
    
    # Determine overall recommendation
    if max_score >= 70:
        overall = "BLOCK"
    elif max_score >= 40:
        overall = "WARNING"
    else:
        overall = "SAFE"
    
    return {
        "domains_found": domains,
        "max_risk_score": max_score,
        "overall_risk": overall,
        "details": domain_analyses,
    }