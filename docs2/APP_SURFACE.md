# App Surface

Docs2 focuses on the data plant, but the app surface still matters because sealed artifacts must serve product screens.

## Existing Main User Screens

Old screen docs identify:

| Screen | Route | Data Needed |
|---|---|---|
| Home | `/` | Last opened/default sutta |
| Browse | `/browse` | Corpus index |
| Reader | `/sutta/$suttaId` | Sutta JSON, title, text, audio fields, read state |
| Practice | `/practice/$suttaId` | Vow/MCQ/technique content |
| Quiz | `/quiz/$suttaId` | Quiz/leaf state/audio clip |
| Tree | `/tree` | Corpus index, reading progress, leaf state |
| Reflection | `/reflect` | Read sutta context, model config |
| Profile/Auth | Auth routes | Supabase auth/profile |

## Data Plant To App Mapping

| Data Plant Artifact | App Surface |
|---|---|
| `source.json` | Provenance/debug/admin |
| `transcript.json` | Admin/debug, possible transcript display |
| `segments.json` | Reader/practice/commentary structure |
| `audio_timestamps.json` | Audio clips, highlighted segments |
| `mcq.json` | Quiz/practice |
| `vocab.json` | Learning/explanation UI |
| `technique.json` | Practice UI |
| `images.json` | Reader/practice visual panel |
| `manifest.json` | Serving index/rebuild |

## Serving Projection

The app should receive a simpler serving shape than the full HDB.

Example app sutta JSON:

```json
{
  "suttaid": "AN1.1",
  "nikaya": "AN",
  "book": "1",
  "title": "...",
  "text": "...",
  "segments": [],
  "audio": {
    "file": "...",
    "timestamps": []
  },
  "practice": {
    "mcq": [],
    "vocab": [],
    "techniques": []
  },
  "images": []
}
```

## Operator Surface

Separate from public app:

```text
pipeline dashboard
image selector
review queue
artifact viewer
seal/rebuild controls
```

Do not mix admin/operator controls into public learner screens.

## Mobile Requirements

Old docs emphasize mobile:

```text
reader must load cleanly
audio must not block text
bottom strips must not cover content
practice always has fallback
tree/leaf state must survive reload/sync
```

Docs2 adds:

```text
serving projection must be compact
images must be appropriately sized
audio timestamps must be app-safe
missing artifacts must degrade gracefully
```

## App Failure Behavior

| Missing Data | App Behavior |
|---|---|
| Missing audio | Show text and audio unavailable |
| Missing image | Show reader without image or fallback image |
| Missing MCQ | Show practice fallback or quiz unavailable |
| Missing vocab | Hide vocab section |
| Missing technique | Show fallback technique |
| Missing sutta JSON | Clear missing sutta error |
| AI unavailable | Reflection unavailable, reading still works |

