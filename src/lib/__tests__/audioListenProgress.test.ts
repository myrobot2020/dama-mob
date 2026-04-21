import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("audioListenProgress", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("stores the maximum fraction reached per sutta", async () => {
    const mod = await import("../audioListenProgress");
    mod.recordAudioListenProgress("7.4.38", 0.5);
    mod.recordAudioListenProgress("7.4.38", 0.3);
    expect(mod.readAudioListenProgress()["7.4.38"]).toBe(0.5);
    mod.recordAudioListenProgress("7.4.38", 0.9);
    expect(mod.readAudioListenProgress()["7.4.38"]).toBe(0.9);
  });

  it("lists sutta ids that meet the completion threshold", async () => {
    const mod = await import("../audioListenProgress");
    mod.recordAudioListenProgress("a", 0.74);
    mod.recordAudioListenProgress("b", 0.75);
    mod.recordAudioListenProgress("c", 1);
    const ids = mod.getSuttaIdsHeardAtLeast(mod.readAudioListenProgress());
    expect(ids).toEqual(["b", "c"]);
  });

  it("returns the same snapshot reference until localStorage changes (useSyncExternalStore)", async () => {
    const mod = await import("../audioListenProgress");
    const a = mod.readAudioListenProgress();
    const b = mod.readAudioListenProgress();
    expect(a).toBe(b);
    mod.recordAudioListenProgress("1.1.1", 0.8);
    const c = mod.readAudioListenProgress();
    expect(c).not.toBe(a);
    const d = mod.readAudioListenProgress();
    expect(d).toBe(c);
  });

  it("counts heard suttas by inferred nikāya", async () => {
    const mod = await import("../audioListenProgress");
    mod.recordAudioListenProgress("11.16", 1);
    mod.recordAudioListenProgress("SN 1.1", 1);
    const map = mod.readAudioListenProgress();
    const ids = mod.getSuttaIdsHeardAtLeast(map);
    const by = mod.countHeardByNikaya(ids);
    expect(by.AN).toBe(1);
    expect(by.SN).toBe(1);
    expect(by.DN + by.MN + by.KN).toBe(0);
  });
});
