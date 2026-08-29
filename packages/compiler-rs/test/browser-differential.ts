/**
 * The corpus, rendered and driven in a real browser.
 *
 * `oracle.test.ts` runs the whole corpus against happy-dom, and happy-dom has
 * already hidden three separate bug classes on this project: HTML tree
 * construction (it does not foster-parent, does not auto-close `<p>`, does not
 * run the adoption agency), the tokenizer's NUL/CR rewriting (it hands both
 * back unchanged), and `SVGElement.className` (it models a read-only
 * `SVGAnimatedString` as a writable string). Each one was a green suite over a
 * compiler that was wrong where it counts.
 *
 * So the same corpus runs here too: every compiled module bundled into one
 * page, rendered in Chrome, driven through its own `steps` and `events`, and
 * walked with the same `normalize.ts` channels the happy-dom suite uses. What
 * it does NOT carry over is the effect tracer — that is `mock.module`, which
 * has no meaning in a browser — so this is the DOM half of the invariant, which
 * is exactly the half a fake DOM can lie about.
 *
 * ## What M9 changed here
 *
 * This used to bundle the fixture's own source BESIDE the compiled module and
 * diff the two. `CODESIGN.md` §6 retires that reference, so the page now drives
 * the compiled module alone and returns what it observed. Two things replace
 * the diff, and neither needs a second implementation:
 *
 *  - the page keeps the channels that were always self-checks — marker layout
 *    against the anchors the clones baked in, and the attribute PARTITION —
 *    which are the two the real parser is needed for in the first place;
 *  - `compareRuns` below diffs a CORRUPTED run against the CLEAN one, in node.
 *    That is what every detector in `browser.test.ts` was actually measuring:
 *    the reference was never load-bearing there, the corruption was.
 *
 * Cost: one Chrome launch and one bundle for the whole corpus, about three
 * seconds. It is not per-fixture, which is what makes it affordable in CI.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Page } from "./chrome.ts";
import {
  browserOnlySource,
  compileBrowserOnly,
  compileFixture,
  fixtureSource,
  listBrowserOnlyFixtures,
  listFixtures,
  patchedAttributeNames,
  TMP_DIR,
} from "./harness.ts";

const PRAGMA = "/** @jsxImportSource @barqjs/core */\n";

/**
 * `@barqjs/core` with `template` recording every clone it hands out.
 *
 * The happy-dom harness gets this from `mock.module`, which has no meaning in a
 * browser, so the compiled modules import through this shim instead.
 *
 * `export *` skips a name the module also exports locally, so `template` here is
 * the one every compiled module binds and every other export is the real one;
 * the runtime's own module state (the installed delegated event set above all)
 * stays shared exactly as it is in production.
 *
 * Without it the marker-layout channel had to ask "does this module clone each
 * template exactly once?" and, whenever the answer was no, degrade to "a module
 * whose templates bake no anchor cannot produce one" — which is no check at all
 * for a module that bakes one.
 */
const CORE_SHIM = `export * from "@barqjs/core"
import { template as realTemplate } from "@barqjs/core"

// Counted HERE, on the fresh clone, and never again. Counting at snapshot time
// instead double-counts: once a clone has been inserted into another clone, the
// outer one's subtree contains the inner one's anchors too.
function bakedAnchors(root) {
  let anchors = 0
  const visit = (node) => {
    if (node.nodeType === 8 && node.data === "") anchors++
    for (const child of Array.from(node.childNodes)) visit(child)
  }
  visit(root)
  return anchors
}

export function template(html, isSVG) {
  const clone = realTemplate(html, isSVG)
  return () => {
    const node = clone()
    ;(window.__barqTemplates ??= []).push({ node, anchors: bakedAnchors(node) })
    return node
  }
}
`;

