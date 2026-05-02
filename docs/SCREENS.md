# Book of Ones Screen Architecture

Scope: screens and user flows needed to recreate the Book of Ones experience in DAMA. This is the product/screen companion to `ARCHITECTURE.md` and `DATA_ARCHITECTURE.md`.

## Screen Inventory

| Order | Screen | Route | Purpose | Primary user action | Data needed | Output / state change | Failure / empty state |
|---:|---|---|---|---|---|---|---|
| 1 | Home | `/` | Entry point into the app | Tap `AN Nikāya` | Last opened sutta, default sutta ID | Opens last Book of Ones sutta or `AN 1.18.13` | If no progress, use default |
| 2 | Corpus browse | `/browse` | Search and filter corpus | Search, choose `Aṅguttara`, choose `Book of Ones` | Corpus index items | Opens selected sutta | Loading, could not load index, zero results |
| 3 | Corpus header navigation | Embedded in sutta/browse | Fast nikāya/book/sutta picker | Change nikāya, book, or sutta | Corpus index, AN book titles | Navigates to chosen sutta | Loading select state, retry/error icon |
| 4 | Book of Ones sutta reader | `/sutta/$suttaId` | Main reading screen for each Book of Ones sutta | Read, play audio, mark read, open practice | Sutta JSON, title, text, audio fields, read state, settings | Records open event; toggles read/unread; tracks audio progress | Loading skeleton, could not load sutta, audio unavailable |
| 5 | Book of Ones visual panel | Embedded in reader | Gives Book of Ones pages visual identity | Passive viewing | Sutta ID, local panel images | Displays deterministic image variant per sutta | Hidden outside AN Book 1 |
| 6 | Teacher audio block | Embedded in reader | Listen to teacher audio for the sutta | Play/pause audio | `aud_file`, `aud_start_s`, `aud_end_s` | Audio listen progress updates | Hidden if missing; unavailable notice if path bad |
| 7 | Practice entry | Embedded in reader | Moves user from reading to active practice | Tap `Practice` | Current sutta ID | Opens practice screen | Always available for loaded sutta |
| 8 | Practice screen | `/practice/$suttaId` | Turns Book of Ones text into vow, MCQ, or technique | Read vow, answer MCQ, follow technique | Practice content, fallback practice, sutta JSON | Shows feedback for MCQ; no persistent state yet | Fallback practice if no curated content |
| 9 | Quiz screen | `/quiz/$suttaId` | Leaf/MCQ review loop | Pick answer, submit, try for gold | Static/corpus quiz, leaf state, optional teacher clip | Creates/updates leaf state: green, yellow, gold | Missing ID, loading quiz, quiz not found |
| 10 | Tree screen | `/tree?focus=$suttaId` or `/tree` | Book-level progress map | Select AN/Book 1, mark leaf read/unread, open sutta | Corpus index, reading progress, leaf state | Toggles read state; hydrates leaf state | Loading leaves, corpus index error, no suttas found |
| 11 | Next/previous strip | Embedded in reader/practice | Sequential navigation through Book of Ones | Tap previous/next sutta | Corpus index sorted by canonical order | Opens adjacent sutta/practice | Loading strip, offline/unavailable |
| 12 | Relevant sutta strip | Embedded in quiz | Return from quiz to source context | Tap source/relevant item | Current sutta ID, quiz/audio capability | Opens related sutta/audio context | Minimal fallback if no related data |

## Book of Ones Flow

| Step | From | Action | To | Required data | Notes |
|---:|---|---|---|---|---|
| 1 | Home | Tap `AN Nikāya` | `/sutta/AN 1.18.13` or last opened | Reading progress, default sutta ID | Default is `AN 1.18.13` |
| 2 | Sutta reader | Use header picker | Another Book of Ones sutta | Corpus index | Header filters AN Book 1 when current sutta is Book 1 |
| 3 | Sutta reader | Tap read/bookmark button | Same screen | Reading progress | Toggles read/unread locally and syncs if enabled |
| 4 | Sutta reader | Play teacher audio | Same screen | Audio file and timestamps | Uses clipped player when start/end exist |
| 5 | Sutta reader | Tap `Practice` | `/practice/$suttaId` | Sutta ID | Practice can use curated or fallback content |
| 6 | Practice | Tap next/previous strip | Adjacent practice or sutta route | Corpus index | Keeps Book of Ones sequence moving |
| 7 | Tree | Select `Aṅguttara` and Book `1` | Book of Ones leaf grid | Corpus index, progress | Shows read/unread leaves |
| 8 | Tree | Tap external-link icon on leaf | `/sutta/$suttaId` | Sutta ID | Direct jump to a Book of Ones sutta |
| 9 | Quiz | Submit first answer | Same screen | Quiz content, leaf state | Grows a leaf; first submit is not treated as wrong |
| 10 | Quiz | Review yellow leaf | Same screen | Gold option ID | Teacher-aligned answer turns leaf gold |

## Reader Screen Requirements

