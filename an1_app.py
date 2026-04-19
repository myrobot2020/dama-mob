import json
import os
import re
import threading
import time
import uuid
import zlib
from contextlib import asynccontextmanager
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Annotated, Any, Dict, List, Optional, Set, Tuple


def _load_dotenv(repo_root: Path) -> None:
    """Load repo-root .env into os.environ if present (does not override existing vars)."""
    path = repo_root / ".env"
    if not path.is_file():
        return
    try:
        text = path.read_text(encoding="utf-8-sig")
    except OSError:
        return
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        if not key or key.startswith("#"):
            continue
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
            val = val[1:-1]
        if key not in os.environ:
            os.environ[key] = val


_load_dotenv(Path(__file__).resolve().parent)

from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from pydantic import BaseModel, Field, field_validator
import requests

import an1_build_index as an1_build
import an1_vertex_core as vx
import dama_diy_auth as dama_diy
import dama_firebase_auth as dama_fb
from dama_auth_ui import register_auth_ui_routes, session_https_only, session_secret
from fastapi.staticfiles import StaticFiles
from an1_build_index import (
    _commentary_body,
    _commentary_id,
    _extract_records_fallback,
    _normalize_suttaid_an2,
    _parse_json_lenient,
)


BASE_DIR = Path(__file__).resolve().parent
GLOBAL_CONVERSATIONS_DIR = BASE_DIR / "global_chat_history"
CONVERSATIONS_INDEX = "conversations_index.json"
AN1_PATH = an1_build.AN1_PATH
PERSIST_DIR = an1_build.PERSIST_DIR
COLLECTION_NAME = an1_build.COLLECTION_NAME
AN2_PATH = an1_build.AN2_PATH
PERSIST_AN2_DIR = an1_build.PERSIST_AN2_DIR
COLLECTION_AN2 = an1_build.COLLECTION_AN2
AN3_PATH = an1_build.AN3_PATH
PERSIST_AN3_DIR = an1_build.PERSIST_AN3_DIR
COLLECTION_AN3 = an1_build.COLLECTION_AN3
_GONG_ENV = os.environ.get("DAMA_GONG_MP3", "").strip()
_GONG_DEFAULT_MP3 = BASE_DIR / "freesound_community-gong-79191.mp3"
GONG_MP3_PATH = (
    Path(_GONG_ENV).expanduser().resolve()
    if _GONG_ENV
    else (_GONG_DEFAULT_MP3 if _GONG_DEFAULT_MP3.is_file() else (BASE_DIR / "temp_gong.wav"))
)

OLLAMA_BASE_URL = (
    os.environ.get("DAMA_OLLAMA_BASE_URL", "").strip()
    or os.environ.get("OLLAMA_BASE_URL", "").strip()
    or "http://localhost:11434"
).rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "").strip() or "mistral:instruct"

# OpenRouter (OpenAI-compatible chat). Enable with DAMA_LLM=openrouter and OPENROUTER_API_KEY.
OPENROUTER_API_BASE = (
    os.environ.get("OPENROUTER_API_BASE", "").strip().rstrip("/") or "https://openrouter.ai/api/v1"
)

# Reuse HTTP connections (Ollama + metadata server, etc.)
_HTTP = requests.Session()

# Cache for SuttaCentral fetched plain-text (keyed by sc_slug, e.g. "an2.2/en/sujato?...").
_SC_TEXT_CACHE: Dict[str, str] = {}

# Cache raw JSON metadata for Reference panel (sc_id/sc_url/sc_sutta/audio).
_RAW_META_CACHE: Dict[str, Dict[str, Dict[str, Any]]] = {}

# Bumped when RAG/LLM behavior changes (shown in GET /api/index_status so you know the server reloaded).
AN1_APP_BUILD = "2026-04-13-gong-autoplay-gesture"

# Short reply for greetings / smalltalk — the citation-only LLM prompt is wrong for this (it still sees random retrieval).
_CHAT_ONLY_REPLY = (
    "Hi there. Ask anything about the AN1 or AN2 teachings (suttas, commentary, or themes), "
    "or click an (AN …) or (cAN …) citation in an answer to open the full text in Reference."
)

_CHAT_SUBSTANTIVE_HINT = re.compile(
    r"\b(?:"
    r"what|why|when|where|who|whom|which|"
    r"how\s+(?:do|does|did|can|could|should|would|is|are|was|were|many|much|long|far|often|come|work)"
    r"|explain|meaning|define|sutta|suttas|dhamma|buddha|"
    r"noble|eightfold|path|meditation|jhana|karma|rebirth|nibbana|nirvana|teach|teaching|"
    r"compare|difference|according|chapter|verse|quote|paraphrase|discourse|canon"
    r"|an\d+\s*\.|c?an\s*\d"
    r")\b",
    re.I,
)

_CHAT_GREETING_PHRASES = frozenset(
    {
        "hi",
        "hello",
        "hey",
        "yo",
        "sup",
        "howdy",
        "greetings",
        "hi there",
        "hey there",
        "hello there",
        "good morning",
        "good afternoon",
        "good evening",
        "good day",
        "thanks",
        "thank you",
        "thankyou",
        "thx",
        "ty",
        "ok",
        "okay",
        "ok thanks",
        "okay thanks",
        "thanks a lot",
        "thank you so much",
        "tysm",
        "bye",
        "goodbye",
        "see you",
        "cya",
        "later",
        "whats up",
        "what's up",
        "wassup",
        "how are you",
        "how are u",
        "how r u",
        "nice to meet you",
        "morning",
        "evening",
        "afternoon",
    }
)


def _normalize_chat_probe(q: str) -> str:
    t = (q or "").strip().lower()
    t = re.sub(r"[!?.]+$", "", t)
    t = re.sub(r"\s+", " ", t)
    return t


def _is_chat_only_message(question: str) -> bool:
    q = (question or "").strip()
    if not q or len(q) > 140:
        return False
    if re.search(r"\d", q):
        return False
    low = q.lower()
    if "?" in q and not re.search(r"how\s+are\s+you", low):
        return False
    if _CHAT_SUBSTANTIVE_HINT.search(low):
        return False
    norm = _normalize_chat_probe(q)
    if norm in _CHAT_GREETING_PHRASES:
        return True
    if len(norm) <= 10:
        tokens = re.findall(r"[a-z']+", norm)
        if not tokens:
            return False
        small = frozenset(
            {
                "hi",
                "hey",
                "hello",
                "yo",
                "sup",
                "there",
                "you",
                "thanks",
                "thank",
                "thx",
                "ty",
                "ok",
                "okay",
                "yes",
                "no",
                "hm",
                "hmm",
                "cool",
                "nice",
                "great",
                "good",
                "well",
                "morning",
                "afternoon",
                "evening",
                "day",
                "bye",
                "welcome",
                "back",
                "again",
                "a",
                "the",
                "to",
                "so",
                "very",
                "just",
                "im",
                "i",
                "am",
                "are",
                "is",
                "it",
                "me",
                "my",
                "we",
            }
        )
        if len(tokens) <= 5 and all(t in small for t in tokens):
            return True
    return False

DEBUG_LOG_PATH = BASE_DIR / "debug-655121.log"


@dataclass
class _AuthCtx:
    firebase_uid: Optional[str] = None
    diy_user_id: Optional[int] = None


def _require_api_user(request: Request, authorization: Optional[str]) -> _AuthCtx:
    """Firebase Bearer when enabled; else DIY session; else open when both off."""
    if dama_fb.firebase_enabled():
        if not authorization or not authorization.strip().lower().startswith("bearer "):
            raise HTTPException(status_code=401, detail="Authorization Bearer token required")
        tok = authorization.split(" ", 1)[1].strip()
        try:
            return _AuthCtx(firebase_uid=dama_fb.verify_id_token(tok))
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Invalid or expired token: {e}") from e
    if dama_diy.diy_auth_enabled() and not dama_fb.firebase_enabled():
        uid = request.session.get("uid")
        if uid is None:
            raise HTTPException(status_code=401, detail="Not logged in")
        return _AuthCtx(diy_user_id=int(uid))
    return _AuthCtx()


def _fallback_diy_id_for_firebase_uid(uid: str) -> int:
    """
    Local/dev fallback when Firebase is enabled but Firestore is unavailable.
    Produces a stable positive 31-bit integer id from uid for per-user local storage.
    """
    u = (uid or "").strip().encode("utf-8", errors="ignore")
    return int(zlib.crc32(u) & 0x7FFFFFFF)


def _firestore_unavailable_error(e: Exception) -> bool:
    s = str(e or "")
    return ("firestore.googleapis.com" in s) or ("SERVICE_DISABLED" in s) or ("PermissionDenied" in s)


def _chat_storage_dir(diy_user_id: Optional[int]) -> Path:
    if diy_user_id is None:
        GLOBAL_CONVERSATIONS_DIR.mkdir(parents=True, exist_ok=True)
        return GLOBAL_CONVERSATIONS_DIR.resolve()
    root = (GLOBAL_CONVERSATIONS_DIR / "users" / str(int(diy_user_id))).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _is_uuid_str(s: str) -> bool:
    try:
        uuid.UUID(str(s).strip())
        return True
    except (ValueError, TypeError, AttributeError):
        return False


def _conversation_jsonl_path(conversation_id: str, diy_user_id: Optional[int] = None) -> Path:
    cid = str(conversation_id or "").strip().lower()
    if not _is_uuid_str(cid):
        raise HTTPException(status_code=400, detail="invalid conversation id")
    base = _chat_storage_dir(diy_user_id)
    p = (base / f"{cid}.jsonl").resolve()
    if p.parent != base:
        raise HTTPException(status_code=400, detail="invalid path")
    return p


def _conversations_index_path(diy_user_id: Optional[int] = None) -> Path:
    return _chat_storage_dir(diy_user_id) / CONVERSATIONS_INDEX


def _read_conversation_index(diy_user_id: Optional[int] = None) -> List[Dict[str, Any]]:
    path = _conversations_index_path(diy_user_id)
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _write_conversation_index(rows: List[Dict[str, Any]], diy_user_id: Optional[int] = None) -> None:
    path = _conversations_index_path(diy_user_id)
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def _conversation_has_valid_turn(path: Path) -> bool:
    if not path.is_file():
        return False
    for m in _read_jsonl_messages(path):
        q = str(m.get("q") or "").strip()
        a = str(m.get("a") or "").strip()
        if q and a and a != "(no answer)":
            return True
    return False


def _prune_empty_conversations(diy_user_id: Optional[int] = None) -> None:
    """Drop index rows / jsonl with no stored Q+A; merge duplicate index ids; re-write index."""
    base = _chat_storage_dir(diy_user_id)
    idx_rows = _read_conversation_index(diy_user_id)
    by_cid: Dict[str, List[Dict[str, Any]]] = {}
    for row in idx_rows:
        if not isinstance(row, dict) or not row.get("id"):
            continue
        cid = str(row["id"]).strip().lower()
        if not _is_uuid_str(cid):
            continue
        by_cid.setdefault(cid, []).append(row)

    all_cids = set(by_cid.keys())
    if base.is_dir():
        for p in base.glob("*.jsonl"):
            stem = p.stem.strip().lower()
            if _is_uuid_str(stem):
                all_cids.add(stem)

    out: List[Dict[str, Any]] = []
    for cid in all_cids:
        try:
            path = _conversation_jsonl_path(cid, diy_user_id)
        except HTTPException:
            continue
        if not _conversation_has_valid_turn(path):
            if path.is_file():
                try:
                    path.unlink()
                except OSError:
                    pass
            continue

        msgs = _read_jsonl_messages(path)
        msg_ts = max((int(m.get("ts") or 0) for m in msgs), default=0)
        mtime = int(path.stat().st_mtime * 1000) if path.is_file() else 0
        best_ts = max(msg_ts, mtime)
        for r in by_cid.get(cid, []):
            best_ts = max(best_ts, int(r.get("updated_ts") or 0))

        title = "Chat"
        for r in by_cid.get(cid, []):
            t = str(r.get("title") or "").strip()
            if t and t != "New chat":
                title = t
                break
        if title == "Chat":
            for r in by_cid.get(cid, []):
                t = str(r.get("title") or "").strip()
                if t:
                    title = t
                    break

        out.append({"id": str(uuid.UUID(cid)), "title": title, "updated_ts": best_ts})

    out.sort(key=lambda r: -int(r.get("updated_ts") or 0))
    _write_conversation_index(out, diy_user_id)


