/**
 * One semantic, two implementations.
 *
 * `barq_css` folds a literal `atoms` call at build time and `@barqjs/css`
 * evaluates whatever it declined, so the two have to name a declaration the
 * same class and write it the same rule or one declaration reaches the page
 * twice. Every case here is ONE source text, run through both: evaluated
 * against the runtime, and compiled and then evaluated with the runtime taken
 * away, so a call the compiler left standing fails rather than agreeing with
 * itself.
 */
import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";

import * as runtime from "../../css/src/index.ts";
import { UNITLESS, resetCss } from "../../css/src/internal.ts";

interface Native {
  transform(
    source: string,
    options: Record<string, unknown>,
  ): {
    code: string;
    css?: string | null;
    diagnostics?: { code?: string; severity: string; message: string }[];
  };
  orderCss(css: string): string;
}

const native = createRequire(import.meta.url)("../index.js") as Native;

const NAMES = [
  "atoms",
  "atomsIn",
  "create",
  "createIn",
  "createTheme",
  "defineConditions",
  "defineVars",
  "dynamic",
  "dynamicIn",
  "firstThatWorks",
  "globalVars",
  "layer",
  "props",
  "propsIn",
  "variants",
] as const;

const IMPORT = `import { ${NAMES.join(", ")} } from "@barqjs/css";\n`;

function evaluate(body: string, scope: Record<string, unknown>): unknown {
  const run = new Function(...NAMES, `${body}\nreturn out;`) as (...values: unknown[]) => unknown;
  return run(...NAMES.map((name) => scope[name]));
}

/** Every helper as a call that fails, naming itself. */
function absent(allowed: readonly string[]): Record<string, unknown> {
  const scope: Record<string, unknown> = {};
  for (const name of NAMES) {
    scope[name] = allowed.includes(name)
      ? (runtime as Record<string, unknown>)[name]
      : () => {
          throw new Error(`\`${name}\` was left for the runtime`);
        };
  }
  return scope;
}

interface Sides {
  readonly runtime: { readonly value: unknown; readonly sheet: string };
  readonly compiled: { readonly value: unknown; readonly sheet: string; readonly code: string };
}

/**
 * `body` declares `out`. `keeps` names the helpers a compiled module still
 * calls by design: `layer` for its binding, `props` over a dynamic group,
 * `variants` over classes.
 */
function both(body: string, keeps: readonly string[] = []): Sides {
  resetCss();
  const value = evaluate(body, runtime as Record<string, unknown>);
  const sheet = runtime.collectCss();

  const result = native.transform(`${IMPORT}${body}\nexport { out };\n`, { filename: "parity.ts" });
  const errors = (result.diagnostics ?? []).filter((entry) => entry.severity === "error");
  expect(errors).toEqual([]);
  const code = result.code.replace(/^import .*$/gm, "").replace(/^export \{ out \};$/m, "");
  resetCss();
  // A helper that registers at run time writes to the registry, so the
  // compiled module's own sheet goes there first, the way dev loads it.
  const registers = keeps.some((name) => name !== "layer");
  if (registers) runtime.registerCss("parity.ts", result.css ?? "");
  const compiled = evaluate(code, absent(keeps));
  return {
    runtime: { value, sheet },
    compiled: {
      value: compiled,
      sheet: registers ? runtime.collectCss() : native.orderCss(result.css ?? ""),
      code,
    },
  };
}

/** The classes agree and so does every byte of the stylesheet. */
function agree(body: string, keeps: readonly string[] = []): Sides {
  const sides = both(body, keeps);
  expect(sides.compiled.value).toEqual(sides.runtime.value);
  expect(sides.compiled.sheet).toBe(sides.runtime.sheet);
  return sides;
}

function statements(sheet: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let index = 0; index < sheet.length; index++) {
    if (sheet[index] === "{") depth++;
    else if (sheet[index] === "}" && --depth === 0) {
      out.push(sheet.slice(from, index + 1));
      from = index + 1;
    }
  }
  return out;
}

/**
 * The classes agree, and every rule the compiler wrote is one the runtime
 * wrote. The runtime registers a declaration as it reads it, so one a later
 * argument replaced is still in its sheet; the compiler emits only what
 * survived the merge.
 */
function agreeOnWhatSurvives(body: string): Sides {
  const sides = both(body);
  expect(sides.compiled.value).toEqual(sides.runtime.value);
  const held = new Set(statements(sides.runtime.sheet));
  expect(statements(sides.compiled.sheet).filter((rule) => !held.has(rule))).toEqual([]);
  return sides;
}

const camel = (property: string): string =>
  property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

