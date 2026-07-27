"""Tests for issue #974: TTL cache in front of domain reputation lookups.

``analyze_domain`` fronts the expensive WHOIS/DNSBL/threat-intel work with an
in-process TTL cache so repeated domains on the /predict hot path aren't
re-queried. These tests pin the behaviour that matters:

* cache hit vs miss (a repeated domain triggers a single underlying lookup),
* TTL expiry (a stale entry is re-looked-up),
* negative caching (a transient failure is held only for the short negative TTL
  and is not frozen in as a permanent verdict),
* dedup under concurrency (a burst of identical domains collapses to one call).

The underlying analysis is mocked throughout so the suite stays offline and can
assert exactly how many times the expensive lookup ran.
"""

from   pathlib                  import Path
import sys
import threading

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

import domain_checker # noqa: E402


@pytest.fixture(autouse=True)
def _clean_cache(monkeypatch):
    """Every test starts from an empty cache with default (enabled) config."""
    for var in (
        "DOMAIN_CACHE_ENABLED",
        "DOMAIN_CACHE_POSITIVE_TTL",
        "DOMAIN_CACHE_NEGATIVE_TTL",
        "DOMAIN_CACHE_MAX_SIZE",
    ):
        monkeypatch.delenv(var, raising=False)
    domain_checker.clear_domain_cache()
    yield
    domain_checker.clear_domain_cache()


def _counting_uncached(is_transient=False):
    """Return a fake _analyze_domain_uncached plus its per-domain call log."""
    calls = []

    def fake(domain):
        calls.append(domain)
        return {"url": domain, "risk_score": 10, "recommendation": "SAFE"}, is_transient

    return fake, calls


def test_repeated_domain_hits_cache(monkeypatch):
    fake, calls = _counting_uncached()
    monkeypatch.setattr(domain_checker, "_analyze_domain_uncached", fake)

    first = domain_checker.analyze_domain("example.com")
    second = domain_checker.analyze_domain("example.com")

    assert calls == ["example.com"]  # underlying lookup ran exactly once
    assert first == second
    stats = domain_checker.get_cache_stats()
    assert stats["misses"] == 1
    assert stats["hits"] == 1
    assert stats["size"] == 1
    assert stats["hit_rate"] == 0.5


def test_distinct_domains_each_miss(monkeypatch):
    fake, calls = _counting_uncached()
    monkeypatch.setattr(domain_checker, "_analyze_domain_uncached", fake)

    domain_checker.analyze_domain("a.com")
    domain_checker.analyze_domain("b.com")

    assert sorted(calls) == ["a.com", "b.com"]
    stats = domain_checker.get_cache_stats()
    assert stats["misses"] == 2
    assert stats["hits"] == 0
    assert stats["size"] == 2


def test_cached_value_is_copied(monkeypatch):
    fake, _ = _counting_uncached()
    monkeypatch.setattr(domain_checker, "_analyze_domain_uncached", fake)

    result = domain_checker.analyze_domain("example.com")
    result["risk_score"] = 999  # mutating the caller's copy must not poison the cache

    assert domain_checker.analyze_domain("example.com")["risk_score"] == 10


def test_disabled_cache_bypasses_lookup_memoisation(monkeypatch):
    monkeypatch.setenv("DOMAIN_CACHE_ENABLED", "false")
    fake, calls = _counting_uncached()
    monkeypatch.setattr(domain_checker, "_analyze_domain_uncached", fake)

    domain_checker.analyze_domain("example.com")
    domain_checker.analyze_domain("example.com")

    assert calls == ["example.com", "example.com"]  # no caching, both looked up
    stats = domain_checker.get_cache_stats()
    assert stats["hits"] == 0
    assert stats["misses"] == 0


def test_entry_expires_after_positive_ttl(monkeypatch):
    monkeypatch.setenv("DOMAIN_CACHE_POSITIVE_TTL", "100")
    clock = {"t": 1000.0}
    monkeypatch.setattr(domain_checker, "_now", lambda: clock["t"])
    fake, calls = _counting_uncached()
    monkeypatch.setattr(domain_checker, "_analyze_domain_uncached", fake)

    domain_checker.analyze_domain("example.com")  # miss; expires at 1100
    clock["t"] = 1050.0
    domain_checker.analyze_domain("example.com")  # still fresh -> hit
    clock["t"] = 1101.0
    domain_checker.analyze_domain("example.com")  # expired -> miss + refresh

    assert calls == ["example.com", "example.com"]
    stats = domain_checker.get_cache_stats()
    assert stats["misses"] == 2
    assert stats["hits"] == 1


