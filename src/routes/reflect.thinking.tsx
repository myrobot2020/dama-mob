import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import heroImg from "@/assets/reflection-hero.jpg";
import { postDamaQuery, REFLECTION_QUERY_STORAGE_KEY } from "@/lib/damaApi";
import { loadReadSuttaContexts, type ReadSuttaContext } from "@/lib/readSuttaContext";
import { getReadSuttaIds, readReadingProgress } from "@/lib/readingProgress";

async function postLocalLlmReflection(
  reflection: string,
  bot: string,
  readSuttaIds: string[],
  readSuttas: ReadSuttaContext[],
): Promise<{ answer: string; model?: string; provider?: string }> {
  const resp = await fetch("/__llm/reflection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reflection, bot, readSuttaIds, readSuttas }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(text || `BuddhaBot request failed (${resp.status})`);
  }

  return (await resp.json()) as { answer: string; model?: string; provider?: string };
}

export const Route = createFileRoute("/reflect/thinking")({
  component: ThinkingScreen,
});

function ThinkingScreen() {
  const navigate = useNavigate();
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const normalizeMode = (
    raw: string,
  ): "dama" | "simulation" | "buddha" | "psychologist" | "social" | "feminine" => {
    const v = (raw || "").trim().toLowerCase();
    if (v === "buddhabot") return "buddha";
    if (
      v === "simulation" ||
      v === "buddha" ||
      v === "psychologist" ||
      v === "social" ||
      v === "feminine"
    ) {
      return v;
    }
    return "dama";
  };

  useEffect(() => {
    const q = localStorage.getItem("dama:reflection") || "";
    setQuestion(q);
    if (!q.trim()) {
      navigate({ to: "/reflect", replace: true });
      return;
    }

    const mode = normalizeMode(localStorage.getItem("dama:reflectionMode") || "dama");
    const ac = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      setErrorMsg("AI request timed out. You can continue with offline text.");
      setStatus("error");
      localStorage.setItem(
        REFLECTION_QUERY_STORAGE_KEY,
        JSON.stringify({ ok: false, error: "AI request timed out." }),
      );
    }, 60_000);
    (async () => {
      try {
        if (mode !== "dama") {
          const readSuttaIds = getReadSuttaIds(readReadingProgress());
          if (readSuttaIds.length === 0) {
            throw new Error("Mark at least one sutta as read before asking the bot.");
          }
          const readSuttas = await loadReadSuttaContexts(readSuttaIds, q, ac.signal);
          if (readSuttas.length === 0) {
            throw new Error("Could not load the suttas marked as read.");
          }
          const data = await postLocalLlmReflection(q, mode, readSuttaIds, readSuttas);
          if (timedOut) return;
          localStorage.setItem(
            REFLECTION_QUERY_STORAGE_KEY,
            JSON.stringify({
              ok: true,
              answer: data.answer,
              used_llm: true,
              chunks: readSuttas.map((s) => ({
                suttaid: s.suttaid,
                text: s.text.slice(0, 400),
              })),
              mode,
            }),
          );
          window.clearTimeout(timeout);
          navigate({ to: "/reflect/answer", replace: true });
          return;
        }

        const data = await postDamaQuery(q, ac.signal);
        if (timedOut) return;
        localStorage.setItem(
          REFLECTION_QUERY_STORAGE_KEY,
          JSON.stringify({
            ok: true,
            answer: data.answer,
            used_llm: data.used_llm,
            chunks: (data.chunks || []).slice(0, 5).map((c) => ({
              suttaid: c.suttaid,
              text: (c.text || "").slice(0, 400),
            })),
            mode: "dama5",
          }),
        );
        window.clearTimeout(timeout);
        navigate({ to: "/reflect/answer", replace: true });
      } catch (e) {
        if (ac.signal.aborted) return;
        if (timedOut) return;
        const msg = e instanceof Error ? e.message : String(e);
        setErrorMsg(msg);
        setStatus("error");
        localStorage.setItem(
          REFLECTION_QUERY_STORAGE_KEY,
          JSON.stringify({ ok: false, error: msg }),
        );
      }
    })();

    return () => {
      window.clearTimeout(timeout);
      ac.abort();
    };
  }, [navigate]);

  return (
    <div className="min-h-screen dama-screen">
      <ScreenHeader title="Reflection" />
      <div className="px-5">
        <div className="rounded-3xl overflow-hidden aspect-[16/10] relative glass">
          <img
            src={heroImg}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        </div>

        {question && (
          <div className="mt-5 glass rounded-2xl p-4">
            <div className="label-mono text-muted-foreground">You asked</div>
            <p className="mt-2 text-sm italic text-foreground/80 line-clamp-3">"{question}"</p>
          </div>
        )}

        <div className="mt-10 flex flex-col items-center">
          <div className="relative size-44 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-primary/30 blur-2xl animate-pulse-glow" />
            <div className="absolute inset-4 rounded-full bg-gradient-to-br from-primary to-accent animate-pulse-glow" />
            <div className="absolute inset-8 rounded-full bg-background/50 backdrop-blur-md flex items-center justify-center">
              <div className="size-3 rounded-full bg-primary glow-soft animate-pulse" />
            </div>
          </div>
          <p className="mt-8 text-center text-sm text-muted-foreground max-w-xs">
            {status === "error"
              ? "Could not prepare an AI answer. Check the detail below and try again."
              : "Analyzing your reflection with Dhamma wisdom..."}
          </p>
          {status === "error" && errorMsg && (
            <p className="mt-3 text-center text-xs text-destructive/90 max-w-sm break-words">
              {errorMsg}
            </p>
          )}
          {status === "error" && (
            <button
              type="button"
              onClick={() => navigate({ to: "/reflect/answer", replace: true })}
              className="mt-6 rounded-2xl bg-primary text-primary-foreground font-medium px-6 py-3"
            >
              Continue with offline text
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
