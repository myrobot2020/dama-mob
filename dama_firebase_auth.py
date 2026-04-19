"""
Firebase Auth (ID token verification) + Firestore per-user chat history.

Enable with DAMA_FIREBASE_ENABLED=1 and set DAMA_FIREBASE_WEB_CONFIG (JSON) for the web client.
Server: Application Default Credentials (Cloud Run) or GOOGLE_APPLICATION_CREDENTIALS locally.
Project: GOOGLE_CLOUD_PROJECT or FIREBASE_PROJECT_ID or parse from web config.
"""

from __future__ import annotations

import json
import os
import re
import time
import uuid
from typing import Any, Dict, List, Optional

_firebase_app = None


def firebase_enabled() -> bool:
    v = os.environ.get("DAMA_FIREBASE_ENABLED", "").strip().lower()
    return v in ("1", "true", "yes", "on")


def web_config_dict() -> Dict[str, Any]:
    raw = os.environ.get("DAMA_FIREBASE_WEB_CONFIG", "").strip()
    if not raw:
        return {}
    try:
        obj = json.loads(raw)
        return obj if isinstance(obj, dict) else {}
    except json.JSONDecodeError:
        return {}


def _project_id() -> str:
    return (
        os.environ.get("FIREBASE_PROJECT_ID", "").strip()
        or os.environ.get("GOOGLE_CLOUD_PROJECT", "").strip()
        or str(web_config_dict().get("projectId") or "").strip()
    )


def init_firebase_admin() -> None:
    global _firebase_app
    if _firebase_app is not None:
        return
    import firebase_admin  # type: ignore
    from firebase_admin import credentials  # type: ignore

    pid = _project_id()
    if not pid:
        raise RuntimeError(
            "Firebase enabled but no project id: set GOOGLE_CLOUD_PROJECT or FIREBASE_PROJECT_ID "
            "or projectId inside DAMA_FIREBASE_WEB_CONFIG"
        )
    cred = credentials.ApplicationDefault()
    _firebase_app = firebase_admin.initialize_app(cred, {"projectId": pid})


def decode_id_token(id_token: str) -> Dict[str, Any]:
    """Return Firebase token claims (uid, email, name, …)."""
    init_firebase_admin()
    from firebase_admin import auth as fb_auth  # type: ignore

    return fb_auth.verify_id_token(id_token)


def verify_id_token(id_token: str) -> str:
    """Return Firebase uid or raise ValueError."""
    decoded = decode_id_token(id_token)
    uid = str(decoded.get("uid") or "").strip()
    if not uid:
        raise ValueError("token missing uid")
    return uid


def _db() -> Any:
    init_firebase_admin()
    from google.cloud import firestore  # type: ignore

    return firestore.Client(project=_project_id())


def _conv_col(uid: str) -> Any:
    return _db().collection("users").document(uid).collection("conversations")


def _turns(uid: str, cid: str) -> Any:
    return _conv_col(uid).document(cid).collection("turns")


def _conversation_has_valid_turn_fs(uid: str, cid: str) -> bool:
    for snap in _turns(uid, cid).limit(50).stream():
        d = snap.to_dict() or {}
        q = str(d.get("q") or "").strip()
        a = str(d.get("a") or "").strip()
        if q and a and a != "(no answer)":
            return True
    return False


def prune_empty_conversations(uid: str) -> None:
    col = _conv_col(uid)
    docs = list(col.stream())
    for doc in docs:
        cid = doc.id
        if _conversation_has_valid_turn_fs(uid, cid):
            continue
        for t in _turns(uid, cid).stream():
            t.reference.delete()
        doc.reference.delete()


def list_conversations(uid: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for doc in _conv_col(uid).order_by("updated_ts", direction="DESCENDING").stream():
        d = doc.to_dict() or {}
        out.append(
            {
                "id": doc.id,
                "title": str(d.get("title") or "Chat").strip() or "Chat",
                "updated_ts": int(d.get("updated_ts") or 0),
            }
        )
    return out


def create_conversation(uid: str, title: str) -> Dict[str, Any]:
    cid = str(uuid.uuid4())
    now = int(time.time() * 1000)
    t = (title or "").strip() or "New chat"
    _conv_col(uid).document(cid).set({"title": t, "updated_ts": now})
    return {"id": cid, "title": t, "updated_ts": now}


def get_messages(uid: str, conversation_id: str) -> List[Dict[str, Any]]:
    cid_norm = str(uuid.UUID(conversation_id))
    items: List[Dict[str, Any]] = []
    for snap in _turns(uid, cid_norm).order_by("ts").stream():
        d = snap.to_dict() or {}
        items.append(
            {
                "ts": d.get("ts"),
                "q": d.get("q"),
                "a": d.get("a"),
                "latency_ms": d.get("latency_ms"),
            }
        )
    return items


def append_message(
    uid: str,
    conversation_id: str,
    *,
    question: str,
    answer: str,
    latency_ms: int,
) -> str:
    cid_norm = str(uuid.UUID(conversation_id))
    rec = {
        "ts": int(time.time() * 1000),
        "q": question,
        "a": answer,
        "latency_ms": int(latency_ms),
    }
    qstrip = question.replace("\n", " ")
    qstrip = re.sub(r"\s+", " ", qstrip).strip()
    snippet = (qstrip[:56] + "…") if len(qstrip) > 56 else qstrip

    parent = _conv_col(uid).document(cid_norm)
    parent.collection("turns").add(rec)

    doc = parent.get()
    data = doc.to_dict() if doc.exists else {}
    title = str((data or {}).get("title") or "").strip()
    if not title or title == "New chat":
        title = snippet or "Chat"
    parent.set({"title": title, "updated_ts": rec["ts"]}, merge=True)
    return cid_norm


def _pedagogy_col(uid: str) -> Any:
    return _db().collection("users").document(uid).collection("pedagogy_events")


def append_pedagogy_event(uid: str, kind: str, payload: Optional[Dict[str, Any]] = None) -> str:
    """One analytics / pedagogy document per user (Firestore)."""
    k = (kind or "").strip()[:128] or "event"
    doc = _pedagogy_col(uid).document()
    doc.set({"ts": time.time(), "kind": k, "payload": payload or {}})
    return doc.id


def list_pedagogy_events(uid: str, limit: int = 100) -> List[Dict[str, Any]]:
    from google.cloud.firestore import Query  # type: ignore

    lim = max(1, min(int(limit), 500))
    out: List[Dict[str, Any]] = []
    for snap in (
        _pedagogy_col(uid)
        .order_by("ts", direction=Query.DESCENDING)
        .limit(lim)
        .stream()
    ):
        d = snap.to_dict() or {}
        out.append(
            {
                "id": snap.id,
                "ts": float(d.get("ts") or 0),
                "kind": str(d.get("kind") or ""),
                "payload": d.get("payload") if isinstance(d.get("payload"), dict) else {},
            }
        )
    return out
