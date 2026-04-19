import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { CorpusHeaderNav } from "@/components/CorpusHeaderNav";
import { BottomNav } from "@/components/BottomNav";
import { CanonQuote } from "@/components/CanonQuote";
import { AudioPlayer } from "@/components/AudioPlayer";
import an1116Data from "@/data/an11.16.json";
import mettaInfographic from "@/assets/an1116-metta-infographic.png";
import {
  canonIndexSubtitle,
  getCorpusAudSrc,
  getItem,
  getPublicAudUrl,
  isAn1116Sutta,
  itemDisplayHeading,
  ItemDetail,
  stripTranscriptNoise,
} from "@/lib/damaApi";
import { Hexagon } from "lucide-react";

function normalizeParam(raw: string | undefined): string {
  if (raw == null || raw === "") return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return String(raw);
  }
}

export const Route = createFileRoute("/sutta/$suttaId")({
  component: SuttaByIdScreen,
  head: ({ params }) => {
    const raw = params.suttaId ?? "sutta";
    let label = raw;
    try {
      label = decodeURIComponent(raw);
    } catch {
      /* keep raw */
    }
    return {
      meta: [
        { title: `DAMA — ${label}` },
        {
          name: "description",
          content: "Sutta text and commentary from the dama5 corpus (indexed by nikāya · book · id).",
        },
      ],
    };
  },
});

function SuttaByIdScreen() {
  const { suttaId } = Route.useParams();
  const id = useMemo(() => normalizeParam(suttaId), [suttaId]);

  const [item, setItem] = useState<ItemDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ok">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const showMettaInfographic = useMemo(() => isAn1116Sutta(id), [id]);

  useEffect(() => {
    if (!id.trim()) {
      setStatus("error");
      setErrorMsg("Missing sutta id in URL.");
      setItem(null);
      return;
    }
    const ac = new AbortController();
    setStatus("loading");
    setErrorMsg("");
    setItem(null);
    (async () => {
      try {
        const data = await getItem(id, undefined, ac.signal);
        setItem(data);
        setStatus("ok");
      } catch (e) {
        if (ac.signal.aborted) return;
        setStatus("error");
        setErrorMsg(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => ac.abort();
  }, [id]);

  const audioSrcForItem = (it: ItemDetail): string | null => {
    const f = (it.aud_file || "").trim();
    if (!f) return null;
    if (isAn1116Sutta(it.suttaid) && f === an1116Data.aud_file) {
      return getPublicAudUrl(f);
    }
    return getCorpusAudSrc(f);
  };

  return (
    <div className="min-h-screen pb-28">
      <ScreenHeader showBookmark center={<CorpusHeaderNav currentSuttaId={id} />} />
      <div className="px-5">
        <header className="mt-2">
          <div className="flex items-center gap-2 mb-2">
            <Hexagon
              size={12}
              className="text-primary fill-primary shrink-0"
              style={{ filter: "drop-shadow(0 0 6px var(--glow))" }}
            />
            <span className="font-mono text-primary text-[11px] leading-tight normal-case tracking-wide">
              {canonIndexSubtitle(id)}
            </span>
          </div>
        </header>

        {status === "loading" && (
          <div className="mt-4 space-y-3">
            <div className="h-8 w-4/5 rounded-xl bg-muted/40" />
            <div className="mt-6 h-40 rounded-2xl bg-muted/25" />
          </div>
        )}

        {status === "error" && (
          <div className="mt-4 glass rounded-2xl p-4">
            <h1 className="text-lg font-semibold label-mono text-foreground">{id}</h1>
            <p className="mt-1 text-xs text-muted-foreground">{canonIndexSubtitle(id)}</p>
            <div className="label-mono text-destructive mt-3">Could not load sutta</div>
            <p className="mt-2 text-sm text-muted-foreground break-words">
              {errorMsg || "Unknown error"}
            </p>
            <div className="mt-4 flex items-center gap-3">
              <Link
                to="/browse"
                className="rounded-xl bg-primary text-primary-foreground font-medium px-4 py-2"
              >
                Browse
              </Link>
              <a href="/" className="rounded-xl glass font-medium px-4 py-2">
                Home
              </a>
            </div>
          </div>
        )}

        {status === "ok" && item && (
          <>
            <h1 className="text-[22px] leading-snug font-semibold tracking-tight mt-1">
              {itemDisplayHeading(item)}
            </h1>

            {showMettaInfographic && (
              <div className="mt-5 rounded-2xl overflow-hidden ring-1 ring-primary/20 bg-background/40">
                <img
                  src={mettaInfographic}
                  alt="Eleven advantages of radiation by mind of loving-kindness (mettā)"
                  className="w-full h-auto object-contain object-top block"
                  loading="lazy"
                />
              </div>
            )}

            <section className="mt-6">
              <div className="label-mono text-muted-foreground mb-2">Sutta</div>
              <CanonQuote text={stripTranscriptNoise(item.sutta)} />
            </section>

            {(() => {
              const src = audioSrcForItem(item);
              const start = item.aud_start_s ?? 0;
              const end = item.aud_end_s ?? 0;
              if (!src) return null;
              if (end > start) {
                return (
                  <div className="mt-6">
                    <AudioPlayer src={src} label="Teacher audio" start={start} end={end} />
                  </div>
                );
              }
              return (
                <div className="mt-6 glass rounded-2xl p-4">
                  <div className="label-mono text-muted-foreground text-xs mb-2">Teacher audio</div>
                  <audio controls className="w-full" src={src} preload="metadata" />
                </div>
              );
            })()}

            {!!item.chain?.items?.length && (
              <section className="mt-6">
                <div className="label-mono text-muted-foreground mb-2">Key chain</div>
                <div className="glass rounded-2xl p-4">
                  <div className="flex flex-wrap gap-2">
                    {item.chain.items.map((t) => (
                      <span
                        key={t}
                        className="px-3 py-1 rounded-full bg-primary/10 ring-1 ring-primary/25 text-sm text-primary"
                      >
                        {stripTranscriptNoise(t)}
                      </span>
                    ))}
                  </div>
                  {!!item.chain.category && (
                    <div className="mt-3 label-mono text-muted-foreground">
                      Category: {item.chain.category}
                    </div>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