describe("css parity > the shapes both already read", () => {
  test("declarations, conditions, layers and groups", () => {
    agree(`const out = atoms({ color: "red", margin: 0, width: 8, lineHeight: 2 });`);
    agree(
      `const out = atoms({ color: { default: "red", ":hover": "blue" }, "::before": { content: '"x"' } });`,
    );
    agree(`const out = atomsIn("barq.parity", { display: "flex", gap: 4 });`);
    agree(`const ui = layer("barq.parity");\nconst out = ui({ padding: "1px 2px" });`, ["layer"]);
    agree(
      `const out = create({ root: { width: "100%", maxWidth: 800 }, child: { marginBlock: "1rem" } });`,
    );
    agree(`const out = atoms({ width: firstThatWorks("100dvw", "100vw") });`);
  });

  test("tokens and a theme over them", () => {
    agree(`const out = defineVars({ brand: "#3b82f6", gap: 8 });`);
    agree(`const out = globalVars({ primary: "#3b82f6", radius: "8px" });`);
    agree(
      `const vars = defineVars({ brand: "#3b82f6" });\nconst out = createTheme(vars, { brand: "#60a5fa" });`,
    );
  });
});

describe("css parity > a shorthand", () => {
  test("carries `!important` onto every longhand", () => {
    const { compiled } = agree(`const out = atoms({ margin: "0 auto !important" });`);
    expect(compiled.sheet).toContain("{margin-bottom:0 !important}");
    expect(compiled.sheet).not.toContain(":!important");
    agree(`const out = atoms({ gap: "4px 8px!important", inset: "0 ! important" });`);
  });

  test("reads the two halves of a `border-radius` either side of its slash", () => {
    const { compiled } = agree(`const out = atoms({ borderRadius: "4px / 8px" });`);
    expect(compiled.sheet).toContain("{border-top-left-radius:4px 8px}");
    agree(`const out = atoms({ borderRadius: "1px 2px / 3px 4px 5px" });`);
    agree(`const out = atoms({ borderRadius: "calc(1px / 2) 3px" });`);
  });

  test("splits on every whitespace CSS has", () => {
    agree(`const out = atoms({ padding: "1px\\t2px\\n3px\\f4px" });`);
  });
});

describe("css parity > a bare number", () => {
  test("is a count for every property the runtime counts", () => {
    for (const property of UNITLESS) {
      agree(`const out = atoms({ ${JSON.stringify(camel(property))}: 2 });`);
    }
    const { compiled } = agree(`const out = atoms({ fillOpacity: 0.5 });`);
    expect(compiled.sheet).toContain("{fill-opacity:0.5}");
  });

  test("is written the way JavaScript prints it, whatever the source spelled", () => {
    const { compiled } = agree(
      `const out = atoms({ opacity: .5, width: 1e3, height: 1.50, top: 0x10, left: 1_000, bottom: 0.0, lineHeight: 1.0, right: 0b11, flexGrow: 0o17 });`,
    );
    expect(compiled.sheet).toContain("{opacity:0.5}");
    expect(compiled.sheet).toContain("{width:1000px}");
    expect(compiled.sheet).toContain("{height:1.5px}");
    expect(compiled.sheet).toContain("{top:16px}");
    expect(compiled.sheet).toContain("{left:1000px}");
    expect(compiled.sheet).toContain("{bottom:0}");
    agree(
      `const out = atoms({ width: 1e21, height: 1e-7, top: 123456789012345680000, left: 0.000001, right: 5e-324, bottom: 1.7976931348623157e308, zIndex: 9007199254740993, order: 0.1 });`,
    );
  });

  test("folds behind a sign", () => {
    const { compiled } = agree(
      `const out = atoms({ margin: -4, zIndex: -1, top: +8, left: -0, right: -.5 });`,
    );
    expect(compiled.sheet).toContain("{margin-top:-4px}");
    expect(compiled.sheet).toContain("{z-index:-1}");
    expect(compiled.sheet).toContain("{left:0}");
    agree(`const GAP = -4;\nconst WIDE = 1e3;\nconst out = atoms({ margin: GAP, width: WIDE });`);
  });

  test("keeps that text in a fallback list and in a token", () => {
    agree(`const out = atoms({ width: firstThatWorks(1.50, -2, "3em") });`);
    agree(`const out = defineVars({ gap: 1e3, half: .5, down: -4 });`);
    agree(`const vars = defineVars({ gap: 8 });\nconst out = createTheme(vars, { gap: 0x10 });`);
  });

  test("declares nothing when it is not finite", () => {
    const { compiled } = agree(`const out = atoms({ width: 1e999, color: "red" });`);
    expect(compiled.sheet).not.toContain("Infinity");
    agree(`const out = atoms({ width: -1e999, height: 2 });`);
  });

  test("is written verbatim into a custom property", () => {
    const { compiled } = agree(`const out = atoms({ "--x": 4, "--y": "4", "--z": 0 });`);
    expect(compiled.sheet).toContain("{--x:4}");
  });
});

