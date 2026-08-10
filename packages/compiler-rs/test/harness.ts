import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { createRequire } from "node:module"

import {
  expectedAttributeOrder,
  normalizeChannels,
  resetIdentity,
  type DomChannels,
} from "./normalize.ts"
import {
  beginTrace,
  endTrace,
  liveTemplateAnchors,
  summarize,
  type Trace,
  type TraceSummary,
} from "./tracer.ts"

const require_ = createRequire(import.meta.url)

export const FIXTURE_DIR = join(import.meta.dir, "..", "fixtures")
const RUN = process.pid
/**
 * One generated-module directory PER PROCESS, and generated names carry the pid
 * inside it. The root `bun run test` starts several test processes over this
 * package at once, and a shared directory raced three ways over: a recursive
 * delete landing between a sibling process's `writeFileSync` and its `import`;
 * two processes minting `own-context-provider-0.tsx` at the same path, so one
 * imported the other's fixture and compared a render against the wrong module;
 * and — the one that survived per-process NAMES — bun's resolver refusing to
 * see a newly written file at all once another process is churning the same
 * directory. That last one was measured: the harness raised `Cannot find
 * module` on a path that `existsSync` reported present, five fresh names in a
 * row, with 1027 entries in the directory. A fresh name does not fix it; a
 * directory only this process writes to does.
 *
 * `TMP_DIR` stays ONE level under `test/`, because the L1 fixtures reach their
 * support module by relative path from where the generated file lands.
 */
export const TMP_DIR = join(import.meta.dir, `.tmp-${RUN}`)

/**
 * The oracle path never reaches the compiler, so the JSX it contains has to be
 * lowered by bun. The pragma pins the factory explicitly instead of relying on
 * whichever tsconfig.json happens to be nearest to the temp file.
 */
const PRAGMA = "/** @jsxImportSource @barqjs/core */\n"

export interface NativeTransformResult {
  code: string
  map?: string
  warnings: string[]
}

interface NativeCompiler {
  transform(
    code: string,
    options?: Record<string, unknown>,
  ): NativeTransformResult & { ownership?: string | null }
  opcodes(): string[]
  diagnosticCodes(): Array<{ code: string; level: string; summary: string; docs: string }>
}

/**
 * `BARQ_NATIVE` points the whole harness at a different build of the compiler.
 * L6 (`CODESIGN.md` §6) asks whether this suite would notice a wrong compiler
 * change, and the only honest way to answer it is to run the suite against a
 * compiler that really has been changed. `test/mutants.ts` builds one mutant
 * per optimisation pass out of a scratch copy of the crate and points this at
 * each in turn, so the experiment never writes to the source tree or to the
 * committed binding.
 */
function loadNative(): NativeCompiler {
  const mutant = process.env.BARQ_NATIVE
  if (mutant !== undefined && mutant !== "") return require_(mutant) as NativeCompiler
  try {
    return require_("../index.js") as NativeCompiler
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      "the harness needs the native binding, which is a build artifact and is not in git. " +
        "Run `bun run --cwd packages/compiler-rs build` (needs a Rust toolchain) and try again. " +
        `Underlying error: ${message}`,
    )
  }
}

const native = loadNative()

/**
 * The ONE resolved binding, exported so nothing has to re-require `../index.js`.
 *
 * A module that resolves its own binding is invisible to `BARQ_NATIVE`, and a
 * channel a mutant compiler never reaches cannot judge it: `ownership.ts` and
 * `diagnostics.test.ts` both did that, so `mutants.ts`'s survivor pass reported
 * "nothing in the project sees it" for two files that had been pointed at the
 * PRISTINE compiler all along. Measured: under an identity-transform stub the
 * L2b ownership banner came out byte-identical to the real build.
 */
export const nativeCompiler: NativeCompiler = native

/**
 * A step or event where the compiled path is deliberately MORE correct than the
 * oracle, with the exact DOM it must produce. Declaring one is not a licence to
 * differ: the harness fails if the compiled frame is not `compiled` byte for
 * byte, and fails if the oracle stopped differing (the note has gone stale).
 */
export interface CompilerWin {
  kind: "step" | "event"
  index: number
  compiled: string
  why: string
}

/**
 * What a fixture claims the compiler must eventually do to it. Behaviour is
 * `oracle.test.ts`'s job; this is the optimality half, declared next to the JSX
 * it is a claim about instead of hard-coded in a test file far away.
 */
export interface OptimalityExpectation {
  /** Which of the ten optimization targets this fixture is the proof of. */
  target: number
  /** The milestone that turns it on. `optimality.test.ts` holds the current one. */
  milestone: number
  /** Effects the compiled render must create. */
  effects?: number
  /** `_$template()` calls in the emitted module. */
  templates?: number
  /** `_$insert` + `_$setProp` + `_$spread` calls in the emitted module. */
  patchCalls?: number
  /** Substrings the emitted module must contain. */
  emits?: string[]
  /** Substrings it must not contain. */
  absent?: string[]
  /** Pairs `[first, second]` the emitted module must contain, in that order. */
  ordered?: Array<[string, string]>
}

export interface FixtureModule {
  default: () => unknown
  steps?: Array<() => void>
  events?: Array<(root: HTMLElement) => void>
  /** Frames the compiler is expected to get right where the oracle does not. */
  wins?: CompilerWin[]
  /**
   * Holes the compiler turns into live bindings that the oracle reads once
   * (O4 auto-thunking). Each entry lifts the effect-count and effect-run upper
   * bounds by one — the bound stays a bound, it does not disappear. Empty at
   * M2, because nothing is classified yet; M3 fills it per fixture.
   */
  goesLive?: string[]
  /** What the compiler must eventually make of this fixture. */
  optimality?: OptimalityExpectation
  /**
   * A markup difference the SSR backend is REQUIRED to have. DESIGN §5's opcode
   * table drops `Delegate`, `Listen` and `Ref` — a handler and a ref callback
   * are client-only, so a fixture whose DOM render only differs BECAUSE one of
   * them ran cannot match the string on the wire.
   *
   * It is not a licence to differ: `ssr.test.ts` fails if the SSR markup is not
   * `markup` byte for byte, and fails as STALE if the two paths stopped
   * differing at all — the same contract `wins` has on the DOM side.
   */
  ssrDiffers?: SsrDivergence
}

export interface SsrDivergence {
  /** The normalised markup the SSR path must produce. */
  markup: string
  why: string
}

