# Artifact Contracts

Artifacts are durable files produced by pipeline stages.

Important rule:

```text
If a stage is expensive, meaningful, or reviewable, it writes an artifact.
```

The local DB stores artifact records and status. The artifact files hold the stage output.

## Artifact Envelope

Every JSON artifact should include this metadata:

```json
{
  "schema_version": "v1",
  "artifact_type": "transcript",
  "artifact_id": "art_...",
  "sutta_id": "AN1.1",
  "source_ids": ["youtube:abc123"],
  "pipeline_run_id": "run_...",
  "created_at": "2026-05-01T00:00:00Z",
  "created_by": "transcription_subscriber",
  "input_hashes": {
    "audio": "sha256:..."
  },
  "content": {}
}
```

## Required Artifact Metadata

| Field | Required | Meaning |
|---|---:|---|
| `schema_version` | Yes | Artifact schema version |
| `artifact_type` | Yes | Transcript, segments, MCQ, etc. |
| `artifact_id` | Yes | Stable artifact identifier |
| `sutta_id` | Usually | Canonical sutta ID when known |
| `source_ids` | Yes | Source inputs used |
| `pipeline_run_id` | Yes | Run that created it |
| `created_at` | Yes | UTC creation time |
| `created_by` | Yes | Worker or UI that created it |
| `input_hashes` | Yes | Reproducibility and idempotency |
| `content` | Yes | Artifact-specific payload |

## Main Sutta Artifact Set

| File | Producer | Purpose | Required To Seal |
|---|---|---|---:|
| `manifest.json` | Seal subscriber | Seal inventory, counts, checksums | Yes |
| `source.json` | Sutta feed handler | Normalized source metadata | Yes |
| `audio.json` | Download subscriber | Audio/video file metadata | Yes if audio-backed |
| `transcript.json` | Transcription subscriber | Text transcript with metadata | Yes for audio-backed pipeline |
| `sutta_match.json` | Sutta match subscriber | Canonical sutta ID confidence | Yes |
| `segments.json` | Segmentation subscriber | Commentary/text segments | Yes |
| `audio_timestamps.json` | Audio timestamp subscriber | Start/end times per segment | Yes if audio-backed |
| `mcq.json` | Generation subscriber | Multiple-choice content | Yes for learning package |
| `vocab.json` | Generation subscriber | Vocab/explanation items | Yes for learning package |
| `technique.json` | Generation subscriber | Practice technique | Yes for learning package |
| `images.json` | Image match subscriber | Approved/attached images | Yes if image package enabled |
| `validation.json` | Validation subscriber | Validation results | Yes |

## Source Artifact

`source.json` records what entered the plant.

```json
{
  "schema_version": "v1",
  "artifact_type": "source",
  "sutta_id": "AN1.1",
  "content": {
    "source_id": "youtube:abc123",
    "source_type": "youtube",
    "source_url": "https://youtube.com/watch?v=abc123",
    "nikaya": "AN",
    "book": "1",
    "sutta_hint": "AN1.1",
    "license": null,
    "source_title": "..."
  }
}
```

## Audio Artifact

`audio.json` points to local audio before seal and sealed audio metadata after seal.

```json
{
  "schema_version": "v1",
  "artifact_type": "audio",
  "sutta_id": "AN1.1",
  "content": {
    "local_path": "data/work/audio/AN1.1/source.mp3",
    "duration_s": 312.4,
    "mime_type": "audio/mpeg",
    "sha256": "..."
  }
}
```

## Transcript Artifact

```json
{
  "schema_version": "v1",
  "artifact_type": "transcript",
  "sutta_id": "AN1.1",
  "content": {
    "language": "en",
    "transcript_text": "...",
    "segments": [
      {
        "transcript_segment_id": "tr_001",
        "text": "...",
        "start_s": 0.0,
        "end_s": 8.2,
        "confidence": 0.91
      }
    ]
  }
}
```

## Sutta Match Artifact

```json
{
  "schema_version": "v1",
  "artifact_type": "sutta_match",
  "sutta_id": "AN1.1",
  "content": {
    "matched_sutta_id": "AN1.1",
    "nikaya": "AN",
    "book": "1",
    "method": "title_text_similarity",
    "confidence": 0.94,
    "alternates": [
      {
        "sutta_id": "AN1.2",
        "confidence": 0.31
      }
    ],
    "review_status": "approved"
  }
}
```

## Segments Artifact

```json
{
  "schema_version": "v1",
  "artifact_type": "segments",
  "sutta_id": "AN1.1",
  "content": {
    "segments": [
      {
        "segment_id": "AN1.1.seg001",
        "kind": "commentary",
        "text": "...",
        "text_ref": "AN1.1.p1",
        "order": 1
      }
    ]
  }
}
```

## Audio Timestamps Artifact

Audio timestamps are first-class.

```json
{
  "schema_version": "v1",
  "artifact_type": "audio_timestamps",
  "sutta_id": "AN1.1",
  "content": {
    "audio_source_id": "youtube:abc123",
    "segments": [
      {
        "segment_id": "AN1.1.seg001",
        "start_s": 12.4,
        "end_s": 25.9,
        "confidence": 0.91,
        "review_status": "pending"
      }
    ]
  }
}
```

Validation rules:

```text
start_s >= 0
end_s > start_s
segments are monotonic unless overlap is explicitly allowed
segment_id exists in segments.json
timestamps fit within audio duration
low confidence creates review item
```

## MCQ Artifact

```json
{
  "schema_version": "v1",
  "artifact_type": "mcq",
  "sutta_id": "AN1.1",
  "content": {
    "questions": [
      {
        "question_id": "AN1.1.mcq001",
        "prompt": "...",
        "options": [
          {"option_id": "A", "text": "..."},
          {"option_id": "B", "text": "..."}
        ],
        "answer_option_id": "A",
        "explanation": "...",
        "source_segment_ids": ["AN1.1.seg001"]
      }
    ]
  }
}
```

## Vocab Artifact

```json
{
  "schema_version": "v1",
  "artifact_type": "vocab",
  "sutta_id": "AN1.1",
  "content": {
    "items": [
      {
        "vocab_id": "AN1.1.vocab001",
        "term": "...",
        "definition": "...",
        "source_segment_ids": ["AN1.1.seg001"]
      }
    ]
  }
}
```

## Technique Artifact

```json
{
  "schema_version": "v1",
  "artifact_type": "technique",
  "sutta_id": "AN1.1",
  "content": {
    "techniques": [
      {
        "technique_id": "AN1.1.tech001",
        "title": "...",
        "steps": ["...", "..."],
        "source_segment_ids": ["AN1.1.seg001"]
      }
    ]
  }
}
```

## Images Artifact

```json
{
  "schema_version": "v1",
  "artifact_type": "images",
  "sutta_id": "AN1.1",
  "content": {
    "images": [
      {
        "image_id": "img_...",
        "source_book_id": "buddha_book_001",
        "page": 12,
        "panel_id": "panel_...",
        "local_path": "data/work/images/panel_001.png",
        "selected_by": "operator",
        "selection_reason": "fits theme",
        "source_segment_ids": ["AN1.1.seg001"],
        "review_status": "approved"
      }
    ]
  }
}
```

## Local Artifact Layout

Suggested local work layout:

```text
data/work/
  runs/<pipeline_run_id>/
  artifacts/nikaya=AN/book=01/sutta=AN1.1/
    source.json
    audio.json
    transcript.json
    sutta_match.json
    segments.json
    audio_timestamps.json
    mcq.json
    vocab.json
    technique.json
    images.json
    validation.json
  images/
    books/
    pages/
    panels/
    thumbnails/
```

