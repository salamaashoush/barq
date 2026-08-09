import { dirname, join } from "node:path"

/**
 * Reactivity tracing.
 *
 * The runtime exposes no effect counter of its own — `DEV.diagnostics` only
 * reports error/warning codes, not effect creation. So we instrument at the
 * module boundary: `signals.ts` is replaced (via bun's `mock.module`, from the
 * preload script, before any core module is loaded) with a namespace whose
 * `renderEffect` and `effect` wrap the real ones and count creations and runs.
 *
 * Everything downstream — `dom.ts`, `components.ts`, `map.ts`, and compiled
 * output — imports `renderEffect` from that module, so the count is the real
 * total for both the oracle and the compiled path, not an estimate.
 */

export type EffectKind = "render" | "user"

export interface EffectRecord {
  kind: EffectKind
  runs: number
}

export interface Trace {
  effects: EffectRecord[]
}

export interface TraceSummary {
  created: number
  renderEffects: number
  userEffects: number
  totalRuns: number
}

let current: Trace | null = null

export function beginTrace(): Trace {
  // `current` is a module global, so two renders in flight at once would
  // cross-attribute their effects and still produce plausible numbers.
  if (current !== null) {
    throw new Error("tracer: a trace is already open — renders must not overlap")
  }
  const trace: Trace = { effects: [] }
  current = trace
  return trace
}

export function endTrace(): void {
  current = null
}

export function summarize(trace: Trace): TraceSummary {
  let renderEffects = 0
  let userEffects = 0
  let totalRuns = 0
  for (const e of trace.effects) {
    if (e.kind === "render") renderEffects++
    else userEffects++
    totalRuns += e.runs
  }
  return { created: trace.effects.length, renderEffects, userEffects, totalRuns }
}

type EffectFn = (compute: unknown, apply?: unknown) => () => void

function wrap(real: EffectFn, kind: EffectKind): EffectFn {
  return (compute: unknown, apply?: unknown) => {
    // Effects created outside a trace window belong to nobody; still real, just
    // not attributed. Binding the record at creation (not at run) means later
    // re-runs keep landing in the session that created the effect, which is
    // what makes per-step run counts meaningful.
    const record: EffectRecord | null = current ? { kind, runs: 0 } : null
    if (record && current) current.effects.push(record)

    if (typeof compute !== "function") return real(compute, apply)

    const counted = (prev?: unknown) => {
      if (record) record.runs++
      return (compute as (p?: unknown) => unknown)(prev)
    }
    return real(counted, apply)
  }
}

export interface Installed {
  signalsPath: string
}

/**
 * Must run before anything imports @barqjs/core. Called from test/preload.ts.
 */
export function installTracer(mockModule: (path: string, factory: () => unknown) => void): Installed {
  const coreIndex = Bun.resolveSync("@barqjs/core", import.meta.dir)
  const signalsPath = join(dirname(coreIndex), "signals.ts")

  const real = require(signalsPath) as Record<string, unknown>
  // Snapshot eagerly: mock.module overwrites the namespace in place, so the
  // originals have to be captured before the factory can ever be invoked.
  const snapshot: Record<string, unknown> = { ...real }
  const realRenderEffect = snapshot.renderEffect as EffectFn
  const realEffect = snapshot.effect as EffectFn

  if (typeof realRenderEffect !== "function" || typeof realEffect !== "function") {
    throw new Error(
      `tracer: ${signalsPath} does not export renderEffect/effect as functions — the runtime moved, fix the tracer`,
    )
  }

  const patched: Record<string, unknown> = {
    ...snapshot,
    renderEffect: wrap(realRenderEffect, "render"),
    effect: wrap(realEffect, "user"),
  }

  mockModule(signalsPath, () => patched)

  return { signalsPath }
}
