/**
 * SSR head-to-head: the barq COMPILER's string backend vs Solid's.
 *
 * Both sides are produced by running the real compiler over the same JSX —
 * `@barqjs/compiler-rs` with `ssr: true`, `babel-preset-solid` with
 * `generate: "ssr"` — and then importing the module each one emitted. Nothing
 * here is a hand-written impression of a backend's output, so neither side can
 * drift away from what actually ships.
 *
 * The BUILT path is kept as a clearly labelled contrast row: `element` renders
 * real DOM under happy-dom and `renderToString` reads it back. It is what this
 * file used to measure through `createElement`, and it is NOT the path the
 * compiler takes — since M9 it is not an authoring path at all, only the
 * builder a template cannot replace.
 *
 * Run: bun run src/ssr-head-to-head.ts
 * Do NOT pass --conditions=browser: `solid-js/web` would resolve to its client
 * build, where `ssr`/`escape` are not the string implementations.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { compileBarq, compileBarqWithWarnings, compileSolid, loadModule } from "./compile.ts";
import { multi, SUMMARY_HEADER, summarize, summaryLine, wilcoxon } from "./stats.ts";

const solidServer = await import("solid-js/web");
if (!solidServer.isServer) {
  throw new Error(
    "solid-js/web resolved to its client build. Drop --conditions=browser: this file needs the " +
      "server build, where ssr()/escape() are the string implementations.",
  );
}

// Only the uncompiled contrast row needs a DOM. Registered after the resolution
// check above so nothing can mistake a DOM being present for the client build.
GlobalRegistrator.register();

const barqCore = await import("@barqjs/core");

// ---------------------------------------------------------------- fixtures

/** One source, both compilers. No TS annotations: the Solid side runs bare Babel. */
const ROWS_PAGE = `
export default function Page(props) {
  return (
    <div class="page">
      <h1>Title</h1>
      <ul>
        {props.rows.map((row) => (
          <li class="row" data-id={String(row.id)}>{row.label}</li>
        ))}
      </ul>
    </div>
  );
}
`;

/**
 * The SAME page, in a module that also mentions a control-flow component.
 *
 * `CODESIGN.md` §0.1's 41.88x row: until M6 the compiler scanned every symbol
 * and dropped the WHOLE module to the DOM backend if any of eight flow
 * components was referenced, so one import cost the page its string backend.
 * The markup `Page` produces is byte-identical either way — which is what makes
 * this a measurement of the deopt and of nothing else.
 */
const ROWS_PAGE_WITH_FLOW = `
import { Portal } from "@barqjs/core";

export function Modal(props) {
  return <Portal target={props.target}>{props.children}</Portal>;
}
${ROWS_PAGE}`;

const STATIC_PAGE = `
export default function Page() {
  return (
    <div class="page">
      <h1>Title</h1>
      <p class="lead">Nothing here moves.</p>
      <ul><li>one</li><li>two</li><li>three</li></ul>
    </div>
  );
}
`;

type Row = { id: number; label: string };

