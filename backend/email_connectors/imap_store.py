import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = os.getenv(
    "IMAP_DB_PATH",
    str(Path(__file__).resolve().parents[1] / "imap_connections.db"),
)

ALLOWED_INTERVALS = (15, 30, 60)


def _connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with _connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS imap_connections (
                username TEXT PRIMARY KEY,
                host TEXT NOT NULL,
                port INTEGER NOT NULL,
                imap_username TEXT NOT NULL,
                encrypted_password TEXT NOT NULL,
                scan_interval_minutes INTEGER NOT NULL,
                consent_given_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_scan_at TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS imap_scan_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                message_id TEXT,
                subject TEXT,
                sender TEXT,
                date TEXT,
                prediction TEXT,
                risk_score INTEGER,
                trust_level TEXT,
                scanned_at TEXT NOT NULL
            )
            """
        )
        # Check if columns exist and add if missing
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(imap_scan_results)")
        columns = [row[1] for row in cursor.fetchall()]
        if "result" not in columns:
            conn.execute("ALTER TABLE imap_scan_results ADD COLUMN result TEXT")
        if "confidence_score" not in columns:
            conn.execute("ALTER TABLE imap_scan_results ADD COLUMN confidence_score REAL")
        if "decision_score" not in columns:
            conn.execute("ALTER TABLE imap_scan_results ADD COLUMN decision_score REAL")
        if "confidence_level" not in columns:
            conn.execute("ALTER TABLE imap_scan_results ADD COLUMN confidence_level TEXT")
        conn.commit()


def save_connection(username, host, port, imap_username, encrypted_password, scan_interval_minutes):
    now = datetime.now(timezone.utc).isoformat()
    with _connection() as conn:
        conn.execute(
            """
            INSERT INTO imap_connections
                (username, host, port, imap_username, encrypted_password, scan_interval_minutes, consent_given_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(username) DO UPDATE SET
                host=excluded.host,
                port=excluded.port,
                imap_username=excluded.imap_username,
                encrypted_password=excluded.encrypted_password,
                scan_interval_minutes=excluded.scan_interval_minutes
            """,
            (username, host, port, imap_username, encrypted_password, scan_interval_minutes, now, now),
        )
        conn.commit()


def get_connection(username):
    with _connection() as conn:
        row = conn.execute(
            "SELECT * FROM imap_connections WHERE username = ?", (username,)
        ).fetchone()
        return dict(row) if row else None


def get_all_active_connections():
    with _connection() as conn:
        rows = conn.execute("SELECT * FROM imap_connections").fetchall()
        return [dict(row) for row in rows]


def update_schedule(username, scan_interval_minutes):
    with _connection() as conn:
        conn.execute(
            "UPDATE imap_connections SET scan_interval_minutes = ? WHERE username = ?",
            (scan_interval_minutes, username),
        )
        conn.commit()


def update_last_scan(username):
    now = datetime.now(timezone.utc).isoformat()
    with _connection() as conn:
        conn.execute(
            "UPDATE imap_connections SET last_scan_at = ? WHERE username = ?",
            (now, username),
        )
        conn.commit()
    return now


def delete_connection(username):
    with _connection() as conn:
        conn.execute("DELETE FROM imap_connections WHERE username = ?", (username,))
        conn.execute("DELETE FROM imap_scan_results WHERE username = ?", (username,))
        conn.commit()


def save_scan_results(username, scanned_emails):
    if not scanned_emails:
        return
    now = datetime.now(timezone.utc).isoformat()
    with _connection() as conn:
        # Fetch existing message IDs to deduplicate
        message_ids = [e.get("id") for e in scanned_emails if e.get("id")]
        existing = set()
        if message_ids:
            placeholders = ",".join(["?"] * len(message_ids))
            cursor = conn.execute(
                f"SELECT message_id FROM imap_scan_results WHERE username = ? AND message_id IN ({placeholders})",
                [username] + message_ids
            )
            existing = {row["message_id"] for row in cursor.fetchall()}
            
        new_emails = [e for e in scanned_emails if e.get("id") not in existing]
        if not new_emails:
            return

        conn.executemany(
            """
            INSERT INTO imap_scan_results
                (username, message_id, subject, sender, date, prediction, result, confidence_score, decision_score, confidence_level, risk_score, trust_level, scanned_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    username,
                    e.get("id"),
                    e.get("subject"),
                    e.get("sender"),
                    e.get("date"),
                    e.get("prediction"),
                    e.get("result"),
                    e.get("confidence_score"),
                    e.get("decision_score"),
                    e.get("confidence_level"),
                    e.get("risk_score"),
                    e.get("trust_level"),
                    now,
                )
                for e in new_emails
            ],
        )
        conn.commit()


def get_scan_history(username, limit=100, offset=0):
    with _connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM imap_scan_results
            WHERE username = ?
            ORDER BY scanned_at DESC
            LIMIT ? OFFSET ?
            """,
            (username, limit, offset),
        ).fetchall()
        return [dict(row) for row in rows]
