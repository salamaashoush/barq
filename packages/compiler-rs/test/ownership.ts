/**
 * Layer L2b of the oracle — the ownership trace, checked against the
 * compiler's static ownership tree. `CODESIGN.md` §6 L2b.
 *
 * The claim, per fixture:
 *
 * > the runtime scope tree is isomorphic to the compiler's static ownership
 * > tree, and every construction ran under exactly the scope the compiler said
 * > it would.
 *
 * What makes this channel different from every other one in the package: the
 * expected value is **derived from the source**, not from a second execution.
 * `oracle.test.ts` asks whether the compiled path and the `createElement` path
 * agree, and for the Provider defect they agree perfectly — both render a blank
 * page, so the oracle certified the bug. There is nothing for a second
 * implementation to be wrong about here. The compiler already knew the
 * ownership structure it was emitting; L2b makes it write that structure down
 * and then asks the runtime whether it kept to it.
 *
 * Two independent halves:
 *
 * 1. **Runtime-internal invariants** (no compiler involved): a scope's parent
 *    was entered before it; the scope graph is a forest of trees, not a cycle;
 *    a scope is disposed at most once; every scope entered inside the window is
 *    disposed before it closes; kids dispose in reverse creation order after
 *    their parent's dispose begins; a Block built only under the scope it was
 *    *given*.
 *
 *    Two of these are narrower than they read. O3.1 observes the ABSENCE OF THE
 *    IDEMPOTENCE GUARD — the instrumentation sits behind that guard, so calling
 *    an idempotent disposer three times records one event and is correctly
 *    silent; what it catches is the guard being deleted. And the O2 span check
 *    is about what a block BUILT, not about an ambient owner read at the moment
 *    of handover: comparing that read against itself is what the clause used to
 *    do, and no runtime state could falsify it.
 * 2. **The static comparison**: every template clone happened under a scope
 *    path the compiler lists for that template, under the root that was
 *    rendered.
 *
 * The second is the one that names the Provider bug. For
 * `<Ctx.Provider value={…}><Child/></Ctx.Provider>` the compiler says the
 * child's `<span>` occurs at `["root","provide"]` and only there; the runtime
 * clones it at `["root"]`, because `Child({})` is an argument and runs at the
 * call site. That is O2, reported as O2, from two artefacts that were produced
 * independently.
 *
 * **Honest limit, stated by the design that proposed the channel:** the trace
 * proves the tree, never the values. A compiler that gets every scope right and
 * every DOM write wrong passes L2b completely. L3 carries that weight.
 */

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import {
  fixtureSource,
  listFixtures,
  loadModule,
  nativeCompiler as native,
  writeSibling,
  type FixtureModule,
} from "./harness.ts"

export const OWNERSHIP_DIR = join(import.meta.dir, "..", "fixtures", "ownership")

// ---------------------------------------------------------------------------
// the compiler's side
// ---------------------------------------------------------------------------

export interface StaticNode {
  id: number
  parent: number
  kind: string
  /** whether this construct is in O1's creation set */
  scope: boolean
  label: string
  line: number
  column: number
}

export interface StaticPosition {
  node: number
  /** the emitted binding, `_tmpl$1` */
  template: string
  /** the template's bytes — what a runtime clone can be recognised by */
  html: string
  /** the root node of this position's tree, in `nodes` */
  rootNode: number
  /** that root's label, for reading — `rootNode` is what identifies it */
  root: string
  /** the scope-creating ancestors, outermost first */
  path: string[]
  line: number
  column: number
}

export interface StaticTree {
  version: number
  roots: Array<{ name: string; node: number }>
  nodes: StaticNode[]
  positions: StaticPosition[]
  /** components the walk could not follow, so the tree is known to be partial */
  opaque: string[]
}

export function staticTree(
  source: string,
  filename: string,
  options: Record<string, unknown> = {},
): { code: string; tree: StaticTree } {
  const result = native.transform(source, { filename, ownership: true, ...options })
  if (!result.ownership) {
    throw new Error(`${filename}: the compiler produced no ownership artefact`)
  }
  const tree = JSON.parse(result.ownership) as StaticTree
  if (tree.version !== 2) {
    throw new Error(
      `${filename}: ownership artefact version ${tree.version}, this harness reads 2 — ` +
        "the artefact and its reader must be changed together",
    )
  }
  return { code: result.code, tree }
}

