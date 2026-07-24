import os
import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path

<<<<<<< Updated upstream
from imap_store import DB_PATH, get_db_connection
=======
from imap_store import DB_PATH, _connection
>>>>>>> Stashed changes
from crypto_utils import encrypt_secret, decrypt_secret


def init_db():
<<<<<<< Updated upstream
    with get_db_connection() as conn:
=======
    with _connection() as conn:
>>>>>>> Stashed changes
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS oauth_tokens (
                username TEXT NOT NULL,
                provider TEXT NOT NULL,
                encrypted_access_token TEXT NOT NULL,
                encrypted_refresh_token TEXT,
                expires_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (username, provider)
            )
            """
        )
        conn.commit()


def save_oauth_tokens(username, provider, tokens):
    access_token = tokens.get("access_token")
    if not access_token:
        raise ValueError("access_token is required")

    encrypted_access = encrypt_secret(access_token)

    # Get existing tokens first to preserve refresh token if not in the new response
    existing = get_oauth_tokens(username, provider)

    refresh_token = tokens.get("refresh_token")
    if not refresh_token and existing:
        refresh_token = existing.get("refresh_token")

    encrypted_refresh = encrypt_secret(refresh_token) if refresh_token else None

    expires_in = tokens.get("expires_in", 3600)
    now = datetime.now(timezone.utc)
    expires_at = (now + timedelta(seconds=int(expires_in))).isoformat()
    updated_at = now.isoformat()

<<<<<<< Updated upstream
    with get_db_connection() as conn:
=======
    with _connection() as conn:
>>>>>>> Stashed changes
        conn.execute(
            """
            INSERT INTO oauth_tokens (username, provider, encrypted_access_token, encrypted_refresh_token, expires_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(username, provider) DO UPDATE SET
                encrypted_access_token=excluded.encrypted_access_token,
                encrypted_refresh_token=coalesce(excluded.encrypted_refresh_token, encrypted_refresh_token),
                expires_at=excluded.expires_at,
                updated_at=excluded.updated_at
            """,
            (username, provider, encrypted_access, encrypted_refresh, expires_at, updated_at),
        )
        conn.commit()


def get_oauth_tokens(username, provider):
<<<<<<< Updated upstream
    with get_db_connection() as conn:
=======
    with _connection() as conn:
>>>>>>> Stashed changes
        row = conn.execute(
            "SELECT * FROM oauth_tokens WHERE username = ? AND provider = ?",
            (username, provider),
        ).fetchone()
        if not row:
            return None

        try:
            decrypted_access = decrypt_secret(row["encrypted_access_token"])
            decrypted_refresh = (
                decrypt_secret(row["encrypted_refresh_token"])
                if row["encrypted_refresh_token"]
                else None
            )
        except Exception as e:
            # Re-raise or return None if decryption fails
            raise e

        return {
            "access_token": decrypted_access,
            "refresh_token": decrypted_refresh,
            "expires_at": row["expires_at"],
            "updated_at": row["updated_at"]
        }


def delete_oauth_tokens(username, provider=None):
<<<<<<< Updated upstream
    with get_db_connection() as conn:
=======
    with _connection() as conn:
>>>>>>> Stashed changes
        if provider:
            conn.execute(
                "DELETE FROM oauth_tokens WHERE username = ? AND provider = ?",
                (username, provider),
            )
        else:
            conn.execute(
                "DELETE FROM oauth_tokens WHERE username = ?",
                (username,),
            )
        conn.commit()


def get_all_oauth_tokens():
<<<<<<< Updated upstream
    with get_db_connection() as conn:
=======
    with _connection() as conn:
>>>>>>> Stashed changes
        rows = conn.execute("SELECT * FROM oauth_tokens").fetchall()
        tokens_list = []
        for row in rows:
            try:
                decrypted_access = decrypt_secret(row["encrypted_access_token"])
                decrypted_refresh = (
                    decrypt_secret(row["encrypted_refresh_token"])
                    if row["encrypted_refresh_token"]
                    else None
                )
                tokens_list.append({
                    "username": row["username"],
                    "provider": row["provider"],
                    "access_token": decrypted_access,
                    "refresh_token": decrypted_refresh,
                    "expires_at": row["expires_at"],
                    "updated_at": row["updated_at"]
                })
            except Exception as e:
                print(f"[oauth_store] Failed to decrypt tokens for {row['username']} / {row['provider']}: {e}")
        return tokens_list


def get_expiring_oauth_tokens(threshold_minutes=10):
    now = datetime.now(timezone.utc)
    threshold = (now + timedelta(minutes=threshold_minutes)).isoformat()
<<<<<<< Updated upstream
    with get_db_connection() as conn:
=======
    with _connection() as conn:
>>>>>>> Stashed changes
        rows = conn.execute(
            "SELECT * FROM oauth_tokens WHERE expires_at <= ?",
            (threshold,),
        ).fetchall()
        tokens_list = []
        for row in rows:
            try:
                decrypted_access = decrypt_secret(row["encrypted_access_token"])
                decrypted_refresh = (
                    decrypt_secret(row["encrypted_refresh_token"])
                    if row["encrypted_refresh_token"]
                    else None
                )
                tokens_list.append({
                    "username": row["username"],
                    "provider": row["provider"],
                    "access_token": decrypted_access,
                    "refresh_token": decrypted_refresh,
                    "expires_at": row["expires_at"],
                    "updated_at": row["updated_at"]
                })
            except Exception as e:
                print(f"[oauth_store] Failed to decrypt expiring tokens for {row['username']} / {row['provider']}: {e}")
        return tokens_list