/** The event types the emitted module registers with `delegateEvents([...])`. */
function delegatedTypes(code: string): string[] {
  const call = code.match(/_\$+delegateEvents\(\[([^\]]*)\]\)/);
  if (!call) return [];
  return call[1]
    .split(",")
    .map((entry) => entry.trim().replace(/^["']|["']$/g, ""))
    .filter((entry) => entry.length > 0);
}

export interface BrowserDivergence {
  fixture: string;
  kind:
    | "initial-dom"
    | "step-dom"
    | "event-dom"
    | "marker-layout"
    | "attribute-order"
    | "node-identity-differential"
    | "step-count"
    | "event-count"
    | "threw";
  step?: number;
  expected: string;
  actual: string;
}

/** One frame, as `normalize.ts` walks it. */
export interface BrowserFrame {
  html: string;
  markers: string;
  attributes: string[];
  anchors: number;
  identity: number[];
}

/** Everything one fixture's compiled module produced, kept for comparison in node. */
export interface BrowserRender {
  fixture: string;
  initial: BrowserFrame;
  frames: BrowserFrame[];
  events: BrowserFrame[];
}

export interface DifferentialReport {
  checked: number;
  frames: number;
  /**
   * Attribute lines the order channel actually saw, summed over frames. A
   * channel that silently stopped producing lines reports zero divergences and
   * is indistinguishable from a clean run; this is the number that tells them
   * apart, and browser.test.ts asserts on it.
   */
  attributeLines: number;
  /**
   * The self-check divergences the page itself can report: marker layout
   * against the anchors the clones baked in, the attribute partition, and a
   * fixture that threw. Everything else is a comparison between two RUNS and is
   * computed by `compareRuns` in node.
   */
  divergences: BrowserDivergence[];
  renders: BrowserRender[];
}

/**
 * The page module. Kept as source rather than assembled from the harness so the
 * BROWSER runs the comparison — shipping serialized DOM back over CDP would put
 * the fake DOM back in the middle of the thing it is supposed to be checking.
 */
interface PageRow {
  name: string;
  delegated: string[];
  /** Attribute names the patch code applies after the clone — read off the code. */
  patched: string[];
  /** Whether the module emits `_$spread`, whose names the compiler cannot know. */
  spread: boolean;
}

function entrySource(fixtures: PageRow[]): string {
  const imports = fixtures
    .map((_, i) => `import * as compiled${i} from "./compiled-${i}.tsx"`)
    .join("\n");
  const table = fixtures
    .map(
      ({ name, delegated, patched, spread }, i) =>
        `  [${JSON.stringify(name)}, compiled${i}, ${JSON.stringify(delegated)}, ` +
        `${JSON.stringify(patched)}, ${JSON.stringify(spread)}],`,
    )
    .join("\n");

  return `${PRAGMA}${imports}
import { normalizeChannels, resetIdentity } from "../../normalize.ts"
import { clearDelegatedEvents, scope, delegateEvents, flush, render } from "@barqjs/core"

const CORPUS = [
${table}
]

async function settle() {
  flush()
  await new Promise((resolve) => setTimeout(resolve, 0))
  flush()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

// The installed-delegated-events set is MODULE state on the runtime, and it is
// torn down between renders so one fixture cannot free-ride on the listener
// another installed. In the happy-dom harness each module is imported
// immediately before its render, so the compiled module's own
// \`delegateEvents([...])\` runs at the right moment; here every module is
// evaluated once when the bundle loads, long before the first teardown. The
// types are the ones read out of THAT call at build time, so a compiler that
// stopped emitting it installs nothing and the event frames go quiet.
// A fixture that never settles used to hang the whole page, and the only thing
// that noticed was \`beforeAll\`'s 300-second timeout — which names no fixture
// and produces no report. A watchdog turns it into an ordinary divergence
// against the fixture that caused it.
function withDeadline(promise, label) {
  return Promise.race([
    promise,
    new Promise((_resolve, reject) =>
      setTimeout(() => reject(new Error("timed out after 15s: " + label)), 15000),
    ),
  ])
}

// The anchors a frame is ALLOWED to hold: the ones baked into the template
// clones still attached to the container, counted when each clone was made.
// Exact for a module that clones a row per item and for one that clones
// nothing, which is what lets the marker channel stay on for every fixture
// instead of switching off wherever a component call made the clone count
// unknowable from the code.
function liveTemplateAnchors(container) {
  let anchors = 0
  for (const instance of window.__barqTemplates ?? []) {
    if (instance.anchors === 0) continue
    if (container.contains(instance.node)) anchors += instance.anchors
  }
  return anchors
}

async function drive(mod, delegated) {
  if (delegated.length > 0) delegateEvents(delegated)
  const container = document.createElement("div")
  document.body.appendChild(container)
  // Node identity is stamped on first sight, so the two paths only line up when
  // both renders start their numbering at zero.
  resetIdentity()
  window.__barqTemplates = []
  let dispose
  const frames = []
  const events = []
  const expectedAnchors = []
  let initial
  const snapshot = (sink) => {
    const frame = normalizeChannels(container)
    // Read at the same instant as the DOM it is the expectation for.
    expectedAnchors.push(liveTemplateAnchors(container))
    if (sink) sink.push(frame)
    return frame
  }
  try {
    scope((d) => {
      dispose = d
      // C1: render takes the Block, not a built subtree.
      render(mod.default, container)
    }, true)
    await settle()
    initial = snapshot(null)
    for (const step of mod.steps ?? []) {
      step()
      await settle()
      snapshot(frames)
    }
    for (const dispatch of mod.events ?? []) {
      dispatch(container)
      await settle()
      snapshot(events)
    }
    return { initial, frames, events, expectedAnchors }
  } finally {
    dispose?.()
    container.remove()
    document.body.innerHTML = ""
    clearDelegatedEvents()
  }
}

window.__barqDifferential = async function () {
  const divergences = []
  const renders = []
  let frames = 0
  let attributeLines = 0

  for (const [name, compiledModule, delegated, patched, spread] of CORPUS) {
    let compiled
    try {
      compiled = await withDeadline(drive(compiledModule, delegated), name)
    } catch (error) {
      divergences.push({ fixture: name, kind: "threw", expected: "", actual: String(error && error.stack || error) })
      continue
    }

    frames += 1 + compiled.frames.length + compiled.events.length
    const channels = [compiled.initial, ...compiled.frames, ...compiled.events]

    // Target #9 in the real parser, as an EQUALITY for every fixture. The
    // expectation comes from the clones themselves, recorded by the \`template\`
    // shim, so a component called twice and a \`For\` cloning a row per item are
    // each accounted for exactly — where the old rule could only say "this
    // module bakes no anchor, so it may produce none" and said nothing at all
    // about the seven fixtures that bake one.
    for (let i = 0; i < channels.length; i++) {
      const allowed = compiled.expectedAnchors[i] ?? 0
      if (channels[i].anchors === allowed) continue
      divergences.push({ fixture: name, kind: "marker-layout", step: i, expected: String(allowed), actual: String(channels[i].anchors) })
    }

    // The attribute PARTITION, carried into the real parser: every prop the
    // patch code writes reaches the element after every attribute the template
    // baked in. Rule 2 of normalize.ts sorts attributes out of \`html\`, so a
    // codegen that emitted them backwards compares equal there — and the order
    // a template ACTUALLY produces is decided by the HTML parser, which is the
    // one thing happy-dom is not. \`patched\` is read off the emitted module in
    // node. The order WITHIN each group is compared against the clean run, in
    // node, by \`compareRuns\`.
    // A module carrying a spread is EXEMPT: a spread's names are the one
    // attribute fact the compiler cannot have (§3.13 item 1), so nothing read
    // off the code can say which attributes the patch wrote — and §5.3's M9
    // note bakes NOTHING on such an element, so there is no partition there.
    const names = new Set(patched)
    for (let i = 0; i < channels.length; i++) {
      for (const line of channels[i].attributes) {
        const cut = line.indexOf(": ")
        if (cut < 0) continue
        attributeLines++
        if (spread) continue
        let seenPatched = false
        for (const attribute of line.slice(cut + 2).split(",")) {
          // Lowercased on both sides: patchedAttributeNames normalises the
          // emitted channel name, and an element lists its attributes
          // lowercased — readOnly in the code is readonly here. No backticks in
          // this block: it is source that gets embedded into the page.
          if (names.has(attribute.toLowerCase())) { seenPatched = true; continue }
          if (!seenPatched) continue
          divergences.push({ fixture: name, kind: "attribute-order", step: i, expected: line.slice(0, cut) + ": baked before patched", actual: line })
          break
        }
      }
    }

    renders.push({ fixture: name, initial: compiled.initial, frames: compiled.frames, events: compiled.events })
  }

  return JSON.stringify({ checked: CORPUS.length, frames, attributeLines, divergences, renders })
}
`;
}

/**
 * Bundle both paths for every fixture into one page. The workdir lives inside
 * the package on purpose: `@jsxImportSource @barqjs/core` is resolved by the
 * BUNDLER, and a tmpdir outside the workspace has no node_modules to resolve
 * it against.
 */
export async function buildDifferentialPage(
  corrupt?: (name: string, code: string) => string,
): Promise<{
  pagePath: string;
  fixtures: string[];
  cleanup: () => void;
}> {
  // Under the per-process directory for the same reason the generated modules
  // are: the recursive delete below otherwise lands between a sibling process's
  // write and its bundle, and the bundle inputs disappear mid-run.
  const workdir = join(TMP_DIR, "browser");
  rmSync(workdir, { recursive: true, force: true });
  mkdirSync(workdir, { recursive: true });

  const rows = [
    ...listFixtures().map((name) => ({
      name,
      source: fixtureSource(name),
      compile: compileFixture,
    })),
    ...listBrowserOnlyFixtures().map((name) => ({
      name: `browser-only/${name}`,
      source: browserOnlySource(name),
      compile: () => compileBrowserOnly(name),
    })),
  ];
  writeFileSync(join(workdir, "core-instrumented.ts"), CORE_SHIM);

  const names = rows.map((row) => row.name);
  const fixtures = rows.map(({ name, compile }, i) => {
    const clean = compile(name.replace("browser-only/", ""));
    const code = corrupt ? corrupt(name, clean) : clean;
    writeFileSync(
      join(workdir, `compiled-${i}.tsx`),
      PRAGMA + code.replaceAll('from "@barqjs/core"', 'from "./core-instrumented.ts"'),
    );
    return {
      name,
      delegated: delegatedTypes(code),
      patched: [...patchedAttributeNames(code)],
      spread: code.includes("_$spread("),
    };
  });
  writeFileSync(join(workdir, "entry.tsx"), entrySource(fixtures));

  const built = await Bun.build({
    entrypoints: [join(workdir, "entry.tsx")],
    target: "browser",
    format: "esm",
    // Without this the bundler takes the `import` condition and pulls in
    // packages/core/dist, which is a build artifact that can be stale. `bun`
    // resolves to src/index.ts, which is what `bun test` runs against.
    conditions: ["bun"],
  });
  if (!built.success) {
    for (const log of built.logs) console.error(String(log));
    throw new Error("the differential bundle did not build");
  }

  const pagePath = join(workdir, "page.html");
  // A module-scope throw in ANY fixture leaves `__barqDifferential` undefined,
  // and every symptom of that is misleading: the readiness poll times out, the
  // call reports "not a function", and `beforeAll` reports a 300-second hook
  // timeout naming no file. Capturing the first error makes the page say what
  // actually went wrong.
  writeFileSync(
    pagePath,
    `<!doctype html><meta charset="utf-8"><title>barq differential</title>` +
      `<script>window.addEventListener("error", (e) => { window.__barqLoadError ??= ` +
      `String((e.error && e.error.stack) || e.message) });` +
      `window.addEventListener("unhandledrejection", (e) => { window.__barqLoadError ??= ` +
      `String((e.reason && e.reason.stack) || e.reason) });</script>` +
      // The bundle is INLINE because Chrome refuses a module script fetched
      // from file:// (opaque origin). Inline means the HTML tokenizer sees the
      // JS, and a fixture rendering the characters `</script>` — which one
      // deliberately does, to pin compile-time escaping — closes the block
      // early and the page dies with a bare SyntaxError naming no file.
      // `<\/script` is the same string to a JS parser and invisible to the HTML one.
      `<script type="module">\n${(await built.outputs[0].text()).replace(/<\/script/gi, "<\\/script")}\n</script>`,
  );
  return {
    pagePath,
    fixtures: names,
    cleanup: () => rmSync(workdir, { recursive: true, force: true }),
  };
}

export async function checkDifferential(
  page: Page,
  corrupt?: (name: string, code: string) => string,
): Promise<DifferentialReport> {
  const { pagePath, cleanup } = await buildDifferentialPage(corrupt);
  try {
    await page.open(`file://${pagePath}`);
    let ready = false;
    for (let attempt = 0; attempt < 400 && !ready; attempt++) {
      ready = await page.evaluate<boolean>("typeof window.__barqDifferential === 'function'");
      if (!ready) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!ready) {
      const reason = await page.evaluate<string>("String(window.__barqLoadError || '')");
      throw new Error(
        `the differential page never finished loading${reason ? `:\n${reason}` : " and reported no error"}`,
      );
    }
    const value = await page.evaluate<string>("window.__barqDifferential()");
    if (!value) throw new Error("the page never loaded — check the bundle for a load error");
    return JSON.parse(value) as DifferentialReport;
  } finally {
    cleanup();
  }
}

/**
 * A corrupted run against the clean one, fixture by fixture and frame by frame.
 *
 * This is what every detector in `browser.test.ts` was measuring through the
 * retired reference. The reference was never the load-bearing half: the claim
 * was "corrupt the compiler and the browser notices", and the clean run of the
 * same corpus answers it without a second implementation in the page.
 *
 * A fixture the corrupted run failed to produce at all is a divergence, not a
 * skipped comparison — that is the shape a truncated run used to hide behind.
 */
export function compareRuns(
  clean: DifferentialReport,
  subject: DifferentialReport,
): BrowserDivergence[] {
  const divergences: BrowserDivergence[] = [];
  const byFixture = new Map(subject.renders.map((render) => [render.fixture, render]));

  for (const want of clean.renders) {
    const got = byFixture.get(want.fixture);
    if (got === undefined) {
      divergences.push({
        fixture: want.fixture,
        kind: "threw",
        expected: "a render",
        actual: "the run produced none",
      });
      continue;
    }

    if (want.initial.html !== got.initial.html) {
      divergences.push({
        fixture: want.fixture,
        kind: "initial-dom",
        expected: want.initial.html,
        actual: got.initial.html,
      });
    }

    // A run that stopped producing frames part-way compared only the prefix and
    // reported nothing, because both loops below are bounded by the MINIMUM.
    // The counts are the bound.
    if (want.frames.length !== got.frames.length) {
      divergences.push({
        fixture: want.fixture,
        kind: "step-count",
        expected: String(want.frames.length),
        actual: String(got.frames.length),
      });
    }
    if (want.events.length !== got.events.length) {
      divergences.push({
        fixture: want.fixture,
        kind: "event-count",
        expected: String(want.events.length),
        actual: String(got.events.length),
      });
    }

    for (let i = 0; i < Math.min(want.frames.length, got.frames.length); i++) {
      if (want.frames[i].html === got.frames[i].html) continue;
      divergences.push({
        fixture: want.fixture,
        kind: "step-dom",
        step: i,
        expected: want.frames[i].html,
        actual: got.frames[i].html,
      });
    }
    for (let i = 0; i < Math.min(want.events.length, got.events.length); i++) {
      if (want.events[i].html === got.events[i].html) continue;
      divergences.push({
        fixture: want.fixture,
        kind: "event-dom",
        step: i,
        expected: want.events[i].html,
        actual: got.events[i].html,
      });
    }

    const wantChannels = [want.initial, ...want.frames, ...want.events];
    const gotChannels = [got.initial, ...got.frames, ...got.events];
    for (let i = 0; i < Math.min(wantChannels.length, gotChannels.length); i++) {
      // Attribute ORDER, in the real parser. Rule 2 of normalize.ts sorts
      // attributes out of `html`, so this is the only channel that sees a
      // template emitted backwards.
      const a = wantChannels[i].attributes;
      const b = gotChannels[i].attributes;
      for (let j = 0; j < Math.max(a.length, b.length); j++) {
        if (a[j] === b[j]) continue;
        divergences.push({
          fixture: want.fixture,
          kind: "attribute-order",
          step: i,
          expected: a[j] ?? "<missing>",
          actual: b[j] ?? "<missing>",
        });
      }

      // Node identity. Every other channel is a function of the DOM's shape, so
      // a construct that rebuilt every node on every update is indistinguishable
      // from one that reused them.
      const wantId = wantChannels[i].identity.join(",");
      const gotId = gotChannels[i].identity.join(",");
      if (wantId === gotId) continue;
      divergences.push({
        fixture: want.fixture,
        kind: "node-identity-differential",
        step: i,
        expected: wantId,
        actual: gotId,
      });
    }
  }

  return divergences;
}

export function reportDifferential(report: DifferentialReport): number {
  console.log(
    `corpus rendered in a real browser: ${report.checked} fixtures, ${report.frames} frames, ` +
      `${report.attributeLines} attribute lines`,
  );
  for (const d of report.divergences) {
    console.error(
      `\n[${d.kind}${d.step === undefined ? "" : ` step ${d.step}`}] ${d.fixture}` +
        `\n  expected: ${d.expected}\n  actual  : ${d.actual}`,
    );
  }
  if (report.divergences.length === 0) {
    console.log("every fixture renders and drives clean in Chrome");
  } else {
    console.log(`\n${report.divergences.length} divergence(s)`);
  }
  return report.divergences.length;
}

if (import.meta.main) {
  const { withChrome } = await import("./chrome.ts");
  const report = await withChrome((page) => checkDifferential(page));
  process.exit(reportDifferential(report) === 0 ? 0 : 1);
}
