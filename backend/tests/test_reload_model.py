"""Regression coverage for the /reload-model hot-swap subsystem (issue #973).

Exercises the auth gate, the atomic swap of the exact objects /predict serves,
monotonic version tracking, and the thread-safety of concurrent reloads/reads.
The internal-secret gate on /reload-model is enforced by the route itself
(independent of TESTING), so these tests run with TESTING on but the gate live.
"""

import os
import sys
import threading
from itertools import count
from pathlib import Path

import pytest

BASE_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = BASE_DIR / "backend"

os.environ.setdefault("MODEL_PATH", str(BASE_DIR / "linear_svm_model.pkl"))
os.environ.setdefault("VECTORIZER_PATH", str(BACKEND_DIR / "tfidf_vectorizer.pkl"))
os.environ.setdefault("LABEL_ENCODER_PATH", str(BASE_DIR / "label_encoder.pkl"))
os.environ.setdefault("URL_MODEL_PATH", str(BACKEND_DIR / "url_detector.pkl"))
os.environ.setdefault("URL_VECTORIZER_PATH", str(BACKEND_DIR / "url_vectorizer.pkl"))

sys.path.insert(0, str(BACKEND_DIR))

import api as api_module  # noqa: E402
import serving_state  # noqa: E402
from conftest import TEST_INTERNAL_SECRET  # noqa: E402

VALID_SECRET = {"X-Internal-Secret": TEST_INTERNAL_SECRET}


# Lightweight stand-ins for the real ML objects. Each object in a "family"
# carries the same token so a snapshot can be checked for internal coherence,
# and the fake model returns a JSON-serializable label derived from that token.
class _FakeModel:
    def __init__(self, token):
        self.token = token

    def predict(self, _vectorized):
        return [f"label-{self.token}"]


class _FakeVectorizer:
    def __init__(self, token):
        self.token = token

    def transform(self, texts):
        return list(texts)


class _FakeLabelEncoder:
    def __init__(self, token):
        self.token = token


class _FakeXAI:
    def __init__(self, token):
        self.token = token


def _family(token):
    return {
        "model": _FakeModel(token),
        "vectorizer": _FakeVectorizer(token),
        "label_encoder": _FakeLabelEncoder(token),
        "xai_service": _FakeXAI(token),
    }


def _make_loader():
    """A loader whose successive reloads hand back distinct, coherent families."""
    tokens = count(2)  # initial install is token 1; first reload -> token 2

    def loader():
        return _family(next(tokens))

    return loader


@pytest.fixture
def client():
    api_module.app.config["TESTING"] = True
    with api_module.app.test_client() as c:
        yield c


@pytest.fixture
def fake_state():
    """Point the process-wide serving state at fakes, restoring the real one."""
    original = serving_state.STATE
    serving_state.init_state(loader=_make_loader(), **_family(1))
    yield serving_state.STATE
    serving_state.STATE = original


def test_reload_rejected_without_secret(client, fake_state):
    res = client.post("/reload-model")
    assert res.status_code == 401


def test_reload_rejected_with_wrong_secret(client, fake_state):
    res = client.post("/reload-model", headers={"X-Internal-Secret": "not-the-secret"})
    assert res.status_code == 401


def test_reload_accepted_with_valid_secret(client, fake_state):
    res = client.post("/reload-model", headers=VALID_SECRET)
    assert res.status_code == 200
    body = res.get_json()
    assert body["status"] == "success"
    assert body["version"] == 2


def test_reload_swaps_the_objects_predict_serves(client, fake_state):
    before = client.post("/predict", json={"text": "hello world"}, headers=VALID_SECRET)
    assert before.status_code == 200
    assert before.get_json()["prediction"] == "label-1"

    reload_res = client.post("/reload-model", headers=VALID_SECRET)
    assert reload_res.get_json()["version"] == 2

    after = client.post("/predict", json={"text": "hello world"}, headers=VALID_SECRET)
    assert after.status_code == 200
    assert after.get_json()["prediction"] == "label-2"


def test_reload_bumps_version_monotonically(client, fake_state):
    versions = [
        client.post("/reload-model", headers=VALID_SECRET).get_json()["version"]
        for _ in range(3)
    ]
    assert versions == [2, 3, 4]


def test_model_status_reports_version_and_flags(client, fake_state):
    body = client.get("/model-status").get_json()
    assert body["version"] == 1
    assert body["model_loaded"] is True
    assert body["vectorizer_loaded"] is True
    assert body["label_encoder_loaded"] is True


def test_reload_failure_leaves_state_intact():
    def bad_loader():
        raise RuntimeError("model file vanished")

    state = serving_state.ServingState(loader=bad_loader, **_family(1))
    with pytest.raises(RuntimeError):
        state.reload()

    snap = state.snapshot()
    assert snap.version == 1
    assert snap.model.token == 1


def test_concurrent_reloads_and_reads_stay_coherent():
    state = serving_state.ServingState(loader=_make_loader(), **_family(1))
    errors = []
    incoherent = []
    n_reloads = 60

    def do_reload():
        try:
            state.reload()
        except Exception as e:  # noqa: BLE001 - surface any failure to the assert
            errors.append(e)

    def do_read():
        try:
            for _ in range(200):
                snap = state.snapshot()
                tokens = {
                    snap.model.token,
                    snap.vectorizer.token,
                    snap.label_encoder.token,
                    snap.xai_service.token,
                }
                if len(tokens) != 1:
                    incoherent.append(tokens)
        except Exception as e:  # noqa: BLE001
            errors.append(e)

    threads = [threading.Thread(target=do_reload) for _ in range(n_reloads)]
    threads += [threading.Thread(target=do_read) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert errors == []
    # A concurrent reload must never expose a mixed model/vectorizer set.
    assert incoherent == []
    assert state.version == 1 + n_reloads
