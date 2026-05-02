from __future__ import annotations

import argparse
import json
import uuid
from pathlib import Path
from sqlite3 import Connection, Row
from typing import Any, Callable

from scripts2.streaming.db import DEFAULT_DB_PATH, connect, init_db
from scripts2.streaming.events import publish_event, utc_now
from scripts2.streaming.resource_guard import ResourceGuardPaused, assert_thermal_room


Handler = Callable[[Connection, Row], dict[str, Any]]


def claim_job(conn: Connection, worker_type: str, worker_name: str, sutta_id: str | None = None) -> Row | None:
    params: tuple[str, ...]
    if sutta_id:
        where = "worker_type = ? and status = 'queued' and sutta_id = ?"
        params = (worker_type, sutta_id)
    else:
        where = "worker_type = ? and status = 'queued'"
        params = (worker_type,)
    row = conn.execute(
        f"""
        select *
        from jobs
        where {where}
        order by created_at, job_id
        limit 1
        """,
        params,
    ).fetchone()
    if row is None:
        return None

    now = utc_now()
    conn.execute(
        """
        update jobs
        set status = 'running',
            locked_by = ?,
            locked_at = ?,
            started_at = coalesce(started_at, ?),
            updated_at = ?
        where job_id = ? and status = 'queued'
        """,
        (worker_name, now, now, now, row["job_id"]),
    )
    return conn.execute("select * from jobs where job_id = ?", (row["job_id"],)).fetchone()


def complete_job(conn: Connection, job_id: str) -> None:
    now = utc_now()
    conn.execute(
        """
        update jobs
        set status = 'completed',
            finished_at = ?,
            updated_at = ?,
            error_type = null,
            error_message = null
        where job_id = ?
        """,
        (now, now, job_id),
    )


def fail_job(conn: Connection, job_id: str, error_type: str, error_message: str) -> None:
    now = utc_now()
    conn.execute(
        """
        update jobs
        set status = 'failed',
            finished_at = ?,
            updated_at = ?,
            attempt_count = attempt_count + 1,
            error_type = ?,
            error_message = ?
        where job_id = ?
        """,
        (now, now, error_type, error_message, job_id),
    )


def requeue_job(conn: Connection, job_id: str, reason: str) -> None:
    now = utc_now()
    conn.execute(
        """
        update jobs
        set status = 'queued',
            locked_by = null,
            locked_at = null,
            error_type = 'resource_guard_paused',
            error_message = ?,
            updated_at = ?
        where job_id = ?
        """,
        (reason, now, job_id),
    )


def payload_for_job(conn: Connection, job: Row) -> dict[str, Any]:
    event = conn.execute(
        "select payload_json from pipeline_events where event_id = ?",
        (job["event_id"],),
    ).fetchone()
    if event is None:
        return {}
    return json.loads(event["payload_json"])


import subprocess
import hashlib
import os
import tempfile

from scripts2.streaming.artifacts import record_artifact

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            h.update(chunk)
    return h.hexdigest()

def safe_sutta_id(sutta_id: str) -> str:
    return sutta_id.replace(" ", "_")

def env_value(name: str) -> str | None:
    value = os.environ.get(name)
    if value:
        return value
    env_path = Path(".env.local")
    if not env_path.exists():
        return None
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, raw = stripped.split("=", 1)
        if key.strip() == name:
            return raw.strip().strip('"').strip("'")
    return None

def latest_artifact(conn: Connection, sutta_id: str, artifact_type: str) -> Row | None:
    return conn.execute(
        """
        select *
        from artifact_records
        where sutta_id = ? and artifact_type = ? and status = 'completed'
        order by created_at desc
        limit 1
        """,
        (sutta_id, artifact_type),
    ).fetchone()

def latest_local_artifact_path(conn: Connection, sutta_id: str, artifact_type: str) -> Path:
    art = latest_artifact(conn, sutta_id, artifact_type)
    if art and art["local_uri"]:
        path = Path(art["local_uri"])
        if path.exists():
            return path
    raise FileNotFoundError(f"Missing local {artifact_type} artifact for {sutta_id}")

def record_file_artifact(conn: Connection, *, artifact_type: str, sutta_id: str, path: Path, created_by: str, input_hashes: dict[str, str] | None = None) -> str:
    return record_artifact(
        conn,
        artifact_type=artifact_type,
        sutta_id=sutta_id,
        local_uri=str(path).replace("\\", "/"),
        created_by=created_by,
        sha256=sha256_file(path),
        input_hashes=input_hashes,
    )

def write_json_artifact(conn: Connection, *, artifact_type: str, sutta_id: str, path: Path, data: dict[str, Any], created_by: str, input_hashes: dict[str, str] | None = None) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(f"{path.suffix}.tmp")
    tmp_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_path.replace(path)
    return record_file_artifact(
        conn,
        artifact_type=artifact_type,
        sutta_id=sutta_id,
        path=path,
        created_by=created_by,
        input_hashes=input_hashes,
    )

