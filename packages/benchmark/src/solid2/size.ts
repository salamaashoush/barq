/**
 * Bytes shipped: whole production bundles of the hello-world and the
 * js-framework-benchmark app, and the compiled output of every fixture in
 * `packages/compiler-rs/fixtures`.
 *
 * Every bundle goes through `Bun.build` with the same settings, minified, and
 * is reported raw, gzip at level 9 and brotli at quality 11. Fixtures are
 * compiled by barq and by Solid 2.0's native compiler from the same source and
 * minified with every import left external, so the number is the compiler's
 * output and nothing a runtime adds.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { brotliCompressSync, constants, gzipSync } from "node:zlib"

import { compileBarq } from "../compile.ts"
import { appSource, bundleFor, compileFor, compileSolid2, type Framework } from "./solid2.ts"

const FIXTURES = join(import.meta.dir, "..", "..", "..", "compiler-rs", "fixtures")

export interface Bytes {
  raw: number
  gzip: number
  brotli: number
}

export function bytesOf(code: string): Bytes {
  const buffer = Buffer.from(code)
  return {
    raw: buffer.byteLength,
    gzip: gzipSync(buffer, { level: 9 }).byteLength,
    brotli: brotliCompressSync(buffer, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).byteLength,
  }
}

const SOLID1_JFB = readFileSync(join(import.meta.dir, "..", "tier2", "apps", "jfb-solid.jsx"), "utf8")

async function appBundle(framework: Framework, app: "hello" | "jfb"): Promise<string> {
  const file =
    app === "hello" ? "hello.jsx" : framework === "solid1" ? "jfb-solid.jsx" : "jfb.tsx"
  const source = app === "jfb" && framework === "solid1" ? SOLID1_JFB : appSource(file)
  const { code, ext } = await compileFor(framework, source, file)
  return bundleFor(framework, code, ext, `size-${app}`, { target: "browser", minify: true })
}

export async function bundleSizes(
  frameworks: readonly Framework[],
): Promise<Record<string, Partial<Record<Framework, Bytes>>>> {
  const out: Record<string, Partial<Record<Framework, Bytes>>> = {}
  for (const app of ["hello", "jfb"] as const) {
    out[app] = {}
    for (const framework of frameworks) out[app][framework] = bytesOf(await appBundle(framework, app))
    console.log(
      `  ${app.padEnd(6)}` +
        frameworks
          .map((f) => {
            const b = out[app][f]!
            return ` ${f} ${b.raw} B / ${b.gzip} gz / ${b.brotli} br`
          })
          .join("  "),
    )
  }
  return out
}

const WORK = join(import.meta.dir, ".tmp", "fixtures")

async function minifiedModule(code: string, name: string): Promise<string> {
  mkdirSync(WORK, { recursive: true })
  const entry = join(WORK, `${name}.ts`)
  writeFileSync(entry, code)
  const built = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    format: "esm",
    minify: true,
    packages: "external",
  })
  if (!built.success) throw new Error(`minifying ${name}: ${built.logs.map(String).join("\n")}`)
  return built.outputs[0].text()
}

export interface FixtureSize {
  fixture: string
  barq: Bytes
  solid2: Bytes
}

export async function fixtureSizes(): Promise<{
  rows: FixtureSize[]
  skipped: { fixture: string; reason: string }[]
}> {
  const rows: FixtureSize[] = []
  const skipped: { fixture: string; reason: string }[] = []
  const names = readdirSync(FIXTURES)
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => file.slice(0, -4))
    .toSorted()
  for (const name of names) {
    const source = readFileSync(join(FIXTURES, `${name}.tsx`), "utf8")
    let barq: string
    let solid: string
    try {
      barq = compileBarq(source, `${name}.tsx`, false)
    } catch (error) {
      skipped.push({ fixture: name, reason: `barq: ${String(error).split("\n")[0]}` })
      continue
    }
    try {
      solid = compileSolid2(source, `${name}.tsx`, "dom")
    } catch (error) {
      skipped.push({ fixture: name, reason: `solid2: ${String(error).split("\n")[0]}` })
      continue
    }
    rows.push({
      fixture: name,
      barq: bytesOf(await minifiedModule(barq, `${name}-barq`)),
      solid2: bytesOf(await minifiedModule(solid, `${name}-solid2`)),
    })
  }
  const total = (side: "barq" | "solid2", key: keyof Bytes) =>
    rows.reduce((sum, row) => sum + row[side][key], 0)
  console.log(
    `  ${rows.length} fixtures compiled by both (${skipped.length} skipped): ` +
      `barq ${total("barq", "raw")} B / ${total("barq", "gzip")} gz, ` +
      `solid2 ${total("solid2", "raw")} B / ${total("solid2", "gzip")} gz (sum of per-fixture sizes)`,
  )
  const worst = rows
    .map((row) => ({ fixture: row.fixture, ratio: row.barq.gzip / row.solid2.gzip }))
    .toSorted((a, b) => b.ratio - a.ratio)
    .slice(0, 8)
  for (const row of worst) console.log(`    ${row.fixture.padEnd(44)} barq/solid2 gzip ${row.ratio.toFixed(2)}`)
  return { rows, skipped }
}
