from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts2.streaming.db import connect, init_db
from scripts2.streaming.events import publish_event
from scripts2.streaming.workers import run_one


def test_source_event_queues_download_and_panel_extraction(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db_path = init_db(tmp_path / "pipeline.sqlite3")

    with connect(db_path) as conn:
        publish_event(
            conn,
            event_type="source.sutta.discovered",
            payload={"sutta_id": "AN 1.1", "source_id": "manual:AN_1.1"},
            publisher="test",
        )
        conn.commit()

        jobs = {
            row["worker_type"]
            for row in conn.execute("select worker_type from jobs where sutta_id = 'AN 1.1'").fetchall()
        }
        image_stage = conn.execute(
            "select status from stage_status where sutta_id = 'AN 1.1' and stage = 'images'",
        ).fetchone()

    assert {"download", "panel_extraction"}.issubset(jobs)
    assert image_stage["status"] == "queued"


def test_panel_extraction_and_image_match_workers(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "public" / "panels").mkdir(parents=True)
    (tmp_path / "public" / "panels" / "panel-one.png").write_bytes(b"fake image")
    db_path = init_db(tmp_path / "pipeline.sqlite3")

    with connect(db_path) as conn:
        publish_event(
            conn,
            event_type="source.sutta.discovered",
            payload={"sutta_id": "AN 1.1", "source_id": "manual:AN_1.1"},
            publisher="test",
        )
        assert run_one(conn, "panel_extraction", "test_panel_worker", sutta_id="AN 1.1")
        conn.commit()

        candidate = conn.execute("select * from image_candidates where panel_id = 'public_panels:panel-one'").fetchone()
        artifact = conn.execute(
            "select * from artifact_records where sutta_id = 'AN 1.1' and artifact_type = 'image_candidates'",
        ).fetchone()

        selection_dir = tmp_path / "data" / "work" / "streaming" / "image_selections"
        selection_dir.mkdir(parents=True)
        (selection_dir / "AN_1.1.json").write_text(
            json.dumps(
                {
                    "sutta_id": "AN 1.1",
                    "panel_id": "panel-one",
                    "image_url": "/panels/panel-one.png",
                    "selection_word": "struggle",
                    "exact_sutta_text": "the buddha said monks",
                },
            ),
            encoding="utf-8",
        )
        publish_event(
            conn,
            event_type="image_selection.approved",
            payload={"sutta_id": "AN 1.1"},
            publisher="test",
        )
        assert run_one(conn, "image_match", "test_image_worker", sutta_id="AN 1.1")
        conn.commit()

        image_match = conn.execute(
            "select * from artifact_records where sutta_id = 'AN 1.1' and artifact_type = 'image_match'",
        ).fetchone()

    assert candidate["local_path"] == "public/panels/panel-one.png"
    assert artifact is not None
    assert image_match is not None