export interface RenderResult {
  /** Normalized DOM after the initial render */
  html: string
  /** Normalized DOM after each scripted step, in order */
  frames: string[]
  /** Normalized DOM after each dispatched event, in order */
  eventFrames: string[]
  /**
   * The side channels for every frame the render produced, initial render
   * first, then the steps, then the events — the same order the `html`,
   * `frames` and `eventFrames` fields spell out separately.
   */
  channels: DomChannels[]
  /**
   * Per frame, the anchors the template clones still attached to the container
   * baked in — the EXACT number of `<!---->` nodes that frame is allowed to
   * hold. Zero for every frame on the oracle path, which never calls
   * `template()` at all.
   */
  expectedAnchors: number[]
  trace: TraceSummary
  /** Per-effect run counts, creation-ordered */
  runs: number[]
  /**
   * Everything this render CONSTRUCTED, not merely everything it left in the
   * container: the whole document at each frame, plus the markup of every
   * template clone the tracer recorded, attached or not.
   *
   * `emi.ts` decides liveness off this and nothing else. Reading the container
   * snapshots would have made the classification unsound in the dangerous
   * direction — a `<Portal>` renders into `document.body` and a subtree built
   * and torn down inside one step is never in any snapshot, so both would have
   * been called UNREACHED and then mutated.
   */
  seen: string
  /** As declared by the fixture module that produced this render. */
  wins: CompilerWin[]
  goesLive: string[]
  /** The compiled path's emitted module; absent on the oracle path. */
  code?: string
}

export interface Corruptions {
  /** Applied to the fixture source before the compiler sees it. */
  source?: (source: string) => string
  /** Applied to the compiler's emitted code. */
  emitted?: (code: string) => string
}

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

export function listFixtures(): string[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => f.slice(0, -4))
    .sort()
}

export function fixtureSource(name: string): string {
  return readFileSync(join(FIXTURE_DIR, `${name}.tsx`), "utf8")
}

export const BROWSER_ONLY_DIR = join(FIXTURE_DIR, "browser-only")

/**
 * Fixtures a FAKE DOM is structurally unable to judge, and which therefore
 * cannot live in the main corpus: happy-dom would report a divergence for a rule
 * it does not implement, and the initial-render invariant admits no exception.
 *
 * They are not parked and not skipped — the Chrome differential runs them beside
 * the rest of the corpus, against the same createElement oracle, with no
 * exception of any kind. A real browser is the only oracle that can judge them,
 * so it is the only one that does.
 */
export function listBrowserOnlyFixtures(): string[] {
  return readdirSync(BROWSER_ONLY_DIR)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => f.slice(0, -4))
    .sort()
}

export function browserOnlySource(name: string): string {
  return readFileSync(join(BROWSER_ONLY_DIR, `${name}.tsx`), "utf8")
}

export function compileBrowserOnly(name: string): string {
  return compileSource(browserOnlySource(name), `${name}.tsx`)
}

// ---------------------------------------------------------------------------
// compilation
// ---------------------------------------------------------------------------

/** Run a fixture through @barqjs/compiler-rs and return the emitted code. */
export function compileFixture(name: string, options: Record<string, unknown> = {}): string {
  return compileSource(fixtureSource(name), `${name}.tsx`, options)
}

const OPTIMALITY_DECLARATION = /\n?export const optimality = \{[\s\S]*?\n\}\n?/

/**
 * The fixture compiled WITHOUT its own optimality declaration. The declaration
 * is source like any other and reaches the emitted module, where `absent:
 * ["=>"]` would satisfy a search for `=>` and `$$click` in a needle would
 * satisfy a search for an expando. Every code-level assertion runs against
 * this; the differential harness runs the whole fixture, declaration included.
 */
export function compileFixtureBody(name: string, options: Record<string, unknown> = {}): string {
  const source = fixtureSource(name)
  const body = source.replace(OPTIMALITY_DECLARATION, "\n")
  if (body === source && source.includes("export const optimality")) {
    throw new Error(`${name} declares an optimality this regex no longer matches — fix the regex`)
  }
  return compileSource(body, `${name}.tsx`, options)
}

/**
 * The `Backend` trait's whole instruction set, by `Op` variant name, straight
 * off `codegen::backend::OPS` — the same macro list the trait, its dispatch and
 * every implementation are generated from. `interp.test.ts` checks the
 * reference backend's JS half against it in both directions.
 */
export function compilerOpcodes(): string[] {
  return native.opcodes()
}

/** The whole native result — code, sourcemap and warnings. */
export function compileFixtureRaw(
  name: string,
  options: Record<string, unknown> = {},
): NativeTransformResult {
  return native.transform(fixtureSource(name), { filename: `${name}.tsx`, ...options })
}

export function compileSource(
  source: string,
  filename: string,
  options: Record<string, unknown> = {},
): string {
  return native.transform(source, { filename, ...options }).code
}

/** The same, with the diagnostics — the SSR fallback is announced through them. */
export function compileSourceRaw(
  source: string,
  filename: string,
  options: Record<string, unknown> = {},
): NativeTransformResult {
  return native.transform(source, { filename, ...options })
}

// ---------------------------------------------------------------------------
// module loading
// ---------------------------------------------------------------------------

/**
 * Shared across module registries, because bun gives each test FILE its own and
 * a per-registry counter would mint the same path twice. The reset below is
 * guarded by the same object: a file that top-level-awaits lets bun start
 * loading the next one, so a second `resetTmp()` used to run — and delete the
 * modules the first file was still importing — halfway through the first.
 */
const SHARED = Symbol.for("barq.compiler-rs.harness.tmp")
const shared = ((globalThis as Record<symbol, unknown>)[SHARED] ??= {
  seq: 0,
  prepared: false,
  live: [] as string[],
}) as { seq: number; prepared: boolean; live: string[] }

/**
 * How many generated modules stay on disk. Bounded, and the bound is not
 * cosmetic: past roughly five thousand entries in this directory bun stops
 * resolving newly written files in it, and the harness fails with
 * `Cannot find module` on a path it wrote a microsecond earlier. Deep enough
 * that a stack trace out of a failing fixture still points at a file that
 * exists.
 */
const KEEP = 512

function retire(): void {
  while (shared.live.length > KEEP) {
    const stale = shared.live.shift()
    if (stale === undefined) return
    try {
      rmSync(stale, { force: true })
    } catch {
      // Untidy, never fatal.
    }
  }
}

/**
 * Whole directories left by a run that died before its own ring drained.
 * Ownership is read off the directory name, and one is only removed when the
 * process that wrote it is gone: a sibling started by the root `bun run test`
 * is very much alive, and its modules must survive.
 *
 * `.tmp` with no pid is the shared directory this harness used before it went
 * per-process; it is removed once nothing has touched it for ten minutes.
 */
