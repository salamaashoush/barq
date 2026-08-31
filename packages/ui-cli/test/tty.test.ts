/**
 * The list prompt's answer handling, without a terminal to type into.
 *
 * `choose` itself is three lines of `readline` around `pick`, and `pick` is
 * where it can be wrong: a number that is off the end, a name that is not
 * offered, and the two ways an answer can look like nothing.
 */

import { describe, expect, test } from "bun:test";

import { pick, type Option } from "../src/tty.ts";

const OPTIONS: readonly Option[] = [
  { value: "", label: "The theme's own" },
  { value: "0", label: "None" },
  { value: "0.45rem", label: "Small" },
];

describe("pick", () => {
  test("a number picks the line with that number, counting from one", () => {
    expect(pick("1", OPTIONS, "0")).toBe("");
    expect(pick("2", OPTIONS, "0")).toBe("0");
    expect(pick("3", OPTIONS, "0")).toBe("0.45rem");
  });

  test("a name picks itself, because a person reads the list and types one", () => {
    expect(pick("0.45rem", OPTIONS, "")).toBe("0.45rem");
  });

  test("nothing typed is the default, which is what makes the prompt skippable", () => {
    expect(pick("", OPTIONS, "0")).toBe("0");
    expect(pick("   ", OPTIONS, "0")).toBe("0");
  });

  test("a number off either end is not understood", () => {
    // Not "clamped to the nearest": a person who typed 4 meant something, and
    // silently giving them 3 is worse than asking again.
    const named: readonly Option[] = [
      { value: "neutral", label: "Neutral" },
      { value: "stone", label: "Stone" },
    ];
    expect(pick("0", named, "neutral")).toBeUndefined();
    expect(pick("3", named, "neutral")).toBeUndefined();
    expect(pick("-1", named, "neutral")).toBeUndefined();
  });

  test("a name nothing offers is not understood", () => {
    expect(pick("chartreuse", OPTIONS, "")).toBeUndefined();
  });

  test("a line number wins over a value that reads as one", () => {
    // The radius list offers `0` as a VALUE, at line 2. Typing `0` is not line
    // zero — there is none — so it falls through to the name and still answers.
    expect(pick("2", OPTIONS, "")).toBe("0");
    expect(pick("0", OPTIONS, "")).toBe("0");
  });

  test("a fractional or padded number is not a line number", () => {
    expect(pick("1.5", OPTIONS, "")).toBeUndefined();
    expect(pick(" 2 ", OPTIONS, "")).toBe("0");
  });
});
