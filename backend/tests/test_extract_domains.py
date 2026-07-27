"""Precision tests for issue #974: ``domain_checker.extract_domains`` must not
treat ordinary prose as domains.

The old extractor matched any ``<label>.<2+ letters>`` token, so ``file.txt``,
``e.g``, ``example.`` and similar non-domains were "found" and then triggered
real WHOIS / DNSBL / threat-intel lookups. These tests pin the two halves of
the fix: known false positives are rejected, and a spread of genuine
domains/URLs (with and without a scheme, with subdomains, ports and paths) are
still extracted.
"""

from   pathlib                  import Path
import sys
import types

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

# domain_checker imports the optional `whois` package at module load, but
# extract_domains itself is pure-regex and needs no network deps. Register a
# minimal stub so the extractor is importable (and these tests run) in a minimal
# environment without pulling in python-whois.
if "whois" not in sys.modules:
    _whois_stub = types.ModuleType("whois")
    _whois_stub.whois = lambda *args, **kwargs: None  # pragma: no cover
    sys.modules["whois"] = _whois_stub

import domain_checker # noqa: E402


# Non-domain tokens that the loose pattern used to return. None of these should
# survive to a lookup.
FALSE_POSITIVES = [
    "file.txt",
    "report.pdf",
    "archive.zip",
    "photo.jpg",
    "notes.docx",
    "e.g",
    "i.e",
    "example.",
    ".com",
    "1.2.3.4",
    "v1.2.3",
    "end.Then a new sentence began",
    "the report.Read it carefully",
    "hello.world.this.is.prose",
]

# (input text, domain expected in the result) for legitimate domains/URLs.
REAL_DOMAINS = [
    ("visit http://example.com now", "example.com"),
    ("secure https://www.example.com/login", "example.com"),
    ("mail me at foo.co.uk please", "foo.co.uk"),
    ("api at https://api.service.io:8443/v1/health", "api.service.io"),
    ("deep sub blog.news.example.org rocks", "blog.news.example.org"),
    ("go to https://shop.example.store/cart?id=5", "shop.example.store"),
    ("ping user@mail.google.com about it", "mail.google.com"),
    ("grab it from downloads.python.org/files", "downloads.python.org"),
    ("brand new deals at cheap-prizes.xyz today", "cheap-prizes.xyz"),
    ("ccTLD host test.de reachable", "test.de"),
]


def test_known_false_positives_are_rejected():
    for text in FALSE_POSITIVES:
        assert domain_checker.extract_domains(text) == [], text


def test_real_domains_are_extracted():
    for text, expected in REAL_DOMAINS:
        assert expected in domain_checker.extract_domains(text), text


def test_www_prefix_is_normalized_and_deduplicated():
    result = domain_checker.extract_domains(
        "compare https://www.example.com against example.com"
    )
    assert result == ["example.com"]


def test_port_and_path_are_stripped_from_host():
    result = domain_checker.extract_domains("https://example.com:8080/a/b?c=d")
    assert result == ["example.com"]


def test_filename_and_domain_together_keeps_only_the_domain():
    result = domain_checker.extract_domains(
        "attached report.txt — details at https://example.com"
    )
    assert result == ["example.com"]


def test_case_is_normalized():
    assert domain_checker.extract_domains("Visit EXAMPLE.COM") == ["example.com"]


def test_result_is_sorted_and_unique():
    result = domain_checker.extract_domains(
        "b.com then a.com then b.com again and c.net"
    )
    assert result == ["a.com", "b.com", "c.net"]


def test_empty_and_domainless_text_return_empty_list():
    assert domain_checker.extract_domains("") == []
    assert domain_checker.extract_domains("just some words, nothing here") == []


def test_downstream_never_sees_non_domains():
    # analyze_text feeds extract_domains straight into per-domain lookups; if the
    # extractor is clean, a purely non-domain body yields no domains to analyze.
    result = domain_checker.analyze_text("see file.txt and read chapter e.g one")
    assert result["domains_found"] == []
    assert result["details"] == []
