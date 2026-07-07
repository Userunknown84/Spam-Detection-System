import csv
import os
import sys
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


@pytest.fixture
def client(tmp_path, monkeypatch):
    feedback_file = tmp_path / "feedback_store.csv"
    monkeypatch.setattr(api_module, "FEEDBACK_FILE", str(feedback_file))
    api_module.app.config["TESTING"] = True
    with api_module.app.test_client() as c:
        yield c, feedback_file


class TestFeedback:
    """Covers the /feedback endpoint added for #58."""

    def test_valid_correction_creates_csv_with_header(self, client):
        c, feedback_file = client
        res = c.post("/feedback", json={
            "text": "Win a free prize now!",
            "predicted_label": "ham",
            "correct_label": "spam",
        })
        assert res.status_code == 201
        assert res.get_json() == {"message": "Feedback recorded. Thank you!"}

        with open(feedback_file, newline="", encoding="utf-8") as f:
            rows = list(csv.reader(f))

        assert rows[0] == ["text", "predicted_label", "correct_label", "submitted_at", "is_correct", "corrected_label"]
        assert rows[1][:3] == ["Win a free prize now!", "ham", "spam"]
        assert rows[1][4] == "False"
        assert rows[1][5] == "spam"

    def test_confirming_correct_prediction(self, client):
        c, feedback_file = client
        res = c.post("/feedback", json={
            "text": "Let's catch up tomorrow",
            "predicted_label": "ham",
            "correct_label": "ham",
        })
        assert res.status_code == 201

        with open(feedback_file, newline="", encoding="utf-8") as f:
            rows = list(csv.reader(f))

        assert rows[1][1] == "ham"
        assert rows[1][2] == "ham"
        assert rows[1][4] == "True"
        assert rows[1][5] == ""

    def test_appends_multiple_rows_without_duplicate_headers(self, client):
        c, feedback_file = client
        for label in ("spam", "smishing", "ham"):
            res = c.post("/feedback", json={
                "text": f"sample {label}",
                "predicted_label": "ham",
                "correct_label": label,
            })
            assert res.status_code == 201

        with open(feedback_file, newline="", encoding="utf-8") as f:
            rows = list(csv.reader(f))

        assert len(rows) == 4  # header + 3 feedback rows
        assert rows[0] == ["text", "predicted_label", "correct_label", "submitted_at", "is_correct", "corrected_label"]

    def test_invalid_label_rejected(self, client):
        c, feedback_file = client
        res = c.post("/feedback", json={
            "text": "some text",
            "predicted_label": "ham",
            "correct_label": "invalid_label",
        })
        assert res.status_code == 400
        assert res.get_json() == {"error": "Invalid feedback data"}
        assert not feedback_file.exists()

    def test_missing_text_rejected(self, client):
        c, feedback_file = client
        res = c.post("/feedback", json={
            "predicted_label": "ham",
            "correct_label": "spam",
        })
        assert res.status_code == 400
        assert res.get_json() == {"error": "Invalid feedback data"}
        assert not feedback_file.exists()

    def test_missing_correct_label_rejected(self, client):
        c, feedback_file = client
        res = c.post("/feedback", json={
            "text": "some text",
            "predicted_label": "ham",
        })
        assert res.status_code == 400
        assert res.get_json() == {"error": "Invalid feedback data"}
        assert not feedback_file.exists()

    def test_feedback_summary_empty(self, client):
        c, feedback_file = client
        res = c.get("/feedback/summary")
        assert res.status_code == 200
        data = res.get_json()
        assert data["total_feedback"] == 0
        assert data["correct_predictions"] == 0
        assert data["incorrect_predictions"] == 0
        assert data["false_positives"] == 0
        assert data["false_negatives"] == 0
        assert data["accuracy_percentage"] == 0.0

    def test_feedback_summary_calculations(self, client):
        c, feedback_file = client
        feedbacks = [
            {"text": "t1", "predicted_label": "ham", "correct_label": "ham"},
            {"text": "t2", "predicted_label": "spam", "correct_label": "spam"},
            {"text": "t3", "predicted_label": "spam", "correct_label": "ham"},
            {"text": "t4", "predicted_label": "ham", "correct_label": "spam"},
            {"text": "t5", "predicted_label": "ham", "correct_label": "smishing"},
            {"text": "t6", "predicted_label": "smishing", "correct_label": "smishing"},
            {"text": "t7", "predicted_label": "ham", "correct_label": "offensive"},
        ]
        for fb in feedbacks:
            res = c.post("/feedback", json=fb)
            assert res.status_code == 201

        res = c.get("/feedback/summary")
        assert res.status_code == 200
        data = res.get_json()
        assert data["total_feedback"] == 7
        assert data["correct_predictions"] == 3
        assert data["incorrect_predictions"] == 4
        assert data["false_positives"] == 1
        assert data["false_negatives"] == 3
        assert data["accuracy_percentage"] == round(3 / 7 * 100, 2)

    def test_feedback_history(self, client):
        c, feedback_file = client
        c.post("/feedback", json={"text": "t1", "predicted_label": "ham", "correct_label": "ham"})
        c.post("/feedback", json={"text": "t2", "predicted_label": "spam", "correct_label": "spam"})

        res = c.get("/feedback/history")
        assert res.status_code == 200
        data = res.get_json()
        assert len(data) == 2
        assert data[0]["text"] == "t1"
        assert data[1]["text"] == "t2"
        assert data[0]["is_correct"] is True
        assert data[1]["is_correct"] is True