function rows(n: number): Row[] {
  const out: Row[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = { id: i, label: `item ${i} <&>` };
  return out;
}

const DATA = rows(100);

interface Compiled {
  default: (props?: unknown) => unknown;
}

const barqRows = await loadModule<Compiled>(
  compileBarq(ROWS_PAGE, "rows-page.tsx", true),
  "barq-ssr-rows",
);
const solidRows = await loadModule<Compiled>(
  await compileSolid(ROWS_PAGE, "rows-page.jsx", "ssr"),
  "solid-ssr-rows",
);
const flowCompile = compileBarqWithWarnings(ROWS_PAGE_WITH_FLOW, "rows-page-flow.tsx", true);
const barqRowsWithFlow = await loadModule<Compiled>(flowCompile.code, "barq-ssr-rows-flow");
/**
 * Read off the emitted module, not declared. `_$html(` is the string backend's
 * root wrapper and `_$template(` is the DOM backend's, so which one this module
 * contains IS whether the deopt fired — a boolean nobody has to keep in step.
 */
const flowStayedOnTheStringPath = flowCompile.code.includes("_$html(");

const barqStatic = await loadModule<Compiled>(
  compileBarq(STATIC_PAGE, "static-page.tsx", true),
  "barq-ssr-static",
);
const solidStatic = await loadModule<Compiled>(
  await compileSolid(STATIC_PAGE, "static-page.jsx", "ssr"),
  "solid-ssr-static",
);

// The BUILT path: `element` makes real DOM, renderToString reads innerHTML.
function barqUncompiledPage(): unknown {
  const scope = barqCore.getOwner();
  const build = (): unknown =>
    barqCore.element(barqCore.getOwner(), "div", {
      class: "page",
      children: [
        barqCore.element(barqCore.getOwner(), "h1", { children: "Title" }),
        barqCore.element(barqCore.getOwner(), "ul", {
          children: DATA.map((row) =>
            barqCore.element(barqCore.getOwner(), "li", {
              class: "row",
              "data-id": String(row.id),
              children: row.label,
            }),
          ),
        }),
      ],
    });
  return scope === null ? barqCore.createRoot(build) : build();
}

// ---------------------------------------------------------------- what each emits

const barqRowsCode = compileBarq(ROWS_PAGE, "rows-page.tsx", true);
const solidRowsCode = await compileSolid(ROWS_PAGE, "rows-page.jsx", "ssr");
console.log("=== barq, ssr: true =========================================================");
console.log(barqRowsCode.trim());
console.log("\n=== babel-preset-solid, generate: ssr =======================================");
console.log(solidRowsCode.trim());
console.log();

// ---------------------------------------------------------------- correctness

const chunk = (v: unknown): string => (v as { t: string }).t;

/** Consumed so nothing measured below can be dead-code-eliminated. */
let sink = 0;
const keep = (html: string): void => {
  sink += html.length;
};

// C1: barq components take the scope first. A module-level mount is the
// root, which the compiler spells `null`.
const barqHtml = chunk(barqRows.default(null, { rows: DATA }));
const solidHtml = chunk(solidRows.default({ rows: DATA }));
const uncompiledHtml = barqCore.renderToString(() => barqUncompiledPage() as never);

console.log("barq   compiled  :", `${barqHtml.slice(0, 86)}...`);
console.log("solid  compiled  :", `${solidHtml.slice(0, 86)}...`);
console.log("barq   uncompiled:", `${uncompiledHtml.slice(0, 86)}...`);
if (barqHtml !== uncompiledHtml) {
  throw new Error("the compiled barq page and the uncompiled one disagree — fix that first");
}
// Solid leaves a bare `>` alone in text (harmless: it cannot open a tag); barq
// escapes all three. That one byte aside the two must match exactly, or the two
// sides are not doing the same work and the timings below mean nothing.
if (barqHtml !== solidHtml.replaceAll("&amp;>", "&amp;&gt;")) {
  throw new Error(
    "the two compiled pages differ by more than solid's unescaped `>`:\n" +
      `  barq : ${barqHtml.slice(0, 200)}\n  solid: ${solidHtml.slice(0, 200)}`,
  );
}
console.log(
  `both pages are ${barqHtml.length} / ${solidHtml.length} bytes over ${DATA.length} rows ` +
    `(solid is shorter only because it leaves \`>\` unescaped)\n`,
);

// ---------------------------------------------------------------- measurement

const TRIALS = 51;
const ITERATIONS = 400;
// The envelope row pays for a root scope per render, so it runs fewer iterations
// per trial. One binding, interpolated into both the title and the options.
const ENVELOPE_ITERATIONS = ITERATIONS / 4;

function report(
  title: string,
  samples: Map<string, number[]>,
  baseline: string,
  unit: "us" | "ns" = "us",
): void {
  const scale = unit === "us" ? 1000 : 1;
  console.log(`\n${title}`);
  console.log(SUMMARY_HEADER);
  console.log("-".repeat(86));
  const base = samples.get(baseline)!;
  for (const [name, xs] of samples) {
    console.log(summaryLine(name, summarize(xs), scale, 2));
  }
  console.log(`  ${unit === "us" ? "microseconds" : "nanoseconds"} per render; sd across trials`);
  for (const [name, xs] of samples) {
    if (name === baseline) continue;
    const ratios = xs.map((x, i) => x / base[i]);
    const r = summarize(ratios);
    const w = wilcoxon(xs.map((x, i) => x - base[i]));
    const tag =
      r.median >= 1 ? `${r.median.toFixed(2)}x slower` : `${(1 / r.median).toFixed(2)}x faster`;
    console.log(
      `  ${name} vs ${baseline}: ${tag} (ratio p25-p75 ${r.p25.toFixed(3)}-${r.p75.toFixed(3)}, ` +
        `Wilcoxon p=${w.p < 1e-12 ? "<1e-12" : w.p.toExponential(1)})`,
    );
  }
}

report(
  `100-row page, renderToString envelope — the shipping call (${TRIALS} trials x ${ENVELOPE_ITERATIONS} iters)`,
  multi(
    [
      {
        name: "barq compiled",
        setup: () => () => {
          keep(barqCore.renderToString(() => barqRows.default(null, { rows: DATA }) as never));
        },
      },
      {
        name: "solid compiled",
        setup: () => () => {
          keep(solidServer.renderToString(() => solidRows.default({ rows: DATA }) as never));
        },
      },
      {
        name: "barq UNCOMPILED (DOM)",
        setup: () => () => {
          keep(barqCore.renderToString(() => barqUncompiledPage() as never));
        },
      },
    ],
    { trials: TRIALS, iterations: ENVELOPE_ITERATIONS },
  ),
  "barq compiled",
);

// ------------------------------------------------- CODESIGN §0.1's 41.88x row
//
// The same page, rendered from a module that also mentions `Portal`. Before M6
// that reference sent the whole module to the DOM backend; the row is kept
// afterwards because a number that is only collected once cannot be defended,
// and a regression here would be silent.
console.log(
  `\nthe module that mentions \`Portal\` compiled to the ${
    flowStayedOnTheStringPath ? "STRING backend (M6: no whole-module deopt)" : "DOM backend (deopt)"
  }` + (flowCompile.warnings.length > 0 ? `\n  ${flowCompile.warnings.join("\n  ")}` : ""),
);
{
  const withFlowHtml = barqCore.renderToString(
    () => barqRowsWithFlow.default(null, { rows: DATA }) as never,
  );
  if (withFlowHtml !== barqHtml) {
    throw new Error(
      "the page renders differently when its module mentions `Portal` — the two rows below would " +
        "not be measuring the same work:\n" +
        `  plain: ${barqHtml.slice(0, 200)}\n  flow : ${withFlowHtml.slice(0, 200)}`,
    );
  }
}
report(
  `100-row page whose module also mentions \`Portal\` — CODESIGN §0.1's fallback row (${TRIALS} trials x ${ENVELOPE_ITERATIONS} iters)`,
  multi(
    [
      {
        name: "barq, plain module",
        setup: () => () => {
          keep(barqCore.renderToString(() => barqRows.default(null, { rows: DATA }) as never));
        },
      },
      {
        name: "barq, module mentions Portal",
        setup: () => () => {
          keep(
            barqCore.renderToString(() => barqRowsWithFlow.default(null, { rows: DATA }) as never),
          );
        },
      },
    ],
    { trials: TRIALS, iterations: ENVELOPE_ITERATIONS },
  ),
  "barq, plain module",
);

report(
  `100-row page, template assembly only — no root scope (${TRIALS} trials)`,
  multi(
    [
      {
        name: "barq compiled",
        setup: () => () => {
          keep(chunk(barqRows.default(null, { rows: DATA })));
        },
      },
      {
        name: "solid compiled",
        setup: () => () => {
          keep(chunk(solidRows.default({ rows: DATA })));
        },
      },
    ],
    { trials: TRIALS, iterations: ITERATIONS },
  ),
  "barq compiled",
);

// Both backends fold this page to a single constant, so an iteration is one
// object allocation the JIT can sink entirely. The numbers are below the useful
// resolution of a nanosecond timer and are here to show the SHAPE — a static
// page costs neither runtime anything — not to rank the two.
report(
  `fully static page — one folded constant, no escaping (${TRIALS} trials, AT TIMER RESOLUTION)`,
  multi(
    [
      {
        name: "barq compiled",
        setup: () => () => {
          keep(chunk(barqStatic.default(null)));
        },
      },
      {
        name: "solid compiled",
        setup: () => () => {
          keep(chunk(solidStatic.default()));
        },
      },
    ],
    { trials: TRIALS, iterations: ITERATIONS * 10 },
  ),
  "barq compiled",
  "ns",
);

if (sink === 0) throw new Error("the measured work was eliminated");
