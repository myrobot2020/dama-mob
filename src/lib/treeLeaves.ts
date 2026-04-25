import {
  anBookFromSuttaId,
  filterItemsByNikaya,
  filterItemsByNikayaBook,
  filterItemsByNipata,
  inferNikayaFromSuttaId,
  otherNikayaBookFromSuttaId,
  type ItemSummary,
  type NikayaId,
} from "./damaApi";
import { hydrateLeaf, type Leaf, type LeavesStore } from "./leaves";

export type TreeBook = {
  nikaya: NikayaId;
  book: string;
};

export function resolveTreeBook(focus: string | undefined | null): TreeBook {
  const id = (focus ?? "").trim();
  const nikaya = id ? inferNikayaFromSuttaId(id) : "AN";
  if (nikaya === "AN") return { nikaya, book: String(anBookFromSuttaId(id) ?? 1) };
  return { nikaya, book: String(otherNikayaBookFromSuttaId(id) ?? 1) };
}

export function getSuttasForTreeBook(items: ItemSummary[], treeBook: TreeBook): ItemSummary[] {
  const nikayaItems = filterItemsByNikaya(items, treeBook.nikaya);
  const filtered =
    treeBook.nikaya === "AN"
      ? filterItemsByNipata(nikayaItems, treeBook.book)
      : filterItemsByNikayaBook(items, treeBook.nikaya, treeBook.book);
  return [...filtered].sort((a, b) =>
    a.suttaid.localeCompare(b.suttaid, undefined, { numeric: true }),
  );
}

export function buildTreeLeaves(
  suttasInBook: ItemSummary[],
  leaves: LeavesStore,
  nowMs: number,
  hasCorpusIndex: boolean,
): Leaf[] {
  if (hasCorpusIndex) {
    return suttasInBook.map((it) => {
      const saved = leaves[it.suttaid];
      return saved
        ? hydrateLeaf(saved, nowMs)
        : { suttaId: it.suttaid, state: "grey", createdAtMs: nowMs, updatedAtMs: nowMs };
    });
  }

  return Object.keys(leaves)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((id) => hydrateLeaf(leaves[id]!, nowMs));
}
