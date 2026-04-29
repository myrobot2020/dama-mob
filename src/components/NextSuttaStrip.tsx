import { Link, useLocation } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AN_BOOK_TITLES, anBookFromSuttaId, getItems, type ItemSummary } from "@/lib/damaApi";
import {
  getFirstSuttaGlobally,
  getNextSuttaInNikaya,
  getPreviousSuttaInNikaya,
  getSuttaPositionInBook,
  parseSuttaRouteId,
} from "@/lib/suttaNavOrder";

const FETCH_MS = 15000;

function headingFromSummary(it: ItemSummary): string {
  const t = it.title?.trim();
  return t || it.suttaid;
}

function sameBook(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return true;
  const anA = anBookFromSuttaId(a);
  const anB = anBookFromSuttaId(b);
  if (anA != null || anB != null) return anA === anB;
  const bookA = a.trim().match(/^[A-Z]+\s+(\d+)\./i)?.[1] ?? "";
  const bookB = b.trim().match(/^[A-Z]+\s+(\d+)\./i)?.[1] ?? "";
  return bookA === bookB;
}

function bookLabel(id: string): string {
  const anBook = anBookFromSuttaId(id);
  if (anBook != null) return AN_BOOK_TITLES[anBook] ?? `Book ${anBook}`;
  const m = id.trim().match(/^([A-Z]+)\s+(\d+)\./i);
  if (m) return `${m[1].toUpperCase()} Book ${m[2]}`;
  return "Next book";
}

export function NextSuttaStrip() {
  const { pathname } = useLocation();
  const routeSuttaId = useMemo(() => parseSuttaRouteId(pathname), [pathname]);

  const [items, setItems] = useState<ItemSummary[]>([]);
  const [load, setLoad] = useState<"idle" | "loading" | "ok" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), FETCH_MS);
    setLoad("loading");
    (async () => {
      try {
        const data = await getItems({ book: "all" }, ac.signal);
        if (cancelled) return;
        setItems(Array.isArray(data.items) ? data.items : []);
        setLoad("ok");
      } catch {
        if (cancelled) return;
        setItems([]);
        setLoad("error");
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      ac.abort();
    };
  }, []);

  const nextItem = useMemo(() => {
    if (!routeSuttaId || load !== "ok" || items.length === 0) return null;
    return getNextSuttaInNikaya(items, routeSuttaId);
  }, [routeSuttaId, items, load]);

  const previousItem = useMemo(() => {
    if (!routeSuttaId || load !== "ok" || items.length === 0) return null;
    return getPreviousSuttaInNikaya(items, routeSuttaId);
  }, [routeSuttaId, items, load]);

  const firstItem = useMemo(() => {
    if (load !== "ok" || items.length === 0) return null;
    return getFirstSuttaGlobally(items);
  }, [items, load]);

  const nextPosition = useMemo(() => {
    if (!nextItem || load !== "ok" || items.length === 0) return null;
    return getSuttaPositionInBook(items, nextItem.suttaid);
  }, [nextItem, items, load]);

  const previousPosition = useMemo(() => {
    if (!previousItem || load !== "ok" || items.length === 0) return null;
    return getSuttaPositionInBook(items, previousItem.suttaid);
  }, [previousItem, items, load]);

  const navCard = (
    direction: "previous" | "next",
    item: ItemSummary,
    position: { position: number; total: number } | null,
  ) => {
    const isPrevious = direction === "previous";
    const Icon = isPrevious ? ChevronLeft : ChevronRight;
    const crossesBook = !isPrevious && routeSuttaId && !sameBook(routeSuttaId, item.suttaid);
    const cardLabel = crossesBook ? "Next book" : isPrevious ? "Previous sutta" : "Next sutta";
    const title = crossesBook ? bookLabel(item.suttaid) : headingFromSummary(item);
    const card = (
      <>
        <Icon size={20} className="shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1 text-left">
          <div className="label-mono text-[10px] text-muted-foreground leading-tight">
            {cardLabel}
          </div>
          <div className="text-sm font-medium text-foreground truncate">{title}</div>
          {!crossesBook ? (
            <div className="label-mono text-[11px] text-primary/90 truncate">
              {position ? `${position.position}/${position.total}` : item.suttaid}
            </div>
          ) : null}
        </div>
      </>
    );
    if (crossesBook) {
      return (
        <Link
          to="/book-transition"
          search={{ from: routeSuttaId, to: item.suttaid }}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-background ring-1 ring-primary/25 px-3 py-2.5 hover:bg-primary/10 transition-colors"
        >
          {card}
        </Link>
      );
    }
    return (
      <Link
        to="/sutta/$suttaId"
        params={{ suttaId: item.suttaid }}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-background ring-1 ring-primary/25 px-3 py-2.5 hover:bg-primary/10 transition-colors"
      >
        {card}
      </Link>
    );
  };

  if (load === "loading" || load === "idle") {
    return (
      <div className="rounded-2xl bg-background ring-1 ring-white/10 px-3 py-2.5 mb-1.5">
        <div className="h-4 w-3/5 rounded bg-white/10 animate-pulse" />
      </div>
    );
  }

  if (load === "error") {
    return (
      <div className="rounded-2xl bg-background ring-1 ring-white/10 px-3 py-2 mb-1.5 text-[11px] text-muted-foreground">
        Next sutta unavailable (offline?)
      </div>
    );
  }

  if (routeSuttaId && (previousItem || nextItem)) {
    const colClass = previousItem && nextItem ? "grid-cols-2" : "grid-cols-1";
    return (
      <div className={`mb-1.5 grid ${colClass} gap-2`}>
        {previousItem ? navCard("previous", previousItem, previousPosition) : null}
        {nextItem ? navCard("next", nextItem, nextPosition) : null}
      </div>
    );
  }

  if (firstItem) {
    return (
      <Link
        to="/sutta/$suttaId"
        params={{ suttaId: firstItem.suttaid }}
        className="flex items-center gap-2 rounded-2xl bg-background ring-1 ring-primary/25 px-3 py-2.5 mb-1.5 hover:bg-primary/10 transition-colors"
      >
        <ChevronRight size={20} className="shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1 text-left">
          <div className="label-mono text-[10px] text-muted-foreground leading-tight">Open a sutta</div>
          <div className="text-sm font-medium text-foreground truncate">{headingFromSummary(firstItem)}</div>
          <div className="label-mono text-[11px] text-primary/90 truncate">1/{items.length}</div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to="/browse"
      className="flex items-center gap-2 rounded-2xl bg-background ring-1 ring-white/10 px-3 py-2.5 mb-1.5 hover:bg-primary/10 transition-colors"
    >
      <ChevronRight size={20} className="shrink-0 text-primary" aria-hidden />
      <span className="text-sm font-medium">Browse suttas</span>
    </Link>
  );
}
