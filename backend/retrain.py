"""
retrain.py
----------
Retrains the spam-detection model using the original dataset PLUS
any accumulated user feedback, then overwrites the production model files.

Usage:
    python retrain.py
    python retrain.py --dataset dataset.csv --feedback output/feedback_store.csv

Behavior (per README spec):
    1. Loads the original training dataset (DATASET_PATH env var, default: dataset.csv)
    2. Loads feedback_store.csv (the corrected labels submitted via /feedback)
    3. Merges them into one training set (feedback's `correct_label` becomes the label)
    4. Encodes labels once with a single LabelEncoder and normalizes text with the
       same normalizer api.py uses at inference time.
    5. Fits the vectorizer + LinearSVC ONCE on a held-out train split to report an
       honest accuracy, then refits ONCE on the full combined data for the artifacts
       actually written to disk.
    6. Backs up the previous .pkl files (timestamped) and atomically overwrites:
         - linear_svm_model.pkl
         - tfidf_vectorizer.pkl
         - label_encoder.pkl
    7. Triggers a live model reload only AFTER a successful save.

Run this from the backend/ directory:
    cd backend
    python retrain.py
"""

import argparse
from   dataclasses              import dataclass
from   datetime                 import datetime
import os
import shutil
import sys
import tempfile

import joblib
import pandas as pd
import requests
from   sklearn.feature_extraction.text \
                                import TfidfVectorizer
from   sklearn.metrics          import accuracy_score, classification_report
from   sklearn.model_selection  import train_test_split
from   sklearn.preprocessing    import LabelEncoder
from   sklearn.svm              import LinearSVC

from   utils.text_normalizer    import normalizer

VALID_LABELS = {"ham", "spam", "smishing"}

# Serialization matches how api.py LOADS these (joblib.load) so training and
# serving agree on format.
MODEL_PATH = "linear_svm_model.pkl"
VECTORIZER_PATH = "tfidf_vectorizer.pkl"
LABEL_ENCODER_PATH = "label_encoder.pkl"

DEFAULT_MAX_FEATURES = 5000
DEFAULT_TEST_SIZE = 0.2
RANDOM_STATE = 42
MIN_TRAINING_ROWS = 10


@dataclass
class HoldoutEvaluation:
    """Honest held-out metric plus the artifacts used to compute it.

    The vectorizer here is fit on the TRAIN split only; the test split is
    merely transformed. Exposed so callers (and tests) can verify there is no
    train/test leakage.
    """

    accuracy: float
    report: str
    vectorizer: TfidfVectorizer
    train_texts: list
    test_texts: list


@dataclass
class RetrainResult:
    """Production artifacts (refit on the full combined dataset) plus the
    held-out evaluation used to sanity-check them before persistence."""

    label_encoder: LabelEncoder
    vectorizer: TfidfVectorizer
    model: LinearSVC
    holdout: HoldoutEvaluation
    n_rows: int


def load_dataset(path):
    """Load the base training dataset.

    Raises FileNotFoundError if the file is absent (callers decide how to
    surface it) and ValueError if the required columns are missing.
    """
    if not os.path.exists(path):
        raise FileNotFoundError(f"Dataset not found: {path}")

    df = pd.read_csv(path)
    if "text" not in df.columns and "message" in df.columns:
        df = df.rename(columns={"message": "text"})

    missing = {"text", "label"} - set(df.columns)
    if missing:
        raise ValueError(
            f"Dataset CSV {path} must have 'text' (or 'message') and 'label' "
            f"columns; missing: {sorted(missing)}"
        )

    df = df[["text", "label"]].dropna()
    print(f"Loaded base dataset: {len(df)} rows from {path}")
    return df


