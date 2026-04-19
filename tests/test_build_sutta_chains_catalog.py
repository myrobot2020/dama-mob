"""Tests for Anguttara chain validation (implemented in extract_chain_ollama)."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _extract_chain_mod():
    repo = Path(__file__).resolve().parents[1]
    p = repo / "scripts" / "extract_chain_ollama.py"
    spec = importlib.util.spec_from_file_location("extract_chain_ollama", p)
    assert spec and spec.loader
    m = importlib.util.module_from_spec(spec)
    sys.modules["extract_chain_ollama"] = m
    spec.loader.exec_module(m)
    return m


_mod = _extract_chain_mod()
anguttara_chain_matches_book = _mod.anguttara_chain_matches_book


def test_chain_matches_book_ok() -> None:
    obj = {
        "sutta_id": "3.2.12",
        "chain": {
            "items": ["a", "b", "c"],
            "count": 3,
        },
    }
    assert anguttara_chain_matches_book(obj, 3) is True


def test_chain_wrong_length() -> None:
    obj = {"sutta_id": "3.2.12", "chain": {"items": ["a", "b"], "count": 2}}
    assert anguttara_chain_matches_book(obj, 3) is False


def test_count_mismatches_book() -> None:
    obj = {"chain": {"items": ["a", "b", "c"], "count": 99}}
    assert anguttara_chain_matches_book(obj, 3) is False