/**
 * The paths the compiler says a template may be cloned at, when `root` is the
 * component being rendered. A `Set` of joined paths: the question the runtime
 * can answer is "was this clone at a legal position", and multiplicity is not
 * decidable from the source — one `each` position produces one clone per row,
 * and a branch position produces one per activation.
 */
function legalPaths(tree: StaticTree, root: string): Map<string, StaticPosition[]> {
  const byHtml = new Map<string, StaticPosition[]>()
  const entry = tree.roots.find((candidate) => candidate.name === root)
  if (entry === undefined) return byHtml
  for (const position of tree.positions) {
    if (position.rootNode !== entry.node) continue
    const list = byHtml.get(position.html)
    if (list === undefined) byHtml.set(position.html, [position])
    else list.push(position)
  }
  return byHtml
}

function distinctPaths(positions: readonly StaticPosition[]): Set<string> {
  return new Set(positions.map((position) => position.path.join("/")))
}

/**
 * Which rule a misplaced clone falsifies.
 *
 * O2 is the general rule — a Block runs under the scope it is given — and it
 * covers a JSX-valued slot that was built as an argument: the `<em>` in
 * `<Show fallback={<em/>}>` belongs to the branch and is cloned before the
 * branch exists.
 *
 * O2.1 is the sharper consequence, and it is the one the redesign is named
 * after: *a component's body* ran at the call site of the construct that
 * received it. The tree can tell the two apart exactly — a position whose
 * owning node is a `component` is inside a component body, and one whose owner
 * is the construct itself is a slot the construct never got to invoke.
 */
function ruleFor(tree: StaticTree, positions: readonly StaticPosition[]): string {
  const inComponent = positions.some(
    (position) => tree.nodes[position.node]?.kind === "component",
  )
  return inComponent ? "O2.1" : "O2"
}

// ---------------------------------------------------------------------------
// the runtime's side
// ---------------------------------------------------------------------------

export interface OwnershipEvent {
  seq: number
  kind: "enter" | "exit" | "dispose" | "clone" | "own" | "block-enter" | "block-exit"
  /** on `block-enter`, the scope the block was GIVEN */
  scope: number
  parent: number
  label: string
  scopeKind: string
  /** registered its disposer with the scope recorded as its parent */
  owned: boolean
}

interface RuntimeScope {
  id: number
  parent: number
  kind: string
  /** the recorded parent holds this scope's disposer, so O3.2 is about it */
  owned: boolean
  enteredAt: number
  disposedAt: number
}

export interface RuntimeTree {
  scopes: Map<number, RuntimeScope>
  /** creation order, which is the order `enter` events arrived */
  order: number[]
}

function runtimeTree(events: readonly OwnershipEvent[]): RuntimeTree {
  const scopes = new Map<number, RuntimeScope>()
  const order: number[] = []
  for (const event of events) {
    if (event.kind === "enter") {
      if (!scopes.has(event.scope)) {
        scopes.set(event.scope, {
          id: event.scope,
          parent: event.parent,
          kind: event.scopeKind,
          owned: event.owned,
          enteredAt: event.seq,
          disposedAt: -1,
        })
        order.push(event.scope)
      }
    } else if (event.kind === "dispose") {
      const scope = scopes.get(event.scope)
      if (scope !== undefined && scope.disposedAt < 0) scope.disposedAt = event.seq
    }
  }
  return { scopes, order }
}

/**
 * The scope-creating chain above `id`, outermost first — the runtime's answer
 * to the compiler's `path`. `null` when the chain does not terminate at a root,
 * which is a broken trace rather than a wrong path and is reported as such.
 */
export function runtimePath(tree: RuntimeTree, id: number): string[] | null {
  const path: string[] = []
  const seen = new Set<number>()
  let at = id
  while (at !== -1) {
    if (seen.has(at)) return null
    seen.add(at)
    const scope = tree.scopes.get(at)
    if (scope === undefined) return null
    path.push(scope.kind)
    at = scope.parent
  }
  path.reverse()
  return path
}

// ---------------------------------------------------------------------------
// findings
// ---------------------------------------------------------------------------

/**
 * Every rule this channel is able to report. Not the rules it happens to be
 * reporting today: a rule leaves this list only when the check that can produce
 * it is deleted, which makes the list the channel's declared reach and lets
 * `semantics.test.ts` compute what the whole oracle covers.
 */
