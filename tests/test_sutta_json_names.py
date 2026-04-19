"""Per-file sutta JSON must carry English + Pali short names when listed in sutta_id_chain."""

from __future__ import annotations

import json
from pathlib import Path

import sutta_display_titles as sdt


def test_every_catalog_id_json_has_both_names() -> None:
    repo = Path(__file__).resolve().parents[1]
    for dotted in sdt.TITLE_EN:
        paths = list(repo.glob(f"an*/suttas/{dotted}.json"))
        assert len(paths) == 1, f"expected one JSON for {dotted}, got {paths}"
        obj = json.loads(paths[0].read_text(encoding="utf-8"))
        en = str(obj.get("sutta_name_en") or "").strip()
        pl = str(obj.get("sutta_name_pali") or "").strip()
        assert en, f"{paths[0]} missing sutta_name_en"
        assert pl, f"{paths[0]} missing sutta_name_pali"


def test_pali_lookup_matches_sample() -> None:
    assert sdt.pali_name_for_dotted_id("3.2.19") == "Paṇika Sutta"
