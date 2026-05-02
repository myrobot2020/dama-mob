from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from sqlite3 import Connection, IntegrityError
from typing import Any


ROUTES: dict[str, tuple[str, ...]] = {
    "source.sutta.discovered": ("download", "panel_extraction"),
    "sutta.queued": ("download", "panel_extraction"),
    "audio.download.completed": ("transcription",),
    "transcript.completed": ("sutta_match",),
    "sutta_match.completed": ("segmentation",),
    "segments.completed": ("audio_timestamps", "generation"),
    "audio_timestamps.completed": ("validation",),
    "mcq.generated": ("validation",),
    "vocab.generated": ("validation",),
    "technique.generated": ("validation",),
    "image_selection.approved": ("image_match",),
    "images.matched": ("validation",),
    "sutta.ready_to_seal": ("seal",),
    "sutta.sealed": ("gcs_upload",),
    "sutta.uploaded": (),
}

SOURCE_COMPLETED_EVENTS = {"source.sutta.discovered", "sutta.queued"}

EVENT_STAGE_STATUS: dict[str, tuple[str, str]] = {
    "source.sutta.discovered": ("source", "completed"),
    "sutta.queued": ("source", "completed"),
    "audio.download.completed": ("audio", "completed"),
    "panel_extraction.completed": ("images", "candidates_ready"),
    "transcript.completed": ("transcript", "completed"),
    "sutta_match.completed": ("sutta_match", "completed"),
    "segments.completed": ("segments", "completed"),
    "audio_timestamps.completed": ("audio_timestamps", "completed"),
    "mcq.generated": ("generation", "completed"),
    "vocab.generated": ("vocab", "completed"),
    "technique.generated": ("technique", "completed"),
    "image_selection.approved": ("images", "selection_approved"),
    "images.matched": ("images", "completed"),
    "sutta.ready_to_seal": ("validation", "completed"),
    "sutta.sealed": ("seal", "sealed"),
    "sutta.uploaded": ("upload", "completed"),
}

WORKER_STAGE: dict[str, str] = {
    "download": "audio",
    "panel_extraction": "images",
    "transcription": "transcript",
    "sutta_match": "sutta_match",
    "segmentation": "segments",
    "audio_timestamps": "audio_timestamps",
    "generation": "generation",
    "image_match": "images",
    "validation": "validation",
    "seal": "seal",
    "gcs_upload": "upload",
}


def utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def stable_json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sutta_from_payload(payload: dict[str, Any]) -> str | None:
    for key in ("sutta_id", "sutta_hint", "matched_sutta_id"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def correlation_for(payload: dict[str, Any], sutta_id: str | None) -> str:
    if sutta_id:
        return f"sutta:{sutta_id}"
    source_id = payload.get("source_id")
    if isinstance(source_id, str) and source_id.strip():
        return f"source:{source_id.strip()}"
    return "pipeline:unknown"


def default_idempotency_key(event_type: str, payload: dict[str, Any]) -> str:
    sutta_id = sutta_from_payload(payload)
    if sutta_id:
        return f"{event_type}:{sutta_id}"
    source_id = payload.get("source_id")
    if isinstance(source_id, str) and source_id.strip():
        return f"{event_type}:{source_id.strip()}"
    return f"{event_type}:{stable_json(payload)}"


def publish_event(
    conn: Connection,
    *,
    event_type: str,
    payload: dict[str, Any],
    publisher: str,
    pipeline_run_id: str = "local",
    idempotency_key: str | None = None,
) -> tuple[str, bool]:
    sutta_id = sutta_from_payload(payload)
    event_id = f"evt_{uuid.uuid4().hex}"
    occurred_at = utc_now()
    correlation_id = correlation_for(payload, sutta_id)
    key = idempotency_key or default_idempotency_key(event_type, payload)
    payload_json = stable_json(payload)

    try:
        conn.execute(
            """
            insert into pipeline_events (
              event_id, event_type, occurred_at, publisher, pipeline_run_id,
              correlation_id, idempotency_key, payload_json
            ) values (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                event_type,
                occurred_at,
                publisher,
                pipeline_run_id,
                correlation_id,
                key,
                payload_json,
            ),
        )
    except IntegrityError:
        row = conn.execute(
            "select event_id from pipeline_events where idempotency_key = ?",
            (key,),
        ).fetchone()
        return str(row["event_id"]), False

    if sutta_id:
        update_stage_status(conn, sutta_id, event_type, event_id)
        route_jobs(conn, event_id, event_type, sutta_id)

    return event_id, True


def update_stage_status(conn: Connection, sutta_id: str, event_type: str, event_id: str) -> None:
    stage_status = EVENT_STAGE_STATUS.get(event_type)
    if stage_status:
        stage, status = stage_status
        upsert_stage(conn, sutta_id, stage, status, event_id)


def upsert_stage(
    conn: Connection,
    sutta_id: str,
    stage: str,
    status: str,
    event_id: str,
) -> None:
    conn.execute(
        """
        insert into stage_status (sutta_id, stage, status, latest_event_id, updated_at)
        values (?, ?, ?, ?, ?)
        on conflict(sutta_id, stage) do update set
          status = excluded.status,
          latest_event_id = excluded.latest_event_id,
          updated_at = excluded.updated_at
        """,
        (sutta_id, stage, status, event_id, utc_now()),
    )


def route_jobs(conn: Connection, event_id: str, event_type: str, sutta_id: str) -> None:
    for worker_type in ROUTES.get(event_type, ()):
        job_id = f"job_{uuid.uuid4().hex}"
        conn.execute(
            """
            insert or ignore into jobs (
              job_id, event_id, worker_type, sutta_id, status, updated_at
            ) values (?, ?, ?, ?, 'queued', ?)
            """,
            (job_id, event_id, worker_type, sutta_id, utc_now()),
        )
        stage = WORKER_STAGE.get(worker_type)
        if stage:
            upsert_stage(conn, sutta_id, stage, "queued", event_id)
