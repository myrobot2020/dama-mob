from __future__ import annotations

import argparse
import importlib.util
import os
import sys
from contextlib import contextmanager
from pathlib import Path

from config import BOUNDS_CSV, EXAMPLES_ROOT, REPO_ROOT, SCRIPTS_ROOT, VALIDATED_JSON_ROOT


_MODULE_CACHE: dict[Path, object] = {}


@contextmanager
def _pushd(path: Path):
    prev = Path.cwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(prev)


def _load_module(script: Path) -> object:
    cached = _MODULE_CACHE.get(script)
    if cached is not None:
        return cached
    mod_name = f"_scripts2_{script.stem}"
    spec = importlib.util.spec_from_file_location(mod_name, str(script))
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load module for {script}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[mod_name] = module
    spec.loader.exec_module(module)
    _MODULE_CACHE[script] = module
    return module


def run_py(script: Path, *args: str) -> int:
    module = _load_module(script)
    if not hasattr(module, "main"):
        print(f"[scripts2] {script.name}: no main() found")
        return 1
    prev_argv = sys.argv[:]
    sys.argv = [str(script), *args]
    try:
        with _pushd(REPO_ROOT):
            result = module.main()
    except SystemExit as exc:
        code = exc.code
        return int(code) if isinstance(code, int) else 1
    finally:
        sys.argv = prev_argv
    return int(result) if isinstance(result, int) else 0


def run_download(sn_only: bool = False) -> int:
    code = run_py(SCRIPTS_ROOT / "01_download.py", "--manifest-only")
    if code != 0:
        return code
    if sn_only:
        return 0
    return run_py(SCRIPTS_ROOT / "02_download_samples.py", "--limit", "2")


def run_identification(dry_run: bool = False) -> int:
    extra = ["--dry-run"] if dry_run else []
    return run_py(SCRIPTS_ROOT / "03_identify.py", "--skip-subs", *extra)


def run_segmentation(limit: int = 0) -> int:
    split_dir = str(EXAMPLES_ROOT / "sn_heuristic_split")
    seg_dir = str(EXAMPLES_ROOT / "sn" / "SN segmentation")
    segmented_dir = str(EXAMPLES_ROOT / "sn" / "SN segmentation" / "segmented")
    code = run_py(
        SCRIPTS_ROOT / "04_segment_split.py",
        *(["--limit", str(limit)] if limit > 0 else []),
    )
    if code != 0:
        return code
    code = run_py(
        SCRIPTS_ROOT / "05_segment_commentary.py",
        "--input",
        split_dir,
        "--output",
        seg_dir,
    )
    if code != 0:
        return code
    code = run_py(
        SCRIPTS_ROOT / "06_segment_collect.py",
        "--input",
        seg_dir,
        "--output",
        segmented_dir,
    )
    if code != 0:
        return code
    return run_py(
        SCRIPTS_ROOT / "07_segment_bounds.py",
        seg_dir,
        str(BOUNDS_CSV),
        "--replace-prefix",
        "data\\examples\\sn\\",
        "--replace-prefix",
        "sn\\",
    )


def run_linking() -> int:
    sn_audio = EXAMPLES_ROOT / "sn" / "audio"
    segmented_dir = str(EXAMPLES_ROOT / "sn" / "SN segmentation" / "segmented")
    playlist = str(EXAMPLES_ROOT / "sn" / "playlist_full.json")
    output = str(EXAMPLES_ROOT / "sn" / "SN audio mapping")
    audio_dir = str(sn_audio if sn_audio.is_dir() else (REPO_ROOT / "aud"))
    return run_py(
        SCRIPTS_ROOT / "08_link_audio.py",
        "--segmented",
        segmented_dir,
        "--playlist",
        playlist,
        "--audio-dir",
        audio_dir,
        "--output",
        output,
        "--bounds-csv",
        str(BOUNDS_CSV),
    )


def run_keys(
    *,
    model: str = "llama3.2:3b",
    book: str | None = None,
    books: str | None = None,
    pattern: str | None = None,
    dry_run: bool = False,
) -> int:
    selector: list[str] = []
    if book:
        selector += ["--book", book]
    if books:
        selector += ["--books", books]
    if pattern:
        selector += ["--pattern", pattern]
    if not selector:
        print("[scripts2] keys: skipped (provide --book/--books/--pattern to run extraction)")
        return 0
    extra = ["--dry-run"] if dry_run else []
    return run_py(SCRIPTS_ROOT / "10_keys.py", "--model", model, *selector, *extra)


def run_names() -> int:
    return run_py(SCRIPTS_ROOT / "09_names.py")


def run_cleaning() -> int:
    return run_py(SCRIPTS_ROOT / "11_clean.py")


def run_validation() -> int:
    code = run_py(SCRIPTS_ROOT / "12_validate.py")
    if code != 0:
        return code
    val_root = VALIDATED_JSON_ROOT
    if not val_root.is_dir():
        print("[scripts2] validation: no validated-json folder found, skipping rebuild.")
        return 0

    # Iterate through all nikayas and their book folders
    for nk_dir in sorted(val_root.iterdir()):
        if not nk_dir.is_dir():
            continue
        nikaya = nk_dir.name
        for book_dir in sorted(nk_dir.iterdir()):
            if not book_dir.is_dir():
                continue
            book = book_dir.name
            code = run_py(SCRIPTS_ROOT / "13_rebuild.py", nikaya, book)
            if code != 0:
                return code
    return 0


def run_tally() -> int:
    return run_py(SCRIPTS_ROOT / "14_tally.py")


ORDER = [
    "download",
    "identification",
    "segmentation",
    "linking",
    "names",
    "keys",
    "cleaning",
    "validation",
    "tally",
]


def run_all(from_stage: str = "download", to_stage: str = "tally") -> int:
    start = ORDER.index(from_stage)
    end = ORDER.index(to_stage)
    if end < start:
        print(f"[scripts2] invalid stage range: {from_stage} -> {to_stage}")
        return 2
    for stage in ORDER[start : end + 1]:
        print(f"[scripts2] running {stage}.py")
        if stage == "download":
            code = run_download()
        elif stage == "identification":
            code = run_identification()
        elif stage == "segmentation":
            code = run_segmentation()
        elif stage == "linking":
            code = run_linking()
        elif stage == "names":
            code = run_names()
        elif stage == "keys":
            code = run_keys()
        elif stage == "cleaning":
            code = run_cleaning()
        elif stage == "validation":
            code = run_validation()
        else:
            code = run_tally()
        if code != 0:
            print(f"[scripts2] stopped at {stage}.py (exit={code})")
            return code
    print("[scripts2] done")
    return 0


def parse_run_all_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Run full scripts2 pipeline")
    ap.add_argument("--from-stage", default="download", choices=ORDER)
    ap.add_argument("--to-stage", default="tally", choices=ORDER)
    return ap.parse_args()


def main() -> int:
    args = parse_run_all_args()
    return run_all(from_stage=args.from_stage, to_stage=args.to_stage)


if __name__ == "__main__":
    raise SystemExit(main())
