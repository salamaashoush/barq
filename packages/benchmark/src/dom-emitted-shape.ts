/**
 * Does `dom-head-to-head.ts` measure what the compilers actually emit?
 *
 * It hand-writes both sides. That is deliberate — it isolates the runtimes — but
 * a hand-written shape drifts the moment a backend changes, and a benchmark that
 * drifts is worse than no benchmark. So this file compiles the equivalent JSX
 * through BOTH real compilers, prints what each one emitted, and diffs the set
 * of runtime helpers against the set the benchmark case calls.
 *
 * It reports; it does not assert a match. Some drift is legitimate (Solid's
 * template strings are minified, barq's are not) and some is not (a case whose
 * template the compiler never produces). The table says which is which and the
 * NOTES explain each surviving difference.
 *
 * It also LOADS each emitted barq module and checks that a signal write actually
 * reaches the DOM, because a benchmark case for a binding that is not live would
 * be timing nothing at all.
 *
 * Run: bun run bench:shape
 *   (i.e. `bun --conditions=browser run src/dom-emitted-shape.ts`)
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

import { compileBarq, compileSolid, loadModule } from "./compile.ts";

interface ShapeCase {
  /** The case in `dom-head-to-head.ts` this is about. */
  benchmark: string;
  jsx: string;
  /** Helpers the benchmark hand-writes for barq. */
  barqUses: string[];
  /** Helpers it hand-writes for solid. */
  solidUses: string[];
}

const SIGNAL_PRELUDE_BARQ = `import { signal } from "@barqjs/core";\nconst s = signal(0);\n`;
const SIGNAL_PRELUDE_SOLID = `import { createSignal } from "solid-js";\nconst [s] = createSignal(0);\n`;

const cases: ShapeCase[] = [
  {
    benchmark: "template: clone static tree",
    jsx: `export const C = () => <div class="card"><h2>Title</h2><p>Body text here</p><span>tail</span></div>;`,
    barqUses: ["template"],
    solidUses: ["template"],
  },
  {
    benchmark: "insert: single text hole / text hole update",
    jsx: `export const C = () => <div><span>{s()}</span></div>;`,
    barqUses: ["template", "insert"],
    solidUses: ["template", "insert"],
  },
  {
    benchmark: "list: create 100 rows",
    jsx: `export const C = () => <tr><td>{s()}</td><td>{s()}</td></tr>;`,
    barqUses: ["template", "insert"],
    solidUses: ["template", "insert"],
  },
  {
    benchmark: "list: create 100 rows (in a real table)",
    jsx: `export const C = (p) => <table><tbody>{p.rows.map((r) => <tr><td>{r.id}</td><td>{r.label}</td></tr>)}</tbody></table>;`,
    barqUses: ["template", "insert"],
    solidUses: ["template", "insert"],
  },
  {
    benchmark: "prop: class update",
    jsx: `export const C = () => <div class={s() % 2 ? "a" : "b"} />;`,
    // The benchmark builds the element with document.createElement rather than
    // cloning a template — a fair simplification for a case that measures the
    // prop write, not the clone. `template` is declared here so the diff below
    // reports only the differences that matter.
    barqUses: ["template", "setProp"],
    solidUses: ["template", "className", "effect"],
  },
];

const HELPER = /\b_\$(\w+)\b/g;

function helpers(code: string): Set<string> {
  const out = new Set<string>();
  for (const m of code.matchAll(HELPER)) {
    const name = m[1];
    // `_$el1`/`_$tmpl1` are bindings the backend generated, not helpers.
    if (/^(el|tmpl)/.test(name)) continue;
    out.add(name);
  }
  return out;
}

