# GCS HDB

GCS HDB is the sealed canonical store.

The local RDB can be rebuilt. The serving DB can be rebuilt. GCS HDB is the durable clean source.

## Core Rule

```text
Only clean, validated, complete sutta artifact sets are uploaded to GCS HDB.
```

Work-in-progress stays local.

## Partitioning

Use domain partitions, not date-first partitions.

```text
nikaya -> book -> sutta -> run
```

Example:

```text
gs://<bucket>/hdb/nikaya=AN/book=01/sutta=AN1.1/run=001/
```

Why not date-first?

KDB financial systems often partition by date because trading data is naturally date-shaped. Dama data is naturally book/sutta-shaped.

## Sealed Sutta Layout

```text
gs://<bucket>/hdb/nikaya=AN/book=01/sutta=AN1.1/run=001/
  manifest.json
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
```

## Rollup Manifests

Per-sutta sealing should happen immediately after validation. Larger manifests can roll up later.

```text
gs://<bucket>/hdb/nikaya=AN/book=01/manifest.json
gs://<bucket>/hdb/nikaya=AN/manifest.json
gs://<bucket>/hdb/manifest.json
```

## Manifest Contract

`manifest.json` is the seal record.

```json
{
  "schema_version": "v1",
  "seal_id": "seal_...",
  "dataset": "dama-hdb",
  "nikaya": "AN",
  "book": "01",
  "sutta_id": "AN1.1",
  "run_id": "001",
  "sealed_at": "2026-05-01T00:00:00Z",
  "sealed_by": "seal_subscriber",
  "status": "sealed",
  "artifacts": {
    "source.json": {
      "sha256": "...",
      "bytes": 1234,
      "schema_version": "v1"
    },
    "segments.json": {
      "sha256": "...",
      "bytes": 4567,
      "schema_version": "v1"
    }
  },
  "counts": {
    "segments": 12,
    "mcq_questions": 5,
    "vocab_items": 8,
    "techniques": 1,
    "images": 3
  },
  "source_hashes": {
    "audio": "sha256:...",
    "transcript": "sha256:..."
  },
  "validation": {
    "passed": true,
    "validation_artifact": "validation.json"
  }
}
```

## Immutability

Once sealed, do not mutate that run.

If fixed later:

```text
run=001/  original sealed artifact set
run=002/  corrected sealed artifact set
```

Then rollup manifest marks active run:

```json
{
  "sutta_id": "AN1.1",
  "active_run": "002",
  "runs": ["001", "002"]
}
```

## Existing Bucket Context

Old docs reference these buckets:

```text
JSON:  gs://damalight-dama-json
Audio: gs://damalight-dama-aud
```

Docs2 does not require final bucket names yet. It requires this logical split:

| Logical Store | Purpose |
|---|---|
| HDB clean artifacts | Sealed canonical JSON/artifact sets |
| Public app corpus | App-readable serving projection |
| Audio objects | Public or controlled audio delivery |

The same physical bucket can be used early, but logical prefixes should remain clear.

## Suggested Prefixes

```text
gs://damalight-dama-json/hdb/
gs://damalight-dama-json/serving/
gs://damalight-dama-aud/audio/
```

## Seal Preconditions

Validation subscriber must confirm:

```text
required artifacts exist
all artifacts match schema
sutta_id is consistent
segment IDs are unique
audio timestamps are sane
generated content references source segments
image records reference approved panels
manifest checksums can be computed
no blocking review items remain
```

## Seal Procedure

```text
1. Read local artifact records for sutta.
2. Validate final completeness.
3. Compute checksums and counts.
4. Upload artifact files to temporary GCS prefix.
5. Upload manifest last.
6. Verify uploaded checksums.
7. Mark run sealed in local RDB.
8. Publish sutta.sealed.
```

Manifest last matters: it prevents half-uploaded artifact sets from looking sealed.

