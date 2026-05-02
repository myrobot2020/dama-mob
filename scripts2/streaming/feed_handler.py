from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path
from sqlite3 import Connection, IntegrityError
from typing import Any
from urllib.parse import parse_qs, urlparse

from scripts2.streaming.db import DEFAULT_DB_PATH, connect, init_db
from scripts2.streaming.events import publish_event, utc_now


def normalize_book(book: str) -> str:
    raw = str(book).strip()
    if raw.lower().startswith("book"):
        raw = raw[4:].strip()
    return str(int(raw)) if raw.isdigit() else raw


def validate_b1_b2(nikaya: str, book: str) -> None:
    if nikaya.strip().upper() != "AN":
        raise ValueError("v1 feed handler only accepts AN Book 1 and Book 2 sources")
    normalized = normalize_book(book)
    if normalized not in {"1", "2"}:
        raise ValueError("v1 feed handler only accepts AN Book 1 and Book 2 sources")


def youtube_video_id(url: str) -> str | None:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    if "youtu.be" in host:
        candidate = parsed.path.strip("/").split("/")[0]
        return candidate or None
    if "youtube.com" in host:
        query_id = parse_qs(parsed.query).get("v", [""])[0].strip()
        if query_id:
            return query_id
        parts = [p for p in parsed.path.split("/") if p]
        for marker in ("shorts", "embed", "live"):
            if marker in parts:
                idx = parts.index(marker)
                if idx + 1 < len(parts):
                    return parts[idx + 1]
    return None


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def infer_source_identity(source_type: str, source_uri: str) -> tuple[str, str]:
    source_type = source_type.strip().lower()
    source_uri = source_uri.strip()
    if source_type == "youtube":
        video_id = youtube_video_id(source_uri)
        if not video_id:
            raise ValueError("could not extract YouTube video id")
        key = f"youtube:{video_id}"
        return key, key
    if source_type == "local_file":
        path = Path(source_uri).expanduser()
        if not path.is_file():
            raise ValueError(f"local source file does not exist: {path}")
        digest = sha256_file(path)
        key = f"file_sha256:{digest}"
        return key, key
    if source_type == "manual":
        digest = hashlib.sha256(source_uri.encode("utf-8")).hexdigest()[:16]
        key = f"manual:{digest}"
        return key, key
    raise ValueError(f"unsupported source type: {source_type}")


def upsert_source_record(
    conn: Connection,
    *,
    source_id: str,
    source_type: str,
    source_uri: str,
    dedupe_key: str,
    nikaya: str,
    book: str,
    sutta_hint: str,
    metadata: dict[str, Any],
) -> bool:
    try:
        conn.execute(
            """
            insert into source_records (
              source_id, source_type, source_uri, dedupe_key, nikaya, book,
              sutta_hint, status, metadata_json, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, 'discovered', ?, ?)
            """,
            (
                source_id,
                source_type,
                source_uri,
                dedupe_key,
                nikaya,
                book,
                sutta_hint,
                json.dumps(metadata, ensure_ascii=False, sort_keys=True),
                utc_now(),
            ),
        )
        return True
    except IntegrityError:
        return False


def parse_sutta_id(title: str) -> tuple[str, str, str] | None:
    """Try to find (Nikaya, Book, ID) from title string."""
    # Handle "Anguttara Nikaya Book 1A (1.1 - 1.3)" or "Samyutta Nikaya 01 Devata"
    nikaya_map = {
        "anguttara": "AN",
        "samyutta": "SN",
        "digha": "DN",
        "majjhima": "MN",
        "khuddaka": "KN",
    }

    # 1. Look for abbreviated pattern: "AN 1.1"
    abbrev_pat = r"\b(AN|SN|DN|MN|KN)\s*(\d+)[\.\s]+(\d+(?:\.\d+)*)\b"
    m = re.search(abbrev_pat, title, re.IGNORECASE)
    if m:
        nikaya = m.group(1).upper()
        book = m.group(2)
        sutta_id = f"{nikaya} {book}.{m.group(3)}"
        return nikaya, book, sutta_id

    # 2. Look for long pattern: "Anguttara Nikaya Book 1"
    long_pat = r"(anguttara|samyutta|digha|majjhima|khuddaka)\s+nik[aā]ya\s+(?:book\s+)?(\d+)"
    m = re.search(long_pat, title, re.IGNORECASE)
    if m:
        nikaya = nikaya_map[m.group(1).lower()]
        book = str(int(m.group(2))) # normalize "01" -> "1"

        # Look for "(1.1" or similar inside parentheses or after
        id_pat = r"\(?(\d+)[\.\s]+(\d+(?:\.\d+)*)\b"
        m_id = re.search(id_pat, title)
        if m_id:
            sutta_id = f"{nikaya} {m_id.group(1)}.{m_id.group(2)}"
        else:
            sutta_id = f"{nikaya} {book}.pl" # Playlist item placeholder

        return nikaya, book, sutta_id

    return None