function diff(used: readonly string[], emitted: Set<string>): string {
  const missing = used.filter((h) => !emitted.has(h));
  const extra = [...emitted].filter((h) => !used.includes(h));
  if (missing.length === 0 && extra.length === 0) return "match";
  const parts: string[] = [];
  if (missing.length > 0)
    parts.push(`benchmark calls but compiler does not emit: ${missing.join(", ")}`);
  if (extra.length > 0)
    parts.push(`compiler emits but benchmark does not call: ${extra.join(", ")}`);
  return `DRIFT — ${parts.join("; ")}`;
}

const emittedBarq = new Map<string, string>();

for (const c of cases) {
  const barqCode = compileBarq(SIGNAL_PRELUDE_BARQ + c.jsx, "case.tsx", false);
  emittedBarq.set(c.benchmark, barqCode);
  const solidCode = await compileSolid(SIGNAL_PRELUDE_SOLID + c.jsx, "case.jsx", "dom");

  console.log(`\n${"=".repeat(78)}`);
  console.log(`benchmark case: ${c.benchmark}`);
  console.log(`JSX: ${c.jsx.replace(/^export const C = /, "").trim()}`);
  console.log(`${"-".repeat(78)}\nbarq emits:`);
  console.log(
    barqCode
      .split("\n")
      .filter((l) => !l.startsWith("import ") && l.trim() !== "" && !l.startsWith("const s ="))
      .join("\n"),
  );
  console.log(`\nsolid emits:`);
  console.log(
    solidCode
      .split("\n")
      .filter((l) => !l.startsWith("import ") && l.trim() !== "" && !l.startsWith("const [s]"))
      .join("\n"),
  );
  console.log(`\n  barq  vs benchmark: ${diff(c.barqUses, helpers(barqCode))}`);
  console.log(`  solid vs benchmark: ${diff(c.solidUses, helpers(solidCode))}`);
}

/** What the compiler really did with a row, read out of the emit. */
function rowShape(benchmark: string): string {
  const code = emittedBarq.get(benchmark) ?? "";
  const template = /_\$+template\(`([^`]*)`\)/.exec(code)?.[1] ?? null;
  const fell = /_\$+element\(/.test(code);
  const head = `      ${benchmark}: `;
  if (template === null) return `${head}no template — ${fell ? "built by name" : "no DOM call"}`;
  const count = code.match(/_\$+template\(/g)?.length ?? 0;
  return `${head}${count} template${count === 1 ? "" : "s"}, first is \`${template}\`${
    fell ? ", plus a built element" : ", no built element"
  }`;
}

// ---------------------------------------------------------------- liveness

/**
 * A benchmark case only means something if the binding it times is live.
 *
 * Two forms of every dynamic prop are compiled here, because barq treats them
 * differently on purpose. `classify.rs` leaves `class`, `style`, `classList`,
 * `ref` and `dangerouslySetInnerHTML` — the STATEFUL_DIFF channels — out of the
 * compiled effect, so the runtime can keep threading the previously applied
 * value and REMOVE what vanished. The consequence is that on those five props
 * the thunk has to come from the author: `class={cond ? "a" : "b"}` is applied
 * once and stays put, while `class={() => (cond ? "a" : "b")}` is live. Every
 * other prop auto-thunks. That asymmetry is the reason this section exists.
 */
interface LivenessProbe {
  what: string;
  jsx: string;
  read: (el: HTMLElement) => string;
  /** Whether barq is expected to keep this binding live. */
  expect: "live" | "static by design";
}

const attrOf =
  (name: string) =>
  (el: HTMLElement): string =>
    el.getAttribute(name) ?? "";

