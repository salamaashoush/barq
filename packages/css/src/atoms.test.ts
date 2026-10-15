import { beforeEach, describe, expect, test } from "bun:test";

import {
  atoms,
  collectCss,
  create,
  defineConditions,
  dynamic,
  dynamicIn,
  props,
  variants,
} from "./index.ts";
import type { Condition } from "./index.ts";
import { resetCss } from "./internal.ts";

beforeEach(() => {
  resetCss();
});

const properties = (classes: string): string[] =>
  classes.split(" ").map((name) => name.slice(2, name.lastIndexOf("_")));

describe("atoms > a logical property against a physical one", () => {
  test("the later key takes the axis", () => {
    expect(properties(atoms({ padding: 4, paddingInline: 8 }))).toEqual([
      "padding-top",
      "padding-bottom",
      "padding-inline-start",
      "padding-inline-end",
    ]);
    expect(properties(atoms({ paddingInline: 8, padding: 4 }))).toEqual([
      "padding-top",
      "padding-right",
      "padding-bottom",
      "padding-left",
    ]);
    expect(properties(atoms({ paddingLeft: 1, paddingInlineStart: 2 }))).toEqual([
      "padding-inline-start",
    ]);
    expect(properties(atoms({ paddingInlineStart: 2, paddingLeft: 1 }))).toEqual(["padding-left"]);
  });

  test("whichever sheet order first use left them in", () => {
    atoms({ paddingInlineStart: 2 });
    atoms({ paddingLeft: 1 });
    expect(properties(atoms({ paddingLeft: 1, paddingInlineStart: 2 }))).toEqual([
      "padding-inline-start",
    ]);
  });

  test("the other axis is left alone", () => {
    expect(properties(atoms({ marginTop: 1, marginLeft: 2, marginInline: "auto" }))).toEqual([
      "margin-top",
      "margin-inline-start",
      "margin-inline-end",
    ]);
    expect(properties(atoms({ inset: 0, insetBlock: 4 }))).toEqual([
      "right",
      "left",
      "inset-block-start",
      "inset-block-end",
    ]);
  });

  test("for every border longhand, and a corner", () => {
    expect(properties(atoms({ borderInlineWidth: 2, borderLeftWidth: 1 }))).toEqual([
      "border-left-width",
    ]);
    expect(properties(atoms({ borderTopColor: "red", borderBlockColor: "blue" }))).toEqual([
      "border-block-start-color",
      "border-block-end-color",
    ]);
    expect(properties(atoms({ borderRadius: 4, borderStartStartRadius: 8 }))).toEqual([
      "border-bottom-right-radius",
      "border-bottom-left-radius",
      "border-start-start-radius",
    ]);
  });

  test("between arguments, and between class strings", () => {
    expect(properties(atoms({ padding: 4 }, { paddingInline: 8 }))).not.toContain("padding-left");
    const styles = create({ base: { marginInline: "auto" }, flush: { marginLeft: 0 } });
    expect(properties(atoms(styles.base, styles.flush))).toEqual(["margin-left"]);
    expect(properties(atoms(styles.flush, styles.base))).toEqual([
      "margin-inline-start",
      "margin-inline-end",
    ]);
  });

  test("only under the condition both are written for", () => {
    const classes = atoms({ paddingLeft: 1, ":hover": { paddingInlineStart: 2 } }).split(" ");
    expect(classes.length).toBe(2);
    const merged = atoms(atoms({ ":hover": { paddingLeft: 1 } }), {
      ":hover": { paddingInline: 2 },
    });
    expect(merged.split(" ").length).toBe(2);
    expect(merged).not.toContain("a-padding-left");
  });
});

describe("atoms > a custom property", () => {
  test("takes a number as written", () => {
    const cls = atoms({ "--columns": 4 });
    expect(collectCss()).toContain(`.${cls}{--columns:4}`);
  });
});

describe("dynamic > a number", () => {
  test("reaches the element with the unit its declaration takes", () => {
    const sized = dynamic((width: number, opacity: number, x: number) => ({
      width,
      opacity,
      "--x": x,
      height: 0,
    }));
    const { style } = props(sized(8, 0.5, 4));
    expect(Object.values(style ?? {})).toEqual(["8px", "0.5", "4", "0"]);
  });

  test("and a string is left as it is, in a layer as out of one", () => {
    const sized = dynamicIn("barq.dynamic", (width: string | number) => ({ width }));
    expect(Object.values(props(sized("50%")).style ?? {})).toEqual(["50%"]);
    expect(Object.values(props(sized(12)).style ?? {})).toEqual(["12px"]);
  });
});

describe("defineConditions", () => {
  const when = defineConditions({
    md: "@media (min-width: 768px)",
    dark: "[data-theme=dark] &",
    hover: ":hover",
  });

  test("names a condition once, for a key or a value's condition", () => {
    const cls = atoms({
      color: { default: "red", [when.md]: "blue" },
      [when.dark]: { color: "white" },
    });
    const [base, wide, dark] = cls.split(" ");
    const sheet = collectCss();
    expect(sheet).toContain(`.${base}{color:red}`);
    expect(sheet).toContain(`@media (min-width: 768px){.${wide}{color:blue}}`);
    expect(sheet).toContain(`[data-theme=dark] .${dark}{color:white}`);
  });

  test("is the same class as the condition written out", () => {
    expect(atoms({ color: { [when.hover]: "red" } })).toBe(atoms({ color: { ":hover": "red" } }));
  });

  test("composes through a variant's arms", () => {
    const button = variants({
      base: atoms({ padding: 4, [when.md]: { padding: 8 } }),
      variants: { tone: { loud: atoms({ [when.md]: { padding: 12 } }) } },
    });
    expect(button({ tone: "loud" }).split(" ").length).toBe(8);
  });

  test("refuses a value that is not a condition", () => {
    const spelled: string = "min-width: 768px";
    expect(() => defineConditions({ md: spelled as Condition })).toThrow(/`md` is not a condition/);
  });
});
