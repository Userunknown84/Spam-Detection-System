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

        assert rows[0] == ["text", "predicted_label", "correct_label", "submitted_at"]
        assert rows[1][:3] == ["Win a free prize now!", "ham", "spam"]

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
        assert rows[0] == ["text", "predicted_label", "correct_label", "submitted_at"]

    def test_invalid_label_rejected(self, client):
        c, feedback_file = client
        res = c.post("/feedback", json={
            "text": "some text",
            "predicted_label": "ham",
            "correct_label": "offensive",
        })
        assert res.status_code == 400
        body = res.get_json()
        assert body["error"] == "Invalid feedback data"
        assert body["error_detail"]["code"] == "INVALID_FEEDBACK"
        assert not feedback_file.exists()

    def test_missing_text_rejected(self, client):
        c, feedback_file = client
        res = c.post("/feedback", json={
            "predicted_label": "ham",
            "correct_label": "spam",
        })
        assert res.status_code == 400
        body = res.get_json()
        assert body["error"] == "Invalid feedback data"
        assert body["error_detail"]["code"] == "INVALID_FEEDBACK"
        assert not feedback_file.exists()

    def test_missing_correct_label_rejected(self, client):
        c, feedback_file = client
        res = c.post("/feedback", json={
            "text": "some text",
            "predicted_label": "ham",
        })
        assert res.status_code == 400
        body = res.get_json()
        assert body["error"] == "Invalid feedback data"
        assert body["error_detail"]["code"] == "INVALID_FEEDBACK"
        assert not feedback_file.exists()


class TestFeedbackStats:
    """Covers the GET /feedback/stats endpoint added for #823, which
    surfaces the previously write-only feedback data collected above."""

    def test_empty_when_no_feedback_yet(self, client):
        c, _ = client
        res = c.get("/feedback/stats")
        assert res.status_code == 200
        assert res.get_json() == {
            "total": 0,
            "corrections": 0,
            "correction_rate": 0.0,
            "by_predicted_label": {},
            "recent": [],
        }

    def test_aggregates_corrections_and_confirmations(self, client):
        c, _ = client
        # ham predicted, corrected to spam twice, confirmed as ham once
        c.post("/feedback", json={"text": "a", "predicted_label": "ham", "correct_label": "spam"})
        c.post("/feedback", json={"text": "b", "predicted_label": "ham", "correct_label": "spam"})
        c.post("/feedback", json={"text": "c", "predicted_label": "ham", "correct_label": "ham"})
        # spam predicted, corrected to smishing once
        c.post("/feedback", json={"text": "d", "predicted_label": "spam", "correct_label": "smishing"})

        res = c.get("/feedback/stats")
        assert res.status_code == 200
        data = res.get_json()

        assert data["total"] == 4
        assert data["corrections"] == 3
        assert data["correction_rate"] == 0.75

        assert data["by_predicted_label"]["ham"]["total"] == 3
        assert data["by_predicted_label"]["ham"]["corrections"] == 2
        assert data["by_predicted_label"]["ham"]["corrected_to"] == {"spam": 2}

        assert data["by_predicted_label"]["spam"]["total"] == 1
        assert data["by_predicted_label"]["spam"]["corrections"] == 1
        assert data["by_predicted_label"]["spam"]["corrected_to"] == {"smishing": 1}

    def test_recent_is_most_recent_first_and_capped_at_20(self, client):
        c, _ = client
        for i in range(25):
            c.post("/feedback", json={
                "text": f"message {i}",
                "predicted_label": "ham",
                "correct_label": "spam",
            })

        res = c.get("/feedback/stats")
        data = res.get_json()

        assert data["total"] == 25
        assert len(data["recent"]) == 20
        # Most recently submitted (message 24) should be first.
        assert data["recent"][0]["text_preview"] == "message 24"
        assert data["recent"][0]["predicted_label"] == "ham"
        assert data["recent"][0]["correct_label"] == "spam"
        assert data["recent"][0]["submitted_at"]

    def test_text_preview_truncated(self, client):
        c, _ = client
        long_text = "x" * 500
        c.post("/feedback", json={
            "text": long_text,
            "predicted_label": "ham",
            "correct_label": "spam",
        })

        res = c.get("/feedback/stats")
        data = res.get_json()
        assert len(data["recent"][0]["text_preview"]) == 100
