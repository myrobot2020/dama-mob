import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Square, Volume2 } from "lucide-react";
import { recordAudioListenProgress } from "@/lib/audioListenProgress";

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function extFromSrc(src: string): string {
  const t = (src || "").split("?")[0]?.split("#")[0] ?? "";
  const dot = t.lastIndexOf(".");
  if (dot < 0) return "";
  return t.slice(dot + 1).trim().toLowerCase();
}

function canBrowserPlayAudioExt(ext: string): boolean | null {
  if (!ext) return null;
  if (typeof document === "undefined") return null;
  const el = document.createElement("audio");
  if (ext === "mp3" || ext === "mpeg") {
    const v = el.canPlayType("audio/mpeg");
    return v === "probably" || v === "maybe";
  }
  if (ext === "m4a" || ext === "mp4" || ext === "aac") {
    const v = el.canPlayType("audio/mp4");
    return v === "probably" || v === "maybe";
  }
  if (ext === "opus") {
    const v = el.canPlayType("audio/opus");
    return v === "probably" || v === "maybe";
  }
  if (ext === "webm" || ext === "weba") {
    // Common for YouTube/Opus-derived artifacts; not supported in Safari/iOS.
    const v = el.canPlayType("audio/webm");
    return v === "probably" || v === "maybe";
  }
  return null;
}

function mediaErrorMessage(code: number | undefined): string {
  // https://developer.mozilla.org/en-US/docs/Web/API/MediaError/code
  if (code === 1) return "Playback aborted.";
  if (code === 2) return "Network error while loading audio.";
  if (code === 3) return "Audio decode error (unsupported or corrupted file).";
  if (code === 4) return "Audio source not supported or missing.";
  return "Could not play audio.";
}

export function AudioPlayer({
  src,
  label,
  start,
  end,
  suttaId,
}: {
  /** Full URL to MP3 (e.g. /aud/file.mp3 via Vite proxy). */
  src: string;
  label: string;
  start: number;
  end: number;
  /** When set, max listen position within the clip is saved for the Tree page (≥75%). */
  suttaId?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Mirrors `HTMLMediaElement.currentTime` while loaded. */
  const [audioTime, setAudioTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [formatSupported, setFormatSupported] = useState<boolean | null>(null);

  const srcExt = useMemo(() => extFromSrc(src), [src]);

  const clipLen = Math.max(0, end - start);
  const seg = Math.min(clipLen, Math.max(0, Math.min(audioTime, end) - start));

  const tick = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    setAudioTime(el.currentTime);
    const sid = suttaId?.trim();
    if (sid && clipLen > 0) {
      const segNow = Math.min(clipLen, Math.max(0, Math.min(el.currentTime, end) - start));
      recordAudioListenProgress(sid, segNow / clipLen);
    }
    if (el.currentTime >= end - 0.05) {
      el.pause();
      el.currentTime = start;
      setAudioTime(start);
      setPlaying(false);
    }
  }, [clipLen, end, start, suttaId]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = volume;
  }, [volume]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onError = () => {
      const code = el.error?.code;
      const msg = mediaErrorMessage(code);
      setLoadError(msg);
      setPlaying(false);
    };
    el.addEventListener("timeupdate", tick);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("timeupdate", tick);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("error", onError);
    };
  }, [tick]);

  useEffect(() => {
    // Avoid SSR/hydration mismatch: compute support after mount.
    setLoadError(null);
    setPlaying(false);
    setAudioTime(0);
    const v = canBrowserPlayAudioExt(srcExt);
    setFormatSupported(v);
  }, [src, srcExt]);

  const formatBlockedReason =
    formatSupported === false && (srcExt === "webm" || srcExt === "weba")
      ? "This browser can't play WebM audio. Use the YouTube link, or try Chrome/Firefox."
      : formatSupported === false
        ? "This browser can't play this audio format."
        : null;

  const stop = () => {
    const el = audioRef.current;
    if (!el) return;
    el.pause();
    el.currentTime = start;
    setAudioTime(start);
    setPlaying(false);
  };

  const toggle = async () => {
    const el = audioRef.current;
    if (!el || !src || formatSupported === false) return;
    setLoadError(null);
    if (playing) {
      el.pause();
      return;
    }
    try {
      try {
        el.currentTime = start;
      } catch {
        // Some browsers will throw if metadata isn't ready or the source is not seekable yet.
      }
      setAudioTime(start);
      await el.play();
    } catch {
      const msg = mediaErrorMessage(el.error?.code);
      setLoadError(msg);
      setPlaying(false);
    }
  };

  const seek = (clipOffset: number) => {
    const el = audioRef.current;
    if (!el || clipLen <= 0) return;
    const t = start + Math.min(clipLen, Math.max(0, clipOffset));
    el.currentTime = t;
    setAudioTime(t);
  };

  return (
    <div className="glass rounded-2xl p-4 flex flex-col gap-3">
      <audio ref={audioRef} src={src || undefined} preload="metadata" />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={!src || clipLen <= 0 || formatSupported === false}
          className="size-12 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center animate-pulse-glow disabled:opacity-40"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
        </button>
        <button
          type="button"
          onClick={stop}
          disabled={!src || clipLen <= 0}
          className="size-10 shrink-0 rounded-full glass flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
          aria-label="Stop"
        >
          <Square size={16} fill="currentColor" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{label}</div>
          {(formatBlockedReason || loadError) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {formatBlockedReason || loadError}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <label className="sr-only" htmlFor="audio-seek">
          Seek
        </label>
        <input
          id="audio-seek"
          type="range"
          aria-label="Seek"
          min={0}
          max={clipLen || 1}
          step={0.05}
          value={Number.isFinite(seg) ? seg : 0}
          disabled={!src || clipLen <= 0}
          onChange={(e) => seek(Number(e.target.value))}
          className="w-full h-2 rounded-full appearance-none bg-white/10 accent-primary cursor-pointer disabled:opacity-40 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary"
        />
        <div className="flex justify-between label-mono normal-case text-muted-foreground text-[11px]">
          <span>{fmt(seg)}</span>
          <span>{fmt(clipLen)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Volume2 size={16} className="shrink-0 text-muted-foreground" aria-hidden />
        <label className="sr-only" htmlFor="audio-vol">
          Volume
        </label>
        <input
          id="audio-vol"
          type="range"
          aria-label="Volume"
          min={0}
          max={1}
          step={0.02}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="flex-1 min-w-0 h-2 rounded-full appearance-none bg-white/10 accent-primary cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary"
        />
      </div>
    </div>
  );
}

/** Native `<audio controls>` with the same listen-progress tracking as {@link AudioPlayer}. */
export function TrackedNativeAudio({
  src,
  suttaId,
  className,
}: {
  src: string;
  suttaId: string;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = audioRef.current;
    const sid = suttaId.trim();
    if (!el || !sid) return;
    const onTime = () => {
      const d = el.duration;
      if (!Number.isFinite(d) || d <= 0) return;
      recordAudioListenProgress(sid, el.currentTime / d);
    };
    el.addEventListener("timeupdate", onTime);
    return () => el.removeEventListener("timeupdate", onTime);
  }, [suttaId, src]);

  return (
    <audio ref={audioRef} controls className={className ?? "w-full"} src={src} preload="metadata" />
  );
}
