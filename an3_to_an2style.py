import json
import re
from pathlib import Path
from typing import Any, Dict, List


BASE_DIR = Path(__file__).resolve().parent
SRC_JSON = BASE_DIR / "an3.json"
OUT_JSON = BASE_DIR / "an3_an2style.json"

DEFAULT_CHAIN: Dict[str, Any] = {"items": [], "count": 0, "is_ordered": False, "category": ""}


ID_PREFIX_RE = re.compile(r"^\s*AN\s+", flags=re.IGNORECASE)


def _to_sutta_id(suttaid: str) -> str:
    s = (suttaid or "").strip()
    s = ID_PREFIX_RE.sub("", s).strip()
    return s


def _strip_leading_id_from_sutta(sutta_text: str, sutta_id: str) -> str:
    txt = (sutta_text or "").lstrip()
    sid = (sutta_id or "").strip()
    if sid and txt.lower().startswith(sid.lower() + " "):
        return txt[len(sid) + 1 :].lstrip()
    return txt


def main() -> None:
    raw = json.loads(SRC_JSON.read_text(encoding="utf-8", errors="ignore"))
    if not isinstance(raw, list):
        raise ValueError("Expected an3.json to be a list of records")

    out: List[Dict[str, Any]] = []
    for rec in raw:
        if not isinstance(rec, dict):
            continue

        suttaid_full = str(rec.get("suttaid") or "").strip()
        sutta_id = _to_sutta_id(suttaid_full)

        sutta = str(rec.get("sutta") or "").strip()
        sutta = _strip_leading_id_from_sutta(sutta, sutta_id)

        commentary = str(rec.get("commentary") or rec.get("commentry") or "").strip()

        row: Dict[str, Any] = {
            "sutta_id": sutta_id,
            "sutta": sutta,
            "commentary": commentary,
            "chain": DEFAULT_CHAIN.copy(),
        }

        # Keep chain if present and already a dict; otherwise keep default empty chain.
        chain = rec.get("chain")
        if isinstance(chain, dict):
            row["chain"] = chain

        out.append(row)

    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote: {OUT_JSON} ({len(out)} records)")


if __name__ == "__main__":
    main()

