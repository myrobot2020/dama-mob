# mob app

Mobile-focused web app + corpus data pipeline.

## Quick Start

```bash
npm install
python -m uv sync
npm run dev
```

App runs at `http://localhost:8080` (Vite/TanStack setup).

## Main Commands

```bash
npm run build
npm run test
npm run verify
```

`npm run verify` runs:

1. frontend build
2. pipeline tally check (`scripts2/pipeline.py --from-stage tally --to-stage tally`)

## Pipeline (scripts2)

The pipeline manages data validation and syncing to GCS for the **Aṅguttara Nikāya (AN)** corpus.

- **GCS Bucket:** `gs://damalight-dama-json`
- **Tally Check**: `npm run pipe2:tally` (verifies files on GCS).
- **Index Generation**: `python scripts2/generate_index.py` (updates the GCS index).

Run full pipeline (local):

```bash
npm run pipe2
```

## Corpus Data Fetching

In development, the app fetches AN JSON from GCS if `VITE_DAMA_CORPUS_GCS_BASE` is set in `.env.local`.

- Local fallback: `/__dama_corpus__/` (files in `data/validated-json/an`).
- Production: Always uses GCS for AN.

## Deploy

Deploy configs are under `deploy/`:

- `deploy/cloudbuild.yaml`
- `deploy/Dockerfile`
- `deploy/wrangler.jsonc`
- `deploy/GCP.md`