def _list_conversations_merged(diy_user_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Index only (pruned); sorted by updated_ts desc."""
    by_id: Dict[str, Dict[str, Any]] = {}
    for row in _read_conversation_index(diy_user_id):
        if not isinstance(row, dict) or not row.get("id"):
            continue
        cid = str(row["id"]).strip().lower()
        if not _is_uuid_str(cid):
            continue
        by_id[cid] = {
            "id": cid,
            "title": str(row.get("title") or "Chat").strip() or "Chat",
            "updated_ts": int(row.get("updated_ts") or 0),
        }
    return sorted(by_id.values(), key=lambda x: -int(x.get("updated_ts") or 0))


def _dbg(hypothesis_id: str, location: str, message: str, data: Optional[Dict[str, Any]] = None, run_id: str = "pre-fix") -> None:
    try:
        payload = {
            "sessionId": "655121",
            "runId": run_id,
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data or {},
            "timestamp": int(__import__("time").time() * 1000),
        }
        with DEBUG_LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass


def _dbg721082(
    hypothesis_id: str,
    location: str,
    message: str,
    data: Optional[Dict[str, Any]] = None,
    run_id: str = "pre-fix",
) -> None:
    """Debug-mode NDJSON for session 721082 (no secrets)."""
    try:
        payload = {
            "sessionId": "721082",
            "runId": run_id,
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data or {},
            "timestamp": int(time.time() * 1000),
        }
        p = BASE_DIR / ".cursor" / "debug-721082.log"
        p.parent.mkdir(parents=True, exist_ok=True)
        with p.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass


class QueryRequest(BaseModel):
    question: str = Field(min_length=1)
    k: int = Field(default=6, ge=1, le=20)
    use_llm: bool = Field(default=True)
    book: str = Field(
        default="all",
        description="Books: an1/an2/an3/all. NOTE: in this repo, all = an2+an3 (an1 is opt-in).",
    )

    @field_validator("book")
    @classmethod
    def _norm_query_book(cls, v: str) -> str:
        b = (v or "all").strip().lower()
        return b if b in ("an1", "an2", "an3", "all") else "all"


class Chunk(BaseModel):
    source: str = ""
    suttaid: str = ""
    commentary_id: str = ""
    kind: str = ""
    book: str = ""
    distance: Optional[float] = None
    text: str


class QueryResponse(BaseModel):
    chunks: List[Chunk]
    answer: str = ""
    used_llm: bool = False


class BuildResponse(BaseModel):
    ok: bool
    collection_count: int


class ItemSummary(BaseModel):
    suttaid: str
    title: str = ""
    has_commentary: bool = False


class ItemDetail(BaseModel):
    suttaid: str
    sutta: str
    commentry: str = ""
    commentary_id: str = ""
    sc_id: str = ""
    sc_url: str = ""
    sc_sutta: str = ""
    aud_file: str = ""
    aud_start_s: float = 0.0
    aud_end_s: float = 0.0
    chain: Optional[Dict[str, Any]] = None


class ChatHistoryAppend(BaseModel):
    question: str = ""
    answer: str = ""
    latency_ms: int = Field(default=0, ge=0, le=3_600_000)


class ConversationCreate(BaseModel):
    title: str = Field(default="", max_length=240)


_lock = threading.RLock()
_embed_model: Optional[Any] = None
_reranker: Optional[Any] = None
_items_cache: Dict[str, List[ItemDetail]] = {}
_collection_cache: Dict[str, Any] = {}
_chroma_client_cache: Dict[str, Any] = {}


def _norm_book(book: Optional[str]) -> str:
    b = (book or "an1").strip().lower()
    return b if b in ("an1", "an2", "an3") else "an1"

def _normalize_suttaid_an1(raw: Any) -> str:
    """
    Normalize AN1 sutta IDs so Reference links are stable.

    Canonical form matches UI citations:
      - "1.5.8"    -> "AN 1.5.8"
      - "AN1.5.8"  -> "AN 1.5.8"
      - "AN 1.5.8" -> "AN 1.5.8"
    """
    s = str(raw or "").strip()
    if not s:
        return ""
    s = re.sub(r"^AN\s*", "AN ", s, flags=re.I).strip()
    if s.upper().startswith("AN ") and len(s) > 3:
        return "AN " + s[3:].strip()
    if re.match(r"^\d", s):
        return "AN " + s
    return s


def _normalize_commentary_id(raw: Any) -> str:
    s = str(raw or "").strip()
    if not s:
        return ""
    # Canonicalize "cAN…" spacing/case (what the UI emits)
    s = re.sub(r"^c\\s*an\\s*", "cAN ", s, flags=re.I).strip()
    if s.lower().startswith("can") and not s.startswith("cAN "):
        # e.g. "cAN1.5.8" -> "cAN 1.5.8"
        s = "cAN " + s[3:].strip()
    return s


def _persist_dir_for_book(book: str) -> Path:
    if book == "an2":
        return PERSIST_AN2_DIR
    if book == "an3":
        return PERSIST_AN3_DIR
    return PERSIST_DIR


def _collection_name_for_book(book: str) -> str:
    if book == "an2":
        return COLLECTION_AN2
    if book == "an3":
        return COLLECTION_AN3
    return COLLECTION_NAME


def _get_collection(book: str = "an1") -> Any:
    import chromadb
    from chromadb.config import Settings

    b = _norm_book(book)
    key = b
    col = _collection_cache.get(key)
    if col is not None:
        return col
    # Cache PersistentClient per path to avoid repeated sqlite initialization cost.
    pdir = str(_persist_dir_for_book(b))
    client = _chroma_client_cache.get(pdir)
    if client is None:
        client = chromadb.PersistentClient(
            path=pdir,
            settings=Settings(anonymized_telemetry=False),
        )
        _chroma_client_cache[pdir] = client
    col = client.get_collection(_collection_name_for_book(b))
    _collection_cache[key] = col
    return col


def _get_embed_model() -> Any:
    global _embed_model
    if _embed_model is None:
        from sentence_transformers import SentenceTransformer

        _dbg("H5", "an1_app.py:_get_embed_model", "Loading embedding model", {"model": "all-MiniLM-L6-v2"})
        # NOTE: When HuggingFace Hub is down/unreachable, SentenceTransformer may spend a long time retrying
        # downloads, which makes the UI feel "stuck searching". We handle failures in /api/query by falling
        # back to lexical search (so the app remains usable offline).
        _embed_model = SentenceTransformer("all-MiniLM-L6-v2")
    return _embed_model


def _get_reranker() -> Any:
    global _reranker
    if _reranker is None:
        from sentence_transformers import CrossEncoder

        _dbg("H5", "an1_app.py:_get_reranker", "Loading reranker", {"model": "cross-encoder/ms-marco-MiniLM-L-6-v2"})
        _reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
    return _reranker


def _preview_text(text: str, limit: int = 1600) -> str:
    s = (text or "").strip()
    if not s:
        return ""
    if len(s) <= limit:
        return s
    return s[:limit].rstrip() + "…"


def _lexical_retrieve_from_items(query: str, k: int, *, book: str = "all") -> List[Chunk]:
    """
    Fallback retrieval when embeddings/reranker are unavailable.
    This is deliberately simple (substring + token hits) but keeps the app usable offline.
    """
    q = (query or "").strip().lower()
    if not q:
        return []

    raw_book = (book or "all").strip().lower()
    if raw_book in ("an1", "an2", "an3"):
        items = _load_items(raw_book)
    else:
        items = _merged_item_details()

    tokens = _tokenize_query(q)

    def score_blob(blob: str) -> int:
        b = (blob or "").lower()
        s = 0
        if len(q) <= 80 and q in b:
            s += 200
        if tokens:
            matched = sum(1 for t in tokens if t in b)
            s += matched * 10
        return s

    scored: List[Tuple[int, str, str, ItemDetail]] = []
    for it in items:
        sid = (it.suttaid or "").strip()
        if sid.strip().startswith("AN 3.") or sid.strip().startswith("AN3."):
            bk = "an3"
        elif sid.strip().startswith("AN 2.") or sid.strip().startswith("AN2."):
            bk = "an2"
        else:
            bk = "an1"
        s_sutta = score_blob(f"{sid}\n{it.sutta}")
        if s_sutta > 0:
            scored.append((s_sutta, bk, "sutta", it))
        comm = (it.commentry or "").strip()
        if comm:
            s_comm = score_blob(f"{sid}\n{it.commentary_id}\n{comm}")
            if s_comm > 0:
                scored.append((s_comm, bk, "commentary", it))
        # NOTE: We deliberately do NOT retrieve CHAIN as a chat chunk.
        # CHAIN is only displayed in the Reference Links panel (item metadata),
        # never in chat answers or retrieval-only summaries.

    scored.sort(key=lambda x: (-x[0], x[1], x[2], x[3].suttaid))

    out: List[Chunk] = []
    for _, bk, kind, it in scored:
        if kind == "sutta":
            out.append(
                Chunk(
                    source="lexical_fallback",
                    suttaid=it.suttaid,
                    commentary_id=it.commentary_id or "",
                    kind="sutta",
                    book=bk,
                    distance=None,
                    text="SUTTA:\n" + _preview_text(it.sutta),
                )
            )
        elif kind == "commentary":
            out.append(
                Chunk(
                    source="lexical_fallback",
                    suttaid=it.suttaid,
                    commentary_id=it.commentary_id or "",
                    kind="commentary",
                    book=bk,
                    distance=None,
                    text="TEACHER COMMENTARY:\n" + _preview_text(it.commentry),
                )
            )
        # No 'chain' chunks emitted.

        if len(out) >= max(6, min(14, k * 2)):
            break

    return _dedupe_chunks_keep_order(out)[:14]


def _extract_body_from_chunk_text(kind: str, text: str) -> str:
    """Extract the sutta/commentary body from a retrieval chunk payload."""
    t = str(text or "")
    k = str(kind or "").strip().lower()
    if k == "commentary":
        i = t.find("TEACHER COMMENTARY:\n")
        if i >= 0:
            return t[i + len("TEACHER COMMENTARY:\n") :].strip()
        j = t.find("TEACHER COMMENTARY:")
        if j >= 0:
            return t[j + len("TEACHER COMMENTARY:") :].strip()
        return t.strip()
    # sutta
    i = t.find("SUTTA:\n")
    if i >= 0:
        return t[i + len("SUTTA:\n") :].strip()
    j = t.find("SUTTA:")
    if j >= 0:
        return t[j + len("SUTTA:") :].strip()
    return t.strip()


_CITE_RE = re.compile(r"\b(cAN|AN)\s*\d+(?:\.\d+)*\b", re.I)


def _norm_an_ref(raw: str) -> str:
    m = re.search(r"(\d+(?:\.\d+)*)", str(raw or ""))
    return f"AN {m.group(1)}" if m else ""


def _norm_can_ref(raw: str, *, fallback_suttaid: str = "") -> str:
    s = str(raw or "").strip()
    m = re.search(r"(\d+(?:\.\d+)*)", s)
    if not m and fallback_suttaid:
        m = re.search(r"(\d+(?:\.\d+)*)", str(fallback_suttaid))
    return f"cAN {m.group(1)}" if m else ""


def _filter_chat_chunks(chunks: List[Chunk]) -> List[Chunk]:
    """Drop CHAIN chunks and empty commentary chunks so chat never cites empty commentary."""
    out: List[Chunk] = []
    for c in chunks or []:
        k = (c.kind or "").strip().lower()
        if k == "chain":
            continue
        if k == "commentary":
            body = _extract_body_from_chunk_text("commentary", c.text or "")
            if not body.strip():
                continue
        out.append(c)
    return out


def _allowlists_from_chunks(chunks: List[Chunk]) -> Tuple[Set[str], Set[str]]:
    allowed_an: Set[str] = set()
    allowed_can: Set[str] = set()
    for c in chunks or []:
        k = (c.kind or "").strip().lower()
        if k == "sutta":
            r = _norm_an_ref(c.suttaid or "")
            if r:
                allowed_an.add(r)
        elif k == "commentary":
            # only allow cAN if chunk body is non-empty (enforced by _filter_chat_chunks)
            r = _norm_can_ref(c.commentary_id or "", fallback_suttaid=c.suttaid or "")
            if r:
                allowed_can.add(r)
    return allowed_an, allowed_can


def _illegal_citations(answer: str, allowed_an: Set[str], allowed_can: Set[str]) -> List[str]:
    bad: List[str] = []
    for m in _CITE_RE.finditer(str(answer or "")):
        raw = m.group(0)
        if raw.lower().startswith("can"):
            ref = _norm_can_ref(raw)
            if ref and ref not in allowed_can:
                bad.append(ref)
        else:
            ref = _norm_an_ref(raw)
            if ref and ref not in allowed_an:
                bad.append(ref)
    # preserve order, de-dupe
    return list(dict.fromkeys(bad))


def _synthesize_retrieval_only_answer(chunks: List[Chunk]) -> str:
    top = list(chunks or [])[:6]
    if not top:
        return "(no answer)"
    lines = ["Retrieval results (no LLM):", ""]
    for c in top:
        kind = (c.kind or "").strip().lower()
        if kind == "chain":
            continue
        sid = str(c.suttaid or "").strip()
        cid = str(c.commentary_id or "").strip()
        snippet = re.sub(r"\s+", " ", str(c.text or "")).strip()[:220]
        if kind == "commentary":
            cite = _norm_can_ref(cid, fallback_suttaid=sid)
        else:
            cite = _norm_an_ref(sid)
        lines.append("- " + snippet + (f" ({cite})" if cite else ""))
    return "\n".join(lines).strip()


_STOPWORDS = frozenset(
    "a an and are as at be but by do for from get got has have he her him his how "
    "if in into is it its just me my no nor not now of on or our out own she so "
    "some than that the their them then there these they this those through to too "
    "very was we were what when where which who will with would you your".split()
)


def _tokenize_query(q: str) -> List[str]:
    tokens = [
        t for t in re.findall(r"[a-zA-Z0-9']+", (q or "").lower())
        if len(t) >= 3 and t not in _STOPWORDS
    ]
    return tokens[:12]


def _chunk_from_doc(doc: Any, meta: Any, dist: Optional[float] = None) -> Chunk:
    src = ""
    sid = ""
    cid = ""
    kind = ""
    book = ""
    if isinstance(meta, dict):
        src = str(meta.get("source") or "")
        sid = str(meta.get("suttaid") or "")
        cid = str(meta.get("commentary_id") or "")
        kind = str(meta.get("kind") or "")
        book = str(meta.get("book") or "").strip().lower()
        if book not in ("an1", "an2") and src:
            book = "an2" if "an2" in src.lower() else ""
        if book not in ("an1", "an2"):
            book = ""
    return Chunk(
        source=src,
        suttaid=sid,
        commentary_id=cid,
        kind=kind,
        book=book,
        distance=float(dist) if dist is not None else None,
        text=str(doc),
    )


def _retrieval_boost_phrases(query: str) -> List[str]:
    """Multi-word or rare tokens that token search can miss on long questions (phrase > 60 chars)."""
    ql = (query or "").lower()
    out: List[str] = []
    if "thorough attention" in ql:
        out.append("thorough attention")
    if "yoniso" in ql:
        out.append("Yoniso")
    if "manasikara" in ql:
        out.append("Manasikara")
    if "feature of beauty" in ql:
        out.append("feature of beauty")
    if "subha-nimitta" in ql:
        out.append("Subha-nimitta")
    elif "nimitta" in ql and "subha" in ql:
        out.append("Subha-nimitta")
    # Sense-sphere: AN 1.1.2 text uses "scent"; users often say "smell".
    if any(x in ql for x in ("smell", "scent", "odor", "fragrance")):
        out.append("scent")
    for w in ("sound", "touch", "taste"):
        if w in ql:
            out.append(w)
    if "oyster" in ql:
        out.append("oysters")
    if "pool" in ql and "water" in ql:
        out.append("pool of water")
    if "water" in ql:
        out.append("pool of water")
    return list(dict.fromkeys([p for p in out if p]))


def _dedupe_chunks_keep_order(chunks: List[Chunk]) -> List[Chunk]:
    seen: set = set()
    out: List[Chunk] = []
    for c in chunks:
        key = (c.source, c.suttaid, (c.kind or "").lower(), c.text[:120])
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out


def _inject_pair_both_ways(top: List[Chunk], pool: List[Chunk], cap: int = 14) -> List[Chunk]:
    """For each suttaid present, pull in missing sutta or commentary chunk from pool when available."""
    merged = _dedupe_chunks_keep_order(list(top))
    for _ in range(2):
        sids = {c.suttaid for c in merged if c.suttaid}
        have = {(c.suttaid, (c.kind or "").lower()) for c in merged if c.suttaid}
        for sid in sids:
            for kind_need in ("commentary", "sutta"):
                if (sid, kind_need) in have:
                    continue
                for c in pool:
                    if c.suttaid == sid and (c.kind or "").lower() == kind_need:
                        merged.append(c)
                        break
        merged = _dedupe_chunks_keep_order(merged)
    return merged[:cap]


def _lexical_score(query: str, chunk_text: str) -> int:
    q = (query or "").strip().lower()
    if not q or not chunk_text:
        return 0
    text = str(chunk_text).lower()
    score = 0
    if len(q) <= 60 and q in text:
        score += 100
    tokens = _tokenize_query(q)
    if tokens:
        matched = sum(1 for t in tokens if t in text)
        ratio = matched / len(tokens)
        if ratio >= 0.6:
            score += int(ratio * 20)
    return score


def _retrieve(embed_model: Any, collection: Any, query: str, k: int) -> List[Chunk]:
    q_emb = embed_model.encode([query])[0].tolist()
    n_candidates = min(max(k * 10, 50), 200)
    results: Dict[str, Any] = collection.query(
        query_embeddings=[q_emb],
        n_results=n_candidates,
        include=["documents", "metadatas", "distances"],
    )
    docs = results.get("documents", [[]])[0]
    metas = results.get("metadatas", [[]])[0]
    dists = results.get("distances", [[]])[0]

    out: List[Chunk] = []
    for doc, meta, dist in zip(docs, metas, dists):
        out.append(_chunk_from_doc(doc, meta, float(dist) if dist is not None else None))

    phrase = (query or "").strip().lower()
    terms = []
    if phrase and len(phrase) <= 60 and len(phrase.split()) >= 2:
        terms.append(phrase)
    terms.extend(_tokenize_query(query))
    terms = list(dict.fromkeys([t for t in terms if t]))
    boost = _retrieval_boost_phrases(query)
    merged_terms = list(dict.fromkeys([*boost, *terms]))[:10]

    seen_keys = set((c.source, c.suttaid, c.text[:200]) for c in out)
    for t in merged_terms:
        try:
            got = collection.get(
                where_document={"$contains": t},
                include=["documents", "metadatas"],
                limit=min(200, max(50, k * 20)),
            )
        except Exception:
            continue
        k_docs = (got or {}).get("documents", []) or []
        k_metas = (got or {}).get("metadatas", []) or []
        for doc, meta in zip(k_docs, k_metas):
            ch = _chunk_from_doc(doc, meta, None)
            key = (ch.source, ch.suttaid, ch.text[:200])
            if key in seen_keys:
                continue
            seen_keys.add(key)
            out.append(ch)

    out.sort(
        key=lambda c: (
            -_lexical_score(query, c.text),
            c.distance if c.distance is not None else 1e9,
        )
    )
    candidates = out[:max(k * 4, 20)]

    if len(candidates) > k:
        try:
            reranker = _get_reranker()
            pairs = [[query, c.text] for c in candidates]
            scores = reranker.predict(pairs)
            scored = sorted(zip(candidates, scores), key=lambda x: -x[1])
            candidates = [c for c, _ in scored]
        except Exception:
            pass

    top = _inject_pair_both_ways(candidates[:k], out, cap=14)

    has_commentary = any((c.kind or "").lower() == "commentary" for c in top)
    if not has_commentary:
        for c in out:
            if (c.kind or "").lower() == "commentary":
                if top:
                    top = top[: max(0, k - 1)] + [c]
                else:
                    top = [c]
                break

    has_sutta = any((c.kind or "").lower() == "sutta" for c in top)
    if not has_sutta:
        for c in out:
            if (c.kind or "").lower() == "sutta":
                if top:
                    top = top[: max(0, k - 1)] + [c]
                else:
                    top = [c]
                break

    return _dedupe_chunks_keep_order(top)[:14]


def _retrieve_merged_local(embed_model: Any, query: str, k: int, *, book: str = "all") -> List[Chunk]:
    """
    Retrieve from local Chroma for the requested book(s), then merge rank + pair-inject.

    Convention in this repo:
      - book=all searches AN2+AN3 only (AN1 is opt-in).
      - book=an1 searches AN1 only.
    """
    want = (book or "all").strip().lower()
    if want not in ("an1", "an2", "an3", "all"):
        want = "all"

    # Decide which books to include
    include: List[str]
    if want == "all":
        include = ["an2", "an3"]
    else:
        include = [want]

    # Split k roughly equally across included books
    n = max(1, len(include))
    base, rem = divmod(max(1, int(k)), n)
    k_by: Dict[str, int] = {b: base for b in include}
    for i in range(rem):
        k_by[include[i]] += 1

    out1: List[Chunk] = []
    out2: List[Chunk] = []
    out3: List[Chunk] = []
    if "an1" in include and PERSIST_DIR.exists():
        try:
            col1 = _get_collection("an1")
            out1 = [
                c.model_copy(update={"book": "an1"})
                for c in _retrieve(embed_model, col1, query, k_by.get("an1", 1))
            ]
        except Exception:
            pass
    if "an2" in include and PERSIST_AN2_DIR.exists():
        try:
            col2 = _get_collection("an2")
            out2 = [
                c.model_copy(update={"book": "an2"})
                for c in _retrieve(embed_model, col2, query, k_by.get("an2", 1))
            ]
        except Exception:
            pass
    if "an3" in include and PERSIST_AN3_DIR.exists():
        try:
            col3 = _get_collection("an3")
            out3 = [
                c.model_copy(update={"book": "an3"})
                for c in _retrieve(embed_model, col3, query, k_by.get("an3", 1))
            ]
        except Exception:
            pass
    merged = _dedupe_chunks_keep_order(out1 + out2 + out3)
    merged.sort(
        key=lambda c: (
            -_lexical_score(query, c.text),
            c.distance if c.distance is not None else 1e9,
        )
    )
    pool = merged
    seeded = _vertex_quota_pick(merged[: max(k * 4, 20)], k)
    top = _inject_pair_both_ways(seeded, pool, cap=14)
    return _dedupe_chunks_keep_order(top)[:14]


def _vertex_bundle_row_meta(row: Dict[str, Any]) -> Dict[str, str]:
    book = str(row.get("book") or "").strip().lower()
    if book not in ("an1", "an2", "an3"):
        src = str(row.get("source") or "")
        sl = src.lower()
        if "an3" in sl:
            book = "an3"
        elif "an2" in sl:
            book = "an2"
        else:
            book = "an1"
    return {
        "source": str(row.get("source") or ""),
        "suttaid": str(row.get("suttaid") or ""),
        "commentary_id": str(row.get("commentary_id") or ""),
        "kind": str(row.get("kind") or ""),
        "book": book,
    }


def _vertex_quota_pick(sorted_chunks: List[Chunk], k: int) -> List[Chunk]:
    """Roughly equal picks per book (an1/an2/an3), in global score order, then fill to k."""
    if k <= 0 or not sorted_chunks:
        return []
    books_present = sorted(
        {((c.book or "an1").lower()) for c in sorted_chunks if (c.book or "an1").lower() in ("an1", "an2", "an3")}
    )
    books_present = [b for b in books_present if b in ("an1", "an2", "an3")]
    if not books_present:
        books_present = ["an1"]
    n = len(books_present)
    base, rem = divmod(k, n)
    quota: Dict[str, int] = {b: base for b in books_present}
    for i in range(rem):
        quota[books_present[i]] += 1

    def _key(c: Chunk) -> Tuple[str, str, str, str, str]:
        return (
            c.source,
            c.suttaid,
            (c.kind or "").lower(),
            (c.book or "an1").lower(),
            c.text[:180],
        )

    picked: List[Chunk] = []
    seen: set = set()
    for c in sorted_chunks:
        if len(picked) >= k:
            break
        b = (c.book or "an1").lower()
        if b not in quota:
            b = books_present[0]
        ky = _key(c)
        if ky in seen:
            continue
        if quota.get(b, 0) <= 0:
            continue
        picked.append(c)
        seen.add(ky)
        quota[b] -= 1
    if len(picked) < k:
        for c in sorted_chunks:
            if len(picked) >= k:
                break
            ky = _key(c)
            if ky in seen:
                continue
            picked.append(c)
            seen.add(ky)
    return picked[:k]


def _retrieve_vertex(bundle: Dict[str, Any], query: str, k: int, *, book: str = "all") -> List[Chunk]:
    """Same ranking heuristics as _retrieve, but vector search + lexical scan over a Vertex bundle (no Chroma)."""
    want = (book or "all").strip().lower()
    if want not in ("an1", "an2", "an3", "all"):
        want = "all"
    include = ["an2", "an3"] if want == "all" else [want]

    rows_all = vx.bundle_chunk_rows(bundle)
    if not rows_all:
        return []

    # Filter by requested books. Convention: missing/unknown book counts as an1.
    rows: List[Dict[str, Any]] = []
    for r in rows_all:
        if not isinstance(r, dict):
            continue
        bk = str(r.get("book") or "").strip().lower()
        if bk not in ("an1", "an2", "an3"):
            bk = "an1"
        if bk in include:
            rows.append(r)
    if not rows:
        return []

    q_emb = vx.embed_texts_vertex([query])[0]
    out: List[Chunk] = []
    for row in rows:
        emb = row.get("embedding")
        if not isinstance(emb, list) or not emb:
            continue
        try:
            emb_f = [float(x) for x in emb]
        except (TypeError, ValueError):
            continue
        dist = vx.cosine_distance(q_emb, emb_f)
        out.append(
            _chunk_from_doc(
                str(row.get("text") or ""),
                _vertex_bundle_row_meta(row),
                float(dist),
            )
        )

    phrase = (query or "").strip().lower()
    terms = []
    if phrase and len(phrase) <= 60 and len(phrase.split()) >= 2:
        terms.append(phrase)
    terms.extend(_tokenize_query(query))
    terms = list(dict.fromkeys([t for t in terms if t]))
    boost = _retrieval_boost_phrases(query)
    merged_terms = list(dict.fromkeys([*boost, *terms]))[:10]

    seen_keys = set((c.source, c.suttaid, c.book, c.text[:200]) for c in out)
    for t in merged_terms:
        tl = t.lower()
        for row in rows:
            doc = str(row.get("text") or "")
            if tl not in doc.lower():
                continue
            ch = _chunk_from_doc(doc, _vertex_bundle_row_meta(row), None)
            key = (ch.source, ch.suttaid, ch.book, ch.text[:200])
            if key in seen_keys:
                continue
            seen_keys.add(key)
            out.append(ch)

    out.sort(
        key=lambda c: (
            -_lexical_score(query, c.text),
            c.distance if c.distance is not None else 1e9,
        )
    )
    candidates = out[: max(k * 4, 20)]

    seeded = _vertex_quota_pick(candidates, k)
    top = _inject_pair_both_ways(seeded, out, cap=14)

    has_commentary = any((c.kind or "").lower() == "commentary" for c in top)
    if not has_commentary:
        for c in out:
            if (c.kind or "").lower() == "commentary":
                if top:
                    top = top[: max(0, k - 1)] + [c]
                else:
                    top = [c]
                break

    has_sutta = any((c.kind or "").lower() == "sutta" for c in top)
    if not has_sutta:
        for c in out:
            if (c.kind or "").lower() == "sutta":
                if top:
                    top = top[: max(0, k - 1)] + [c]
                else:
                    top = [c]
                break

    return _dedupe_chunks_keep_order(top)[:14]


def _ollama_chat(messages: list, temperature: float = 0, num_ctx: int = 4096, timeout: int = 600) -> str:
    resp = _HTTP.post(
        f"{OLLAMA_BASE_URL}/api/chat",
        json={
            "model": OLLAMA_MODEL,
            "messages": messages,
            "stream": False,
            "options": {"temperature": temperature, "num_ctx": num_ctx},
        },
        timeout=timeout,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Ollama returned {resp.status_code}: {resp.text[:500]}")
    return resp.json().get("message", {}).get("content", "")


def _openrouter_api_key() -> str:
    return (
        os.environ.get("OPENROUTER_API_KEY", "").strip()
        or os.environ.get("DAMA_OPENROUTER_API_KEY", "").strip()
    )


def _openrouter_model() -> str:
    return os.environ.get("OPENROUTER_MODEL", "").strip() or "openai/gpt-4o-mini"


def _openrouter_llm_enabled() -> bool:
    v = os.environ.get("DAMA_LLM", "").strip().lower()
    if v not in ("openrouter", "or"):
        return False
    return bool(_openrouter_api_key())


def _openrouter_chat(messages: list, temperature: float = 0.2, timeout: int = 300) -> str:
    key = _openrouter_api_key()
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY (or DAMA_OPENROUTER_API_KEY) is required when DAMA_LLM=openrouter")
    url = f"{OPENROUTER_API_BASE}/chat/completions"
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    referer = os.environ.get("OPENROUTER_HTTP_REFERER", "").strip()
    if referer:
        headers["HTTP-Referer"] = referer
    title = os.environ.get("OPENROUTER_APP_NAME", "dama5").strip()
    if title:
        headers["X-Title"] = title
    resp = _HTTP.post(
        url,
        headers=headers,
        json={
            "model": _openrouter_model(),
            "messages": messages,
            "temperature": temperature,
        },
        timeout=timeout,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"OpenRouter returned {resp.status_code}: {resp.text[:800]}")
    data = resp.json()
    choice = (data.get("choices") or [{}])[0]
    msg = choice.get("message") or {}
    return (msg.get("content") or "").strip()


def _sanitize_chat_answer_light(text: str) -> str:
    """Remove legacy 'Excerpt N' echoes; keep (AN …) and (cAN …) intact."""
    if not (text or "").strip():
        return text or ""
    s = re.sub(r"\b[Ee]xcerpt\s*\d+\b", "", text)
    return re.sub(r"\n{3,}", "\n\n", s).strip()


def _chunks_for_llm_paired_by_suttaid(
    chunks: List[Chunk], max_n: int = 10, *, include_chain: bool = False
) -> List[Chunk]:
    """
    Walk suttaids in retrieval order; for each id emit sutta chunk(s) then commentary chunk(s)
    so the model sees (AN …) text before (cAN …) for the same suttaid.
    """
    chunks = _dedupe_chunks_keep_order(chunks)
    if not chunks:
        return []
    by_sid: Dict[str, List[Chunk]] = {}
    order: List[str] = []
    for c in chunks:
        sid = (c.suttaid or "").strip()
        if not sid:
            continue
        if sid not in by_sid:
            by_sid[sid] = []
            order.append(sid)
        by_sid[sid].append(c)

    out: List[Chunk] = []
    for sid in order:
        grp = by_sid[sid]
        comm = [x for x in grp if (x.kind or "").lower() == "commentary"]
        sut = [x for x in grp if (x.kind or "").lower() == "sutta"]
        chn = [x for x in grp if (x.kind or "").lower() == "chain"]
        seq = sut[:1] + comm[:2]
        if include_chain and chn:
            seq = seq + chn[:1]
        for x in seq:
            if len(out) >= max_n:
                return out
            out.append(x)

    seen = {(x.source, x.suttaid, (x.kind or "").lower(), x.text[:80]) for x in out}
    for c in chunks:
        key = (c.source, c.suttaid, (c.kind or "").lower(), c.text[:80])
        if key in seen or len(out) >= max_n:
            continue
        seen.add(key)
        out.append(c)
    return out[:max_n]


def _format_llm_passage(idx: int, c: Chunk) -> str:
    kind = (c.kind or "").lower()
    if kind == "sutta":
        hint = (
            "CITE_RULE: (AN …) must reflect this SUTTA text; paraphrase in chat, optional ≤25-word quote only if needed. "
            "This block has no TEACHER COMMENTARY — do not call commentary ideas a 'sutta quote'.\n"
        )
    elif kind == "commentary":
        hint = (
            "CITE_RULE: (cAN …) must reflect this TEACHER COMMENTARY; paraphrase in chat, optional ≤25-word quote only if needed. "
            "Do not attribute this wording to 'the sutta' or (AN …).\n"
        )
    elif kind == "chain":
        hint = (
            "CITE_RULE: kind 'chain' is a short list of conceptual links (not Buddha-worded scripture). "
            "Do not put CHAIN lines inside quotation marks as if they were sutta text. "
            "You may summarize the pairing in your own words and still cite (AN …) only for actual sutta content.\n"
        )
    else:
        hint = "CITE_RULE: Match (AN …)/(cAN …) to the correct SUTTA vs TEACHER COMMENTARY section.\n"
    bk = (getattr(c, "book", None) or "").strip()
    book_part = (f"book: {bk} | ") if bk else ""
    return (
        f"[{idx} | {book_part}suttaid: {c.suttaid or '-'} | commentary_id: {c.commentary_id or '-'} | kind: {c.kind or '-'}]\n"
        f"{hint}"
        f"{c.text}"
    )


def _llm_system_and_user_blocks(
    query: str,
    balanced: List[Chunk],
    *,
    book: str = "an1",
    allowed_an: Optional[Set[str]] = None,
    allowed_can: Optional[Set[str]] = None,
    extra_user_instructions: str = "",
) -> Tuple[str, str]:
    numbered = "\n\n".join(_format_llm_passage(i + 1, c) for i, c in enumerate(balanced))
    if _norm_book(book) == "an2":
        system = (
            "You are a friendly, conversational assistant answering from AN2 (Numerical Discourses, book of twos) "
            "sutta text, teacher commentary, and optional CHAIN passages below.\n"
            "- kind 'commentary' = teacher notes (after TEACHER COMMENTARY:). Cite with (cAN …) using commentary_id.\n"
            "- kind 'sutta' = sutta text (after SUTTA:). Cite with (AN …) using suttaid from the header.\n"
            "- kind 'chain' = a short enumerated list of the two linked themes for that discourse (study aid). "
            "It is NOT verbatim scripture — do not quote CHAIN lines as the Buddha’s words.\n\n"
            "DISPLAY: The chat must stay short. Do NOT paste long sutta or commentary blocks — the app has "
            "clickable (AN …)/(cAN …) citations and a Reference panel with full text. Paraphrase clearly in a few "
            "sentences; optional at most one short phrase in quotation marks per cited id (roughly ≤25 words) only "
            "if essential; otherwise no block quotes.\n\n"
            "STRICT RULES:\n"
            "1. Prefer staying within ONE suttaid: sutta, commentary, and chain for the same id when present.\n"
            "2. Ground every (AN …) in the sutta passage for that id and every (cAN …) in the teacher commentary "
            "for that id, but explain in your own words; do not reproduce full discourses in the answer.\n"
            "3. Never put (cAN …) on sutta-only ideas or (AN …) on commentary-only ideas.\n"
            "4. You may describe the CHAIN (the two linked ideas) in plain language without pretending it is a sutta citation.\n"
            "5. If nothing in PASSAGES answers the question, say: "
            "\"The provided excerpts do not contain information to answer this question.\"\n"
            "6. Do NOT guess or use outside knowledge."
        )
        allow = ""
        if allowed_an or allowed_can:
            allow = "\n\nALLOWED CITATIONS (strict):\n"
            if allowed_an:
                allow += " - AN: " + ", ".join(sorted(allowed_an)) + "\n"
            if allowed_can:
                allow += " - cAN: " + ", ".join(sorted(allowed_can)) + "\n"
            allow += "Only cite IDs from this list. If an ID is not listed, you must not cite it.\n"
        extra = ("\n\n" + extra_user_instructions.strip()) if (extra_user_instructions or "").strip() else ""
        user = (
            f"Question: {query}\n\nPASSAGES (suttaid order; headers for you only):\n{numbered}\n\n"
            "Answer concisely with (AN …)/(cAN …) citations; use CHAIN only as conceptual context, not as quoted scripture."
            f"{allow}{extra}"
        )
        return system, user

    system = (
        "You are a friendly, conversational assistant answering from AN1 sutta and teacher commentary "
        "passages below.\n"
        "- kind 'commentary' = teacher notes (text after TEACHER COMMENTARY:). Cite with (cAN …) using "
        "commentary_id from that passage’s header.\n"
        "- kind 'sutta' = sutta text (after SUTTA:). Cite with (AN …) using suttaid from that passage’s header.\n"
        "- kind 'chain' = a short enumerated pair of linked themes for that discourse (study aid). "
        "It is NOT verbatim scripture — do not quote CHAIN lines as the Buddha’s words.\n\n"
        "DISPLAY: The chat must stay short. Do NOT paste long sutta or commentary blocks — the app has "
        "clickable (AN …)/(cAN …) citations and a Reference panel with full text. Paraphrase the teaching in "
        "a few clear sentences; optional at most one short phrase in quotation marks per cited id "
        "(roughly ≤25 words) only if essential; otherwise no block quotes.\n\n"
        "STRICT RULES:\n"
        "1. PASSAGES are grouped by suttaid: sutta for that id appears before teacher commentary for the "
        "same id. Prefer sutta, teacher notes, and chain from the SAME suttaid in one answer. Do NOT pair "
        "(AN 1.2) with (cAN 1.5.6) unless you write one clear sentence explaining why two discourses are "
        "needed; otherwise stay within one suttaid pair.\n"
        "2. For your main example, explain the sutta point in your own words and add (AN …); then summarize "
        "the teacher’s angle and add (cAN …) when commentary is in PASSAGES — both grounded in that suttaid.\n"
        "3. Never put (cAN …) on sutta-only ideas or (AN …) on commentary-only ideas.\n"
        "4. You may describe the CHAIN (the two linked ideas) in plain language without pretending it is a sutta citation.\n"
        "5. If you use quotation marks before (AN …), the quoted words must appear verbatim under SUTTA: in a "
        "kind 'sutta' block for that id (keep the quote very short). If you use quotation marks before (cAN …), "
        "they must be verbatim from TEACHER COMMENTARY: in a kind 'commentary' block. Never call teacher wording "
        "the sutta or tag it (AN …).\n"
        "6. If PASSAGES include a sutta about water, pools, oysters, etc., do not claim excerpts omit water.\n"
        "7. If only commentary or only sutta appears for the relevant suttaid, say what is missing briefly.\n"
        "8. Do not write 'Excerpt' / internal passage numbers from headers.\n"
        "9. If the question uses 'this' / 'it' without a clear topic, ask ONE short clarifying question.\n"
        "10. If nothing in PASSAGES answers the question, say: "
        "\"The provided excerpts do not contain information to answer this question.\"\n"
        "11. Do NOT guess or use outside knowledge."
    )
    allow = ""
    if allowed_an or allowed_can:
        allow = "\n\nALLOWED CITATIONS (strict):\n"
        if allowed_an:
            allow += " - AN: " + ", ".join(sorted(allowed_an)) + "\n"
        if allowed_can:
            allow += " - cAN: " + ", ".join(sorted(allowed_can)) + "\n"
        allow += "Only cite IDs from this list. If an ID is not listed, you must not cite it.\n"
    extra = ("\n\n" + extra_user_instructions.strip()) if (extra_user_instructions or "").strip() else ""
    user = (
        f"Question: {query}\n\nPASSAGES (grouped by suttaid: sutta for an id, then teacher notes for that id; "
        f"headers for you only — do not echo them):\n{numbered}\n\n"
        "Answer concisely with (AN …)/(cAN …) citations; use CHAIN only as conceptual context, not as quoted scripture; "
        "avoid unrelated cross-citations; never call teacher notes the sutta."
        f"{allow}{extra}"
    )
    return system, user


def _llm_vertex_mixed_blocks(
    query: str,
    balanced: List[Chunk],
    *,
    allowed_an: Optional[Set[str]] = None,
    allowed_can: Optional[Set[str]] = None,
    extra_user_instructions: str = "",
) -> Tuple[str, str]:
    numbered = "\n\n".join(_format_llm_passage(i + 1, c) for i, c in enumerate(balanced))
    system = (
        "You are a friendly, conversational assistant answering from AN1 and/or AN2 (Anguttara Nikāya) "
        "passages below. Each block header may include book: an1 or an2.\n"
        "- kind 'sutta' / 'commentary': cite with (AN …) and (cAN …); ground each citation in the matching passage.\n"
        "- kind 'chain': conceptual link labels (study aid), not scripture; never quote CHAIN lines as the Buddha’s words.\n\n"
        "DISPLAY: Keep the chat answer short. Do NOT paste long sutta or commentary blocks — citations open full "
        "text in the Reference panel. Paraphrase; optional at most one short quoted phrase per cited id "
        "(roughly ≤25 words) only if essential.\n\n"
        "STRICT RULES:\n"
        "1. Prefer one suttaid (and one book) for your main example when possible.\n"
        "2. Never put (cAN …) on sutta-only ideas or (AN …) on commentary-only ideas.\n"
        "3. If nothing in PASSAGES answers the question, say: "
        "\"The provided excerpts do not contain information to answer this question.\"\n"
        "4. Do NOT guess or use outside knowledge."
    )
    allow = ""
    if allowed_an or allowed_can:
        allow = "\n\nALLOWED CITATIONS (strict):\n"
        if allowed_an:
            allow += " - AN: " + ", ".join(sorted(allowed_an)) + "\n"
        if allowed_can:
            allow += " - cAN: " + ", ".join(sorted(allowed_can)) + "\n"
        allow += "Only cite IDs from this list. If an ID is not listed, you must not cite it.\n"
    extra = ("\n\n" + extra_user_instructions.strip()) if (extra_user_instructions or "").strip() else ""
    user = (
        f"Question: {query}\n\nPASSAGES (headers for you only):\n{numbered}\n\n"
        "Answer concisely with correct (AN …)/(cAN …) citations; use CHAIN only as non-quoted context when present."
        f"{allow}{extra}"
    )
    return system, user


def _call_llm_vertex(
    query: str,
    chunks: List[Chunk],
    *,
    allowed_an: Optional[Set[str]] = None,
    allowed_can: Optional[Set[str]] = None,
    extra_user_instructions: str = "",
) -> str:
    balanced = _chunks_for_llm_paired_by_suttaid(chunks, max_n=10, include_chain=False)
    if not balanced:
        return "No passages were retrieved for this question. Try Rebuild or rephrase."
    has_an2 = any((c.book or "").lower() == "an2" for c in balanced)
    if has_an2:
        system, user = _llm_vertex_mixed_blocks(
            query, balanced, allowed_an=allowed_an, allowed_can=allowed_can, extra_user_instructions=extra_user_instructions
        )
    else:
        system, user = _llm_system_and_user_blocks(
            query,
            balanced,
            book="an1",
            allowed_an=allowed_an,
            allowed_can=allowed_can,
            extra_user_instructions=extra_user_instructions,
        )
    return _sanitize_chat_answer_light(vx.gemini_generate(system, user, temperature=0.2))


def _vertex_llm_enabled() -> bool:
    v = os.environ.get("DAMA_LLM", "").strip().lower()
    if v in ("vertex", "gemini", "gcp"):
        return True
    v = os.environ.get("DAMA_USE_VERTEX_LLM", "").strip().lower()
    return v in ("1", "true", "yes", "on")


def _call_llm(
    query: str,
    chunks: List[Chunk],
    *,
    book: str = "an1",
    allowed_an: Optional[Set[str]] = None,
    allowed_can: Optional[Set[str]] = None,
    extra_user_instructions: str = "",
) -> str:
    if _openrouter_llm_enabled():
        balanced = _chunks_for_llm_paired_by_suttaid(chunks, max_n=10, include_chain=False)
        if not balanced:
            return "No passages were retrieved for this question. Try Rebuild or rephrase."
        has_an2 = any((c.book or "").lower() == "an2" for c in balanced)
        if has_an2:
            system, user = _llm_vertex_mixed_blocks(
                query, balanced, allowed_an=allowed_an, allowed_can=allowed_can, extra_user_instructions=extra_user_instructions
            )
        else:
            b = _norm_book(book)
            system, user = _llm_system_and_user_blocks(
                query,
                balanced,
                book=b if b == "an2" else "an1",
                allowed_an=allowed_an,
                allowed_can=allowed_can,
                extra_user_instructions=extra_user_instructions,
            )
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        return _sanitize_chat_answer_light(_openrouter_chat(messages, temperature=0.2, timeout=300))

    if vx.an1_vertex_enabled() or _vertex_llm_enabled():
        return _call_llm_vertex(
            query,
            chunks,
            allowed_an=allowed_an,
            allowed_can=allowed_can,
            extra_user_instructions=extra_user_instructions,
        )

    balanced = _chunks_for_llm_paired_by_suttaid(chunks, max_n=10, include_chain=False)
    if not balanced:
        return "No passages were retrieved for this question. Try Rebuild or rephrase."
    has_an2 = any((c.book or "").lower() == "an2" for c in balanced)
    if has_an2:
        system, user = _llm_vertex_mixed_blocks(
            query, balanced, allowed_an=allowed_an, allowed_can=allowed_can, extra_user_instructions=extra_user_instructions
        )
    else:
        b = _norm_book(book)
        system, user = _llm_system_and_user_blocks(
            query,
            balanced,
            book=b if b == "an2" else "an1",
            allowed_an=allowed_an,
            allowed_can=allowed_can,
            extra_user_instructions=extra_user_instructions,
        )
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    return _sanitize_chat_answer_light(_ollama_chat(messages, num_ctx=8192, timeout=300))


def _merged_item_details() -> List[ItemDetail]:
    seen: Set[str] = set()
    out: List[ItemDetail] = []
    for it in _load_items("an1"):
        out.append(it)
        seen.add(it.suttaid)
    for it in _load_items("an2"):
        if it.suttaid not in seen:
            out.append(it)
            seen.add(it.suttaid)
    for it in _load_items("an3"):
        if it.suttaid not in seen:
            out.append(it)
            seen.add(it.suttaid)
    return out


def _find_item_by_suttaid(suttaid: str) -> Optional[ItemDetail]:
    want = _normalize_suttaid_an1(suttaid)
    if not want:
        return None
    for it in _load_items("an1"):
        if _normalize_suttaid_an1(it.suttaid) == want:
            return it
    for it in _load_items("an2"):
        if _normalize_suttaid_an2(it.suttaid) == _normalize_suttaid_an2(want):
            return it
    for it in _load_items("an3"):
        if _normalize_suttaid_an2(it.suttaid) == _normalize_suttaid_an2(want):
            return it
    return None


def _find_item_by_commentary_id(commentary_id: str) -> Optional[ItemDetail]:
    want = _normalize_commentary_id(commentary_id)
    if not want:
        return None
    for it in _load_items("an1"):
        if _normalize_commentary_id(it.commentary_id) == want:
            return it
    for it in _load_items("an2"):
        if _normalize_commentary_id(it.commentary_id) == want:
            return it
    for it in _load_items("an3"):
        if _normalize_commentary_id(it.commentary_id) == want:
            return it
    return None


def _invalidate_items_cache(book: Optional[str] = None) -> None:
    global _items_cache
    if book is None:
        _items_cache.clear()
    else:
        _items_cache.pop(_norm_book(book), None)


def _invalidate_collection_cache(book: Optional[str] = None) -> None:
    if book is None:
        _collection_cache.clear()
        _chroma_client_cache.clear()
        return
    b = _norm_book(book)
    _collection_cache.pop(b, None)


def _load_items(book: str = "an1") -> List[ItemDetail]:
    global _items_cache
    b = _norm_book(book)
    if b in _items_cache:
        return _items_cache[b]

    if b == "an2":
        path = AN2_PATH
    elif b == "an3":
        path = AN3_PATH
    else:
        path = AN1_PATH
    if not path.exists():
        _dbg("H1", "an1_app.py:_load_items", "JSON missing", {"book": b, "path": str(path)})
        _items_cache[b] = []
        return _items_cache[b]

    raw = path.read_text(encoding="utf-8", errors="ignore")
    try:
        data = _parse_json_lenient(raw)
    except Exception as e:
        _dbg(
            "H1",
            "an1_app.py:_load_items",
            "JSON parse failed",
            {"book": b, "error": str(e), "bytes": len(raw), "prefix": raw[:200]},
        )
        try:
            data = _extract_records_fallback(raw)
            _dbg("H1", "an1_app.py:_load_items", "Fallback extracted records", {"count": len(data)})
        except Exception as e2:
            _dbg("H1", "an1_app.py:_load_items", "Fallback parse failed", {"error": str(e2)})
            _items_cache[b] = []
            return _items_cache[b]

    items: List[ItemDetail] = []
    if isinstance(data, list):
        for obj in data:
            if not isinstance(obj, dict):
                continue
            if b in ("an2", "an3"):
                sid = _normalize_suttaid_an2(obj.get("sutta_id") or obj.get("suttaid"))
                sutta = str(obj.get("sutta") or "").strip()
                comm = _commentary_body(obj)
                # Prefer explicit commentary_id (e.g. "cAN 2.1.2") if present in JSON; else derive from sutta id.
                cid = _normalize_commentary_id(obj.get("commentary_id") or "") if sid else ""
                if not cid and sid:
                    cid = _normalize_commentary_id("c" + sid)
                sc_id = str(obj.get("sc_id") or "").strip()
                sc_url = str(obj.get("sc_url") or "").strip()
                sc_sutta = str(obj.get("sc_sutta") or "").strip()
                aud_file = str(obj.get("aud_file") or "").strip()
                try:
                    aud_start_s = float(obj.get("aud_start_s") or 0.0)
                except Exception:
                    aud_start_s = 0.0
                try:
                    aud_end_s = float(obj.get("aud_end_s") or 0.0)
                except Exception:
                    aud_end_s = 0.0
                ch = obj.get("chain")
                chain_dict = ch if isinstance(ch, dict) else None
                if not sid or not sutta:
                    continue
                items.append(
                    ItemDetail(
                        suttaid=sid,
                        sutta=sutta,
                        commentry=comm,
                        commentary_id=cid,
                        sc_id=sc_id,
                        sc_url=sc_url,
                        sc_sutta=sc_sutta,
                        aud_file=aud_file,
                        aud_start_s=aud_start_s,
                        aud_end_s=aud_end_s,
                        chain=chain_dict,
                    )
                )
            else:
                sid = _normalize_suttaid_an1(obj.get("suttaid"))
                sutta = str(obj.get("sutta") or "").strip()
                comm = _commentary_body(obj)
                cid = _normalize_commentary_id(obj.get("commentary_id") or "")
                if not cid and sid:
                    cid = _normalize_commentary_id("c" + sid)
                sc_id = str(obj.get("sc_id") or "").strip()
                sc_url = str(obj.get("sc_url") or "").strip()
                sc_sutta = str(obj.get("sc_sutta") or "").strip()
                aud_file = str(obj.get("aud_file") or "").strip()
                try:
                    aud_start_s = float(obj.get("aud_start_s") or 0.0)
                except Exception:
                    aud_start_s = 0.0
                try:
                    aud_end_s = float(obj.get("aud_end_s") or 0.0)
                except Exception:
                    aud_end_s = 0.0
                ch = obj.get("chain")
                chain_dict = ch if isinstance(ch, dict) else None
                if not sid or not sutta:
                    continue
                items.append(
                    ItemDetail(
                        suttaid=sid,
                        sutta=sutta,
                        commentry=comm,
                        commentary_id=cid,
                        sc_id=sc_id,
                        sc_url=sc_url,
                        sc_sutta=sc_sutta,
                        aud_file=aud_file,
                        aud_start_s=aud_start_s,
                        aud_end_s=aud_end_s,
                        chain=chain_dict,
                    )
                )
    else:
        _dbg("H1", "an1_app.py:_load_items", "Unexpected JSON top-level type", {"type": str(type(data))})

    _items_cache[b] = items
    _dbg("H1", "an1_app.py:_load_items", "Loaded items", {"book": b, "count": len(items)})
    return items


def _item_title(item: ItemDetail) -> str:
    # lightweight label for the left nav
    s = (item.sutta or "").strip().replace("\n", " ")
    s = re.sub(r"\s+", " ", s)
    return s[:72] + ("…" if len(s) > 72 else "")


@asynccontextmanager
async def _lifespan(app: FastAPI):
    if vx.an1_vertex_enabled():
        try:
            vx.ensure_bundle_loaded(PERSIST_DIR)
        except Exception as e:
            _dbg("H2", "an1_app.py:lifespan", "Vertex bundle preload failed (will retry on request)", {"error": str(e)})
    yield


app = FastAPI(title="Dama AN1 & AN2 RAG", lifespan=_lifespan)

# Sessions are required for DIY login cookies; always mounted so auth routes work even if env loads oddly across workers.
from starlette.middleware.sessions import SessionMiddleware

app.add_middleware(
    SessionMiddleware,
    secret_key=session_secret(),
    session_cookie="dama_session",
    max_age=14 * 24 * 3600,
    same_site="lax",
    https_only=session_https_only(),
)

# Optional CORS: mob app on another origin (e.g. Cloud Run static) calling /api — set DAMA_CORS_ORIGINS=origin1,origin2
_cors_origins = [o.strip() for o in os.environ.get("DAMA_CORS_ORIGINS", "").split(",") if o.strip()]
if _cors_origins:
    from starlette.middleware.cors import CORSMiddleware

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

register_auth_ui_routes(app, BASE_DIR)

# Serve audio assets under /aud/ (real teacher recordings + audio_map.json)
AUD_DIR = (BASE_DIR / "aud").resolve()
if AUD_DIR.is_dir():
    app.mount("/aud", StaticFiles(directory=str(AUD_DIR)), name="aud")

# Serve UI static assets (modularized JS/CSS)
STATIC_DIR = (BASE_DIR / "static").resolve()
if STATIC_DIR.is_dir():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


def _audio_gcs_bucket() -> str:
    return os.environ.get("DAMA_AUDIO_GCS_BUCKET", "").strip() or ""


def _audio_gcs_prefix() -> str:
    # Default to "aud/" so blob path is aud/<filename>.mp3
    p = os.environ.get("DAMA_AUDIO_GCS_PREFIX", "").strip() or "aud/"
    p = p.lstrip("/")
    if p and not p.endswith("/"):
        p += "/"
    return p


def _audio_signed_url_ttl_seconds() -> int:
    try:
        return int(os.environ.get("DAMA_AUDIO_URL_TTL_SECONDS", "").strip() or "900")
    except ValueError:
        return 900


def _safe_audio_filename(name: str) -> str:
    s = (name or "").strip().replace("\\", "/")
    while s.startswith("/"):
        s = s[1:]
    if not s or ".." in s or s.startswith("."):
        raise HTTPException(status_code=400, detail="invalid audio filename")
    if "/" in s:
        # Keep it simple: audio_map.json stores a flat filename; disallow subpaths.
        raise HTTPException(status_code=400, detail="audio filename must not contain '/'")
    return s


def _sid_to_sc_slug(sid: str) -> str:
    """Map local 'AN 2.1.2' style ids to SuttaCentral slugs."""
    s = (sid or "").strip().lower().replace(" ", "")
    if not s:
        return ""
    # Keep parity with chat_embed.html mapping (local subdivisions vs SC ids).
    if s == "an2.1.2":
        return "an2.2"
    return s


class _HTMLTextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self._parts: List[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs):
        if tag in ("script", "style", "noscript"):
            self._skip_depth += 1
        if tag in ("p", "br", "div", "section", "article", "h1", "h2", "h3", "li"):
            self._parts.append("\n")

    def handle_endtag(self, tag: str):
        if tag in ("script", "style", "noscript") and self._skip_depth > 0:
            self._skip_depth -= 1
        if tag in ("p", "div", "section", "article", "li"):
            self._parts.append("\n")

    def handle_data(self, data: str):
        if self._skip_depth > 0:
            return
        t = (data or "").strip()
        if not t:
            return
        self._parts.append(t + " ")

    def text(self) -> str:
        s = "".join(self._parts)
        s = re.sub(r"[ \t]+\n", "\n", s)
        s = re.sub(r"\n{3,}", "\n\n", s)
        s = re.sub(r"[ \t]{2,}", " ", s)
        return s.strip()


def _fetch_suttacentral_plain_text(sc_slug: str) -> str:
    """
    Fetch the SuttaCentral plain Sujato English view and extract readable text.
    This is a best-effort HTML-to-text conversion (no external deps).
    """
    slug = (sc_slug or "").strip().lstrip("/")
    if not slug:
        return ""
    # Normalize to discourse page id only (drop any /en/... that caller may include).
    slug = slug.split("?")[0].strip().strip("/")
    if not slug:
        return ""
    # Cache by slug+query.
    q = "lang=en&layout=plain&reference=none&notes=asterisk&highlight=false&script=latin"
    if "/en/" in slug:
        base = f"https://suttacentral.net/{slug}"
    else:
        base = f"https://suttacentral.net/{slug}/en/sujato"
    url = base + "?" + q
    if url in _SC_TEXT_CACHE:
        return _SC_TEXT_CACHE[url]
    r = _HTTP.get(url, timeout=20)
    if r.status_code != 200:
        return ""
    html = r.text or ""
    parser = _HTMLTextExtractor()
    try:
        parser.feed(html)
        out = parser.text()
    except Exception:
        out = ""
    # Heuristic: cut off everything before the first quote-like marker if present.
    _SC_TEXT_CACHE[url] = out
    return out


def _raw_meta_for_book(book: str) -> Dict[str, Dict[str, Any]]:
    """
    Build a mapping from normalized suttaid to raw JSON fields used by the Reference Links panel.
    Keys are stored as both 'AN 2.1.2' and '2.1.2' (and same for AN3) for resilience.
    """
    b = (book or "").strip().lower()
    if b not in ("an2", "an3"):
        return {}
    if b in _RAW_META_CACHE:
        return _RAW_META_CACHE[b]
    path = AN2_PATH if b == "an2" else AN3_PATH
    if not path.exists():
        _RAW_META_CACHE[b] = {}
        return _RAW_META_CACHE[b]
    raw = path.read_text(encoding="utf-8", errors="ignore")
    try:
        data = _parse_json_lenient(raw)
    except Exception:
        try:
            data = _extract_records_fallback(raw)
        except Exception:
            data = []
    out: Dict[str, Dict[str, Any]] = {}
    if isinstance(data, list):
        for obj in data:
            if not isinstance(obj, dict):
                continue
            sid_raw = str(obj.get("sutta_id") or obj.get("suttaid") or "").strip()
            if not sid_raw:
                continue
            # Normalize to the same display format the UI uses.
            sid_norm = _normalize_suttaid_an2(sid_raw)
            out[sid_norm] = obj
            out[sid_raw] = obj
    _RAW_META_CACHE[b] = out
    return out


def _apply_raw_meta_to_item(it: ItemDetail) -> ItemDetail:
    """Ensure sc_id/sc_url/sc_sutta/audio fields are present on ItemDetail for UI Links panel."""
    sid = str(getattr(it, "suttaid", "") or "").strip()
    if not sid:
        return it
    b = "an3" if ("AN 3." in sid or sid.replace(" ", "").upper().startswith("AN3.")) else "an2" if ("AN 2." in sid or sid.replace(" ", "").upper().startswith("AN2.")) else ""
    if b not in ("an2", "an3"):
        return it
    meta = _raw_meta_for_book(b).get(sid) or _raw_meta_for_book(b).get(sid.replace("AN ", "")) or {}
    if not isinstance(meta, dict):
        return it
    upd: Dict[str, Any] = {}
    # Only fill if missing/empty to avoid overriding other sources.
    if not (it.sc_id or "").strip():
        upd["sc_id"] = str(meta.get("sc_id") or "").strip()
    if not (it.sc_url or "").strip():
        upd["sc_url"] = str(meta.get("sc_url") or "").strip()
    if not (it.sc_sutta or "").strip():
        upd["sc_sutta"] = str(meta.get("sc_sutta") or "").strip()
    if not (it.aud_file or "").strip():
        upd["aud_file"] = str(meta.get("aud_file") or "").strip()
    if float(getattr(it, "aud_start_s", 0.0) or 0.0) == 0.0:
        try:
            upd["aud_start_s"] = float(meta.get("aud_start_s") or 0.0)
        except Exception:
            pass
    if float(getattr(it, "aud_end_s", 0.0) or 0.0) == 0.0:
        try:
            upd["aud_end_s"] = float(meta.get("aud_end_s") or 0.0)
        except Exception:
            pass
    if not upd:
        return it
    return it.model_copy(update=upd)


@app.get("/api/audio_url")
def api_audio_url(
    request: Request,
    file: str = Query(..., min_length=1, description="Audio filename from aud/audio_map.json"),
    authorization: Annotated[Optional[str], Header()] = None,
) -> JSONResponse:
    """
    Return a short-lived signed URL for a private GCS audio object: gs://<bucket>/<prefix><file>.
    Used by the UI so teacher audio works on Cloud Run without bundling MP3s into the image.
    """
    _require_api_user(request, authorization)
    bucket = _audio_gcs_bucket()
    if not bucket:
        raise HTTPException(status_code=400, detail="DAMA_AUDIO_GCS_BUCKET is not set")
    fname = _safe_audio_filename(file)
    blob_name = _audio_gcs_prefix() + fname
    ttl = _audio_signed_url_ttl_seconds()
    if ttl < 60:
        ttl = 60
    if ttl > 3600:
        ttl = 3600

    try:
        # NOTE: In Cloud Run, default credentials do not include a private key.
        # We therefore sign via IAMCredentials signBlob (requires Token Creator).
        from datetime import timedelta

        import google.auth  # type: ignore
        from google.auth import impersonated_credentials  # type: ignore
        from google.cloud import storage  # type: ignore

        def _runtime_service_account_email() -> str:
            # Prefer explicit env override.
            e = os.environ.get("DAMA_AUDIO_SIGNER_SERVICE_ACCOUNT", "").strip()
            if e:
                return e
            # Cloud Run exposes the service account email via metadata server.
            try:
                r = _HTTP.get(
                    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email",
                    headers={"Metadata-Flavor": "Google"},
                    timeout=2,
                )
                if r.status_code == 200:
                    return (r.text or "").strip()
            except Exception:
                pass
            return ""

        source_creds, _proj = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        sa_email = _runtime_service_account_email()
        if not sa_email:
            raise RuntimeError(
                "Could not determine runtime service account email for signing. "
                "Set DAMA_AUDIO_SIGNER_SERVICE_ACCOUNT."
            )

        # Use impersonated credentials so signing works without a private key.
        signing_creds = impersonated_credentials.Credentials(
            source_credentials=source_creds,
            target_principal=sa_email,
            target_scopes=["https://www.googleapis.com/auth/devstorage.read_only"],
            lifetime=ttl,
        )

        client = storage.Client(credentials=signing_creds)
        blob = client.bucket(bucket).blob(blob_name)
        url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(seconds=ttl),
            method="GET",
            credentials=signing_creds,
        )
        return JSONResponse(
            {"url": url, "expires_in": ttl, "bucket": bucket, "object": blob_name, "signer": sa_email}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to sign audio URL: {e}") from e


@app.get("/assets/gong.mp3")
def serve_gong_mp3() -> FileResponse:
    if not GONG_MP3_PATH.is_file():
        raise HTTPException(status_code=404, detail="gong asset missing")
    # Detect media type based on file extension
    media_type = "audio/mpeg" if str(GONG_MP3_PATH).endswith(".mp3") else "audio/wav"
    return FileResponse(
        GONG_MP3_PATH,
        media_type=media_type,
        filename="gong.mp3",
    )


@app.get("/api/items")
def api_items(q: str = Query(default=""), book: str = Query("all")) -> JSONResponse:
    bq = (book or "all").strip().lower()
    bk = "all" if bq not in ("an1", "an2") else bq
    items = _merged_item_details() if bk == "all" else _load_items(_norm_book(bk))
    qn = (q or "").strip().lower()
    filtered: List[ItemDetail] = []
    if qn:
        for i in items:
            chain_blob = ""
            if i.chain:
                try:
                    chain_blob = json.dumps(i.chain, ensure_ascii=False)
                except Exception:
                    chain_blob = str(i.chain)
            blob = f"{i.suttaid}\n{i.sutta}\n{i.commentry}\n{i.commentary_id}\n{chain_blob}".lower()
            if qn in blob:
                filtered.append(i)
    else:
        filtered = items

    out = [
        ItemSummary(
            suttaid=i.suttaid,
            title=_item_title(i),
            has_commentary=bool((i.commentry or "").strip()),
        ).model_dump()
        for i in filtered
    ]
    _dbg("H4", "an1_app.py:api_items", "Serve items", {"book": bk, "count": len(out), "q": (q or "")[:80]})
    return JSONResponse({"items": out})


@app.get("/api/item/{suttaid}", response_model=ItemDetail)
def api_item(suttaid: str, book: str = Query("all")) -> ItemDetail:
    bq = (book or "all").strip().lower()
    if bq in ("an1", "an2"):
        for it in _load_items(bq):
            if it.suttaid == suttaid:
                return _apply_raw_meta_to_item(it)
    else:
        hit = _find_item_by_suttaid(suttaid)
        if hit:
            return _apply_raw_meta_to_item(hit)
    raise HTTPException(status_code=404, detail=f"Unknown suttaid: {suttaid}")


@app.get("/api/item_by_commentary_id/{commentary_id}", response_model=ItemDetail)
def api_item_by_commentary_id(commentary_id: str, book: str = Query("all")) -> ItemDetail:
    want = (commentary_id or "").strip()
    if not want:
        raise HTTPException(status_code=400, detail="empty commentary_id")
    bq = (book or "all").strip().lower()
    if bq in ("an1", "an2"):
        for it in _load_items(bq):
            if (it.commentary_id or "").strip() == want:
                return _apply_raw_meta_to_item(it)
    else:
        hit = _find_item_by_commentary_id(want)
        if hit:
            return _apply_raw_meta_to_item(hit)
    raise HTTPException(status_code=404, detail=f"Unknown commentary_id: {want}")


def _read_jsonl_messages(path: Path) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    if not path.is_file():
        return items
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
            if isinstance(obj, dict):
                items.append(obj)
        except json.JSONDecodeError:
            continue
    return items


@app.get("/api/conversations")
def api_conversations_list(
    request: Request,
    authorization: Annotated[Optional[str], Header()] = None,
) -> JSONResponse:
    auth = _require_api_user(request, authorization)
    with _lock:
        if auth.firebase_uid:
            try:
                dama_fb.prune_empty_conversations(auth.firebase_uid)
                rows = dama_fb.list_conversations(auth.firebase_uid)
            except Exception as e:
                if not _firestore_unavailable_error(e):
                    raise
                fb_local = _fallback_diy_id_for_firebase_uid(auth.firebase_uid)
                _prune_empty_conversations(fb_local)
                rows = _list_conversations_merged(fb_local)
        else:
            _prune_empty_conversations(auth.diy_user_id)
            rows = _list_conversations_merged(auth.diy_user_id)
    return JSONResponse({"conversations": rows})


@app.post("/api/conversations")
def api_conversations_create(
    request: Request,
    body: ConversationCreate,
    authorization: Annotated[Optional[str], Header()] = None,
) -> JSONResponse:
    auth = _require_api_user(request, authorization)
    if auth.firebase_uid:
        with _lock:
            try:
                out = dama_fb.create_conversation(auth.firebase_uid, (body.title or "").strip() or "New chat")
                return JSONResponse(out)
            except Exception as e:
                if not _firestore_unavailable_error(e):
                    raise
                fb_local = _fallback_diy_id_for_firebase_uid(auth.firebase_uid)
                cid = str(uuid.uuid4())
                title = (body.title or "").strip() or "New chat"
                now = int(time.time() * 1000)
                idx = [
                    r
                    for r in _read_conversation_index(fb_local)
                    if isinstance(r, dict) and str(r.get("id", "")).lower() != cid
                ]
                idx.append({"id": cid, "title": title, "updated_ts": now})
                _write_conversation_index(idx, fb_local)
                return JSONResponse({"id": cid, "title": title, "updated_ts": now})
    cid = str(uuid.uuid4())
    title = (body.title or "").strip() or "New chat"
    now = int(time.time() * 1000)
    with _lock:
        idx = [
            r
            for r in _read_conversation_index(auth.diy_user_id)
            if isinstance(r, dict) and str(r.get("id", "")).lower() != cid
        ]
        idx.append({"id": cid, "title": title, "updated_ts": now})
        _write_conversation_index(idx, auth.diy_user_id)
    return JSONResponse({"id": cid, "title": title, "updated_ts": now})


@app.get("/api/conversations/{conversation_id}/messages")
def api_conversation_messages_get(
    request: Request,
    conversation_id: str,
    authorization: Annotated[Optional[str], Header()] = None,
) -> JSONResponse:
    auth = _require_api_user(request, authorization)
    try:
        cid_norm = str(uuid.UUID(conversation_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail="invalid conversation id") from e
    if auth.firebase_uid:
        try:
            items = dama_fb.get_messages(auth.firebase_uid, conversation_id)
        except Exception as e:
            if not _firestore_unavailable_error(e):
                raise
            fb_local = _fallback_diy_id_for_firebase_uid(auth.firebase_uid)
            path = _conversation_jsonl_path(conversation_id, fb_local)
            items = _read_jsonl_messages(path)
        return JSONResponse(
            {"conversation_id": cid_norm, "items": items},
            headers={"Cache-Control": "no-store, max-age=0", "Pragma": "no-cache"},
        )
    path = _conversation_jsonl_path(conversation_id, auth.diy_user_id)
    items = _read_jsonl_messages(path)
    return JSONResponse(
        {"conversation_id": cid_norm, "items": items},
        headers={"Cache-Control": "no-store, max-age=0", "Pragma": "no-cache"},
    )


@app.post("/api/conversations/{conversation_id}/messages")
def api_conversation_messages_append(
    request: Request,
    conversation_id: str,
    body: ChatHistoryAppend,
    authorization: Annotated[Optional[str], Header()] = None,
) -> JSONResponse:
    auth = _require_api_user(request, authorization)
    try:
        cid_norm = str(uuid.UUID(conversation_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail="invalid conversation id") from e
    qstrip = (body.question or "").strip()
    astrip = (body.answer or "").strip()
    if not qstrip:
        raise HTTPException(status_code=400, detail="empty question")
    if not astrip or astrip == "(no answer)":
        raise HTTPException(status_code=400, detail="refusing to store without a model answer")
    if auth.firebase_uid:
        with _lock:
            try:
                dama_fb.append_message(
                    auth.firebase_uid,
                    conversation_id,
                    question=qstrip,
                    answer=astrip,
                    latency_ms=int(body.latency_ms),
                )
                return JSONResponse({"ok": True, "conversation_id": cid_norm})
            except Exception as e:
                if not _firestore_unavailable_error(e):
                    raise
                fb_local = _fallback_diy_id_for_firebase_uid(auth.firebase_uid)
                path = _conversation_jsonl_path(conversation_id, fb_local)
                rec = {
                    "ts": int(time.time() * 1000),
                    "q": qstrip,
                    "a": astrip,
                    "latency_ms": int(body.latency_ms),
                }
                with path.open("a", encoding="utf-8") as f:
                    f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                rows = [dict(r) for r in _read_conversation_index(fb_local) if isinstance(r, dict)]
                found = False
                snippet_q = qstrip.replace("\n", " ")
                snippet_q = re.sub(r"\s+", " ", snippet_q)
                snippet = (snippet_q[:56] + "…") if len(snippet_q) > 56 else snippet_q
                for r in rows:
                    if str(r.get("id", "")).lower() == cid_norm.lower():
                        r["updated_ts"] = rec["ts"]
                        t = str(r.get("title") or "").strip()
                        if (not t or t == "New chat") and snippet:
                            r["title"] = snippet
                        found = True
                        break
                if not found:
                    rows.append({"id": cid_norm, "title": snippet or "Chat", "updated_ts": rec["ts"]})
                _write_conversation_index(rows, fb_local)
                return JSONResponse({"ok": True, "conversation_id": cid_norm})
    path = _conversation_jsonl_path(conversation_id, auth.diy_user_id)
    rec = {
        "ts": int(time.time() * 1000),
        "q": qstrip,
        "a": astrip,
        "latency_ms": int(body.latency_ms),
    }
    qstrip = qstrip.replace("\n", " ")
    qstrip = re.sub(r"\s+", " ", qstrip)
    snippet = (qstrip[:56] + "…") if len(qstrip) > 56 else qstrip
    with _lock:
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        rows = [dict(r) for r in _read_conversation_index(auth.diy_user_id) if isinstance(r, dict)]
        found = False
        for r in rows:
            if str(r.get("id", "")).lower() == cid_norm.lower():
                r["updated_ts"] = rec["ts"]
                t = str(r.get("title") or "").strip()
                if (not t or t == "New chat") and snippet:
                    r["title"] = snippet
                found = True
                break
        if not found:
            rows.append({"id": cid_norm, "title": snippet or "Chat", "updated_ts": rec["ts"]})
        _write_conversation_index(rows, auth.diy_user_id)
    return JSONResponse({"ok": True, "conversation_id": cid_norm})


def _collection_count_safe(book: str) -> int:
    try:
        return int(_get_collection(_norm_book(book)).count())
    except Exception:
        return 0


def _vertex_chunk_counts_by_book(bundle: Dict[str, Any]) -> Tuple[int, int, int]:
    """Return (total, an1_chunks, an2_chunks, an3_chunks) from embedded Vertex chunk rows (book field)."""
    rows = vx.bundle_chunk_rows(bundle)
    n1 = 0
    n2 = 0
    n3 = 0
    for r in rows:
        bk = str((r or {}).get("book") or "").strip().lower()
        if bk == "an2":
            n2 += 1
        elif bk == "an3":
            n3 += 1
        elif bk == "an1":
            n1 += 1
    return len(rows), n1, n2, n3


def _index_status_llm_fields() -> Dict[str, Any]:
    """Expose which chat LLM is configured (GET /api/index_status)."""
    v = os.environ.get("DAMA_LLM", "").strip().lower()
    if v in ("openrouter", "or"):
        key_ok = bool(_openrouter_api_key())
        return {
            "llm_provider": "openrouter",
            "openrouter_ok": key_ok,
            "openrouter_model": _openrouter_model() if key_ok else "",
        }
    if vx.an1_vertex_enabled() or _vertex_llm_enabled():
        return {"llm_provider": "vertex"}
    ollama_ok = False
    try:
        r = _HTTP.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=2)
        ollama_ok = r.status_code == 200
    except Exception:
        ollama_ok = False
    return {"llm_provider": "ollama", "ollama_ok": ollama_ok}


@app.get("/api/index_status")
def api_index_status() -> JSONResponse:
    if vx.an1_vertex_enabled():
        try:
            b = vx.ensure_bundle_loaded(PERSIST_DIR)
            n, n_an1_v, n_an2_v, n_an3_v = _vertex_chunk_counts_by_book(b)
            meta = vx.bundle_meta_for_status(b)
            return JSONResponse(
                {
                    **_index_status_llm_fields(),
                    "exists": n > 0,
                    "count": n,
                    "vertex_an1_chunks": n_an1_v,
                    "vertex_an2_chunks": n_an2_v,
                    "vertex_an3_chunks": n_an3_v,
                    "mode": "vertex",
                    "persist_dir": str(PERSIST_DIR.resolve()),
                    "an1_path": str(AN1_PATH.resolve()),
                    "an2_path": str(AN2_PATH.resolve()),
                    "an3_path": str(AN3_PATH.resolve()),
                    "an2_count": _collection_count_safe("an2"),
                    "an3_count": _collection_count_safe("an3"),
                    "runtime": os.environ.get("DAMA_RUNTIME", "").strip() or None,
                    "build": AN1_APP_BUILD,
                    "bundle_gcs": os.environ.get("AN1_VERTEX_BUNDLE_GCS_URI", "").strip(),
                    "bundle_path": os.environ.get("AN1_VERTEX_BUNDLE_PATH", "").strip(),
                    "manifest_gcs": os.environ.get("AN1_VERTEX_MANIFEST_GCS_URI", "").strip(),
                    "manifest_path": os.environ.get("AN1_VERTEX_MANIFEST_PATH", "").strip(),
                    "embedding_model": meta.get("embedding_model") or "",
                    "bundle_format": meta.get("format") or "",
                    "manifest_shard_count": meta.get("manifest_shard_count"),
                    "manifest_version": meta.get("manifest_version"),
                }
            )
        except Exception as e:
            return JSONResponse(
                {
                    **_index_status_llm_fields(),
                    "exists": False,
                    "count": 0,
                    "vertex_an1_chunks": 0,
                    "vertex_an2_chunks": 0,
                    "vertex_an3_chunks": 0,
                    "mode": "vertex",
                    "persist_dir": str(PERSIST_DIR.resolve()),
                    "an1_path": str(AN1_PATH.resolve()),
                    "an2_path": str(AN2_PATH.resolve()),
                    "an3_path": str(AN3_PATH.resolve()),
                    "an2_count": _collection_count_safe("an2"),
                    "an3_count": _collection_count_safe("an3"),
                    "build": AN1_APP_BUILD,
                    "error": str(e),
                }
            )

    c1 = _collection_count_safe("an1")
    c2 = _collection_count_safe("an2")
    c3 = _collection_count_safe("an3")
    return JSONResponse(
        {
            **_index_status_llm_fields(),
            "exists": bool(c1 > 0 or c2 > 0 or c3 > 0),
            "count": c1,
            "an2_count": c2,
            "an3_count": c3,
            "mode": "local_chroma",
            "persist_dir": str(PERSIST_DIR.resolve()),
            "persist_an2_dir": str(PERSIST_AN2_DIR.resolve()),
            "persist_an3_dir": str(PERSIST_AN3_DIR.resolve()),
            "an1_path": str(AN1_PATH.resolve()),
            "an2_path": str(AN2_PATH.resolve()),
            "an3_path": str(AN3_PATH.resolve()),
            "build": AN1_APP_BUILD,
        }
    )


@app.post("/api/build", response_model=BuildResponse)
def api_build(
    request: Request,
    book: str = Query(
        "all",
        description="Build: all (AN2+AN3), an1 only (opt-in), an2 only, or an3 only (local Chroma). Vertex path rebuilds local Chroma + vertex_corpus shards (manifest); optional AN1_VERTEX_CORPUS_UPLOAD_BASE_GCS.",
    ),
    authorization: Annotated[Optional[str], Header()] = None,
) -> BuildResponse:
    _require_api_user(request, authorization)
    raw = (book or "all").strip().lower()
    b = raw if raw in ("an1", "an2", "an3", "all") else "all"
    with _lock:
        _dbg("H2", "an1_app.py:api_build", "Build requested", {"book": b})
        try:
            if vx.an1_vertex_enabled():
                from an1_build_vertex_bundle import write_vertex_corpus

                an1_build.build_an2_index()
                an1_build.build_an3_index()
                corpus_dir = PERSIST_DIR / "vertex_corpus"
                upload_base = os.environ.get("AN1_VERTEX_CORPUS_UPLOAD_BASE_GCS", "").strip()
                write_vertex_corpus(corpus_dir, upload_base_gcs=upload_base)
                vx.invalidate_bundle_cache()
                bundle = vx.ensure_bundle_loaded(PERSIST_DIR)
                _invalidate_items_cache()
                _invalidate_collection_cache()
                return BuildResponse(ok=True, collection_count=len(vx.bundle_chunk_rows(bundle)))

            if b == "an3":
                an1_build.build_an3_index()
                _invalidate_items_cache("an3")
                _invalidate_collection_cache("an3")
                return BuildResponse(ok=True, collection_count=_collection_count_safe("an3"))

            if b == "an2":
                an1_build.build_an2_index()
                _invalidate_items_cache("an2")
                _invalidate_collection_cache("an2")
                return BuildResponse(ok=True, collection_count=_collection_count_safe("an2"))

            if b == "an1":
                an1_build.build_an1_index()
                _invalidate_items_cache("an1")
                _invalidate_collection_cache("an1")
                return BuildResponse(ok=True, collection_count=_collection_count_safe("an1"))

            if AN2_PATH.exists():
                an1_build.build_an2_index()
            if AN3_PATH.exists():
                an1_build.build_an3_index()
            _invalidate_items_cache()
            _invalidate_collection_cache()
            c1 = _collection_count_safe("an1")
            c2 = _collection_count_safe("an2")
            c3 = _collection_count_safe("an3")
            return BuildResponse(ok=True, collection_count=c1 + c2 + c3)
        except Exception as e:
            _dbg("H2", "an1_app.py:api_build", "Build failed", {"error": str(e)})
            raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/query", response_model=QueryResponse)
def api_query(
    request: Request,
    req: QueryRequest,
    authorization: Annotated[Optional[str], Header()] = None,
) -> QueryResponse:
    _require_api_user(request, authorization)
    with _lock:
        # Respect client-provided settings; do not force LLM usage.
        book = (req.book or "all").strip().lower()
        if book not in ("an1", "an2", "an3", "all"):
            book = "all"
        _dbg(
            "H4",
            "an1_app.py:api_query",
            "Query",
            {"book": book, "k": req.k, "use_llm": req.use_llm, "question_len": len(req.question)},
        )
        _dbg721082(
            "H5",
            "an1_app.py:api_query",
            "Query received",
            {"book": book, "k": req.k, "use_llm": req.use_llm, "question_len": len(req.question)},
            run_id="pre-fix",
        )

        # If Vertex LLM or OpenRouter is enabled, use it even if the UI defaulted to retrieval-only.
        if _vertex_llm_enabled() or _openrouter_llm_enabled():
            req.use_llm = True

        if _is_chat_only_message(req.question):
            _dbg(
                "H4",
                "an1_app.py:api_query",
                "Chat-only message; skip retrieval/LLM",
                {"question_len": len(req.question)},
            )
            return QueryResponse(chunks=[], answer=_CHAT_ONLY_REPLY, used_llm=False)

        if vx.an1_vertex_enabled():
            try:
                bundle = vx.ensure_bundle_loaded(PERSIST_DIR)
            except Exception as e:
                _dbg("H2", "an1_app.py:api_query", "Vertex bundle missing", {"error": str(e)})
                raise HTTPException(
                    status_code=400,
                    detail=f"Vertex bundle not available: {e}. Rebuild (POST /api/build) or set AN1_VERTEX_BUNDLE_GCS_URI.",
                ) from e
            try:
                chunks = _retrieve_vertex(bundle, req.question, req.k, book=book)
            except Exception as e:
                _dbg("H2", "an1_app.py:api_query", "Vertex retrieval failed", {"error": str(e)})
                raise HTTPException(status_code=502, detail=f"Vertex retrieval failed: {e}") from e
            chunks = _filter_chat_chunks(chunks)

            used_llm = False
            answer = ""
            if req.use_llm:
                used_llm = True
                llm_chunks = _filter_chat_chunks(chunks[:10])
                allowed_an, allowed_can = _allowlists_from_chunks(llm_chunks)
                try:
                    _dbg(
                        "H3",
                        "an1_app.py:api_query",
                        "Calling Vertex Gemini",
                        {"chunks": len(llm_chunks), "model": vx.chat_model_name()},
                    )
                    answer = _call_llm(
                        req.question,
                        llm_chunks,
                        book=book,
                        allowed_an=allowed_an,
                        allowed_can=allowed_can,
                    )
                    bad = _illegal_citations(answer, allowed_an, allowed_can)
                    if bad:
                        answer2 = _call_llm(
                            req.question,
                            llm_chunks,
                            book=book,
                            allowed_an=allowed_an,
                            allowed_can=allowed_can,
                            extra_user_instructions=(
                                "Your previous draft used citations that are NOT allowed: "
                                + ", ".join(bad)
                                + ". Regenerate the answer using ONLY the ALLOWED CITATIONS list."
                            ),
                        )
                        bad2 = _illegal_citations(answer2, allowed_an, allowed_can)
                        answer = answer2 if not bad2 else _synthesize_retrieval_only_answer(chunks)
                except Exception as e:
                    _dbg("H3", "an1_app.py:api_query", "Vertex LLM failed", {"error": str(e)})
                    raise HTTPException(status_code=502, detail=f"Vertex LLM call failed: {e}") from e

            return QueryResponse(chunks=chunks, answer=answer, used_llm=used_llm)

        if not PERSIST_DIR.exists() and not PERSIST_AN2_DIR.exists():
            _dbg(
                "H2",
                "an1_app.py:api_query",
                "Index missing",
                {"persist_dir": str(PERSIST_DIR), "persist_an2": str(PERSIST_AN2_DIR)},
            )
            raise HTTPException(
                status_code=400,
                detail="No local index found. Run Rebuild (POST /api/build) first.",
            )

        chunks: List[Chunk] = []
        try:
            embed_model = _get_embed_model()
            chunks = _retrieve_merged_local(embed_model, req.question, req.k, book=book)
        except Exception as e:
            # Most common cause: HF hub download retries (503/504) making the UI appear "stuck".
            _dbg(
                "H2",
                "an1_app.py:api_query",
                "Embedding retrieval failed; using lexical fallback",
                {"error": str(e)[:500]},
            )
            chunks = _lexical_retrieve_from_items(req.question, req.k, book=book)
        chunks = _filter_chat_chunks(chunks)

        used_llm = False
        answer = ""
        if req.use_llm:
            used_llm = True
            llm_chunks = _filter_chat_chunks(chunks[:10])
            allowed_an, allowed_can = _allowlists_from_chunks(llm_chunks)
            try:
                _dbg(
                    "H3",
                    "an1_app.py:api_query",
                    "Calling Ollama (merged AN1+AN2)",
                    {"chunks": len(llm_chunks), "model": OLLAMA_MODEL},
                )
                answer = _call_llm(
                    req.question,
                    llm_chunks,
                    book="all",
                    allowed_an=allowed_an,
                    allowed_can=allowed_can,
                )
                bad = _illegal_citations(answer, allowed_an, allowed_can)
                if bad:
                    answer2 = _call_llm(
                        req.question,
                        llm_chunks,
                        book="all",
                        allowed_an=allowed_an,
                        allowed_can=allowed_can,
                        extra_user_instructions=(
                            "Your previous draft used citations that are NOT allowed: "
                            + ", ".join(bad)
                            + ". Regenerate the answer using ONLY the ALLOWED CITATIONS list."
                        ),
                    )
                    bad2 = _illegal_citations(answer2, allowed_an, allowed_can)
                    answer = answer2 if not bad2 else _synthesize_retrieval_only_answer(chunks)
            except Exception as e:
                _dbg("H3", "an1_app.py:api_query", "Ollama failed", {"error": str(e)})
                raise HTTPException(status_code=502, detail=f"Ollama LLM call failed: {e}") from e

        return QueryResponse(chunks=chunks, answer=answer, used_llm=used_llm)


class FeedbackRequest(BaseModel):
    message_id: str = Field(min_length=1)
    rating: int = Field(ge=-1, le=1)
    question: str = ""
    answer: str = ""
    sources: List[str] = []


@app.post("/api/feedback")
def api_feedback(
    request: Request,
    req: FeedbackRequest,
    authorization: Annotated[Optional[str], Header()] = None,
) -> JSONResponse:
    auth = _require_api_user(request, authorization)
    _dbg(
        "H4",
        "an1_app.py:api_feedback",
        "Feedback",
        {"message_id": req.message_id, "rating": req.rating, "sources": req.sources[:20]},
    )
    pl = {
        "message_id": req.message_id,
        "rating": req.rating,
        "sources": req.sources[:20],
        "question": (req.question or "")[:500],
    }
    try:
        if auth.firebase_uid:
            dama_fb.append_pedagogy_event(auth.firebase_uid, "feedback_thumb", pl)
        elif auth.diy_user_id is not None:
            dama_diy.append_pedagogy_event(BASE_DIR, auth.diy_user_id, "feedback_thumb", pl)
    except Exception:
        pass
    return JSONResponse({"ok": True})


class PedagogyEventIn(BaseModel):
    kind: str = Field(min_length=1, max_length=128)
    payload: Dict[str, Any] = Field(default_factory=dict)


@app.post("/api/pedagogy/event")
def api_pedagogy_event(
    request: Request,
    body: PedagogyEventIn,
    authorization: Annotated[Optional[str], Header()] = None,
) -> JSONResponse:
    """Append a custom pedagogy / analytics event (same user only). Use for study goals, milestones, etc."""
    auth = _require_api_user(request, authorization)
    k = (body.kind or "").strip()
    if auth.firebase_uid:
        eid = dama_fb.append_pedagogy_event(auth.firebase_uid, k, body.payload)
        return JSONResponse({"ok": True, "id": eid})
    if auth.diy_user_id is not None:
        rid = dama_diy.append_pedagogy_event(BASE_DIR, auth.diy_user_id, k, body.payload)
        return JSONResponse({"ok": True, "id": rid})
    raise HTTPException(status_code=500, detail="no user context")


@app.get("/api/pedagogy/events")
def api_pedagogy_events_list(
    request: Request,
    authorization: Annotated[Optional[str], Header()] = None,
    limit: int = Query(100, ge=1, le=500),
) -> JSONResponse:
    """List this user's pedagogy events (newest first). Chat/search history stays under /api/conversations."""
    auth = _require_api_user(request, authorization)
    if auth.firebase_uid:
        rows = dama_fb.list_pedagogy_events(auth.firebase_uid, limit)
    elif auth.diy_user_id is not None:
        rows = dama_diy.list_pedagogy_events(BASE_DIR, auth.diy_user_id, limit)
    else:
        rows = []
    return JSONResponse({"events": rows})

