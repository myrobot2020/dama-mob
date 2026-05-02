# AI Generation

AI generation in docs2 covers pipeline-generated learning artifacts:

```text
MCQ
vocab
technique
image tags if model-assisted
reflection/harness outputs in the app
```

## Core Rule

Generated content must be grounded in source artifacts.

```text
No source segment, no sealed generated claim.
```

## Generated Artifacts

| Artifact | Source Inputs | Required Trace |
|---|---|---|
| `mcq.json` | Segments, sutta text/commentary | Model, prompt version, input hash, source segments |
| `vocab.json` | Segments, sutta text/commentary | Model, prompt version, input hash, source segments |
| `technique.json` | Segments, sutta text/commentary | Model, prompt version, input hash, source segments |
| Image tags | Panel image/OCR/metadata | Model/tool version, image hash |
| Reflection output | User-selected/read suttas | Model, retrieved source IDs, safety metadata |

## Generation Run Record

Every generated artifact should record:

```json
{
  "generation_id": "gen_...",
  "artifact_type": "mcq",
  "sutta_id": "AN1.1",
  "model": "model-name",
  "prompt_version": "mcq-v1",
  "input_hash": "sha256:...",
  "source_segment_ids": ["AN1.1.seg001"],
  "created_at": "2026-05-01T00:00:00Z",
  "review_status": "pending"
}
```

## Prompt Versioning

Prompt changes must be versioned.

```text
mcq-v1
vocab-v1
technique-v1
image-tag-v1
reflection-v1
```

If prompt changes alter output behavior, regenerate with a new artifact version or new run.

## Safety Rules

| Rule | Applies To |
|---|---|
| Keep model keys server-side | All AI calls |
| Store metadata, not giant raw prompts forever | Tracing |
| Generated text must cite/source segment IDs | MCQ/vocab/technique/reflection |
| Low-confidence or unsupported output goes to review | All generated artifacts |
| User private reflections stay private | Reflection |
| Do not present generated commentary as canon | App output |

## Validation Rules

Generated artifacts must pass:

```text
schema validation
source_segment_ids exist
answer option exists for MCQ
no empty prompt/options/explanation
no unsupported source references
model and prompt_version recorded
input_hash recorded
```

## Human Review

Send to review if:

```text
generation is ungrounded
answer is ambiguous
technique is too broad or unsafe
vocab definition lacks source support
model output violates schema
```

## Existing AI Context From Old Docs

Old docs note:

```text
primary AI use case: grounded reflection
secondary AI use cases: corpus search, quiz generation/review, progress insight, translation/data pipeline support
OpenAI/Gemini calls should be server-side
trace events should be bounded and privacy-aware
```

Docs2 extends that into the data plant by treating generated content as artifacts with lineage.

