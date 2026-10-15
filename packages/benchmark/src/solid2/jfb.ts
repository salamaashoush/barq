/**
 * js-framework-benchmark across barq, Solid 2.0 and Solid 1.9, in one Chrome.
 *
 * The instrument is the Tier-2 one (`tier2/trace.ts`, `tier2/vendor/
 * jfb-harness.js`): a page load per timed click, warmups and DOM assertions as
 * upstream, duration from the trace. What this file adds is a third side and
 * a rotation: iteration `i` starts with framework `i mod 3`, so thermal drift
 * lands on every side alike.
 *
 * barq and Solid 2.0 run the SAME source (`apps/jfb.jsx`); Solid 1.9 runs its
 * official entry, `tier2/apps/jfb-solid.jsx`, which has `createSelector`.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { bootstrapMedianCi, summarize, type Summary } from "../stats.ts"
import { load, serve, withBenchChrome, type Page } from "../tier2/driver.ts"
import { JFB_ROWS } from "../tier2/jfb.ts"
import { computeCpuDuration, traced } from "../tier2/trace.ts"
import { appSource, bundleFor, compileFor, type Framework } from "./solid2.ts"

const HARNESS = readFileSync(join(import.meta.dir, "..", "tier2", "vendor", "jfb-harness.js"), "utf8")
const SOLID1_APP = readFileSync(join(import.meta.dir, "..", "tier2", "apps", "jfb-solid.jsx"), "utf8")

const THROTTLE: Record<string, number> = {
  "partial update": 4,
  "select row": 4,
  "swap rows": 4,
  "remove row": 2,
  "clear rows": 4,
}

export function page(title: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body><div id="main"></div>
<script type="module" src="/app.js"></script>
</body></html>
`
}

export async function jfbBundle(framework: Framework): Promise<string> {
  const source = framework === "solid1" ? SOLID1_APP : appSource("jfb.tsx")
  const { code, ext } = await compileFor(framework, source, framework === "solid1" ? "jfb.jsx" : "jfb.tsx")
  return bundleFor(framework, code, ext, "jfb", { target: "browser", minify: true })
}

export interface JfbSide {
  duration: Summary
  script: Summary
  ci: [number, number]
}

export interface JfbRow {
  benchmark: string
  throttle: number
  sides: Partial<Record<Framework, JfbSide>>
}

interface Sample {
  duration: number
  script: number
}

async function once(page: Page, url: string, name: string): Promise<Sample> {
  await load(page, url)
  await page.evaluate(HARNESS)
  await page.call(`window.__jfbInit(${JSON.stringify(name)})`)
  const { events } = await traced(page, async () => {
    await page.call(`window.__jfbAct(${JSON.stringify(name)})`)
  })
  const computed = computeCpuDuration(events)
  return { duration: computed.duration, script: computed.script }
}

export async function runJfb3(
  frameworks: readonly Framework[],
  iterations: number,
  only: readonly string[] = JFB_ROWS,
): Promise<{ rows: JfbRow[]; memory: Partial<Record<Framework, number>> }> {
  const servers = new Map<Framework, ReturnType<typeof serve>>()
  for (const framework of frameworks) {
    const files = new Map([
      ["/index.html", page(`jfb ${framework}`)],
      ["/app.js", await jfbBundle(framework)],
    ])
    servers.set(framework, serve(files))
  }
  try {
    return await withBenchChrome(async (tab) => {
      const rows: JfbRow[] = []
      for (const name of only) {
        const throttle = THROTTLE[name] ?? 1
        await tab.throttle(throttle)
        const samples = new Map<Framework, Sample[]>(frameworks.map((f) => [f, []]))
        for (let i = 0; i < iterations; i++) {
          for (let k = 0; k < frameworks.length; k++) {
            const framework = frameworks[(i + k) % frameworks.length]
            const url = servers.get(framework)!.url("/index.html")
            samples.get(framework)!.push(await once(tab, url, name))
          }
        }
        const row: JfbRow = { benchmark: name, throttle, sides: {} }
        for (const [framework, list] of samples) {
          const durations = list.map((s) => s.duration)
          row.sides[framework] = {
            duration: summarize(durations),
            script: summarize(list.map((s) => s.script)),
            ci: bootstrapMedianCi(durations),
          }
        }
        rows.push(row)
        console.log(
          `  ${name.padEnd(28)}` +
            frameworks
              .map((f) => {
                const side = row.sides[f]!
                return ` ${f} ${side.duration.median.toFixed(2)} (js ${side.script.median.toFixed(2)}, sd ${side.duration.sd.toFixed(2)})`
              })
              .join("  ") +
            (throttle > 1 ? `  ${throttle}x CPU` : ""),
        )
      }
      await tab.throttle(1)

      const memory: Partial<Record<Framework, number>> = {}
      for (const framework of frameworks) {
        const readings: number[] = []
        for (let i = 0; i < 3; i++) {
          await load(tab, servers.get(framework)!.url("/index.html"))
          await tab.evaluate(HARNESS)
          const result = await tab.call<{ ok: number | null }>("window.__jfbMemory()")
          if (result.ok === null) throw new Error("performance.memory is unavailable")
          readings.push(result.ok)
        }
        memory[framework] = summarize(readings).median
      }
      console.log(
        `  ${"run memory (1,000 rows)".padEnd(28)}` +
          frameworks.map((f) => ` ${f} ${(memory[f]! / 1e6).toFixed(2)} MB`).join("  "),
      )
      return { rows, memory }
    })
  } finally {
    for (const server of servers.values()) server.stop()
  }
}

const SCRIPT_LANE = readFileSync(join(import.meta.dir, "script-lane.js"), "utf8")

/**
 * The script lane (`script-lane.js`): `loads` page loads per framework,
 * rotated, each taking `samples` timed clicks per operation after `warmup`.
 * CPU throttling matches the trace lane's table so the two lanes describe the
 * same machine.
 */
