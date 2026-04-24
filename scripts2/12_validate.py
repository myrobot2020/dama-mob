#!/usr/bin/env python3
"""Set `valid` on each nikaya/*/*.json.

`valid: true` is used as a "ready for prime time" signal for the app/index.
In practice this requires a publishable audio artifact name (mp3/m4a) and
consistent audio bounds.
"""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from collections import defaultdict
from pathlib import Path


def _extract_chain_mod():
    root = Path(__file__).resolve().parents[1]
    spec = importlib.util.spec_from_file_location(
        "keys",
        root / "scripts2" / "10_keys.py",
    )
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules["keys"] = mod
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    mod = _extract_chain_mod()
    is_record_valid = mod.is_record_valid
    atomic_write_json = mod.atomic_write_json
    root = Path(__file__).resolve().parents[1]
    val_root = root / "data" / "validated-json"
    audio_ext_ok = re.compile(r"\.(mp3|m4a|wav)$", re.IGNORECASE)

    # Find all JSON files in any nikaya subfolder recursively
    paths = sorted(
        p
        for p in val_root.rglob("*.json")
        if p.is_file() and p.name != "_index.json" and not p.name.startswith("_")
    )

    updated = 0
    stats = defaultdict(lambda: {"true": 0, "false": 0}) # nikaya -> stats

    for path in paths:
        # path is data/validated-json/{nikaya}/...
        rel = path.relative_to(val_root)
        nikaya = rel.parts[0]
        try:
            obj = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            print(f"skip {path}: {exc}", file=sys.stderr)
            continue
        if not isinstance(obj, dict):
            continue

        v = is_record_valid(obj)
        if v:
            aud_file = str(obj.get("aud_file") or "").strip()
            if not audio_ext_ok.search(aud_file):
                v = False
            else:
                try:
                    start = float(obj.get("aud_start_s"))
                    end = float(obj.get("aud_end_s"))
                except Exception:
                    v = False
                else:
                    if not (end > start):
                        v = False
        stats[nikaya]["true" if v else "false"] += 1

        if obj.get("valid") is v:
            continue
        obj["valid"] = v
        atomic_write_json(path, obj)
        updated += 1

    print(f"updated {updated} of {len(paths)} sutta JSON files")
    print("per nikaya (valid true / valid false / total):")
    for nk in sorted(stats):
        d = stats[nk]
        t, f = d["true"], d["false"]
        print(f"  {nk}: {t} / {f} / {t + f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
