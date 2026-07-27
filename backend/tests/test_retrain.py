"""Regression tests for the retrain pipeline (issue #975).

These deliberately avoid the real (large) dataset and the Flask app: they
generate a tiny synthetic dataset + feedback CSV in a temp dir and exercise
`retrain` directly. They lock in the three properties the bug violated:

    * no train/test leakage (the held-out vectorizer never sees test text),
    * label consistency (encoded integer labels are used for every fit),
    * artifact round-trip in the SAME format api.py loads (joblib).
"""

from   pathlib                  import Path
import sys

import joblib
import numpy as np
import pandas as pd
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

import retrain # noqa: E402


HAM_TEXTS = [
    "hey are we still meeting for lunch today",
    "can you send me the meeting notes please",
    "thanks for dinner last night it was lovely",
    "the report is ready whenever you want to review",
    "call mum when you get a chance this evening",
    "lets grab coffee tomorrow morning before work",
    "your package was delivered to the front desk",
    "happy birthday hope you have a wonderful day",
    "reminder the dentist appointment is on friday",
    "i left the keys under the mat as usual",
]

SPAM_TEXTS = [
    "congratulations you won a free cruise click now",
    "limited offer buy one get one free today only",
    "earn cash fast working from home guaranteed income",
    "you have been selected for an exclusive prize claim",
    "cheap meds no prescription needed order online now",
    "make money quick with this amazing investment secret",
    "win a brand new car enter the free sweepstakes",
    "urgent your subscription expired renew for a discount",
    "hot singles in your area waiting to chat tonight",
    "double your bitcoin instantly with our special deal",
]

SMISHING_TEXTS = [
    "your bank account is locked verify your details here",
    "usps could not deliver reschedule at this link now",
    "irs notice you owe taxes pay immediately to avoid arrest",
    "your paypal was accessed confirm identity via this link",
    "netflix payment failed update your card at this url",
    "amazon security alert sign in to secure your account",
    "your parcel is held pay the customs fee to release it",
    "apple id suspended restore access through this link",
    "you have a voicemail listen by logging in to this site",
    "bank transfer pending authorize now with your pin here",
]


def _write_dataset(path):
    rows = (
        [{"text": t, "label": "ham"} for t in HAM_TEXTS]
        + [{"text": t, "label": "spam"} for t in SPAM_TEXTS]
        + [{"text": t, "label": "smishing"} for t in SMISHING_TEXTS]
    )
    pd.DataFrame(rows).to_csv(path, index=False)


def _write_feedback(path, rows):
    pd.DataFrame(
        rows, columns=["text", "predicted_label", "correct_label", "submitted_at"]
    ).to_csv(path, index=False)


@pytest.fixture
def dataset_csv(tmp_path):
    path = tmp_path / "dataset.csv"
    _write_dataset(path)
    return path


@pytest.fixture
def trained(dataset_csv):
    combined = retrain.build_training_frame(
        str(dataset_csv), str(dataset_csv.parent / "missing_feedback.csv")
    )
    return retrain.train(combined, max_features=200, test_size=0.3)


def test_missing_dataset_raises_instead_of_crashing_at_import(tmp_path):
    # The old module ran pd.read_csv at import time; loading is now lazy and a
    # missing file surfaces as a catchable error, never an import crash.
    with pytest.raises(FileNotFoundError):
        retrain.load_dataset(str(tmp_path / "does_not_exist.csv"))


def test_no_train_test_leakage(trained):
    holdout = trained.holdout
    analyzer = holdout.vectorizer.build_analyzer()

    train_tokens = set()
    for text in holdout.train_texts:
        train_tokens.update(analyzer(text))

    vocab = set(holdout.vectorizer.get_feature_names_out())
    # Every learned feature must come from the train split; nothing may leak in
    # from the held-out test rows.
    assert vocab
    assert vocab <= train_tokens


def test_labels_are_encoded_consistently_everywhere(trained):
    classes = trained.model.classes_
    # Production model must be trained on encoded integer labels, not raw
    # strings like "ham"/"spam".
    assert classes.dtype.kind in "iu"
    assert set(classes) <= set(range(len(trained.label_encoder.classes_)))
    assert set(trained.label_encoder.classes_) == retrain.VALID_LABELS

    sample = trained.vectorizer.transform(
        [retrain.normalizer.normalize("free prize claim now")]
    )
    encoded_pred = trained.model.predict(sample)
    decoded = trained.label_encoder.inverse_transform(encoded_pred)[0]
    assert decoded in retrain.VALID_LABELS


def test_artifacts_roundtrip_in_joblib_format(trained, tmp_path):
    model_path = tmp_path / "linear_svm_model.pkl"
    vectorizer_path = tmp_path / "tfidf_vectorizer.pkl"
    label_encoder_path = tmp_path / "label_encoder.pkl"

    retrain.save_artifacts(
        trained,
        model_path=str(model_path),
        vectorizer_path=str(vectorizer_path),
        label_encoder_path=str(label_encoder_path),
    )

    assert (
        model_path.exists() and vectorizer_path.exists() and label_encoder_path.exists()
    )
    # No stray temp files left behind by the atomic write.
    assert not list(tmp_path.glob("*.tmp"))

    # Reload exactly the way api.py does (joblib.load) and predict end-to-end.
    model = joblib.load(model_path)
    vectorizer = joblib.load(vectorizer_path)
    label_encoder = joblib.load(label_encoder_path)

    vec = vectorizer.transform(
        [retrain.normalizer.normalize("your bank account is locked verify here")]
    )
    pred = model.predict(vec)
    assert isinstance(pred, np.ndarray)
    assert label_encoder.inverse_transform(pred)[0] in retrain.VALID_LABELS


def test_feedback_overrides_base_label(dataset_csv, tmp_path):
    feedback_path = tmp_path / "feedback_store.csv"
    ham_line = HAM_TEXTS[0]
    _write_feedback(
        feedback_path,
        [[ham_line, "ham", "spam", "2026-01-01T00:00:00+00:00"]],
    )

    combined = retrain.build_training_frame(str(dataset_csv), str(feedback_path))
    label = combined.loc[combined["text"] == ham_line, "label"].iloc[0]
    assert label == "spam"


def test_too_little_data_raises(tmp_path):
    path = tmp_path / "tiny.csv"
    pd.DataFrame(
        [
            {"text": "hello there", "label": "ham"},
            {"text": "win cash now", "label": "spam"},
        ]
    ).to_csv(path, index=False)
    with pytest.raises(ValueError):
        retrain.build_training_frame(str(path), str(tmp_path / "no_feedback.csv"))
