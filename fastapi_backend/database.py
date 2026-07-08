import threading
import mysql.connector
from mysql.connector import pooling
from backend.config import DB_HOST, DB_USER, DB_PASSWORD, DB_NAME

db_pool = None
pool_lock = threading.Lock()


def get_connection():
    global db_pool
    if db_pool is None:
        with pool_lock:
            if db_pool is None:
                db_pool = mysql.connector.pooling.MySQLConnectionPool(
                    pool_name="spam_detection_pool",
                    pool_size=10,
                    pool_reset_mode='session',
                    host=DB_HOST,
                    user=DB_USER,
                    password=DB_PASSWORD,
                    database=DB_NAME
                )
    return db_pool.get_connection()


def init_db():
    """Create the database and emails table if they don't exist."""
    # Connect to MySQL server without specifying the database
    conn = mysql.connector.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
    )
    cursor = conn.cursor()
    cursor.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME}")
    cursor.execute(f"USE {DB_NAME}")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS emails (
            email_id      INT AUTO_INCREMENT PRIMARY KEY,
            subject       VARCHAR(255)  NOT NULL,
            sender        VARCHAR(255)  NOT NULL,
            is_spam       BOOLEAN       NOT NULL DEFAULT FALSE,
            timestamp     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Sample data for testing
    cursor.execute("SELECT COUNT(*) FROM emails")
    count = cursor.fetchone()[0]
    if count == 0:
        sample_data = [
            ("Win a FREE iPhone now!!!", "promo@spam.com",        True),
            ("Team standup at 10am",     "manager@company.com",   False),
            ("You have won $1,000,000!", "lucky@winner.net",      True),
            ("Project update for Q3",    "colleague@company.com", False),
            ("URGENT: Verify your account", "noreply@phish.com",  True),
            ("Lunch plans tomorrow?",    "friend@gmail.com",      False),
        ]
        cursor.executemany(
            "INSERT INTO emails (subject, sender, is_spam) VALUES (%s, %s, %s)",
            sample_data,
        )
    conn.commit()
    cursor.close()
    conn.close()


# ── INSERT ───────────────────────────────────────────────────────────────────

def insert_email(subject: str, sender: str, is_spam: bool) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO emails (subject, sender, is_spam) VALUES (%s, %s, %s)",
        (subject, sender, is_spam),
    )
    conn.commit()
    new_id = cursor.lastrowid
    cursor.close()
    conn.close()
    return new_id


# ── UPDATE ───────────────────────────────────────────────────────────────────

def mark_email(email_id: int, is_spam: bool) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE emails SET is_spam = %s WHERE email_id = %s",
        (is_spam, email_id),
    )
    conn.commit()
    updated = cursor.rowcount > 0
    cursor.close()
    conn.close()
    return updated


# ── RETRIEVE ─────────────────────────────────────────────────────────────────

def get_spam_emails() -> list:
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        "SELECT * FROM emails WHERE is_spam = TRUE ORDER BY timestamp DESC"
    )
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return rows


def get_legitimate_emails() -> list:
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        "SELECT * FROM emails WHERE is_spam = FALSE ORDER BY timestamp DESC"
    )
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return rows


# ── COUNT ────────────────────────────────────────────────────────────────────

def count_spam() -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM emails WHERE is_spam = TRUE")
    count = cursor.fetchone()[0]
    cursor.close()
    conn.close()
    return count


def count_legitimate() -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM emails WHERE is_spam = FALSE")
    count = cursor.fetchone()[0]
    cursor.close()
    conn.close()
    return count