describe("css parity > a property name", () => {
  test("gets its vendor prefix back", () => {
    const { compiled } = agree(
      `const out = atoms({ WebkitLineClamp: 3, MozAppearance: "none", msTransform: "none", WebkitUserSelect: "none" });`,
    );
    expect(compiled.sheet).toContain("{-webkit-line-clamp:3}");
    expect(compiled.sheet).toContain("{-ms-transform:none}");
  });

  test("gets a dash at every capital", () => {
    agree(`const out = atoms({ gridColumn2: "a", scrollbarGutterX: "b" });`);
  });
});

describe("css parity > a value that would leave its rule", () => {
  test("declares nothing", () => {
    const { compiled } = agree(
      `const out = atoms({ color: "red;} body{display:none", width: 1, background: "url(a" });`,
    );
    expect(compiled.sheet).not.toContain("display:none");
    expect(compiled.sheet).toContain("{width:1px}");
  });

  test("and one that only looks like it is kept", () => {
    agree(
      `const out = atoms({ content: '"}"', background: "url(a;b)", "--json": "{ a: [1, 2] }", gridTemplateAreas: '"a b" "c d"' });`,
    );
  });
});

describe("css parity > a token", () => {
  test("keeps the letters of any script in its name", () => {
    const names = [
      "größe",
      "色",
      "мир",
      "ａｂ",
      "x²",
      "a\u0301b",
      "🎨x",
      "a b",
      "naïve.x",
      "Ⅻ",
      "٣",
      "𝒳",
    ];
    const tokens = names.map((name, index) => `${JSON.stringify(name)}: ${index}`).join(", ");
    agree(`const out = defineVars({ ${tokens} });`);
    agree(`const out = globalVars({ ${tokens} });`);
    agree(
      `const vars = defineVars({ größe: "4px" });\nconst out = [vars, createTheme(vars, { größe: "8px" }), atoms({ width: vars.größe })];`,
    );
  });
});

describe("css parity > the media tier", () => {
  test("is mobile-first whatever order the queries were first used in", () => {
    const { compiled } = agree(
      `const out = atoms({ color: {
        "@media (min-width: 1024px)": "red",
        "@media (max-width: 500px)": "blue",
        "@media print": "green",
        "@media (min-width: 640px)": "teal",
        "@supports (display: grid)": "olive",
        "@media (max-width: 800px)": "navy",
        "@media (min-width: 40em)": "gray",
        "@media (min-width: 640px) and (max-width: 900px)": "plum",
        "@media (width >= 320px)": "pink",
        default: "black",
      } });`,
    );
    const at = (needle: string): number => compiled.sheet.indexOf(needle);
    const order = [
      "{color:black}",
      "(width >= 320px)",
      "(min-width: 40em)",
      "(min-width: 640px){",
      "(min-width: 640px) and (max-width: 900px)",
      "(min-width: 1024px)",
      "(max-width: 800px)",
      "(max-width: 500px)",
      "@media print",
      "@supports (display: grid)",
    ];
    expect(order.map(at).every((index) => index >= 0)).toBe(true);
    expect(order.map(at)).toEqual(order.map(at).toSorted((a, b) => a - b));
  });

  test("and the same across calls and layers", () => {
    agree(
      `const wide = atoms({ width: { "@media (min-width: 900px)": 3 } });
       const narrow = atoms({ width: { "@media (min-width: 300px)": 1, default: 0 } });
       const mid = atomsIn("barq.parity", { width: { "@media (min-width: 600px)": 2 } });
       const low = atomsIn("barq.parity", { width: { "@media (min-width: 200px)": 2 } });
       const out = [wide, narrow, mid, low];`,
    );
  });
});

