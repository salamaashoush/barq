/**
 * A CPU profile of one scenario of `run.ts`, summed by function: where a row's
 * script time goes.
 *
 *   CHROME_PATH=... bun run src/three/profile.ts barq|r3f update|mount|unmount|toggle [mode]
 */
import { load, serve, withBenchChrome, type Page } from "../tier2/driver.ts"
import { bundle } from "./bundle.ts"

const [side = "barq", scenario = "update", mode = "signals"] = process.argv.slice(2)

const script = await bundle(`${side}.tsx`, { minify: false })

const served = serve(
  new Map([
    ["/p.html", '<!doctype html><meta charset="utf-8"><body style="margin:0"><div id="app"></div><script type="module" src="/p.js"></script>'],
    ["/p.js", script],
  ]),
)

interface Node {
  id: number
  callFrame: { functionName: string; url: string; lineNumber: number }
  hitCount: number
}

async function profile(page: Page, body: () => Promise<unknown>): Promise<void> {
  await page.send("Profiler.enable", {})
  await page.send("Profiler.setSamplingInterval", { interval: 50 })
  await page.send("Profiler.start", {})
  await body()
  const { profile } = (await page.send("Profiler.stop", {})) as {
    profile: { nodes: Node[]; samples: number[]; timeDeltas: number[] }
  }
  const self = new Map<number, number>()
  profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)))
  const byName = new Map<string, number>()
  for (const node of profile.nodes) {
    const key = `${node.callFrame.functionName || "(anonymous)"}:${node.callFrame.lineNumber}`
    byName.set(key, (byName.get(key) ?? 0) + (self.get(node.id) ?? 0))
  }
  let total = 0
  for (const [name, us] of byName) if (!name.startsWith("(")) total += us
  console.log(`total script ${(total / 1000).toFixed(2)} ms`)
  const rows = [...byName].toSorted((a, b) => b[1] - a[1]).slice(0, 40)
  for (const [name, us] of rows) console.log(`${(us / 1000).toFixed(2).padStart(9)} ms  ${name}`)
}

await withBenchChrome(
  async (page) => {
    await load(page, served.url("/p.html"))
    if (scenario === "update") {
      await page.call(`__bench.prepare(${JSON.stringify(mode)}, 1000)`)
      await page.call("__bench.run(30)")
      await profile(page, () => page.call("__bench.run(240)"))
    } else if (scenario === "mount") {
      await profile(page, () => page.call("__bench.mount(10000)"))
    } else if (scenario === "unmount") {
      await page.send("HeapProfiler.collectGarbage", {})
      await page.call("__bench.mount(5000)")
      await profile(page, () => page.call("__bench.unmount()"))
    } else {
      await page.call("__bench.mount(5000)")
      await profile(page, async () => {
        await page.call("__bench.unmount()")
        await page.call("__bench.mount(5000)")
      })
    }
  },
  { flags: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
)
served.stop()
