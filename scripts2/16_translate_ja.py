#!/usr/bin/env python3
"""Translate validated English corpus records to Japanese with local engines.

This script is designed to be cheap to import and test. Heavy translation
libraries are imported only when the selected engine needs them.
"""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

REPO = Path(__file__).resolve().parents[1]
VALIDATED_ROOT = REPO / "data" / "validated-json"
TRANSLATION_ROOT = REPO / "data" / "translations" / "ja"
GLOSSARY_PATH = REPO / "data" / "glossaries" / "en-ja.tsv"


@dataclass(frozen=True)
class CorpusRecord:
    path: Path
    sutta_id: str
    data: dict[str, Any]


class Translator(Protocol):
    engine: str
    model: str

    def translate(self, text: str) -> str:
        ...


class EchoTranslator:
    engine = "echo"
    model = "none"

    def translate(self, text: str) -> str:
        return text


class NllbTranslator:
    engine = "nllb"

    def __init__(self, model: str, offline: bool) -> None:
        self.model = model
        try:
            from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        except ImportError as exc:
            raise SystemExit(
                "Missing local NLLB dependencies. Install with: "
                "python -m pip install torch transformers sentencepiece"
            ) from exc

        kwargs = {"local_files_only": offline}
        try:
            self.tokenizer = AutoTokenizer.from_pretrained(model, src_lang="eng_Latn", **kwargs)
            self.translator = AutoModelForSeq2SeqLM.from_pretrained(model, **kwargs)
        except OSError as exc:
            if offline:
                raise SystemExit(
                    f"Model is not cached locally yet: {model}\n"
                    "Run once without --offline to download it, then use --offline for no-network runs."
                ) from exc
            raise
        self.forced_bos_token_id = self.tokenizer.convert_tokens_to_ids("jpn_Jpan")

    def translate(self, text: str) -> str:
        pieces = []
        for chunk in chunk_text(text):
            encoded = self.tokenizer(chunk, return_tensors="pt", truncation=True, max_length=512)
            generated = self.translator.generate(
                **encoded,
                forced_bos_token_id=self.forced_bos_token_id,
                max_new_tokens=512,
            )
            pieces.append(self.tokenizer.batch_decode(generated, skip_special_tokens=True)[0])
        return "\n".join(pieces)


def load_glossary(path: Path = GLOSSARY_PATH) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle, delimiter="\t"))


def chunk_text(text: str, max_chars: int = 900) -> list[str]:
    clean = re.sub(r"\s+", " ", text).strip()
    if not clean:
        return []
    sentences = re.split(r"(?<=[.!?。！？])\s+", clean)
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        if not sentence:
            continue
        if len(sentence) > max_chars:
            if current:
                chunks.append(current.strip())
                current = ""
            for start in range(0, len(sentence), max_chars):
                chunks.append(sentence[start : start + max_chars].strip())
            continue
        if current and len(current) + 1 + len(sentence) > max_chars:
            chunks.append(current.strip())
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
    if current:
        chunks.append(current.strip())
    return chunks


def sutta_id_from_path(path: Path) -> str:
    return path.stem.lower()


def output_path_for(path: Path) -> Path:
    rel = path.relative_to(VALIDATED_ROOT)
    return TRANSLATION_ROOT / rel.with_suffix(".ja.json")


def iter_records(
    sutta_id: str | None,
    include_invalid: bool,
) -> list[CorpusRecord]:
    records: list[CorpusRecord] = []
    for path in sorted(VALIDATED_ROOT.rglob("*.json")):
        if path.name.startswith("_") or path.name == "index.json":
            continue
        sid = sutta_id_from_path(path)
        if sutta_id and sid != sutta_id.lower():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            print(f"skip invalid json {path}: {exc}", file=sys.stderr)
            continue
        if not isinstance(data, dict):
            continue
        if not include_invalid and data.get("valid") is not True:
            continue
        if not str(data.get("sutta") or data.get("commentary") or "").strip():
            continue
        records.append(CorpusRecord(path=path, sutta_id=sid, data=data))
    return records


def build_translator(args: argparse.Namespace) -> Translator:
    if args.engine == "echo":
        return EchoTranslator()
    if args.engine == "nllb":
        return NllbTranslator(args.model, args.offline)
    raise SystemExit(f"unknown engine: {args.engine}")


def translate_record(record: CorpusRecord, translator: Translator) -> dict[str, Any]:
    source_fields = {
        "sutta": str(record.data.get("sutta") or "").strip(),
        "commentary": str(record.data.get("commentary") or "").strip(),
    }
    translated_fields = {
        key: translator.translate(value) if value else ""
        for key, value in source_fields.items()
    }
    return {
        "sutta_id": record.sutta_id,
        "source_path": str(record.path.relative_to(REPO)).replace("\\", "/"),
        "language": "ja",
        "engine": translator.engine,
        "model": translator.model,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": source_fields,
        "translation": translated_fields,
        "glossary": load_glossary(),
    }


def atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def check_dependencies() -> int:
    checks = {
        "torch": importlib.util.find_spec("torch") is not None,
        "transformers": importlib.util.find_spec("transformers") is not None,
        "sentencepiece": importlib.util.find_spec("sentencepiece") is not None,
    }
    for name, ok in checks.items():
        print(f"{name}: {'ok' if ok else 'missing'}")
    if not all(checks.values()):
        print("install: python -m pip install torch transformers sentencepiece")
        return 1
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Translate validated corpus records to Japanese locally.")
    parser.add_argument("--engine", choices=["echo", "nllb"], default="echo")
    parser.add_argument("--model", default="facebook/nllb-200-distilled-600M")
    parser.add_argument("--offline", action="store_true", help="Require model files to exist locally.")
    parser.add_argument("--sutta-id", help="Translate one sutta id, e.g. an1.48 uses 1.48.")
    parser.add_argument("--include-invalid", action="store_true")
    parser.add_argument("--limit", type=int, help="Maximum records to translate.")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--dry-run", action="store_true", help="Show matching outputs without writing files.")
    parser.add_argument("--check", action="store_true", help="Check local translation dependencies and exit.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.check:
        return check_dependencies()

    records = iter_records(args.sutta_id, args.include_invalid)
    if args.limit is not None:
        records = records[: args.limit]
    if not records:
        print("no matching records")
        return 0

    if args.dry_run:
        for record in records:
            out = output_path_for(record.path)
            print(f"would write {out.relative_to(REPO)}")
        print(f"done: written=0, skipped=0, engine={args.engine}")
        return 0

    translator = build_translator(args)
    written = 0
    skipped = 0
    for record in records:
        out = output_path_for(record.path)
        if out.exists() and not args.overwrite:
            skipped += 1
            print(f"skip existing {out.relative_to(REPO)}")
            continue
        payload = translate_record(record, translator)
        atomic_write_json(out, payload)
        written += 1
        print(f"wrote {out.relative_to(REPO)}")

    print(f"done: written={written}, skipped={skipped}, engine={translator.engine}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
