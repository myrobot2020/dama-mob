"""an_record_valid: sutta + commentary + audio + sutta_name_en + chain length = book number."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _extract_chain_mod():
    root = Path(__file__).resolve().parents[1]
    spec = importlib.util.spec_from_file_location("extract_chain_ollama", root / "scripts" / "extract_chain_ollama.py")
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules["extract_chain_ollama"] = mod
    spec.loader.exec_module(mod)
    return mod


def test_an_record_valid_true_for_complete_an7_record() -> None:
    mod = _extract_chain_mod()
    an_record_valid = mod.an_record_valid
    obj = {
        "sutta_id": "7.3.23",
        "sutta_name_en": "Faith and companions",
        "sutta_name_pali": "Test",
        "sutta": "x" * 20,
        "commentary": "y" * 20,
        "aud_file": "some.mp3",
        "aud_start_s": 1.0,
        "aud_end_s": 99.0,
        "chain": {
            "items": [f"i{n}" for n in range(7)],
            "count": 7,
            "is_ordered": True,
            "category": "test",
        },
    }
    assert an_record_valid(obj) is True


def test_an_record_valid_false_without_english_name() -> None:
    mod = _extract_chain_mod()
    an_record_valid = mod.an_record_valid
    obj = {
        "sutta_id": "7.3.23",
        "sutta_name_en": "",
        "sutta_name_pali": "Test",
        "sutta": "x" * 20,
        "commentary": "y" * 20,
        "aud_file": "some.mp3",
        "aud_start_s": 1.0,
        "aud_end_s": 99.0,
        "chain": {
            "items": [f"i{n}" for n in range(7)],
            "count": 7,
            "is_ordered": True,
            "category": "test",
        },
    }
    assert an_record_valid(obj) is False


def test_an_record_valid_false_when_chain_wrong_length() -> None:
    mod = _extract_chain_mod()
    an_record_valid = mod.an_record_valid
    obj = {
        "sutta_id": "7.3.23",
        "sutta_name_en": "Title",
        "sutta": "x" * 20,
        "commentary": "y" * 20,
        "aud_file": "some.mp3",
        "aud_start_s": 1.0,
        "aud_end_s": 99.0,
        "chain": {
            "items": ["a", "b", "c"],
            "count": 3,
            "is_ordered": True,
            "category": "test",
        },
    }
    assert an_record_valid(obj) is False


def test_on_disk_valid_matches_an_record_valid() -> None:
    """Sample sutta JSON `valid` field matches recomputed an_record_valid."""
    mod = _extract_chain_mod()
    an_record_valid = mod.an_record_valid
    import json

    repo = Path(__file__).resolve().parents[1]
    path = repo / "an7" / "suttas" / "7.2.13.json"
    obj = json.loads(path.read_text(encoding="utf-8"))
    assert isinstance(obj, dict)
    assert obj.get("valid") == an_record_valid(obj)
