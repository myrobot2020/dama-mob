# dama-dev

Data pipeline, manga panel management, and development dashboard for the Dama project.

## Setup

1. Install Python 3.11+
2. Install `uv`: `pip install uv`
3. Install dependencies: `python -m uv sync`
4. Create `.env.local` based on `.env.example`.

## Pipeline Commands

The pipeline is used to process raw Pāḷi Canon data and sync it to Google Cloud Storage.

```bash
# Run full pipeline
npm run pipe2

# Sync validated JSON to GCS
npm run sync:gcs

# Generate global index.json
npm run index:gen

# Run tally check
npm run verify
```

## Manga & Images

Contains scripts for extracting, classifying, and managing manga panels for the biography of the Buddha.
Refer to `scripts/pipeline/images/` and `scripts/utils/extract_pdf_images.py`.

## Dashboard

(Coming soon) A desktop-optimized dashboard for monitoring pipeline progress and reviewing manga panel mappings.
