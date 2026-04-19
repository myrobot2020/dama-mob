"""
Regression: /api/query with use_llm=True and zero retrieved chunks must not call the LLM
with an empty passage list (which produced "No passages were retrieved…").

Uses FastAPI TestClient + mocks — no running Ollama/Chroma/embeddings required.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("DAMA_RUNTIME", "local")
    monkeypatch.setenv("DAMA_DIY_AUTH", "0")
    monkeypatch.delenv("DAMA_LLM", raising=False)
    monkeypatch.delenv("DAMA_USE_VERTEX_LLM", raising=False)

    import an1_app as m

    monkeypatch.setattr(m.vx, "an1_vertex_enabled", lambda: False)
    monkeypatch.setattr(m, "_vertex_llm_enabled", lambda: False)

    p = tmp_path / "persist_an1"
    p.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(m, "PERSIST_DIR", p)

    def _empty_retrieval(_rf, query, k, rephrase_fn=None):
        return (str(query or "").strip() or "q", [str(query or "").strip() or "q"], [])

    monkeypatch.setattr(m, "_first_hit_retrieval_loop", _empty_retrieval)

    with TestClient(m.app) as c:
        yield c


def test_query_use_llm_empty_chunks_uses_fallback_not_internal_no_passages_string(client):
    """Local RAG path: empty retrieval + LLM requested → friendly fallback, used_llm False."""
    r = client.post(
        "/api/query",
        json={"question": "water", "book": "all", "k": 5, "use_llm": True},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("chunks") == []
    assert data.get("used_llm") is False
    ans = str(data.get("answer") or "")
    assert "No passages were retrieved" not in ans
    assert "couldn" in ans.lower() or "supporting passages" in ans.lower()
