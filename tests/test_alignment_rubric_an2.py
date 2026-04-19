from __future__ import annotations

from update_alignment_an2 import compute_alignment


def test_alignment_tokens_remove_stopwords_improves_similarity() -> None:
    # Stopword-heavy phrasing should not suppress similarity too much.
    entry = {
        "sutta_id": "x",
        "sc_id": "an2.2",
        "sc_url": "https://suttacentral.net/an2.2/en/sujato",
        "aud_file": "x.mp3",
        "aud_start_s": 1.0,
        "aud_end_s": 2.0,
        "sutta": "The Buddha said the monk should train in the way that is good.",
        "sc_sutta": "Buddha said: monk should train in way good.",
        "commentary": "",
        "chain": {"items": [], "count": 0},
    }
    ar = compute_alignment(entry)
    # With stopwords removed, this should not be a near-zero match.
    assert ar.scores["text_to_source"] >= 2


def test_chain_support_uses_token_overlap_not_exact_phrase() -> None:
    entry = {
        "sutta_id": "x",
        "sc_id": "an2.2",
        "sc_url": "https://suttacentral.net/an2.2/en/sujato",
        "aud_file": "x.mp3",
        "aud_start_s": 1.0,
        "aud_end_s": 2.0,
        "sutta": "Householders struggle to provide robes, food, lodging, and medicine.",
        "sc_sutta": "",
        "commentary": "The renunciant struggles to renounce attachments; this is the greater struggle.",
        "chain": {"items": ["householder struggle", "renunciant struggle"], "count": 2},
    }
    ar = compute_alignment(entry)
    assert ar.scores["chain"] >= 4