export async function runScriptLane(
  frameworks: readonly Framework[],
  options: { loads: number; samples: number; warmup: number },
  only: readonly string[] = JFB_ROWS,
): Promise<Record<string, Partial<Record<Framework, Summary>>>> {
  const servers = new Map<Framework, ReturnType<typeof serve>>()
  for (const framework of frameworks) {
    servers.set(
      framework,
      serve(
        new Map([
          ["/index.html", page(`jfb ${framework}`)],
          ["/app.js", await jfbBundle(framework)],
        ]),
      ),
    )
  }
  try {
    return await withBenchChrome(async (tab) => {
      const out: Record<string, Partial<Record<Framework, Summary>>> = {}
      for (const name of only) {
        await tab.throttle(THROTTLE[name] ?? 1)
        const samples = new Map<Framework, number[]>(frameworks.map((f) => [f, []]))
        for (let load_ = 0; load_ < options.loads; load_++) {
          for (let k = 0; k < frameworks.length; k++) {
            const framework = frameworks[(load_ + k) % frameworks.length]
            await load(tab, servers.get(framework)!.url("/index.html"))
            await tab.evaluate(SCRIPT_LANE)
            const times = await tab.call<number[]>(
              `window.__scriptLane(${JSON.stringify(name)}, ${options.samples}, ${options.warmup})`,
            )
            samples.get(framework)!.push(...times)
          }
        }
        out[name] = {}
        for (const [framework, list] of samples) out[name][framework] = summarize(list)
        console.log(
          `  ${name.padEnd(28)}` +
            frameworks
              .map((f) => {
                const s = out[name][f]!
                return ` ${f} ${s.median.toFixed(3)} (p25 ${s.p25.toFixed(3)} p75 ${s.p75.toFixed(3)})`
              })
              .join("  ") +
            ((THROTTLE[name] ?? 1) > 1 ? `  ${THROTTLE[name]}x CPU` : ""),
        )
      }
      await tab.throttle(1)
      return out
    })
  } finally {
    for (const server of servers.values()) server.stop()
  }
}
