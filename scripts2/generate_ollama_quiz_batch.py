from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any

from generate_ollama_quiz import (
    ROOT,
    build_prompt,
    call_ollama,
    normalize_sutta_id,
    validate_quiz,
)


QUALITY_RULES = """
Judge the MCQ as a mobile Dhamma learning item.

Accept only if:
- The gold answer reflects the teacher commentary, not only a surface phrase.
- Exactly one option is clearly best.
- Wrong options are plausible but meaningfully wrong, too narrow, or overstated.
- Wrong options do not merely restate true details from the sutta/commentary.
- The teacherSummary explains the teacher's point in simple language.
- The quiz does not invent claims not supported by the sutta/commentary.
- No placeholder option ids or generic titles.

Score:
90-100: publishable
75-89: usable after minor wording changes
60-74: needs revision
0-59: reject
""".strip()


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _natural_key(path: Path) -> tuple[int, ...]:
    return tuple(int(part) for part in path.stem.split(".") if part.isdigit()) or (0,)


def source_files_for_book(book: str) -> list[Path]:
    root = ROOT / "an" / f"an{book}"
    return sorted(root.glob("*.json"), key=_natural_key)


def hard_quality_score(quiz: dict[str, Any]) -> tuple[int, list[str]]:
    score = 100
    issues: list[str] = []
    options = quiz.get("options") if isinstance(quiz.get("options"), list) else []
    titles = [_text(option.get("title")) for option in options if isinstance(option, dict)]
    bodies = [_text(option.get("body")) for option in options if isinstance(option, dict)]
    ids = [_text(option.get("id")) for option in options if isinstance(option, dict)]

    if len(set(ids)) != 4:
        score -= 25
        issues.append("option ids are not unique")
    if any(oid in {"kebab-id", "option", "option-1", "id"} for oid in ids):
        score -= 25
        issues.append("placeholder option id")
    if len(set(title.lower() for title in titles)) != 4:
        score -= 15
        issues.append("option titles are not distinct")
    if any(len(title.split()) > 6 for title in titles):
        score -= 8
        issues.append("option title too long")
    if any(len(body.split()) < 6 for body in bodies):
        score -= 20
        issues.append("option body too short")
    if len(_text(quiz.get("teacherSummary")).split()) > 95:
        score -= 10
        issues.append("teacherSummary too long")
    if len(_text(quiz.get("quote")).split()) > 32:
        score -= 8
        issues.append("quote too long")
    body_words = [set(body.lower().split()) for body in bodies]
    for i in range(len(body_words)):
        for j in range(i + 1, len(body_words)):
            small = min(len(body_words[i]), len(body_words[j]))
            if small and len(body_words[i] & body_words[j]) / small > 0.72:
                score -= 10
                issues.append("options overlap too much")
                return max(score, 0), issues
    return max(score, 0), issues


def build_judge_prompt(raw: dict[str, Any], quiz: dict[str, Any]) -> str:
    return f"""
{QUALITY_RULES}

Return ONLY valid JSON:
{{
  "score": 0,
  "verdict": "accept|revise|reject",
  "issues": ["short issue"],
  "advice": "one short instruction for revision"
}}

SUTTA:
{_text(raw.get("sutta"))}

TEACHER COMMENTARY:
{_text(raw.get("commentary") or raw.get("commentry"))}

QUIZ:
{json.dumps(quiz, ensure_ascii=False, indent=2)}
""".strip()


def build_revise_prompt(raw: dict[str, Any], quiz: dict[str, Any], judge: dict[str, Any]) -> str:
    return f"""
Revise this MCQ using the judge feedback. Return ONLY the corrected quiz JSON.

Keep this exact JSON shape:
{{
  "suttaId": "AN {_text(raw.get("sutta_id"))}",
  "quote": "short quote or faithful paraphrase, max 28 words",
  "options": [
    {{"id": "descriptive-kebab-id", "title": "2-5 words", "body": "one short sentence"}},
    {{"id": "descriptive-kebab-id", "title": "2-5 words", "body": "one short sentence"}},
    {{"id": "descriptive-kebab-id", "title": "2-5 words", "body": "one short sentence"}},
    {{"id": "descriptive-kebab-id", "title": "2-5 words", "body": "one short sentence"}}
  ],
  "goldOptionId": "id of the teacher-aligned option",
  "teacherSummary": "2-4 sentences, under 90 words"
}}

Quality rules:
{QUALITY_RULES}

Judge feedback:
{json.dumps(judge, ensure_ascii=False, indent=2)}

SUTTA:
{_text(raw.get("sutta"))}

TEACHER COMMENTARY:
{_text(raw.get("commentary") or raw.get("commentry"))}

CURRENT QUIZ:
{json.dumps(quiz, ensure_ascii=False, indent=2)}
""".strip()


