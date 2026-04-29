import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { CorpusHeaderNav } from "@/components/CorpusHeaderNav";
import { BookOfOnesInterpretations } from "@/components/BookOfOnesInterpretations";
import { BottomNav } from "@/components/BottomNav";
import { NextSuttaStrip } from "@/components/NextSuttaStrip";
import { SuttaInterpretLink } from "@/components/SuttaInterpretLink";
import { CanonQuote } from "@/components/CanonQuote";
import { AudioPlayer, TrackedNativeAudio } from "@/components/AudioPlayer";
import { an148Quiz } from "@/data/an148Quiz";
import mettaInfographic from "@/assets/an1116-metta-infographic.png";
import {
  clearSuttaRead,
  markSuttaRead,
  readReadingProgress,
  recordSuttaOpened,
  subscribeReadingProgress,
} from "@/lib/readingProgress";
import { trackUxEvent } from "@/lib/uxLog";
import { readSettings, subscribeSettings } from "@/lib/settings";
import { Check, Hexagon, Languages, Trees } from "lucide-react";

import {
  canonIndexSubtitle,
  getCorpusAudSrc,
  getItem,
  isAn1116Sutta,
  itemDisplayHeading,
  ItemDetail,
  stripTranscriptNoise,
} from "@/lib/damaApi";

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
          content:
            "Sutta text and commentary from the dama5 corpus (indexed by nikāya · book · id).",
        },
      ],
    };
  },
});

const DEFAULT_SETTINGS = { language: "en" as const };
const EMPTY_READING_PROGRESS = {};

function SuttaByIdScreen() {
  const { suttaId } = Route.useParams();
  const id = useMemo(() => normalizeParam(suttaId), [suttaId]);

  const [item, setItem] = useState<ItemDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ok">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const settings = useSyncExternalStore(subscribeSettings, readSettings, () => DEFAULT_SETTINGS);
  const [lang, setLang] = useState<"en" | "ja">("en");

  // Keep internal toggle in sync with global setting when it changes (or when a new sutta is loaded)
  useEffect(() => {
    setLang(settings.language);
  }, [settings.language]);

  const readingProgress = useSyncExternalStore(
    subscribeReadingProgress,
    readReadingProgress,
    () => EMPTY_READING_PROGRESS,
  );
  const isRead = Boolean(id && readingProgress[id]?.readAtMs);

  const showMettaInfographic = useMemo(() => isAn1116Sutta(id), [id]);

  const jaData = useMemo(() => {
    if (id === "1.48" || id === "AN 1.48") return an148Quiz.japaneseAudio;
    return null;
  }, [id]);

  useEffect(() => {
    if (!id.trim()) return;
    recordSuttaOpened(id);
    trackUxEvent("sutta_open", { suttaId: id });
  }, [id]);

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
    /** Same path as other suttas: `/dama-aud/*` → `aud/` (dev/preview/Nitro). Avoid `/aud/*` from `public/` — not served on Cloud Run. */
    const src = getCorpusAudSrc(f);
    return src.trim() ? src : null;
  };

  return (
    <div className="min-h-screen dama-screen">
      <ScreenHeader
        center={<CorpusHeaderNav currentSuttaId={id} />}
        right={
          <div className="flex items-center gap-2">
            {jaData && (
              <button
                onClick={() => setLang((l) => (l === "en" ? "ja" : "en"))}
                className="h-9 px-3 rounded-full glass border border-primary/20 text-[10px] font-bold text-primary transition-all active:scale-95 flex items-center gap-1.5"
                title={lang === "en" ? "Switch to Japanese" : "Switch to English"}
              >
                <Languages size={14} />
                {lang === "en" ? "日本語" : "EN"}
              </button>
            )}
            <Link
              to="/tree"
              search={{ focus: id }}
              className="size-9 rounded-full glass flex items-center justify-center shrink-0"
              aria-label="Open Tree"
              title="Open Tree"
            >
              <Trees size={16} />
            </Link>
          </div>
        }
      />
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

            <button
              type="button"
              onClick={() => {
                if (isRead) clearSuttaRead(id);
                else markSuttaRead(id);
              }}
              className={`mt-4 w-full rounded-2xl font-medium py-3 flex items-center justify-center gap-2 ring-1 transition-colors ${
                isRead
                  ? "bg-green-400/12 text-green-400 ring-green-400/35"
                  : "glass ring-white/10 hover:ring-primary/25"
              }`}
            >
              {isRead ? <Check size={16} /> : null}
              {isRead ? "Marked as Read" : "Mark as Read"}
            </button>

            {showMettaInfographic && (
              <div className="mt-5 rounded-2xl overflow-hidden ring-1 ring-primary/20 bg-background/40">
                <img
                  src={mettaInfographic}
                  alt="Eleven advantages of radiating loving-kindness (mettā) by mind"
                  className="w-full h-auto object-contain object-top block"
                  loading="lazy"
                />
              </div>
            )}

            <section className="mt-6">
              <div className="label-mono text-muted-foreground mb-2">
                {lang === "ja" ? "経 (Sutta)" : "Sutta"}
              </div>
              <CanonQuote
                text={lang === "ja" ? jaData!.text : stripTranscriptNoise(item.sutta)}
              />
            </section>

            <div className="mt-6">
              {lang === "ja" ? (
                <div className="glass rounded-2xl p-4">
                  <div className="label-mono text-primary text-xs mb-2">日本語オーディオ</div>
                  <audio controls src={jaData!.src} className="w-full" />
                </div>
              ) : (
                (() => {
                  const rawFile = (item.aud_file || "").trim();
                  const src = audioSrcForItem(item);
                  const start = item.aud_start_s ?? 0;
                  const end = item.aud_end_s ?? 0;
                  if (!src) {
                    if (!rawFile) return null;
                    return (
                      <div className="glass rounded-2xl p-4">
                        <div className="label-mono text-muted-foreground text-xs mb-2">
                          Teacher audio
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Audio not available for this sutta yet.
                        </div>
                      </div>
                    );
                  }
                  if (end > start) {
                    return (
                      <AudioPlayer
                        src={src}
                        label="Teacher audio"
                        start={start}
                        end={end}
                        suttaId={id}
                      />
                    );
                  }
                  return (
                    <div className="glass rounded-2xl p-4">
                      <div className="label-mono text-muted-foreground text-xs mb-2">
                        Teacher audio
                      </div>
                      <TrackedNativeAudio src={src} suttaId={id} />
                    </div>
                  );
                })()
              )}
            </div>

            <div className="mt-8 mb-4">
              <SuttaInterpretLink suttaId={id} />
              <BookOfOnesInterpretations currentSuttaId={id} />
            </div>
          </>
        )}
      </div>
      <BottomNav topSlot={<NextSuttaStrip />} />
    </div>
  );
}
