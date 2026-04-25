import { describe, expect, it } from "vitest";
import { relativeJsonPathForSuttaId } from "../corpusDirect";

describe("corpusDirect", () => {
  it("resolves AN ids with and without prefix", () => {
    expect(relativeJsonPathForSuttaId("AN 11.16")).toBe("an/an11/11.16.json");
    expect(relativeJsonPathForSuttaId("11.16")).toBe("an/an11/11.16.json");
  });

  it("resolves non-AN nikaya ids into suttas folders", () => {
    expect(relativeJsonPathForSuttaId("SN 1.2")).toBe("sn/sn1/suttas/1.2.json");
    expect(relativeJsonPathForSuttaId("DN 2.5")).toBe("dn/dn2/suttas/2.5.json");
    expect(relativeJsonPathForSuttaId("MN 10.1")).toBe("mn/mn10/suttas/10.1.json");
    expect(relativeJsonPathForSuttaId("KN 3.4")).toBe("kn/kn3/suttas/3.4.json");
  });

  it("rejects ids outside the supported corpus path shapes", () => {
    expect(relativeJsonPathForSuttaId("")).toBeNull();
    expect(relativeJsonPathForSuttaId("AN 12.1")).toBeNull();
    expect(relativeJsonPathForSuttaId("nonsense")).toBeNull();
  });
});