def load_feedback(path):
    """Load corrected feedback labels. A missing file is not an error -- we
    simply train on the base dataset alone."""
    if not os.path.exists(path):
        print(f"No feedback file found at {path} - training on base dataset only.")
        return pd.DataFrame(columns=["text", "label"])

    fb = pd.read_csv(path)
    required_cols = {"text", "predicted_label", "correct_label"}
    if not required_cols.issubset(fb.columns):
        print(f"{path} is missing expected columns {required_cols}. Skipping feedback.")
        return pd.DataFrame(columns=["text", "label"])

    # The user-corrected label is the ground truth, not the model's guess.
    fb = fb.rename(columns={"correct_label": "label"})[["text", "label"]]

    before = len(fb)
    fb = fb[fb["label"].isin(VALID_LABELS)].dropna(subset=["text", "label"])
    dropped = before - len(fb)
    if dropped > 0:
        print(f"Dropped {dropped} feedback rows with invalid/missing labels.")

    print(f"Loaded feedback: {len(fb)} usable rows from {path}")
    return fb


def build_training_frame(dataset_path, feedback_path):
    """Merge base dataset + feedback into one deduplicated, validated frame.

    Feedback rows override base rows with the same text (keep="last").
    """
    base_df = load_dataset(dataset_path)
    feedback_df = load_feedback(feedback_path)

    combined = pd.concat([base_df, feedback_df], ignore_index=True)
    combined = combined.drop_duplicates(subset=["text"], keep="last")
    combined = combined[combined["label"].isin(VALID_LABELS)].reset_index(drop=True)

    if len(combined) < MIN_TRAINING_ROWS:
        raise ValueError(
            f"Not enough data to retrain (need at least {MIN_TRAINING_ROWS} rows, "
            f"got {len(combined)})."
        )
    return combined


def train(
    combined,
    *,
    max_features=DEFAULT_MAX_FEATURES,
    test_size=DEFAULT_TEST_SIZE,
    random_state=RANDOM_STATE,
):
    """Deterministic training pipeline.

    Text is normalized with the same normalizer api.py applies at inference, so
    the vectorizer vocabulary matches what serving will see. Labels are encoded
    ONCE and the encoded integers are used for every fit -- no raw string labels
    leak into any model. The held-out fit and the production fit each happen
    exactly once.
    """
    normalized = combined["text"].apply(normalizer.normalize)

    label_encoder = LabelEncoder()
    y = label_encoder.fit_transform(combined["label"])
    print(f"Label encoder classes: {list(label_encoder.classes_)}")

    holdout = _evaluate_holdout(
        normalized,
        y,
        max_features=max_features,
        test_size=test_size,
        random_state=random_state,
        target_names=label_encoder.classes_,
    )
    print(f"Held-out accuracy: {holdout.accuracy * 100:.2f}%")
    print(holdout.report)

    # Production artifacts: refit ONCE on the full combined data with the same
    # encoded labels used above.
    print("Refitting on full dataset for production model...")
    vectorizer = TfidfVectorizer(max_features=max_features)
    X_full = vectorizer.fit_transform(normalized)
    model = LinearSVC()
    model.fit(X_full, y)

    return RetrainResult(
        label_encoder=label_encoder,
        vectorizer=vectorizer,
        model=model,
        holdout=holdout,
        n_rows=len(combined),
    )


def save_artifacts(
    result,
    *,
    model_path=MODEL_PATH,
    vectorizer_path=VECTORIZER_PATH,
    label_encoder_path=LABEL_ENCODER_PATH,
):
    """Persist the production artifacts with joblib (matching api.py's loader),
    writing each atomically so a crash mid-write cannot corrupt the live files."""
    _atomic_joblib_dump(result.model, model_path)
    _atomic_joblib_dump(result.vectorizer, vectorizer_path)
    _atomic_joblib_dump(result.label_encoder, label_encoder_path)
    print(f"Saved: {model_path}")
    print(f"Saved: {vectorizer_path}")
    print(f"Saved: {label_encoder_path}")