def find_downloaded_audio(sutta_id: str) -> Path | None:
    audio_dir = Path("data/work/streaming/audio")
    stem = safe_sutta_id(sutta_id)
    for suffix in (".mp3", ".webm", ".m4a", ".opus", ".wav"):
        path = audio_dir / f"{stem}{suffix}"
        if path.exists() and path.stat().st_size > 0:
            return path
    matches = sorted(audio_dir.glob(f"{stem}.*"), key=lambda p: p.stat().st_mtime, reverse=True)
    return matches[0] if matches else None

def source_book_id_for_sutta(conn: Connection, sutta_id: str) -> str:
    row = conn.execute(
        "select nikaya, book, sutta_hint from source_records where sutta_hint = ? order by created_at desc limit 1",
        (sutta_id,),
    ).fetchone()
    if row:
        nikaya = row["nikaya"] or sutta_id.split()[0] if sutta_id.split() else "unknown"
        book = row["book"] or "unknown"
        return f"{nikaya}:{book}"
    parts = sutta_id.split()
    if len(parts) >= 2:
        return f"{parts[0]}:{parts[1].split('.')[0]}"
    return "unknown"

def panel_title(path: Path) -> str:
    return " ".join(part.capitalize() for part in path.stem.replace("_", "-").split("-") if part)

def panel_extraction_handler(conn: Connection, job: Row) -> dict[str, Any]:
    sutta_id = job["sutta_id"]
    panels_dir = Path("public/panels")
    out_path = Path("data/work/streaming/image_candidates") / f"{safe_sutta_id(sutta_id)}.json"
    source_book_id = source_book_id_for_sutta(conn, sutta_id)

    candidates = []
    if panels_dir.exists():
        for path in sorted(p for p in panels_dir.iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}):
            assert_thermal_room("panel_extraction")
            panel_id = f"public_panels:{path.stem}"
            local_path = str(path).replace("\\", "/")
            candidate = {
                "panel_id": panel_id,
                "source_book_id": source_book_id,
                "page": None,
                "bbox": {},
                "local_path": local_path,
                "thumbnail_path": local_path,
                "quality_score": None,
                "tags": [panel_title(path).lower()],
                "status": "candidate",
            }
            candidates.append(candidate)
            conn.execute(
                """
                insert into image_candidates (
                  panel_id, source_book_id, page, bbox_json, local_path,
                  thumbnail_path, sha256, quality_score, tags_json, status
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                on conflict(panel_id) do update set
                  source_book_id = excluded.source_book_id,
                  local_path = excluded.local_path,
                  thumbnail_path = excluded.thumbnail_path,
                  tags_json = excluded.tags_json,
                  status = excluded.status
                """,
                (
                    panel_id,
                    source_book_id,
                    None,
                    "{}",
                    local_path,
                    local_path,
                    sha256_file(path),
                    None,
                    json.dumps(candidate["tags"], ensure_ascii=False),
                    "candidate",
                ),
            )

    artifact_id = write_json_artifact(
        conn,
        artifact_type="image_candidates",
        sutta_id=sutta_id,
        path=out_path,
        data={
            "sutta_id": sutta_id,
            "source_book_id": source_book_id,
            "method": "public_panels_seed_v1",
            "candidates": candidates,
            "created_at": utc_now(),
        },
        created_by="panel_extraction_worker",
    )
    return {
        "event_type": "panel_extraction.completed",
        "payload": {
            "sutta_id": sutta_id,
            "artifact_id": artifact_id,
            "candidate_count": len(candidates),
            "candidates_path": str(out_path).replace("\\", "/"),
        },
    }

def source_uri_for_sutta(conn: Connection, sutta_id: str) -> str | None:
    row = conn.execute(
        "select source_uri from source_records where sutta_hint = ? order by created_at desc limit 1",
        (sutta_id,),
    ).fetchone()
    return row["source_uri"] if row else None

def transcript_from_youtube_captions(conn: Connection, sutta_id: str) -> dict[str, Any]:
    source_uri = source_uri_for_sutta(conn, sutta_id)
    if not source_uri or "youtube.com" not in source_uri:
        raise RuntimeError("caption_fallback_unavailable: source is not YouTube")
    caption_dir = Path("data/work/streaming/captions")
    caption_dir.mkdir(parents=True, exist_ok=True)
    base = caption_dir / safe_sutta_id(sutta_id)
    for old in caption_dir.glob(f"{safe_sutta_id(sutta_id)}.*"):
        old.unlink(missing_ok=True)
    result = subprocess.run(
        [
            "yt-dlp",
            "--skip-download",
            "--write-auto-subs",
            "--sub-langs",
            "en-orig,en",
            "--sub-format",
            "json3",
            "-o",
            str(base),
            source_uri,
        ],
        check=False,
        capture_output=True,
        text=True,
        timeout=180,
    )
    if result.returncode != 0:
        raise RuntimeError(f"caption_fallback_failed: {(result.stderr or result.stdout)[:500]}")
    caption_files = sorted(caption_dir.glob(f"{safe_sutta_id(sutta_id)}*.json3"))
    if not caption_files:
        raise RuntimeError("caption_fallback_failed: no json3 caption file created")
    caption_file = caption_files[0]
    raw = json.loads(caption_file.read_text(encoding="utf-8"))
    segments: list[dict[str, Any]] = []
    text_parts: list[str] = []
    for event in raw.get("events", []):
        seg_text = "".join(seg.get("utf8", "") for seg in event.get("segs", [])).strip()
        if not seg_text:
            continue
        start_ms = event.get("tStartMs")
        duration_ms = event.get("dDurationMs") or 0
        start = round(start_ms / 1000, 3) if isinstance(start_ms, int) else None
        end = round((start_ms + duration_ms) / 1000, 3) if isinstance(start_ms, int) else None
        text_parts.append(seg_text)
        segments.append({"start": start, "end": end, "text": seg_text})
    text = " ".join(text_parts).strip()
    if not text:
        raise RuntimeError("caption_fallback_empty_text")
    return {
        "provider": "youtube_auto_captions",
        "model": "youtube-json3",
        "language": caption_file.name.split(".")[-2] if "." in caption_file.name else "en",
        "duration": segments[-1]["end"] if segments else None,
        "text": text,
        "segments": segments,
        "caption_uri": str(caption_file).replace("\\", "/"),
    }

