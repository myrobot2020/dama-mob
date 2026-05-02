# Buddha Book Image Pipeline

Images are not generated casually per sutta. They come from Buddha books and have their own pipeline.

```text
Buddha books
  -> image feed handler
  -> page/panel extraction
  -> tagging/dedupe
  -> local candidate store
  -> image selector UI
  -> approved image artifacts
  -> image match subscriber
  -> sealed sutta image artifact
```

## Image Sources

Possible source inputs:

```text
PDF books
scanned page images
folder of page images
existing extracted panels
manual image imports
```

## Image Feed Handler

Responsibilities:

```text
register source book
assign source_book_id
extract page count / file list
dedupe source files
publish image_source.discovered
```

Example source record:

```json
{
  "source_book_id": "buddha_book_001",
  "title": "Buddha Book Title",
  "source_type": "pdf",
  "local_path": "data/work/images/books/book.pdf",
  "sha256": "...",
  "page_count": 120
}
```

## Extraction

The extraction stage creates:

```text
page images
panel crops
thumbnails
panel metadata
```

Panel metadata:

```json
{
  "panel_id": "panel_001",
  "source_book_id": "buddha_book_001",
  "page": 12,
  "bbox": [100, 240, 800, 900],
  "local_path": "data/work/images/panels/panel_001.png",
  "thumbnail_path": "data/work/images/thumbnails/panel_001.jpg",
  "sha256": "...",
  "quality_score": 0.87
}
```

## Tagging And Dedupe

Tags are used for candidate search and selector UI.

Possible metadata:

```text
source book
page number
panel number
visual tags
OCR text if available
quality score
duplicate group
aspect ratio
dominant colors
manual notes
```

## Candidate Store

The candidate store is local.

It should support:

```text
filter by book/page
filter by tags
search notes/OCR
show thumbnails
mark duplicate/bad image
create candidate set for a sutta
```

## Image Selector UI

This is human-in-the-loop.

Required actions:

```text
approve image for sutta
reject candidate
mark uncertain
add selection reason
link image to segment or theme
compare multiple candidates
```

Selection event:

```json
{
  "event_type": "image_selection.approved",
  "payload": {
    "sutta_id": "AN1.1",
    "panel_id": "panel_001",
    "source_book_id": "buddha_book_001",
    "source_segment_ids": ["AN1.1.seg001"],
    "selection_reason": "matches the segment theme",
    "selected_by": "operator"
  }
}
```

## Image Match Subscriber

The image match subscriber converts approved selections into `images.json`.

It checks:

```text
approved panel exists
panel file exists
source book metadata exists
sutta exists
segment references are valid
image is not rejected/duplicate
```

## Images Artifact

Final image artifact is sealed with the sutta:

```json
{
  "schema_version": "v1",
  "artifact_type": "images",
  "sutta_id": "AN1.1",
  "content": {
    "images": [
      {
        "image_id": "img_001",
        "panel_id": "panel_001",
        "source_book_id": "buddha_book_001",
        "page": 12,
        "role": "primary",
        "local_path": "data/work/images/panels/panel_001.png",
        "source_segment_ids": ["AN1.1.seg001"],
        "selection_reason": "matches the segment theme",
        "review_status": "approved"
      }
    ]
  }
}
```

## Dashboard Requirements

The dashboard must show image pipeline state separately:

```text
books ingested
pages extracted
panels extracted
candidates ready
selections pending
approved images by sutta
image match failures
sealed images
```