def discover_from_url(url: str) -> list[dict[str, Any]]:
    """Use yt-dlp to find videos and extract sutta IDs."""
    print(f"Cave man hunt suttas at: {url}")
    cmd = [
        "yt-dlp",
        "--dump-single-json",
        "--flat-playlist",
        "--no-warnings",
        url,
    ]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=300)
        data = json.loads(out.decode("utf-8", errors="replace"))

        entries = data.get("entries", [])
        # Handle single video URL case
        if not entries and data.get("id"):
            entries = [data]

        found = []
        for e in entries:
            title = e.get("title") or ""
            vid = e.get("id") or ""
            uri = f"https://www.youtube.com/watch?v={vid}"

            identity = parse_sutta_id(title)
            if identity:
                nikaya, book, sutta_id = identity
                found.append({
                    "source_type": "youtube",
                    "source_uri": uri,
                    "nikaya": nikaya,
                    "book": book,
                    "sutta_id": sutta_id,
                    "title": title,
                })
                print(f"Found: {sutta_id} -> {title}")
        return found
    except Exception as exc:
        print(f"Discovery fail: {exc}")
        return []


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Register sources and publish source.sutta.discovered.")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument("--source-type", choices=["youtube", "local_file", "manual"])
    parser.add_argument("--source-uri")
    parser.add_argument("--nikaya", default="AN")
    parser.add_argument("--book")
    parser.add_argument("--sutta-id")
    parser.add_argument("--title", default="")
    parser.add_argument("--discover", help="URL of channel or playlist to scan")
    parser.add_argument("--publisher", default="sutta_feed_handler")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    db_path = init_db(args.db)

    to_process = []

    if args.discover:
        to_process = discover_from_url(args.discover)
        if not to_process:
            print("Cave man find nothing. Empty belly.")
            return 1
    elif args.source_type and args.source_uri and args.sutta_id:
        to_process = [{
            "source_type": args.source_type,
            "source_uri": args.source_uri,
            "nikaya": args.nikaya.strip().upper(),
            "book": normalize_book(args.book) if args.book else "1",
            "sutta_id": args.sutta_id.strip(),
            "title": args.title.strip(),
        }]
    else:
        print("Need --discover URL or manual source details. Grunt.")
        return 1

    count = 0
    with connect(db_path) as conn:
        for item in to_process:
            nikaya = item["nikaya"]
            book = item["book"]
            sutta_id = item["sutta_id"]
            source_type = item["source_type"]
            source_uri = item["source_uri"]
            title = item["title"]

            try:
                validate_b1_b2(nikaya, book)
                source_id, dedupe_key = infer_source_identity(source_type, source_uri)
            except ValueError as exc:
                print(f"Skip {sutta_id}: {exc}")
                continue

            metadata = {"title": title} if title else {}
            payload = {
                "source_id": source_id,
                "source_type": source_type,
                "source_uri": source_uri,
                "dedupe_key": dedupe_key,
                "nikaya": nikaya,
                "book": book,
                "sutta_hint": sutta_id,
                "sutta_id": sutta_id,
                "metadata": metadata,
            }

            source_inserted = upsert_source_record(
                conn,
                source_id=source_id,
                source_type=source_type,
                source_uri=source_uri,
                dedupe_key=dedupe_key,
                nikaya=nikaya,
                book=book,
                sutta_hint=sutta_id,
                metadata=metadata,
            )
            event_id, event_inserted = publish_event(
                conn,
                event_type="source.sutta.discovered",
                payload=payload,
                publisher=args.publisher,
                idempotency_key=f"source.sutta.discovered:{dedupe_key}:{sutta_id}",
            )
            if event_inserted:
                count += 1
                print(f"Registered {sutta_id}")

        conn.commit()

    print(f"Cave man done. Registered {count} suttas. Grunt.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