describe("css parity > a logical property against a physical one", () => {
  test("the later key wins, whichever of the two it is", () => {
    const first = agreeOnWhatSurvives(`const out = atoms({ padding: 4, paddingInline: 8 });`);
    expect(String(first.compiled.value)).not.toContain("a-padding-left");
    expect(String(first.compiled.value)).toContain("a-padding-inline-start");
    expect(String(first.compiled.value)).toContain("a-padding-top");

    const second = agreeOnWhatSurvives(`const out = atoms({ paddingInline: 8, padding: 4 });`);
    expect(String(second.compiled.value)).not.toContain("inline");

    const third = agreeOnWhatSurvives(
      `const out = atoms({ paddingLeft: 1, paddingInlineStart: 2 });`,
    );
    expect(String(third.compiled.value)).not.toContain("a-padding-left");
    const fourth = agreeOnWhatSurvives(
      `const out = atoms({ paddingInlineStart: 2, paddingLeft: 1 });`,
    );
    expect(String(fourth.compiled.value)).not.toContain("inline");
  });

  test("for margin, inset and every border longhand", () => {
    agreeOnWhatSurvives(
      `const out = atoms({ margin: "1px 2px", marginBlock: 3, marginInlineEnd: 4 });`,
    );
    agreeOnWhatSurvives(`const out = atoms({ marginInline: "auto", marginLeft: 0 });`);
    agreeOnWhatSurvives(
      `const out = atoms({ inset: 0, insetInline: 4, top: 2, insetBlockEnd: 1 });`,
    );
    agreeOnWhatSurvives(`const out = atoms({ insetBlockStart: 1, bottom: 2, left: 3 });`);
    agreeOnWhatSurvives(
      `const out = atoms({ borderWidth: 1, borderInlineWidth: 2, borderTopWidth: 3 });`,
    );
    agreeOnWhatSurvives(
      `const out = atoms({ borderBlockColor: "red blue", borderTopColor: "green" });`,
    );
    agreeOnWhatSurvives(
      `const out = atoms({ borderInlineStartStyle: "solid", borderStyle: "dashed" });`,
    );
    agreeOnWhatSurvives(`const out = atoms({ borderRadius: 4, borderStartStartRadius: 8 });`);
    agreeOnWhatSurvives(`const out = atoms({ borderEndEndRadius: 8, borderBottomLeftRadius: 2 });`);
  });

  test("across arguments and across class strings", () => {
    const merged = agreeOnWhatSurvives(`const out = atoms({ padding: 4 }, { paddingInline: 8 });`);
    expect(String(merged.compiled.value)).not.toContain("a-padding-right");
    agreeOnWhatSurvives(
      `const base = atoms({ padding: 4 });\nconst over = atoms({ paddingInline: 8 });\nconst out = [atoms(base, over), atoms(over, base)];`,
    );
    agreeOnWhatSurvives(
      `const styles = create({ base: { marginInline: "auto" }, flush: { marginLeft: 0 } });\nconst out = atoms(styles.base, styles.flush);`,
    );
  });

  test("only inside one condition", () => {
    const { compiled } = agreeOnWhatSurvives(
      `const out = atoms({ paddingLeft: 1, ":hover": { paddingInlineStart: 2, paddingLeft: 3 }, "@media print": { paddingInline: 4 } });`,
    );
    const classes = String(compiled.value).split(" ");
    expect(classes.filter((name) => name.startsWith("a-padding-left")).length).toBe(2);
    expect(classes.filter((name) => name.startsWith("a-padding-inline-start")).length).toBe(1);
  });
});

describe("css parity > a dynamic group", () => {
  test("writes a number into its variable with the unit the declaration takes", () => {
    const { compiled } = agree(
      `const sized = dynamic((w, o, x) => ({ width: w, opacity: o, "--x": x, height: 0 }));\nconst out = props(sized(8, 0.5, 4));`,
      ["props"],
    );
    const style = (compiled.value as { style: Record<string, unknown> }).style;
    expect(Object.values(style)).toEqual(["8px", 0.5, 4, 0].map(String));
    expect(compiled.code).not.toContain("dynamic(");
  });
});

describe("css parity > a named condition", () => {
  const define = `const when = defineConditions({ md: "@media (min-width: 768px)", dark: "[data-theme=dark] &", hover: ":hover" });\n`;

  test("is a key wherever a condition is one", () => {
    const { compiled } = agree(
      `${define}const out = atoms({ color: { default: "red", [when.md]: "blue", [when.hover]: "teal" }, [when.dark]: { color: "white", [when.md]: { padding: 8 } } });`,
    );
    expect(compiled.sheet).toContain("@media (min-width: 768px){");
    expect(compiled.sheet).toContain("[data-theme=dark] .a-");
  });

  test("and reads the same written below its use", () => {
    agree(`const card = () => atoms({ [when.md]: { gap: 4 } });\n${define}const out = card();`);
  });

  test("inside the arms of a variant", () => {
    agree(
      `${define}const button = variants({ base: atoms({ padding: 4, [when.md]: { padding: 8 } }), variants: { tone: { loud: atoms({ color: { default: "red", [when.dark]: "pink" } }) } } });\nconst out = [button(), button({ tone: "loud" })];`,
      ["variants", "atoms"],
    );
  });
});
