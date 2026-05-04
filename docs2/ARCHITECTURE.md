# Architecture

Docs2 architecture is based on the "Factory Mode" tickerplant diagram:

![Dama data plant diagram](../docs/data-plant-diagram-spread.png)

## One-Line Shape

```text
Local tickerplant-style data plant for batch processing (Factory Mode), using GCS as the sealed historical store.
```

## System Flow (Factory Waves)

Processing is organized into resource-aligned waves to maximize throughput:

1.  **Wave 1: Parallel CPU**
    - High-concurrency I/O (Downloads, Panel Extraction).
    - Prefetches data for the GPU.
2.  **Wave 2: Sequential GPU**
    - High-VRAM inference (LLM Generation, Translation, TTS).
    - Uses a single GPU lock to avoid thermal throttling and context swapping.
3.  **Wave 3: The Weaver & Seal**
    - Assembly of "AI Bones" into the final validated Sutta artifact.
    - Sealing to GCS and rebuilding the production index.

## The Weaver Role

The **Edit JSON** worker acts as "The Weaver." It is the central assembly point that waits for artifacts from all other subscribers:
- **Transcript** (from YouTube or Whisper)
- **AI Content** (MCQ, Vow, Technique)
- **Japanese Translation**
- **Manga Panels** (linked via Image Match)
- **Audio Clips** (Sutta and Teacher clips)

## Local-First Boundary

All processing is local until seal:

| Before Seal | After Seal |
|---|---|
| Raw video downloads & JSON3 captions | Clean canonical artifacts in GCS |
| Local AI "Bones" (Draft JSONs) | Manifest with checksums |
| Manga panel candidates | Serving DB/index rebuild input |
| Temporary working directories | Durable versioned history (Hash-ID) |

## Implementation Phases (Factory Mode)

| Phase | Goal | Strategy |
|---:|---|---|
| **Batch 1** | Single local process | Sequential testing of the "Weaver" |
| **Batch 2** | Multi-process supervisor | Parallel CPU Waves with GPU locking |
| **Batch 3** | Hash-based Idempotency | Avoiding re-computing existing AI content |
