from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path


def _load_module():
    repo = Path(__file__).resolve().parents[1]
    script_path = repo / "scripts" / "extract_chain_ollama.py"
    spec = importlib.util.spec_from_file_location("extract_chain_ollama", script_path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules["extract_chain_ollama"] = mod
    spec.loader.exec_module(mod)
    return mod


_mod = _load_module()
strip_code_fences = _mod.strip_code_fences
parse_model_json = _mod.parse_model_json
validate_chain_payload = _mod.validate_chain_payload
build_user_prompt = _mod.build_user_prompt
parse_anguttara_book_num = _mod.parse_anguttara_book_num
RollingFewShot = _mod.RollingFewShot
compose_system_prompt = _mod.compose_system_prompt
parse_book_list_csv = _mod.parse_book_list_csv
build_jobs = _mod.build_jobs


def test_strip_code_fences_removes_json_fence() -> None:
    raw = "```json\n{\"has_chain\": false}\n```"
    assert strip_code_fences(raw) == '{"has_chain": false}'


def test_strip_code_fences_plain_json() -> None:
    assert strip_code_fences('  {"has_chain": false}  ') == '{"has_chain": false}'


def test_parse_model_json_roundtrip() -> None:
    text = "```\n{\"has_chain\": true, \"chain\": {\"items\": [\"a\"], \"count\": 1, \"is_ordered\": true, \"category\": \"c\"}}\n```"
    out = parse_model_json(text)
    assert out["has_chain"] is True
    assert out["chain"]["count"] == 1


def test_validate_chain_payload_valid() -> None:
    p = {
        "has_chain": True,
        "chain": {
            "items": ["x", "y"],
            "count": 2,
            "is_ordered": True,
            "category": "test",
        },
    }
    ok, msg = validate_chain_payload(p, book_num=2, require_book_length=True)
    assert ok and msg == "ok"


def test_validate_chain_payload_count_mismatch() -> None:
    p = {
        "has_chain": True,
        "chain": {
            "items": ["x"],
            "count": 2,
            "is_ordered": True,
            "category": "test",
        },
    }
    ok, msg = validate_chain_payload(p)
    assert not ok
    assert "does not match" in msg


def test_validate_chain_payload_no_chain() -> None:
    ok, msg = validate_chain_payload({"has_chain": False})
    assert ok and msg == "no chain"


def test_build_user_prompt_primary_only_omits_commentary() -> None:
    obj = {"sutta_id": "1.1", "sutta": "hello", "commentary": "secret"}
    full = build_user_prompt(obj, primary_only=False, book_num=None)
    assert "secret" in full
    primary = build_user_prompt(obj, primary_only=True, book_num=None)
    assert "secret" not in primary
    assert "hello" in primary


def test_parse_anguttara_book_num() -> None:
    assert parse_anguttara_book_num("10.101") == 10
    assert parse_anguttara_book_num("8.2.12") == 8
    assert parse_anguttara_book_num("") is None


def test_validate_chain_book_length_mismatch() -> None:
    p = {
        "has_chain": True,
        "chain": {
            "items": ["a", "b", "c"],
            "count": 3,
            "is_ordered": True,
            "category": "x",
        },
    }
    ok, msg = validate_chain_payload(p, book_num=10, require_book_length=True)
    assert not ok
    assert "book 10" in msg


def test_build_user_prompt_includes_book_line_when_given() -> None:
    obj = {"sutta_id": "10.2", "sutta": "x", "commentary": "y"}
    text = build_user_prompt(obj, primary_only=False, book_num=10)
    assert "Book 10" in text
    assert "exactly 10 items" in text


def test_rolling_few_shot_caps_and_suffix() -> None:
    buf = RollingFewShot(2)
    assert buf.system_prompt_suffix(10) == ""
    c = {"items": ["a"], "count": 1, "is_ordered": True, "category": "x"}
    buf.record_write(10, "10.1", c)
    buf.record_write(10, "10.2", {**c, "items": ["b"], "category": "y"})
    buf.record_write(10, "10.3", {**c, "items": ["c"], "category": "z"})
    s = buf.system_prompt_suffix(10)
    assert "10.1" not in s
    assert "10.3" in s
    assert "10.2" in s


def test_rolling_few_shot_disjoint_books() -> None:
    buf = RollingFewShot(5)
    chain10 = {"items": ["x"], "count": 1, "is_ordered": True, "category": "a"}
    chain11 = {"items": ["y"], "count": 1, "is_ordered": True, "category": "b"}
    buf.record_write(10, "10.1", chain10)
    buf.record_write(11, "11.1", chain11)
    assert "10.1" in buf.system_prompt_suffix(10)
    assert "11.1" in buf.system_prompt_suffix(11)
    assert "11.1" not in buf.system_prompt_suffix(10)


def test_compose_system_prompt_appends_suffix() -> None:
    out = compose_system_prompt("EXTRA LINE")
    assert out.startswith(_mod.SYSTEM_PROMPT[:40])
    assert "EXTRA LINE" in out


def test_rolling_few_shot_zero_disabled() -> None:
    buf = RollingFewShot(0)
    buf.record_write(10, "10.1", {"items": ["a"], "count": 1, "is_ordered": True, "category": "x"})
    assert buf.system_prompt_suffix(10) == ""


def test_parse_book_list_csv() -> None:
    assert parse_book_list_csv("9, 8 ,7") == [9, 8, 7]


def test_build_jobs_from_books() -> None:
    ns = argparse.Namespace(pattern=None, book=None, books="9,8")
    jobs = build_jobs(ns)
    assert jobs == [(9, "an9/suttas/*.json"), (8, "an8/suttas/*.json")]
