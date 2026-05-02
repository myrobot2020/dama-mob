# Dama Data Plant Diagram

This is the editable architecture diagram for the local tickerplant-style data pipeline.

Core rule:

```text
Everything runs locally until a complete sutta is validated and sealed to GCS.
```

## System Diagram

```mermaid
flowchart TB
    subgraph sources["External Sources"]
        sutta_sources["Sutta Sources<br/>YouTube, playlists, audio files, manual rows"]
        image_sources["Buddha Books<br/>PDFs, scans, page images"]
    end

    subgraph intake["Feed Handlers"]
        sutta_fh["Sutta Feed Handler<br/>check source, dedupe, normalize"]
        image_fh["Image Feed Handler<br/>ingest books and pages"]
    end

    subgraph plant["Local Data Plant"]
        tp["Local Tickerplant / Event Bus<br/>ordered event log + async publish"]
        rdb["Local RDB<br/>jobs, stage status, artifact records, errors"]
        log["Local Event Log<br/>append-only pipeline facts"]
    end

    subgraph sutta_workers["Sutta Pipeline Subscribers"]
        download["Download Subscriber<br/>download audio/video"]
        transcript["Transcription Subscriber<br/>create transcript artifact"]
        match["Sutta Match Subscriber<br/>identify nikaya/book/sutta"]
        segment["Segmentation Subscriber<br/>commentary and text segments"]
        timestamps["Audio Timestamp Subscriber<br/>segment start/end times"]
        generation["Content Generation Subscribers<br/>MCQ, vocab, technique"]
    end

    subgraph image_workers["Image Pipeline"]
        image_extract["Image Pipeline Subscribers<br/>extract panels, tag, dedupe"]
        image_store["Local Image Candidate Store<br/>panel metadata + thumbnails"]
        selector["Image Selector UI<br/>human chooses fitting images"]
        approved_images["Approved Image Artifacts<br/>local until seal"]
        image_match["Image Match Subscriber<br/>attach approved images to sutta"]
    end

    subgraph quality["Quality And Seal"]
        validation["Validation Subscriber<br/>schema + quality gates"]
        seal["Seal Subscriber<br/>upload only clean complete sutta"]
    end

    subgraph hdb["GCS HDB"]
        gcs["Sealed Clean Artifacts<br/>partitioned by nikaya/book/sutta"]
    end

    subgraph serving["Serving Layer"]
        replay["Replay / Rebuild<br/>recreate DB + indexes from sealed GCS"]
        serving_db["Serving DB / Indexes"]
        gateway["Dama App / Gateway"]
    end

    subgraph ops["Operations UI"]
        dashboard["Pipeline Dashboard<br/>nikaya/book/sutta/stage progress"]
    end

    sutta_sources --> sutta_fh
    image_sources --> image_fh

    sutta_fh --> tp
    image_fh --> tp

    tp --> rdb
    tp --> log

    tp --> download
    download --> tp

    tp --> transcript
    transcript --> tp

    tp --> match
    match --> tp

    tp --> segment
    segment --> tp

    tp --> timestamps
    timestamps --> tp

    tp --> generation
    generation --> tp

    tp --> image_extract
    image_extract --> image_store
    image_store --> selector
    selector --> approved_images
    approved_images --> image_match
    tp --> image_match
    image_match --> tp

    tp --> validation
    validation --> tp

    tp --> seal
    seal --> gcs

    gcs --> replay
    replay --> serving_db
    serving_db --> gateway

    rdb --> dashboard
    log --> dashboard
    image_store --> dashboard
    selector --> dashboard
    gcs --> dashboard
```

## Compact Flow

```text
External sources
  -> feed handlers
  -> local tickerplant / event bus
  -> async subscribers
  -> local RDB + local artifacts
  -> validation
  -> seal complete sutta to GCS HDB
  -> replay/rebuild serving DB and indexes
  -> app, gateway, dashboard
```

## Local Versus GCS

| Zone | What Lives There | Rule |
|---|---|---|
| Local files | Raw downloads, transcripts, segments, image candidates, generated content | Mutable while work is in progress |
| Local RDB | Jobs, current stage status, artifact records, errors, review state | Operational state only |
| Local event log | Every pipeline fact emitted by feed handlers and subscribers | Append-only |
| GCS HDB | Clean sealed artifacts for completed suttas | Immutable canonical store |
| Serving DB / indexes | Queryable projection for the app | Rebuildable from GCS |

## Core Roles

| Role | Meaning |
|---|---|
| Feed handler | Validates and normalizes external inputs into first events |
| Tickerplant / event bus | Central local event spine; workers publish and subscribe through it |
| Publisher | Any process that emits an event |
| Subscriber | Any async worker that consumes events and emits new events |
| Local RDB | Current working state of the pipeline |
| GCS HDB | Sealed historical/canonical store |
| Replay / rebuild | Code path that recreates DB/indexes from sealed GCS artifacts |
| Gateway | Read/control layer used by app and dashboard |

## Main Sutta Artifacts

| Artifact | Produced By | Sealed To GCS |
|---|---|---:|
| Source manifest | Sutta feed handler | Yes |
| Audio file metadata | Download subscriber | Yes |
| Transcript | Transcription subscriber | Yes |
| Sutta match | Sutta match subscriber | Yes |
| Segments | Segmentation subscriber | Yes |
| Audio timestamps | Audio timestamp subscriber | Yes |
| MCQ | Content generation subscriber | Yes |
| Vocab | Content generation subscriber | Yes |
| Technique | Content generation subscriber | Yes |
| Images | Image match subscriber + selector UI | Yes |
| Seal manifest | Seal subscriber | Yes |

## Image Pipeline Detail

```text
Buddha books
  -> image feed handler
  -> panel extraction
  -> tagging/dedupe
  -> local candidate store
  -> image selector UI
  -> approved image artifacts
  -> image match subscriber
  -> sealed sutta image artifact in GCS
```

## Example Complete Sutta Seal

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
```
