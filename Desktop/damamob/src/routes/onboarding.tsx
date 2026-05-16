import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingFlow,
  head: () => ({
    meta: [{ title: "Welcome to DAMA" }],
  }),
});

type Depth = "Beginner" | "Daily reader" | "Deep study";
type Tone = "Calm" | "Analytical" | "Devotional";
type Motivation = "Stress" | "Learning" | "Meditation" | "Curiosity" | "Other";

function OnboardingFlow() {
  const [step, setStep] = useState(0);
  const [depth, setDepth] = useState<Depth | null>(null);
  const [tone, setTone] = useState<Tone | null>(null);
  const [motivations, setMotivations] = useState<Motivation[]>([]);
  const navigate = useNavigate();

  const finish = () => {
    localStorage.setItem("dama:onboardingComplete", "true");
    localStorage.setItem("dama:prefs", JSON.stringify({ depth, tone, motivations }));
    navigate({ to: "/" });
  };

  const next = () => setStep((s) => s + 1);
  const skip = () => finish();

  const progressDots = (
    <div className="flex justify-center gap-1.5 mb-8">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={cn(
            "h-1 rounded-full transition-all duration-300",
            i === step ? "w-6 bg-[#b08d57]" : "w-1.5 bg-slate-300"
          )}
        />
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#fdfbf7] text-[#3d3124] flex flex-col font-sans overflow-x-hidden">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between">
        <div className="w-10" /> {/* Spacer */}
        <div className="label-mono opacity-50 text-[10px]">Dama</div>
        <div className="w-10 flex justify-end">
          {step > 0 && (
            <button
              onClick={skip}
              className="label-mono opacity-50 text-[10px] hover:opacity-100 transition-opacity"
            >
              Skip
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 px-8 flex flex-col max-w-md mx-auto w-full pb-12">
        {progressDots}

        {step === 0 && (
          <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="relative aspect-[16/9] mb-12 rounded-lg border border-[#e7d8b1] overflow-hidden bg-white p-1 shadow-sm">
              <img
                src="/panels/buddha-mountain.png"
                alt="Dhamma Background"
                className="w-full h-full object-cover ink-panel opacity-90 rounded-sm"
              />
            </div>

            <h1 className="text-[2.5rem] leading-[1.1] font-serif mb-4 tracking-tight">
              A quiet place to read, reflect, and remember the Dhamma.
            </h1>
            <p className="text-lg opacity-60 font-sans mb-12">
              Daily suttas. Simple practice. No noise.
            </p>

            <div className="mt-auto space-y-4">
              <Button
                onClick={next}
                className="w-full h-14 rounded-xl bg-[#1a1510] text-[#fdfbf7] hover:bg-[#2a2520] transition-transform active:scale-95 text-lg font-medium"
              >
                Continue
              </Button>
              <button
                onClick={() => navigate({ to: "/login" })}
                className="w-full text-center text-sm opacity-60 hover:opacity-100 transition-opacity border-b border-transparent hover:border-slate-300 pb-0.5"
              >
                I already have the app
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-right-4 duration-500">
            <h1 className="text-4xl font-serif mb-3 tracking-tight">How will you read?</h1>
            <p className="text-lg opacity-60 mb-10">
              Pick a depth and a tone. You can change this later.
            </p>

            <div className="space-y-8">
              <section>
                <h3 className="label-mono text-[11px] opacity-40 mb-4">Depth</h3>
                <div className="flex flex-wrap gap-2">
                  {(["Beginner", "Daily reader", "Deep study"] as Depth[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDepth(d)}
                      className={cn(
                        "px-5 py-2.5 rounded-full border text-sm transition-all",
                        depth === d
                          ? "bg-[#1a1510] text-white border-[#1a1510]"
                          : "bg-white/40 border-[#e7d8b1] hover:border-[#1a1510]/30"
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="label-mono text-[11px] opacity-40 mb-4">Tone</h3>
                <div className="flex flex-wrap gap-2">
                  {(["Calm", "Analytical", "Devotional"] as Tone[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTone(t)}
                      className={cn(
                        "px-5 py-2.5 rounded-full border text-sm transition-all",
                        tone === t
                          ? "bg-[#1a1510] text-white border-[#1a1510]"
                          : "bg-white/40 border-[#e7d8b1] hover:border-[#1a1510]/30"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </section>
            </div>

            <div className="mt-auto pt-10">
              <Button
                onClick={next}
                disabled={!depth || !tone}
                className={cn(
                  "w-full h-14 rounded-xl transition-all text-lg font-medium",
                  depth && tone
                    ? "bg-[#1a1510] text-[#fdfbf7] hover:bg-[#2a2520]"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                )}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-right-4 duration-500">
            <h1 className="text-4xl font-serif mb-3 tracking-tight">What brings you here?</h1>
            <p className="text-lg opacity-60 mb-10">
              Pick any that fit. Optional.
            </p>

            <div className="flex flex-wrap gap-3">
              {(["Stress", "Learning", "Meditation", "Curiosity", "Other"] as Motivation[]).map((m) => {
                const active = motivations.includes(m);
                return (
                  <button
                    key={m}
                    onClick={() => {
                      if (active) setMotivations(motivations.filter((it) => it !== m));
                      else setMotivations([...motivations, m]);
                    }}
                    className={cn(
                      "px-6 py-3 rounded-full border text-sm transition-all",
                      active
                        ? "bg-[#1a1510] text-white border-[#1a1510]"
                        : "bg-white/40 border-[#e7d8b1] hover:border-[#1a1510]/30"
                    )}
                  >
                    {m}
                  </button>
                );
              })}
            </div>

            <div className="mt-auto flex flex-col gap-4 pt-10">
              <Button
                onClick={next}
                className="w-full h-14 rounded-xl bg-[#1a1510] text-[#fdfbf7] hover:bg-[#2a2520] transition-transform active:scale-95 text-lg font-medium"
              >
                Continue
              </Button>
              <button
                onClick={skip}
                className="text-sm opacity-50 hover:opacity-100 transition-opacity mx-auto"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-1000">
            <div className="w-16 h-16 rounded-full bg-[#b08d57] mb-8 flex items-center justify-center text-white shadow-xl shadow-[#b08d57]/20">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            </div>
            <h1 className="text-4xl font-serif mb-4 tracking-tight">All set.</h1>
            <p className="text-lg opacity-60 mb-12 max-w-[260px]">
              Your quiet place for Dhamma is ready.
            </p>
            <Button
              onClick={finish}
              className="w-full h-14 rounded-xl bg-[#1a1510] text-[#fdfbf7] hover:bg-[#2a2520] transition-transform active:scale-95 text-lg font-medium"
            >
              Enter Dama
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
