# Testing And Quality

Docs2 quality covers app tests, pipeline validation, schema checks, artifact checks, and rebuild verification.

Target from old project instructions:

```text
Try to achieve 85% code test coverage.
```

## Test Layers

| Layer | What To Test |
|---|---|
| Unit tests | Pure helpers, parsers, schema validators, ID logic |
| Component tests | Dashboard/status UI, app screen behavior |
| E2E tests | Critical app flows and operator flows |
| Pipeline tests | Subscriber contracts, idempotency, retry behavior |
| Artifact tests | JSON schema and reference integrity |
| GCS tests | Manifest, checksum, prefix layout |
| Rebuild tests | Recreate DB/indexes from sealed artifacts |

## Existing Commands From Old Docs

```text
npm run test
npm run test:e2e
npm run build
npm run verify
npm run pipe2:tally
```

Docs2 should eventually add:

```text
test:schemas
test:pipeline
test:rebuild
test:gcs-hdb
test:dashboard
```

## Coverage Priority

Aim for 85% especially on:

```text
sutta ID parsing
event envelope validation
artifact schema validation
subscriber idempotency
stage status reducers
GCS manifest/checksum logic
rebuild logic
sync/merge logic
AI grounding validators
```

Do not chase coverage equally across generated assets or thin UI wrappers.

## Validation Gates

Before seal:

```text
all required artifacts exist
schemas pass
references resolve
timestamps are sane
image selections are approved
generated content cites source segments
no blocking review items
manifest can be computed
```

Before serving release:

```text
GCS HDB manifests verify
serving index rebuild passes
app can load sample suttas
audio paths resolve
image paths resolve
dashboard counts match manifests
```

## Redundant Test Cleanup

Remove or merge tests that:

```text
only duplicate implementation details
assert the same behavior at multiple low-value layers
depend on brittle timing without need
mock too much to catch real failure
test old linear pipeline assumptions after event contracts exist
```

Keep tests that protect contracts:

```text
event names
artifact fields
schema versions
idempotency keys
manifest checksums
rebuild counts
dashboard status transitions
```

## Quality Reports

Each pipeline run should produce:

```text
validation report
failed artifact report
review queue report
seal report
rebuild report
coverage/test report when code changed
```

