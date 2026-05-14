import argparse
import hashlib
import json
import os
import re
import subprocess
import uuid
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from scripts.pipeline.streaming.db import DEFAULT_DB_PATH, connect, init_db
from scripts.pipeline.streaming.events import publish_event, utc_now
from scripts.pipeline.streaming.artifacts import record_artifact


def youtube_video_id(url: str) -> str | None:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    if "youtu.be" in host:
        return parsed.path.strip("/").split("/")[0] or None
    if "youtube.com" in host:
        query_id = parse_qs(parsed.query).get("v", [""])[0].strip()
        if query_id: return query_id
        parts = [p for p in parsed.path.split("/") if p]
        for marker in ("shorts", "embed", "live"):
            if marker in parts:
                idx = parts.index(marker)
                if idx + 1 < len(parts): return parts[idx + 1]
    return None

def parse_sutta_id(title: str) -> str:
    match = re.search(r"\b(AN|SN|DN|MN|KN)\s*(\d+)[\.\s]+(\d+(?:\.\d+)*)\b", title, re.IGNORECASE)
    if match:
        return f"{match.group(1).upper()} {match.group(2)}.{match.group(3)}"
    return f"SUTTA_{uuid.uuid4().hex[:8]}"

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            h.update(chunk)
    return h.hexdigest()

def download_audio_and_transcript(url: str, sutta_id: str) -> tuple[Path, Path]:
    out_dir = Path("data/work/streaming/audio")
    caption_dir = Path("data/work/streaming/transcripts")
    out_dir.mkdir(parents=True, exist_ok=True)
    caption_dir.mkdir(parents=True, exist_ok=True)

    stem = sutta_id.replace(" ", "_")
    audio_template = out_dir / f"{stem}.%(ext)s"
    caption_template = caption_dir / f"{stem}.%(ext)s"

    print(f"Cave man pull audio and transcript for {sutta_id} grunt.")

    # Download Audio
    subprocess.run(
        ["yt-dlp", "-f", "bestaudio[ext=m4a]/bestaudio/best", "--no-playlist", "-o", str(audio_template), url],
        check=True,
        timeout=600
    )

    # Download Captions (Transcript)
    # We try to get English (orig or auto) in JSON format
    subprocess.run(
        [
            "yt-dlp", "--skip-download", "--write-auto-subs", "--write-subs",
            "--sub-langs", "en.*", "--sub-format", "json3",
            "--no-playlist", "-o", str(caption_template), url
        ],
        check=True,
        timeout=180
    )

    # Find files
    audio_path = None
    for ext in [".m4a", ".webm", ".mp3", ".opus"]:
        p = out_dir / f"{stem}{ext}"
        if p.exists():
            audio_path = p
            break

    caption_path = None
    # yt-dlp might name it stem.en.json3 or stem.en-orig.json3
    for p in caption_dir.glob(f"{stem}.*.json3"):
        caption_path = p
        break

    if not audio_path:
        raise FileNotFoundError(f"Audio fail for {sutta_id}")
    if not caption_path:
        raise FileNotFoundError(f"Transcript (caption) fail for {sutta_id}")

    return audio_path, caption_path

def ingest_url(db_path: Path, url: str) -> str | None:
    # Cleanup URL grunt
    url = url.strip()
    if not url.startswith("http"):
        if "&" in url or "=" in url:
            url = f"https://www.youtube.com/watch?v={url}"
        else:
            url = f"https://www.youtube.com/watch?v={url}"

    print(f"Cave man ingesting URL: {url} grunt.")

    # 1. Fetch metadata (FAST)
    cmd = ["yt-dlp", "--dump-single-json", "--no-playlist", "--no-warnings", url]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=60)
        data = json.loads(out.decode("utf-8", errors="replace"))
    except Exception as e:
        try:
            print(f"First attempt fail, trying simple metadata fetch grunt.")
            cmd = ["yt-dlp", "-J", "--no-playlist", url]
            out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=60)
            data = json.loads(out.decode("utf-8", errors="replace"))
        except Exception as e2:
            print(f"Metadata fetch fail: {e2}")
            return None

    entries = data.get("entries", [data])
    if not entries:
        print("No entries found in YouTube response grunt.")
        return None

    entry = entries[0]
    title = entry.get("title") or "Unknown Sutta"
    vid = entry.get("id") or youtube_video_id(url)
    if not vid:
        print("Could not identify Video ID grunt.")
        return None

    uri = f"https://www.youtube.com/watch?v={vid}"
    sutta_id = parse_sutta_id(title)

    # --- IMMEDIATE COMMIT DISCOVERY ---
    with connect(db_path) as conn:
        conn.execute(
            "insert or ignore into source_records (source_id, source_type, source_uri, dedupe_key, sutta_hint, status, metadata_json, created_at) values (?, ?, ?, ?, ?, 'discovered', ?, ?)",
            (f"yt:{vid}", "youtube", uri, f"yt:{vid}", sutta_id, json.dumps({"title": title}), utc_now())
        )

        publish_event(
            conn,
            event_type="source.sutta.discovered",
            payload={"sutta_id": sutta_id, "source_uri": uri, "source_id": f"yt:{vid}"},
            publisher="01_ingest_script"
        )
        conn.commit()

    print(f"Discovery event published for {sutta_id}. Starting heavy pull grunt.")

    # 3. Download Audio & Transcript (SLOW)
    try:
        audio_path, transcript_path = download_audio_and_transcript(uri, sutta_id)
        audio_hash = sha256_file(audio_path)
        transcript_hash = sha256_file(transcript_path)

        with connect(db_path) as conn:
            # 4. Record Artifacts
            record_artifact(
                conn,
                artifact_type="audio",
                sutta_id=sutta_id,
                local_uri=str(audio_path).replace("\\", "/"),
                sha256=audio_hash,
                created_by="01_ingest_script"
            )

            record_artifact(
                conn,
                artifact_type="transcript",
                sutta_id=sutta_id,
                local_uri=str(transcript_path).replace("\\", "/"),
                sha256=transcript_hash,
                created_by="01_ingest_script"
            )

            # 5. Publish completion events
            publish_event(
                conn,
                event_type="audio.download.completed",
                payload={
                    "sutta_id": sutta_id,
                    "audio_path": str(audio_path).replace("\\", "/"),
                    "sha256": audio_hash
                },
                publisher="01_ingest_script"
            )

            publish_event(
                conn,
                event_type="transcript.completed",
                payload={
                    "sutta_id": sutta_id,
                    "transcript_path": str(transcript_path).replace("\\", "/"),
                    "sha256": transcript_hash
                },
                publisher="01_ingest_script"
            )
            conn.commit()
    except Exception as e:
        print(f"Ingest fail grunt: {e}")
        return None

    print(f"Finished 01 for {sutta_id}. Metadata + Audio + Transcript ready.")
    return sutta_id

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument("--url", required=True)
    args = parser.parse_args()

    init_db(args.db)
    sid = ingest_url(args.db, args.url)

    if sid:
        # 4. Start the runner immediately
        print(f"JSON_OUTPUT:{json.dumps([sid])}")
        # We don't call subprocess here, the Dashboard will handle the spawn to ensure detachment
    else:
        print("Ingest failed.")

if __name__ == "__main__":
    main()
