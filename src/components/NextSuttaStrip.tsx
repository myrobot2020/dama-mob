import { Link, useLocation } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getItems, type ItemSummary } from "@/lib/damaApi";
import {
  getFirstSuttaGlobally,
  getNextSuttaInBook,
  parseSuttaRouteId,
} from "@/lib/suttaNavOrder";

const FETCH_MS = 15000;

function headingFromSummary(it: ItemSummary): string {
  const t = it.title?.trim();
  return t || it.suttaid;
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
    return getNextSuttaInBook(items, routeSuttaId);
  }, [routeSuttaId, items, load]);

  const firstItem = useMemo(() => {
    if (load !== "ok" || items.length === 0) return null;
    return getFirstSuttaGlobally(items);
  }, [items, load]);

  const labelLine = nextItem ? headingFromSummary(nextItem) : null;

  if (load === "loading" || load === "idle") {
    return (
      <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2.5 mb-1.5">
        <div className="h-4 w-3/5 rounded bg-white/10 animate-pulse" />
      </div>
    );
  }

  if (load === "error") {
    return (
      <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 mb-1.5 text-[11px] text-muted-foreground">
        Next sutta unavailable (offline?)
      </div>
    );
  }

  if (routeSuttaId && nextItem) {
    return (
      <Link
        to="/sutta/$suttaId"
        params={{ suttaId: nextItem.suttaid }}
        className="flex items-center gap-2 rounded-2xl bg-white/5 ring-1 ring-primary/20 px-3 py-2.5 mb-1.5 hover:bg-primary/10 transition-colors"
      >
        <ChevronRight size={20} className="shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1 text-left">
          <div className="label-mono text-[10px] text-muted-foreground leading-tight">Next sutta</div>
          <div className="text-sm font-medium text-foreground truncate">{labelLine}</div>
          <div className="label-mono text-[11px] text-primary/90 truncate">{nextItem.suttaid}</div>
        </div>
      </Link>
    );
  }

  if (routeSuttaId && !nextItem) {
    return (
      <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 mb-1.5 flex items-center gap-2">
        <ChevronRight size={20} className="shrink-0 text-muted-foreground opacity-50" aria-hidden />
        <div className="min-w-0 text-left">
          <div className="text-xs text-muted-foreground">Last sutta in this book</div>
          <Link to="/browse" className="text-sm text-primary font-medium">
            Browse corpus →
          </Link>
        </div>
      </div>
    );
  }

  if (firstItem) {
    return (
      <Link
        to="/sutta/$suttaId"
        params={{ suttaId: firstItem.suttaid }}
        className="flex items-center gap-2 rounded-2xl bg-white/5 ring-1 ring-primary/20 px-3 py-2.5 mb-1.5 hover:bg-primary/10 transition-colors"
      >
        <ChevronRight size={20} className="shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1 text-left">
          <div className="label-mono text-[10px] text-muted-foreground leading-tight">Open a sutta</div>
          <div className="text-sm font-medium text-foreground truncate">{headingFromSummary(firstItem)}</div>
          <div className="label-mono text-[11px] text-primary/90 truncate">{firstItem.suttaid}</div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to="/browse"
      className="flex items-center gap-2 rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2.5 mb-1.5 hover:bg-primary/10 transition-colors"
    >
      <ChevronRight size={20} className="shrink-0 text-primary" aria-hidden />
      <span className="text-sm font-medium">Browse suttas</span>
    </Link>
  );
}
