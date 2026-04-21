# JSON structure for dn
_Exported on 4/19/2026 at 16:38:05 GMT+5:30 from Cursor (3.0.9)_

---

**User**

1.1.json make like this sn structure for dn also

---

**Cursor**


Inspecting the SN sutta JSON structure and how DN is organized in the project.




Checking how the app resolves DN paths versus SN so we can give accurate guidance.




Here is how this lines up with your repo and the app.

## DN already matches the SN `1.1.json` shape

`valid json/dn/dn1/suttas/1.1.json` uses the **same fields** as `valid json/sn/sn1/suttas/1.1.json`: `sutta_id`, `sutta_name_en`, `sutta_name_pali`, `sutta`, `commentary`, `chain`, `aud_file`, `aud_start_s`, `aud_end_s`, `valid`, `youtube_video_id`, `youtube_url`.

So you do not need a different JSON “schema” for DN—it is already the same structure.

## Where files go (same rule as SN)

The app resolves IDs like this (see `corpusDirect.ts`):

```30:38:c:\Users\ADMIN\Desktop\mob app\src\lib\corpusDirect.ts
export function relativeJsonPathForSuttaId(suttaid: string): string | null {
  const t = suttaid.trim();
  if (!t) return null;
  const od = /^(SN|DN|MN|KN)\s+(\d+)\.([\w.-]+)$/i.exec(t);
  if (od) {
    const nk = od[1].toLowerCase() as "sn" | "dn" | "mn" | "kn";
    const bookSeg = od[2];
    const tail = `${od[2]}.${od[3]}`;
    return `${nk}/${nk}${bookSeg}/suttas/${tail}.json`;
```

Examples:

- `DN 1.1` → `valid json/dn/dn1/suttas/1.1.json`
- `DN 1.2` → `valid json/dn/dn1/suttas/1.2.json`
- `SN 1.1` → `valid json/sn/sn1/suttas/1.1.json`

So for DN you keep the mirror: **`dn/dn1/suttas/<same tail as sutta_id>.json`**.

## What is *not* the same as your SN example yet (optional parity)

1. **Audio fields** — In SN, `1.1.json` uses a dedicated file name like `sn_001_7J0h61kRqBg.webm` and a long `aud_end_s`. Your DN `1.1.json` / `1.2.json` still use a generic AN-style `aud_file` and `aud_end_s: 120.0`, which looks like a placeholder. “Like SN” in practice often means: **one audio asset per sutta, filename aligned with your convention, and `aud_start_s` / `aud_end_s` spanning the real segment.**

2. **`chain.items`** — SN uses a short code (`"01"`); DN uses Pali title strings (`brahmajāla`, `sāmaññaphala`). Both are valid JSON; parity is a **content convention**, not required by the path logic.

3. **Extra chunk files** — Under `sn/sn1/suttas/` you have many `1.pl.*.json` files (playlist-style splits). DN does not have those; add them only if you want the same **multi-file-per-sutta** pattern for long DN talks.

## Summary

- **Structure / folders / filenames for DN**: already aligned with SN: same JSON keys, `dn/dn1/suttas/1.N.json` for `DN 1.N`.
- **To feel “like” the SN `1.1.json` you opened**: focus on **audio metadata** (and optionally **chain label style** and **`.pl.*` chunk files**), not on inventing a new object shape.

I am in **Ask mode**, so I cannot create or edit files for you. If you want this applied across all DN suttas in the repo, switch to **Agent mode** and say whether you want full audio alignment, `.pl.*` chunks, or both.

---

**User**

can we start downlaod of dn aud + transc + sutta iding + json splitting? forget cokmmetry splitiing for now

---

**Cursor**


Exploring existing download, transcription, and JSON-splitting pipelines in the repo so we can outline a DN workflow (without commentary splitting).




You can start this pipeline, but **most of the automation exists today only for SN**, not as a DN-specific script. Here is how it maps to your repo and what “start” would mean in practice.

## What you already have for DN

| Piece | Status |
|--------|--------|
| **DN YouTube playlist id** | Defined as `PLD8I9vPmsYXyeQPTfw_D6mtywW7Jzv5tW` in `scripts/fetch_playlist_samples.py` (same id feeds `raw/dn/playlist_top2.json`). |
| **Sample manifest** | `raw/dn/playlist_top2.json` lists the first two videos (Brahmajāla, Sāmaññaphala). |
| **Transcripts (samples)** | `raw/dn/transcripts/U_4WrY1s4Hk.en.vtt`, `I94ZyzJ97NE.en.vtt`. |
| **Corpus paths** | `valid json/dn/dn1/suttas/1.1.json`, `1.2.json` — app resolves `DN 1.N` → `dn/dn1/suttas/1.N.json` (see `relativeJsonPathForSuttaId` in `src/lib/corpusDirect.ts`). |
| **Manual / hybrid tooling** | `scripts/normalize_download_json_like_an.py` knows DN sample rows; `scripts/clean_corpus_youtube_vtt.py` maps those video ids to DN JSON paths. |

## What is **not** wired for DN yet (SN has it end-to-end)

The SN flow is:

1. `scripts/download_sn_playlist_full.py` → `sn/playlist_full.json` + `sn/audio/` (or `--manifest-only`).
2. `scripts/sn_playlist_sync.py` → English VTT under `raw/sn/transcripts/`, copies audio to `aud/`, **writes one JSON per playlist row** with `sutta_id`, split text, `chain`, `valid`, etc.

