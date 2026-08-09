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
import {
  browserOnlySource,
  compileBrowserOnly,
  compileFixture,
  fixtureSource,
  listBrowserOnlyFixtures,
  listFixtures,
  stripLiterals,
  templateAnchors,
} from "./harness.ts"

const PRAGMA = "/** @jsxImportSource @barqjs/core */\n"

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
  kind: "initial-dom" | "step-dom" | "event-dom" | "marker-layout" | "oracle-anchor" | "threw"
  step?: number
  oracle: string
  compiled: string
}

export interface DifferentialReport {
  checked: number
  frames: number
  divergences: BrowserDivergence[]
}

/**
 * The page module. Kept as source rather than assembled from the harness so the
 * BROWSER runs the comparison — shipping serialized DOM back over CDP would put
 * the fake DOM back in the middle of the thing it is supposed to be checking.
 */
function entrySource(
  fixtures: Array<{ name: string; delegated: string[]; anchors: number; clonesOnce: boolean }>,
): string {
  const imports = fixtures
    .map(
      (_, i) =>
        `import * as oracle${i} from "./oracle-${i}.tsx"\nimport * as compiled${i} from "./compiled-${i}.tsx"`,
    )
    .join("\n")
  const table = fixtures
    .map(
      ({ name, delegated, anchors, clonesOnce }, i) =>
        `  [${JSON.stringify(name)}, oracle${i}, compiled${i}, ${JSON.stringify(delegated)}, ${anchors}, ${clonesOnce}],`,
    )
    .join("\n")

  return `${PRAGMA}${imports}
import { normalizeChannels } from "../../normalize.ts"
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
async function drive(mod, delegated) {
  if (delegated.length > 0) delegateEvents(delegated)
  const container = document.createElement("div")
  document.body.appendChild(container)
  let dispose
  const frames = []
  const events = []
  let initial
  try {
    createScope((d) => {
      dispose = d
      render(mod.default(), container)
    }, true)
    await settle()
    initial = normalizeChannels(container)
    for (const step of mod.steps ?? []) {
      step()
      await settle()
      frames.push(normalizeChannels(container))
    }
    for (const dispatch of mod.events ?? []) {
      dispatch(container)
      await settle()
      events.push(normalizeChannels(container))
    }
    return { initial, frames, events, wins: mod.wins ?? [] }
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

  for (const [name, oracleModule, compiledModule, delegated, anchors, clonesOnce] of CORPUS) {
    let oracle
    let compiled
    try {
      oracle = await drive(oracleModule, [])
      compiled = await drive(compiledModule, delegated)
    } catch (error) {
      divergences.push({ fixture: name, kind: "threw", oracle: "", compiled: String(error && error.stack || error) })
      continue
    }

    const claimed = (kind, index, actual) => {
      const win = compiled.wins.find((w) => w.kind === kind && w.index === index)
      return Boolean(win) && win.compiled === actual
    }

    frames += 1 + compiled.frames.length + compiled.events.length

    if (oracle.initial.html !== compiled.initial.html) {
      divergences.push({ fixture: name, kind: "initial-dom", oracle: oracle.initial.html, compiled: compiled.initial.html })
    }
    if (oracle.initial.anchors !== 0) {
      divergences.push({ fixture: name, kind: "oracle-anchor", oracle: String(oracle.initial.anchors), compiled: "0" })
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

    // Target #9 in the real parser. \`anchors\` is read off the emitted module
    // before the page is built; a module that instantiates each template once
    // must put exactly those anchors into the DOM, and one that clones per row
    // must still put none where the templates bake none.
    const channels = [compiled.initial, ...compiled.frames, ...compiled.events]
    for (let i = 0; i < channels.length; i++) {
      const wrong = clonesOnce ? channels[i].anchors !== anchors : anchors === 0 && channels[i].anchors > 0
      if (!wrong) continue
      divergences.push({ fixture: name, kind: "marker-layout", step: i, oracle: String(anchors), compiled: String(channels[i].anchors) })
    }
  }

  return JSON.stringify({ checked: CORPUS.length, frames, divergences })
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
  const workdir = join(import.meta.dir, ".tmp", "browser")
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
  const names = rows.map((row) => row.name)
  const fixtures = rows.map(({ name, source, compile }, i) => {
    const clean = compile(name.replace("browser-only/", ""))
    const code = corrupt ? corrupt(name, clean) : clean
    writeFileSync(join(workdir, `oracle-${i}.tsx`), PRAGMA + source)
    writeFileSync(join(workdir, `compiled-${i}.tsx`), PRAGMA + code)
    // The marker channel, carried into the browser. `normalizeChannels` computes
    // it on both sides and the page compared only `.html`, which rule 4 of
    // normalize.ts makes blind to an anchor — so target #9's exactness lived
    // under happy-dom alone, on templates happy-dom parses differently.
    return {
      name,
      delegated: delegatedTypes(code),
      anchors: templateAnchors(code),
      clonesOnce: !/_\$+createElement\(/.test(stripLiterals(code)),
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
  writeFileSync(
    pagePath,
    `<!doctype html><meta charset="utf-8"><title>barq differential</title><script type="module">\n${await built.outputs[0].text()}\n</script>`,
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
    for (let attempt = 0; attempt < 400; attempt++) {
      const ready = await page.evaluate<boolean>("typeof window.__barqDifferential === 'function'")
      if (ready) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    const value = await page.evaluate<string>("window.__barqDifferential()")
    if (!value) throw new Error("the page never loaded — check the bundle for a load error")
    return JSON.parse(value) as DifferentialReport
  } finally {
    cleanup()
  }
}

export function reportDifferential(report: DifferentialReport): void {
  console.log(
    `corpus rendered in a real browser: ${report.checked} fixtures, ${report.frames} frames`,
  )
  for (const d of report.divergences) {
    console.error(
      `\n[${d.kind}${d.step === undefined ? "" : ` step ${d.step}`}] ${d.fixture}` +
        `\n  oracle  : ${d.oracle}\n  compiled: ${d.compiled}`,
    )
  }
  if (report.divergences.length === 0) console.log("every frame is identical to the oracle")
}

if (import.meta.main) {
  const { withChrome } = await import("./chrome.ts")
  const report = await withChrome((page) => checkDifferential(page))
  reportDifferential(report)
  process.exit(report.divergences.length === 0 ? 0 : 1)
}