export const CHANNEL_RULES: readonly string[] = Object.freeze([
  "O2",
  "O2.1",
  "O3.1",
  "O3.2",
  "O3.7",
  "O4.5",
])

export interface Finding {
  /**
   * Stable within a fixture, and what the registry addresses a row by:
   * `<kind>@<the emitted template binding, or the scope kind>`. Keying a row
   * on the fixture alone would let a SECOND violation of the same shape land
   * inside an existing row and never be seen; keying it on the message would
   * make every reworded diagnostic a registry diff.
   */
  id: string
  /** the `SEMANTICS.md` rule this violation is about */
  rule: string
  kind: string
  detail: string
}

export interface OwnershipRun {
  fixture: string
  /** empty when the fixture has no static positions to check against */
  findings: Finding[]
  /** clones whose html the compiler never attributed to a position */
  unattributed: number
  /** clones checked against a static path set of exactly one member */
  determined: number
  /** clones checked at all */
  clones: number
  scopes: number
  /**
   * Reactive nodes the trace saw created. Reported so that "no effect was
   * misplaced" can never be confused with "no effect was recorded" — the state
   * this channel was in before it had an `own` event at all.
   */
  effects: number
  /**
   * Groups of two or more kids a single scope actually disposed itself — the
   * only shape O3.2's reverse-creation-order claim can be tested on. Reported
   * so that a green O3.2 is never confused with an unexercised one.
   */
  cascades: number
  /** the module never loaded or never rendered; findings carry the reason */
  crashed: boolean
}

// ---------------------------------------------------------------------------
// the run
// ---------------------------------------------------------------------------

interface CoreLike {
  flush(): void
  createScope<T>(fn: (dispose: () => void) => T, detached?: boolean, kind?: string): T
  render(node: unknown, container: Element): () => void
  clearDelegatedEvents(): void
  beginOwnershipTrace(): void
  endOwnershipTrace(): OwnershipEvent[]
}

let siblingRun = 0

async function settle(core: CoreLike): Promise<void> {
  core.flush()
  await new Promise((r) => setTimeout(r, 0))
  core.flush()
  await new Promise((r) => setTimeout(r, 0))
}

/**
 * Render `code`'s default export under a traced root, drive its scripted steps,
 * dispose, and hand back the event log.
 *
 * The disposal happens INSIDE the trace window on purpose: disposal order is
 * half of what O3 says and it is unobservable from outside.
 */
export async function trace(
  code: string,
  tag: string,
  siblings: ReadonlyArray<{ name: string; code: string }> = [],
): Promise<OwnershipEvent[]> {
  const core = (await import("@barqjs/core")) as unknown as CoreLike
  // bun caches a module by path permanently, so rewriting a fixed sibling path
  // and re-importing hands back the FIRST compilation. Two calls that differ
  // only in backend would then compare the same sibling twice, and two
  // processes sharing the directory would truncate each other's files. The
  // stamp keeps the depth the fixtures' relative imports need.
  const stamp = `${process.pid}-${siblingRun++}`
  const rename = (name: string): string => `${stamp}-${name}`
  let source = code
  for (const sibling of siblings) source = source.replaceAll(`./${sibling.name}`, `./${rename(sibling.name)}`)
  for (const sibling of siblings) {
    let text = sibling.code
    for (const other of siblings) text = text.replaceAll(`./${other.name}`, `./${rename(other.name)}`)
    writeSibling(rename(sibling.name), text)
  }
  const mod = (await loadModule(source, tag)) as FixtureModule
  const container = document.createElement("div")
  document.body.appendChild(container)

  core.beginOwnershipTrace()
  let dispose: (() => void) | undefined
  let clear: (() => void) | undefined
  try {
    // C1: the fixture's default export is a component and takes the scope it
    // runs under. `render` opens that scope, so the mount is handed over as a
    // BLOCK — `mod.default` itself, by identity — rather than called here,
    // which would construct the whole subtree before any scope existed.
    core.createScope(
      (d: () => void) => {
        dispose = d
        clear = core.render(mod.default as never, container)
      },
      true,
      "root",
    )
    await settle(core)
    for (const step of mod.steps ?? []) {
      step()
      await settle(core)
    }
    clear?.()
    dispose?.()
    await settle(core)
    return core.endOwnershipTrace()
  } finally {
    // `endOwnershipTrace` is idempotent about the sink, so a throw above still
    // leaves the runtime uninstrumented for whatever runs next.
    core.endOwnershipTrace()
    container.remove()
    document.body.innerHTML = ""
    core.clearDelegatedEvents()
  }
}

