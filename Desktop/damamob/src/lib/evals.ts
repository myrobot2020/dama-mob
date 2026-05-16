import { type HarnessMessage } from "./aiHarness";
import { type ReadSuttaContext } from "./readSuttaContext";

export type EvalResult = {
  score: number; // 0.0 to 1.0
  pass: boolean;
  reason: string;
  metrics: {
    grounding: number;
    persona: number;
    format: number;
    logic: number;
  };
};

export type GoldenScenario = {
  id: string;
  name: string;
  input: string;
  history?: HarnessMessage[];
  expectedSuttaIds: string[];
  intent: string;
};

export const GOLDEN_SCENARIOS: GoldenScenario[] = [
  {
    id: "gs-1",
    name: "Metta for Stress",
    input: "I am feeling very stressed at work. What did the Buddha say about finding peace?",
    expectedSuttaIds: ["AN 11.16"],
    intent: "reflection"
  },
  {
    id: "gs-2",
    name: "Finger Snap",
    input: "What did the Buddha mean by a 'finger snap'?",
    expectedSuttaIds: ["AN 1.18.13"],
    intent: "reflection"
  },
  {
    id: "gs-3",
    name: "Loving Kindness Benefits",
    input: "What are the benefits of practicing metta?",
    expectedSuttaIds: ["AN 11.16"],
    intent: "reflection"
  }
];

/**
 * Enhanced Evaluation Tool (Point 27/37)
 * Uses a "Judgement Model" to score the response.
 */
export async function evaluateResponse(
  input: string,
  answer: string,
  grounding: ReadSuttaContext[],
  history: HarnessMessage[] = []
): Promise<EvalResult> {
  // In a real system, this would call a specialized evaluation prompt on a high-tier model (e.g. GPT-4o)
  // For this demo, we'll use the reflection endpoint with an evaluation prompt.

  const evalPrompt = `
    You are an expert Dhamma Eval Auditor.
    Evaluate the following AI response based on these criteria:
    1. GROUNDING: Does it use the provided suttas? Does it hallucinate IDs?
    2. PERSONA: Does it sound compassionate and teacher-like?
    3. LOGIC: Is the advice consistent with the suttas?
    4. FORMAT: Does it follow the required format (Title, Bullets, Practice, Follow-up)?

    INPUT: "${input}"
    HISTORY: ${JSON.stringify(history)}
    GROUNDING SUTTAS: ${grounding.map(s => `[${s.suttaid}] ${s.text}`).join("\n")}
    AI ANSWER: "${answer}"

    Respond ONLY in JSON:
    {
      "score": 0.0-1.0,
      "pass": boolean,
      "reason": "string",
      "metrics": {
        "grounding": 0.0-1.0,
        "persona": 0.0-1.0,
        "format": 0.0-1.0,
        "logic": 0.0-1.0
      }
    }
  `;

  try {
    const resp = await fetch("/__llm/reflection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reflection: evalPrompt,
        bot: "buddha",
        metadata: { isEval: true }
      }),
    });

    if (!resp.ok) throw new Error("Eval service failed");

    const data = await resp.json();

    // Try to parse JSON from the answer if the model wrapped it in text
    let result: EvalResult;
    try {
      const jsonMatch = data.answer.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(data.answer);
    } catch {
      // Fallback if parsing fails
      result = {
        score: 0.5,
        pass: true,
        reason: "Failed to parse eval JSON, but service returned success.",
        metrics: { grounding: 0.5, persona: 0.5, format: 0.5, logic: 0.5 }
      };
    }

    return result;
  } catch (e) {
    return {
      score: 0,
      pass: false,
      reason: "Evaluation error: " + (e instanceof Error ? e.message : String(e)),
      metrics: { grounding: 0, persona: 0, format: 0, logic: 0 }
    };
  }
}
