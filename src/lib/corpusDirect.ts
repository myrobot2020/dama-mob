/**
 * Read Aṅguttara sutta JSON from the sibling dama5 repo via /__dama_corpus__/ (see vite-plugin-dama-corpus-fs.ts).
 * No FastAPI needed for sutta list, reader, or MP3 in dev/preview when dama5 is present.
 */

import type { ItemDetail, ItemSummary } from "./damaApi";
import { passesCorpusGate, rawJsonToItemDetail, stripAnPrefix } from "./corpusJsonMap";

/** Set `VITE_DAMA_API_URL` to a deployed dama5 origin — then the app uses `/api` instead of local JSON. */
export function useRemoteDamaApi(): boolean {
  const raw = import.meta.env.VITE_DAMA_API_URL as string | undefined;
  return !!(raw && raw.trim());
}

/**
 * Default: **local JSON + audio** from `../dama5` via Vite. Use `VITE_DAMA_CORPUS_MODE=api` to force FastAPI `/api` instead.
 */
export function useDirectCorpusFs(): boolean {
  if (useRemoteDamaApi()) return false;
  const mode = (import.meta.env.VITE_DAMA_CORPUS_MODE as string | undefined)?.trim().toLowerCase();
  if (mode === "api") return false;
  return true;
}

/** `AN 5.3.30` / `5.3.30` → `an5/suttas/5.3.30.json` */
export function relativeJsonPathForSuttaId(suttaid: string): string | null {
  const core = stripAnPrefix(suttaid);
  if (!core) return null;
  const head = (core.split(".")[0] ?? "").trim();
  const book = parseInt(head, 10);
  if (!Number.isFinite(book) || book < 1 || book > 11) return null;
  return `an${book}/suttas/${core}.json`;
}

export async function fetchItemFromCorpusFs(suttaid: string, signal?: AbortSignal): Promise<ItemDetail> {
  const rel = relativeJsonPathForSuttaId(suttaid);
  if (!rel) throw new Error(`Cannot resolve corpus path for: ${suttaid}`);
  const url = `/__dama_corpus__/${encodeURI(rel)}`;
  const r = await fetch(url, { signal, credentials: "omit" });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `Corpus file not found (${r.status})`);
  }
  const raw = (await r.json()) as Record<string, unknown>;
  const it = rawJsonToItemDetail(raw);
  if (!passesCorpusGate(it)) {
    throw new Error("This sutta is not in the corpus (valid=false or missing audio).");
  }
  return it;
}

type IndexPayload = {
  items: ItemSummary[];
  searchRows: { suttaid: string; blob: string }[];
};

export async function fetchItemsFromCorpusFs(
  params: { q?: string } | undefined,
  signal?: AbortSignal,
): Promise<{ items: ItemSummary[] }> {
  const r = await fetch("/__dama_corpus__/index.json", { signal, credentials: "omit" });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `Corpus index failed (${r.status})`);
  }
  const data = (await r.json()) as IndexPayload;
  const qn = (params?.q ?? "").trim().toLowerCase();
  let items = data.items ?? [];
  if (qn && data.searchRows?.length) {
    const keep = new Set<string>();
    for (const row of data.searchRows) {
      if (row.blob.includes(qn)) keep.add(row.suttaid);
    }
    for (const it of items) {
      if ((it.title ?? "").toLowerCase().includes(qn)) keep.add(it.suttaid);
    }
    items = items.filter((it) => keep.has(it.suttaid));
  }
  return { items };
}
