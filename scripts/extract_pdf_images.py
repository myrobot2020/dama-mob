"""Extract non-text images from the eight Buddha volume PDFs.

The PDFs in ``images/`` are large book volumes. This script extracts raster
image blocks from each page while skipping likely text/page-scan images:

- very small images
- near-full-page images, unless ``--include-full-page`` is passed
- repeated images, unless ``--no-dedupe`` is passed

Outputs are written to ``images/extracted-non-text/`` by default, grouped by
volume, with ``manifest.csv`` and ``manifest.json`` for traceability.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
import sys
import types
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

import fitz  # PyMuPDF
import cv2
import numpy as np
from PIL import Image


DEFAULT_INPUT_DIR = Path("images")
DEFAULT_OUTPUT_DIR = Path("images") / "extracted-non-text"
DEFAULT_PATTERN = "buddha_v*.pdf"


@dataclass(frozen=True)
class ExtractedImage:
    volume: str
    page: int
    image_index: int
    xref: int
    width: int
    height: int
    extension: str
    sha256: str
    output_path: str


@dataclass(frozen=True)
class ExtractedPanel:
    volume: str
    page: int
    panel_index: int
    x: int
    y: int
    width: int
    height: int
    score: float
    output_path: str


@dataclass(frozen=True)
class TextRejectedPanel:
    volume: str
    page: int
    panel_index: int
    width: int
    height: int
    text_hits: int
    text: str


@dataclass(frozen=True)
class SkippedImage:
    volume: str
    page: int
    image_index: int
    xref: int
    width: int
    height: int
    reason: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract likely non-text images from Buddha volume PDFs."
    )
    parser.add_argument(
        "--mode",
        choices=["embedded", "panels"],
        default="embedded",
        help=(
            "embedded extracts PDF image objects; panels renders pages and crops "
            "detected non-text visual panels. Default: embedded"
        ),
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=DEFAULT_INPUT_DIR,
        help=f"Folder containing volume PDFs. Default: {DEFAULT_INPUT_DIR}",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Folder for extracted images. Default: {DEFAULT_OUTPUT_DIR}",
    )
    parser.add_argument(
        "--pattern",
        default=DEFAULT_PATTERN,
        help=f"PDF filename glob. Default: {DEFAULT_PATTERN}",
    )
    parser.add_argument(
        "--min-width",
        type=int,
        default=120,
        help="Skip images narrower than this many pixels. Default: 120",
    )
    parser.add_argument(
        "--min-height",
        type=int,
        default=120,
        help="Skip images shorter than this many pixels. Default: 120",
    )
    parser.add_argument(
        "--min-area",
        type=int,
        default=25_000,
        help="Skip images with fewer pixels than this. Default: 25000",
    )
    parser.add_argument(
        "--full-page-threshold",
        type=float,
        default=0.86,
        help=(
            "Skip image blocks covering at least this fraction of page area. "
            "This avoids extracting full scanned text pages. Default: 0.86"
        ),
    )
    parser.add_argument(
        "--include-full-page",
        action="store_true",
        help="Include full-page raster images instead of treating them as text scans.",
    )
    parser.add_argument(
        "--no-dedupe",
        action="store_true",
        help="Keep duplicate image bytes instead of writing only the first copy.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Scan and report what would be extracted without writing images.",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=None,
        help="Only scan the first N pages of each PDF. Useful for testing.",
    )
    parser.add_argument(
        "--progress-every",
        type=int,
        default=50,
        help="Print progress every N pages. Use 0 to silence progress. Default: 50",
    )
    parser.add_argument(
        "--dpi",
        type=int,
        default=180,
        help="Render DPI for --mode panels. Default: 180",
    )
    parser.add_argument(
        "--panel-backend",
        choices=["manga", "heuristic"],
        default="manga",
        help=(
            "Panel detector for --mode panels. 'manga' uses Adenzu Manga Panel "
            "Extractor when available; 'heuristic' uses the local OpenCV fallback. "
            "Default: manga"
        ),
    )
    parser.add_argument(
        "--manga-extractor-src",
        type=Path,
        default=Path("tmp") / "Manga-Panel-Extractor" / "src",
        help="Path to Adenzu Manga Panel Extractor src directory.",
    )
    parser.add_argument(
        "--manga-fallback",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Enable Manga Panel Extractor fallback method. Default: true",
    )
    parser.add_argument(
        "--manga-split-joint-panels",
        action="store_true",
        help="Ask Manga Panel Extractor to split joint panels. Slower and requires cv2.ximgproc.",
    )
    parser.add_argument(
        "--panel-min-width",
        type=int,
        default=180,
        help="Minimum detected panel width in pixels. Default: 180",
    )
    parser.add_argument(
        "--panel-min-height",
        type=int,
        default=180,
        help="Minimum detected panel height in pixels. Default: 180",
    )
    parser.add_argument(
        "--panel-min-area-ratio",
        type=float,
        default=0.015,
        help="Minimum panel/page area ratio. Default: 0.015",
    )
    parser.add_argument(
        "--panel-max-area-ratio",
        type=float,
        default=0.70,
        help="Maximum panel/page area ratio to avoid full-page scans. Default: 0.70",
    )
    parser.add_argument(
        "--panel-padding",
        type=int,
        default=16,
        help="Pixels of padding around cropped panels. Default: 16",
    )
    parser.add_argument(
        "--keep-text-only",
        action="store_true",
        help="Keep likely text-only/caption regions in --mode panels.",
    )
    parser.add_argument(
        "--reject-text",
        action="store_true",
        help="Use OCR to reject any detected texted panel in --mode panels.",
    )
    parser.add_argument(
        "--ocr-confidence",
        type=float,
        default=0.55,
        help="Minimum OCR confidence for text rejection. Default: 0.55",
    )
    parser.add_argument(
        "--ocr-min-chars",
        type=int,
        default=2,
        help="Minimum alphanumeric chars in an OCR hit for text rejection. Default: 2",
    )
    parser.add_argument(
        "--text-panel-max-height",
        type=int,
        default=560,
        help="Likely text-only regions below this height are skipped. Default: 560",
    )
    parser.add_argument(
        "--text-panel-min-aspect",
        type=float,
        default=2.0,
        help="Likely text-only regions wider than this aspect ratio are skipped. Default: 2.0",
    )
    parser.add_argument(
        "--clean-output",
        action="store_true",
        help="Delete the output directory before writing new extracted files.",
    )
    return parser.parse_args()


def find_pdfs(input_dir: Path, pattern: str) -> list[Path]:
    pdfs = sorted(input_dir.glob(pattern))
    if not pdfs:
        raise FileNotFoundError(f"No PDFs found in {input_dir} matching {pattern!r}")
    return pdfs


def image_blocks_by_xref(page: fitz.Page) -> dict[int, list[fitz.Rect]]:
    blocks: dict[int, list[fitz.Rect]] = {}
    for block in page.get_text("dict").get("blocks", []):
        if block.get("type") != 1:
            continue
        xref = block.get("xref")
        bbox = block.get("bbox")
        if not xref or not bbox:
            continue
        blocks.setdefault(int(xref), []).append(fitz.Rect(bbox))
    return blocks


def covers_most_of_page(
    page: fitz.Page, boxes: Iterable[fitz.Rect], threshold: float
) -> bool:
    page_area = page.rect.get_area()
    if page_area <= 0:
        return False
    return any((box.get_area() / page_area) >= threshold for box in boxes)


def image_rects(page: fitz.Page, xref: int, block_map: dict[int, list[fitz.Rect]]) -> list[fitz.Rect]:
    boxes = block_map.get(xref, [])
    if boxes:
        return boxes
    try:
        return list(page.get_image_rects(xref))
    except Exception:
        return []


def ensure_extension(ext: str) -> str:
    clean = ext.lower().lstrip(".")
    if clean == "jpeg":
        return "jpg"
    return clean or "bin"


def write_manifest_csv(path: Path, rows: list[ExtractedImage]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(asdict(rows[0]).keys()))
        writer.writeheader()
        for row in rows:
            writer.writerow(asdict(row))


def write_rows_csv(path: Path, rows: list[object]) -> None:
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(asdict(rows[0]).keys()))
        writer.writeheader()
        for row in rows:
            writer.writerow(asdict(row))


def pixmap_to_rgb_array(pixmap: fitz.Pixmap) -> np.ndarray:
    if pixmap.alpha:
        pixmap = fitz.Pixmap(fitz.csRGB, pixmap)
    data = np.frombuffer(pixmap.samples, dtype=np.uint8)
    return data.reshape(pixmap.height, pixmap.width, pixmap.n)


def load_manga_panel_generator(src_dir: Path):
    src_dir = src_dir.resolve()
    if not src_dir.exists():
        raise FileNotFoundError(
            f"Manga Panel Extractor source not found: {src_dir}. "
            "Clone https://github.com/adenzu/Manga-Panel-Extractor there or pass "
            "--manga-extractor-src."
        )

    # The extractor imports image_processing.model unconditionally, but the
    # non-AI panel algorithm does not need the GUI/torch model. Stub it so this
    # script can use the library without PyQt6/yolov5 runtime dependencies.
    stub = types.ModuleType("image_processing.model")
    stub.model = None
    sys.modules.setdefault("image_processing.model", stub)

    src_path = str(src_dir)
    if src_path not in sys.path:
        sys.path.insert(0, src_path)

    from image_processing.panel import OutputMode, generate_panel_blocks

    return generate_panel_blocks, OutputMode


def load_ocr_engine():
    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError as exc:
        raise ImportError(
            "Text rejection requires rapidocr-onnxruntime. Install it with "
            "`python -m pip install rapidocr-onnxruntime`."
        ) from exc
    return RapidOCR()


def normalized_ocr_hits(crop: np.ndarray, ocr_engine, args: argparse.Namespace) -> list[str]:
    result, _elapsed = ocr_engine(crop)
    hits: list[str] = []
    for item in result or []:
        if len(item) < 3:
            continue
        text = str(item[1]).strip()
        try:
            confidence = float(item[2])
        except (TypeError, ValueError):
            confidence = 0.0
        alnum_count = sum(ch.isalnum() for ch in text)
        if confidence >= args.ocr_confidence and alnum_count >= args.ocr_min_chars:
            hits.append(text)
    return hits


def merge_rects(rects: list[tuple[int, int, int, int]], gap: int) -> list[tuple[int, int, int, int]]:
    merged = rects[:]
    changed = True
    while changed:
        changed = False
        result: list[tuple[int, int, int, int]] = []
        while merged:
            ax, ay, aw, ah = merged.pop()
            a = (ax - gap, ay - gap, ax + aw + gap, ay + ah + gap)
            combined = False
            for index, (bx, by, bw, bh) in enumerate(result):
                b = (bx, by, bx + bw, by + bh)
                overlaps = not (a[2] < b[0] or b[2] < a[0] or a[3] < b[1] or b[3] < a[1])
                if overlaps:
                    x1 = min(ax, bx)
                    y1 = min(ay, by)
                    x2 = max(ax + aw, bx + bw)
                    y2 = max(ay + ah, by + bh)
                    result[index] = (x1, y1, x2 - x1, y2 - y1)
                    changed = True
                    combined = True
                    break
            if not combined:
                result.append((ax, ay, aw, ah))
        merged = result
    return sorted(merged, key=lambda rect: (rect[1], rect[0]))


def panel_score(crop: np.ndarray) -> float:
    gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(gray, 80, 180)
    edge_density = float(np.count_nonzero(edges)) / float(edges.size)
    dark_density = float(np.count_nonzero(gray < 210)) / float(gray.size)
    return round((edge_density * 0.6) + (dark_density * 0.4), 4)


def is_likely_text_only_panel(
    crop: np.ndarray,
    width: int,
    height: int,
    score: float,
    args: argparse.Namespace,
) -> bool:
    if args.keep_text_only:
        return False

    aspect = width / max(height, 1)
    if height <= 340 and aspect >= 1.35:
        return True
    if height <= args.text_panel_max_height and aspect >= args.text_panel_min_aspect:
        return True

    gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
    _, binary = cv2.threshold(gray, 190, 255, cv2.THRESH_BINARY_INV)
    dark_ratio = float(np.count_nonzero(binary)) / float(binary.size)
    horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (35, 3))
    horizontal = cv2.morphologyEx(binary, cv2.MORPH_OPEN, horizontal_kernel)
    horizontal_ratio = float(np.count_nonzero(horizontal)) / float(binary.size)

    return (
        height <= args.text_panel_max_height * 1.35
        and aspect >= 1.45
        and score < 0.19
        and dark_ratio < 0.22
        and horizontal_ratio > 0.006
    )


def detect_panels(image: np.ndarray, args: argparse.Namespace) -> list[tuple[int, int, int, int, float]]:
    page_height, page_width = image.shape[:2]
    page_area = page_width * page_height
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)

    # Keep mid/dark continuous visual regions, then close gaps inside drawings.
    _, ink = cv2.threshold(gray, 224, 255, cv2.THRESH_BINARY_INV)
    close_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 25))
    closed = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, close_kernel, iterations=2)
    open_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    cleaned = cv2.morphologyEx(closed, cv2.MORPH_OPEN, open_kernel, iterations=1)

    contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates: list[tuple[int, int, int, int]] = []
    for contour in contours:
        x, y, width, height = cv2.boundingRect(contour)
        area_ratio = (width * height) / page_area
        if width < args.panel_min_width or height < args.panel_min_height:
            continue
        if area_ratio < args.panel_min_area_ratio or area_ratio > args.panel_max_area_ratio:
            continue

        crop = gray[y : y + height, x : x + width]
        dark_ratio = float(np.count_nonzero(crop < 224)) / float(crop.size)
        if dark_ratio < 0.035:
            continue

        candidates.append((x, y, width, height))

    merged = merge_rects(candidates, gap=24)
    scored: list[tuple[int, int, int, int, float]] = []
    for x, y, width, height in merged:
        crop = image[y : y + height, x : x + width]
        score = panel_score(crop)
        if is_likely_text_only_panel(crop, width, height, score, args):
            continue
        if score >= 0.025:
            scored.append((x, y, width, height, score))
    return scored


def extract_panels_from_pdf(
    pdf_path: Path,
    output_dir: Path,
    args: argparse.Namespace,
    text_rejected: list[TextRejectedPanel],
) -> list[ExtractedPanel]:
    panels: list[ExtractedPanel] = []
    volume = pdf_path.stem
    volume_dir = output_dir / volume
    scale = args.dpi / 72
    matrix = fitz.Matrix(scale, scale)
    manga_generator = None
    manga_output_mode = None
    if args.panel_backend == "manga":
        manga_generator, manga_output_mode = load_manga_panel_generator(
            args.manga_extractor_src
        )
    ocr_engine = load_ocr_engine() if args.reject_text else None

    with fitz.open(pdf_path) as document:
        total_pages = len(document)
        page_limit = min(args.max_pages or total_pages, total_pages)
        for page_number, page in enumerate(document, start=1):
            if page_number > page_limit:
                break
            if args.progress_every and (
                page_number == 1 or page_number % args.progress_every == 0
            ):
                print(f"{volume}: rendering page {page_number}/{page_limit}", flush=True)

            pixmap = page.get_pixmap(matrix=matrix, colorspace=fitz.csRGB, alpha=False)
            image = pixmap_to_rgb_array(pixmap)
            if manga_generator is not None and manga_output_mode is not None:
                bgr_image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
                raw_panels = manga_generator(
                    bgr_image,
                    split_joint_panels=args.manga_split_joint_panels,
                    fallback=args.manga_fallback,
                    mode=manga_output_mode.BOUNDING,
                )
                crops = [cv2.cvtColor(panel, cv2.COLOR_BGR2RGB) for panel in raw_panels]
            else:
                detected = detect_panels(image, args)
                crops = []
                for x, y, width, height, _score in detected:
                    padding = args.panel_padding
                    x1 = max(0, x - padding)
                    y1 = max(0, y - padding)
                    x2 = min(image.shape[1], x + width + padding)
                    y2 = min(image.shape[0], y + height + padding)
                    crops.append(image[y1:y2, x1:x2])

            for panel_index, crop in enumerate(crops, start=1):
                height, width = crop.shape[:2]
                score = panel_score(crop)
                page_area = image.shape[0] * image.shape[1]
                area_ratio = (width * height) / page_area
                if (
                    width < args.panel_min_width
                    or height < args.panel_min_height
                    or area_ratio < args.panel_min_area_ratio
                    or area_ratio > args.panel_max_area_ratio
                ):
                    continue
                if is_likely_text_only_panel(crop, width, height, score, args):
                    continue
                if ocr_engine is not None:
                    text_hits = normalized_ocr_hits(crop, ocr_engine, args)
                    if text_hits:
                        text_rejected.append(
                            TextRejectedPanel(
                                volume=volume,
                                page=page_number,
                                panel_index=panel_index,
                                width=width,
                                height=height,
                                text_hits=len(text_hits),
                                text=" | ".join(text_hits[:12]),
                            )
                        )
                        continue

                filename = f"{volume}_p{page_number:04d}_panel{panel_index:02d}.png"
                destination = volume_dir / filename
                if not args.dry_run:
                    volume_dir.mkdir(parents=True, exist_ok=True)
                    Image.fromarray(crop).save(destination)

                panels.append(
                    ExtractedPanel(
                        volume=volume,
                        page=page_number,
                        panel_index=panel_index,
                        x=0,
                        y=0,
                        width=width,
                        height=height,
                        score=score,
                        output_path=str(destination),
                    )
                )

    return panels


def extract_from_pdf(
    pdf_path: Path,
    output_dir: Path,
    seen_hashes: set[str],
    args: argparse.Namespace,
) -> tuple[list[ExtractedImage], list[SkippedImage]]:
    extracted: list[ExtractedImage] = []
    skipped: list[SkippedImage] = []
    volume = pdf_path.stem
    volume_dir = output_dir / volume

    with fitz.open(pdf_path) as document:
        total_pages = len(document)
        page_limit = min(args.max_pages or total_pages, total_pages)
        for page_number, page in enumerate(document, start=1):
            if page_number > page_limit:
                break
            if args.progress_every and (
                page_number == 1 or page_number % args.progress_every == 0
            ):
                print(f"{volume}: scanning page {page_number}/{page_limit}", flush=True)

            block_map = image_blocks_by_xref(page)
            for image_index, image_info in enumerate(page.get_images(full=True), start=1):
                xref = int(image_info[0])
                width = int(image_info[2])
                height = int(image_info[3])

                def skip(reason: str) -> None:
                    skipped.append(
                        SkippedImage(
                            volume=volume,
                            page=page_number,
                            image_index=image_index,
                            xref=xref,
                            width=width,
                            height=height,
                            reason=reason,
                        )
                    )

                if width < args.min_width or height < args.min_height:
                    skip("too-small")
                    continue
                if width * height < args.min_area:
                    skip("too-small-area")
                    continue
                boxes = image_rects(page, xref, block_map)
                if not args.include_full_page and covers_most_of_page(
                    page, boxes, args.full_page_threshold
                ):
                    skip("likely-full-page-text-scan")
                    continue

                if args.dry_run:
                    extracted.append(
                        ExtractedImage(
                            volume=volume,
                            page=page_number,
                            image_index=image_index,
                            xref=xref,
                            width=width,
                            height=height,
                            extension="dry-run",
                            sha256="dry-run",
                            output_path=str(
                                volume_dir
                                / f"{volume}_p{page_number:04d}_i{image_index:02d}_x{xref}"
                            ),
                        )
                    )
                    continue

                payload = document.extract_image(xref)
                data = payload.get("image")
                if not data:
                    skip("empty-image-payload")
                    continue

                digest = hashlib.sha256(data).hexdigest()
                if not args.no_dedupe and digest in seen_hashes:
                    skip("duplicate")
                    continue
                seen_hashes.add(digest)

                extension = ensure_extension(payload.get("ext", "bin"))
                filename = f"{volume}_p{page_number:04d}_i{image_index:02d}_x{xref}.{extension}"
                destination = volume_dir / filename

                volume_dir.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(data)

                extracted.append(
                    ExtractedImage(
                        volume=volume,
                        page=page_number,
                        image_index=image_index,
                        xref=xref,
                        width=width,
                        height=height,
                        extension=extension,
                        sha256=digest,
                        output_path=str(destination),
                    )
                )

    return extracted, skipped


def main() -> int:
    args = parse_args()
    pdfs = find_pdfs(args.input_dir, args.pattern)

    if args.clean_output and args.output_dir.exists():
        output_root = args.output_dir.resolve()
        cwd = Path.cwd().resolve()
        if cwd not in output_root.parents:
            raise ValueError(f"Refusing to clean output outside workspace: {output_root}")
        shutil.rmtree(args.output_dir)
    args.output_dir.mkdir(parents=True, exist_ok=True)

    if args.mode == "panels":
        panels: list[ExtractedPanel] = []
        text_rejected: list[TextRejectedPanel] = []
        for pdf_path in pdfs:
            pdf_panels = extract_panels_from_pdf(
                pdf_path, args.output_dir, args, text_rejected
            )
            panels.extend(pdf_panels)
            print(f"{pdf_path.name}: extracted {len(pdf_panels)} panels")

        write_rows_csv(args.output_dir / "manifest.csv", panels)
        (args.output_dir / "manifest.json").write_text(
            json.dumps([asdict(row) for row in panels], indent=2),
            encoding="utf-8",
        )
        (args.output_dir / "text-rejected.json").write_text(
            json.dumps([asdict(row) for row in text_rejected], indent=2),
            encoding="utf-8",
        )
        print(f"Total extracted panels: {len(panels)}")
        print(f"Text-rejected panels: {len(text_rejected)}")
        print(f"Output: {args.output_dir}")
        return 0

    seen_hashes: set[str] = set()
    extracted: list[ExtractedImage] = []
    skipped: list[SkippedImage] = []

    for pdf_path in pdfs:
        pdf_extracted, pdf_skipped = extract_from_pdf(
            pdf_path=pdf_path,
            output_dir=args.output_dir,
            seen_hashes=seen_hashes,
            args=args,
        )
        extracted.extend(pdf_extracted)
        skipped.extend(pdf_skipped)
        print(
            f"{pdf_path.name}: extracted {len(pdf_extracted)}, "
            f"skipped {len(pdf_skipped)}"
        )

    if extracted:
        write_manifest_csv(args.output_dir / "manifest.csv", extracted)
    (args.output_dir / "manifest.json").write_text(
        json.dumps([asdict(row) for row in extracted], indent=2),
        encoding="utf-8",
    )
    (args.output_dir / "skipped.json").write_text(
        json.dumps([asdict(row) for row in skipped], indent=2),
        encoding="utf-8",
    )

    print(f"Total extracted: {len(extracted)}")
    print(f"Total skipped: {len(skipped)}")
    print(f"Output: {args.output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
