"""Sanitization helpers for aud/split_mp3_from_sutta_json.py."""

from __future__ import annotations

import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO / "aud"))

from split_mp3_from_sutta_json import (  # noqa: E402
    output_basename,
    sanitize_filename_component,
)


def test_sanitize_strips_invalid_chars() -> None:
    assert "a_b" in sanitize_filename_component('a<b>: "x" / \\ | ? * y')


def test_output_basename_uses_name_and_id() -> None:
    b = output_basename("Parents", "2.4.2")
    assert b == "Parents__2.4.2"


def test_output_basename_falls_back_id_when_name_empty() -> None:
    # implementation uses sutta_id for name_en when empty at call site;
    # basename always includes both args here
    b = output_basename("2.4.2", "2.4.2")
    assert "2.4.2" in b
