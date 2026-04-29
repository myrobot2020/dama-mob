import { describe, expect, it, vi } from "vitest";
import {
  applyHarnessGuardrails,
  buildDamaHarnessBlueprint,
  extractSuttaIds,
  parseHarnessIntent,
  planHarnessSteps,
  runHarness,
  validateHarnessInput,
  type HarnessTool,
} from "../aiHarness";

describe("aiHarness", () => {
  it("extracts sutta ids and parses DAMA intents", () => {
    expect(extractSuttaIds("Reflect on AN 11.16 and sn 1.1")).toEqual(["AN 11.16", "SN 1.1"]);

    expect(parseHarnessIntent({ channel: "ui", text: "Reflect on goodwill", readSuttaIds: ["AN 11.16"] })).toMatchObject({
      kind: "reflection",
      confidence: 0.84,
    });
    expect(parseHarnessIntent({ channel: "ui", text: "quiz me on AN 1.1" }).kind).toBe("quiz");
    expect(parseHarnessIntent({ channel: "ui", text: "sync my progress to cloud" }).kind).toBe("profile_sync");
    expect(parseHarnessIntent({ channel: "cli", text: "run pipeline tally" }).kind).toBe("admin_pipeline");
  });

  it("validates input and guardrails risky requests", () => {
    expect(validateHarnessInput({ channel: "ui", text: "" })).toContain("Input text is required.");
    expect(
      validateHarnessInput({
        channel: "ui",
        text: "x".repeat(10_001),
      }),
    ).toContain("Input text must be 10,000 characters or fewer.");

    const reflectionIntent = parseHarnessIntent({ channel: "ui", text: "reflection please" });
    expect(applyHarnessGuardrails({ channel: "ui", text: "reflection please" }, reflectionIntent)).toContain(
      "Reflection answers need at least one marked-read sutta for grounding.",
    );
    expect(
      applyHarnessGuardrails(
        { channel: "api", text: "delete all production data" },
        parseHarnessIntent({ channel: "api", text: "delete all production data" }),
      ),
    ).toContain("Destructive production actions require explicit human approval.");
  });

  it("plans deterministic steps by intent", () => {
    const reflection = parseHarnessIntent({
      channel: "ui",
      text: "Reflect on today",
      readSuttaIds: ["AN 11.16"],
    });
    expect(planHarnessSteps(reflection).map((step) => step.id)).toEqual([
      "load-read-suttas",
      "retrieve-grounding",
      "call-model",
      "format-output",
    ]);

    const sync = parseHarnessIntent({ channel: "ui", text: "sync progress" });
    expect(planHarnessSteps(sync).map((step) => step.tool)).toEqual(["syncProgress"]);
  });

  it("runs tools, traces steps, and returns final output", async () => {
    const calls: string[] = [];
    const makeTool =
      (name: string): HarnessTool =>
      () => {
        calls.push(name);
        return `${name}:ok`;
      };

    const result = await runHarness(
      { channel: "ui", text: "Reflect on goodwill", readSuttaIds: ["AN 11.16"] },
      {
        loadReadSuttas: makeTool("load"),
        retrieveCorpus: makeTool("retrieve"),
        callReflectionModel: makeTool("model"),
        formatReflection: makeTool("format"),
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(calls).toEqual(["load", "retrieve", "model", "format"]);
    expect(result.output).toBe("format:ok");
    expect(result.state.trace.filter((event) => event.status === "succeeded")).toHaveLength(4);
  });

  it("retries failing tools and reports missing required tools", async () => {
    const flaky = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce("model:ok");

    const retried = await runHarness(
      { channel: "ui", text: "Reflect on goodwill", readSuttaIds: ["AN 11.16"] },
      {
        loadReadSuttas: () => "load:ok",
        retrieveCorpus: () => "retrieve:ok",
        callReflectionModel: flaky,
        formatReflection: () => "format:ok",
      },
    );
    expect(retried.ok).toBe(true);
    expect(flaky).toHaveBeenCalledTimes(2);

    const missing = await runHarness({ channel: "cli", text: "run pipeline tally" }, {});
    expect(missing.ok).toBe(false);
    if (missing.ok) throw new Error("Expected missing tool failure.");
    expect(missing.error).toBe("Missing tool: runPipelineCheck.");
  });

  it("documents all 37 inferred harness components", () => {
    const blueprint = buildDamaHarnessBlueprint();
    expect(blueprint).toHaveLength(37);
    expect(blueprint[0]).toMatchObject({ step: 1, component: "Input / Command Layer" });
    expect(blueprint[36]).toMatchObject({ step: 37, component: "Model Adaptation Pipeline" });
  });
});
