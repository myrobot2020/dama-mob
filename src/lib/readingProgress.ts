/**
 * Persists basic reading progress per sutta on this device.
 *
 * This is intentionally lightweight:
 * - `openedAtMs`: last time the sutta screen was opened
 * - `openCount`: number of opens (best-effort)
 * - `readAtMs`: when user explicitly marked it as read
 */

import type { NikayaId } from "./damaApi";
import { inferNikayaFromSuttaId } from "./damaApi";

export const READING_PROGRESS_STORAGE_KEY = "dama:readingProgress";

export type ReadingProgressItem = {
  openedAtMs?: number;
  openCount?: number;
  readAtMs?: number;
};

export type ReadingProgressMap = Record<string, ReadingProgressItem>;

export const EMPTY_READING_PROGRESS_MAP: ReadingProgressMap = Object.freeze({});

const listeners = new Set<() => void>();

let cachedFingerprint: string | null = null;
let cachedSnapshot: ReadingProgressMap = EMPTY_READING_PROGRESS_MAP;

function parseStored(raw: string): ReadingProgressMap {
  if (!raw) return EMPTY_READING_PROGRESS_MAP;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return EMPTY_READING_PROGRESS_MAP;
    const out: ReadingProgressMap = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (!val || typeof val !== "object") continue;
      const it = val as Record<string, unknown>;
      const openedAtMs = typeof it.openedAtMs === "number" ? it.openedAtMs : Number(it.openedAtMs);
      const openCount = typeof it.openCount === "number" ? it.openCount : Number(it.openCount);
      const readAtMs = typeof it.readAtMs === "number" ? it.readAtMs : Number(it.readAtMs);
      out[k] = {
        openedAtMs: Number.isFinite(openedAtMs) ? openedAtMs : undefined,
        openCount: Number.isFinite(openCount) ? Math.max(0, Math.floor(openCount)) : undefined,
        readAtMs: Number.isFinite(readAtMs) ? readAtMs : undefined,
      };
    }
    return out;
  } catch {
    return EMPTY_READING_PROGRESS_MAP;
  }
}

function storageFingerprint(): string {
  return localStorage.getItem(READING_PROGRESS_STORAGE_KEY) ?? "";
}

function notifyReadingProgress(): void {
  for (const cb of listeners) cb();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === READING_PROGRESS_STORAGE_KEY || e.key === null) {
      cachedFingerprint = null;
      notifyReadingProgress();
    }
  });
}

export function subscribeReadingProgress(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export function readReadingProgress(): ReadingProgressMap {
  if (typeof window === "undefined") return EMPTY_READING_PROGRESS_MAP;
  const fp = storageFingerprint();
  if (cachedFingerprint !== null && fp === cachedFingerprint) return cachedSnapshot;
  cachedFingerprint = fp;
  cachedSnapshot = parseStored(fp);
  return cachedSnapshot;
}

function writeReadingProgress(next: ReadingProgressMap): void {
  localStorage.setItem(READING_PROGRESS_STORAGE_KEY, JSON.stringify(next));
  cachedFingerprint = storageFingerprint();
  cachedSnapshot = next;
  notifyReadingProgress();
}

export function resetReadingProgress(): void {
  if (typeof window === "undefined") return;
  writeReadingProgress({});
}

/**
 * Best-effort merge for syncing: for each sutta, keep the max timestamps and max openCount.
 */
export function mergeReadingProgress(incoming: ReadingProgressMap): void {
  if (typeof window === "undefined") return;
  const prev = readReadingProgress();
  let changed = false;
  const next: ReadingProgressMap = { ...prev };
  for (const [id, inc] of Object.entries(incoming)) {
    const sid = id.trim();
    if (!sid || !inc) continue;
    const cur = prev[sid] ?? {};
    const merged: ReadingProgressItem = {
      openedAtMs: Math.max(cur.openedAtMs ?? 0, inc.openedAtMs ?? 0) || undefined,
      readAtMs: Math.max(cur.readAtMs ?? 0, inc.readAtMs ?? 0) || undefined,
      openCount: Math.max(cur.openCount ?? 0, inc.openCount ?? 0) || undefined,
    };
    const same =
      (cur.openedAtMs ?? undefined) === merged.openedAtMs &&
      (cur.readAtMs ?? undefined) === merged.readAtMs &&
      (cur.openCount ?? undefined) === merged.openCount;
    if (!same) {
      next[sid] = merged;
      changed = true;
    }
  }
  if (changed) writeReadingProgress(next);
}

export function recordSuttaOpened(suttaId: string, nowMs: number = Date.now()): void {
  if (typeof window === "undefined") return;
  const id = suttaId.trim();
  if (!id) return;
  const prev = readReadingProgress();
  const prevItem = prev[id] ?? {};
  const nextItem: ReadingProgressItem = {
    openedAtMs: nowMs,
    openCount: (prevItem.openCount ?? 0) + 1,
    readAtMs: prevItem.readAtMs,
  };
  writeReadingProgress({ ...prev, [id]: nextItem });
}

export function markSuttaRead(suttaId: string, nowMs: number = Date.now()): void {
  if (typeof window === "undefined") return;
  const id = suttaId.trim();
  if (!id) return;
  const prev = readReadingProgress();
  const prevItem = prev[id] ?? {};
  const nextItem: ReadingProgressItem = {
    openedAtMs: prevItem.openedAtMs,
    openCount: prevItem.openCount,
    readAtMs: nowMs,
  };
  writeReadingProgress({ ...prev, [id]: nextItem });
}

export function clearSuttaRead(suttaId: string): void {
  if (typeof window === "undefined") return;
  const id = suttaId.trim();
  if (!id) return;
  const prev = readReadingProgress();
  const prevItem = prev[id];
  if (!prevItem) return;
  writeReadingProgress({ ...prev, [id]: { ...prevItem, readAtMs: undefined } });
}

export function getReadSuttaIds(map: ReadingProgressMap): string[] {
  return Object.entries(map)
    .filter(([, it]) => Boolean(it.readAtMs))
    .map(([id]) => id)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

export function countReadByNikaya(ids: string[]): Record<NikayaId, number> {
  const counts: Record<NikayaId, number> = { AN: 0, SN: 0, DN: 0, MN: 0, KN: 0 };
  for (const id of ids) {
    counts[inferNikayaFromSuttaId(id)]++;
  }
  return counts;
}
