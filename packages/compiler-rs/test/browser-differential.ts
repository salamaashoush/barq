/**
 * The differential comparison, in a real browser.
 *
 * `oracle.test.ts` runs the whole corpus against happy-dom, and happy-dom has
 * already hidden three separate bug classes on this project: HTML tree
 * construction (it does not foster-parent, does not auto-close `<p>`, does not
 * run the adoption agency), the tokenizer's NUL/CR rewriting (it hands both
 * back unchanged), and `SVGElement.className` (it models a read-only
 * `SVGAnimatedString` as a writable string). Each one was a green suite over a
 * compiler that was wrong where it counts.
 *
 * So the same corpus runs here too: both paths bundled into one page, rendered
 * side by side in Chrome, driven through their own `steps` and `events`, and
 * diffed with the same `normalize.ts` walk the happy-dom suite uses. What it
 * does NOT carry over is the effect tracer — that is `mock.module`, which has
 * no meaning in a browser — so this is the DOM half of the invariant, which is
 * exactly the half a fake DOM can lie about.
 *
 * Cost: one Chrome launch and one bundle for the whole corpus, about three
 * seconds. It is not per-fixture, which is what makes it affordable in CI.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import type { Page } from "./chrome.ts"
import { ORACLE_FAILURES } from "./oracle-known-failures.ts"
import {
  browserOnlySource,
  compileBrowserOnly,
  compileFixture,
  fixtureSource,
  listBrowserOnlyFixtures,
  listFixtures,
  patchedAttributeNames,
  TMP_DIR,
} from "./harness.ts"

const PRAGMA = "/** @jsxImportSource @barqjs/core */\n"