const LIVENESS: LivenessProbe[] = [
  {
    what: "{s()} text hole",
    jsx: `<div><span>{s()}</span></div>`,
    read: (el) => el.textContent ?? "",
    expect: "live",
  },
  { what: "id={s()}", jsx: `<div id={s()} />`, read: attrOf("id"), expect: "live" },
  {
    what: "data-x={String(s())}",
    jsx: `<div data-x={String(s())} />`,
    read: attrOf("data-x"),
    expect: "live",
  },
  {
    what: `class={s() > 3 ? "a" : "b"}`,
    jsx: `<div class={s() > 3 ? "a" : "b"} />`,
    read: attrOf("class"),
    expect: "static by design",
  },
  {
    what: `class={() => (s() > 3 ? "a" : "b")}`,
    jsx: `<div class={() => (s() > 3 ? "a" : "b")} />`,
    read: attrOf("class"),
    expect: "live",
  },
  {
    what: `style={{ width: s() + "px" }}`,
    jsx: `<div style={{ width: s() + "px" }} />`,
    read: attrOf("style"),
    expect: "static by design",
  },
  {
    what: `style={() => ({ width: s() + "px" })}`,
    jsx: `<div style={() => ({ width: s() + "px" })} />`,
    read: attrOf("style"),
    expect: "live",
  },
];

interface Live {
  s: { set(v: number): void };
  C: () => HTMLElement;
}

const core = await import("@barqjs/core");
const solidWeb = await import("solid-js/web");

console.log(`\n${"=".repeat(78)}`);
console.log("LIVENESS of the emitted barq bindings — a signal write, then a read back");
console.log("-".repeat(78));
if (solidWeb.isServer) {
  console.log("(skipped: run with --conditions=browser)");
} else {
  const surprises: string[] = [];
  for (const probe of LIVENESS) {
    const source =
      `import { signal } from "@barqjs/core";\n` +
      `export const s = signal(1);\n` +
      `export const C = () => ${probe.jsx};\n`;
    const mod = await loadModule<Live>(compileBarq(source, "liveness.tsx", false), "liveness");
    const el = mod.C();
    core.flush();
    const before = probe.read(el);
    mod.s.set(7);
    core.flush();
    const after = probe.read(el);
    const observed = before === after ? "static by design" : "live";
    const ok = observed === probe.expect;
    if (!ok) surprises.push(`${probe.what}: expected ${probe.expect}, observed ${observed}`);
    console.log(
      `  ${ok ? "ok  " : "??  "}${probe.what.padEnd(42)}${observed.padEnd(18)}` +
        `${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
    );
  }
  if (surprises.length > 0) {
    throw new Error(
      `the compiler's liveness contract moved:\n  ${surprises.join("\n  ")}\n` +
        "Either the compiler changed or this file's expectations are stale. Both matter.",
    );
  }
}

console.log(`\n${"=".repeat(78)}`);
console.log(`NOTES — differences that the helper-set diff above cannot see:

  * Template STRINGS differ. Solid minifies (\`<div class=card><h2>Title</h2>…<span>tail\`,
    unquoted values and no close tags); barq emits fully closed, quoted markup. The
    benchmark feeds both runtimes the same fully-closed string, which charges Solid a
    parse it would not really pay. That is a real bias, small and in Solid's disfavour,
    on "template: clone static tree" only.

  * Thunk shape on \`insert\`. The benchmark writes \`barq.insert(null, span, () => s())\` and
    \`solid.insert(span, s)\`. Both compilers actually emit the bare accessor \`s\`, so the
    barq side is charged one extra closure call per read that the compiled path does not
    make. Same direction on every insert case, against barq.

  * "list: create 100 rows" hand-writes \`template("<tr><td></td><td></td></tr>")\` for
    both. Whether that is a shape barq produces is DERIVED, not asserted here by hand —
    a hand-written claim about the compiler is the drift this file exists to catch:
${rowShape("list: create 100 rows")}
${rowShape("list: create 100 rows (in a real table)")}

  * "prop: class update" is FAIR despite the drift line above. \`class\` is a STATEFUL_DIFF
    channel: the compiler deliberately does not auto-thunk it, so the live form really is
    the author-written \`class={() => …}\`, which the compiler passes through unchanged as
    \`setProp(el, "class", () => …)\` — exactly what the benchmark calls. The liveness table
    is the proof; without it "the benchmark is 1.14x faster here" could as easily have
    been "the benchmark is timing a write that never lands".`);