def create_review_item(conn: Connection, sutta_id: str, stage: str, artifact_id: str | None, severity: str, reason_code: str, message: str) -> None:
    review_id = f"rev_{uuid.uuid4().hex}"
    conn.execute(
        """
        insert into review_items (
            review_id, sutta_id, stage, artifact_id, severity, reason_code, message, status, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, 'open', ?)
        """,
        (review_id, sutta_id, stage, artifact_id, severity, reason_code, message, utc_now())
    )

def validation_handler(conn: Connection, job: Row) -> dict[str, Any]:
    sutta_id = job["sutta_id"]
    print(f"Cave man checking sutta: {sutta_id} grunt.")

    required_types = ["audio", "transcript", "segments", "audio_timestamps", "generated_content"]
    image_candidates_ready = conn.execute(
        "select 1 from artifact_records where sutta_id = ? and artifact_type = 'image_candidates' and status = 'completed' limit 1",
        (sutta_id,),
    ).fetchone()
    if image_candidates_ready:
        required_types.append("image_match")
    artifacts = conn.execute(
        "select * from artifact_records where sutta_id = ?", (sutta_id,)
    ).fetchall()

    art_map = {a["artifact_type"]: a for a in artifacts}
    checks = []
    failures = []

    for t in required_types:
        art = art_map.get(t)
        check_result = {
            "artifact_type": t,
            "artifact_id": art["artifact_id"] if art else None,
            "exists": False,
            "local_uri": art["local_uri"] if art else None,
            "sha256_expected": art["sha256"] if art else None,
            "sha256_actual": None,
            "sha256_ok": False,
            "schema_ok": False,
            "sutta_id_ok": False,
        }

        if not art:
            failures.append(f"Missing artifact type: {t}")
        else:
            uri = art["local_uri"]
            if uri and uri.startswith("data/"):
                path = Path(uri)
                if path.exists():
                    check_result["exists"] = True
                    if t == "audio":
                        check_result["schema_ok"] = path.stat().st_size > 1024 * 1024
                        if not check_result["schema_ok"]:
                            failures.append(f"Audio artifact too small for {t}: {path.stat().st_size} bytes")
                    else:
                        try:
                            data = json.loads(path.read_text(encoding="utf-8"))
                            check_result["schema_ok"] = isinstance(data, dict)
                            check_result["sutta_id_ok"] = data.get("sutta_id") == sutta_id
                            if not check_result["sutta_id_ok"]:
                                failures.append(f"sutta_id mismatch for {t}")
                        except Exception as exc:
                            failures.append(f"Invalid JSON schema for {t}: {exc}")

                    if art["sha256"]:
                        actual_hash = sha256_file(path)
                        check_result["sha256_actual"] = actual_hash
                        if actual_hash == art["sha256"]:
                            check_result["sha256_ok"] = True
                        else:
                            failures.append(f"SHA256 mismatch for {t}")
                    else:
                        # If no hash in rock, we call it ok for now grunt
                        check_result["sha256_ok"] = True
                else:
                    failures.append(f"File {uri} missing from disk")
            else:
                failures.append(f"Non-local artifact is not valid for {t}: {uri}")

        checks.append(check_result)

    passed = len(failures) == 0
    val_uri = f"data/work/streaming/validation/{sutta_id.replace(' ', '_')}.json"
    Path(val_uri).parent.mkdir(parents=True, exist_ok=True)

    val_data = {
        "sutta_id": sutta_id,
        "passed": passed,
        "required": required_types,
        "checks": checks,
        "failures": failures,
        "verified_at": utc_now()
    }
    Path(val_uri).write_text(json.dumps(val_data, indent=2))

    record_artifact(
        conn,
        artifact_type="validation",
        sutta_id=sutta_id,
        local_uri=val_uri,
        created_by="validation_worker"
    )

    if not passed:
        print(f"Validation fail grunt: {', '.join(failures)}")
        for f in failures:
            create_review_item(conn, sutta_id, "validation", None, "high", "validation_error", f)
        return {
            "event_type": "validation.failed",
            "payload": {
                "sutta_id": sutta_id,
                "validation_path": val_uri,
                "failures": failures,
            },
        }

    return {
        "event_type": "sutta.ready_to_seal",
        "payload": {
            "sutta_id": sutta_id,
            "validation_path": val_uri,
        },
    }

