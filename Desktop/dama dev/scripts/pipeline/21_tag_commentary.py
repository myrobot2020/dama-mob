#!/usr/bin/env python3
"""
Uses an LLM (Ollama) to tag commentary sections in validated JSON files.
Tags: interpretation, other sects teaching, cautions, practices.
"""

from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

# Resolve repo root relative to this script
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MODEL = "qwen2.5:14b"
DEFAULT_OLLAMA_URL = "http://localhost:11434/api/generate"

# The tags requested
TAGS = [
    "interpretation",
    "other sects teaching",
    "cautions",
    "practices",
]

def build_prompt(commentary: str) -> str:
    """Build the prompt for the LLM to identify commentary tags."""
    return f"""
Analyze the teacher commentary below and identify which of these categories it contains.
Return ONLY a JSON object with a "tags" key containing a list of matching categories.

Categories:
1. interpretation: Explanations, deep dives into meanings, or clarifying the sutta.
2. other sects teaching: Mentions, comparisons, or critiques of what other religions, sects, or "wrong views" teach.
3. cautions: Warnings about pitfalls, wrong practice, dangers, or things to avoid.
4. practices: Specific instructions, methods, or advice on how to practice or apply the teaching in daily life.

If none apply, return an empty list.

COMMENTARY:
{commentary}

RESPONSE FORMAT:
{{
  "tags": ["tag1", "tag2"]
}}
""".strip()

def call_ollama(prompt: str, model: str, url: str, timeout_s: int) -> list[str]:
    """Call the local Ollama API to get tags for the commentary."""
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {
            "temperature": 0.0,
            "num_ctx": 8192,
        },
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            outer = json.loads(resp.read().decode("utf-8"))
            response_text = outer.get("response", "{}")
            result = json.loads(response_text)
            tags = result.get("tags", [])
            # Normalize, filter to valid tags, and sort
            valid_tags = sorted(list(set(t.strip().lower() for t in tags if t.strip().lower() in TAGS)))
            return valid_tags
    except Exception as exc:
        print(f"Error calling Ollama: {exc}")
        return []

def process_file(path: Path, args: argparse.Namespace):
    """Load a JSON file, get tags from LLM, and update the file."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"Failed to read {path}: {e}")
        return

    # Look for commentary (handle potential typo in field name)
    commentary = (data.get("commentary") or data.get("commentry") or "").strip()
    if not commentary:
        return

    # Skip if already tagged unless --force is used
    if not args.force and "commentary_tags" in data:
        return

    print(f"Tagging {path.relative_to(REPO_ROOT)}...")
    prompt = build_prompt(commentary)
    tags = call_ollama(prompt, args.model, args.url, args.timeout_s)

    data["commentary_tags"] = tags
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"  Tags identified: {', '.join(tags) if tags else 'none'}")

def main():
    parser = argparse.ArgumentParser(description="Tag commentary in validated JSON files using Ollama.")
    parser.add_argument("--input", default="data/validated-json", help="Input directory or file relative to repo root")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--url", default=DEFAULT_OLLAMA_URL)
    parser.add_argument("--timeout-s", type=int, default=180)
    parser.add_argument("--force", action="store_true", help="Re-tag even if tags already exist")
    args = parser.parse_args()

    input_path = REPO_ROOT / args.input
    if input_path.is_file():
        process_file(input_path, args)
    elif input_path.is_dir():
        # Recursively find all JSON files, skipping index and metadata files
        for json_file in sorted(input_path.rglob("*.json")):
            if json_file.name.startswith("_") or json_file.name == "index.json":
                continue
            process_file(json_file, args)
    else:
        print(f"Path not found: {input_path}")

if __name__ == "__main__":
    main()