/** Is `scope` `ancestor`, or below it, in the runtime scope tree? */
function within(runtime: RuntimeTree, scope: number, ancestor: number): boolean {
  const seen = new Set<number>()
  let at = scope
  while (at !== -1 && !seen.has(at)) {
    if (at === ancestor) return true
    seen.add(at)
    at = runtime.scopes.get(at)?.parent ?? -1
  }
  return false
}

/**
 * O2, from two sources rather than one.
 *
 * A `block-enter` records the scope the runtime was told to run a handed-over
 * construction under; every `clone` before the matching `block-exit` records
 * the scope a template instantiation actually happened under, observed
 * separately and later. O2 is the claim that each of those sits at the given
 * scope or below it. Comparing an ambient read against itself at the handover
 * instant — which is what this check used to do — cannot fail whatever the
 * runtime does, and a finding kind no runtime state can produce does not
 * belong in a channel's vocabulary.
 *
 * Only the innermost open span is checked: an inner `given` is a descendant of
 * every outer one, so satisfying the innermost satisfies them all and reporting
 * against each would multiply one defect by its nesting depth.
 *
 * A span that never closes contributes nothing. That happens when the block
 * threw, and the clones that follow the throw are not the block's work; a
 * conservative silence there is the cost of not needing a `try/finally` on the
 * insert path.
 */
function blockFindings(
  events: readonly OwnershipEvent[],
  runtime: RuntimeTree,
): Finding[] {
  interface Span {
    label: string
    given: number
    findings: Finding[]
  }
  const open: Span[] = []
  const out: Finding[] = []
  const reported = new Set<string>()

  for (const event of events) {
    if (event.kind === "block-enter") {
      open.push({ label: event.label, given: event.scope, findings: [] })
      continue
    }
    if (event.kind === "block-exit") {
      // Resynchronise on the label: a throw inside a block leaves its span
      // open, and everything above the match is that abandoned work.
      let at = -1
      for (let i = open.length - 1; i >= 0; i--) {
        if (open[i].label === event.label) {
          at = i
          break
        }
      }
      if (at < 0) continue
      const closed = open.splice(at)
      out.push(...closed[0].findings)
      continue
    }
    // A `clone` is a template instantiation, an `enter` is a scope and an `own`
    // is a reactive node: all three are CONSTRUCTION inside the handed-over
    // span, and O2/O4.5 are the same claim about each. Checking only clones left
    // a Block that opened a scope in the wrong place invisible, which is the
    // shape every control-flow primitive has; checking only clones and scopes
    // left the whole EFFECT half invisible, which is the shape the compiled
    // attribute channel had — it emitted a `renderEffect` taking no scope at
    // all, so 34 of the corpus's fixtures bound their elements to whatever was
    // ambient and the trace said nothing, because it recorded no effect.
    if (
      (event.kind !== "clone" && event.kind !== "enter" && event.kind !== "own") ||
      open.length === 0
    ) {
      continue
    }
    const span = open[open.length - 1]
    const at = event.kind === "enter" ? (event.parent ?? -1) : event.scope
    if (span.given === -1 || at === -1 || within(runtime, at, span.given)) continue
    const key = `${span.label}@${span.given}@${at}@${event.label}`
    if (reported.has(key)) continue
    reported.add(key)
    const givenKind = runtime.scopes.get(span.given)?.kind ?? "?"
    const actual = runtimePath(runtime, at)
    const what =
      event.kind === "enter"
        ? `a ${event.label} scope`
        : event.kind === "own"
          ? `a ${event.label} effect`
          : event.label
    span.findings.push({
      id: `block-ran-under-another-scope@${span.label}`,
      rule: event.kind === "own" ? "O4.5" : "O2",
      kind: "block-ran-under-another-scope",
      detail:
        `${span.label} was given scope ${span.given} (${givenKind}) and built ${what} ` +
        `under scope ${at} (${actual === null ? "<no chain>" : show(actual.join("/"))}), ` +
        "which is neither that scope nor below it",
    })
  }
  return out
}

