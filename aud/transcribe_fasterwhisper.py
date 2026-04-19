import argparse
import json
import os
from pathlib import Path

import imageio_ffmpeg
from faster_whisper import WhisperModel


def _warn(msg: str) -> None:
    print(f"[warn] {msg}")


def _maybe_add_cuda_bin_to_dll_search_path() -> None:
    """
    On Windows, GPU inference may fail with:
      RuntimeError: Library cublas64_12.dll is not found or cannot be loaded

    Even when CUDA is installed, the CUDA \\bin directory isn't always on PATH for
    the current process/session. We opportunistically add common CUDA bin paths
    to both the DLL search path and PATH for this process.
    """
    if os.name != "nt":
        return

    cands: list[str] = []
    cuda_path = os.environ.get("CUDA_PATH") or os.environ.get("CUDA_HOME") or ""
    if cuda_path:
        cands.append(str(Path(cuda_path) / "bin"))

    # Common default install locations.
    cands.extend(
        [
            r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.0\bin",
            r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.1\bin",
            r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.2\bin",
            r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.3\bin",
            r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.4\bin",
        ]
    )

    # Dedup/preserve order.
    seen = set()
    uniq: list[str] = []
    for d in cands:
        dd = str(d).strip().rstrip("\\/")
        if not dd or dd in seen:
            continue
        seen.add(dd)
        uniq.append(dd)

    def has_cublas(d: str) -> bool:
        return (Path(d) / "cublas64_12.dll").is_file()

    usable = [d for d in uniq if Path(d).is_dir() and has_cublas(d)]
    if not usable:
        return

    # Add to DLL search path (preferred on Windows 3.8+).
    add_dll_dir = getattr(os, "add_dll_directory", None)
    for d in usable:
        try:
            if callable(add_dll_dir):
                add_dll_dir(d)
        except Exception:
            # Fall back to PATH injection below.
            pass

    # Also prepend to PATH for robustness.
    os.environ["PATH"] = os.pathsep.join(usable) + os.pathsep + os.environ.get("PATH", "")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mp3", required=True, help="MP3 path (relative to repo root or absolute)")
    ap.add_argument("--out", default="", help="Output JSON path (default: aud/transcripts/<mp3-stem>_segments.json)")
    ap.add_argument("--model", default="tiny", help="faster-whisper model name (tiny/base/small/medium/...)")
    ap.add_argument("--language", default="en")
    ap.add_argument("--device", default="cpu", help="faster-whisper device (cpu/cuda)")
    ap.add_argument(
        "--compute_type",
        default="int8",
        help="faster-whisper compute type (e.g. int8, int8_float16, float16)",
    )
    ap.add_argument(
        "--initial_prompt",
        default="",
        help="Optional text to bias recognition (e.g. first paragraph of a reference transcript).",
    )
    ap.add_argument(
        "--initial_prompt_file",
        default="",
        help="Like --initial_prompt but read from a UTF-8 file (used when prompt is long).",
    )
    args = ap.parse_args()

    mp3 = Path(args.mp3)
    if not mp3.is_file():
        raise SystemExit(f"MP3 not found: {mp3}")
    out_dir = Path("aud") / "transcripts"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_json = Path(args.out).resolve() if args.out.strip() else (out_dir / (mp3.stem + "_segments.json"))

    ff = imageio_ffmpeg.get_ffmpeg_exe()
    os.environ["PATH"] = str(Path(ff).parent) + os.pathsep + os.environ.get("PATH", "")

    prompt = ""
    if str(args.initial_prompt_file).strip():
        pfp = Path(args.initial_prompt_file)
        if not pfp.is_file():
            raise SystemExit(f"initial_prompt_file not found: {pfp}")
        prompt = pfp.read_text(encoding="utf-8")
    elif str(args.initial_prompt).strip():
        prompt = str(args.initial_prompt)

    # Whisper-style cap (~224 tokens); keep a generous char budget for English.
    if len(prompt) > 8000:
        prompt = prompt[:8000]

    print("Loading model…")
    device = str(args.device)
    compute_type = str(args.compute_type)
    if device.lower() == "cuda":
        _maybe_add_cuda_bin_to_dll_search_path()
    try:
        model = WhisperModel(str(args.model), device=device, compute_type=compute_type)
    except OSError as e:
        msg = str(e)
        # Common on Windows when CUDA 12 runtime DLLs aren't installed or aren't on PATH.
        if device.lower() == "cuda" and ("cublas64_12.dll" in msg.lower() or "cublas64_12.dll" in msg):
            _warn(
                "CUDA requested but CUDA 12 cuBLAS runtime DLL not found (cublas64_12.dll). "
                "Falling back to CPU. Install CUDA 12 runtime libs to enable GPU."
            )
            device = "cpu"
            if compute_type.lower() in ("float16", "int8_float16"):
                compute_type = "int8"
            model = WhisperModel(str(args.model), device=device, compute_type=compute_type)
        else:
            raise
    print("Transcribing…")
    transcribe_kw = {"language": str(args.language), "beam_size": 5, "vad_filter": True}
    if prompt.strip():
        transcribe_kw["initial_prompt"] = prompt.strip()
        print(f"initial_prompt chars: {len(transcribe_kw['initial_prompt'])}")
    segments, info = model.transcribe(str(mp3), **transcribe_kw)

    rows = [{"start": float(s.start), "end": float(s.end), "text": (s.text or "").strip()} for s in segments]
    data = {
        "source": "faster-whisper",
        "model": str(args.model),
        "device": device,
        "compute_type": compute_type,
        "language": getattr(info, "language", None),
        "duration": getattr(info, "duration", None),
        "segments": rows,
    }
    out_json.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {out_json}")
    print(f"segments {len(rows)} duration_s {data['duration']}")


if __name__ == "__main__":
    main()

