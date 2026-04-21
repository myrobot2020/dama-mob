import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { BottomNav } from "@/components/BottomNav";
import { Headphones, Waypoints } from "lucide-react";
import {
  EMPTY_AUDIO_PROGRESS_MAP,
  LISTEN_COMPLETE_THRESHOLD,
  countHeardByNikaya,
  getSuttaIdsHeardAtLeast,
  readAudioListenProgress,
  subscribeAudioListenProgress,
} from "@/lib/audioListenProgress";
import { filterItemsByNikaya, getItems, NIKAYA_OPTIONS, type ItemSummary } from "@/lib/damaApi";

export const Route = createFileRoute("/tree")({
  head: () => ({
    meta: [
      { title: "Listen stats — DAMA" },
      { name: "description", content: "Teacher audio listen progress by sutta." },
    ],
  }),
  component: TreeScreen,
});

function useAudioListenProgress() {
  return useSyncExternalStore(
    subscribeAudioListenProgress,
    readAudioListenProgress,
    () => EMPTY_AUDIO_PROGRESS_MAP,
  );
}

function TreeScreen() {
  const progressMap = useAudioListenProgress();
  const heardIds = useMemo(() => getSuttaIdsHeardAtLeast(progressMap), [progressMap]);
  const byNikaya = useMemo(() => countHeardByNikaya(heardIds), [heardIds]);

  const [corpusItems, setCorpusItems] = useState<ItemSummary[]>([]);
  const [corpusStatus, setCorpusStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    setCorpusStatus("loading");
    (async () => {
      try {
        const data = await getItems({ book: "all" }, ac.signal);
        if (cancelled) return;
        setCorpusItems(Array.isArray(data.items) ? data.items : []);
        setCorpusStatus("ok");
      } catch {
        if (cancelled) return;
        setCorpusItems([]);
        setCorpusStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

  const corpusIdSet = useMemo(
    () => new Set(corpusItems.map((it) => it.suttaid)),
    [corpusItems],
  );

  const heardInCorpusIds = useMemo(
    () => heardIds.filter((id) => corpusIdSet.has(id)),
    [heardIds, corpusIdSet],
  );

  const totalInCorpus = corpusItems.length;
  const heardCount = heardInCorpusIds.length;
  const leftInCorpus = Math.max(0, totalInCorpus - heardCount);
  const overallPct = totalInCorpus > 0 ? (heardCount / totalInCorpus) * 100 : 0;

  const nikayaTracer = useMemo(() => {
    return NIKAYA_OPTIONS.map(({ value, label, title }) => {
      const inNik = filterItemsByNikaya(corpusItems, value);
      const totalNk = inNik.length;
      if (totalNk === 0) return null;
      const idsNk = new Set(inNik.map((it) => it.suttaid));
      const heardNk = heardInCorpusIds.filter((id) => idsNk.has(id)).length;
      const leftNk = Math.max(0, totalNk - heardNk);
      const pctNk = totalNk > 0 ? (heardNk / totalNk) * 100 : 0;
      return { value, label, title, totalNk, heardNk, leftNk, pctNk };
    }).filter((x): x is NonNullable<typeof x> => x != null);
  }, [corpusItems, heardInCorpusIds]);

  return (
    <div className="min-h-screen pb-40">
      <ScreenHeader title="Listen stats" showBack={false} />
      <div className="px-5">
        <div className="text-center">
          <div className="label-mono text-primary">Teacher audio</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Progress</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Suttas where playback reached at least {LISTEN_COMPLETE_THRESHOLD * 100}% of the clip
            (saved on this device).
          </p>
        </div>

        <div className="mt-6 glass rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <Waypoints size={18} className="text-primary" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="label-mono text-muted-foreground">Corpus tracer</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Heard ({LISTEN_COMPLETE_THRESHOLD * 100}%+ clip) vs total suttas in this install.
              </p>
              {corpusStatus === "loading" && (
                <div className="mt-3 space-y-2">
                  <div className="h-2 rounded-full bg-white/10 animate-pulse" />
                  <div className="h-4 w-2/3 rounded bg-white/10 animate-pulse" />
                </div>
              )}
              {corpusStatus === "error" && (
                <p className="mt-2 text-xs text-destructive">
                  Could not load corpus size (offline?). Totals below use heard count only.
                </p>
              )}
              {corpusStatus === "ok" && (
                <>
                  <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
                    <span className="label-mono text-primary text-lg">{heardCount}</span>
                    <span className="text-sm text-muted-foreground">
                      of{" "}
                      <span className="text-foreground font-medium tabular-nums">{totalInCorpus}</span>{" "}
                      ·{" "}
                      <span className="text-foreground font-semibold tabular-nums">{leftInCorpus}</span>{" "}
                      left
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                      <span>Overall</span>
                      <span className="tabular-nums text-foreground">
                        {overallPct >= 10 ? overallPct.toFixed(0) : overallPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-4 rounded-full bg-white/10 overflow-hidden ring-1 ring-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary/70 via-primary to-primary/90 glow-soft transition-[width] duration-300"
                        style={{ width: `${Math.min(100, overallPct)}%` }}
                      />
                    </div>
                  </div>
                  <div className="mt-6 space-y-5">
                    <div className="label-mono text-[10px] text-muted-foreground uppercase tracking-wide">
                      By collection · complete % (varies per nikāya)
                    </div>
                    {nikayaTracer.map(({ value, label, title, totalNk, heardNk, leftNk, pctNk }) => (
                      <div key={value} className="rounded-2xl bg-black/20 ring-1 ring-white/10 p-3">
                        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
                          <div className="min-w-0">
                            <div className="text-[11px] text-muted-foreground">{label}</div>
                            <div className="text-sm font-medium text-foreground/95 leading-snug truncate">
                              {title}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-2xl font-semibold tabular-nums text-primary leading-none">
                              {pctNk >= 10 ? pctNk.toFixed(0) : pctNk.toFixed(1)}%
                            </div>
                            <div className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                              {heardNk} done · {leftNk} left · {totalNk} total
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 h-5 w-full rounded-full bg-white/10 overflow-hidden ring-1 ring-white/5">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-primary/50 via-primary to-primary/80 transition-[width] duration-300"
                            style={{ width: `${Math.min(100, pctNk)}%`, minWidth: heardNk > 0 ? "4px" : undefined }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 glass rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <Headphones size={18} className="text-primary" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="label-mono text-muted-foreground">Completed at threshold</div>
              <div className="mt-2 label-mono text-primary text-lg">{heardIds.length} sutta(s)</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {NIKAYA_OPTIONS.map(({ value, label }) => {
                  const n = byNikaya[value];
                  if (n === 0) return null;
                  return (
                    <span
                      key={value}
                      className="px-2.5 py-1 rounded-full bg-primary/10 ring-1 ring-primary/25 text-xs text-primary"
                    >
                      {label} · {n}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {heardIds.length > 0 && (
          <div className="mt-3 glass rounded-2xl p-4">
            <div className="label-mono text-muted-foreground mb-2">Sutta ids</div>
            <div className="max-h-[min(50vh,20rem)] overflow-y-auto space-y-1.5 pr-1">
              {heardIds.map((sid) => (
                <Link
                  key={sid}
                  to="/sutta/$suttaId"
                  params={{ suttaId: sid }}
                  className="block rounded-xl px-3 py-2 text-sm bg-white/5 hover:bg-primary/10 ring-1 ring-transparent hover:ring-primary/25 transition-colors label-mono text-primary truncate"
                >
                  {sid}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
