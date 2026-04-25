import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { BottomNav } from "@/components/BottomNav";
import treeImg from "@/assets/dhamma-tree.jpg";
import {
  AN_BOOK_TITLES,
  getItems,
  type ItemSummary,
} from "@/lib/damaApi";
import { ensureLeaf, readLeaves, subscribeLeaves, upsertHydratedLeaf } from "@/lib/leaves";
import { buildTreeLeaves, getSuttasForTreeBook, resolveTreeBook } from "@/lib/treeLeaves";

export const Route = createFileRoute("/tree")({
  head: () => ({
    meta: [
      { title: "Tree — DAMA" },
      { name: "description", content: "Quest tree." },
    ],
  }),
  component: TreeScreen,
});

function TreeScreen() {
  const search = Route.useSearch() as { focus?: string | undefined };
  const focus = (search?.focus || "").trim();

  const leaves = useSyncExternalStore(subscribeLeaves, readLeaves, () => ({}));
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

  const suttasInBook = useMemo(() => {
    return getSuttasForTreeBook(items, treeBook);
  }, [items, treeBook]);

  const ordered = useMemo(() => {
    return buildTreeLeaves(suttasInBook, leaves, Date.now(), loadState === "ok");
  }, [leaves, loadState, suttasInBook]);

  const bookLabel = useMemo(() => {
    if (treeBook.nikaya === "AN") {
      const n = parseInt(treeBook.book, 10);
      return `${AN_BOOK_TITLES[n] ?? `Book ${treeBook.book}`} · ${ordered.length} leaves`;
    }
    return `Book ${treeBook.book} · ${ordered.length} leaves`;
  }, [ordered.length, treeBook.book, treeBook.nikaya]);

  const badge = (state: string) => {
    switch (state) {
      case "grey":
        return "Grey (quiz available)";
      case "green":
        return "Green";
      case "yellow":
        return "Yellow (review)";
      case "gold":
        return "Gold (fixed)";
      default:
        return state;
    }
  };

  return (
    <div className="min-h-screen dama-screen">
      <ScreenHeader title="Tree" showBack={false} />
      <div className="px-5 pt-6 pb-[var(--dama-bottom-pad,0px)]">
        <div className="rounded-3xl overflow-hidden aspect-[16/10] relative glass">
          <img src={treeImg} alt="Dhamma tree" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        </div>

        <div className="mt-6">
          <div className="flex items-end justify-between gap-3">
            <div className="label-mono text-primary">Leaves</div>
            <div className="text-[11px] text-muted-foreground label-mono normal-case">{bookLabel}</div>
          </div>
          {loadState === "loading" ? (
            <p className="mt-2 text-sm text-muted-foreground">Loading leaves…</p>
          ) : loadState === "error" && ordered.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Could not load the corpus index.</p>
          ) : ordered.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No suttas found for this book.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {ordered.map((leaf) => (
                <Link
                  key={leaf.suttaId}
                  to="/quiz/$suttaId"
                  params={{ suttaId: leaf.suttaId }}
                  className="block rounded-2xl glass px-4 py-3 ring-1 ring-white/10 hover:ring-primary/25 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{leaf.suttaId}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground label-mono normal-case">
                        {badge(leaf.state)}
                      </div>
                    </div>
                    <div
                      className={`size-3.5 rounded-full ${
                        leaf.state === "gold"
                          ? "bg-yellow-400"
                          : leaf.state === "yellow"
                            ? "bg-yellow-200"
                            : leaf.state === "green"
                              ? "bg-green-400"
                              : "bg-white/30"
                      }`}
                      aria-hidden
                    />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