def backup_existing_files():
    """Copy existing .pkl files to a timestamped backup folder before overwriting."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = os.path.join("backups", timestamp)
    files_to_backup = [MODEL_PATH, VECTORIZER_PATH, LABEL_ENCODER_PATH]
    existing = [f for f in files_to_backup if os.path.exists(f)]
    if not existing:
        print("No existing model files found to back up (first-time training).")
        return

    os.makedirs(backup_dir, exist_ok=True)
    for f in existing:
        shutil.copy(f, os.path.join(backup_dir, os.path.basename(f)))
    print(f"Backed up existing model files to: {backup_dir}")


def trigger_model_reload():
    """Ask the running Flask API to hot-reload the freshly written artifacts."""
    internal_secret = os.getenv("INTERNAL_SECRET")
    flask_api_url = os.getenv("FLASK_API_URL", "http://localhost:5000")

    if not internal_secret:
        print("INTERNAL_SECRET not set, skipping reload trigger")
        return False

    try:
        response = requests.post(
            f"{flask_api_url}/reload-model",
            headers={"X-Internal-Secret": internal_secret},
        )
        if response.status_code == 200:
            print("Model reload triggered successfully")
            return True
        print(f"Model reload failed: {response.text}")
        return False
    except Exception as e:
        print(f"Failed to trigger model reload: {e}")
        return False


def main(argv=None):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    default_feedback = os.path.join(script_dir, "output", "feedback_store.csv")
    default_dataset = os.path.join(script_dir, "dataset.csv")

    parser = argparse.ArgumentParser(
        description="Retrain spam detection model with feedback data"
    )
    parser.add_argument(
        "--dataset",
        default=os.environ.get("DATASET_PATH", default_dataset),
        help="Path to original training dataset CSV (default: dataset.csv or $DATASET_PATH)",
    )
    parser.add_argument(
        "--feedback",
        default=default_feedback,
        help="Path to feedback CSV collected from /feedback endpoint",
    )
    parser.add_argument(
        "--max-features",
        type=int,
        default=DEFAULT_MAX_FEATURES,
        help=f"Max TF-IDF vocabulary size (default: {DEFAULT_MAX_FEATURES})",
    )
    parser.add_argument(
        "--test-size",
        type=float,
        default=DEFAULT_TEST_SIZE,
        help=f"Fraction of data held out for evaluation (default: {DEFAULT_TEST_SIZE})",
    )
    args = parser.parse_args(argv)

    print("=" * 60)
    print("Spam Detection Model Retraining")
    print("=" * 60)

    try:
        combined = build_training_frame(args.dataset, args.feedback)
    except (FileNotFoundError, ValueError) as e:
        print(f"Aborting: {e}")
        sys.exit(1)

    print(f"\nCombined training set: {len(combined)} rows")
    print(f"   Label distribution:\n{combined['label'].value_counts().to_string()}")

    result = train(combined, max_features=args.max_features, test_size=args.test_size)

    backup_existing_files()
    save_artifacts(result)

    print("\nRetraining complete. Triggering live model reload...")
    trigger_model_reload()


def _evaluate_holdout(
    normalized, y, *, max_features, test_size, random_state, target_names
):
    """Fit the vectorizer + model on the TRAIN split only and score the held-out
    test split. The vectorizer never sees the test text, so the reported metric
    is leakage-free."""
    X_train_text, X_test_text, y_train, y_test = train_test_split(
        normalized, y, test_size=test_size, random_state=random_state, stratify=y
    )

    vectorizer = TfidfVectorizer(max_features=max_features)
    X_train = vectorizer.fit_transform(X_train_text)
    X_test = vectorizer.transform(X_test_text)

    model = LinearSVC()
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)

    labels_present = sorted(set(y_test) | set(y_pred))
    report = classification_report(
        y_test,
        y_pred,
        labels=labels_present,
        target_names=[target_names[i] for i in labels_present],
        zero_division=0,
    )
    return HoldoutEvaluation(
        accuracy=accuracy_score(y_test, y_pred),
        report=report,
        vectorizer=vectorizer,
        train_texts=list(X_train_text),
        test_texts=list(X_test_text),
    )


def _atomic_joblib_dump(obj, path):
    """joblib.dump to a temp file in the destination directory, then os.replace
    so readers never observe a half-written artifact."""
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=directory, suffix=".tmp")
    os.close(fd)
    try:
        joblib.dump(obj, tmp_path)
        os.replace(tmp_path, path)
    except BaseException:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise


if __name__ == "__main__":
    main()
