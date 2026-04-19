import json
import os
import re
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

# Chroma / sentence_transformers are imported inside main() only so an1_app can load this module
# in the slim Vertex Docker image (no local index deps at runtime).

BASE_DIR = Path(__file__).resolve().parent


def _optional_env_path(var: str) -> Optional[Path]:
    raw = os.environ.get(var, "").strip()
    if not raw:
        return None
    return Path(raw).expanduser().resolve()


def _data_root() -> Optional[Path]:
    """If DAMA_DATA_DIR is set, default JSON/Chroma paths sit under it instead of BASE_DIR."""
    return _optional_env_path("DAMA_DATA_DIR")


def _default_file(name: str) -> Path:
    root = _data_root()
    return (root / name) if root is not None else (BASE_DIR / name)


def _default_chroma_dir(name: str) -> Path:
    root = _data_root()
    return (root / name) if root is not None else (BASE_DIR / name)


AN1_PATH = _optional_env_path("AN1_JSON_PATH") or _default_file("an1.json")
AN2_PATH = _optional_env_path("AN2_JSON_PATH") or _default_file("an2.json")
AN3_PATH = _optional_env_path("AN3_JSON_PATH") or _default_file("an3.json")
PERSIST_DIR = _optional_env_path("CHROMA_AN1_DIR") or _default_chroma_dir("rag_index_an1")
COLLECTION_NAME = "an1_sutta"

PERSIST_AN2_DIR = _optional_env_path("CHROMA_AN2_DIR") or _default_chroma_dir("rag_index_an2")
COLLECTION_AN2 = "an2_sutta"

PERSIST_AN3_DIR = _optional_env_path("CHROMA_AN3_DIR") or _default_chroma_dir("rag_index_an3")
COLLECTION_AN3 = "an3_sutta"

DEBUG_LOG_PATH = _optional_env_path("DAMA_DEBUG_LOG_PATH") or (BASE_DIR / "debug-655121.log")


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


