# Dama Data Plant Diagram

This is the editable architecture diagram for the local tickerplant-style data pipeline, optimized for **Factory Mode** (Batch processing for Books 1 & 2).

Core rule:
```text
Everything runs locally in optimized waves until a complete sutta is validated and sealed to GCS.
```

## System Diagram (Factory Mode)

```mermaid
flowchart TB
    %% External Inputs
    subgraph sources["External Sources"]
        sutta_in["YouTube / Playlists<br/>(Video + Auto-Captions)"]
        book_in["Buddha Books<br/>(Manga PDFs / Scans)"]
    end

    %% Feed Handlers
    subgraph FH["Feed Handlers (Publishers)"]
        sutta_fh["Sutta Feed Handler<br/>(Extracts Video + Captions)"]
        image_fh["Image Feed Handler<br/>(Ingests Books/Pages)"]
    end

    %% Tickerplant Core
    subgraph Plant["Local Data Plant (Tickerplant)"]
        tp["Event Bus / Tickerplant<br/>(Ordered Event Log)"]
        rdb[("Local RDB (SQLite)<br/>Jobs, Status, Resource Locks")]
    end

    %% Wave 1: Parallel CPU
    subgraph Wave1["Wave 1: Parallel CPU (8x Grunts)"]
        sub_audio["Video Download<br/>(yt-dlp MP4 + JSON3)"]
        sub_extract["Panel Extraction<br/>(Manga Cropping)"]
        sub_seg["Caption Segmentation<br/>(Follows Download)"]
    end

    %% Wave 2: Sequential GPU
    subgraph Wave2["Wave 2: Sequential GPU (1x Lock)"]
        direction TB
        sub_gen["Content Gen (Ollama)<br/>(MCQ & Technique)"]
        sub_trans["Translation (Ollama)<br/>(Japanese Sutta Text)"]
        sub_dub["Dubbing (TTS)<br/>(Follows Translation)"]
    end

    %% Wave 3: Assembly & Rebuild
    subgraph Wave3["Wave 3: The Weaver & Seal"]
        sub_img_match["Image Match<br/>(Link Panels to Sutta)"]
        sub_edit["Edit JSON (The Weaver)<br/>(Merge all AI Bones)"]
        sub_val["Validation<br/>(Consistency Check)"]
        sub_seal["Seal Subscriber<br/>(Upload to GCS)"]
    end

    %% Historical Data Store
    subgraph HDB["GCS HDB (Historical Store)"]
        gcs_sealed[("Sealed Artifacts<br/>Sorted by Hash-ID")]
    end

    %% Serving Layer
    subgraph Serving["Serving Layer"]
        sub_rebuild["Rebuild Script<br/>(Update Sutta, Book & Index)"]
        idx[("Final Serving Index")]
    end

    %% Flow Logic
    sutta_in --> sutta_fh
    book_in --> image_fh
    sutta_fh -- "Pub: Discovery" --> tp
    image_fh -- "Pub: Discovery" --> tp

    tp <--> rdb

    %% Worker Loops
    tp -- "Parallel" --> Wave1
    Wave1 -- "Pub: Artifacts" --> tp
    
    tp -- "Sequential (5-6 Vid Wave)" --> Wave2
    Wave2 -- "Pub: AI Bones" --> tp

    tp -- "Assemble" --> Wave3
    Wave3 -- "Ready to Seal" --> sub_seal

    %% Sealing & Serving
    sub_seal --> gcs_sealed
    gcs_sealed --> sub_rebuild
    sub_rebuild --> idx
    idx --> App["Dama App / Dashboard"]

    %% Visual Styling
    classDef plant fill:#f9f,stroke:#333,stroke-width:2px;
    classDef cpu fill:#dfd,stroke:#333,stroke-width:1px;
    classDef gpu fill:#fdd,stroke:#333,stroke-width:1px;
    classDef hdb fill:#bbf,stroke:#333,stroke-width:2px;
    classDef weaver fill:#fff4dd,stroke:#d4a017,stroke-width:2px;

    class tp plant;
    class Wave1 cpu;
    class Wave2 gpu;
    class Wave3 weaver;
    class gcs_sealed hdb;
```

## Compact Flow

```text
Discovery -> Wave 1 (CPU Parallel) -> Wave 2 (GPU Sequential) -> Wave 3 (Weaver) -> GCS Seal -> Rebuild
```

## The Wave Strategy (Ideal size: 5-6 Videos)

| Wave | Mode | Strategy |
|---|---|---|
| **Wave 1** | Parallel CPU | Prefetch videos and captions using 8 threads. Disk and Network intensive. |
| **Wave 2** | Sequential GPU | Load Ollama once. Process 5-6 videos back-to-back to avoid VRAM swapping. |
| **Wave 3** | Weaver | Assemble AI results, Manga panels, and Dubbed audio into the final Sutta JSON. |

## Golden Artifacts (Hash-ID)

Artifacts in GCS are indexed by **Hash-ID** (Content Hash + Model Version). 
- If the video content hasn't changed, the pipeline skips the expensive Wave 2.
- If the AI prompt is updated, only the affected AI artifacts are re-computed.
