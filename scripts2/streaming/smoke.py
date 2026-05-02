from __future__ import annotations

import argparse
from pathlib import Path

from scripts2.streaming.db import DEFAULT_DB_PATH, connect, init_db
from scripts2.streaming.events import publish_event


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Smoke test the local streaming RDB/event log.")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument("--sutta-id", default="AN1.1")
    parser.add_argument("--source-id", default="manual:AN1.1")
    parser.add_argument("--source-uri", default="manual://AN1.1")
    parser.add_argument("--nikaya", default="AN")
    parser.add_argument("--book", default="1")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    db_path = init_db(args.db)
    payload = {
        "source_id": args.source_id,
        "source_type": "manual",
        "source_uri": args.source_uri,
        "dedupe_key": args.source_id,
        "nikaya": args.nikaya,
        "book": args.book,
        "sutta_hint": args.sutta_id,
        "sutta_id": args.sutta_id,
    }
    with connect(db_path) as conn:
        event_id, inserted = publish_event(
            conn,
            event_type="source.sutta.discovered",
            payload=payload,
            publisher="streaming.smoke",
        )
        conn.commit()
        events = conn.execute("select count(*) as n from pipeline_events").fetchone()["n"]
        jobs = conn.execute("select count(*) as n from jobs").fetchone()["n"]
        stages = conn.execute(
            "select stage, status from stage_status where sutta_id = ? order by stage",
            (args.sutta_id,),
        ).fetchall()

    print(f"db={db_path}")
    print(f"event_id={event_id} inserted={inserted}")
    print(f"events={events} jobs={jobs}")
    for row in stages:
        print(f"stage={row['stage']} status={row['status']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