/**
 * O3.7: a scope entered inside the window is disposed before the window
 * closes. The harness disposes the render root inside the trace, so every scope
 * below it must come apart with it; one that does not is a scope nothing owns,
 * which is the O5 family's defect seen from the disposal end rather than the
 * construction end.
 */
function leakFindings(runtime: RuntimeTree): Finding[] {
  const out: Finding[] = []
  const seen = new Set<string>()
  for (const id of runtime.order) {
    const scope = runtime.scopes.get(id)
    if (scope === undefined || scope.disposedAt >= 0) continue
    const key = `scope-never-disposed@${scope.kind}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      id: key,
      rule: "O3.7",
      kind: "scope-never-disposed",
      detail:
        `scope ${id} (${scope.kind}, entered at ${scope.enteredAt}) was never disposed, although ` +
        "the trace window closes on the render root's own disposal; whatever it owns outlives " +
        "the tree it was built for",
    })
  }
  return out
}

/**
 * The half of the assertion that needs no compiler: the trace has to describe a
 * well-formed ownership tree on its own terms.
 *
 * Exported so a self-check can hand it a deliberately corrupted log. An
 * assertion nothing has ever been shown to fail is an assertion nobody has
 * tested, and this half is currently satisfied everywhere in the corpus — which
 * is either good news or a check that does nothing, and only a mutation tells
 * the two apart.
 */
export function checkTrace(
  events: readonly OwnershipEvent[],
  runtime: RuntimeTree = runtimeTree(events),
): { findings: Finding[]; cascades: number } {
  const findings: Finding[] = []
  let cascades = 0

  // --- runtime-internal invariants -----------------------------------------
  for (const scope of runtime.scopes.values()) {
    if (scope.parent === -1) continue
    const parent = runtime.scopes.get(scope.parent)
    if (parent === undefined) {
      findings.push({
        id: `parent-never-entered@${scope.kind}`,
        rule: "O2",
        kind: "parent-never-entered",
        detail: `scope ${scope.id} (${scope.kind}) names parent ${scope.parent}, which no enter event declared`,
      })
      continue
    }
    if (parent.enteredAt > scope.enteredAt) {
      findings.push({
        id: `child-entered-before-parent@${scope.kind}`,
        rule: "O2",
        kind: "child-entered-before-parent",
        detail: `scope ${scope.id} (${scope.kind}) entered at ${scope.enteredAt}, before its parent ${parent.id} at ${parent.enteredAt}`,
      })
    }
    if (runtimePath(runtime, scope.id) === null) {
      findings.push({
        id: `scope-chain-is-not-a-tree@${scope.kind}`,
        rule: "O2",
        kind: "scope-chain-is-not-a-tree",
        detail: `the parent chain above scope ${scope.id} (${scope.kind}) does not reach a root`,
      })
    }
  }

  // O4.1: `enter` and `exit` are two halves of one primitive and the pairing is
  // what restores `CURRENT`. `exit` events were recorded and never inspected,
  // so making `exit` a complete no-op cost this channel nothing at all.
  const opened: number[] = []
  const exited = new Set<number>()
  for (const event of events) {
    if (event.kind === "enter") {
      opened.push(event.scope)
      continue
    }
    if (event.kind !== "exit") continue
    if (exited.has(event.scope)) {
      findings.push({
        id: "exited-twice",
        rule: "O4.1",
        kind: "exited-twice",
        detail: `scope ${event.scope} raised a second exit at seq ${event.seq}`,
      })
      continue
    }
    exited.add(event.scope)
    const at = opened.lastIndexOf(event.scope)
    if (at < 0) {
      findings.push({
        id: "exit-without-enter",
        rule: "O4.1",
        kind: "exit-without-enter",
        detail: `scope ${event.scope} exited at seq ${event.seq} but no enter event declared it`,
      })
      continue
    }
    if (at !== opened.length - 1) {
      findings.push({
        id: "exits-interleaved",
        rule: "O4.1",
        kind: "exits-interleaved",
        detail:
          `scope ${event.scope} exited at seq ${event.seq} while ` +
          `${opened.slice(at + 1).join(", ")} were still open above it; ` +
          "an exit that is not the innermost open scope restores CURRENT to the wrong owner",
      })
    }
    opened.splice(at, 1)
  }
  // O4.1's other half: `exit` is required on BOTH paths, so a scope still open
  // when the window closes is a `CURRENT` that was never restored. Without this
  // an `exit` that does nothing at all costs the channel nothing at all.
  for (const scope of opened) {
    findings.push({
      id: "entered-without-exit",
      rule: "O4.1",
      kind: "entered-without-exit",
      detail:
        `scope ${scope} (${runtime.scopes.get(scope)?.kind ?? "?"}) was entered and never ` +
        "exited, so CURRENT was left pointing at it",
    })
  }

  for (const event of events) {
    if (event.kind === "dispose" && event.label === "repeat") {
      findings.push({
        id: "disposed-twice",
        rule: "O3.1",
        kind: "disposed-twice",
        detail: `scope ${event.scope} raised a second dispose at seq ${event.seq}; dispose must be idempotent and must record once`,
      })
    }
  }

  findings.push(...blockFindings(events, runtime))
  findings.push(...leakFindings(runtime))

  // O3.2: when a scope is disposed, the kids IT owns go in reverse creation
  // order. Two exclusions, both of them substance rather than convenience:
  //
  //   - a kid the parent does not HOLD the disposer for: a detached scope, or
  //     one created inside an effect and registered with the effect node. Its
  //     disposal is its holder's business — `map.ts` disposes rows in array
  //     order and that is the list's contract, not the scope's;
  //   - a kid disposed BEFORE its parent began is not part of the cascade at
  //     all. A branch that flips disposes its old instance while the parent is
  //     very much alive, and there is nothing out of order about that.
  //
  // What is left is exactly the claim: the kids the parent still owned when it
  // started unwinding come apart newest-first.
  const kids = new Map<number, number[]>()
  for (const id of runtime.order) {
    const scope = runtime.scopes.get(id)
    if (scope === undefined || scope.parent === -1 || !scope.owned) continue
    const list = kids.get(scope.parent)
    if (list === undefined) kids.set(scope.parent, [id])
    else list.push(id)
  }
  for (const [parentId, list] of kids) {
    const parent = runtime.scopes.get(parentId)
    if (parent === undefined || parent.disposedAt < 0) continue
    const cascade = list
      .map((id) => runtime.scopes.get(id))
      .filter((s): s is RuntimeScope => s !== undefined && s.disposedAt >= parent.disposedAt)
    if (cascade.length > 1) cascades++
    for (let i = 1; i < cascade.length; i++) {
      const earlier = cascade[i - 1]
      const later = cascade[i]
      if (later.disposedAt > earlier.disposedAt) {
        findings.push({
          id: `kids-disposed-in-creation-order@${parent.kind}`,
          rule: "O3.2",
          kind: "kids-disposed-in-creation-order",
          detail:
            `disposing scope ${parentId} took kid ${earlier.id} (created ${earlier.enteredAt}) at ` +
            `${earlier.disposedAt} before kid ${later.id} (created ${later.enteredAt}) at ` +
            `${later.disposedAt}; O3.2 requires reverse creation order`,
        })
      }
    }
  }

  return { findings, cascades }
}

/**
 * The `*.module.tsx` files a fixture imports, compiled. They are not fixtures —
 * `listOwnershipFixtures` excludes them — they exist so that ONE fixture can be
 * shaped like an application rather than like a single file.
 */
const SIBLING = /from\s+"\.\/([A-Za-z0-9._-]+\.module\.tsx)"/g

function siblingsOf(
  source: string,
  options: Record<string, unknown> = {},
): Array<{ name: string; code: string }> {
  const out: Array<{ name: string; code: string }> = []
  for (const [, name] of source.matchAll(SIBLING)) {
    const text = readFileSync(join(OWNERSHIP_DIR, name), "utf8")
    out.push({ name, code: native.transform(text, { filename: name, ...options }).code })
  }
  return out
}

/**
 * Check one fixture. `root` is the component the render drives, which is
 * `default` for every fixture the harness can call.
 */
export async function checkOwnership(
  fixture: string,
  source: string,
  filename: string,
  options: Record<string, unknown> = {},
  /**
   * Mutate the EMITTED module before it runs.
   *
   * M3 made the defect this channel exists for unrepresentable in the source:
   * `<P><C/></P>` and `<P>{() => <C/>}</P>` lower to the same Block, so the
   * source-level mutation that used to reintroduce it now changes nothing.
   * The only level at which "children, already built" can still be written is
   * the emitted text, so that is where a self-check has to write it.
   */
  corrupt?: (code: string) => string,
): Promise<OwnershipRun> {
  let code: string
  let tree: StaticTree
  try {
    ;({ code, tree } = staticTree(source, filename, options))
    if (corrupt !== undefined) code = corrupt(code)
  } catch (error) {
    return crash(fixture, "compile", error)
  }

  let events: readonly OwnershipEvent[]
  try {
    events = await trace(code, `own-${fixture}`, siblingsOf(source, options))
  } catch (error) {
    return crash(fixture, "render", error)
  }

  const runtime = runtimeTree(events)
  const internal = checkTrace(events, runtime)
  const findings: Finding[] = [...internal.findings]

  // --- 2. the static comparison -------------------------------------------
  const legal = legalPaths(tree, "default")
  let unattributed = 0
  let determined = 0
  let clones = 0
  const reported = new Set<string>()

  for (const event of events) {
    if (event.kind !== "clone") continue
    const positions = legal.get(event.label)
    if (positions === undefined) {
      unattributed++
      continue
    }
    const allowed = distinctPaths(positions)
    clones++
    // A template the compiler places at exactly one path is one this check can
    // actually falsify. Where a template occurs at several paths the check is
    // weaker by construction, and the count is reported rather than assumed.
    if (allowed.size === 1) determined++
    const actual = runtimePath(runtime, event.scope)
    const rule = ruleFor(tree, positions)
    if (actual === null) {
      const key = `orphan:${event.label}`
      if (!reported.has(key)) {
        reported.add(key)
        findings.push({
          id: `clone-outside-every-scope@${positions[0].template}`,
          rule,
          kind: "clone-outside-every-scope",
          detail:
            `${event.label} was cloned under no scope the trace knows; the compiler places it at ` +
            `${[...allowed].map(show).join(" or ")}`,
        })
      }
      continue
    }
    const joined = actual.join("/")
    if (allowed.has(joined)) continue
    const key = `${event.label}@${joined}`
    if (reported.has(key)) continue
    reported.add(key)
    findings.push({
      // The observed path is part of the identity, not only of the message.
      // One template misplaced at two different wrong paths is two violations,
      // and an id that named only the template would let the second land
      // inside the first's registry row and never be seen — the hazard this
      // id's own contract is written to prevent.
      id: `misplaced-clone@${positions[0].template}@${joined}`,
      rule,
      kind: "clone-under-a-scope-the-compiler-did-not-place-it-under",
      detail:
        `${event.label} was cloned under ${show(joined)}; the compiler places it at ` +
        `${[...allowed].map(show).join(" or ")} and nowhere else`,
    })
  }

  return {
    fixture,
    findings,
    unattributed,
    determined,
    clones,
    scopes: runtime.scopes.size,
    effects: events.reduce((n, event) => (event.kind === "own" ? n + 1 : n), 0),
    cascades: internal.cascades,
    crashed: false,
  }
}

function show(path: string): string {
  return path === "" ? "<no scope>" : path.split("/").join(" > ")
}

function crash(fixture: string, phase: string, error: unknown): OwnershipRun {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return {
    fixture,
    findings: [{ id: `${phase}-crashed`, rule: "<none>", kind: `${phase}-crashed`, detail: message }],
    unattributed: 0,
    determined: 0,
    clones: 0,
    scopes: 0,
    effects: 0,
    cascades: 0,
    crashed: true,
  }
}

// ---------------------------------------------------------------------------
// the corpora this channel runs over
// ---------------------------------------------------------------------------

/**
 * The L2b fixtures live in their own directory for the reason
 * `fixtures/semantics/` does: `oracle.test.ts` compares two implementations and
 * both are wrong on these, and `ssr.test.ts` asks for markup from a fixture
 * whose point is that it renders nothing. Keeping them out is what lets M0 add
 * fixtures without moving a single existing number.
 */
export function listOwnershipFixtures(): string[] {
  return readdirSync(OWNERSHIP_DIR)
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".module.tsx"))
    .map((f) => f.slice(0, -4))
    .sort()
}

export function ownershipSource(name: string): string {
  return readFileSync(join(OWNERSHIP_DIR, `${name}.tsx`), "utf8")
}

export function corpusFixtures(): string[] {
  return listFixtures()
}

export function corpusSource(name: string): string {
  return fixtureSource(name)
}
