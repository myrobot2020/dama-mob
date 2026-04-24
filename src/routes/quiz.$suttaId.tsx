import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { RelevantSuttaStrip } from "@/components/RelevantSuttaStrip";
import { AudioPlayer } from "@/components/AudioPlayer";
import { an148Quiz } from "@/data/an148Quiz";
import { getCorpusAudSrc, getItem } from "@/lib/damaApi";
import {
  answerLeaf,
  ensureLeaf,
  hydrateLeaf,
  readLeaves,
  reviewLeafToGold,
  subscribeLeaves,
  upsertHydratedLeaf,
} from "@/lib/leaves";

function normalizeParam(raw: string | undefined): string {
  if (raw == null || raw === "") return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return String(raw);
  }
}

export const Route = createFileRoute("/quiz/$suttaId")({
  component: QuizScreen,
  head: () => ({
    meta: [
      { title: "Quiz — DAMA" },
      { name: "description", content: "Reflection MCQ." },
    ],
  }),
});

function QuizScreen() {
  const { suttaId } = Route.useParams();
  const id = useMemo(() => normalizeParam(suttaId), [suttaId]);
  const navigate = useNavigate();

  const leaves = useSyncExternalStore(subscribeLeaves, readLeaves, () => ({}));
  const leaf = useMemo(() => {
    if (!id) return null;
    const base = leaves[id] ?? null;
    return base ? hydrateLeaf(base) : null;
  }, [id, leaves]);

  useEffect(() => {
    if (!id) return;
    ensureLeaf(id);
    upsertHydratedLeaf(id);
  }, [id]);

  const quiz = useMemo(() => {
    if (id === "1.48" || id === "AN 1.48") return an148Quiz;
    return null;
  }, [id]);

  const [picked, setPicked] = useState<string>("");
  const [itemAudio, setItemAudio] = useState<{ src: string; start: number; end: number } | null>(null);

  const audioEnabled = leaf?.state === "yellow";

  const loadAudio = async () => {
    if (!audioEnabled || itemAudio || !id) return;
    try {
      const it = await getItem(id);
      const src = it.aud_file ? getCorpusAudSrc(it.aud_file) : "";
      const start = typeof it.aud_start_s === "number" ? it.aud_start_s : 0;
      const end = typeof it.aud_end_s === "number" ? it.aud_end_s : 0;
      if (src && end > start) setItemAudio({ src, start, end });
    } catch {
      // ignore
    }
  };

  if (!id.trim()) {
    return (
      <div className="min-h-screen dama-screen">
        <ScreenHeader title="Quiz" />
        <div className="px-5 pt-6">
          <div className="glass rounded-2xl p-4">
            <div className="label-mono text-muted-foreground">Missing sutta id</div>
          </div>
        </div>
      </div>
    );
  }

  if (!leaf) {
    return (
      <div className="min-h-screen dama-screen">
        <ScreenHeader title="Quiz" />
        <div className="px-5 pt-6">
          <div className="glass rounded-2xl p-4">
            <div className="label-mono text-muted-foreground">Loading…</div>
          </div>
        </div>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="min-h-screen dama-screen">
        <ScreenHeader title="Quiz" />
        <div className="px-5 pt-6">
          <div className="glass rounded-2xl p-4">
            <div className="label-mono text-muted-foreground">Quiz not found</div>
            <p className="mt-2 text-sm text-muted-foreground">This sutta doesn’t have an MCQ yet.</p>
          </div>
        </div>
      </div>
    );
  }

  const submit = async () => {
    if (!picked) return;
    if (leaf.state === "yellow") {
      reviewLeafToGold(id, picked, quiz.goldOptionId);
    } else {
      answerLeaf(id, picked);
    }
    await navigate({ to: "/tree", search: { focus: id } });
  };

  const headerTitle =
    leaf.state === "yellow" ? "Review (Yellow Leaf)" : leaf.state === "gold" ? "Gold Leaf" : "Quiz";

  return (
    <div className="min-h-screen dama-screen pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
      <ScreenHeader title={headerTitle} />
      <div className="px-5 pt-6">
        <div className="label-mono text-primary">{id}</div>
        <h1 className="mt-2 text-[18px] leading-snug font-semibold tracking-tight">{quiz.quote}</h1>

        {leaf.state === "yellow" ? (
          <div className="mt-4 glass rounded-2xl p-4">
            <div className="label-mono text-muted-foreground">Teacher</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Pick the teacher-aligned interpretation to fix this leaf as gold.
            </p>
            <button
              type="button"
              className="mt-3 rounded-xl glass px-4 py-2 text-sm font-medium"
              onClick={() => void loadAudio()}
            >
              Load audio
            </button>
            {quiz.teacherClip && itemAudio ? (
              <div className="mt-4">
                <AudioPlayer
                  src={itemAudio.src}
                  label={quiz.teacherClip.label}
                  start={quiz.teacherClip.startS}
                  end={quiz.teacherClip.endS}
                  suttaId={id}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 space-y-3">
          {quiz.options.map((opt, idx) => {
            const active = picked === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPicked(opt.id)}
                className={`w-full text-left rounded-2xl p-4 ring-1 transition-colors ${
                  active
                    ? "bg-primary/10 ring-primary/35"
                    : "bg-background/40 ring-white/10 hover:bg-primary/5 hover:ring-primary/20"
                }`}
              >
                <div className="text-sm font-semibold">
                  {idx + 1}. {opt.title}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{opt.body}</div>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={!picked}
          onClick={() => void submit()}
          className="mt-5 w-full rounded-2xl bg-primary text-primary-foreground font-medium py-4 flex items-center justify-center disabled:opacity-40"
        >
          {leaf.state === "yellow" ? "Submit (Try for Gold)" : "Submit (Grow Leaf)"}
        </button>
      </div>

      <RelevantSuttaStrip suttaId={id} audioEnabled={audioEnabled} />
    </div>
  );
}
