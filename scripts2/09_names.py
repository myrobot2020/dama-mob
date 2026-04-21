"""Set sutta_name_en and sutta_name_pali on each an*/suttas/*.json from docs/sutta_id_chain.txt."""
from __future__ import annotations

import csv
import io
import json
import re
from pathlib import Path


def load_catalog(repo: Path) -> dict[str, tuple[str, str]]:
    p = repo / "docs" / "sutta_id_chain.txt"
    text = p.read_text(encoding="utf-8")
    r = csv.DictReader(io.StringIO(text))
    out: dict[str, tuple[str, str]] = {}
    for row in r:
        c = row.get("Conceptual Chain") or ""
        en = (row.get("Sutta Name (English)") or "").strip()
        pl = (row.get("Sutta Name (Pali)") or "").strip()
        m = re.search(r"\b(\d+\.\d+(?:\.\d+)?)\b", c)
        if m and en:
            out[m.group(1)] = (en, pl)
    return out


def inject_after_sutta_id(obj: dict, en: str, pali: str) -> dict:
    """Insert sutta_name_en / sutta_name_pali immediately after sutta_id; drop stale copies."""
    if "sutta_id" not in obj:
        return obj
    new: dict = {}
    for k, v in obj.items():
        if k in ("sutta_name_en", "sutta_name_pali"):
            continue
        new[k] = v
        if k == "sutta_id":
            new["sutta_name_en"] = en
            new["sutta_name_pali"] = pali
    return new


def main() -> None:
    repo = Path(__file__).resolve().parents[1]
    catalog = load_catalog(repo)
    n_files = 0
    n_matched = 0
    for path in sorted(repo.glob("an*/suttas/*.json")):
        if path.name.startswith("_"):
            continue
        try:
            raw = path.read_text(encoding="utf-8")
            obj = json.loads(raw)
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(obj, dict):
            continue
        sid = str(obj.get("sutta_id") or "").strip()
        if not sid:
            continue
        n_files += 1
        pair = catalog.get(sid, ("", ""))
        if pair[0]:
            n_matched += 1
        en, pl = pair
        new_obj = inject_after_sutta_id(obj, en, pl)
        path.write_text(json.dumps(new_obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"updated {n_files} files; {n_matched} with catalog English names")


if __name__ == "__main__":
    main()
