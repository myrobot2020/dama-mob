import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { RelevantSuttaStrip } from "@/components/RelevantSuttaStrip";
import { AudioPlayer } from "@/components/AudioPlayer";
import type { SuttaQuiz } from "@/data/an148Quiz";
import { getSuttaQuiz } from "@/data/suttaQuizzes";
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
    meta: [{ title: "Quiz — DAMA" }, { name: "description", content: "Reflection MCQ." }],
  }),
});

const EMPTY_LEAVES = {};

function QuizScreen() {
  const { suttaId } = Route.useParams();
  const id = useMemo(() => normalizeParam(suttaId), [suttaId]);

  const leaves = useSyncExternalStore(subscribeLeaves, readLeaves, () => EMPTY_LEAVES);
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

  const staticQuiz = useMemo(() => {
    return getSuttaQuiz(id);
  }, [id]);
  const [corpusQuiz, setCorpusQuiz] = useState<SuttaQuiz | null>(null);
  const [corpusQuizLoad, setCorpusQuizLoad] = useState<"idle" | "loading" | "done">("idle");
  const quiz = corpusQuiz ?? staticQuiz;

  const [picked, setPicked] = useState<string>("");
  const [submittedOptionId, setSubmittedOptionId] = useState<string>("");
  const [itemAudio, setItemAudio] = useState<{ src: string; start: number; end: number } | null>(
    null,
  );

  const hasTeacherClip = Boolean(quiz?.teacherClip);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setCorpusQuizLoad("loading");
    setCorpusQuiz(null);
    (async () => {
      try {
        const item = await getItem(id);
        if (!cancelled) {
          setCorpusQuiz(item.quiz ?? null);
          setCorpusQuizLoad("done");
        }
      } catch {
        if (!cancelled) {
          setCorpusQuiz(null);
          setCorpusQuizLoad("done");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const loadAudio = async () => {
    if (!hasTeacherClip || itemAudio || !id) return;
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

  useEffect(() => {
    if (!hasTeacherClip) return;
    void loadAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTeacherClip, id]);

  useEffect(() => {
    setPicked("");
    setSubmittedOptionId("");
    setItemAudio(null);
  }, [id]);

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

  if (!quiz && corpusQuizLoad === "loading") {
    return (
      <div className="min-h-screen dama-screen">
        <ScreenHeader title="Quiz" />
        <div className="px-5 pt-6">
          <div className="glass rounded-2xl p-4">
            <div className="label-mono text-muted-foreground">Loading quiz…</div>
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
            <p className="mt-2 text-sm text-muted-foreground">
              This sutta doesn’t have an MCQ yet.
            </p>
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
    setSubmittedOptionId(picked);
  };

  const headerTitle =
    leaf.state === "yellow" ? "Review (Yellow Leaf)" : leaf.state === "gold" ? "Gold Leaf" : "Quiz";
  const submittedOption = quiz.options.find((opt) => opt.id === submittedOptionId) ?? null;
  const goldOption = quiz.options.find((opt) => opt.id === quiz.goldOptionId) ?? null;
  const isTeacherAligned = submittedOptionId === quiz.goldOptionId;

  return (
    <div className="min-h-screen dama-screen pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
      <ScreenHeader title={headerTitle} />
      <div className="px-5 pt-6">
        <Link
          to="/sutta/$suttaId"
          params={{ suttaId: id }}
          className="label-mono text-primary inline-flex hover:underline"
        >
          {id}
        </Link>
        <h1 className="mt-2 text-[18px] leading-snug font-semibold tracking-tight">{quiz.quote}</h1>

        {quiz.teacherClip ? (
          <div className="mt-4 glass rounded-2xl p-4">
            <div className="label-mono text-muted-foreground">Teacher</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Listen to the teacher micro-clip, then pick the closest interpretation.
            </p>
            {quiz.teacherClip && itemAudio ? (
              <div className="mt-4 space-y-3">
                <AudioPlayer
                  src={itemAudio.src}
                  label={quiz.teacherClip.label}
                  start={quiz.teacherClip.startS}
                  end={quiz.teacherClip.endS}
                  suttaId={id}
                />
                {quiz.japaneseAudio ? (
                  <div className="glass rounded-2xl p-4">
                    <div className="text-sm font-medium">{quiz.japaneseAudio.label}</div>
                    <audio
                      controls
                      preload="metadata"
                      src={quiz.japaneseAudio.src}
                      className="mt-3 w-full"
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <button
                  type="button"
                  className="rounded-xl glass px-4 py-2 text-sm font-medium"
                  onClick={() => void loadAudio()}
                >
                  Load audio
                </button>
                {quiz.japaneseAudio ? (
                  <div className="glass rounded-2xl p-4">
                    <div className="text-sm font-medium">{quiz.japaneseAudio.label}</div>
                    <audio
                      controls
                      preload="metadata"
                      src={quiz.japaneseAudio.src}
                      className="mt-3 w-full"
                    />
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        <div className="mt-5 space-y-3">
          {quiz.options.map((opt, idx) => {
            const active = picked === opt.id;
            const submitted = submittedOptionId === opt.id;
            const correct = opt.id === quiz.goldOptionId;
            const feedbackClass =
              submittedOptionId && correct
                ? "bg-emerald-500/14 ring-emerald-400/55 text-emerald-50"
                : submitted && !correct
                  ? "bg-rose-500/10 ring-rose-400/45"
                  : active
                    ? "bg-primary/10 ring-primary/35"
                    : "bg-background/40 ring-white/10 hover:bg-primary/5 hover:ring-primary/20";
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setPicked(opt.id);
                  if (submittedOptionId) setSubmittedOptionId("");
                }}
                className={`w-full text-left rounded-2xl p-4 ring-1 transition-colors ${feedbackClass}`}
              >
                <div className="text-sm font-semibold">
                  {idx + 1}. {opt.title}
                </div>
                <div
                  className={`mt-1 text-sm ${
                    submittedOptionId && correct ? "text-emerald-100/80" : "text-muted-foreground"
                  }`}
                >
                  {opt.body}
                </div>
              </button>
            );
          })}
        </div>

        {submittedOptionId && quiz.teacherSummary ? (
          <div className="mt-5 rounded-2xl bg-primary/10 p-4 ring-1 ring-primary/25">
            <div className="label-mono text-primary">
              {isTeacherAligned ? "Teacher-aligned" : "Teacher answer"}
            </div>
            <div className="mt-2 text-sm font-semibold">
              {isTeacherAligned ? submittedOption?.title : goldOption?.title}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {quiz.teacherSummary}
            </p>
          </div>
        ) : null}

        {!submittedOptionId ? (
          <button
            type="button"
            disabled={!picked}
            onClick={() => void submit()}
            className="mt-5 w-full rounded-2xl bg-primary text-primary-foreground font-medium py-4 flex items-center justify-center disabled:opacity-40"
          >
            {leaf.state === "yellow" ? "Submit (Try for Gold)" : "Submit (Grow Leaf)"}
          </button>
        ) : null}
      </div>

      <div
        className="fixed bottom-0 inset-x-0 z-50 px-3 pt-2 bg-background border-t border-border/60"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <RelevantSuttaStrip suttaId={id} audioEnabled={hasTeacherClip} />
      </div>
    </div>
  );
}
