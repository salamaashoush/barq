/**
 * Tier 2, half one: js-framework-benchmark in a real Chrome.
 *
 * Nine CPU rows plus the memory row, both frameworks compiled by their own real
 * compiler, timed from a Chrome trace with js-framework-benchmark's own
 * definition of a duration — click to compositor commit. `trace.ts` says why
 * the obvious wall-clock instrument had to be thrown away, with the measurement
 * that killed it.
 *
 * **A page load per timed iteration, and the frameworks interleaved.** Upstream
 * reloads between iterations because a 10,000-row table leaves a heap and a
 * layout tree the next iteration would inherit. Interleaving is this lane's
 * addition: running all of barq's iterations and then all of Solid's hands
 * whichever ran second a warmer machine — and on a laptop that thermally
 * throttles, hands the FIRST one the warmer machine. Alternating puts the drift
 * on both sides.
 */
import { readFileSync } from "node:fs"

import { bootstrapMedianCi, summarize, wilcoxon, type Summary } from "../stats.ts"
import { barqPage, solidPage, type Bundle } from "./build.ts"
import { load, serve, withBenchChrome, type Page } from "./driver.ts"
import { computeCpuDuration, traced } from "./trace.ts"

const HERE = import.meta.url
const HARNESS = readFileSync(new URL("./vendor/jfb-harness.js", HERE), "utf8")

export const JFB_ROWS: readonly string[] = [
  "create rows",
  "replace all rows",
  "partial update",
  "select row",
  "swap rows",
  "remove row",
  "create many rows",
  "append rows to large table",
  "clear rows",
]

/**
 * The CPU slowdown js-framework-benchmark applies to its shortest rows, so the
 * measured region is long enough for the timer to resolve. Their table, copied
 * from `benchmarksCommon.ts`.
 */
const THROTTLE: Record<string, number> = {
  "partial update": 4,
  "select row": 4,
  "swap rows": 4,
  "remove row": 2,
  "clear rows": 4,
}

export interface JfbSide {
  duration: Summary
  script: Summary
  paint: Summary
  ci: [number, number]
}

export interface JfbRow {
  benchmark: string
  throttle: number
  barq: JfbSide
  solid: JfbSide
  /** barq ÷ solid on the median durations. Below 1 is barq faster. */
  ratio: number
  p: number
  n: number
}

export interface JfbMemory {
  barqBytes: number
  solidBytes: number
}

export interface JfbResult {
  rows: JfbRow[]
  memory: JfbMemory
}

interface Sample {
  duration: number
  script: number
  paint: number
}

async function once(page: Page, url: string, name: string): Promise<Sample> {
  await load(page, url)
  await page.evaluate(HARNESS)
  await page.call(`window.__jfbInit(${JSON.stringify(name)})`)
  const { events } = await traced(page, async () => {
    await page.call(`window.__jfbAct(${JSON.stringify(name)})`)
  })
  const computed = computeCpuDuration(events)
  return { duration: computed.duration, script: computed.script, paint: computed.paint }
}

function side(samples: readonly Sample[]): JfbSide {
  const durations = samples.map((s) => s.duration)
  return {
    duration: summarize(durations),
    script: summarize(samples.map((s) => s.script)),
    paint: summarize(samples.map((s) => s.paint)),
    ci: bootstrapMedianCi(durations),
  }
}

export async function runJfb(iterations = 10): Promise<JfbResult> {
  const barq = await barqPage(
    readFileSync(new URL("./apps/jfb-barq.tsx", HERE), "utf8"),
    "jfb-barq",
  )
  const solid = await solidPage(
    readFileSync(new URL("./apps/jfb-solid.jsx", HERE), "utf8"),
    "jfb-solid",
  )
  return driveJfb(barq, solid, iterations)
}

export async function driveJfb(
  barq: Bundle,
  solid: Bundle,
  iterations: number,
  labels: { a: string; b: string } = { a: "barq", b: "solid" },
  /**
   * A subset of `JFB_ROWS`. A whole run is nine rows deep, and a change aimed
   * at ONE of them needs that row at an iteration count the whole suite cannot
   * afford — a difference of a few percent is inside a nine-row run's noise.
   * Omitted means all nine, which is what `run.ts` asks for.
   */
  only: readonly string[] = JFB_ROWS,
): Promise<JfbResult> {
  const barqServer = serve(barq.files)
  const solidServer = serve(solid.files)
  const barqUrl = barqServer.url(barq.page)
  const solidUrl = solidServer.url(solid.page)
  try {
    return await withBenchChrome(async (page) => {
      const rows: JfbRow[] = []
      for (const name of only) {
        const throttle = THROTTLE[name] ?? 1
        await page.throttle(throttle)
        const barqSamples: Sample[] = []
        const solidSamples: Sample[] = []
        for (let i = 0; i < iterations; i++) {
          if (i % 2 === 0) {
            barqSamples.push(await once(page, barqUrl, name))
            solidSamples.push(await once(page, solidUrl, name))
          } else {
            solidSamples.push(await once(page, solidUrl, name))
            barqSamples.push(await once(page, barqUrl, name))
          }
        }
        const a = side(barqSamples)
        const b = side(solidSamples)
        const diffs = barqSamples.map((s, i) => s.duration - solidSamples[i].duration)
        const { p } = wilcoxon(diffs)
        rows.push({
          benchmark: name,
          throttle,
          barq: a,
          solid: b,
          ratio: a.duration.median / b.duration.median,
          p,
          n: iterations,
        })
        console.log(
          `  ${name.padEnd(28)} ${labels.a} ${a.duration.median.toFixed(1)} ms ` +
            `(js ${a.script.median.toFixed(1)} / paint ${a.paint.median.toFixed(1)})  ` +
            `${labels.b} ${b.duration.median.toFixed(1)} ms ` +
            `(js ${b.script.median.toFixed(1)} / paint ${b.paint.median.toFixed(1)})  ` +
            `ratio ${(a.duration.median / b.duration.median).toFixed(3)}  p=${p.toExponential(1)}` +
            (throttle > 1 ? `  ${throttle}x CPU` : ""),
        )
      }
      await page.throttle(1)

      const memory = async (url: string): Promise<number> => {
        await load(page, url)
        await page.evaluate(HARNESS)
        const result = await page.call<{ ok: number | null }>("window.__jfbMemory()")
        if (result.ok === null) throw new Error("performance.memory is unavailable")
        return result.ok
      }
      const memoryRow: JfbMemory = {
        barqBytes: await memory(barqUrl),
        solidBytes: await memory(solidUrl),
      }
      console.log(
        `  ${"run memory (1,000 rows)".padEnd(28)} ${labels.a} ` +
          `${(memoryRow.barqBytes / 1e6).toFixed(2)} MB  ${labels.b} ` +
          `${(memoryRow.solidBytes / 1e6).toFixed(2)} MB`,
      )
      return { rows, memory: memoryRow }
    })
  } finally {
    barqServer.stop()
    solidServer.stop()
  }
}
