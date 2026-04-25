import { describe, expect, it } from "vitest";
import type { ItemSummary } from "../damaApi";
import type { LeavesStore } from "../leaves";
import { buildTreeLeaves, getSuttasForTreeBook, resolveTreeBook } from "../treeLeaves";

const items = (ids: string[]): ItemSummary[] => ids.map((suttaid) => ({ suttaid }));

describe("treeLeaves", () => {
  it("defaults the tree to AN Book of Ones", () => {
    expect(resolveTreeBook("")).toEqual({ nikaya: "AN", book: "1" });
    expect(resolveTreeBook(undefined)).toEqual({ nikaya: "AN", book: "1" });
  });

  it("uses the focused sutta to choose the AN book", () => {
    expect(resolveTreeBook("5.42")).toEqual({ nikaya: "AN", book: "5" });
    expect(resolveTreeBook("AN 11.16")).toEqual({ nikaya: "AN", book: "11" });
  });

  it("counts leaves from every sutta in the selected AN book", () => {
    const book = resolveTreeBook("1.1");
    const suttas = getSuttasForTreeBook(items(["1.10", "2.1", "1.2", "SN 1.1"]), book);
    expect(suttas.map((it) => it.suttaid)).toEqual(["1.2", "1.10"]);

    const leaves = buildTreeLeaves(suttas, {}, 1000, true);
    expect(leaves).toHaveLength(2);
    expect(leaves.map((leaf) => leaf.suttaId)).toEqual(["1.2", "1.10"]);
    expect(leaves.every((leaf) => leaf.state === "grey")).toBe(true);
  });

  it("layers saved leaf progress onto corpus-generated leaves", () => {
    const suttas = getSuttasForTreeBook(items(["1.1", "1.2"]), resolveTreeBook("1.1"));
    const stored: LeavesStore = {
      "1.2": {
        suttaId: "1.2",
        state: "gold",
        createdAtMs: 1,
        updatedAtMs: 2,
        goldAtMs: 2,
      },
      "9.1": {
        suttaId: "9.1",
        state: "green",
        createdAtMs: 1,
        updatedAtMs: 2,
      },
    };

    const leaves = buildTreeLeaves(suttas, stored, 1000, true);
    expect(leaves.map((leaf) => [leaf.suttaId, leaf.state])).toEqual([
      ["1.1", "grey"],
      ["1.2", "gold"],
    ]);
  });

  it("does not fall back to unrelated saved leaves when the corpus index is loaded", () => {
    const stored: LeavesStore = {
      "9.1": {
        suttaId: "9.1",
        state: "green",
        createdAtMs: 1,
        updatedAtMs: 2,
      },
    };

    expect(buildTreeLeaves([], stored, 1000, true)).toEqual([]);
  });

  it("falls back to saved leaves before the corpus index is available", () => {
    const stored: LeavesStore = {
      "9.1": {
        suttaId: "9.1",
        state: "green",
        createdAtMs: 1,
        updatedAtMs: 2,
      },
    };

    expect(buildTreeLeaves([], stored, 1000, false).map((leaf) => leaf.suttaId)).toEqual(["9.1"]);
  });
});
