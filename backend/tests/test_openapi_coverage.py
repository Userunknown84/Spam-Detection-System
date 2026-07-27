"""Drift guard for the OpenAPI document (issue #985, PR 2/2).

Iterates the live Flask URL map and asserts every non-static route is
documented in ``build_spec()``. This fails CI the moment a new endpoint is
added without a matching spec entry, keeping the hand-authored contract honest.
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
os.environ.setdefault("URL_MODEL_PATH", str(BASE_DIR / "url_detector.pkl"))
os.environ.setdefault("URL_VECTORIZER_PATH", str(BASE_DIR / "url_vectorizer.pkl"))

sys.path.insert(0, str(BACKEND_DIR))

# Flask's built-in static route is infrastructure, not part of the API.
IGNORED_ENDPOINTS = {"static"}


def _load_app():
    try:
        import api as api_module  # noqa: E402
    except Exception as exc:  # pragma: no cover - env without ML deps/models
        pytest.skip(f"api import unavailable: {exc}")
    return api_module.app


def test_every_route_is_documented():
    app = _load_app()
    documented = set(build_spec()["paths"])

    undocumented = sorted(
        rule.rule
        for rule in app.url_map.iter_rules()
        if rule.endpoint not in IGNORED_ENDPOINTS and rule.rule not in documented
    )
    assert not undocumented, (
        "these registered routes are missing from the OpenAPI spec: " f"{undocumented}"
    )


def test_spec_has_no_phantom_paths():
    # The reverse direction: everything documented must actually exist, so the
    # spec can't drift by describing routes that were removed.
    app = _load_app()
    registered = {rule.rule for rule in app.url_map.iter_rules()}
    phantom = sorted(p for p in build_spec()["paths"] if p not in registered)
    assert not phantom, f"spec documents non-existent routes: {phantom}"