There is **no `download_dn_playlist_full.py` / `dn_playlist_sync.py`** checked in; DN is only partially covered by the small samples and the shared helpers.

So “starting” DN end-to-end means **adding a DN twin of that SN pipeline** (or generalizing one script with `--nik dn`).

## Suggested order of operations (matches your list)

1. **Full playlist manifest + audio**  
   - Same idea as `download_sn_playlist_full.py`, but DN playlist id `PLD8I9vPmsYXyeQPTfw_D6mtywW7Jzv5tW`, output e.g. `dn/playlist_full.json` and `dn/audio/` (naming like `dn_001_<video_id>.webm` mirrors SN’s `sn_001_…`).

2. **Transcripts**  
   - Same yt-dlp pattern as `download_subtitles()` in `sn_playlist_sync.py`: `--write-auto-sub`, `--sub-langs en`, output template `raw/dn/transcripts/%(id)s`, full playlist URL.

3. **Sutta id mapping (“sutta iding”)**  
   - You must fix a **rule**: playlist row index → `sutta_id` + filename.  
   - **If** the playlist is **one video per Dīgha sutta in order**, a natural rule is: row `i` → `DN 1.i` → `valid json/dn/dn1/suttas/1.i.json` for `i = 1 … 34` (only if the playlist order really matches sutta order).  
   - **If** there are extra parts (like SN’s many lectures for one book), you’d mirror SN: `DN 1.1`, `DN 1.2`, then `DN 1.pl.3`, `DN 1.pl.4`, … — that is exactly what `sutta_id_and_rel()` does for SN in `sn_playlist_sync.py` (lines 67–73).

4. **JSON splitting**  
   - Today, “splitting” in `sn_playlist_sync` is: **one JSON file per video** + **sutta vs commentary** via `split_transcript` from `normalize_download_json_like_an.py`.  
   - You said **skip commentary splitting**: implement DN sync so **`sutta` = full cleaned transcript** and **`commentary` = `""`** (or a one-line note). That avoids the “Thus have I heard … end of the suta” heuristic for DN until you want it.  
   - `valid` still requires a non-trivial `sutta` and audio on disk per existing `corpus_row_valid` logic in `sn_playlist_sync.py` — keep that in mind.

5. **Extend shared maps**  
   - `clean_corpus_youtube_vtt.py`’s `VIDEO_TO_JSON` is a **small hand map**; a full DN run either **replaces that** with manifest-driven writes (like `sn_playlist_sync`) or you **bulk-update** the dict (not ideal for 34+ videos).

## Dependencies

- **yt-dlp** (required), **ffmpeg/ffprobe** (recommended for durations and optional MP3).

---

**Bottom line:** Yes, you can start; the **playlist id and path convention are already there**, but you need a **DN automation script modeled on `download_sn_playlist_full.py` + `sn_playlist_sync.py`**, with commentary disabled as above. I am in **Ask mode** and cannot add or run those scripts here; if you want this implemented in the repo, switch to **Agent mode** and say whether DN should use **strict `DN 1.1` … `DN 1.34`** or **SN-style `1.pl.*` for overflow parts**.

---

**User**

any doubts?

---

**Cursor**


Yes — a few things are worth settling before you automate DN, because they change the script design:

## 1. Playlist ↔ sutta mapping

**Doubt:** Does the DN YouTube playlist list **exactly 34 videos in canonical Dīgha order** (1 = Brahmajāla … 34 = …), or are there **extras** (intros, Q&A, duplicates, merged suttas)?

- If **1:1 in order**, you can use `DN 1.1` … `DN 1.34` and `1.N.json`.
- If **not**, you need either manual overrides, title-based parsing, or an SN-style `1.pl.*` scheme — automation cannot guess that safely without rules you define.

## 2. One video vs many parts per sutta

**Doubt:** Is every Dīgha sutta **one long video**, or can one sutta span **multiple uploads** (like SN’s many `1.pl.*` files)?

That decides whether DN should mirror **strict numbering** or **playlist-index** ids.

## 3. “Sutta iding” vs transcript content

**Doubt:** If you only put the **full caption** in `sutta` and leave `commentary` empty, **`valid`** in the current SN sync logic still requires **usable VTT + enough characters + audio file present**. That’s fine — but if captions are **short, missing, or wrong language**, rows stay **`valid: false`** until fixed. No doubt about the code; just about **caption quality** per video.

## 4. Naming and folders

**Doubt:** Should DN audio follow the same convention as SN (`dn_001_<vid>.webm` under `dn/audio/`, copy to `aud/`) so it matches mental model and any tooling, or do you want everything only under `aud/`? Either works if one convention is chosen consistently.

## 5. Scope of “JSON splitting”

**Doubt:** You said **no commentary split** — clear. Remaining ambiguity: do you still want **one JSON per video** (splitting the **playlist** into many files), or literally **one file per sutta** even when two suttas share a video? The latter needs **timestamps or chapter markers** you don’t get from a single flat transcript without extra work.

---

**Smallest doubt that blocks design:** **confirm playlist order and count vs the 34 suttas** (and whether multi-part per sutta exists). Everything else is implementation detail once that’s known.

If you answer those, the pipeline can be specified without hand-waving.

