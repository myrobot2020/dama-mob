import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  anBookFromSuttaId,
  AN_BOOK_TITLES,
  filterItemsByNikaya,
  filterItemsByNipata,
  getItems,
  inferNikayaFromSuttaId,
  ItemSummary,
  NIKAYA_OPTIONS,
  type NikayaId,
} from "@/lib/damaApi";

type LoadState = "loading" | "error" | "ok";

const FETCH_MS = 15000;

function sortSuttaIds(items: ItemSummary[]) {
  return [...items].sort((a, b) =>
    a.suttaid.localeCompare(b.suttaid, undefined, { numeric: true }),
  );
}

export function CorpusHeaderNav({ currentSuttaId }: { currentSuttaId?: string }) {
  const navigate = useNavigate();
  const [nikaya, setNikaya] = useState<NikayaId>("AN");
  const [book, setBook] = useState<string>("11");
  const [rawItems, setRawItems] = useState<ItemSummary[]>([]);
  const [load, setLoad] = useState<LoadState>("loading");
  const [retryKey, setRetryKey] = useState(0);

  const refetch = useCallback(() => setRetryKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), FETCH_MS);
    setLoad("loading");
    (async () => {
      try {
        const data = await getItems({ book: "all" }, ac.signal);
        if (cancelled) return;
        setRawItems(Array.isArray(data.items) ? data.items : []);
        setLoad("ok");
      } catch {
        if (cancelled) return;
        setRawItems([]);
        setLoad("error");
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [retryKey]);

  useEffect(() => {
    if (!currentSuttaId) return;
    const nk = inferNikayaFromSuttaId(currentSuttaId);
    setNikaya(nk);
    if (nk === "AN") {
      const b = anBookFromSuttaId(currentSuttaId);
      if (b != null) setBook(String(b));
    }
  }, [currentSuttaId]);

  const nikayaItems = useMemo(
    () => filterItemsByNikaya(rawItems, nikaya),
    [rawItems, nikaya],
  );

  const suttasInBook = useMemo(() => {
    if (nikaya !== "AN") {
      return sortSuttaIds(nikayaItems);
    }
    return sortSuttaIds(filterItemsByNipata(nikayaItems, book));
  }, [nikaya, nikayaItems, book]);

  const suttaSelectValue = useMemo(() => {
    if (load === "loading" || load === "error") {
      return currentSuttaId ?? "";
    }
    if (currentSuttaId && suttasInBook.some((x) => x.suttaid === currentSuttaId)) {
      return currentSuttaId;
    }
    if (suttasInBook[0]) return suttasInBook[0].suttaid;
    return currentSuttaId || "";
  }, [load, currentSuttaId, suttasInBook]);

  const onSuttaChange = (sid: string) => {
    if (!sid) return;
    navigate({ to: "/sutta/$suttaId", params: { suttaId: sid } });
  };

  const onNikayaChange = (nk: NikayaId) => {
    setNikaya(nk);
    if (load !== "ok") return;
    const inNik = filterItemsByNikaya(rawItems, nk);
    if (nk === "AN") {
      const sorted = sortSuttaIds(filterItemsByNipata(inNik, book));
      const first = sorted[0]?.suttaid;
      if (first) navigate({ to: "/sutta/$suttaId", params: { suttaId: first } });
      return;
    }
    const sorted = sortSuttaIds(inNik);
    const first = sorted[0]?.suttaid;
    if (first) navigate({ to: "/sutta/$suttaId", params: { suttaId: first } });
  };

  const onBookChange = (b: string) => {
    setBook(b);
    if (load !== "ok" || nikaya !== "AN") return;
    const sorted = sortSuttaIds(filterItemsByNipata(filterItemsByNikaya(rawItems, "AN"), b));
    const first = sorted[0]?.suttaid;
    if (first) navigate({ to: "/sutta/$suttaId", params: { suttaId: first } });
  };

  const bookDisabled = load === "loading" || nikaya !== "AN";
  const bookNum = parseInt(book, 10);
  const bookTitle =
    Number.isFinite(bookNum) && bookNum >= 1 && bookNum <= 11
      ? `${AN_BOOK_TITLES[bookNum]} · an${book}`
      : undefined;

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-1 w-full max-w-[min(100%,26rem)] mx-auto"
      role="navigation"
      aria-label="Corpus navigation"
    >
      <select
        value={nikaya}
        onChange={(e) => onNikayaChange(e.target.value as NikayaId)}
        disabled={load === "loading"}
        className="max-w-[6.75rem] rounded-lg bg-background/50 border border-border/60 px-1.5 py-1 text-[9px] label-mono normal-case text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
        aria-label="Nikāya"
        title={NIKAYA_OPTIONS.find((o) => o.value === nikaya)?.title}
      >
        {NIKAYA_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {nikaya === "AN" ? (
        <select
          value={book}
          onChange={(e) => onBookChange(e.target.value)}
          disabled={bookDisabled}
          className="max-w-[9.5rem] rounded-lg bg-background/50 border border-border/60 px-1.5 py-1 text-[9px] label-mono normal-case text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
          aria-label="Aṅguttara book"
          title={bookTitle}
        >
          {Array.from({ length: 11 }, (_, i) => {
            const n = i + 1;
            return (
              <option key={n} value={String(n)}>
                {AN_BOOK_TITLES[n]}
              </option>
            );
          })}
        </select>
      ) : (
        <select
          value="_pending"
          disabled
          className="max-w-[9.5rem] rounded-lg bg-background/40 border border-border/40 px-1.5 py-1 text-[9px] label-mono normal-case text-muted-foreground/80 opacity-80 cursor-not-allowed"
          aria-label="Book"
          title="Subdivisions for this nikāya will appear when those texts are indexed in dama5."
        >
          <option value="_pending">— (corpus pending)</option>
        </select>
      )}

      <div className="min-w-0 flex-1 max-w-[11rem] flex items-center gap-0.5">
        <select
          value={suttaSelectValue}
          onChange={(e) => onSuttaChange(e.target.value)}
          disabled={load !== "ok" || suttasInBook.length === 0}
          className="min-w-0 flex-1 rounded-lg bg-background/50 border border-border/60 px-1.5 py-1 text-[10px] label-mono normal-case text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
          aria-label="Sutta"
          title={
            load === "error"
              ? `Sutta ${currentSuttaId ?? "—"} · catalog offline — start dama5 :8000 or set VITE_DAMA_API_URL`
              : load === "loading"
                ? currentSuttaId
                  ? `Sutta ${currentSuttaId} · loading catalog…`
                  : "Loading catalog…"
                : nikaya !== "AN" && nikayaItems.length === 0
                  ? "No suttas for this nikāya in the index yet"
                  : suttaSelectValue || undefined
          }
        >
          {(load === "loading" || load === "error") && (
            <option value={currentSuttaId ?? ""}>
              {currentSuttaId ?? (load === "loading" ? "…" : "—")}
            </option>
          )}
          {load === "ok" && nikaya !== "AN" && nikayaItems.length === 0 && !currentSuttaId && (
            <option value="">No texts indexed yet</option>
          )}
          {load === "ok" &&
            suttasInBook.map((it) => {
              const t = (it.title ?? "").trim();
              const short = t.length > 22 ? `${t.slice(0, 22)}…` : t;
              return (
                <option key={it.suttaid} value={it.suttaid}>
                  {it.suttaid}
                  {short ? ` · ${short}` : ""}
                </option>
              );
            })}
          {load === "ok" &&
            currentSuttaId &&
            !suttasInBook.some((x) => x.suttaid === currentSuttaId) && (
              <option value={currentSuttaId}>{currentSuttaId}</option>
            )}
        </select>
        {(load === "error" || load === "loading") && (
          <button
            type="button"
            onClick={() => refetch()}
            className="shrink-0 size-7 rounded-lg glass flex items-center justify-center text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label={load === "loading" ? "Cancel and retry" : "Retry loading corpus"}
            title="Retry"
          >
            <RefreshCw size={14} className={load === "loading" ? "animate-spin" : ""} />
          </button>
        )}
      </div>
    </div>
  );
}