def read_in_chunks_from_string(text: str, chunk_size: int = 1500, overlap: int = 400) -> Iterable[str]:
    if not (text or "").strip():
        return
    start = 0
    while start < len(text):
        end = start + chunk_size
        if end >= len(text):
            chunk = text[start:]
            if chunk.strip():
                yield chunk
            break

        boundary = text.rfind(". ", start + chunk_size // 2, end + 200)
        if boundary != -1:
            end = boundary + 2
        else:
            boundary = text.rfind(" ", start + chunk_size // 2, end + 100)
            if boundary != -1:
                end = boundary + 1

        yield text[start:end]
        start = end - overlap


def _commentary_body(rec: Dict[str, Any]) -> str:
    return str(rec.get("commentary") or rec.get("commentry") or "").strip()


def _commentary_id(rec: Dict[str, Any]) -> str:
    cid = str(rec.get("commentary_id") or "").strip()
    if cid:
        return cid
    sid = str(rec.get("suttaid") or "").strip()
    if sid.startswith("AN "):
        return "c" + sid
    return ("c" + sid) if sid else ""


def _parse_json_lenient(raw: str) -> Any:
    try:
        return json.loads(raw)
    except Exception:
        pass
    rge = __import__("re")
    s = raw.lstrip("\ufeff")
    s = rge.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", s)
    s = rge.sub(
        r'("sutta"\s*:\s*"(?:[^"\\\\]|\\\\.)*")(\s*\n\s*"commentry"\s*:)',
        r"\1,\2",
        s,
    )
    s = rge.sub(
        r'("sutta"\s*:\s*"(?:[^"\\\\]|\\\\.)*")(\s*\n\s*"commentary_id"\s*:)',
        r"\1,\2",
        s,
    )
    s = rge.sub(
        r'("commentary_id"\s*:\s*"(?:[^"\\\\]|\\\\.)*")(\s*\n\s*"commentary"\s*:)',
        r"\1,\2",
        s,
    )
    s = rge.sub(
        r'("sutta"\s*:\s*"(?:[^"\\\\]|\\\\.)*")(\s*\n\s*"commentary"\s*:)',
        r"\1,\2",
        s,
    )
    s = rge.sub(r",(\s*[}\]])", r"\1", s)
    return json.loads(s)


def _extract_records_fallback(raw: str) -> List[Dict[str, str]]:
    records: List[Dict[str, str]] = []
    cur: Dict[str, str] = {}
    mode: Optional[str] = None
    chain_buf: List[str] = []
    chain_depth = 0

    def flush():
        nonlocal cur, mode, chain_buf, chain_depth
        comm = (cur.get("commentary") or cur.get("commentry") or "").strip()
        if cur.get("suttaid") and (cur.get("sutta") or comm):
            row: Dict[str, str] = {
                "suttaid": cur.get("suttaid", "").strip(),
                "sutta": (cur.get("sutta") or "").strip(),
                "commentry": comm,
            }
            sc_id = (cur.get("sc_id") or "").strip()
            sc_url = (cur.get("sc_url") or "").strip()
            if sc_id:
                row["sc_id"] = sc_id
            if sc_url:
                row["sc_url"] = sc_url
            aud_file = (cur.get("aud_file") or "").strip()
            aud_start = (cur.get("aud_start_s") or "").strip()
            aud_end = (cur.get("aud_end_s") or "").strip()
            if aud_file:
                row["aud_file"] = aud_file
            if aud_start:
                row["aud_start_s"] = aud_start
            if aud_end:
                row["aud_end_s"] = aud_end
            cid = (cur.get("commentary_id") or "").strip()
            if cid:
                row["commentary_id"] = cid
            ch = cur.get("chain")
            if isinstance(ch, str) and ch.strip():
                try:
                    row["chain"] = json.loads(ch)
                except Exception:
                    pass
            records.append(row)
        cur = {}
        mode = None
        chain_buf = []
        chain_depth = 0

    def unquote(s: str) -> str:
        s = (s or "").strip().rstrip(",")
        if s.startswith('"') and s.endswith('"') and len(s) >= 2:
            return s[1:-1]
        return s

    rgx = __import__("re")
    for line in (raw or "").splitlines():
        ln = line.strip()
        if not ln:
            continue

        # Support both AN1-style "suttaid" and AN2-style "sutta_id" in lenient mode.
        if '"suttaid"' in ln or '"sutta_id"' in ln:
            flush()
            m = rgx.search(r'"suttaid"\s*:\s*"([^"]+)"', ln) or rgx.search(
                r'"sutta_id"\s*:\s*"([^"]+)"', ln
            )
            if m:
                cur["suttaid"] = m.group(1)
            mode = None
            continue

        if '"commentary_id"' in ln:
            m_id = rgx.search(r'"commentary_id"\s*:\s*"([^"]*)"', ln)
            if m_id:
                cur["commentary_id"] = m_id.group(1)
            continue

        if '"sc_id"' in ln:
            m_sc = rgx.search(r'"sc_id"\s*:\s*"([^"]*)"', ln)
            if m_sc:
                cur["sc_id"] = m_sc.group(1)
            continue

        if '"sc_url"' in ln:
            m_sc = rgx.search(r'"sc_url"\s*:\s*"([^"]*)"', ln)
            if m_sc:
                cur["sc_url"] = m_sc.group(1)
            continue

        if '"aud_file"' in ln:
            m_af = rgx.search(r'"aud_file"\s*:\s*"([^"]*)"', ln)
            if m_af:
                cur["aud_file"] = m_af.group(1)
            continue

        if '"aud_start_s"' in ln:
            m_as = rgx.search(r'"aud_start_s"\s*:\s*([0-9]+(?:\.[0-9]+)?)', ln)
            if m_as:
                cur["aud_start_s"] = m_as.group(1)
            continue

        if '"aud_end_s"' in ln:
            m_ae = rgx.search(r'"aud_end_s"\s*:\s*([0-9]+(?:\.[0-9]+)?)', ln)
            if m_ae:
                cur["aud_end_s"] = m_ae.group(1)
            continue

        m = rgx.search(r'"sutta"\s*:\s*"(.*)"\s*,?\s*$', ln)
        if m:
            cur["sutta"] = m.group(1)
            mode = "sutta"
            continue

        if '"commentry"' in ln:
            m1 = rgx.search(r'"commentry"\s*:\s*"(.*)"\s*,?\s*$', ln)
            if m1:
                cur["commentry"] = m1.group(1)
            else:
                m2 = rgx.search(r'"commentry"\s*:\s*(.*)\s*$', ln)
                if m2:
                    cur["commentry"] = unquote(m2.group(1))
            mode = "commentry"
            continue

        if '"commentary"' in ln and '"commentary_id"' not in ln:
            m1 = rgx.search(r'"commentary"\s*:\s*"(.*)"\s*,?\s*$', ln)
            if m1:
                cur["commentary"] = m1.group(1)
            else:
                m2 = rgx.search(r'"commentary"\s*:\s*(.*)\s*$', ln)
                if m2:
                    cur["commentary"] = unquote(m2.group(1))
            mode = "commentary"
            continue

        # If the source JSON is malformed, the chain object can spill into the commentary.
        # Capture a best-effort chain JSON object and prevent it from polluting the commentry text.
        if '"chain"' in ln:
            # Start capturing from first '{' after "chain"
            i0 = ln.find("{")
            if i0 >= 0:
                chain_buf = [ln[i0:]]
                chain_depth = ln[i0:].count("{") - ln[i0:].count("}")
                mode = "chain"
            else:
                mode = None
            continue

        if mode == "chain":
            chain_buf.append(ln)
            chain_depth += ln.count("{") - ln.count("}")
            if chain_depth <= 0 and chain_buf:
                blob = "\n".join(chain_buf).strip().rstrip(",")
                try:
                    cur["chain"] = blob
                except Exception:
                    pass
                mode = None
                chain_buf = []
                chain_depth = 0
            continue

        if mode == "sutta":
            cur["sutta"] = (cur.get("sutta") or "") + "\n" + unquote(ln)
        elif mode == "commentry":
            cur["commentry"] = (cur.get("commentry") or "") + "\n" + unquote(ln)
        elif mode == "commentary":
            cur["commentary"] = (cur.get("commentary") or "") + "\n" + unquote(ln)

    flush()
    return records


def _record_to_text(record: Dict[str, Any]) -> Tuple[str, str, str]:
    suttaid = str(record.get("suttaid") or "").strip()
    sutta = str(record.get("sutta") or "").strip()
    commentary = _commentary_body(record)
    cid = _commentary_id(record)
    combined = f"SUTTAID: {suttaid}\nCOMMENTARY_ID: {cid}\n\nSUTTA:\n{sutta}"
    if commentary:
        combined += f"\n\nTEACHER COMMENTARY:\n{commentary}"
    return suttaid, sutta, combined


def _record_to_docs(record: Dict[str, Any]) -> List[Tuple[str, str, str, str]]:
    """
    Return a list of (kind, suttaid, commentary_id, text) docs so we can attribute citations.
    kind: 'sutta' | 'commentary' | 'combined'
    """
    suttaid = str(record.get("suttaid") or "").strip()
    cid = _commentary_id(record)
    sutta = str(record.get("sutta") or "").strip()
    commentary = _commentary_body(record)
    out: List[Tuple[str, str, str, str]] = []
    if suttaid and sutta:
        out.append(
            ("sutta", suttaid, cid, f"SUTTAID: {suttaid}\nCOMMENTARY_ID: {cid}\n\nSUTTA:\n{sutta}")
        )
    if suttaid and commentary:
        out.append(
            (
                "commentary",
                suttaid,
                cid,
                f"SUTTAID: {suttaid}\nCOMMENTARY_ID: {cid}\n\nTEACHER COMMENTARY:\n{commentary}",
            )
        )
    ch = record.get("chain")
    if suttaid and isinstance(ch, dict):
        chain_txt = _chain_block_text(suttaid, cid, ch)
        if chain_txt.strip():
            out.append(("chain", suttaid, cid, chain_txt))
    if not out and suttaid:
        # fallback: keep something indexable
        combined = f"SUTTAID: {suttaid}\nCOMMENTARY_ID: {cid}\n\nSUTTA:\n{sutta}"
        if commentary:
            combined += f"\n\nTEACHER COMMENTARY:\n{commentary}"
        out.append(("combined", suttaid, cid, combined))
    return out


def _normalize_suttaid_an2(raw: Any) -> str:
    s = str(raw or "").strip()
    if not s:
        return ""
    if re.match(r"^AN\s+", s, flags=re.I):
        tail = re.sub(r"^AN\s+", "", s, flags=re.I).strip()
        return ("AN " + tail) if tail else ""
    return "AN " + s


def _commentary_id_from_suttaid(suttaid: str) -> str:
    sid = (suttaid or "").strip()
    if not sid:
        return ""
    return "c" + sid


def _chain_block_text(suttaid: str, cid: str, chain: Dict[str, Any]) -> str:
    cat = str(chain.get("category") or "").strip()
    items = chain.get("items") or []
    if not isinstance(items, list):
        items = []
    ordered = bool(chain.get("is_ordered"))
    lines = [
        f"SUTTAID: {suttaid}",
        f"COMMENTARY_ID: {cid}",
        "",
        "CHAIN (enumerated links / topics for this discourse; not verbatim scripture):",
        f"Category: {cat}" if cat else "Category: (none)",
        f"Ordered pair: {'yes' if ordered else 'no'}",
        "Items:",
    ]
    for i, it in enumerate(items):
        lines.append(f"  {i + 1}. {str(it).strip()}")
    return "\n".join(lines)


def _record_to_docs_an2(record: Dict[str, Any]) -> List[Tuple[str, str, str, str]]:
    suttaid = _normalize_suttaid_an2(record.get("sutta_id") or record.get("suttaid"))
    cid = _commentary_id_from_suttaid(suttaid)
    sutta = str(record.get("sutta") or "").strip()
    commentary = _commentary_body(record)
    out: List[Tuple[str, str, str, str]] = []
    if suttaid and sutta:
        out.append(
            ("sutta", suttaid, cid, f"SUTTAID: {suttaid}\nCOMMENTARY_ID: {cid}\n\nSUTTA:\n{sutta}")
        )
    if suttaid and commentary:
        out.append(
            (
                "commentary",
                suttaid,
                cid,
                f"SUTTAID: {suttaid}\nCOMMENTARY_ID: {cid}\n\nTEACHER COMMENTARY:\n{commentary}",
            )
        )
    ch = record.get("chain")
    if suttaid and isinstance(ch, dict):
        chain_txt = _chain_block_text(suttaid, cid, ch)
        if chain_txt.strip():
            out.append(("chain", suttaid, cid, chain_txt))
    if not out and suttaid:
        combined = f"SUTTAID: {suttaid}\nCOMMENTARY_ID: {cid}\n\nSUTTA:\n{sutta}"
        if commentary:
            combined += f"\n\nTEACHER COMMENTARY:\n{commentary}"
        out.append(("combined", suttaid, cid, combined))
    return out


def _chromadb_build(
    *,
    json_path: Path,
    persist_dir: Path,
    collection_name: str,
    record_to_docs: Callable[[Dict[str, Any]], List[Tuple[str, str, str, str]]],
    id_prefix: str,
    tqdm_desc: str,
) -> int:
    import chromadb
    from chromadb.config import Settings
    from sentence_transformers import SentenceTransformer
    from tqdm import tqdm

    _dbg(
        "H1",
        "an1_build_index.py:_chromadb_build",
        "Start build",
        {"json_path": str(json_path), "persist_dir": str(persist_dir), "collection": collection_name},
    )

    if not json_path.exists():
        _dbg("H1", "an1_build_index.py:_chromadb_build", "json missing", {"json_path": str(json_path)})
        raise FileNotFoundError(f"Missing JSON at: {json_path}")

    os.makedirs(persist_dir, exist_ok=True)

    client = chromadb.PersistentClient(
        path=str(persist_dir),
        settings=Settings(anonymized_telemetry=False),
    )

    try:
        client.delete_collection(collection_name)
    except Exception:
        pass
    collection = client.create_collection(collection_name)

    _dbg("H5", "an1_build_index.py:_chromadb_build", "Loading embedding model", {"model": "all-MiniLM-L6-v2"})
    model = SentenceTransformer("all-MiniLM-L6-v2")

    raw = json_path.read_text(encoding="utf-8", errors="ignore")
    try:
        data = _parse_json_lenient(raw)
    except Exception as e:
        _dbg("H1", "an1_build_index.py:_chromadb_build", "JSON parse failed", {"error": str(e), "bytes": len(raw)})
        data = _extract_records_fallback(raw)
        _dbg("H1", "an1_build_index.py:_chromadb_build", "Fallback extracted records", {"count": len(data)})

    if not isinstance(data, list):
        _dbg("H1", "an1_build_index.py:_chromadb_build", "Unexpected JSON shape", {"type": str(type(data))})
        raise ValueError(f"Expected JSON list of records: {json_path}")

    _dbg("H1", "an1_build_index.py:_chromadb_build", "Loaded records", {"count": len(data)})

    batch_size = 64
    ids: List[str] = []
    metadatas: List[Dict[str, Any]] = []
    texts: List[str] = []

    global_chunk_index = 0
    source_rel = str(json_path.relative_to(BASE_DIR)).replace("\\", "/")

    def flush_batch() -> None:
        nonlocal ids, metadatas, texts
        if not texts:
            return
        embeddings = model.encode(texts, show_progress_bar=False).tolist()
        collection.add(ids=ids, documents=texts, metadatas=metadatas, embeddings=embeddings)
        ids, metadatas, texts = [], [], []

    for rec_i, rec in enumerate(tqdm(data, desc=tqdm_desc)):
        if not isinstance(rec, dict):
            continue
        docs = record_to_docs(rec)
        for doc_kind, suttaid, comm_id, doc_text in docs:
            if not doc_text.strip():
                continue
            chunk_index = 0
            for chunk in read_in_chunks_from_string(doc_text):
                ids.append(f"{id_prefix}-{doc_kind}-{rec_i}-c{chunk_index}-g{global_chunk_index}")
                metadatas.append(
                    {
                        "source": source_rel,
                        "suttaid": suttaid,
                        "commentary_id": comm_id,
                        "kind": doc_kind,
                        "chunk_index": chunk_index,
                        "global_chunk_index": global_chunk_index,
                    }
                )
                texts.append(chunk)
                chunk_index += 1
                global_chunk_index += 1
                if len(texts) >= batch_size:
                    flush_batch()

    flush_batch()
    n = int(collection.count())
    _dbg("H2", "an1_build_index.py:_chromadb_build", "Build finished", {"collection_count": n})
    return n


def build_an1_index() -> int:
    return _chromadb_build(
        json_path=AN1_PATH,
        persist_dir=PERSIST_DIR,
        collection_name=COLLECTION_NAME,
        record_to_docs=_record_to_docs,
        id_prefix="an1",
        tqdm_desc="AN1 records",
    )


def build_an2_index() -> int:
    return _chromadb_build(
        json_path=AN2_PATH,
        persist_dir=PERSIST_AN2_DIR,
        collection_name=COLLECTION_AN2,
        record_to_docs=_record_to_docs_an2,
        id_prefix="an2",
        tqdm_desc="AN2 records",
    )


def build_an3_index() -> int:
    return _chromadb_build(
        json_path=AN3_PATH,
        persist_dir=PERSIST_AN3_DIR,
        collection_name=COLLECTION_AN3,
        # AN3 uses AN2-style fields (sutta_id/commentary/chain)
        record_to_docs=_record_to_docs_an2,
        id_prefix="an3",
        tqdm_desc="AN3 records",
    )


def main() -> None:
    # Intentionally do nothing here; CLI entrypoint below controls what gets built.
    # Keeping this function avoids breaking older imports/tests that may call main().
    return None


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Build Chroma AN1 / AN2 RAG indexes.")
    ap.add_argument(
        "--book",
        choices=["an1", "an2", "an3", "all"],
        default="all",
        help="Which index to build (default: all = an2+an3; an1 is opt-in).",
    )
    args = ap.parse_args()
    if args.book in ("an1",):
        build_an1_index()
    if args.book in ("an2", "all"):
        build_an2_index()
    if args.book in ("an3", "all"):
        build_an3_index()

