#!/usr/bin/env python3
"""Set `valid` on each nikaya/*/*.json."""

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
    an_record_valid = mod.an_record_valid
    atomic_write_json = mod.atomic_write_json
    root = Path(__file__).resolve().parents[1]
    val_root = root / "data" / "validated-json"

    # Find all JSON files in any nikaya/book subfolder
    paths = sorted(
        p
        for p in val_root.glob("*/*/*.json")
        if p.is_file() and p.name != "_index.json" and not p.name.startswith("_")
    )

    updated = 0
    stats = defaultdict(lambda: {"true": 0, "false": 0}) # nikaya -> stats

    for path in paths:
        # path is data/validated-json/{nikaya}/{book}/{sutta}.json
        nikaya = path.parent.parent.name
        try:
            obj = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            print(f"skip {path}: {exc}", file=sys.stderr)
            continue
        if not isinstance(obj, dict):
            continue

        v = an_record_valid(obj)
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
