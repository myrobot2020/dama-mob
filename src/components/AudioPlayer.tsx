import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Square, Volume2 } from "lucide-react";

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function AudioPlayer({
  src,
  label,
  start,
  end,
}: {
  /** Full URL to MP3 (e.g. /aud/file.mp3 via Vite proxy). */
  src: string;
  label: string;
  start: number;
  end: number;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Mirrors `HTMLMediaElement.currentTime` while loaded. */
  const [audioTime, setAudioTime] = useState(0);
  const [volume, setVolume] = useState(1);

  const clipLen = Math.max(0, end - start);
  const seg = Math.min(clipLen, Math.max(0, Math.min(audioTime, end) - start));

  const tick = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    setAudioTime(el.currentTime);
    if (el.currentTime >= end - 0.05) {
      el.pause();
      el.currentTime = start;
      setAudioTime(start);
      setPlaying(false);
    }
  }, [end, start]);

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
    el.addEventListener("timeupdate", tick);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("timeupdate", tick);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
    };
  }, [tick]);

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
    if (!el || !src) return;
    setLoadError(null);
    if (playing) {
      el.pause();
      return;
    }
    try {
      el.currentTime = start;
      setAudioTime(start);
      await el.play();
    } catch {
      setLoadError("Could not play audio.");
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
          disabled={!src || clipLen <= 0}
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
          {loadError && (
            <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
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