function sweepAbandoned(): void {
  const cutoff = Date.now() - 10 * 60 * 1000
  const root = import.meta.dir
  for (const name of readdirSync(root)) {
    if (!name.startsWith(".tmp")) continue
    const path = join(root, name)
    if (path === TMP_DIR) continue
    try {
      if (name === ".tmp") {
        if (statSync(path).mtimeMs < cutoff) rmSync(path, { recursive: true, force: true })
        continue
      }
      const owner = Number.parseInt(name.slice(".tmp-".length), 10)
      if (!Number.isNaN(owner) && alive(owner)) continue
      rmSync(path, { recursive: true, force: true })
    } catch {
      // Untidy, never fatal.
    }
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function resetTmp(): void {
  // A directory under this pid can only be a dead run's, since pids are reused.
  rmSync(TMP_DIR, { recursive: true, force: true })
  mkdirSync(TMP_DIR, { recursive: true })
  sweepAbandoned()
  // Without this the generated modules show up as untracked files after any
  // test run. `*` covers the file itself, so the directory reads as empty.
  writeFileSync(join(TMP_DIR, ".gitignore"), "*\n")
}
if (!shared.prepared) {
  shared.prepared = true
  resetTmp()
}

/**
 * A fresh module identity per load: fixtures keep their signals at module
 * scope, so the oracle render and the compiled render must not share state.
 *
 * Exported because the SSR conformance suite loads the same two modules for a
 * different kind of render, and a second copy of this would be a second answer
 * to "did these two renders share a signal".
 */
export async function loadModule(code: string, tag: string): Promise<FixtureModule> {
  for (let attempt = 0; ; attempt++) {
    const id = `${RUN}-${tag}-${shared.seq++}`
    const file = join(TMP_DIR, `${id}.tsx`)
    // bun 1.4.0 keys its in-process transpiled-source cache by a hash of the
    // source and compares by hash ALONE, so two generated modules can be served
    // each other's code — silently, with a plausible namespace object. The stamp
    // makes the import verifiable; the padding makes the re-mint hash otherwise.
    writeFileSync(
      file,
      `${PRAGMA}export const __module = ${JSON.stringify(id)};${" ".repeat(attempt)}\n${code}`,
    )
    shared.live.push(file)
    retire()

    let mod: (FixtureModule & { __module?: string }) | undefined
    try {
      mod = (await import(file)) as FixtureModule & { __module?: string }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // bun's resolver can miss a file it has on disk once another process is
      // churning the same directory. A fresh name resolves; the same one does
      // not, so this re-mints rather than retrying the import.
      if (!message.includes("Cannot find module")) throw error
      if (attempt === 4) {
        throw new Error(
          `bun could not resolve ${file} five times over, and the file ` +
            `${existsSync(file) ? "IS" : "is NOT"} on disk (${readdirSync(TMP_DIR).length} entries ` +
            `in the directory). Underlying error: ${message}`,
        )
      }
      continue
    }

    if (mod.__module === id) return mod
    if (attempt === 4) {
      throw new Error(
        `bun evaluated ${file} as ${mod.__module ?? "a module carrying no stamp"} five times over: ` +
          "its in-process source cache keys transpiled output by a hash of the source and compares " +
          "by hash alone, so two generated modules are served each other's code.",
      )
    }
  }
}

/**
 * A compiled module written beside the generated one under its OWN basename, so
 * a fixture's `import { Card } from "./own-card.tsx"` resolves. Every fixture in
 * the corpus is a single file, which is the arrangement in which the ownership
 * channel's static tree is total; a fixture that imports a component is the
 * arrangement in which it is not, and the degradation has to be exercised
 * rather than assumed away.
 */
export function writeSibling(name: string, code: string): void {
  writeFileSync(join(TMP_DIR, name), PRAGMA + code)
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

async function settle(): Promise<void> {
  const core = await import("@barqjs/core")
  core.flush()
  // Portal and friends defer their work with queueMicrotask; two turns of the
  // event loop covers a microtask that queues another microtask.
  await new Promise((r) => setTimeout(r, 0))
  core.flush()
  await new Promise((r) => setTimeout(r, 0))
}

/**
 * Exported because the L3 drivers that are not the corpus — the JSX generator
 * and the EMI mutator — produce SOURCE rather than a fixture name, and a second
 * copy of this loop would be a second answer to what a frame is.
 */
/**
 * The markup of one template clone, wherever it ended up. A clone that was
 * built, attached and torn down again inside a single step never appears in any
 * frame, and it was still constructed — which is the question EMI is asking.
 */
function markupOf(node: Node): string {
  const element = node as { outerHTML?: string }
  if (typeof element.outerHTML === "string") return element.outerHTML
  return [...node.childNodes].map((child) => markupOf(child)).join("")
}

export async function renderModule(mod: FixtureModule): Promise<RenderResult> {
  const core = await import("@barqjs/core")

  const container = document.createElement("div")
  document.body.appendChild(container)

  // Node identity is stamped on first sight, so the ordinals only line up
  // between the two paths when both renders start their numbering at zero.
  resetIdentity()

  const trace: Trace = beginTrace()
  let dispose: (() => void) | undefined

  const channels: DomChannels[] = []
  const expectedAnchors: number[] = []
  const seen: string[] = []
  const snapshot = (): string => {
    const frame = normalizeChannels(container)
    channels.push(frame)
    // Read at the same instant as the DOM it is the expectation for: a clone
    // that has since been detached, or one built after this frame, is not part
    // of what this frame is allowed to contain.
    expectedAnchors.push(liveTemplateAnchors(trace, container))
    // The whole document, not the container: a `<Portal>` renders somewhere
    // else entirely and is still very much reached.
    seen.push(document.body.innerHTML)
    return frame.html
  }

  try {
    core.createScope((d: () => void) => {
      dispose = d
      // C1: the default export is a component and takes the scope it runs
      // under, so `render` is handed the BLOCK and opens that scope itself.
      // Calling it here would construct the subtree before any scope existed —
      // the argument form the whole redesign exists to remove.
      core.render(mod.default as never, container)
    }, true)

    await settle()
    const html = snapshot()

    const frames: string[] = []
    for (const step of mod.steps ?? []) {
      step()
      await settle()
      frames.push(snapshot())
    }

    // Events go through the real DOM, so a compiled path that never binds a
    // handler diverges here and nowhere else. The container stays attached to
    // document.body for the whole render because delegated handlers only fire
    // once the event reaches document.
    const eventFrames: string[] = []
    for (const dispatch of mod.events ?? []) {
      dispatch(container)
      await settle()
      eventFrames.push(snapshot())
    }

    return {
      html,
      frames,
      eventFrames,
      channels,
      expectedAnchors,
      trace: summarize(trace),
      runs: trace.effects.map((e) => e.runs),
      seen: [...seen, ...trace.templates.map((instance) => markupOf(instance.node))].join("\n"),
      wins: mod.wins ?? [],
      goesLive: mod.goesLive ?? [],
    }
  } finally {
    endTrace()
    dispose?.()
    container.remove()
    // Portal targets default to document.body; leaving them attached would leak
    // into the next fixture's snapshot.
    document.body.innerHTML = ""
    // The runtime's installed-delegated-events set is MODULE state: it outlives
    // every scope and both renders share it. Without this the compiled render
    // free-rides on the listener the oracle's createElement path installed, and
    // dropping the emitted `_$delegateEvents([...])` altogether leaves every
    // behavioural test green — target #7 becomes unfalsifiable. Tearing it down
    // makes each render install what it actually asked for.
    core.clearDelegatedEvents()
  }
}

/**
 * The fixture's own optimality claim. Loading the module evaluates it, which
 * only ever creates module-scope signals — the component is not called.
 */
export async function fixtureOptimality(name: string): Promise<OptimalityExpectation | undefined> {
  const mod = await loadModule(fixtureSource(name), `declaration-${name}`)
  return mod.optimality
}

/** The specification: JSX lowered to createElement() against the real runtime. */
export async function renderViaRuntime(name: string): Promise<RenderResult> {
  const mod = await loadModule(fixtureSource(name), `oracle-${name}`)
  return renderModule(mod)
}

/**
 * The thing under test: JSX lowered by @barqjs/compiler-rs.
 *
 * `options` reaches the native transform unchanged, which is how the L3
 * differential renders the same fixture at `-O0` and at `-Ox`. The tag carries
 * the options so two levels of one fixture never share a generated module.
 */
export async function renderViaCompiler(
  name: string,
  corrupt: Corruptions = {},
  options: Record<string, unknown> = {},
): Promise<RenderResult> {
  const source = corrupt.source ? corrupt.source(fixtureSource(name)) : fixtureSource(name)
  let code = compileSource(source, `${name}.tsx`, options)
  if (corrupt.emitted) code = corrupt.emitted(code)
  const tag =
    Object.keys(options).length === 0
      ? "compiled"
      : `${options.interp ? "interp" : "compiled"}-O${options.optimize ?? "x"}`
  const mod = await loadModule(code, `${tag}-${name}`)
  return { ...(await renderModule(mod)), code }
}

/**
 * The reference backend (`CODESIGN.md` §6 L2): the SAME analysed IR the DOM
 * backend consumes, serialised beside the module and walked by
 * `@barqjs/core/interp` instead of printed as JavaScript.
 */
export async function renderViaInterp(
  name: string,
  corrupt: Corruptions = {},
  options: Record<string, unknown> = {},
): Promise<RenderResult> {
  return renderViaCompiler(name, corrupt, { interp: true, ...options })
}

/**
 * Apply the fixture's scripted signal updates, snapshotting the DOM after each.
 * Exposed separately so a caller can drive one path on its own; the comparison
 * helpers below drive both.
 */
export async function drive(name: string, via: "runtime" | "compiler"): Promise<RenderResult> {
  return via === "runtime" ? renderViaRuntime(name) : renderViaCompiler(name)
}

// ---------------------------------------------------------------------------
// comparison
// ---------------------------------------------------------------------------

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0
}

// ---------------------------------------------------------------------------
// reading the emitted module exactly
// ---------------------------------------------------------------------------

/**
 * The emitted module with every string literal, template literal, regex literal
 * and comment blanked out — same length, so offsets still line up, but nothing
 * a fixture WROTE can be mistaken for something the compiler EMITTED.
 *
 * Substring-counting the whole module is not a bound, it is a coincidence: a
 * fixture whose source contains the characters `_$insert(` (in a doc comment,
 * in a string it renders) raises the hole count and buys marker slack it never
 * earned. Target #9 is the milestone that turns that count into an assertion,
 * so it has to be exact before elision lands.
 */
/**
 * Whether the `/` at `at` belongs to a JSX tag rather than opening a regex.
 *
 * The regex heuristic below asks what the last significant character was, and
 * JSX has two shapes it answers wrongly. `</div>` puts the `/` after a `<`,
 * which is not in the "cannot precede a regex" class, so the scanner blanked
 * from there to the next closing tag and DESYNCED everything after it — over the
 * fixture corpus that moved the intrinsic-element count in 86 of 117 files, hid
 * a real `<span ref={…}>` from `emi.ts`, and invented two candidates inside a
 * string literal. `<div a={b} />` and `<div a="x" />` are the same bug with `}`
 * and `"` in front. Neither can be a division, so the discriminator is the `>`
 * that follows.
 */
function closesAJsxTag(code: string, at: number, previous: string): boolean {
  if (code[at - 1] === "<") return true
  return code[at + 1] === ">" && (previous === "}" || previous === '"' || previous === "'")
}

export function stripLiterals(code: string): string {
  const out = code.split("")
  const blank = (from: number, to: number): void => {
    for (let i = from; i < to && i < out.length; i++) if (out[i] !== "\n") out[i] = " "
  }

  let i = 0
  let inTemplate = false
  let braces = 0
  /** Brace depth each open `${` was entered at, so its `}` is identifiable. */
  const interpolations: number[] = []
  // The last significant character, which is what says whether a `/` opens a
  // regex or divides. Emitted code has no regex literals today; fixture source
  // may, and it reaches the module verbatim.
  let previous = ""

  while (i < code.length) {
    const ch = code[i]

    if (inTemplate) {
      if (ch === "\\") {
        blank(i, i + 2)
        i += 2
        continue
      }
      if (ch === "`") {
        inTemplate = false
        previous = "`"
        i++
        continue
      }
      if (ch === "$" && code[i + 1] === "{") {
        interpolations.push(braces)
        inTemplate = false
        previous = "{"
        i += 2
        continue
      }
      blank(i, i + 1)
      i++
      continue
    }

    if (ch === "/" && code[i + 1] === "/") {
      const end = code.indexOf("\n", i)
      const stop = end === -1 ? code.length : end
      blank(i, stop)
      i = stop
      continue
    }
    if (ch === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2)
      const stop = end === -1 ? code.length : end + 2
      blank(i, stop)
      i = stop
      continue
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1
      while (j < code.length && code[j] !== ch) j += code[j] === "\\" ? 2 : 1
      blank(i + 1, j)
      i = j + 1
      previous = ch
      continue
    }
    if (ch === "`") {
      inTemplate = true
      i++
      continue
    }
    if (ch === "{") {
      braces++
      previous = ch
      i++
      continue
    }
    if (ch === "}") {
      if (interpolations.length > 0 && braces === interpolations[interpolations.length - 1]) {
        interpolations.pop()
        inTemplate = true
        i++
        continue
      }
      braces--
      previous = ch
      i++
      continue
    }
    if (ch === "/" && !closesAJsxTag(code, i, previous) && previous !== "" && !/[\w$)\]]/.test(previous)) {
      let j = i + 1
      let inClass = false
      while (j < code.length) {
        if (code[j] === "\\") {
          j += 2
          continue
        }
        if (code[j] === "[") inClass = true
        else if (code[j] === "]") inClass = false
        else if (code[j] === "/" && !inClass) break
        j++
      }
      blank(i + 1, j)
      i = j + 1
      previous = "/"
      continue
    }

    if (!/\s/.test(ch)) previous = ch
    i++
  }

  return out.join("")
}

