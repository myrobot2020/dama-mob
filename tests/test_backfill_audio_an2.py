from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def test_backfill_audio_an2_maps_all_entries_from_local_transcripts() -> None:
    """
    Regression test: when 006/007/008 segment transcripts exist, the backfill script
    should populate aud_file + start/end for every AN2 entry.

    This test runs the script in an isolated temp directory so it does not mutate
    the repo's checked-in an2.json.
    """

    repo_root = Path(__file__).resolve().parents[1]
    script = repo_root / "backfill_audio_an2.py"
    assert script.is_file()

    src_an2 = repo_root / "an2.json"
    assert src_an2.is_file()

    src_transcripts_dir = repo_root / "aud" / "transcripts"
    seg_files = sorted(src_transcripts_dir.glob("*Anguttara*Nikaya*Book*2*_segments.json"))
    assert len(seg_files) >= 3, "Expected 006/007/008 segment JSONs under aud/transcripts/"

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        (tmp / "aud" / "transcripts").mkdir(parents=True, exist_ok=True)

        shutil.copy2(src_an2, tmp / "an2.json")
        for p in seg_files:
            shutil.copy2(p, tmp / "aud" / "transcripts" / p.name)

        # Run script in tmp cwd (it uses relative paths).
        subprocess.run([sys.executable, str(script)], cwd=str(tmp), check=True)

        data = json.loads((tmp / "an2.json").read_text(encoding="utf-8"))
        assert isinstance(data, list) and data, "Expected list of entries in an2.json"
        assert len(data) == 17, f"Expected AN2 (Book 2) to have 17 entries, got {len(data)}"

        missing = [
            e.get("sutta_id")
            for e in data
            if not (str(e.get("aud_file") or "").strip())
            or float(e.get("aud_end_s") or 0.0) <= float(e.get("aud_start_s") or 0.0)
        ]
        assert missing == [], f"Expected all entries mapped; missing: {missing}"

        report = tmp / "audio_mapping_report_an2.md"
        assert report.is_file(), "Expected audio mapping report to be generated"

