import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple


BASE_DIR = Path(__file__).resolve().parent
SRC_TXT = BASE_DIR / "AN_Book_03.txt"
OUT_CLEAN_TXT = BASE_DIR / "AN_Book_03_clean.txt"
OUT_JSON = BASE_DIR / "an3.json"


HEADER_RE = re.compile(r"^\s*(?P<id>\d+(?:\.\d+)+)\s+(?P<body>.+?)\s*$")
COMM_RE = re.compile(r"^\s*comm\s*:\s*(?P<body>.*)\s*$", flags=re.IGNORECASE)


@dataclass
class Record:
    raw_id: str
    sutta_lines: List[str]
    commentry_lines: List[str]

    def to_json(self) -> Dict[str, str]:
        suttaid = f"AN {self.raw_id}".strip()
        sutta = "\n".join(_trim_blank_edges(self.sutta_lines)).strip()
        commentry = "\n".join(_trim_blank_edges(self.commentry_lines)).strip()
        out: Dict[str, str] = {
            "suttaid": suttaid,
            "sutta": sutta,
            "commentry": commentry,
            "commentary_id": "c" + suttaid,
        }
        return out


def _trim_blank_edges(lines: List[str]) -> List[str]:
    i0 = 0
    i1 = len(lines)
    while i0 < i1 and not lines[i0].strip():
        i0 += 1
    while i1 > i0 and not lines[i1 - 1].strip():
        i1 -= 1
    return lines[i0:i1]


def _normalize_line(line: str) -> str:
    # Keep content intact; only normalize whitespace in a conservative way.
    s = (line or "").replace("\t", " ").rstrip()
    # Collapse runs of 3+ spaces down to 2 (avoids removing intended spacing).
    s = re.sub(r"[ ]{3,}", "  ", s)
    return s


def parse_book(raw_text: str) -> Tuple[List[str], List[Record]]:
    cleaned_lines: List[str] = []
    records: List[Record] = []

    cur: Optional[Record] = None
    mode: str = "sutta"  # 'sutta' | 'commentry'

    def flush() -> None:
        nonlocal cur
        if cur is None:
            return
        if cur.raw_id.strip() and (any(l.strip() for l in cur.sutta_lines) or any(l.strip() for l in cur.commentry_lines)):
            records.append(cur)
        cur = None

    for raw_line in (raw_text or "").splitlines():
        line = _normalize_line(raw_line)

        m_comm = COMM_RE.match(line)
        if m_comm:
            if cur is None:
                # Commentary before first header: keep in cleaned output but skip JSON record creation.
                cleaned_lines.append("comm: " + (m_comm.group("body") or "").strip())
                continue
            mode = "commentry"
            body = (m_comm.group("body") or "").strip()
            cleaned_lines.append("comm: " + body)
            if body:
                cur.commentry_lines.append(body)
            continue

        m_head = HEADER_RE.match(line)
        if m_head:
            raw_id = (m_head.group("id") or "").strip()
            body = (m_head.group("body") or "").strip()

            flush()
            cur = Record(raw_id=raw_id, sutta_lines=[], commentry_lines=[])
            mode = "sutta"

            # Keep original header line in cleaned output; also store the body into sutta text.
            cleaned_lines.append(f"{raw_id} {body}".strip())
            cur.sutta_lines.append(f"{raw_id} {body}".strip())
            continue

        # Normal line (not comm, not header)
        cleaned_lines.append(line)
        if cur is None:
            continue
        if mode == "commentry":
            cur.commentry_lines.append(line)
        else:
            cur.sutta_lines.append(line)

    flush()

    # Normalize blank runs in cleaned output.
    normalized_cleaned: List[str] = []
    blank_run = 0
    for ln in cleaned_lines:
        if ln.strip():
            blank_run = 0
            normalized_cleaned.append(ln)
        else:
            blank_run += 1
            if blank_run <= 2:
                normalized_cleaned.append("")

    return normalized_cleaned, records


def main() -> None:
    raw = SRC_TXT.read_text(encoding="utf-8", errors="ignore")
    cleaned_lines, records = parse_book(raw)

    OUT_CLEAN_TXT.write_text("\n".join(cleaned_lines).rstrip() + "\n", encoding="utf-8")

    data = [r.to_json() for r in records]
    OUT_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote: {OUT_CLEAN_TXT} ({len(cleaned_lines)} lines)")
    print(f"Wrote: {OUT_JSON} ({len(data)} records)")


if __name__ == "__main__":
    main()

