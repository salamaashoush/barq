import { beforeEach, describe, expect, test } from "bun:test";

import {
  atoms,
  collectCss,
  create,
  defineConditions,
  defineVars,
  dynamic,
  dynamicIn,
  mergeStyles,
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

describe("dynamic > a value that is not there", () => {
  const tint = dynamic((colour?: string | null | false) => ({ color: colour }));
  const base = atoms({ color: "red" });

  test("declines to add, so an earlier value for the property stands", () => {
    for (const absent of [undefined, null, false] as const) {
      const applied = props(base, tint(absent));
      expect(applied.class).toBe(base);
      expect(applied.style).toEqual({});
    }
    const wide = atoms({ width: 4 });
    const sized = dynamic((width: number) => ({ width }));
    expect(props(wide, sized(Number.NaN))).toEqual({ class: wide, style: {} });
  });

  test("and the same group with a value still replaces it", () => {
    const applied = props(base, tint("blue"));
    expect(applied.class).toBe(tint("blue").$class);
    expect(Object.values(applied.style ?? {})).toEqual(["blue"]);
  });
});

describe("dynamic > its variables", () => {
  test("are registered as not inherited, once each", () => {
    const tint = dynamic((colour: string, gap: string) => ({ color: colour, gap }));
    props(tint("red", "1px"));
    props(tint("blue", "2px 3px"));
    const style = Object.keys(props(tint("red", "1px")).style ?? {});
    expect(style).toHaveLength(3);
    for (const name of style) {
      const rule = `@property ${name}{syntax:"*";inherits:false}`;
      expect(collectCss().split(rule)).toHaveLength(2);
    }
  });
});

describe("dynamic > a value under a condition", () => {
  const hover = dynamic((colour?: string, accent?: string) => ({
    color: { default: colour, ":hover": accent },
    "@media (min-width: 600px)": { backgroundColor: accent },
  }));

  test("is its own variable, read by an atom under that condition", () => {
    const applied = props(hover("red", "blue"));
    expect(Object.values(applied.style ?? {})).toEqual(["red", "blue", "blue"]);
    const sheet = collectCss();
    for (const [index, name] of applied.class.split(" ").entries()) {
      const variable = Object.keys(applied.style ?? {})[index];
      expect(sheet).toMatch(new RegExp(`\\.${name}(:hover)?\\{[a-z-]+:var\\(${variable}\\)\\}`));
    }
    expect(sheet).toContain(":hover{color:var(");
    expect(sheet).toContain("@media (min-width: 600px){.a-background-color-");
  });

  test("and declines to add on its own, leaving the rest", () => {
    const base = atoms({ color: { default: "black", ":hover": "gray" } });
    const applied = props(base, hover("red", undefined));
    const own = applied.class.split(" ").filter((name) => !base.includes(name));
    expect(own).toHaveLength(1);
    expect(applied.class).toContain(base.split(" ")[1]);
    expect(Object.values(applied.style ?? {})).toEqual(["red"]);
  });
});

describe("dynamic > a shorthand", () => {
  const spaced = dynamic((margin: string | number) => ({ margin }));

  test("writes each longhand its own side of the value", () => {
    const applied = props(spaced("1px 2px"));
    expect(properties(applied.class)).toEqual([
      "margin-top",
      "margin-right",
      "margin-bottom",
      "margin-left",
    ]);
    expect(Object.values(applied.style ?? {})).toEqual(["1px", "2px", "1px", "2px"]);
    for (const [index, name] of applied.class.split(" ").entries()) {
      const variable = Object.keys(applied.style ?? {})[index];
      expect(collectCss()).toContain(`.${name}{${properties(name)[0]}:var(${variable})}`);
    }
  });

  test("takes a unit on a number, and declares nothing for a value with too many sides", () => {
    expect(Object.values(props(spaced(4)).style ?? {})).toEqual(["4px", "4px", "4px", "4px"]);
    const margin = atoms({ margin: 1 });
    expect(props(margin, spaced("1px 2px 3px 4px 5px"))).toEqual({ class: margin, style: {} });
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

/**
 * What the types refuse. `tsc` checks this file, so each directive is a test:
 * one that stops erroring fails the typecheck as unused.
 */
describe("atoms > types", () => {
  test("a condition key that is not one is an error rather than a selector", () => {
    // @ts-expect-error -- `defualt` would be read as a descendant selector
    atoms({ color: { defualt: "red" } });
    atoms({ color: { default: "red", ":hover": "blue", "@media print": { default: "black" } } });
  });

  test("a property takes its own keywords, lengths as numbers and a var() anywhere", () => {
    // @ts-expect-error -- `display` has no number
    atoms({ display: 1 });
    // @ts-expect-error -- `position` has no `middle`
    atoms({ position: "middle" });
    atoms({ position: "var(--position)", display: "grid", width: 8, zIndex: 2, opacity: 0.5 });
    const vars = defineVars({ place: "sticky" });
    atoms({ position: vars.place });
    expect(vars.place.startsWith("var(--")).toBe(true);
  });
});

describe("variants > a boolean axis", () => {
  test("takes its default as a boolean, as a selection does", () => {
    const on = atoms({ fontWeight: 700 });
    const off = atoms({ fontWeight: 400 });
    const loud = variants({
      variants: { loud: { true: on, false: off } },
      defaults: { loud: true },
    });
    expect(loud()).toBe(on);
    expect(loud({ loud: false })).toBe(off);
    const axes = { loud: { true: on, false: off } };
    // @ts-expect-error -- the axis has no `maybe` arm
    variants({ variants: axes, defaults: { loud: "maybe" } });
  });
});

describe("mergeStyles", () => {
  test("is props over class strings and dynamic groups, and registers nothing", () => {
    const base = atoms({ color: "red", margin: 1 });
    const tint = dynamic((colour?: string, space?: string) => ({ color: colour, margin: space }));
    const groups = [tint("blue", "1px 2px"), tint(undefined, "3px"), tint("teal")];
    const sheet = collectCss();
    for (const group of groups) {
      expect(mergeStyles(base, false, [group, null])).toEqual(props(base, false, [group, null]));
    }
    expect(collectCss()).toBe(sheet);
  });

  test("leaves a style object alone, which the compiler never hands it", () => {
    expect(mergeStyles("x", { color: "red" })).toEqual({ class: "x" });
  });
});