def test_transient_failure_uses_short_negative_ttl(monkeypatch):
    # A transient result held far longer than NEGATIVE_TTL would mean the blip is
    # frozen in as a verdict; it must instead be re-looked-up soon.
    monkeypatch.setenv("DOMAIN_CACHE_POSITIVE_TTL", "10000")
    monkeypatch.setenv("DOMAIN_CACHE_NEGATIVE_TTL", "10")
    clock = {"t": 500.0}
    monkeypatch.setattr(domain_checker, "_now", lambda: clock["t"])
    fake, calls = _counting_uncached(is_transient=True)
    monkeypatch.setattr(domain_checker, "_analyze_domain_uncached", fake)

    domain_checker.analyze_domain("flaky.com")  # miss; negative entry expires at 510
    clock["t"] = 505.0
    domain_checker.analyze_domain("flaky.com")  # within negative TTL -> hit
    clock["t"] = 511.0
    domain_checker.analyze_domain("flaky.com")  # past negative TTL -> re-looked-up

    assert calls == ["flaky.com", "flaky.com"]
    stats = domain_checker.get_cache_stats()
    assert stats["misses"] == 2
    assert stats["hits"] == 1


def test_definitive_verdict_outlives_negative_ttl(monkeypatch):
    # Same elapsed time as the negative case above, but a definitive verdict is
    # still trusted -- proving positive/negative TTLs are applied separately.
    monkeypatch.setenv("DOMAIN_CACHE_POSITIVE_TTL", "10000")
    monkeypatch.setenv("DOMAIN_CACHE_NEGATIVE_TTL", "10")
    clock = {"t": 500.0}
    monkeypatch.setattr(domain_checker, "_now", lambda: clock["t"])
    fake, calls = _counting_uncached(is_transient=False)
    monkeypatch.setattr(domain_checker, "_analyze_domain_uncached", fake)

    domain_checker.analyze_domain("solid.com")
    clock["t"] = 511.0  # would have expired a negative entry
    domain_checker.analyze_domain("solid.com")

    assert calls == ["solid.com"]  # still cached -> single lookup


def test_whois_failure_with_no_signal_is_transient(monkeypatch):
    monkeypatch.setattr(
        domain_checker,
        "check_domain_age",
        lambda d: (None, "WHOIS lookup failed: timeout"),
    )
    monkeypatch.setattr(domain_checker, "check_blacklist", lambda d: {})
    monkeypatch.setattr(domain_checker, "check_threat_intelligence", lambda d: {})

    verdict, is_transient = domain_checker._analyze_domain_uncached("flaky.com")

    assert is_transient is True
    assert verdict["blacklisted"] is False


def test_blacklist_hit_is_definitive_even_when_whois_fails(monkeypatch):
    monkeypatch.setattr(
        domain_checker,
        "check_domain_age",
        lambda d: (None, "WHOIS lookup failed: timeout"),
    )
    monkeypatch.setattr(
        domain_checker, "check_blacklist", lambda d: {"zen.spamhaus.org": True}
    )
    monkeypatch.setattr(domain_checker, "check_threat_intelligence", lambda d: {})

    verdict, is_transient = domain_checker._analyze_domain_uncached("bad.com")

    assert is_transient is False  # a flagged domain is a real verdict, cache it long
    assert verdict["blacklisted"] is True


def test_missing_creation_date_is_not_transient(monkeypatch):
    # "No creation date found" is a real (if uninformative) WHOIS answer, not a
    # lookup failure, so it should not be negative-cached.
    monkeypatch.setattr(
        domain_checker, "check_domain_age", lambda d: (None, "No creation date found")
    )
    monkeypatch.setattr(domain_checker, "check_blacklist", lambda d: {})
    monkeypatch.setattr(domain_checker, "check_threat_intelligence", lambda d: {})

    _verdict, is_transient = domain_checker._analyze_domain_uncached("newish.com")

    assert is_transient is False


def test_lru_eviction_respects_max_size(monkeypatch):
    monkeypatch.setenv("DOMAIN_CACHE_MAX_SIZE", "2")
    fake, calls = _counting_uncached()
    monkeypatch.setattr(domain_checker, "_analyze_domain_uncached", fake)

    domain_checker.analyze_domain("a.com")
    domain_checker.analyze_domain("b.com")
    domain_checker.analyze_domain("a.com")  # touch a -> b is now the LRU
    domain_checker.analyze_domain("c.com")  # inserts c, evicts b

    stats = domain_checker.get_cache_stats()
    assert stats["size"] == 2
    assert stats["evictions"] == 1

    domain_checker.analyze_domain("b.com")  # b was evicted -> re-looked-up
    assert calls.count("b.com") == 2


def test_concurrent_identical_lookups_collapse_to_single_call(monkeypatch):
    worker_count = 8
    call_lock = threading.Lock()
    call_count = {"n": 0}
    barrier = threading.Barrier(worker_count)

    def slow(domain):
        with call_lock:
            call_count["n"] += 1
        # Hold the per-domain lock long enough that peers pile up behind it.
        threading.Event().wait(0.2)
        return {"url": domain, "risk_score": 10}, False

    monkeypatch.setattr(domain_checker, "_analyze_domain_uncached", slow)

    results = []
    results_lock = threading.Lock()

    def worker():
        barrier.wait()  # release all threads together to force the herd
        verdict = domain_checker.analyze_domain("herd.com")
        with results_lock:
            results.append(verdict)

    threads = [threading.Thread(target=worker) for _ in range(worker_count)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert call_count["n"] == 1  # thundering herd collapsed to one lookup
    assert len(results) == worker_count
    stats = domain_checker.get_cache_stats()
    assert stats["misses"] == 1
    assert stats["hits"] == worker_count - 1
