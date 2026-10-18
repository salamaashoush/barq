/**
 * @barqjs/three against @react-three/fiber, in real Chrome with WebGL.
 *
 *   CHROME_PATH=... bun run bench:three [rounds]
 *
 * Both pages are production bundles of the same scenes: barq compiled by
 * `@barqjs/compiler` (the scene for the three renderer, the page for the
 * document), React by Bun's JSX transform with React 19's production build.
 * Every scenario runs on a fresh page, `rounds` times, and the median is
 * reported. Script and task time come from Chrome's own counters
 * (`Performance.getMetrics`), so work React defers to its scheduler is counted
 * in the frame it belongs to rather than missed.
 */
import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { load, serve, withBenchChrome, type Page } from "../tier2/driver.ts"
import { bundle } from "./bundle.ts"

const HERE = import.meta.dir
const OUT = join(HERE, "..", "..", "three-results.json")
const ROUNDS = Number(process.argv[2] ?? 5)

const page = (script: string): string =>
  '<!doctype html><meta charset="utf-8"><body style="margin:0"><div id="app"></div>' +
  `<script type="module" src="${script}"></script>`

/** Software WebGL, so the run needs no GPU and both libraries draw through the same one. */
const WEBGL = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

interface Metrics {
  script: number
  task: number
}

async function metrics(page: Page): Promise<Metrics> {
  const result = (await page.send("Performance.getMetrics", {})) as {
    metrics: { name: string; value: number }[]
  }
  const of = (name: string): number => result.metrics.find((m) => m.name === name)?.value ?? 0
  return { script: of("ScriptDuration") * 1000, task: of("TaskDuration") * 1000 }
}

async function heap(page: Page): Promise<number> {
  await page.send("HeapProfiler.collectGarbage", {})
  await page.send("HeapProfiler.collectGarbage", {})
  const usage = (await page.send("Runtime.getHeapUsage", {})) as { usedSize: number }
  return usage.usedSize
}

const median = (values: number[]): number => {
  const sorted = values.toSorted((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

type Row = Record<string, number>

async function fresh(page: Page, url: string): Promise<void> {
  await load(page, url)
  await page.send("Performance.enable", {})
}

/** Mount 10k meshes, then unmount them: wall and script time of each, and the heap they hold. */
async function mount10k(page: Page, url: string): Promise<Row> {
  await fresh(page, url)
  const before = await heap(page)
  const m0 = await metrics(page)
  const wall = await page.call<number>("__bench.mount(10000)")
  const m1 = await metrics(page)
  const held = (await heap(page)) - before
  return { wall, script: m1.script - m0.script, task: m1.task - m0.task, heapMB: held / 2 ** 20 }
}

/** Mount 5k, unmount them, mount them again. */
async function toggle5k(page: Page, url: string): Promise<Row> {
  await fresh(page, url)
  await page.call<number>("__bench.mount(5000)")
  const m0 = await metrics(page)
  const unmount = await page.call<number>("__bench.unmount()")
  const m1 = await metrics(page)
  const remount = await page.call<number>("__bench.mount(5000)")
  const m2 = await metrics(page)
  return {
    unmountWall: unmount,
    unmountScript: m1.script - m0.script,
    remountWall: remount,
    remountScript: m2.script - m1.script,
  }
}

const FRAMES = 120

/** 1k meshes moving every frame for 120 frames: per-frame script, task and wall time. */
async function update1k(page: Page, url: string, mode: string): Promise<Row> {
  await fresh(page, url)
  await page.call(`__bench.prepare(${JSON.stringify(mode)}, 1000)`)
  await page.call("__bench.run(30)")
  const renders0 = await page.evaluate<number>("__bench.renders()")
  const m0 = await metrics(page)
  const start = performance.now()
  await page.call(`__bench.run(${FRAMES})`)
  const wall = performance.now() - start
  const m1 = await metrics(page)
  const drawn = (await page.evaluate<number>("__bench.renders()")) - renders0
  return {
    scriptPerFrame: (m1.script - m0.script) / FRAMES,
    taskPerFrame: (m1.task - m0.task) / FRAMES,
    framePerFrame: wall / FRAMES,
    drawn,
  }
}

/** 1k meshes with pointer-move handlers, 300 synthetic moves over them. */
async function events1k(page: Page, url: string): Promise<Row> {
  await fresh(page, url)
  await page.call("__bench.interactive(1000)")
  await page.call("__bench.sweep(20)")
  const result = await page.call<{ perEvent: number; hits: number }>("__bench.sweep(300)")
  if (result.hits === 0) throw new Error(`${url}: no pointer move reached a mesh`)
  return { perEvent: result.perEvent, hits: result.hits }
}

async function sizes(): Promise<Row> {
  const gz = (text: string): number => Bun.gzipSync(new TextEncoder().encode(text)).length / 1024
  const barq = await bundle("minimal-barq.tsx")
  const r3f = await bundle("minimal-r3f.tsx")
  const barqOwn = await bundle("minimal-barq.tsx", { external: ["three"] })
  const r3fOwn = await bundle("minimal-r3f.tsx", { external: ["three"] })
  return {
    barqKB: gz(barq),
    r3fKB: gz(r3f),
    barqWithoutThreeKB: gz(barqOwn),
    r3fWithoutThreeKB: gz(r3fOwn),
  }
}

function summarize(runs: Row[]): Row {
  const out: Row = {}
  for (const key of Object.keys(runs[0])) out[key] = median(runs.map((run) => run[key]))
  return out
}

const files = new Map<string, string>([
  ["/barq.html", page("/barq.js")],
  ["/r3f.html", page("/r3f.js")],
  ["/barq.js", await bundle("barq.tsx")],
  ["/r3f.js", await bundle("r3f.tsx")],
])
const served = serve(files)
const barqUrl = served.url("/barq.html")
const r3fUrl = served.url("/r3f.html")

const results: Record<string, Row> = {}
try {
  await withBenchChrome(
    async (chrome) => {
      const repeat = async (name: string, run: () => Promise<Row>): Promise<void> => {
        const rows: Row[] = []
        for (let round = 0; round < ROUNDS; round++) rows.push(await run())
        results[name] = summarize(rows)
        console.log(name.padEnd(28), JSON.stringify(results[name], (_, v: unknown) =>
          typeof v === "number" ? Math.round(v * 1000) / 1000 : v,
        ))
      }
      await repeat("mount10k barq", () => mount10k(chrome, barqUrl))
      await repeat("mount10k r3f", () => mount10k(chrome, r3fUrl))
      await repeat("toggle5k barq", () => toggle5k(chrome, barqUrl))
      await repeat("toggle5k r3f", () => toggle5k(chrome, r3fUrl))
      await repeat("update1k barq signals", () => update1k(chrome, barqUrl, "signals"))
      await repeat("update1k barq refs", () => update1k(chrome, barqUrl, "refs"))
      await repeat("update1k r3f refs", () => update1k(chrome, r3fUrl, "refs"))
      await repeat("update1k r3f state", () => update1k(chrome, r3fUrl, "state"))
      await repeat("events1k barq", () => events1k(chrome, barqUrl))
      await repeat("events1k r3f", () => events1k(chrome, r3fUrl))
    },
    { flags: WEBGL },
  )
} finally {
  served.stop()
}
results["bundle (gz)"] = await sizes()
console.log("bundle (gz)".padEnd(28), JSON.stringify(results["bundle (gz)"]))

writeFileSync(
  OUT,
  `${JSON.stringify({ when: new Date().toISOString(), rounds: ROUNDS, results }, null, 2)}\n`,
)
console.log(`\n${OUT}`)
