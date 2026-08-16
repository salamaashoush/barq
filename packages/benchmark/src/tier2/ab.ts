/**
 * The same js-framework-benchmark app, compiled once against each of two barq
 * runtimes, run head to head in one Chrome.
 *
 * A row's median moves several percent between whole runs of `bench:tier2 jfb`,
 * which is larger than most of the differences a runtime change makes. The
 * before/after therefore cannot be two runs on two days: it has to be one run
 * with the two runtimes INTERLEAVED, which is exactly what `driveJfb` already
 * does for barq against Solid. This only swaps what "the other side" is.
 *
 *   bun run src/tier2/ab.ts <path-to-the-other-core>/packages/core/src/index.ts
 *
 * The argument is the BASELINE — usually `packages/core/src/index.ts` inside a
 * `git worktree` at the commit being compared against — and the working tree is
 * the candidate.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { compileBarq } from "../compile.ts"
import { BARQ_CORE, type Bundle } from "./build.ts"
import { driveJfb } from "./jfb.ts"

const HERE = import.meta.dir
const WORK = join(HERE, ".tmp-ab")

rmSync(WORK, { recursive: true, force: true })
mkdirSync(WORK, { recursive: true })
writeFileSync(join(WORK, ".gitignore"), "*\n")

async function pageAgainst(core: string, name: string): Promise<Bundle> {
  const source = readFileSync(new URL("./apps/jfb-barq.tsx", import.meta.url), "utf8")
  const compiled = compileBarq(source, `${name}.tsx`, false).replaceAll(
    '"@barqjs/core"',
    JSON.stringify(core),
  )
  const entry = join(WORK, `${name}.ts`)
  writeFileSync(entry, compiled)
  const built = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    format: "esm",
    minify: false,
    sourcemap: "none",
    conditions: ["browser"],
    define: { "process.env.NODE_ENV": '"production"' },
  })
  if (!built.success) throw new Error(`bundling ${name} failed:\n${built.logs.map(String).join("\n")}`)
  const code = await built.outputs[0].text()
  return {
    files: new Map([
      [
        "/index.html",
        `<!doctype html>\n<html><head><meta charset="utf-8"><title>${name}</title></head>\n<body><div id="main"><div class="container"></div></div>\n<script type="module" src="/app.js"></script>\n</body></html>\n`,
      ],
      ["/app.js", code],
    ]),
    page: "/index.html",
  }
}

const baselineCore = process.argv[2]
if (baselineCore === undefined) throw new Error("usage: ab.ts <baseline core index.ts>")

const iterations = Number(process.argv[3] ?? 10)
const baseline = await pageAgainst(baselineCore, "jfb-baseline")
const candidate = await pageAgainst(BARQ_CORE, "jfb-candidate")

console.log(`\nbaseline  ${baselineCore}`)
console.log(`candidate ${BARQ_CORE}`)
console.log(`js-framework-benchmark, real Chrome, ${iterations} interleaved iterations:\n`)

const only = process.argv.slice(4)
const result = await driveJfb(
  baseline,
  candidate,
  iterations,
  { a: "base", b: "cand" },
  only.length > 0 ? only : undefined,
)
writeFileSync(join(WORK, "ab-results.json"), `${JSON.stringify(result, null, 2)}\n`)

console.log(
  "\nratio is base ÷ cand, so ABOVE 1.000 is the candidate faster and below it is the candidate " +
    "slower. `barqBytes` is the baseline's memory row and `solidBytes` the candidate's.",
)
process.exit(0)
