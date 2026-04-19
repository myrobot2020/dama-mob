"""Tests for AN MP3 filename range parsing (backfill_audio_an_commentary)."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _load():
    repo = Path(__file__).resolve().parents[1]
    p = repo / "backfill_audio_an_commentary.py"
    spec = importlib.util.spec_from_file_location("backfill_audio", p)
    assert spec and spec.loader
    m = importlib.util.module_from_spec(spec)
    sys.modules["backfill_audio"] = m
    spec.loader.exec_module(m)
    return m


_mod = _load()


def test_parse_compressed_token_book3() -> None:
    assert _mod.parse_compressed_token_to_triple(3, "3212") == (3, 2, 12)
    assert _mod.parse_compressed_token_to_triple(3, "3324") == (3, 3, 24)
    assert _mod.parse_compressed_token_to_triple(3, "3660") == (3, 6, 60)
    assert _mod.parse_compressed_token_to_triple(3, "31099") == (3, 10, 99)
    assert _mod.parse_compressed_token_to_triple(3, "3436c") == (3, 4, 36)


def test_parse_filename_range_book3() -> None:
    fn = "009_Anguttara Nikaya Book 3A 3212 - 3324 by Bhante Hye Dhammavuddho Mahathera.mp3"
    assert _mod.parse_filename_audio_range(fn, 3) == ((3, 2, 12), (3, 3, 24))
    fn2 = "018_Anguttara Nikaya Book 3J 3983 - 31099 by Bhante.mp3"
    assert _mod.parse_filename_audio_range(fn2, 3) == ((3, 9, 83), (3, 10, 99))


def test_sutta_id_to_order_triple() -> None:
    assert _mod.sutta_id_to_order_triple("3.2.12", 3) == (3, 2, 12)
    assert _mod.sutta_id_to_order_triple("3.4", 3) == (3, 4, 1)
    assert _mod.sutta_id_to_order_triple("3.3.26", 3) == (3, 3, 26)
