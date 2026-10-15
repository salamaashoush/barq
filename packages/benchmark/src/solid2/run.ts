/**
 * barq against Solid 2.0 and Solid 1.9, every lane, one results file.
 *
 *   bun run bench:solid2:prepare          once, builds Solid 2.0 from solid-next
 *   bun run bench:solid2                  every lane
 *   bun run bench:solid2 script ssr       a subset: jfb script ssr hydrate size
 *
 * `CHROME_PATH` names Chrome, `CDP_PORT` pins its debugging port, `BENCH_PORT`
 * the base of a ten-port block for the page servers, and `BENCH_TMP` where
 * Chrome's profile goes. `QUICK=1` cuts every iteration count for a smoke run.
 *
 * Writes `solid2-results.json` beside this package's other results, merged
 * when a subset was asked for, with the machine and every version on it.
 */
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { cpus, totalmem } from "node:os"
import { join } from "node:path"

import { runHydrate } from "./hydrate.ts"
import { runJfb3, runScriptLane } from "./jfb.ts"
import { bundleSizes, fixtureSizes } from "./size.ts"
import { barqSignalsVersion, solid2Version, type Framework } from "./solid2.ts"
import { runSsr } from "./ssr.ts"

const OUT = join(import.meta.dir, "..", "..", "solid2-results.json")
const ALL: readonly Framework[] = ["barq", "solid2", "solid1"]
const quick = process.env.QUICK === "1"

const wanted = new Set(process.argv.slice(2))
const want = (lane: string) => wanted.size === 0 || wanted.has(lane)

function chromeVersion(): string {
  const binary = process.env.CHROME_PATH
  if (binary === undefined) return "unknown"
  return spawnSync(binary, ["--version"], { encoding: "utf8" }).stdout.trim()
}

function barqCommit(): string {
  return spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).stdout.trim()
}

const solid1 = (
  JSON.parse(readFileSync(require.resolve("solid-js/package.json"), "utf8")) as { version: string }
).version

const results: Record<string, unknown> = {
  when: new Date().toISOString(),
  machine: {
    cpu: cpus()[0]?.model ?? "unknown",
    cores: cpus().length,
    memoryGb: Math.round(totalmem() / 2 ** 30),
    platform: `${process.platform} ${process.arch}`,
    bun: Bun.version,
    chrome: chromeVersion(),
  },
  versions: {
    barq: barqCommit(),
    barqSignals: barqSignalsVersion(),
    solid2: solid2Version(),
    solid1,
  },
}

if (want("jfb")) {
  console.log("\njs-framework-benchmark, trace durations (ms, median of interleaved page loads):")
  results.jfb = await runJfb3(ALL, quick ? 2 : 15)
}

if (want("script")) {
  console.log("\njs-framework-benchmark, script time from click to the end of the microtask queue (ms):")
  results.script = await runScriptLane(ALL, quick ? { loads: 1, samples: 3, warmup: 1 } : { loads: 6, samples: 10, warmup: 3 })
}

if (want("ssr")) {
  console.log("\nSSR throughput, storefront page with 100 cards (renders per second):")
  results.ssr = await runSsr(ALL, quick ? { items: 100, rounds: 3, perRound: 20, warmup: 20 } : { items: 100, rounds: 15, perRound: 200, warmup: 500 })
}

if (want("hydrate")) {
  console.log("\nHydration, storefront page with 100 cards (ms):")
  results.hydrate = await runHydrate(ALL, { items: 100, loads: quick ? 3 : 20, throttle: 1 })
}

if (want("size")) {
  console.log("\nBundle size, minified (raw / gzip -9 / brotli 11 bytes):")
  results.bundles = await bundleSizes(ALL)
  console.log("\nCompiler output per fixture, minified with imports external:")
  results.fixtures = await fixtureSizes()
}

const previous = existsSync(OUT) && wanted.size > 0 ? (JSON.parse(readFileSync(OUT, "utf8")) as object) : {}
writeFileSync(OUT, `${JSON.stringify({ ...previous, ...results }, null, 2)}\n`)
console.log(`\nRaw numbers: ${OUT}`)

// Chrome is a child process and Bun keeps the loop open behind it once killed.
process.exit(0)
