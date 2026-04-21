import { describe, expect, it } from "vitest";
import type { ItemSummary } from "../damaApi";
import {
  getFirstSuttaGlobally,
  getNextSuttaInBook,
  parseSuttaRouteId,
  sortSuttaIds,
} from "../suttaNavOrder";

const samples = (ids: string[]): ItemSummary[] => ids.map((suttaid) => ({ suttaid }));

describe("suttaNavOrder", () => {
  it("parseSuttaRouteId extracts id", () => {
    expect(parseSuttaRouteId("/sutta/7.4.38")).toBe("7.4.38");
    expect(parseSuttaRouteId("/sutta/SN%201.1")).toBe("SN 1.1");
    expect(parseSuttaRouteId("/")).toBeUndefined();
    expect(parseSuttaRouteId("/browse")).toBeUndefined();
  });

  it("sortSuttaIds uses numeric-aware order", () => {
    const s = sortSuttaIds(samples(["10.1", "2.3", "2.10"]));
    expect(s.map((x) => x.suttaid)).toEqual(["2.3", "2.10", "10.1"]);
  });

  it("getNextSuttaInBook follows AN nipāta order", () => {
    const items = samples(["7.4.38", "7.4.39", "8.1.1"]);
    expect(getNextSuttaInBook(items, "7.4.38")?.suttaid).toBe("7.4.39");
    expect(getNextSuttaInBook(items, "7.4.39")).toBeNull();
  });

  it("getFirstSuttaGlobally picks first sorted id", () => {
    const items = samples(["10.1", "2.3"]);
    expect(getFirstSuttaGlobally(items)?.suttaid).toBe("2.3");
  });
});
