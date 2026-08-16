/**
 * The Tier-2 lane, end to end.
 *
 *   bun run bench:tier2              everything, about half an hour
 *   bun run bench:tier2 shapes       one half
 *   bun run bench:tier2 jfb jrb
 *
 * Writes `tier2-results.json` beside `benchmark-results.json`, which is checked
 * in for the same reason: a number nobody can diff against a previous run is a
 * number nobody can check. Then prints the survival table `claims.ts` defines —
 * the table is the deliverable, the suites are how it is filled in.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { CLAIMS } from "./claims.ts"
import { runJfb, type JfbResult } from "./jfb.ts"
import { runJrb, type JrbFull } from "./jrb.ts"
import { runShapes, type ShapesResult } from "./shapes.ts"

const OUT = join(import.meta.dir, "..", "..", "tier2-results.json")

interface Results {
  when: string
  chrome: string
  shapes?: ShapesResult
  jfb?: JfbResult
  jrb?: JrbFull
}

const wanted = new Set(process.argv.slice(2).filter((a) => !a.startsWith("-")))
const want = (name: string) => wanted.size === 0 || wanted.has(name)

const results: Results = { when: new Date().toISOString(), chrome: process.env.CHROME_PATH ?? "auto" }

if (want("shapes")) {
  console.log("\n§0.2/§0.3 microbenchmarks, real Chrome:")
  results.shapes = await runShapes([200, 1000], 41)
}

if (want("jfb")) {
  console.log("\njs-framework-benchmark, real Chrome, trace-derived durations:")
  results.jfb = await runJfb(10)
}

if (want("jrb")) {
  console.log("\njs-reactivity-benchmark, real Chrome:")
  results.jrb = await runJrb()
}

// MERGED, not overwritten, when a subset was asked for. The three halves take
// about half an hour together and are routinely run one at a time; a writer
// that replaced the file would mean the last half run is the only half on disk,
// and a table assembled from it would silently be missing two thirds of its
// evidence. A full run (no arguments) replaces everything, so `when` always
// describes the whole file in that case and only that case.
const previous: Partial<Results> =
  existsSync(OUT) && wanted.size > 0
    ? (JSON.parse(readFileSync(OUT, "utf8")) as Results)
    : {}
writeFileSync(OUT, `${JSON.stringify({ ...previous, ...results }, null, 2)}\n`)

console.log("\n" + "=".repeat(100))
console.log("THE SURVIVAL TABLE — every Tier-1 claim this lane can rule on")
console.log("=".repeat(100))
for (const claim of CLAIMS) {
  console.log(`\n${claim.id}  ${claim.section}`)
  console.log(`  claim      ${claim.says}`)
  console.log(`  Tier 1     ${claim.tier1}`)
  console.log(
    `  Tier 2     ${claim.procedure ?? "NOTHING IN THIS LANE CAN DECIDE IT — a browser is the wrong instrument"}`,
  )
  if (claim.cannot !== undefined) console.log(`  NOT decided by it   ${claim.cannot}`)
}
console.log(`\nRaw numbers: ${OUT}`)
console.log(
  "A verdict is a reading of a number and not a threshold on one, so nothing here passes or " +
    "fails: the run publishes, and the reading goes in the milestone's own write-up. A lane that " +
    "failed CI on a ratio would have its thresholds widened until it reported nothing.",
)

// Chrome is spawned as a child and the CDP socket is closed in a `finally`;
// Bun still holds the loop open behind the killed child on this platform, so
// the process is ended explicitly rather than left looking like a hang.
process.exit(0)
