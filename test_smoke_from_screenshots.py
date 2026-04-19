"""
Smoke tests derived from gold UI screenshots (Past chats + eval flows).

Prerequisites:
  - App running (e.g. uvicorn an1_app:app --port 8000)
  - Local Chroma built (POST /api/build or Rebuild), unless using Vertex with bundle

Run from repo root (retrieval only, fast, no Ollama):
  pip install -r requirements-smoke.txt
  set SMOKE_BASE_URL=http://127.0.0.1:8000
  rem DIY login is on by default — for smoke tests start the server with DAMA_DIY_AUTH=0
  pytest test_smoke_from_screenshots.py -q

Run with LLM (needs working Ollama / Vertex LLM):
  set SMOKE_WITH_LLM=1
  pytest test_smoke_from_screenshots.py -q
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List

import pytest
import requests

_DIR = Path(__file__).resolve().parent
_BASE = os.environ.get("SMOKE_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
_WITH_LLM = os.environ.get("SMOKE_WITH_LLM", "").strip().lower() in ("1", "true", "yes", "on")


def _load_cases() -> List[Dict[str, Any]]:
    raw = json.loads((_DIR / "smoke_evals.json").read_text(encoding="utf-8"))
    return list(raw["cases"])


_CASES = _load_cases()


@pytest.fixture(scope="module")
def http() -> requests.Session:
    s = requests.Session()
    try:
        r = s.get(f"{_BASE}/api/index_status", timeout=8)
        r.raise_for_status()
    except OSError as e:
        pytest.skip(f"Cannot reach app at {_BASE}: {e}")
    except requests.HTTPError as e:
        pytest.skip(f"Bad response from {_BASE}/api/index_status: {e}")
    data = r.json()
    if not data.get("exists"):
        pytest.skip("Index empty: run POST /api/build (Rebuild) before smoke tests.")
    return s


def test_home_page_loads(http: requests.Session) -> None:
    r = http.get(f"{_BASE}/", timeout=15)
    assert r.status_code == 200
    assert "text/html" in (r.headers.get("content-type") or "").lower()


def test_index_status_local_or_vertex(http: requests.Session) -> None:
    r = http.get(f"{_BASE}/api/index_status", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data.get("exists") is True
    mode = data.get("mode")
    assert mode in ("local_chroma", "vertex")


@pytest.mark.parametrize("case", _CASES, ids=lambda c: str(c["id"]))
def test_query_smoke_from_gold_screenshots(http: requests.Session, case: Dict[str, Any]) -> None:
    use_llm = _WITH_LLM
    payload = {
        "question": case["question"],
        "book": "all",
        "k": 8,
        "use_llm": use_llm,
    }
    # First query can cold-load sentence-transformers + reranker (>2m on slow disks).
    r = http.post(f"{_BASE}/api/query", json=payload, timeout=600 if use_llm else 300)
    if r.status_code == 401:
        pytest.skip("Server requires login (default DIY auth). Restart with DAMA_DIY_AUTH=0 for smoke tests.")
    assert r.status_code == 200, r.text
    data = r.json()
    chunks = data.get("chunks") or []

    if case.get("expect_chat_only"):
        assert data.get("used_llm") is False
        assert len(chunks) == 0
        assert len((data.get("answer") or "").strip()) > 5
        return

    expect_chunks = case.get("expect_chunks", True)
    if expect_chunks:
        assert len(chunks) >= 1, f"No retrieval chunks for: {case['id']}"

    if use_llm:
        ans = (data.get("answer") or "").lower()
        assert len(ans) > 40, f"LLM answer too short for {case['id']}"
        for kw in case.get("llm_answer_keywords") or []:
            assert kw.lower() in ans, f"Expected keyword {kw!r} in answer for {case['id']}"


@pytest.mark.skipif(not _WITH_LLM, reason="Set SMOKE_WITH_LLM=1 to run primary eval LLM checks")
def test_primary_evals_water_and_shame(http: requests.Session) -> None:
    """Spot-check the two evals called out in planning (also in Past chats PNG)."""
    pairs = (
        ("What did buddha say about water?", ("water", "river", "rain", "drink", "liquid")),
        ("What does buddha say about shame?", ("shame", "conscience", "moral", "guilt", "remorse")),
    )
    for question, keywords in pairs:
        r = http.post(
            f"{_BASE}/api/query",
            json={"question": question, "book": "all", "k": 8, "use_llm": True},
            timeout=600,
        )
        if r.status_code == 401:
            pytest.skip("Server requires login. Restart with DAMA_DIY_AUTH=0 for smoke tests.")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("used_llm") is True
        assert len(data.get("chunks") or []) >= 1
        ans = (data.get("answer") or "").lower()
        assert len(ans) > 80
        assert any(kw in ans for kw in keywords), (
            f"Expected one of {keywords} in LLM answer for {question!r}"
        )
