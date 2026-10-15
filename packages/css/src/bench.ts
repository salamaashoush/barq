/**
 * `bun src/bench.ts` — what a re-render costs on the runtime path, and what a
 * server pays to read the sheet. `bun src/bench.ts --dom` registers happy-dom
 * first, so an insertion also pays for the `<style>` element it rewrites.
 */
import { atoms, layer } from "./atoms.ts";
import { css } from "./index.ts";
import { collectCss, registerCss } from "./sheet.ts";
import { variants } from "./variants.ts";

if (process.argv.includes("--dom")) {
  const { GlobalRegistrator } = await import("@happy-dom/global-registrator");
  GlobalRegistrator.register();
}

/**
 * The best of five batches. The mean moves with whatever else the machine is
 * doing, and the question is what the code costs, which is the floor. `index`
 * keeps counting across batches, so a case that registers a new rule per call
 * never meets one it already made.
 */
function time(label: string, runs: number, fn: (index: number) => unknown): void {
  fn(-1);
  let best = Infinity;
  for (let batch = 0; batch < 5; batch++) {
    const from = batch * runs;
    const start = Bun.nanoseconds();
    for (let index = from; index < from + runs; index++) fn(index);
    best = Math.min(best, (Bun.nanoseconds() - start) / runs);
  }
  console.log(`${label.padEnd(44)} ${best.toFixed(0).padStart(8)} ns/call`);
}

const ui = layer("bench.ui");

// The sheet first, while it holds what a real page does and nothing else:
// forty module stylesheets of twenty-five layered atoms, and a thousand atoms
// the runtime registered one at a time.
for (let module = 0; module < 40; module++) {
  let sheet = "";
  for (let rule = 0; rule < 25; rule++) {
    const name = `a-width-m${module}_${rule}`;
    sheet +=
      rule % 5 === 0
        ? `@layer bench.ui{@media (min-width: ${rule}px){.${name}{width:${rule}px}}}`
        : `@layer bench.ui{.${name}{width:${rule}px}}`;
  }
  registerCss(`/src/module-${module}.tsx`, sheet);
}
time("insert, one new atom (sheet of 1k to 2k)", 200, (index) =>
  ui({ width: { default: `${index}em`, ":hover": `${index}ex` } }),
);
time("collectCss, 2k rules, sheet unchanged", 500, () => collectCss());
time("collectCss, 2k rules, after one insert", 200, (index) => {
  registerCss("/src/hmr.tsx", `.hmr{order:${index}}`);
  return collectCss();
});

const button = variants({
  base: "base",
  variants: { size: { sm: "s", lg: "l" }, tone: { a: "a", b: "b" } },
  defaults: { size: "sm", tone: "a" },
});
const badge = variants({
  base: atoms({ display: "inline-flex", padding: 4, color: "black" }),
  variants: {
    size: { sm: atoms({ padding: 2 }), lg: atoms({ padding: 8 }) },
    loud: { true: atoms({ fontWeight: 700 }), false: atoms({ fontWeight: 400 }) },
  },
  defaults: { size: "sm" },
  compound: [{ when: { size: "lg", loud: true }, use: atoms({ color: "red" }) }],
});

let flip = false;
time("atoms, 4 declarations, warm", 200_000, () =>
  atoms({ color: "red", padding: 8, display: "flex", gap: 4 }),
);
time("atoms, with a conditional arg", 200_000, () => {
  flip = !flip;
  return atoms({ color: "red", padding: 8 }, flip && { color: "blue" });
});
time("atoms, a shorthand expanded", 200_000, () => atoms({ margin: "0 4px" }));
time("atoms, conditions, warm", 200_000, () =>
  atoms({
    color: { default: "red", ":hover": "blue" },
    "@media (min-width: 600px)": { padding: 8, ":hover": { color: "green" } },
  }),
);
const base = ui({
  display: "flex",
  alignItems: "center",
  padding: "4px 8px",
  borderRadius: 6,
  color: "black",
  backgroundColor: "white",
  ":hover": { backgroundColor: "gray" },
});
const override = ui({ padding: 12, color: "red" });
time("atoms, merging two class strings", 200_000, () => ui(base, override));
time("atoms, a class string and an object", 200_000, () => ui(base, { color: "blue" }));
time("variants, two axes", 200_000, () => button({ size: "lg" }));
time("variants, a compound arm", 200_000, () => badge({ size: "lg", loud: true }));
time(
  "css, a block already compiled",
  200_000,
  () => css`
    color: red;
    &:hover {
      color: blue;
    }
  `,
);

// Last, because every call leaves a rule behind.
time("atoms, 4 declarations, cold", 2_000, (index) =>
  atoms({ width: index + 7919, height: index + 7919, top: index + 7919, left: index + 7919 }),
);
time(
  "css, a block never seen",
  2_000,
  (index) => css`
    color: red;
    &:hover {
      order: ${index};
    }
  `,
);
