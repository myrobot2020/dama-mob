"""Tests for sutta_display_titles (English nav labels)."""

from __future__ import annotations

import sutta_display_titles as sdt


def test_ensure_appends_sutta_when_missing() -> None:
    assert sdt.ensure_english_sutta_suffix("Shopkeeper") == "Shopkeeper Sutta"


def test_ensure_unchanged_when_already_ends_sutta() -> None:
    assert sdt.ensure_english_sutta_suffix("Samādhi Sutta") == "Samādhi Sutta"
    assert sdt.ensure_english_sutta_suffix("striving sutta") == "striving sutta"


def test_dotted_from_an_suttaid() -> None:
    assert sdt.dotted_id_from_an_suttaid("AN 3.2.19") == "3.2.19"
    assert sdt.dotted_id_from_an_suttaid("") == ""


def test_catalog_lookup_shopkeeper() -> None:
    assert sdt.english_nav_title_for_dotted_id("3.2.19") == "Shopkeeper Sutta"


def test_catalog_unknown_returns_none() -> None:
    assert sdt.english_nav_title_for_dotted_id("99.99.99") is None


def test_pali_catalog_has_same_keys_as_english() -> None:
    assert set(sdt.TITLE_PALI.keys()) == set(sdt.TITLE_EN.keys())
