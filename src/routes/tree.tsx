import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { BottomNav } from "@/components/BottomNav";
import { AN_BOOK_TITLES, getItems, NIKAYA_OPTIONS, type ItemSummary } from "@/lib/damaApi";
import { ensureLeaf, readLeaves, subscribeLeaves, upsertHydratedLeaf } from "@/lib/leaves";
import {
  clearSuttasRead,
  getReadSuttaIds,
  markSuttaRead,
  clearSuttaRead,
  markSuttasRead,
  readReadingProgress,
  subscribeReadingProgress,
} from "@/lib/readingProgress";
import {
  buildTreeLeaves,
  countTreeItemsByCollection,
  getSuttasForTreeBook,
  getTreeBooksForNikaya,
  resolveTreeBook,
  type TreeCollection,
} from "@/lib/treeLeaves";
import { Check, Leaf, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/tree")({
  head: () => ({
    meta: [{ title: "Tree — DAMA" }, { name: "description", content: "Quest tree." }],
  }),
  component: TreeScreen,
});

const EMPTY_LEAVES = {};
const EMPTY_READING_PROGRESS = {};

function TreeScreen() {
  const search = Route.useSearch() as { focus?: string | undefined };
  const focus = (search?.focus || "").trim();

  const leaves = useSyncExternalStore(subscribeLeaves, readLeaves, () => EMPTY_LEAVES);
  const readingProgress = useSyncExternalStore(
    subscribeReadingProgress,
    readReadingProgress,
    () => EMPTY_READING_PROGRESS,
  );
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "error" | "ok">("loading");

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    setLoadState("loading");
    getItems({ book: "all" }, ac.signal)
      .then((data) => {
        if (cancelled) return;
        setItems(Array.isArray(data.items) ? data.items : []);
        setLoadState("ok");
      })
      .catch(() => {
        if (cancelled) return;
        setItems([]);
        setLoadState("error");
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

  useEffect(() => {
    if (!focus) return;
    ensureLeaf(focus);
    upsertHydratedLeaf(focus);
  }, [focus]);

  useEffect(() => {
    // Best-effort: persist any automatic state transitions (green->yellow, yellow->grey).
    for (const id of Object.keys(leaves)) upsertHydratedLeaf(id);
  }, [leaves]);

  useEffect(() => {
    // Tick hydration so short demo windows (e.g. 7 seconds) visibly update without user interaction.
    const t = window.setInterval(() => {
      for (const id of Object.keys(readLeaves())) upsertHydratedLeaf(id);
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  const treeBook = useMemo(() => resolveTreeBook(focus), [focus]);
  const [selectedNikaya, setSelectedNikaya] = useState<TreeCollection>(treeBook.nikaya);
  const [selectedBook, setSelectedBook] = useState(treeBook.book);

  useEffect(() => {
    setSelectedNikaya(treeBook.nikaya);
    setSelectedBook(treeBook.book);
  }, [treeBook.book, treeBook.nikaya]);

  const availableBooks = useMemo(
    () => getTreeBooksForNikaya(items, selectedNikaya),
    [items, selectedNikaya],
  );
  const collectionCounts = useMemo(() => countTreeItemsByCollection(items), [items]);

  useEffect(() => {
    if (availableBooks.length === 0) return;
    if (!availableBooks.includes(selectedBook)) setSelectedBook(availableBooks[0]);
  }, [availableBooks, selectedBook]);

  const activeTreeBook = useMemo(
    () => ({ nikaya: selectedNikaya, book: selectedBook }),
    [selectedBook, selectedNikaya],
  );

  const suttasInBook = useMemo(() => {
    return getSuttasForTreeBook(items, activeTreeBook);
  }, [activeTreeBook, items]);

  const ordered = useMemo(() => {
    return buildTreeLeaves(suttasInBook, leaves, Date.now(), loadState === "ok");
  }, [leaves, loadState, suttasInBook]);

  const bookLabel = useMemo(() => {
    if (selectedNikaya === "ALL") return `All collections · ${ordered.length} leaves`;
    const nikayaLabel =
      NIKAYA_OPTIONS.find((option) => option.value === selectedNikaya)?.label ?? selectedNikaya;
    if (selectedNikaya === "AN") {
      const n = parseInt(selectedBook, 10);
      return `${
        selectedBook === "all" ? "All Aṅguttara" : (AN_BOOK_TITLES[n] ?? `Book ${selectedBook}`)
      } · ${ordered.length} leaves`;
    }
    return `${nikayaLabel} ${selectedBook === "all" ? "All books" : `Book ${selectedBook}`} · ${
      ordered.length
    } leaves`;
  }, [ordered.length, selectedBook, selectedNikaya]);

  const readIds = useMemo(() => new Set(getReadSuttaIds(readingProgress)), [readingProgress]);
  const readCount = useMemo(
    () => ordered.filter((leaf) => readIds.has(leaf.suttaId)).length,
    [ordered, readIds],
  );
  const allRead = ordered.length > 0 && readCount === ordered.length;

  return (
    <div className="min-h-screen dama-screen">
      <ScreenHeader title="Tree" showBack={false} />
      <div className="px-5 pt-6 pb-[var(--dama-bottom-pad,0px)]">
        <div>
          <div className="flex items-end justify-between gap-3">
            <div className="label-mono text-primary">Leaves</div>
            <div className="text-[11px] text-muted-foreground label-mono normal-case">
              {bookLabel}
            </div>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {[{ value: "ALL" as const, label: "ALL" }, ...NIKAYA_OPTIONS].map((option) => {
              const active = selectedNikaya === option.value;
              const count = collectionCounts[option.value];
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedNikaya(option.value)}
                  disabled={count === 0}
                  className={`shrink-0 rounded-xl px-3 py-2 text-xs font-medium ring-1 transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground ring-primary"
                      : count === 0
                        ? "bg-background/15 text-muted-foreground/35 ring-white/5"
                        : "bg-background/35 text-muted-foreground ring-white/10"
                  }`}
                  title={`${count} indexed suttas`}
                >
                  {option.label}
                  <span className="ml-1 opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
          {availableBooks.length > 0 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {availableBooks.map((book) => {
                const active = selectedBook === book;
                return (
                  <button
                    key={book}
                    type="button"
                    onClick={() => setSelectedBook(book)}
                    className={`shrink-0 rounded-xl px-3 py-2 text-xs font-medium ring-1 transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground ring-primary"
                        : "bg-background/35 text-muted-foreground ring-white/10"
                    }`}
                  >
                    {book === "all" ? "All" : book}
                  </button>
                );
              })}
            </div>
          )}
          {loadState === "loading" ? (
            <p className="mt-2 text-sm text-muted-foreground">Loading leaves…</p>
          ) : loadState === "error" && ordered.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Could not load the corpus index.</p>
          ) : ordered.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No suttas found for this book.</p>
          ) : (
            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] text-muted-foreground label-mono normal-case">
                  {readCount} green · {ordered.length - readCount} grey
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const ids = ordered.map((leaf) => leaf.suttaId);
                    if (allRead) clearSuttasRead(ids);
                    else markSuttasRead(ids);
                  }}
                  className={`shrink-0 rounded-xl px-3 py-2 text-xs font-medium ring-1 transition-colors ${
                    allRead
                      ? "bg-green-400/12 text-green-400 ring-green-400/35 hover:bg-green-400/20"
                      : "bg-primary text-primary-foreground ring-primary shadow-lg shadow-primary/20 active:scale-95"
                  }`}
                >
                  {allRead ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Check size={13} /> Clear Book
                    </span>
                  ) : (
                    "Mark Book Read"
                  )}
                </button>
              </div>
              <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-2">
                {ordered.map((leaf) => {
                  const isRead = readIds.has(leaf.suttaId);
                  return (
                    <div key={leaf.suttaId} className="relative group">
                      <button
                        type="button"
                        onClick={() => {
                          if (isRead) clearSuttaRead(leaf.suttaId);
                          else markSuttaRead(leaf.suttaId);
                        }}
                        className={`w-full aspect-square rounded-xl flex items-center justify-center ring-1 transition-all active:scale-90 ${
                          isRead
                            ? "bg-green-400/12 text-green-400 ring-green-400/35 hover:bg-green-400/22"
                            : "bg-background/30 text-white/25 ring-white/10 hover:text-white/45 hover:ring-white/20"
                        }`}
                        title={isRead ? "Click to mark unread" : "Click to mark read"}
                      >
                        <Leaf size={18} fill="currentColor" aria-hidden />
                      </button>

                      <Link
                        to="/sutta/$suttaId"
                        params={{ suttaId: leaf.suttaId }}
                        className="absolute -top-1 -right-1 size-5 rounded-full bg-background border border-white/10 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors shadow-lg"
                        title={`Go to ${leaf.suttaId}`}
                      >
                        <ExternalLink size={10} />
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
