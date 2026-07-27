"""Tests for issue #923: threat-intelligence provider lookups run concurrently.

The providers are independent external services; querying them in parallel keeps
total latency bounded by the slowest single provider instead of their sum, while
a slow/failing provider must not block or break the others.
"""

from   pathlib                  import Path
import sys
import time
from   unittest.mock            import patch

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

import domain_checker # noqa: E402


def test_aggregates_results_from_all_providers():
    providers = (
        lambda d: ("urlhaus", True),
        lambda d: ("google_safe_browsing", False),
        lambda d: ("virustotal", True),
    )
    with patch.object(domain_checker, "_THREAT_INTEL_PROVIDERS", providers):
        results = domain_checker.check_threat_intelligence("example.com")

    assert results == {
        "urlhaus": True,
        "google_safe_browsing": False,
        "virustotal": True,
    }


def test_individual_provider_failure_is_isolated():
    def boom(_domain):
        raise RuntimeError("provider down")

    providers = (
        lambda d: ("urlhaus", True),
        boom,  # virustotal-style failure
        lambda d: ("google_safe_browsing", False),
    )
    with patch.object(domain_checker, "_THREAT_INTEL_PROVIDERS", providers):
        results = domain_checker.check_threat_intelligence("example.com")

    # The failing provider keeps its default False; the others still resolve.
    assert results["urlhaus"] is True
    assert results["google_safe_browsing"] is False
    assert results["virustotal"] is False


def test_providers_execute_concurrently():
    delay = 0.3

    def slow(key):
        def _fn(_domain):
            time.sleep(delay)
            return key, False

        return _fn

    providers = (slow("urlhaus"), slow("google_safe_browsing"), slow("virustotal"))
    with patch.object(domain_checker, "_THREAT_INTEL_PROVIDERS", providers):
        start = time.perf_counter()
        domain_checker.check_threat_intelligence("example.com")
        elapsed = time.perf_counter() - start

    # Sequential execution would take ~3*delay; concurrent should be well under.
    assert elapsed < delay * 2


def test_paid_providers_skipped_without_api_keys(monkeypatch):
    monkeypatch.delenv("SAFE_BROWSING_API_KEY", raising=False)
    monkeypatch.delenv("VIRUSTOTAL_API_KEY", raising=False)

    # urlhaus is keyless; stub its network call so the test stays offline.
    def fake_post(url, **kwargs):
        raise AssertionError("network call should be stubbed")

    with patch.object(domain_checker.requests, "post", side_effect=fake_post):
        gsb_key, gsb_flag = domain_checker._check_google_safe_browsing("example.com")
        vt_key, vt_flag = domain_checker._check_virustotal("example.com")

    assert (gsb_key, gsb_flag) == ("google_safe_browsing", False)
    assert (vt_key, vt_flag) == ("virustotal", False)
