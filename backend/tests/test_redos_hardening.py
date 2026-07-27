"""
Regression tests for issue #940: hardening the regex-based parsers against
ReDoS / algorithmic-complexity attacks.

Each test feeds an adversarial input crafted to trigger catastrophic
backtracking in the pre-hardening patterns and asserts that (a) the call
completes well within a small time budget and (b) detection on ordinary inputs
is unchanged. The generous 2-second budget still fails loudly against the
exponential/quadratic blow-ups these inputs used to cause (seconds to minutes),
while staying immune to CI jitter.
"""

import os
from   pathlib                  import Path
import sys
import time

import pytest

BASE_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = BASE_DIR / "backend"

os.environ.setdefault("MODEL_PATH", str(BASE_DIR / "linear_svm_model.pkl"))
os.environ.setdefault("VECTORIZER_PATH", str(BACKEND_DIR / "tfidf_vectorizer.pkl"))
os.environ.setdefault("LABEL_ENCODER_PATH", str(BASE_DIR / "label_encoder.pkl"))
os.environ.setdefault("URL_MODEL_PATH", str(BACKEND_DIR / "url_detector.pkl"))
os.environ.setdefault("URL_VECTORIZER_PATH", str(BACKEND_DIR / "url_vectorizer.pkl"))

sys.path.insert(0, str(BACKEND_DIR))

# Time budget for a single hardened parse of an adversarial input.
TIME_BUDGET_SECONDS = 2.0


def _timed(func, *args, **kwargs):
    start = time.perf_counter()
    result = func(*args, **kwargs)
    return result, time.perf_counter() - start


# Optional imports: some parsers pull in heavy third-party deps that may be
# absent in a minimal env. Import them defensively so the always-available
# pure-stdlib tests (explanation_engine) still run.
from   explanation_engine       import ExplanationEngine, MAX_TEXT_LENGTH

try:
    import domain_checker  # noqa: E402

    _HAS_DOMAIN_CHECKER = True
except Exception:
    _HAS_DOMAIN_CHECKER = False

try:
    import html_sanitizer  # noqa: E402

    _HAS_HTML_SANITIZER = True
except Exception:
    _HAS_HTML_SANITIZER = False

try:
    import email_header_analyzer  # noqa: E402

    _HAS_HEADER_ANALYZER = True
except Exception:
    _HAS_HEADER_ANALYZER = False


# ---------------------------------------------------------------------------
# explanation_engine.ExplanationEngine
# ---------------------------------------------------------------------------


@pytest.fixture
def engine():
    return ExplanationEngine()


def test_suspicious_domain_detection_behavior_preserved(engine):
    # A suspicious TLD is still flagged, a normal domain is not.
    assert engine._find_suspicious_domain("visit deals.xyz today") is True
    assert engine._find_suspicious_domain("visit example.com today") is False


def test_suspicious_domain_fast_on_adversarial_label_run(engine):
    # A long run of label characters with no valid TLD boundary was the classic
    # `(label\.)+tld` backtracking trigger.
    adversarial = "a" * 40000 + " !"
    result, elapsed = _timed(engine._find_suspicious_domain, adversarial)
    assert result is False
    assert elapsed < TIME_BUDGET_SECONDS


def test_phone_pattern_fast_on_adversarial_digit_run(engine):
    adversarial = "+" + "1 " * 30000
    _, elapsed = _timed(engine.PHONE_PATTERN.search, adversarial)
    assert elapsed < TIME_BUDGET_SECONDS
    # A real phone number is still matched.
    assert engine.PHONE_PATTERN.search("call +1 (212) 555-0147 now") is not None


def test_analyze_bounds_pathologically_large_input(engine):
    huge = ("free prize winner " * 20000) + ("a." * 30000) + "b"
    assert len(huge) > MAX_TEXT_LENGTH
    result, elapsed = _timed(engine.analyze, huge)
    assert elapsed < TIME_BUDGET_SECONDS
    assert 0 <= result["score"] <= 100
    assert isinstance(result["reasons"], list)