/** Call sites of one emitted helper, counted off the code and nothing else. */
export function emittedCalls(code: string, name: string): number {
  return countMatches(stripLiterals(code), new RegExp(`_\\$+${name}\\(`, "g"))
}

/**
 * The markup inside each `_$template(`…`)` call. `_\$+`, not `_\$`: a fixture
 * whose own source contains `_$` shifts every emitted uid to `_$$`.
 */
export function templateHtml(code: string): string[] {
  return [...code.matchAll(/_\$+template\(`([^`]*)`/g)].map((m) => m[1])
}

/**
 * Insert anchors baked into a template's HTML, counted at TEXT positions only.
 * `<div data-note="<!---->">` carries the characters and not the node, and a
 * substring count cannot tell the two apart — which is the whole difference
 * between a bound and a coincidence once target #9 starts removing anchors.
 */
export function countTemplateAnchors(html: string): number {
  let anchors = 0
  let i = 0
  while (i < html.length) {
    if (html[i] !== "<") {
      i++
      continue
    }
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4)
      const stop = end === -1 ? html.length : end + 3
      if (html.slice(i, stop) === "<!---->") anchors++
      i = stop
      continue
    }
    i++
    let quote = ""
    while (i < html.length) {
      const ch = html[i]
      if (quote !== "") {
        if (ch === quote) quote = ""
      } else if (ch === '"' || ch === "'") {
        quote = ch
      } else if (ch === ">") {
        i++
        break
      }
      i++
    }
  }
  return anchors
}

/** Every anchor the module's templates bake in, across all of them. */
export function templateAnchors(code: string): number {
  return templateHtml(code).reduce((n, html) => n + countTemplateAnchors(html), 0)
}

/**
 * `clonesEachTemplateOnce` and `DEGRADED_MARKER_LAYOUT` used to live here: a
 * syntactic guess at whether a module clones each of its templates once, and the
 * list of seven fixtures the guess had to give up on. A module it gave up on
 * dropped to "a module whose templates bake no anchor cannot produce one", which
 * is not a check at all for a module that bakes one — and
 * `component-boundary-props`, the fixture the exclusion was written for, bakes
 * one. Both are gone: `tracer.ts` wraps `template` and records the node every
 * clone produces, so the anchors a frame may hold are the anchors of the clones
 * attached to it, exactly, for every module. See `RenderResult.expectedAnchors`.
 */

export interface AnchorAudit {
  /** Anchors baked into the emitted templates. */
  baked: number
  /** Of those, the ones an `_$insert` call actually passes as its anchor. */
  used: number
  /** Anchors nothing references. Target #9 says this is always zero. */
  unused: number
  /** `_$insert` anchors the walk resolver could not follow — a stale scanner. */
  unresolved: number
}

/**
 * Which baked anchors are load-bearing, by following the emitted walks.
 *
 * Before target #9 landed, every hole had an anchor and `anchors <= holes` was a
 * usable bound. It is not one any more: elision removes anchors, so a module can
 * carry a spurious one and still satisfy every count — the anchor makes it into
 * the DOM, where `normalize.ts` rule 4 renders it invisible, and the totals match
 * on both sides. Nothing in the harness could see it.
 *
 * What is exact is the structural fact: an anchor exists to be handed to
 * `insert` as the node to insert before. So the templates are parsed, each
 * `const _elN = _elM.firstChild…` chain is resolved against them, and every
 * anchor that no `_$insert` names is a bug — either a marker elision missed or a
 * marker emitted for nothing.
 *
 * Needs a DOM, so it runs under `bun test` and not from the CLI scripts.
 */
export function auditAnchors(code: string): AnchorAudit {
  if (typeof document === "undefined") throw new Error("auditAnchors needs a DOM")

  const roots = new Map<string, Node>()
  for (const match of code.matchAll(/(_tmpl\$+\d+) = [^;]*?_\$+template\(`([^`]*)`(,\s*true)?\)/g)) {
    const host = document.createElement("template")
    host.innerHTML = match[3]
      ? `<svg xmlns="http://www.w3.org/2000/svg">${match[2]}</svg>`
      : match[2]
    const root = host.content.firstChild
    if (root) roots.set(match[1], root)
  }

  // A module carrying templates that this scanner cannot read is a FAILURE, not
  // a clean bill: every count below would come back zero and the corpus-wide
  // `unused === 0` assertion would pass over a module nobody looked at.
  if (roots.size === 0 && templateHtml(code).length > 0) {
    throw new Error("auditAnchors could not read this module's templates — the scanner has gone blind")
  }

  const bound = new Map<string, Node>()
  const stripped = stripLiterals(code)
  for (const line of stripped.split("\n")) {
    const fromTemplate = line.match(/(_el\$+\d+) = (_tmpl\$+\d+)\(\)/)
    if (fromTemplate) {
      const root = roots.get(fromTemplate[2])
      if (root) bound.set(fromTemplate[1], root)
      continue
    }
    const walk = line.match(
      /(_el\$+\d+) = (_el\$+\d+)((?:\.(?:firstChild|lastChild|nextSibling|previousSibling))+)/,
    )
    if (!walk) continue
    let node: Node | null | undefined = bound.get(walk[2])
    for (const hop of walk[3].split(".").filter(Boolean)) {
      if (!node) break
      node = (node as unknown as Record<string, Node | null>)[hop]
    }
    if (node) bound.set(walk[1], node)
  }

  const used = new Set<Node>()
  let unresolved = 0
  for (const call of insertCalls(stripped)) {
    // `_$insert($s, parent, value, anchor)` — the scope is first (§3.3 C6), so
    // the anchor is the FOURTH argument.
    if (call.length < 4) continue
    const name = call[3].trim()
    if (!/^_el\$+\d+$/.test(name)) continue
    const node = bound.get(name)
    if (!node) {
      unresolved++
      continue
    }
    used.add(node)
  }

  let baked = 0
  let usedAnchors = 0
  for (const root of new Set(roots.values())) {
    for (const node of anchorsIn(root)) {
      baked++
      if (used.has(node)) usedAnchors++
    }
  }
  return { baked, used: usedAnchors, unused: baked - usedAnchors, unresolved }
}

