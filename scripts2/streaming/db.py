from __future__ import annotations

import sqlite3
from pathlib import Path

from scripts2.config import DATA_ROOT


STREAMING_ROOT = DATA_ROOT / "work" / "streaming"
DEFAULT_DB_PATH = STREAMING_ROOT / "pipeline.sqlite3"
SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def connect(db_path: Path | None = None) -> sqlite3.Connection:
    path = db_path or DEFAULT_DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("pragma foreign_keys = on")
    return conn


def init_db(db_path: Path | None = None) -> Path:
    path = db_path or DEFAULT_DB_PATH
    with connect(path) as conn:
      conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
      conn.commit()
    return path

