import { describe, expect, test } from "bun:test";

import { diffLines, unified } from "../src/diff.ts";

describe("diffLines", () => {
  test("identical input is all keeps", () => {
    const changes = diffLines(["a", "b"], ["a", "b"]);
    expect(changes.map((change) => change.op)).toEqual(["keep", "keep"]);
  });

  test("an inserted line is one add", () => {
    const changes = diffLines(["a", "c"], ["a", "b", "c"]);
    expect(changes).toEqual([
      { op: "keep", line: "a" },
      { op: "add", line: "b" },
      { op: "keep", line: "c" },
    ]);
  });

  test("a removed line is one remove", () => {
    const changes = diffLines(["a", "b", "c"], ["a", "c"]);
    expect(changes.filter((change) => change.op === "remove")).toEqual([
      { op: "remove", line: "b" },
    ]);
  });

  test("a changed line is a remove and an add, not a rewrite of the file", () => {
    const changes = diffLines(["a", "b", "c"], ["a", "B", "c"]);
    expect(changes.filter((change) => change.op !== "keep")).toHaveLength(2);
  });

  test("an empty side is all of the other", () => {
    expect(diffLines([], ["a", "b"]).map((change) => change.op)).toEqual(["add", "add"]);
    expect(diffLines(["a", "b"], []).map((change) => change.op)).toEqual(["remove", "remove"]);
  });

  test("the result reconstructs both sides", () => {
    const before = "one two three four five".split(" ");
    const after = "one three four six five".split(" ");
    const changes = diffLines(before, after);

    expect(changes.filter((c) => c.op !== "add").map((c) => c.line)).toEqual(before);
    expect(changes.filter((c) => c.op !== "remove").map((c) => c.line)).toEqual(after);
  });
});

describe("unified", () => {
  test("no change is no output at all", () => {
    expect(unified("a\nb", "a\nb")).toBe("");
  });

  test("the markers are what carry it without colour", () => {
    const out = unified("a\nb\nc", "a\nB\nc");
    expect(out).toContain("- b");
    expect(out).toContain("+ B");
    expect(out).toContain("  a");
  });

  test("a long run of untouched lines is collapsed", () => {
    const before = Array.from({ length: 60 }, (_, index) => `line ${String(index)}`);
    const after = [...before];
    after[30] = "changed";

    const out = unified(before.join("\n"), after.join("\n"));
    expect(out).toContain("  ...");
    expect(out.split("\n").length).toBeLessThan(20);
    expect(out).toContain("+ changed");
  });

  test("the context either side of a change is kept", () => {
    const before = ["a", "b", "c", "d", "e", "f", "g"];
    const after = ["a", "b", "c", "D", "e", "f", "g"];
    const out = unified(before.join("\n"), after.join("\n"), { context: 1 });
    expect(out).toContain("  c");
    expect(out).toContain("  e");
    expect(out).not.toContain("  a");
  });
});
