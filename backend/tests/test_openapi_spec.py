"""Tests for the hand-authored OpenAPI document (issue #985, PR 1/2).

Covers the spec in isolation -- version, the core routes it must describe, and
internal ``$ref`` integrity -- plus a check that every path it documents is a
real registered rule on the Flask app. Building the spec has no heavy
dependencies; the app-import check is loaded lazily so a missing ML model
doesn't fail the pure-spec assertions.
"""

import os
from   pathlib                  import Path
import sys

import pytest

from   openapi_spec             import build_spec

BASE_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = BASE_DIR / "backend"

os.environ.setdefault("MODEL_PATH", str(BASE_DIR / "linear_svm_model.pkl"))
os.environ.setdefault("VECTORIZER_PATH", str(BACKEND_DIR / "tfidf_vectorizer.pkl"))
os.environ.setdefault("LABEL_ENCODER_PATH", str(BASE_DIR / "label_encoder.pkl"))
os.environ.setdefault("URL_MODEL_PATH", str(BACKEND_DIR / "url_detector.pkl"))
os.environ.setdefault("URL_VECTORIZER_PATH", str(BACKEND_DIR / "url_vectorizer.pkl"))

sys.path.insert(0, str(BACKEND_DIR))

# The seven core routes PR 1/2 must document.
CORE_PATHS = {
    "/predict",
    "/feedback",
    "/feedback/stats",
    "/spam-insights",
    "/importance",
    "/analyze-email-header",
    "/health",
}


def _iter_refs(node):
    """Yield every "#/components/schemas/..." $ref target in a spec fragment."""
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "$ref" and isinstance(value, str):
                yield value
            else:
                yield from _iter_refs(value)
    elif isinstance(node, list):
        for item in node:
            yield from _iter_refs(item)


def test_openapi_version_is_3_0():
    assert build_spec()["openapi"].startswith("3.0")


def test_info_and_servers_present():
    spec = build_spec()
    assert spec["info"]["title"]
    assert spec["info"]["version"]
    assert spec["servers"]


def test_internal_secret_security_scheme_defined():
    spec = build_spec()
    schemes = spec["components"]["securitySchemes"]
    assert any(
        s.get("in") == "header" and s.get("name") == "X-Internal-Secret"
        for s in schemes.values()
    )


def test_core_paths_present():
    paths = build_spec()["paths"]
    missing = CORE_PATHS - set(paths)
    assert not missing, f"core paths missing from spec: {sorted(missing)}"


def test_all_refs_resolve():
    spec = build_spec()
    defined = set(spec["components"]["schemas"])
    for ref in _iter_refs(spec["paths"]):
        assert ref.startswith("#/components/schemas/"), ref
        name = ref.split("/")[-1]
        assert name in defined, f"unresolved $ref: {ref}"


def test_public_paths_opt_out_of_security():
    # /health is a probe and must be reachable without the internal secret.
    health = build_spec()["paths"]["/health"]["get"]
    assert health.get("security") == []


def test_documented_paths_are_registered_rules():
    try:
        import api as api_module  # noqa: E402
    except Exception as exc:  # pragma: no cover - env without ML deps/models
        pytest.skip(f"api import unavailable: {exc}")

    registered = {rule.rule for rule in api_module.app.url_map.iter_rules()}
    for path in build_spec()["paths"]:
        assert path in registered, f"spec documents unregistered path: {path}"