| Area | Required behavior | Data source | Implementation notes |
|---|---|---|---|
| Header | Shows corpus navigation instead of plain title | `CorpusHeaderNav` | Current sutta controls selected nikāya/book |
| Canon subtitle | Shows `Aṅguttara Nikāya · Book of Ones · AN x` | Sutta ID parser | Must avoid duplicate or unclear IDs |
| Title | Uses preferred English sutta name/title | Corpus item detail | Falls back cleanly if title missing |
| Visual panel | Shows one of four local Book of Ones panels | Sutta ID hash | Only when `anBookFromSuttaId(id) === 1` |
| Text | Shows cleaned sutta text | Corpus JSON | Remove transcript noise tags |
| Japanese toggle | Available only for supported sutta data | Special local quiz/audio data | Currently special-cased for `AN 1.48` |
| Audio | Plays full or clipped teacher audio | Corpus audio fields | If `aud_end_s > aud_start_s`, use clipped player |
| Read state | Bookmark/check button toggles read | Reading progress store | Must survive reload and sync later |
| Practice CTA | Full-width `Practice` button | Current sutta ID | Opens `/practice/$suttaId` |
| Bottom nav | Previous/next sutta strip | Corpus index | Must respect canonical order |

## Practice Screen Requirements

| Mode | When shown | UI | Data | Success behavior |
|---|---|---|---|---|
| Vow | Deterministic by sutta ID | Vow text block | Curated/fallback practice | User reads and applies vow |
| MCQ | Deterministic by sutta ID | Quote, options, `Check` button | Practice quiz | Shows aligned/teacher answer feedback |
| Technique | Deterministic by sutta ID | Title and ordered steps | Practice technique | User follows small practice steps |
| Fallback | Any missing curated practice | Generic vow, MCQ, technique | Sutta quote excerpt | Keeps every Book of Ones sutta usable |

## Curated Book of Ones Practice Content

| Sutta ID | Title / theme | Curated practice exists | Notes |
|---|---|---:|---|
| `AN 1.18.13` | Dung sutta / disenchantment | Yes | Vow and technique in `bookOnePractices.ts` |
| `AN 1.19` | Dhamma sutta / hard truth | Yes | Vow and technique in `bookOnePractices.ts` |
| `AN 1.19.2` | Rare chance | Yes | Vow and technique in `bookOnePractices.ts` |
| `AN 1.20.1` | Real gains | Yes | Vow and technique in `bookOnePractices.ts` |
| `AN 1.20.2` | Finger-snap collectedness | Yes | Vow and technique in `bookOnePractices.ts` |
| `AN 1.21.47` | Body first | Yes | Vow and technique in `bookOnePractices.ts` |
| `AN 1.48` | Quickness of mind | Yes | Includes special Japanese support |
| Other Book of Ones suttas | Generic practice | Fallback | Uses sutta quote excerpt and default practice |

## Tree / Leaf Requirements

| Area | Required behavior | Data source | Notes |
|---|---|---|---|
| Collection chips | Shows ALL plus nikāya options | Corpus index | Disabled when count is zero |
| Book chips | Shows available books for selected collection | Corpus index | For AN Book 1, chip value is `1` |
| Leaf grid | One leaf per sutta in selected book | Corpus index + reading progress | Green means read, grey means unread |
| Mark book read | Bulk toggle all leaves in active book | Reading progress store | Button changes to `Clear Book` when all read |
| Leaf button | Toggle read/unread | Reading progress store | Does not navigate by itself |
| External-link icon | Open sutta page | Sutta ID | Keeps read toggle and navigation separate |
| Focus query | Hydrates focused leaf | `focus` search param | Used after quiz/review flows |

## Data Dependencies

| Data | Used by screens | Required fields |
|---|---|---|
| Corpus index | Home, Browse, Header nav, Tree, Next strip | `suttaid`, `title`, `nikaya`, `has_commentary` |
| Sutta detail JSON | Reader, Practice, Quiz | `suttaid`, `title`, `sutta`, `aud_file`, `aud_start_s`, `aud_end_s`, `quiz` |
| Audio files | Reader, Quiz teacher clip | Public audio path matching `aud_file` |
| Reading progress | Home, Reader, Tree | `openedAtMs`, `openCount`, `readAtMs`, `updatedAtMs` |
| Leaf state | Quiz, Tree | `suttaId`, `state`, attempt/review timestamps |
| Practice content | Practice | `suttaId`, `vow`, `technique`, `quiz` |
| Settings | Reader | `language` |
| UX events | Reader and future analytics | Event name, props, device/user context |

## Rebuild Checklist

| Check | Pass condition |
|---|---|
| Book of Ones route opens | `/sutta/AN%201.18.13` loads title, text, visual panel, and practice CTA |
| Browse filter works | `/browse` can show AN Book of Ones results |
| Header nav works | Changing book/sutta navigates without losing selected AN context |
| Reader states work | Loading, error, no-audio, clipped-audio, read/unread all display correctly |
| Practice always exists | Curated suttas show custom content; all others show fallback |
| Quiz handles missing content | Supported suttas show MCQ; unsupported suttas show `Quiz not found` |
| Tree shows Book One | AN Book 1 leaf grid loads and read toggles work |
| Sequential nav works | Previous/next strip follows canonical Book of Ones order |
| Mobile safe areas work | Bottom strips do not cover content or controls |
| Tests cover core behavior | Sutta ID parsing, book filtering, practice fallback, leaf/read transitions |

