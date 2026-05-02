from __future__ import annotations

import argparse
from pathlib import Path

from scripts2.streaming.db import DEFAULT_DB_PATH, connect, init_db
from scripts2.streaming.events import publish_event


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Approve a saved image selection and queue image matching.")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument("--sutta-id", required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    db_path = init_db(args.db)
    with connect(db_path) as conn:
        event_id, inserted = publish_event(
            conn,
            event_type="image_selection.approved",
            payload={"sutta_id": args.sutta_id},
            publisher="image-selector-ui",
            idempotency_key=f"image_selection.approved:{args.sutta_id}",
        )
        conn.commit()
    print(f"db={db_path}")
    print(f"event_id={event_id} inserted={inserted}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
