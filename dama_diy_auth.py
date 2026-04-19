"""SQLite + bcrypt users for DAMA_DIY_AUTH (no Firebase)."""

from __future__ import annotations

import os
import re
import sqlite3
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import bcrypt

_lock = threading.RLock()
_db_path: Optional[Path] = None
# bcrypt uses only the first 72 bytes; longer passwords must be truncated (UTF-8 byte slice).
_BCRYPT_MAX_BYTES = 72


def _password_for_bcrypt(raw: str) -> bytes:
    return (raw or "").encode("utf-8")[:_BCRYPT_MAX_BYTES]


def _hash_password(raw: str) -> str:
    pw = _password_for_bcrypt(raw)
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("ascii")


def _verify_password(raw: str, stored_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_password_for_bcrypt(raw), stored_hash.encode("ascii"))
    except ValueError:
        return False


def diy_auth_enabled() -> bool:
    """Username/password gate is on by default; set DAMA_DIY_AUTH=0 for open chat (no login)."""
    v = os.environ.get("DAMA_DIY_AUTH", "").strip().lower()
    return v not in ("0", "false", "no", "off")


def db_path(base_dir: Path) -> Path:
    global _db_path
    if _db_path is not None:
        return _db_path
    raw = os.environ.get("DAMA_AUTH_DB_PATH", "").strip()
    _db_path = Path(raw).expanduser().resolve() if raw else (base_dir / "dama_users.sqlite")
    return _db_path


def _connect(base_dir: Path) -> sqlite3.Connection:
    p = db_path(base_dir)
    p.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(p), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(base_dir: Path) -> None:
    with _lock:
        c = _connect(base_dir)
        try:
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    created_at REAL NOT NULL
                )
                """
            )
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS pedagogy_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    ts REAL NOT NULL,
                    kind TEXT NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )
            c.execute(
                "CREATE INDEX IF NOT EXISTS idx_pedagogy_user_ts ON pedagogy_events (user_id, ts)"
            )
            cols = [str(r[1]) for r in c.execute("PRAGMA table_info(users)").fetchall()]
            if "display_name" not in cols:
                c.execute("ALTER TABLE users ADD COLUMN display_name TEXT")
            c.commit()
        finally:
            c.close()


def normalize_username(raw: str) -> str:
    s = (raw or "").strip()
    # Allow . and - so names like "user.name" work; still no spaces or @ (use Firebase for email sign-in).
    if not re.match(r"^[a-zA-Z0-9_.-]{3,32}$", s):
        raise ValueError(
            "username must be 3–32 characters: letters, digits, underscore, dot, or hyphen (no spaces)"
        )
    return s


def create_user(base_dir: Path, username: str, password: str) -> Tuple[int, str]:
    if len(password or "") < 6:
        raise ValueError("password must be at least 6 characters")
    u = normalize_username(username)
    init_db(base_dir)
    h = _hash_password(password)
    import time

    now = time.time()
    with _lock:
        c = _connect(base_dir)
        try:
            c.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)",
                (u, h, now),
            )
            c.commit()
            uid = int(c.execute("SELECT last_insert_rowid()").fetchone()[0])
        except sqlite3.IntegrityError as e:
            raise ValueError("username already taken") from e
        finally:
            c.close()
    return uid, u


def verify_user(base_dir: Path, username: str, password: str) -> Tuple[int, str]:
    u = normalize_username(username)
    init_db(base_dir)
    with _lock:
        c = _connect(base_dir)
        try:
            row = c.execute("SELECT id, password_hash FROM users WHERE username = ?", (u,)).fetchone()
        finally:
            c.close()
    if row is None:
        raise ValueError("invalid username or password")
    if not _verify_password(password, str(row["password_hash"])):
        raise ValueError("invalid username or password")
    return int(row["id"]), u


def get_user_by_id(base_dir: Path, user_id: int) -> Optional[Tuple[int, str, Optional[str]]]:
    init_db(base_dir)
    with _lock:
        c = _connect(base_dir)
        try:
            row = c.execute(
                "SELECT id, username, display_name FROM users WHERE id = ?", (int(user_id),)
            ).fetchone()
        finally:
            c.close()
    if row is None:
        return None
    dn = row["display_name"]
    disp = (str(dn).strip() if dn is not None else "") or None
    return int(row["id"]), str(row["username"]), disp


def update_display_name(base_dir: Path, user_id: int, display_name: str) -> None:
    init_db(base_dir)
    uid = int(user_id)
    raw = (display_name or "").strip()[:128] or None
    with _lock:
        c = _connect(base_dir)
        try:
            c.execute("UPDATE users SET display_name = ? WHERE id = ?", (raw, uid))
            if c.total_changes == 0:
                raise ValueError("user not found")
            c.commit()
        finally:
            c.close()


def append_pedagogy_event(
    base_dir: Path, user_id: int, kind: str, payload: Optional[Dict[str, Any]] = None
) -> int:
    """Append one analytics / pedagogy row for a DIY user (same SQLite DB as accounts)."""
    import json
    import time

    init_db(base_dir)
    uid = int(user_id)
    ts = time.time()
    raw = json.dumps(payload or {}, ensure_ascii=False)
    k = (kind or "").strip()[:128] or "event"
    with _lock:
        c = _connect(base_dir)
        try:
            c.execute(
                "INSERT INTO pedagogy_events (user_id, ts, kind, payload) VALUES (?,?,?,?)",
                (uid, ts, k, raw),
            )
            c.commit()
            rid = int(c.execute("SELECT last_insert_rowid()").fetchone()[0])
        finally:
            c.close()
    return rid


def list_pedagogy_events(base_dir: Path, user_id: int, limit: int = 100) -> List[Dict[str, Any]]:
    import json

    init_db(base_dir)
    uid = int(user_id)
    lim = max(1, min(int(limit), 500))
    with _lock:
        c = _connect(base_dir)
        try:
            rows = c.execute(
                """
                SELECT id, ts, kind, payload FROM pedagogy_events
                WHERE user_id = ? ORDER BY ts DESC LIMIT ?
                """,
                (uid, lim),
            ).fetchall()
        finally:
            c.close()
    out: List[Dict[str, Any]] = []
    for row in rows:
        try:
            payload = json.loads(str(row["payload"]) or "{}")
        except json.JSONDecodeError:
            payload = {}
        out.append(
            {
                "id": int(row["id"]),
                "ts": float(row["ts"]),
                "kind": str(row["kind"]),
                "payload": payload,
            }
        )
    return out