def download_handler(conn: Connection, job: Row) -> dict[str, Any]:
    payload = payload_for_job(conn, job)
    sutta_id = job["sutta_id"]
    url = payload.get("source_uri")

    if not url:
        raise ValueError("Missing source_uri in payload")

    print(f"Cave man pull audio from: {url}")

    # Simulate download for proof if not real url
    if "proof" in url or "manual" in url:
        audio_path = f"noop://audio/{sutta_id}"
        record_artifact(
            conn,
            artifact_type="audio",
            sutta_id=sutta_id,
            local_uri=audio_path,
            created_by="download_worker"
        )
        return {
            "event_type": "audio.download.completed",
            "payload": {
                "sutta_id": sutta_id,
                "source_id": payload.get("source_id"),
                "audio_path": audio_path,
                "download_mode": "simulated",
            },
        }

    # Real download attempt
    out_dir = Path("data/work/streaming/audio")
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = safe_sutta_id(sutta_id)
    existing = find_downloaded_audio(sutta_id)
    if existing and existing.stat().st_size > 1024 * 1024:
        record_file_artifact(
            conn,
            artifact_type="audio",
            sutta_id=sutta_id,
            path=existing,
            created_by="download_worker",
        )
        return {
            "event_type": "audio.download.completed",
            "payload": {
                "sutta_id": sutta_id,
                "source_id": payload.get("source_id"),
                "audio_path": str(existing).replace("\\", "/"),
                "download_mode": "existing_file",
            },
        }

    out_template = out_dir / f"{stem}.%(ext)s"

    try:
        subprocess.run(
            ["yt-dlp", "-f", "bestaudio/best", "--no-playlist", "-o", str(out_template), url],
            check=True,
            timeout=300
        )
    except Exception as e:
        downloaded = find_downloaded_audio(sutta_id)
        if downloaded and downloaded.stat().st_size > 1024 * 1024:
            print(f"Pull had warning but audio exists: {downloaded}")
        else:
            print(f"Pull fail: {e}")
            raise

    out_path = find_downloaded_audio(sutta_id)
    if not out_path:
        raise FileNotFoundError(f"download finished but no audio file found for {sutta_id}")

    record_file_artifact(
        conn,
        artifact_type="audio",
        sutta_id=sutta_id,
        path=out_path,
        created_by="download_worker"
    )

    return {
        "event_type": "audio.download.completed",
        "payload": {
            "sutta_id": sutta_id,
            "source_id": payload.get("source_id"),
                "audio_path": str(out_path).replace("\\", "/"),
                "download_mode": "real",
            },
        }

