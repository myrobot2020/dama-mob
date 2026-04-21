from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_ROOT = REPO_ROOT / "scripts2"

DATA_ROOT = REPO_ROOT / "data"
RAW_ROOT = DATA_ROOT / "raw"
EXAMPLES_ROOT = DATA_ROOT / "examples"
VALIDATED_JSON_ROOT = DATA_ROOT / "validated-json"
BOUNDS_CSV = RAW_ROOT / "bounds" / "sutta_bounds_an_folders.csv"
