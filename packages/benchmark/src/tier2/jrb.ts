/**
 * Tier 2, half three: js-reactivity-benchmark in a real Chrome.
 *
 * `apps/reactivity.ts` is the entry and the two adapters; the benches are
 * `milomg/js-reactivity-benchmark` vendored unmodified. This file loads the
 * page once per suite and reports the two frameworks side by side.
 *
 * A suite gets its own page load because `sBench` builds 10^5 signals and
 * `cellx` builds a thousand-layer graph; leaving one suite's heap standing
 * under the next is the same argument js-framework-benchmark makes for
 * reloading between iterations.
 */
import { readFileSync } from "node:fs"

import { plainPage } from "./build.ts"
import { load, serve, withBenchChrome } from "./driver.ts"

export interface JrbRow {
  test: string
  barq: number
  solid: number
  /** barq ÷ solid. Below 1 is barq faster. */
  ratio: number
}

export interface JrbResult {
  suite: string
  rows: JrbRow[]
}

export interface DepthRow {
  layers: number
  iterations: number
  barq: number
  solid: number
  /** Milliseconds per layer. Flat means linear in depth; rising means quadratic. */
  barqPerLayer: number
  solidPerLayer: number
  ratio: number
}

export interface JrbFull {
  suites: JrbResult[]
  depth: DepthRow[]
}

/** The depths the sweep is taken at. `cellx` runs at 1,000 and 2,500. */
const DEPTHS = [50, 100, 200, 400, 800] as const

interface PerfResult {
  framework: string
  test: string
  time: number
}

export async function runJrb(): Promise<JrbFull> {
  const page = await plainPage(
    readFileSync(new URL("./apps/reactivity.ts", import.meta.url), "utf8"),
    "reactivity",
  )
  const server = serve(page.files)
  try {
    return await withBenchChrome(async (chrome) => {
      await load(chrome, server.url(page.page))
      const suites = await chrome.call<string[]>("window.__jrbSuites")
      const out: JrbResult[] = []
      for (const suite of suites) {
        await load(chrome, server.url(page.page))
        const { results } = await chrome.call<{ results: PerfResult[] }>(
          `window.__jrb(${JSON.stringify(suite)})`,
        )
        const byTest = new Map<string, { barq?: number; solid?: number }>()
        for (const result of results) {
          const entry = byTest.get(result.test) ?? {}
          if (result.framework === "barq") entry.barq = result.time
          else entry.solid = result.time
          byTest.set(result.test, entry)
        }
        const rows: JrbRow[] = []
        console.log(`  ${suite}:`)
        for (const [test, { barq, solid }] of byTest) {
          if (barq === undefined || solid === undefined) continue
          rows.push({ test, barq, solid, ratio: barq / solid })
          console.log(
            `    ${test.padEnd(24)} barq ${barq.toFixed(2)} ms  solid ${solid.toFixed(2)} ms  ` +
              `ratio ${(barq / solid).toFixed(3)}`,
          )
        }
        out.push({ suite, rows })
      }

      // The depth sweep, on its own page load: it builds up to 3,200 computeds
      // per framework and leaving that heap under the next depth would make
      // the sweep a measurement of the heap rather than of the depth.
      const depth: DepthRow[] = []
      console.log("  depth sweep (the cellx shape, ms per layer — flat is linear in depth):")
      for (const layers of DEPTHS) {
        await load(chrome, server.url(page.page))
        const one = await chrome.call<{ barq: number; solid: number; iterations: number }>(
          `window.__jrbDepth(${layers}, 10)`,
        )
        const row: DepthRow = {
          layers,
          iterations: one.iterations,
          barq: one.barq,
          solid: one.solid,
          barqPerLayer: one.barq / layers,
          solidPerLayer: one.solid / layers,
          ratio: one.barq / one.solid,
        }
        depth.push(row)
        console.log(
          `    ${String(layers).padStart(4)} layers  barq ${row.barq.toFixed(1)} ms ` +
            `(${row.barqPerLayer.toFixed(4)}/layer)  solid ${row.solid.toFixed(1)} ms ` +
            `(${row.solidPerLayer.toFixed(4)}/layer)  ratio ${row.ratio.toFixed(1)}`,
        )
      }
      return { suites: out, depth }
    })
  } finally {
    server.stop()
  }
}
