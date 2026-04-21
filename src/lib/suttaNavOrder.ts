import {
  type ItemSummary,
  anBookFromSuttaId,
  filterItemsByNikaya,
  filterItemsByNikayaBook,
  filterItemsByNipata,
  inferNikayaFromSuttaId,
  otherNikayaBookFromSuttaId,
} from "./damaApi";

export function sortSuttaIds(items: ItemSummary[]): ItemSummary[] {
  return [...items].sort((a, b) =>
    a.suttaid.localeCompare(b.suttaid, undefined, { numeric: true }),
  );
}

/** Ordered list for the same nikāya + book as the sutta picker in {@link CorpusHeaderNav}. */
export function getSuttasInSameBook(items: ItemSummary[], currentSuttaId: string): ItemSummary[] {
  const nk = inferNikayaFromSuttaId(currentSuttaId);
  const nikayaItems = filterItemsByNikaya(items, nk);
  if (nk === "AN") {
    const b = anBookFromSuttaId(currentSuttaId);
    const bookStr = b != null ? String(b) : "1";
    return sortSuttaIds(filterItemsByNipata(nikayaItems, bookStr));
  }
  const ob = otherNikayaBookFromSuttaId(currentSuttaId);
  const bookStr = ob != null ? String(ob) : "1";
  return sortSuttaIds(filterItemsByNikayaBook(items, nk, bookStr));
}

export function getNextSuttaInBook(items: ItemSummary[], currentSuttaId: string): ItemSummary | null {
  const list = getSuttasInSameBook(items, currentSuttaId);
  const idx = list.findIndex((x) => x.suttaid === currentSuttaId);
  if (idx < 0) return null;
  return list[idx + 1] ?? null;
}

export function getFirstSuttaGlobally(items: ItemSummary[]): ItemSummary | null {
  const sorted = sortSuttaIds(items);
  return sorted[0] ?? null;
}

export function parseSuttaRouteId(pathname: string): string | undefined {
  const normalized = pathname.replace(/\/$/, "") || "/";
  const prefix = "/sutta/";
  if (!normalized.startsWith(prefix)) return undefined;
  const rest = normalized.slice(prefix.length);
  if (!rest || rest.includes("/")) return undefined;
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}
