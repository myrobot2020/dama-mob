"""AN Book 1 chain shape + audio merge from audio_map."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path


def _extract_mod():
    root = Path(__file__).resolve().parents[1]
    p = root / "scripts" / "extract_chain_ollama.py"
    spec = importlib.util.spec_from_file_location("eco", p)
    assert spec and spec.loader
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


_eco = _extract_mod()
_bf = importlib.util.spec_from_file_location(
    "an1bf", Path(__file__).resolve().parents[1] / "scripts" / "backfill_an1_chains_and_audio.py"
)
assert _bf and _bf.loader
_an1bf = importlib.util.module_from_spec(_bf)
_bf.loader.exec_module(_an1bf)


def test_book_one_chain_matches_extract_rules() -> None:
    repo = Path(__file__).resolve().parents[1]
    sample = repo / "an1" / "suttas" / "1.6.3.json"
    obj = json.loads(sample.read_text(encoding="utf-8"))
    assert _eco.anguttara_chain_matches_book(obj, 1) is True


def test_audio_merged_for_known_map_keys() -> None:
    repo = Path(__file__).resolve().parents[1]
    for sid in ("1.18.13", "1.21.47"):
        p = repo / "an1" / "suttas" / f"{sid}.json"
        obj = json.loads(p.read_text(encoding="utf-8"))
        assert str(obj.get("aud_file") or "").endswith(".mp3")
        assert float(obj.get("aud_end_s") or 0) > float(obj.get("aud_start_s") or 0)


def test_chain_word_from_refrain_other_single() -> None:
    s = "Monks, I know not of any other single sound by which a man's heart is so enslaved."
    assert _an1bf.chain_item_book_one(s) == "sound"


def test_chain_word_priority_metta() -> None:
    s = "The Buddha said monks if for just a finger snap the monk indulges mettā such a one is called a monk."
    assert _an1bf.chain_item_book_one(s) == "mettā"


def test_chain_word_one_token_only() -> None:
    w = _an1bf.chain_item_book_one("Monks, I know not of any other single form by which...")
    assert " " not in w.strip()


def test_commentary_key() -> None:
    assert _an1bf.commentary_key("1.5.8") == "cAN 1.5.8"
