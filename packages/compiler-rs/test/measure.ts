import { compileSource } from "./harness.ts"

/**
 * Compile-time measurement, shared by the throughput gate and the target-11
 * assertion so both report the same number.
 *
 * Methodology is lifted from packages/benchmark/src/dom-head-to-head.ts: warm
 * up, force a GC, then take the MINIMUM per-op time across several rounds. The
 * minimum is the honest number for a pure function — it is the run least
 * disturbed by the scheduler, and it does not drift with machine load the way a
 * mean does, which is what keeps the bound from flaking.
 */

const WARMUP = 50
const ROUNDS = 7
const ITERATIONS = 50

export interface Measurement {
  name: string
  bytes: number
  lines: number
  msPerCompile: number
}

export function measure(
  name: string,
  source: string,
  options: Record<string, unknown> = {},
): Measurement {
  const filename = `${name}.tsx`

  // A compiler that silently emits nothing would post spectacular numbers.
  const probe = compileSource(source, filename, options)
  if (probe.trim().length === 0) {
    throw new Error(`throughput: ${name} compiled to an empty string — the timing is meaningless`)
  }

  for (let i = 0; i < WARMUP; i++) compileSource(source, filename, options)
  Bun.gc(true)

  let best = Number.POSITIVE_INFINITY
  for (let round = 0; round < ROUNDS; round++) {
    const start = Bun.nanoseconds()
    for (let i = 0; i < ITERATIONS; i++) compileSource(source, filename, options)
    const perOp = (Bun.nanoseconds() - start) / ITERATIONS
    if (perOp < best) best = perOp
  }

  return {
    name,
    bytes: Buffer.byteLength(source),
    lines: source.split("\n").length,
    msPerCompile: best / 1e6,
  }
}

/** Fixtures welded into one compilable module: imports commented out after the
 * first, default exports and const exports demoted so the names cannot collide. */
export function concatFixtures(names: string[], read: (name: string) => string): string {
  return names
    .map((name, i) =>
      read(name)
        .replace(/^import .*$/gm, (line) => (i === 0 ? line : `// ${line}`))
        .replace(/export default function (\w+)/, `function $1_${i}`)
        .replace(/^export (const|function) /gm, (_, kind) => `${kind} `)
        .replace(/^(const|function) (\w+)/gm, `$1 $2_${i}`),
    )
    .join("\n")
}

/**
 * "Typical component file" as a concrete artifact rather than a vibe: the three
 * richest fixtures concatenated into one module.
 */
export function typicalComponentFile(read: (name: string) => string): string {
  return concatFixtures(
    ["control-flow-for", "control-flow-switch-match", "component-boundary-props"],
    read,
  )
}