function anchorsIn(root: Node): Node[] {
  const out: Node[] = []
  const visit = (node: Node): void => {
    if (node.nodeType === 8 && (node as Comment).data === "") out.push(node)
    for (const child of Array.from(node.childNodes)) visit(child)
    const content = (node as HTMLTemplateElement).content
    if (content instanceof DocumentFragment) for (const child of Array.from(content.childNodes)) visit(child)
  }
  visit(root)
  return out
}

/** The top-level argument text of every `_$insert(...)` call. */
function insertCalls(stripped: string): string[][] {
  const calls: string[][] = []
  const opener = /_\$+insert\(/g
  for (let match = opener.exec(stripped); match !== null; match = opener.exec(stripped)) {
    const args: string[] = []
    let depth = 1
    let start = match.index + match[0].length
    let i = start
    for (; i < stripped.length && depth > 0; i++) {
      const ch = stripped[i]
      if (ch === "(" || ch === "[" || ch === "{") depth++
      else if (ch === ")" || ch === "]" || ch === "}") depth--
      else if (ch === "," && depth === 1) {
        args.push(stripped.slice(start, i))
        start = i + 1
        continue
      }
      if (depth === 0) args.push(stripped.slice(start, i))
    }
    calls.push(args)
  }
  return calls
}

/**
 * The body of every `_$renderEffect(...)` in the module, by balanced
 * parentheses rather than by indentation — an indentation-anchored scan reports
 * ZERO groups on a nested emit and a corpus-wide `groups > 0` cannot tell that
 * apart from a module with no groups at all.
 */
export function renderEffectBodies(code: string): string[] {
  const bodies: string[] = []
  const opener = /_\$+renderEffect\(/g
  for (let match = opener.exec(code); match !== null; match = opener.exec(code)) {
    let depth = 0
    let end = match.index + match[0].length - 1
    do {
      if (code[end] === "(") depth++
      else if (code[end] === ")") depth--
      end++
    } while (depth > 0 && end < code.length)
    bodies.push(code.slice(match.index, end))
  }
  return bodies
}

/**
 * Elements each emitted effect group writes to. Target #4 merges a contiguous
 * run of live props on ONE element; merging across elements produces identical
 * DOM and FEWER effects, so no bound in the differential harness can see it.
 */
export function groupTargets(code: string): string[][] {
  return renderEffectBodies(code).map((body) => [
    // `setProp` takes the SCOPE first (§3.3 C6), so the element it writes is
    // the second argument.
    ...new Set(
      [...body.matchAll(/_\$+setProp\([^,]+,\s*(_el\$+\d+)/g)].map((m) => m[1]),
    ),
  ])
}

/**
 * `setProp` keys that write an attribute under a different name. Everything
 * else in the set is either an attribute of the same name or a property, and a
 * property name can never collide with an attribute name in the channel below
 * because the channel only ever looks at names the DOM actually reported.
 */
const ATTRIBUTE_ALIASES: Record<string, string> = { classList: "class" }

/**
 * The props the emitted module applies AFTER the clone, by attribute name.
 *
 * Exported because the Chrome differential needs the same partition, and it is
 * computed from the emitted CODE — so it is read once in node, at page-build
 * time, and shipped into the browser as a list of names.
 */
export function patchedAttributeNames(code: string): Set<string> {
  const names = new Set<string>()
  // `_\$+`, not `_\$`: a fixture whose own source contains `_$` makes the
  // compiler shift every emitted uid to `_$$` (hygiene), and a scanner pinned to
  // one prefix would silently see no patches at all.
  // `setProp($s, el, key, value)` — the scope is first (CODESIGN §3.3 C6), so
  // the key is the THIRD argument.
  for (const match of code.matchAll(/_\$+setProp\([^,]+,[^,]+,\s*"([^"]+)"/g)) {
    const name = match[1]
    names.add(ATTRIBUTE_ALIASES[name] ?? name)
  }
  return names
}

export interface Divergence {
  kind:
    | "initial-dom"
    | "step-dom"
    | "step-count"
    | "event-dom"
    | "event-count"
    | "effect-count"
    | "effect-runs"
    | "marker-count"
    | "attribute-order"
    | "node-identity"
  step?: number
  oracle: string
  compiled: string
  message: string
}

export interface Comparison {
  ok: boolean
  divergences: Divergence[]
  /** Declared wins that actually materialised, in fixture order. */
  wins: CompilerWin[]
  /** Negative means the compiled output created fewer effects — a win. */
  effectDelta: number
  runDelta: number
  oracle: RenderResult
  compiled: RenderResult
}

export interface EffectBoundInput {
  oracleCreated: number
  compiledCreated: number
  oracleTotalRuns: number
  compiledTotalRuns: number
  /** Per-effect run counts, creation-ordered, one array per path. */
  oracleRuns: number[]
  compiledRuns: number[]
  /** As declared by the fixture: one entry per auto-thunked hole. */
  goesLive: string[]
  /** Initial render plus every scripted step and dispatched event. */
  frames: number
  /**
   * Target #4's grouping, measured off the emitted module rather than inferred
   * from the effect-count delta: how many compiled effects can legitimately run
   * on a UNION of triggers. Merging k props into one effect removes k-1 effects
   * but yields exactly ONE that runs on the union, so at k >= 3 the delta
   * excuses merge results that do not exist and an unrelated per-frame effect
   * rides in on the surplus.
   */
  merges: number
}

/** `renderEffect`s covering two or more props, counted off the emitted module. */
export function countMerges(code: string): number {
  return renderEffectBodies(code).filter(
    (body) => countMatches(body, /_\$+setProp\(/g) >= 2,
  ).length
}

/**
 * The effect bound, whole. Pure so it can be driven with numbers no fixture
 * would produce today — M3 is the milestone that makes this arithmetic the
 * proof of target #1, and it has to be right before the passes land.
 *
 * Fewer effects than the oracle is the entire point of the compiler, so only
 * the upper bound is an error, and DOM equality across every frame is what
 * keeps a low count from meaning "a binding went missing".
 *
 * `goesLive` LIFTS the bound, never removes it. Compiler-mode auto-thunking
 * (O4) makes `{count()}` a live binding where the oracle reads it once, so one
 * declared hole buys exactly one extra effect, which may re-run once per frame
 * and no more. Everything else stays bounded by the oracle.
 */
export function boundEffects(input: EffectBoundInput): Divergence[] {
  const divergences = bound(input, input.goesLive.length)

  // A goesLive entry that is not doing any work is the same failure mode as a
  // stale win: it silently and permanently loosens the bound. Mirror the check.
  //
  // Stated as "would the bound still be clean with one fewer declared hole",
  // not as arithmetic on the effect counts. The arithmetic version cannot be
  // made to work: EVERY optimization the compiler performs — target #1 dropping
  // an effect the oracle created for a provably-static expression, target #3
  // folding a prop into the template, target #4 coalescing — lowers the compiled
  // count, and each one eats into the excess that a live hole is supposed to be
  // evidenced by. A fixture that auto-thunks one hole and also proves one prop
  // static has an excess of ZERO with a perfectly load-bearing declaration.
  //
  // Asking the bound itself is exact by construction and stays exact as later
  // milestones add relaxations beside it.
  const slack = input.goesLive.length
  if (slack > 0) {
    let needed = 0
    while (needed < slack && bound(input, needed).length > 0) needed++
    if (needed < slack) {
      divergences.push({
        kind: "effect-count",
        oracle: String(needed),
        compiled: String(slack),
        message:
          `stale goesLive declaration: ${slack} hole(s) declared live, but the bound is already ` +
          `clean with ${needed} (${input.goesLive.join(", ")})`,
      })
    }
  }

  return divergences
}

function bound(input: EffectBoundInput, slack: number): Divergence[] {
  const divergences: Divergence[] = []
  const busiest = (runs: number[]): number => runs.reduce((n, r) => Math.max(n, r), 0)

  const countExcess = input.compiledCreated - input.oracleCreated
  if (countExcess > slack) {
    divergences.push({
      kind: "effect-count",
      oracle: String(input.oracleCreated + slack),
      compiled: String(input.compiledCreated),
      message: slack
        ? `compiled output created more effects than the oracle plus its ${slack} declared live hole(s)`
        : "compiled output created MORE effects than the un-compiled runtime",
    })
  }

  // One live hole costs ONE extra effect, but that effect RE-RUNS once per
  // frame the fixture drives, so the run allowance scales with the number of
  // frames. A flat `+ slack` fires on the first M3 fixture that declares one.
  const runSlack = slack * input.frames
  if (input.compiledTotalRuns > input.oracleTotalRuns + runSlack) {
    divergences.push({
      kind: "effect-runs",
      oracle: String(input.oracleTotalRuns + runSlack),
      compiled: String(input.compiledTotalRuns),
      message: "compiled output ran effects MORE times than the un-compiled runtime",
    })
  }

  // The aggregate above hides one binding that re-runs on every frame whenever
  // some other binding runs fewer times, so the busiest effect is bounded
  // separately. Creation order is not comparable across the two paths, so the
  // comparison is rank by rank on the descending run counts.
  //
  // Two kinds of compiled effect are allowed to run once per frame rather than
  // being held to the busiest ORACLE effect, and both are visible in the
  // counts, so neither has to be taken on trust:
  //
  //  - a declared live hole (`goesLive`, O4 auto-thunking) — `slack` of them;
  //  - a COALESCED effect. Target #4 puts every dynamic prop of an element in
  //    one renderEffect, so that effect necessarily runs on the UNION of their
  //    triggers where the oracle ran one effect per prop.
  //
  // The allowance is the number of multi-prop `renderEffect`s the module
  // actually emitted, counted off the code. It used to be the effect-count
  // delta, which is a DIFFERENT number: merging k props removes k-1 effects but
  // yields exactly one that runs on the union, so at k >= 3 the delta excused
  // merge results that do not exist and an unrelated per-frame effect rode in
  // on the surplus — invisibly, because equal total runs kept the aggregate
  // bound quiet too.
  //
  // Everything below those ranks is still bounded by the busiest oracle effect,
  // and the total-run bound above is untouched — a coalesced effect that runs
  // once per frame still does strictly less total work than the effects it
  // replaced, which is the invariant that matters.
  //
  // LIMIT: the count is module-wide, not per element, so the allowance is not
  // attributed to the specific effect that over-ran. Tightening that needs the
  // group headers from the IR, not just the emitted text.
  const oracleBusiest = busiest(input.oracleRuns)
  const liveAllowance = Math.max(oracleBusiest, input.frames)
  const relaxed = slack + input.merges
  const ranked = [...input.compiledRuns].sort((a, b) => b - a)
  for (let rank = 0; rank < ranked.length; rank++) {
    const allowed = rank < relaxed ? liveAllowance : oracleBusiest
    if (ranked[rank] <= allowed) continue
    divergences.push({
      kind: "effect-runs",
      oracle: String(allowed),
      compiled: String(ranked[rank]),
      message:
        rank < slack
          ? `a declared live hole re-ran ${ranked[rank]} times across ${input.frames} frame(s)`
          : rank < relaxed
            ? `a coalesced effect re-ran ${ranked[rank]} times across ${input.frames} frame(s)`
            : "one compiled effect re-ran more times than the busiest oracle effect",
    })
    break
  }

  return divergences
}

export async function compareToOracle(
  name: string,
  corrupt: Corruptions = {},
): Promise<Comparison> {
  const oracle = await renderViaRuntime(name)
  const compiled = await renderViaCompiler(name, corrupt)

  const divergences: Divergence[] = []
  const wins: CompilerWin[] = []

  /**
   * The corrected invariant, in one place.
   *
   *  - Initial DOM must be identical. No exceptions, nothing may declare its
   *    way out of it, so this helper is never consulted for it.
   *  - A later frame may differ ONLY where the fixture declared the compiled
   *    path more correct AND named the exact DOM it must produce. A declaration
   *    that does not match is a divergence like any other; a declaration whose
   *    frames stopped differing is reported as stale below.
   */
  const claimed = (kind: "step" | "event", index: number, actual: string): boolean => {
    const win = compiled.wins.find((w) => w.kind === kind && w.index === index)
    if (!win) return false
    if (win.compiled !== actual) return false
    wins.push(win)
    return true
  }

  if (oracle.html !== compiled.html) {
    divergences.push({
      kind: "initial-dom",
      oracle: oracle.html,
      compiled: compiled.html,
      message: "initial render DOM differs from the oracle",
    })
  }

  if (oracle.frames.length !== compiled.frames.length) {
    divergences.push({
      kind: "step-count",
      oracle: String(oracle.frames.length),
      compiled: String(compiled.frames.length),
      message: "the two paths ran a different number of scripted steps",
    })
  }

  const steps = Math.min(oracle.frames.length, compiled.frames.length)
  for (let i = 0; i < steps; i++) {
    if (oracle.frames[i] !== compiled.frames[i] && !claimed("step", i, compiled.frames[i])) {
      divergences.push({
        kind: "step-dom",
        step: i,
        oracle: oracle.frames[i],
        compiled: compiled.frames[i],
        message: `DOM differs from the oracle after scripted step ${i}`,
      })
    }
  }

  if (oracle.eventFrames.length !== compiled.eventFrames.length) {
    divergences.push({
      kind: "event-count",
      oracle: String(oracle.eventFrames.length),
      compiled: String(compiled.eventFrames.length),
      message: "the two paths dispatched a different number of events",
    })
  }

  const events = Math.min(oracle.eventFrames.length, compiled.eventFrames.length)
  for (let i = 0; i < events; i++) {
    if (
      oracle.eventFrames[i] !== compiled.eventFrames[i] &&
      !claimed("event", i, compiled.eventFrames[i])
    ) {
      divergences.push({
        kind: "event-dom",
        step: i,
        oracle: oracle.eventFrames[i],
        compiled: compiled.eventFrames[i],
        message: `DOM differs from the oracle after dispatched event ${i}`,
      })
    }
  }

  // Every declared win has to be a real one: a note that stopped describing
  // reality is worse than no note, because it silently disarms the assertion.
  for (const win of compiled.wins) {
    const frames = win.kind === "step" ? compiled.frames : compiled.eventFrames
    const against = win.kind === "step" ? oracle.frames : oracle.eventFrames
    if (frames[win.index] === against[win.index]) {
      divergences.push({
        kind: win.kind === "step" ? "step-dom" : "event-dom",
        step: win.index,
        oracle: against[win.index] ?? "<missing>",
        compiled: frames[win.index] ?? "<missing>",
        message: `stale win declaration: the two paths agree here (${win.why})`,
      })
    } else if (frames[win.index] !== win.compiled) {
      divergences.push({
        kind: win.kind === "step" ? "step-dom" : "event-dom",
        step: win.index,
        oracle: win.compiled,
        compiled: frames[win.index] ?? "<missing>",
        message: `declared win did not produce the DOM it names (${win.why})`,
      })
    }
  }

  divergences.push(
    ...boundEffects({
      oracleCreated: oracle.trace.created,
      compiledCreated: compiled.trace.created,
      oracleTotalRuns: oracle.trace.totalRuns,
      compiledTotalRuns: compiled.trace.totalRuns,
      oracleRuns: oracle.runs,
      compiledRuns: compiled.runs,
      goesLive: compiled.goesLive,
      frames: 1 + compiled.frames.length + compiled.eventFrames.length,
      merges: countMerges(compiled.code ?? ""),
    }),
  )

  // Markers are invisible to the DOM comparison by construction (normalize.ts
  // rule 4), so the only thing standing between a spurious `<!---->` and a green
  // suite is a count. M2 gives every hole exactly one; M4's elision only ever
  // lowers it.
  if (compiled.code !== undefined) {
    // Both sides are read off the module EXACTLY: anchors at text positions
    // inside `_$template(`…`)`, holes at real call sites. A fixture is source
    // like any other and reaches the emitted module, so a `<!---->` it writes in
    // an attribute value and an `_$insert(` it writes in a doc comment would
    // otherwise both move the bound — one tightening it into a false failure,
    // the other buying slack that was never earned.
    const markers = templateAnchors(compiled.code)
    const holes = emittedCalls(compiled.code, "insert")
    if (markers > holes) {
      divergences.push({
        kind: "marker-count",
        oracle: String(holes),
        compiled: String(markers),
        message: "the emitted templates carry more insert anchors than there are holes to anchor",
      })
    }

    // The exact one. Target #9 removes every anchor nothing inserts before, so
    // "one anchor per hole" stopped being the rule and a spurious anchor now
    // satisfies every count above — it reaches the DOM, where rule 4 of
    // normalize.ts makes it invisible. An anchor no `_$insert` names is either
    // an elision the compiler missed or a marker it emitted for nothing.
    const audit = auditAnchors(compiled.code)
    if (audit.unused > 0) {
      divergences.push({
        kind: "marker-count",
        oracle: String(audit.used),
        compiled: String(audit.baked),
        message: `${audit.unused} baked anchor(s) that no insert call uses`,
      })
    }
    if (audit.unresolved > 0) {
      divergences.push({
        kind: "marker-count",
        oracle: "0",
        compiled: String(audit.unresolved),
        message:
          `${audit.unresolved} insert anchor(s) the walk resolver could not follow — the ` +
          "emitted walk shape changed and this bound has gone blind",
      })
    }

    // The count above is code against code. This one is code against the DOM
    // that actually came out, and it is an EQUALITY for every module.
    //
    // It used to be an equality only for modules that could be shown to clone
    // each template once, and a module that called a component dropped to "a
    // module whose templates bake no anchor cannot produce one" — which
    // switched target #9's per-frame check off entirely for seven fixtures,
    // including the one the exclusion was written for. The expectation now
    // comes from the clones themselves (tracer.ts wraps `template`), so a
    // component called twice, a `For` cloning a row per item and a `Show`
    // parking its body in a detached fragment are each accounted for exactly
    // and none of them costs any coverage.
    for (const [i, frame] of compiled.channels.entries()) {
      const allowed = compiled.expectedAnchors[i] ?? 0
      if (frame.anchors === allowed) continue
      divergences.push({
        kind: "marker-count",
        step: i,
        oracle: String(allowed),
        compiled: String(frame.anchors),
        message:
          "the anchors in the DOM are not the anchors the template clones attached to it bake in",
      })
    }
  }

  // The oracle appends in source order and never needs an anchor, so a nonzero
  // count here means the runtime started manufacturing them — at which point
  // every bound above is measuring the wrong thing and has to be re-derived.
  for (let i = 0; i < oracle.channels.length; i++) {
    const anchors = oracle.channels[i].anchors
    if (anchors === 0) continue
    divergences.push({
      kind: "marker-count",
      step: i,
      oracle: String(anchors),
      compiled: "0",
      message: "the oracle produced an insert anchor of its own — the marker bounds no longer hold",
    })
  }

  // Every channel above is a function of the DOM's SHAPE, and a component that
  // destroys and rebuilds each node on every update produces exactly the shape
  // of one that reuses them. This is where the difference is visible: which
  // nodes survived each update, oracle sequence against compiled sequence.
  //
  // Only frames whose DOM already agrees are compared — a declared win has no
  // shared element set to compare identities across.
  if (
    oracle.frames.length === compiled.frames.length &&
    oracle.eventFrames.length === compiled.eventFrames.length
  ) {
    for (let i = 0; i < compiled.channels.length; i++) {
      if (oracle.channels[i].html !== compiled.channels[i].html) continue
      const want = oracle.channels[i].identity.join(",")
      const got = compiled.channels[i].identity.join(",")
      if (want === got) continue
      divergences.push({
        kind: "node-identity",
        step: i,
        oracle: want,
        compiled: got,
        message:
          "the nodes that survived this update are not the ones the oracle kept — a rebuilt " +
          "node loses focus, selection, scroll offset and any dirty form state living on it",
      })
    }
  }

  // Rule 2 of normalize.ts sorts attributes out of the main diff, so a codegen
  // that emitted them backwards compares equal there. This is the channel that
  // sees it. Frames only line up index for index when both paths ran the same
  // number of them, and the counts above already report it when they did not.
  if (
    oracle.frames.length === compiled.frames.length &&
    oracle.eventFrames.length === compiled.eventFrames.length
  ) {
    const patched = patchedAttributeNames(compiled.code ?? "")
    for (let i = 0; i < compiled.channels.length; i++) {
      // A frame whose DOM already differs — a declared win, or a divergence
      // reported above — has no shared element set to compare an order across.
      if (oracle.channels[i].html !== compiled.channels[i].html) continue
      const want = oracle.channels[i].attributes.map((line) => expectedAttributeOrder(line, patched))
      const got = compiled.channels[i].attributes
      for (let j = 0; j < Math.max(want.length, got.length); j++) {
        if (want[j] === got[j]) continue
        divergences.push({
          kind: "attribute-order",
          step: i,
          oracle: want[j] ?? "<missing>",
          compiled: got[j] ?? "<missing>",
          message: "attributes reached the DOM in an order source order does not explain",
        })
      }
    }
  }

  return {
    ok: divergences.length === 0,
    divergences,
    wins,
    effectDelta: compiled.trace.created - oracle.trace.created,
    runDelta: compiled.trace.totalRuns - oracle.trace.totalRuns,
    oracle,
    compiled,
  }
}

export function formatDivergences(name: string, divergences: Divergence[]): string {
  const lines = [`fixture "${name}" diverged from the oracle:`]
  for (const d of divergences) {
    lines.push(`  [${d.kind}${d.step === undefined ? "" : ` step ${d.step}`}] ${d.message}`)
    lines.push(`    oracle  : ${d.oracle}`)
    lines.push(`    compiled: ${d.compiled}`)
  }
  return lines.join("\n")
}

export async function assertMatchesOracle(name: string): Promise<Comparison> {
  const result = await compareToOracle(name)
  if (!result.ok) throw new Error(formatDivergences(name, result.divergences))
  return result
}
