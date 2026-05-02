# Source Registry

The source registry defines how outside inputs enter the local data plant.

Feed handlers write source records and publish source events.

## Source Types

| Source Type | Examples | Feed Handler |
|---|---|---|
| YouTube video | Single discourse/commentary video | Sutta feed handler |
| YouTube playlist | Book/series playlist | Sutta feed handler |
| Local audio/video | Local MP3/MP4/WAV files | Sutta feed handler |
| Manual row | Spreadsheet/CSV/admin form | Sutta feed handler |
| Corpus JSON | Existing validated text files | Sutta feed handler |
| Buddha book PDF | PDF book | Image feed handler |
| Page image folder | Scans/images | Image feed handler |
| Existing panel folder | Pre-extracted panels | Image feed handler |

## Source Record

```json
{
  "source_id": "youtube:abc123",
  "source_type": "youtube",
  "source_uri": "https://youtube.com/watch?v=abc123",
  "dedupe_key": "youtube:abc123",
  "nikaya": "AN",
  "book": "1",
  "sutta_hint": "AN1.1",
  "status": "discovered",
  "metadata": {
    "title": "...",
    "duration_s": 312.4
  }
}
```

## Dedupe Rules

| Source | Dedupe Key |
|---|---|
| YouTube video | `youtube:<video_id>` |
| YouTube playlist item | `youtube:<video_id>` plus optional playlist context |
| Local file | `file_sha256:<sha256>` |
| Manual row | Stable row ID plus source URL/file hash |
| Buddha book PDF | `book_sha256:<sha256>` |
| Page image | `image_sha256:<sha256>` |
| Panel | `panel_sha256:<sha256>` |

## Feed Handler Checks

Sutta feed handler checks:

```text
source exists
URL/path is readable
source ID can be extracted
dedupe key is not already processed
nikaya/book/sutta hint is valid if supplied
source type is supported
```

Image feed handler checks:

```text
book/file exists
PDF/page images can be read
dedupe key is not already processed
source_book_id can be assigned
page count or file list can be determined
```

## First Events

Sutta source accepted:

```text
source.sutta.discovered
sutta.queued
```

Image source accepted:

```text
image_source.discovered
```

Rejected source:

```text
source.sutta.rejected
image_source.rejected
```

## Source Status

| Status | Meaning |
|---|---|
| `discovered` | Normalized by feed handler |
| `queued` | Ready for downstream processing |
| `processed` | Downstream artifacts exist |
| `rejected` | Invalid or duplicate |
| `superseded` | Replaced by newer source |

## Manual Source Intake

Manual rows should still become source records. They should not bypass the feed handler.

Minimum manual fields:

```text
source_type
source_uri or local_path
nikaya
book
sutta_hint
notes
```

## Source Provenance

Every sealed sutta should be able to answer:

```text
What source did this come from?
When was it ingested?
Who/what ingested it?
What hash or external ID proves identity?
What license/source metadata is known?
Which artifacts depend on it?
```

