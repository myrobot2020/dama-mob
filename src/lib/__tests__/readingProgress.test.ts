import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("readingProgress", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("marks one sutta read and can clear it", async () => {
    const mod = await import("../readingProgress");

    mod.markSuttaRead("1.48", 1000);
    expect(mod.getReadSuttaIds(mod.readReadingProgress())).toEqual(["1.48"]);

    mod.clearSuttaRead("1.48");
    expect(mod.getReadSuttaIds(mod.readReadingProgress())).toEqual([]);
  });

  it("marks a whole book worth of suttas read without duplicating ids", async () => {
    const mod = await import("../readingProgress");

    mod.markSuttasRead(["1.1", "1.2", "1.1", "  "], 2000);

    expect(mod.readReadingProgress()).toMatchObject({
      "1.1": { readAtMs: 2000 },
      "1.2": { readAtMs: 2000 },
    });
    expect(mod.getReadSuttaIds(mod.readReadingProgress())).toEqual(["1.1", "1.2"]);
  });
});