/**
 * `@barqjs/core` with `template` recording every clone it hands out.
 *
 * The happy-dom harness gets this from `mock.module`, which has no meaning in a
 * browser, so the COMPILED modules import through this shim instead — and only
 * they do: the oracle never calls `template`, and both specifiers resolve to the
 * same real module, so the runtime's own module state (the installed delegated
 * event set above all) stays shared exactly as it is in production.
 *
 * `export *` skips a name the module also exports locally, so `template` here is
 * the one every compiled module binds and every other export is the real one.
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
`

/** The event types the emitted module registers with `delegateEvents([...])`. */
function delegatedTypes(code: string): string[] {
  const call = code.match(/_\$+delegateEvents\(\[([^\]]*)\]\)/)
  if (!call) return []
  return call[1]
    .split(",")
    .map((entry) => entry.trim().replace(/^["']|["']$/g, ""))
    .filter((entry) => entry.length > 0)
}

export interface BrowserDivergence {
  fixture: string
  kind:
    | "initial-dom"
    | "step-dom"
    | "event-dom"
    | "marker-layout"
    | "attribute-order"
    | "node-identity-differential"
    | "oracle-anchor"
    | "stale-win"
    | "unmet-win"
    | "step-count"
    | "event-count"
    | "threw"
  step?: number
  oracle: string
  compiled: string
}

export interface DifferentialReport {
  checked: number
  frames: number
  /**
   * Attribute lines the order channel actually compared, summed over frames. A
   * channel that silently stopped producing lines reports zero divergences and
   * is indistinguishable from a clean run; this is the number that tells them
   * apart, and browser.test.ts asserts on it.
   */
  attributeLines: number
  divergences: BrowserDivergence[]
}

/**
 * The page module. Kept as source rather than assembled from the harness so the
 * BROWSER runs the comparison — shipping serialized DOM back over CDP would put
 * the fake DOM back in the middle of the thing it is supposed to be checking.
 */
interface PageRow {
  name: string
  delegated: string[]
  /** Attribute names the patch code applies after the clone — read off the code. */
  patched: string[]
}

function entrySource(fixtures: PageRow[]): string {
  const imports = fixtures
    .map(
      (_, i) =>
        `import * as oracle${i} from "./oracle-${i}.tsx"\nimport * as compiled${i} from "./compiled-${i}.tsx"`,
    )
    .join("\n")
  const table = fixtures
    .map(
      ({ name, delegated, patched }, i) =>
        `  [${JSON.stringify(name)}, oracle${i}, compiled${i}, ${JSON.stringify(delegated)}, ` +
        `${JSON.stringify(patched)}],`,
    )
    .join("\n")

  return `${PRAGMA}${imports}
import { expectedAttributeOrder, normalizeChannels, resetIdentity } from "../../normalize.ts"
import { clearDelegatedEvents, createScope, delegateEvents, flush, render } from "@barqjs/core"

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
// torn down between renders so the compiled path cannot free-ride on the
// listener the oracle installed. In the happy-dom harness each module is
// imported immediately before its render, so the compiled module's own
// \`delegateEvents([...])\` runs at the right moment; here every module is
// evaluated once when the bundle loads, long before the first teardown. The
// types are the ones read out of THAT call at build time, so a compiler that
// stopped emitting it installs nothing and the event frames diverge.
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
    createScope((d) => {
      dispose = d
      // C1: render takes the Block, not a built subtree. The oracle module's
      // root ignores the argument, so one spelling drives both paths.
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
    return { initial, frames, events, expectedAnchors, wins: mod.wins ?? [] }
  } finally {
    dispose?.()
    container.remove()
    document.body.innerHTML = ""
    clearDelegatedEvents()
  }
}

window.__barqDifferential = async function () {
  const divergences = []
  let frames = 0
  let attributeLines = 0

  for (const [name, oracleModule, compiledModule, delegated, patched] of CORPUS) {
    let oracle
    let compiled
    try {
      oracle = await withDeadline(drive(oracleModule, []), name + " (oracle)")
      compiled = await withDeadline(drive(compiledModule, delegated), name + " (compiled)")
    } catch (error) {
      divergences.push({ fixture: name, kind: "threw", oracle: "", compiled: String(error && error.stack || error) })
      continue
    }

    const claimed = (kind, index, actual) => {
      const win = compiled.wins.find((w) => w.kind === kind && w.index === index)
      return Boolean(win) && win.compiled === actual
    }

    // A declared win that stopped describing reality is worse than no win: it
    // permanently disarms the comparison for that frame. The happy-dom harness
    // has always failed on one; without the same check here the browser half
    // accepted it silently.
    for (const win of compiled.wins) {
      const mine = win.kind === "step" ? compiled.frames : compiled.events
      const theirs = win.kind === "step" ? oracle.frames : oracle.events
      const got = mine[win.index] && mine[win.index].html
      const want = theirs[win.index] && theirs[win.index].html
      if (got === undefined || want === undefined) continue
      if (got === want) {
        divergences.push({ fixture: name, kind: "stale-win", step: win.index, oracle: want, compiled: got })
      } else if (got !== win.compiled) {
        divergences.push({ fixture: name, kind: "unmet-win", step: win.index, oracle: win.compiled, compiled: got })
      }
    }

    // A compiled module that stopped producing frames part-way compared only
    // the prefix and reported nothing, because both loops below are bounded by
    // the MINIMUM. The counts are the bound.
    if (oracle.frames.length !== compiled.frames.length) {
      divergences.push({ fixture: name, kind: "step-count", oracle: String(oracle.frames.length), compiled: String(compiled.frames.length) })
    }
    if (oracle.events.length !== compiled.events.length) {
      divergences.push({ fixture: name, kind: "event-count", oracle: String(oracle.events.length), compiled: String(compiled.events.length) })
    }

    frames += 1 + compiled.frames.length + compiled.events.length

    if (oracle.initial.html !== compiled.initial.html) {
      divergences.push({ fixture: name, kind: "initial-dom", oracle: oracle.initial.html, compiled: compiled.initial.html })
    }
    // Every compiled anchor bound is stated against the oracle producing NONE,
    // and the oracle appends in source order on every frame, not only the first.
    const oracleChannels = [oracle.initial, ...oracle.frames, ...oracle.events]
    for (let i = 0; i < oracleChannels.length; i++) {
      if (oracleChannels[i].anchors === 0) continue
      divergences.push({ fixture: name, kind: "oracle-anchor", step: i, oracle: String(oracleChannels[i].anchors), compiled: "0" })
    }
    for (let i = 0; i < Math.min(oracle.frames.length, compiled.frames.length); i++) {
      if (oracle.frames[i].html === compiled.frames[i].html) continue
      if (claimed("step", i, compiled.frames[i].html)) continue
      divergences.push({ fixture: name, kind: "step-dom", step: i, oracle: oracle.frames[i].html, compiled: compiled.frames[i].html })
    }
    for (let i = 0; i < Math.min(oracle.events.length, compiled.events.length); i++) {
      if (oracle.events[i].html === compiled.events[i].html) continue
      if (claimed("event", i, compiled.events[i].html)) continue
      divergences.push({ fixture: name, kind: "event-dom", step: i, oracle: oracle.events[i].html, compiled: compiled.events[i].html })
    }

    // Target #9 in the real parser, as an EQUALITY for every fixture. The
    // expectation comes from the clones themselves, recorded by the \`template\`
    // shim, so a component called twice and a \`For\` cloning a row per item are
    // each accounted for exactly — where the old rule could only say "this
    // module bakes no anchor, so it may produce none" and said nothing at all
    // about the seven fixtures that bake one.
    const channels = [compiled.initial, ...compiled.frames, ...compiled.events]
    for (let i = 0; i < channels.length; i++) {
      const allowed = compiled.expectedAnchors[i] ?? 0
      if (channels[i].anchors === allowed) continue
      divergences.push({ fixture: name, kind: "marker-layout", step: i, oracle: String(allowed), compiled: String(channels[i].anchors) })
    }

    // The attribute-order channel, carried into the real parser. Rule 2 of
    // normalize.ts sorts attributes out of \`html\`, so a codegen that emitted
    // them backwards compares equal there — and the order a template ACTUALLY
    // produces is decided by the HTML parser, which is the one thing happy-dom
    // is not. \`patched\` is read off the emitted module in node; the partition
    // itself is normalize.ts's, shared with the happy-dom harness so the two
    // engines cannot end up measuring different things.
    // Node identity, carried into the real parser. Every other channel is a
    // function of the DOM's shape, so a flow component that rebuilt every node
    // on every update was indistinguishable from one that reused them.
    if (oracle.frames.length === compiled.frames.length && oracle.events.length === compiled.events.length) {
      for (let i = 0; i < channels.length; i++) {
        if (oracleChannels[i].html !== channels[i].html) continue
        const want = oracleChannels[i].identity.join(",")
        const got = channels[i].identity.join(",")
        if (want === got) continue
        divergences.push({ fixture: name, kind: "node-identity-differential", step: i, oracle: want, compiled: got })
      }
    }

    if (oracle.frames.length === compiled.frames.length && oracle.events.length === compiled.events.length) {
      const names = new Set(patched)
      for (let i = 0; i < channels.length; i++) {
        if (oracleChannels[i].html !== channels[i].html) continue
        const want = oracleChannels[i].attributes.map((line) => expectedAttributeOrder(line, names))
        const got = channels[i].attributes
        attributeLines += want.length
        for (let j = 0; j < Math.max(want.length, got.length); j++) {
          if (want[j] === got[j]) continue
          divergences.push({ fixture: name, kind: "attribute-order", step: i, oracle: want[j] ?? "<missing>", compiled: got[j] ?? "<missing>" })
        }
      }
    }
  }

  return JSON.stringify({ checked: CORPUS.length, frames, attributeLines, divergences })
}
`
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
  pagePath: string
  fixtures: string[]
  cleanup: () => void
}> {
  // Under the per-process directory for the same reason the generated modules
  // are: the recursive delete below otherwise lands between a sibling process's
  // write and its bundle, and the bundle inputs disappear mid-run.
  const workdir = join(TMP_DIR, "browser")
  rmSync(workdir, { recursive: true, force: true })
  mkdirSync(workdir, { recursive: true })

  const rows = [
    ...listFixtures().map((name) => ({ name, source: fixtureSource(name), compile: compileFixture })),
    ...listBrowserOnlyFixtures().map((name) => ({
      name: `browser-only/${name}`,
      source: browserOnlySource(name),
      compile: () => compileBrowserOnly(name),
    })),
  ]
  writeFileSync(join(workdir, "core-instrumented.ts"), CORE_SHIM)

  const names = rows.map((row) => row.name)
  const fixtures = rows.map(({ name, source, compile }, i) => {
    const clean = compile(name.replace("browser-only/", ""))
    const code = corrupt ? corrupt(name, clean) : clean
    writeFileSync(join(workdir, `oracle-${i}.tsx`), PRAGMA + source)
    // Only the COMPILED module goes through the shim: it is the only one that
    // calls `template`, and pointing the oracle at it too would be one more
    // difference between the two paths for no gain.
    writeFileSync(
      join(workdir, `compiled-${i}.tsx`),
      PRAGMA + code.replaceAll('from "@barqjs/core"', 'from "./core-instrumented.ts"'),
    )
    return {
      name,
      delegated: delegatedTypes(code),
      patched: [...patchedAttributeNames(code)],
    }
  })
  writeFileSync(join(workdir, "entry.tsx"), entrySource(fixtures))

  const built = await Bun.build({
    entrypoints: [join(workdir, "entry.tsx")],
    target: "browser",
    format: "esm",
    // Without this the bundler takes the `import` condition and pulls in
    // packages/core/dist, which is a build artifact that can be stale. `bun`
    // resolves to src/index.ts, which is what `bun test` runs against.
    conditions: ["bun"],
  })
  if (!built.success) {
    for (const log of built.logs) console.error(String(log))
    throw new Error("the differential bundle did not build")
  }

  const pagePath = join(workdir, "page.html")
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
  )
  return { pagePath, fixtures: names, cleanup: () => rmSync(workdir, { recursive: true, force: true }) }
}

export async function checkDifferential(
  page: Page,
  corrupt?: (name: string, code: string) => string,
): Promise<DifferentialReport> {
  const { pagePath, cleanup } = await buildDifferentialPage(corrupt)
  try {
    await page.open(`file://${pagePath}`)
    let ready = false
    for (let attempt = 0; attempt < 400 && !ready; attempt++) {
      ready = await page.evaluate<boolean>("typeof window.__barqDifferential === 'function'")
      if (!ready) await new Promise((resolve) => setTimeout(resolve, 50))
    }
    if (!ready) {
      const reason = await page.evaluate<string>("String(window.__barqLoadError || '')")
      throw new Error(
        `the differential page never finished loading${reason ? `:\n${reason}` : " and reported no error"}`,
      )
    }
    const value = await page.evaluate<string>("window.__barqDifferential()")
    if (!value) throw new Error("the page never loaded — check the bundle for a load error")
    return JSON.parse(value) as DifferentialReport
  } finally {
    cleanup()
  }
}

/**
 * Partition the report the way `browser.test.ts` does. A divergence in a
 * fixture the oracle registry accounts for is a DECLARED state, not a finding:
 * printing it as an unexplained failure and exiting 1 makes a documented entry
 * point red for a reason it does not itself explain, which is how a developer
 * learns to ignore it.
 */
export function reportDifferential(report: DifferentialReport): number {
  console.log(
    `corpus rendered in a real browser: ${report.checked} fixtures, ${report.frames} frames, ` +
      `${report.attributeLines} attribute lines`,
  )
  const reason = new Map(ORACLE_FAILURES.map((row) => [row.fixture, `${row.cause} — ${row.reason}`]))
  let unexplained = 0
  for (const d of report.divergences) {
    const registered = reason.get(d.fixture)
    const head =
      `\n[${d.kind}${d.step === undefined ? "" : ` step ${d.step}`}] ${d.fixture}` +
      `\n  oracle  : ${d.oracle}\n  compiled: ${d.compiled}`
    if (registered === undefined) {
      unexplained++
      console.error(head)
    } else {
      console.log(`${head}\n  REGISTERED: ${registered}`)
    }
  }
  const registered = report.divergences.length - unexplained
  if (report.divergences.length === 0) {
    console.log("every frame is identical to the oracle")
  } else {
    console.log(
      `\n${registered} divergence(s) explained by the oracle registry, ${unexplained} not`,
    )
  }
  return unexplained
}

if (import.meta.main) {
  const { withChrome } = await import("./chrome.ts")
  const report = await withChrome((page) => checkDifferential(page))
  process.exit(reportDifferential(report) === 0 ? 0 : 1)
}