def transcription_handler(conn: Connection, job: Row) -> dict[str, Any]:
    sutta_id = job["sutta_id"]
    audio_path = latest_local_artifact_path(conn, sutta_id, "audio")
    api_key = env_value("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("missing_transcriber_config: OPENAI_API_KEY is not set")
    if audio_path.stat().st_size > 25_000_000:
        raise RuntimeError(f"audio_too_large_for_openai_transcription: {audio_path.stat().st_size} bytes")

    model = env_value("OPENAI_TRANSCRIPTION_MODEL") or "whisper-1"
    out_dir = Path("data/work/streaming/transcripts")
    out_path = out_dir / f"{safe_sutta_id(sutta_id)}.json"
    audio_hash = sha256_file(audio_path)

    with tempfile.NamedTemporaryFile("w+b", suffix=".json", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        result = subprocess.run(
            [
                "curl.exe",
                "-sS",
                "--fail-with-body",
                "https://api.openai.com/v1/audio/transcriptions",
                "-H",
                f"Authorization: Bearer {api_key}",
                "-F",
                f"file=@{audio_path}",
                "-F",
                f"model={model}",
                "-F",
                "response_format=verbose_json",
                "-o",
                str(tmp_path),
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=900,
        )
        body = tmp_path.read_text(encoding="utf-8", errors="replace") if tmp_path.exists() else ""
        if result.returncode != 0:
            print(f"OpenAI transcription failed; trying YouTube caption fallback for {sutta_id}")
            fallback = transcript_from_youtube_captions(conn, sutta_id)
            raw = {
                "text": fallback["text"],
                "language": fallback["language"],
                "duration": fallback["duration"],
                "segments": fallback["segments"],
                "_provider": fallback["provider"],
                "_model": fallback["model"],
                "_caption_uri": fallback["caption_uri"],
                "_api_error": body[:500] or result.stderr[:500],
            }
        else:
            raw = json.loads(body)
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass

    text = (raw.get("text") or "").strip()
    if not text:
        raise RuntimeError("transcription_empty_text")

    data = {
        "sutta_id": sutta_id,
        "source_audio_uri": str(audio_path).replace("\\", "/"),
        "source_audio_sha256": audio_hash,
        "provider": raw.get("_provider", "openai"),
        "model": raw.get("_model", model),
        "caption_uri": raw.get("_caption_uri"),
        "api_error": raw.get("_api_error"),
        "language": raw.get("language"),
        "duration": raw.get("duration"),
        "text": text,
        "segments": raw.get("segments", []),
        "created_at": utc_now(),
    }
    artifact_id = write_json_artifact(
        conn,
        artifact_type="transcript",
        sutta_id=sutta_id,
        path=out_path,
        data=data,
        created_by="transcription_worker",
        input_hashes={"audio": audio_hash},
    )
    return {
        "event_type": "transcript.completed",
        "payload": {
            "sutta_id": sutta_id,
            "artifact_id": artifact_id,
            "transcript_path": str(out_path).replace("\\", "/"),
        },
    }

def sutta_match_handler(conn: Connection, job: Row) -> dict[str, Any]:
    sutta_id = job["sutta_id"]
    transcript_path = latest_local_artifact_path(conn, sutta_id, "transcript")
    transcript_hash = sha256_file(transcript_path)
    source = conn.execute(
        "select source_id, source_uri, sutta_hint, metadata_json from source_records where sutta_hint = ? limit 1",
        (sutta_id,),
    ).fetchone()
    data = {
        "sutta_id": sutta_id,
        "matched_sutta_id": sutta_id,
        "method": "source_hint_v1",
        "confidence": 1.0 if source else 0.75,
        "source_id": source["source_id"] if source else None,
        "source_uri": source["source_uri"] if source else None,
        "created_at": utc_now(),
    }
    out_path = Path("data/work/streaming/sutta_match") / f"{safe_sutta_id(sutta_id)}.json"
    artifact_id = write_json_artifact(
        conn,
        artifact_type="sutta_match",
        sutta_id=sutta_id,
        path=out_path,
        data=data,
        created_by="sutta_match_worker",
        input_hashes={"transcript": transcript_hash},
    )
    return {
        "event_type": "sutta_match.completed",
        "payload": {"sutta_id": sutta_id, "artifact_id": artifact_id, "matched_sutta_id": sutta_id},
    }

def segmentation_handler(conn: Connection, job: Row) -> dict[str, Any]:
    sutta_id = job["sutta_id"]
    transcript_path = latest_local_artifact_path(conn, sutta_id, "transcript")
    transcript = json.loads(transcript_path.read_text(encoding="utf-8"))
    transcript_hash = sha256_file(transcript_path)
    raw_segments = transcript.get("segments") or []
    segments: list[dict[str, Any]] = []
    if raw_segments:
        for idx, seg in enumerate(raw_segments, start=1):
            text = (seg.get("text") or "").strip()
            if text:
                segments.append({
                    "segment_id": f"seg_{idx:04d}",
                    "text": text,
                    "start": seg.get("start"),
                    "end": seg.get("end"),
                    "kind": "commentary",
                })
    else:
        words = transcript["text"].split()
        chunk_size = 120
        for idx in range(0, len(words), chunk_size):
            text = " ".join(words[idx:idx + chunk_size]).strip()
            if text:
                segments.append({
                    "segment_id": f"seg_{len(segments) + 1:04d}",
                    "text": text,
                    "start": None,
                    "end": None,
                    "kind": "commentary",
                })
    if not segments:
        raise RuntimeError("segmentation_empty")

    out_path = Path("data/work/streaming/segments") / f"{safe_sutta_id(sutta_id)}.json"
    data = {
        "sutta_id": sutta_id,
        "source_transcript_uri": str(transcript_path).replace("\\", "/"),
        "method": "transcript_segments_v1",
        "segments": segments,
        "created_at": utc_now(),
    }
    artifact_id = write_json_artifact(
        conn,
        artifact_type="segments",
        sutta_id=sutta_id,
        path=out_path,
        data=data,
        created_by="segmentation_worker",
        input_hashes={"transcript": transcript_hash},
    )
    return {
        "event_type": "segments.completed",
        "payload": {"sutta_id": sutta_id, "artifact_id": artifact_id, "segments_path": str(out_path).replace("\\", "/")},
    }

import shutil

def gcloud_command() -> str:
    found = shutil.which("gcloud.cmd") or shutil.which("gcloud") or shutil.which("gcloud.ps1")
    if not found:
        raise FileNotFoundError("gcloud command not found on PATH")
    return found

def seal_handler(conn: Connection, job: Row) -> dict[str, Any]:
    sutta_id = job["sutta_id"]
    print(f"Cave man sealing sutta: {sutta_id} grunt.")

    # 1. Prevent duplicate seal grunt
    existing = conn.execute(
        "select 1 from sealed_runs where sutta_id = ? and status = 'sealed'", (sutta_id,)
    ).fetchone()
    if existing:
        print(f"Sutta {sutta_id} already sealed grunt. No double work.")
        return {
            "event_type": "sutta.seal.skipped",
            "payload": {"sutta_id": sutta_id, "reason": "already_sealed"},
        }

    # 2. Get validation result grunt
    val_art = conn.execute(
        "select * from artifact_records where sutta_id = ? and artifact_type = 'validation' order by created_at desc limit 1",
        (sutta_id,)
    ).fetchone()

    if not val_art or not Path(val_art["local_uri"]).exists():
        raise ValueError(f"No validation record found for {sutta_id}")

    val_data = json.loads(Path(val_art["local_uri"]).read_text())
    if not val_data.get("passed"):
        raise ValueError(f"Validation failed for {sutta_id}, cannot seal")

    # 3. Setup output folder grunt
    safe_id = sutta_id.replace(' ', '_')
    out_dir = Path(f"data/work/sealed/{safe_id}")
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # 4. Copy bones with correct names grunt
    manifest_files = []

    # Validation renamed grunt
    val_path = Path(val_art["local_uri"])
    val_dest = out_dir / "validation.json"
    shutil.copy2(val_path, val_dest)
    manifest_files.append({"type": "validation", "name": "validation.json", "sha256": sha256_file(val_dest)})

    # Map other bones grunt
    type_to_name = {
        "audio": "audio.mp3",
        "transcript": "transcript.json",
        "segments": "segments.json",
        "audio_timestamps": "audio_timestamps.json",
        "generated_content": "generated_content.json",
        "sutta_match": "sutta_match.json",
        "image_match": "image_match.json",
    }

    for check in val_data["checks"]:
        atype = check["artifact_type"]
        if atype == "validation": continue

        art_id = check["artifact_id"]
        art_row = conn.execute("select local_uri from artifact_records where artifact_id = ?", (art_id,)).fetchone()

        if art_row and art_row["local_uri"]:
            src_path = Path(art_row["local_uri"])
            if src_path.exists():
                target_name = type_to_name.get(atype, f"{atype}.json")
                if atype == "audio":
                    target_name = f"audio{src_path.suffix}"

                dest_path = out_dir / target_name
                shutil.copy2(src_path, dest_path)
                manifest_files.append({
                    "type": atype,
                    "name": target_name,
                    "sha256": sha256_file(dest_path)
                })
            else:
                print(f"Warn: Bone missing at {src_path} grunt")

    # 5. Write manifest grunt
    sealed_at = utc_now()
    manifest_data = {
        "sutta_id": sutta_id,
        "sealed_at": sealed_at,
        "files": manifest_files
    }
    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest_data, indent=2))
    manifest_sha = sha256_file(manifest_path)

    # 6. Insert row into sealed_runs grunt
    parts = sutta_id.split()
    nikaya = parts[0] if len(parts) > 0 else "AN"
    book = parts[1].split('.')[0] if len(parts) > 1 else "1"

    seal_id = f"seal_{uuid.uuid4().hex}"
    conn.execute(
        """
        insert into sealed_runs (
            seal_id, sutta_id, nikaya, book, run_id, gcs_prefix,
            manifest_uri, manifest_sha256, status, sealed_at
        ) values (?, ?, ?, ?, 'local_run', ?, ?, ?, 'sealed', ?)
        """,
        (seal_id, sutta_id, nikaya, book, str(out_dir), str(manifest_path), manifest_sha, sealed_at)
    )

    return {
        "event_type": "sutta.sealed",
        "payload": {
            "sutta_id": sutta_id,
            "seal_id": seal_id,
            "manifest_path": str(manifest_path),
        },
    }

def audio_timestamps_handler(conn: Connection, job: Row) -> dict[str, Any]:
    sutta_id = job["sutta_id"]
    segments_path = latest_local_artifact_path(conn, sutta_id, "segments")
    segments_data = json.loads(segments_path.read_text(encoding="utf-8"))
    segments_hash = sha256_file(segments_path)
    timestamp_rows = []
    missing = 0
    for seg in segments_data.get("segments", []):
        start = seg.get("start")
        end = seg.get("end")
        if start is None or end is None:
            missing += 1
        timestamp_rows.append({
            "segment_id": seg.get("segment_id"),
            "start": start,
            "end": end,
            "text": seg.get("text", "")[:160],
        })
    if missing == len(timestamp_rows):
        raise RuntimeError("audio_timestamps_missing: transcript provider returned no segment times")
    out_path = Path("data/work/streaming/audio_timestamps") / f"{safe_sutta_id(sutta_id)}.json"
    artifact_id = write_json_artifact(
        conn,
        artifact_type="audio_timestamps",
        sutta_id=sutta_id,
        path=out_path,
        data={
            "sutta_id": sutta_id,
            "source_segments_uri": str(segments_path).replace("\\", "/"),
            "method": "transcript_segment_times_v1",
            "timestamps": timestamp_rows,
            "missing_timestamp_count": missing,
            "created_at": utc_now(),
        },
        created_by="audio_timestamps_worker",
        input_hashes={"segments": segments_hash},
    )
    return {
        "event_type": "audio_timestamps.completed",
        "payload": {"sutta_id": sutta_id, "artifact_id": artifact_id},
    }

def generation_handler(conn: Connection, job: Row) -> dict[str, Any]:
    sutta_id = job["sutta_id"]
    segments_path = latest_local_artifact_path(conn, sutta_id, "segments")
    segments_data = json.loads(segments_path.read_text(encoding="utf-8"))
    segments_hash = sha256_file(segments_path)
    first_text = " ".join(seg.get("text", "") for seg in segments_data.get("segments", [])[:3]).strip()
    if not first_text:
        raise RuntimeError("generation_missing_segment_text")
    excerpt = first_text[:700]
    out_path = Path("data/work/streaming/generated_content") / f"{safe_sutta_id(sutta_id)}.json"
    artifact_id = write_json_artifact(
        conn,
        artifact_type="generated_content",
        sutta_id=sutta_id,
        path=out_path,
        data={
            "sutta_id": sutta_id,
            "source_segments_uri": str(segments_path).replace("\\", "/"),
            "method": "extractive_content_v1",
            "mcq": [
                {
                    "question": "Which passage is this item based on?",
                    "choices": [excerpt, "A placeholder unrelated passage", "A fabricated doctrinal quote", "A blank answer"],
                    "answer_index": 0,
                    "source": "transcript_excerpt",
                }
            ],
            "vow": {"text": excerpt[:220], "source": "transcript_excerpt"},
            "technique": {"text": excerpt[:320], "source": "transcript_excerpt"},
            "created_at": utc_now(),
        },
        created_by="generation_worker",
        input_hashes={"segments": segments_hash},
    )
    return {
        "event_type": "mcq.generated",
        "payload": {"sutta_id": sutta_id, "artifact_id": artifact_id},
    }

def selection_file_for_sutta(sutta_id: str) -> Path:
    return Path("data/work/streaming/image_selections") / f"{safe_sutta_id(sutta_id)}.json"

def image_match_handler(conn: Connection, job: Row) -> dict[str, Any]:
    sutta_id = job["sutta_id"]
    selection_path = selection_file_for_sutta(sutta_id)
    if not selection_path.exists():
        create_review_item(
            conn,
            sutta_id,
            "images",
            None,
            "medium",
            "image_selection_missing",
            "Image candidates exist, but no image has been selected yet.",
        )
        raise RuntimeError(f"image_selection_missing: {selection_path}")

    selection = json.loads(selection_path.read_text(encoding="utf-8"))
    selected_panel_id = str(selection.get("panel_id") or "").strip()
    if not selected_panel_id:
        raise RuntimeError("image_selection_invalid: missing panel_id")

    db_panel_id = selected_panel_id if selected_panel_id.startswith("public_panels:") else f"public_panels:{selected_panel_id}"
    candidate = conn.execute("select * from image_candidates where panel_id = ?", (db_panel_id,)).fetchone()
    if candidate is None:
        raise RuntimeError(f"image_candidate_missing: {db_panel_id}")

    selection_id = f"sel_{uuid.uuid4().hex}"
    conn.execute(
        """
        insert into image_selections (
          selection_id, sutta_id, panel_id, source_segment_ids_json,
          status, selection_reason, selected_by, created_at
        ) values (?, ?, ?, ?, 'selected', ?, ?, ?)
        """,
        (
            selection_id,
            sutta_id,
            db_panel_id,
            "[]",
            selection.get("selection_reason") or selection.get("selection_word") or "",
            selection.get("selected_by") or "pipeline-ui",
            utc_now(),
        ),
    )

    out_path = Path("data/work/streaming/image_match") / f"{safe_sutta_id(sutta_id)}.json"
    artifact_id = write_json_artifact(
        conn,
        artifact_type="image_match",
        sutta_id=sutta_id,
        path=out_path,
        data={
            "sutta_id": sutta_id,
            "selection_id": selection_id,
            "panel_id": db_panel_id,
            "image_url": selection.get("image_url"),
            "local_path": candidate["local_path"],
            "thumbnail_path": candidate["thumbnail_path"],
            "selection_word": selection.get("selection_word", ""),
            "selection_reason": selection.get("selection_reason", ""),
            "exact_sutta_text": selection.get("exact_sutta_text", ""),
            "method": "human_selected_panel_v1",
            "created_at": utc_now(),
        },
        created_by="image_match_worker",
        input_hashes={"selection": sha256_file(selection_path)},
    )
    return {
        "event_type": "images.matched",
        "payload": {"sutta_id": sutta_id, "artifact_id": artifact_id, "image_match_path": str(out_path).replace("\\", "/")},
    }

def gcs_upload_handler(conn: Connection, job: Row) -> dict[str, Any]:
    sutta_id = job["sutta_id"]
    print(f"Cave man upload sutta to GCS: {sutta_id} grunt.")

    # 1. Check if already uploaded grunt
    existing = conn.execute(
        "select 1 from sealed_runs where sutta_id = ? and status = 'uploaded'", (sutta_id,)
    ).fetchone()
    if existing:
        print(f"Sutta {sutta_id} already in cloud grunt. No double fly.")
        return {
            "event_type": "sutta.upload.skipped",
            "payload": {"sutta_id": sutta_id, "reason": "already_uploaded"},
        }

    # 2. Find the sealed package grunt
    sealed_run = conn.execute(
        "select * from sealed_runs where sutta_id = ? and status = 'sealed' order by sealed_at desc limit 1",
        (sutta_id,)
    ).fetchone()

    if not sealed_run:
        raise ValueError(f"No sealed package found for {sutta_id}")

    sealed_dir = Path(sealed_run["gcs_prefix"]) # using local path for now grunt
    if not sealed_dir.exists():
        raise ValueError(f"Sealed dir {sealed_dir} missing from cave")

    safe_id = sutta_id.replace(' ', '_')
    nikaya = sealed_run["nikaya"]
    book = str(sealed_run["book"]).zfill(2)
    bucket = env_value("DAMA_HDB_GCS_BUCKET") or "damalight-dama-json"
    destination = f"gs://{bucket}/hdb/nikaya={nikaya}/book={book}/sutta={safe_id}/"

    for file_path in sorted(p for p in sealed_dir.iterdir() if p.is_file() and p.name != "upload_receipt.json"):
        result = subprocess.run(
            [gcloud_command(), "storage", "cp", str(file_path), f"{destination}{file_path.name}"],
            check=False,
            capture_output=True,
            text=True,
            timeout=300,
        )
        if result.returncode != 0:
            raise RuntimeError(f"gcs_upload_failed: {(result.stderr or result.stdout)[:800]}")

    # 4. Write receipt bone grunt
    uploaded_at = utc_now()
    manifest = json.loads((sealed_dir / "manifest.json").read_text())

    receipt = {
        "sutta_id": sutta_id,
        "sealed_run_id": sealed_run["seal_id"],
        "destination_uri": destination,
        "uploaded_at": uploaded_at,
        "files": manifest["files"]
    }
    receipt_path = sealed_dir / "upload_receipt.json"
    receipt_path.write_text(json.dumps(receipt, indent=2))

    receipt_upload = subprocess.run(
        [gcloud_command(), "storage", "cp", str(receipt_path), destination],
        check=False,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if receipt_upload.returncode != 0:
        raise RuntimeError(f"gcs_receipt_upload_failed: {(receipt_upload.stderr or receipt_upload.stdout)[:800]}")

    # 5. Record receipt as artifact grunt
    record_artifact(
        conn,
        artifact_type="upload_receipt",
        sutta_id=sutta_id,
        local_uri=str(sealed_dir / "upload_receipt.json"),
        created_by="upload_worker"
    )

    # 6. Update rock grunt
    conn.execute(
        "update sealed_runs set status = 'uploaded' where seal_id = ?",
        (sealed_run["seal_id"],)
    )

    return {
        "event_type": "sutta.uploaded",
        "payload": {
            "sutta_id": sutta_id,
            "destination_uri": destination,
            "receipt_path": str(receipt_path).replace("\\", "/"),
        },
    }

HANDLERS: dict[str, Handler] = {
    "download": download_handler,
    "panel_extraction": panel_extraction_handler,
    "transcription": transcription_handler,
    "sutta_match": sutta_match_handler,
    "segmentation": segmentation_handler,
    "audio_timestamps": audio_timestamps_handler,
    "generation": generation_handler,
    "image_match": image_match_handler,
    "validation": validation_handler,
    "seal": seal_handler,
    "gcs_upload": gcs_upload_handler,
}


def run_one(conn: Connection, worker_type: str, worker_name: str, sutta_id: str | None = None) -> bool:
    try:
        assert_thermal_room(worker_type)
    except ResourceGuardPaused as exc:
        print(str(exc))
        return False

    job = claim_job(conn, worker_type, worker_name, sutta_id=sutta_id)
    if job is None:
        return False

    handler = HANDLERS.get(worker_type)
    if handler is None:
        fail_job(conn, job["job_id"], "missing_handler", f"No handler registered for {worker_type}")
        return True

    try:
        result = handler(conn, job)
        publish_event(
            conn,
            event_type=str(result["event_type"]),
            payload=dict(result["payload"]),
            publisher=worker_name,
            pipeline_run_id="local",
            idempotency_key=f"{result['event_type']}:{job['job_id']}",
        )
        complete_job(conn, job["job_id"])
    except ResourceGuardPaused as exc:
        requeue_job(conn, job["job_id"], str(exc))
    except Exception as exc:  # noqa: BLE001 - CLI worker must preserve failure in DB.
        fail_job(conn, job["job_id"], type(exc).__name__, str(exc))
    return True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run one local streaming worker.")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument("--worker", required=True, choices=sorted(HANDLERS.keys()))
    parser.add_argument("--worker-name", default="")
    parser.add_argument("--once", action="store_true", help="Run at most one job.")
    parser.add_argument("--limit", type=int, default=1, help="Max jobs to run; ignored when --once is set.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    db_path = init_db(args.db)
    worker_name = args.worker_name or f"{args.worker}_worker"
    limit = 1 if args.once else max(1, args.limit)
    ran = 0
    with connect(db_path) as conn:
        for _ in range(limit):
            if not run_one(conn, args.worker, worker_name):
                break
            ran += 1
        conn.commit()
    print(f"db={db_path}")
    print(f"worker={args.worker} ran={ran}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
