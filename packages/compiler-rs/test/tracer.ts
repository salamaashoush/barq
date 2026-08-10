import { dirname, join } from "node:path"

/**
 * Reactivity tracing, and template instantiation tracing.
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
 *
 * `dom.ts` is replaced the same way, for `template`. The marker bound used to
 * ask "does this module clone each template exactly once?" and, whenever it
 * could not prove that, degrade to "a module whose templates bake no anchor
 * cannot produce one" — which switched the bound off entirely for every module
 * that calls a component. Recording the node each clone RETURNS makes the
 * question unnecessary: the anchors a frame is allowed to contain are the
 * anchors baked into the clones that are still in the tree at that moment,
 * whether that is one clone or one per row.
 */

export type EffectKind = "render" | "user"

export interface EffectRecord {
  kind: EffectKind
  runs: number
}

/** One `_tmpl$N()` call: the node it produced and the anchors baked into it. */
export interface TemplateInstance {
  node: Node
  anchors: number
}

export interface Trace {
  effects: EffectRecord[]
  templates: TemplateInstance[]
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
    // Clearing as we report keeps an abandoned render from latching every later
    // render in the process into an instant, meaningless failure.
    const stale = current
    current = null
    throw new Error(
      `tracer: a trace was left open by an earlier render (${stale.effects.length} effect(s), ` +
        `${stale.templates.length} clone(s)) — that render was abandoned rather than finished. ` +
        "This one starts clean; the failure belongs to whatever ran before it.",
    )
  }
  const trace: Trace = { effects: [], templates: [] }
  current = trace
  return trace
}

export function endTrace(): void {
  current = null
}

/**
 * The anchors a container is allowed to hold right now: the ones baked into the
 * template clones that are still attached to it.
 *
 * Exact for every module. A clone that was built and thrown away, one parked in
 * a detached fragment by a control-flow component, and one never inserted at all
 * all contribute nothing, which is what makes this an equality rather than the
 * upper bound the old predicate degraded to.
 */
export function liveTemplateAnchors(trace: Trace, container: Node): number {
  let anchors = 0
  for (const instance of trace.templates) {
    if (instance.anchors === 0) continue
    if (container.contains(instance.node)) anchors += instance.anchors
  }
  return anchors
}

const NODE_COMMENT = 8

/** Insert anchors inside one cloned template: empty comments, counted as nodes. */
function bakedAnchors(root: Node): number {
  let anchors = 0
  const visit = (node: Node): void => {
    if (node.nodeType === NODE_COMMENT && (node as Comment).data === "") anchors++
    for (const child of Array.from(node.childNodes)) visit(child)
  }
  visit(root)
  return anchors
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

type TemplateFn = (html: string, isSVG?: boolean) => () => Node

/** Record every clone, with the anchors read off the clone rather than the HTML. */
function wrapTemplate(real: TemplateFn): TemplateFn {
  return (html: string, isSVG?: boolean) => {
    const clone = real(html, isSVG)
    return () => {
      const node = clone()
      if (current) current.templates.push({ node, anchors: bakedAnchors(node) })
      return node
    }
  }
}

export interface Installed {
  signalsPath: string
  domPath: string
}

/**
 * Must run before anything imports @barqjs/core. Called from test/preload.ts.
 */
export function installTracer(mockModule: (path: string, factory: () => unknown) => void): Installed {
  const coreIndex = Bun.resolveSync("@barqjs/core", import.meta.dir)
  const signalsPath = join(dirname(coreIndex), "signals.ts")
  const domPath = join(dirname(coreIndex), "dom.ts")

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

  // AFTER the signals mock, so `dom.ts` binds the counted effects rather than
  // the originals — the order the effect totals depend on.
  const realDom = require(domPath) as Record<string, unknown>
  const domSnapshot: Record<string, unknown> = { ...realDom }
  const realTemplate = domSnapshot.template as TemplateFn

  if (typeof realTemplate !== "function") {
    throw new Error(
      `tracer: ${domPath} does not export template as a function — the runtime moved, fix the tracer`,
    )
  }

  mockModule(domPath, () => ({ ...domSnapshot, template: wrapTemplate(realTemplate) }))

  return { signalsPath, domPath }
}
