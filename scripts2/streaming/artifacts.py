from __future__ import annotations

import uuid
from sqlite3 import Connection
from typing import Any

from scripts2.streaming.events import utc_now


def record_artifact(
    conn: Connection,
    *,
    artifact_type: str,
    sutta_id: str | None,
    local_uri: str | None,
    created_by: str,
    schema_version: str = "1.0",
    status: str = "completed",
    sha256: str | None = None,
    input_hashes: dict[str, str] | None = None,
) -> str:
    """Record a new artifact in the database grunt."""
    import json
    artifact_id = f"art_{uuid.uuid4().hex}"
    conn.execute(
        """
        insert into artifact_records (
          artifact_id, artifact_type, sutta_id, schema_version,
          local_uri, sha256, input_hashes_json, created_by,
          created_at, status
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            artifact_id,
            artifact_type,
            sutta_id,
            schema_version,
            local_uri,
            sha256,
            json.dumps(input_hashes or {}, sort_keys=True),
            created_by,
            utc_now(),
            status,
        ),
    )
    return artifact_id
