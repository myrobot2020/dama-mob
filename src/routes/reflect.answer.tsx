import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { BottomNav } from "@/components/BottomNav";
import { CanonQuote } from "@/components/CanonQuote";
import { sutta } from "@/data/an1116";
import { REFLECTION_QUERY_STORAGE_KEY } from "@/lib/damaApi";
import { Bookmark, Check } from "lucide-react";

type StoredQuery =
  | { ok: true; answer: string; used_llm: boolean; chunks: { suttaid?: string; text: string }[] }
  | { ok: false; error: string };

function readStoredQuery(): StoredQuery | null {
  try {
    const raw = localStorage.getItem(REFLECTION_QUERY_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredQuery;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/reflect/answer")({
  component: AnswerScreen,
});

const OFFLINE_EXPLANATION = `What you describe is a state of mind, and the Buddha taught that mind-states
arise from what we cultivate. The radiation of loving-kindness, when made to
grow, brings well-being even in sleep, calm in waking, and clarity in
difficulty. The feeling you sense is the natural fruit of practice, not
an accident.`;

function AnswerScreen() {
  const [question, setQuestion] = useState("");
  const [saved, setSaved] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [fromApi, setFromApi] = useState(false);

  useEffect(() => {
    setQuestion(localStorage.getItem("dama:reflection") || "");
    const q = readStoredQuery();
    if (q && q.ok && q.answer.trim()) {
      setExplanation(q.answer.trim());
      setFromApi(true);
    } else {
      setExplanation(OFFLINE_EXPLANATION.replace(/\s+/g, " ").trim());
      setFromApi(false);
    }
  }, []);

  const save = () => {
    const entry = {
      question,
      answer: explanation,
      source: sutta.id,
      savedAt: new Date().toISOString(),
      fromApi,
    };
    const prev = JSON.parse(localStorage.getItem("dama:journal") || "[]");
    localStorage.setItem("dama:journal", JSON.stringify([entry, ...prev]));
    setSaved(true);
  };

  return (
    <div className="min-h-screen pb-40">
      <ScreenHeader title="AI Answer" showBookmark />
      <div className="px-5">
        <div className="label-mono text-primary">Grounded Response</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">A reflection from the canon</h1>

        {question && (
          <div className="mt-4 glass rounded-2xl p-4">
            <div className="label-mono text-muted-foreground">Your question</div>
            <p className="mt-1.5 text-sm italic text-foreground/80">"{question}"</p>
          </div>
        )}

        <section className="mt-6">
          <div className="label-mono text-muted-foreground mb-2">
            Explanation{fromApi ? " (dama5)" : " (offline)"}
          </div>
          <p className="text-[15px] leading-relaxed text-foreground/85 whitespace-pre-wrap">
            {explanation}
          </p>
        </section>

        <section className="mt-6">
          <CanonQuote text={sutta.canon} source={sutta.id} />
        </section>

        <button
          onClick={save}
          className={`mt-6 w-full rounded-2xl font-medium py-4 flex items-center justify-center gap-2 ${
            saved ? "glass text-primary" : "bg-primary text-primary-foreground animate-pulse-glow"
          }`}
        >
          {saved ? (
            <>
              <Check size={16} /> Saved to Journal
            </>
          ) : (
            <>
              <Bookmark size={16} /> Save to Journal
            </>
          )}
        </button>
      </div>
      <BottomNav />
    </div>
  );
}
