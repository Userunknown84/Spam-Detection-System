import sys
from pathlib import Path
import pytest
import sqlite3
from datetime import datetime, timezone

BASE_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = BASE_DIR / "backend"

sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(BACKEND_DIR / "email_connectors"))

import api as api_module
import imap_store

@pytest.fixture
def clean_db(tmp_path, monkeypatch):
    db_path = tmp_path / "test_words.db"
    monkeypatch.setattr(imap_store, "DB_PATH", str(db_path))
    api_module.init_spam_words_db()
    imap_store.init_db()
    return db_path

def test_db_init(clean_db):
    conn = sqlite3.connect(str(clean_db))
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='spam_word_frequencies'")
    assert cursor.fetchone() is not None

def test_increment_spam_word_frequency(clean_db, monkeypatch):
    monkeypatch.setattr(imap_store, "DB_PATH", str(clean_db))
    api_module.increment_spam_word_frequency("free")
    api_module.increment_spam_word_frequency("free")
    api_module.increment_spam_word_frequency("urgent")
    
    data = api_module.get_db_wordcloud_data()
    assert len(data) == 2
    assert data[0]["word"] == "free"
    assert data[0]["count"] == 2
    assert data[1]["word"] == "urgent"
    assert data[1]["count"] == 1

def test_word_of_the_day(clean_db, monkeypatch):
    monkeypatch.setattr(imap_store, "DB_PATH", str(clean_db))
    
    # Empty DB fallback
    wotd = api_module.get_word_of_the_day_data()
    assert wotd["word"] == "free"
    assert wotd["count"] is None
    assert "Offered without cost" in wotd["definition"]
    
    # Add words
    api_module.increment_spam_word_frequency("urgent")
    wotd_updated = api_module.get_word_of_the_day_data()
    assert wotd_updated["word"] == "urgent"
    assert wotd_updated["count"] == 1
    assert "Requiring immediate action" in wotd_updated["definition"]

def test_word_of_the_day_endpoint(clean_db, monkeypatch):
    api_module.app.config["TESTING"] = True
    api_module.app.config["ENFORCE_INTERNAL_SECRET"] = False
    monkeypatch.setattr(imap_store, "DB_PATH", str(clean_db))
    
    with api_module.app.test_client() as client:
        res = client.get("/api/word-of-the-day")
        assert res.status_code == 200
        json_data = res.get_json()
        assert json_data["success"] is True
        assert json_data["data"]["word"] == "free"