# ---------------------------------------------------------------------------
# domain_checker.extract_domains
# ---------------------------------------------------------------------------


@pytest.mark.skipif(not _HAS_DOMAIN_CHECKER, reason="domain_checker deps unavailable")
def test_extract_domains_behavior_preserved():
    found = domain_checker.extract_domains(
        "See https://www.example.com and mail me at foo.co.uk please"
    )
    assert "example.com" in found
    assert "foo.co.uk" in found


@pytest.mark.skipif(not _HAS_DOMAIN_CHECKER, reason="domain_checker deps unavailable")
def test_extract_domains_fast_on_adversarial_input():
    adversarial = "a" * 50000 + " http://" + "b" * 50000
    result, elapsed = _timed(domain_checker.extract_domains, adversarial)
    assert elapsed < TIME_BUDGET_SECONDS
    assert isinstance(result, list)


@pytest.mark.skipif(not _HAS_DOMAIN_CHECKER, reason="domain_checker deps unavailable")
def test_extract_domains_length_guard():
    huge = "x" * (domain_checker.MAX_TEXT_LENGTH + 5000) + " evil.tk"
    result, elapsed = _timed(domain_checker.extract_domains, huge)
    assert elapsed < TIME_BUDGET_SECONDS
    assert isinstance(result, list)


# ---------------------------------------------------------------------------
# html_sanitizer.neutralize_css
# ---------------------------------------------------------------------------


@pytest.mark.skipif(not _HAS_HTML_SANITIZER, reason="html_sanitizer deps unavailable")
def test_neutralize_css_behavior_preserved():
    css = "body { background: url('http://evil.example/x.png'); color: red; }"
    out = html_sanitizer.neutralize_css(css)
    assert "url()" in out
    assert "evil.example" not in out
    assert "color: red" in out


@pytest.mark.skipif(not _HAS_HTML_SANITIZER, reason="html_sanitizer deps unavailable")
def test_neutralize_css_fast_on_unterminated_url():
    adversarial = "a{background:url(" + "'" * 60000
    _, elapsed = _timed(html_sanitizer.neutralize_css, adversarial)
    assert elapsed < TIME_BUDGET_SECONDS


# ---------------------------------------------------------------------------
# email_header_analyzer display-name spoofing check
#
# analyze_headers optionally performs a network WHOIS/DNSBL lookup on the sender
# domain; that path is unrelated to the regex under test, so it is stubbed out to
# keep these tests hermetic and fast.
# ---------------------------------------------------------------------------


@pytest.mark.skipif(
    not _HAS_HEADER_ANALYZER, reason="email_header_analyzer deps unavailable"
)
def test_display_name_spoof_detection_behavior_preserved(monkeypatch):
    if _HAS_DOMAIN_CHECKER:
        monkeypatch.setattr(
            domain_checker,
            "analyze_domain",
            lambda domain: {"age_days": None, "blacklisted": False},
        )
    headers = 'From: "billing@paypal.com" <scammer@gmail.com>\r\n'
    result = email_header_analyzer.analyze_headers(headers)
    assert result["sender_domain_match"] is False


@pytest.mark.skipif(
    not _HAS_HEADER_ANALYZER, reason="email_header_analyzer deps unavailable"
)
def test_analyze_headers_fast_on_adversarial_display_name(monkeypatch):
    if _HAS_DOMAIN_CHECKER:
        monkeypatch.setattr(
            domain_checker,
            "analyze_domain",
            lambda domain: {"age_days": None, "blacklisted": False},
        )
    adversarial_display = "a" * 60000 + "@" + "a" * 60000
    headers = f'From: "{adversarial_display}" <real@example.com>\r\n'
    _, elapsed = _timed(email_header_analyzer.analyze_headers, headers)
    assert elapsed < TIME_BUDGET_SECONDS
