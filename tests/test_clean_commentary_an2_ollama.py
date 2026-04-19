from __future__ import annotations

import requests

from clean_commentary_an2_ollama import clean_text_via_ollama


class _FakeResp:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self):
        return self._payload


def test_clean_text_via_ollama_uses_response_field(monkeypatch) -> None:
    http = requests.Session()

    def fake_post(url, json, timeout):  # noqa: A002
        assert url.endswith("/api/generate")
        assert json["stream"] is False
        assert "prompt" in json and "TEXT:" in json["prompt"]
        return _FakeResp({"response": "Cleaned sentence."})

    monkeypatch.setattr(http, "post", fake_post)
    out = clean_text_via_ollama(http, base_url="http://localhost:11434", model="x", text="uh hi there", timeout_s=5)
    assert out == "Cleaned sentence."