def judge_quiz(raw: dict[str, Any], quiz: dict[str, Any], model: str, url: str, timeout_s: int) -> dict[str, Any]:
    hard_score, hard_issues = hard_quality_score(quiz)
    response = call_ollama(build_judge_prompt(raw, quiz), model, url, timeout_s)
    try:
        judged = json.loads(response)
    except json.JSONDecodeError:
        judged = {"score": 0, "verdict": "reject", "issues": ["judge returned invalid JSON"], "advice": ""}
    model_score = int(judged.get("score") or 0)
    issues = list(judged.get("issues") or [])
    judged["score"] = min(hard_score, model_score)
    judged["hardScore"] = hard_score
    judged["issues"] = [*hard_issues, *[str(issue) for issue in issues]]
    if judged["score"] >= 85:
        judged["verdict"] = "accept"
    elif judged["score"] >= 70:
        judged["verdict"] = "revise"
    else:
        judged["verdict"] = "reject"
    return judged


def generate_one(
    path: Path,
    generate_model: str,
    judge_model: str,
    url: str,
    timeout_s: int,
    attempts: int,
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    prompt = build_prompt(raw)
    last_quiz: dict[str, Any] | None = None
    last_judge: dict[str, Any] = {"score": 0, "verdict": "reject", "issues": ["not started"]}

    for attempt in range(1, attempts + 1):
        response = call_ollama(prompt, generate_model, url, timeout_s)
        quiz = validate_quiz(json.loads(response))
        judge = judge_quiz(raw, quiz, judge_model, url, timeout_s)
        last_quiz = quiz
        last_judge = {**judge, "attempt": attempt}
        if judge["verdict"] == "accept":
            return quiz, last_judge
        prompt = build_revise_prompt(raw, quiz, judge)

    return last_quiz if last_judge.get("score", 0) >= 85 else None, last_judge


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch-generate and locally judge MCQ JSON with Ollama.")
    parser.add_argument("--book", default="2", help="AN book number, e.g. 2")
    parser.add_argument("--limit", type=int, default=0, help="Optional max files")
    parser.add_argument("--generate-model", default="dolphin3:latest")
    parser.add_argument("--judge-model", default="llama3:latest")
    parser.add_argument("--url", default="http://localhost:11434/api/generate")
    parser.add_argument("--timeout-s", type=int, default=240)
    parser.add_argument("--attempts", type=int, default=2)
    parser.add_argument("--merge-source", action="store_true")
    parser.add_argument("--out-dir", default="data/generated/ollama-quizzes")
    args = parser.parse_args()

    files = source_files_for_book(args.book)
    if args.limit > 0:
        files = files[: args.limit]

    out_dir = Path(args.out_dir) / "an" / f"an{args.book}"
    accepted_dir = out_dir / "accepted"
    review_dir = out_dir / "needs-review"
    failed_dir = out_dir / "failed"
    for directory in (accepted_dir, review_dir, failed_dir):
        directory.mkdir(parents=True, exist_ok=True)

    report: list[dict[str, Any]] = []
    start = time.time()
    for idx, path in enumerate(files, start=1):
        sid = f"AN {path.stem}"
        print(f"[{idx}/{len(files)}] {sid}")
        try:
            quiz, judge = generate_one(
                path,
                args.generate_model,
                args.judge_model,
                args.url,
                args.timeout_s,
                args.attempts,
            )
            score = int(judge.get("score") or 0)
            if quiz and score >= 85:
                target = accepted_dir / f"{path.stem}.json"
                target.write_text(json.dumps(quiz, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                if args.merge_source:
                    raw = json.loads(path.read_text(encoding="utf-8"))
                    raw["quiz"] = quiz
                    path.write_text(json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                status = "accepted"
            elif quiz:
                target = review_dir / f"{path.stem}.json"
                target.write_text(json.dumps({"quiz": quiz, "judge": judge}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                status = "needs_review"
            else:
                target = failed_dir / f"{path.stem}.json"
                target.write_text(json.dumps({"judge": judge}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                status = "failed"
            print(f"  {status} score={score} issues={'; '.join(judge.get('issues') or [])[:180]}")
            report.append({"suttaId": sid, "status": status, "score": score, "judge": judge})
        except Exception as exc:
            print(f"  failed error={exc}")
            report.append({"suttaId": sid, "status": "failed", "score": 0, "error": str(exc)})

    summary = {
        "book": args.book,
        "count": len(files),
        "accepted": sum(1 for row in report if row["status"] == "accepted"),
        "needs_review": sum(1 for row in report if row["status"] == "needs_review"),
        "failed": sum(1 for row in report if row["status"] == "failed"),
        "elapsed_s": round(time.time() - start, 1),
        "rows": report,
    }
    report_path = out_dir / "report.json"
    report_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in summary.items() if k != "rows"}, ensure_ascii=False, indent=2))
    print(f"Report: {report_path}")
    return 0 if summary["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
