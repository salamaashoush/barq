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
  /** `CODESIGN.md` §6 L2b, under `ownership: true` only. */
  ownership?: string | null
  /** `CODESIGN.md` §3.11's compile-time address table, under `addresses: true` only. */
  addresses?: string | null
}

interface NativeCompiler {
  transform(
    code: string,
    options?: Record<string, unknown>,
  ): NativeTransformResult
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
  /** `_$insert` + every resolved-channel write + `_$spread`, in the module. */
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
   * differing at all.
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
  /** The emitted module this render came from. */
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

export async function settle(): Promise<void> {
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

/** Apply the fixture's scripted signal updates, snapshotting the DOM after each. */
export async function drive(name: string): Promise<RenderResult> {
  return renderViaCompiler(name)
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

/**
 * `all` blanks string, template and regex CONTENTS as well as comments; the
 * scanner still walks every one of them either way, because knowing where a
 * literal ends is what keeps the comment detection in sync.
 */
export type Strip = "all" | "comments"

export function stripLiterals(code: string, what: Strip = "all"): string {
  const out = code.split("")
  const blank = (from: number, to: number): void => {
    for (let i = from; i < to && i < out.length; i++) if (out[i] !== "\n") out[i] = " "
  }
  const blankLiteral = (from: number, to: number): void => {
    if (what === "all") blank(from, to)
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
        blankLiteral(i, i + 2)
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
      blankLiteral(i, i + 1)
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
      blankLiteral(i + 1, j)
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
      blankLiteral(i + 1, j)
      i = j + 1
      previous = "/"
      continue
    }

    if (!/\s/.test(ch)) previous = ch
    i++
  }

  return out.join("")
}

/**
 * The module with its COMMENTS blanked and every literal left alone.
 *
 * A fixture's prose reaches the emitted module verbatim, and an assertion that
 * searches the module for `Switch({` finds one in a doc comment explaining what
 * `Switch` used to emit. `stripLiterals` would take the template markup with it,
 * and half the corpus's declarations are claims ABOUT that markup.
 */
export function stripComments(code: string): string {
  return stripLiterals(code, "comments")
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

/**
 * The primitives that take an anchor as their THIRD argument, `($s, parent,
 * anchor, …)`. `portal`, `reveal` and `dyn` are NOT among them — each is a value
 * an `insert` or a `branch` places, so it consumes its parent's anchor and never
 * one of its own.
 */
const REGION_PRIMITIVES = ["branch", "each", "boundary"] as const

/** Every call site that consumes a baked anchor. `insert` takes it fourth. */
const ANCHOR_CONSUMERS = ["insert", ...REGION_PRIMITIVES] as const

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
  const claim = (name: string): void => {
    if (!/^_el\$+\d+$/.test(name)) return
    const node = bound.get(name)
    if (!node) {
      unresolved++
      return
    }
    used.add(node)
  }
  for (const call of callsTo(stripped, "insert")) {
    // `_$insert($s, parent, value, anchor)` — the scope is first (§3.3 C6), so
    // the anchor is the FOURTH argument.
    if (call.length < 4) continue
    claim(call[3].trim())
  }
  // A REGION consumes an anchor too, and takes it as the THIRD argument:
  // `_$branch($s, parent, anchor, …)`. Since M4b that is where most of the
  // corpus's anchors are read, so an audit that only knew about `insert` would
  // report every one of them as baked-and-unused (K5, K7).
  for (const primitive of REGION_PRIMITIVES) {
    for (const call of callsTo(stripped, primitive)) {
      if (call.length < 3) continue
      claim(call[2].trim())
    }
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
function callsTo(stripped: string, helper: string): string[][] {
  const calls: string[][] = []
  const opener = new RegExp(`_\\$+${helper}\\(`, "g")
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
 * The body of every `_$bindEffect(...)` in the module, by balanced
 * parentheses rather than by indentation — an indentation-anchored scan reports
 * ZERO groups on a nested emit and a corpus-wide `groups > 0` cannot tell that
 * apart from a module with no groups at all.
 */
export function bindEffectBodies(code: string): string[] {
  const bodies: string[] = []
  const opener = /_\$+bindEffect\(/g
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
  return bindEffectBodies(code).map((body) => [
    // A resolved channel takes the ELEMENT first: the scope is not an argument
    // at all, because a channel write is not an effect and opens nothing.
    ...new Set([...body.matchAll(CHANNEL_CALL)].map((m) => m[2])),
  ])
}

/**
 * Channel keys that write an attribute under a different name. Everything else
 * in the set is either an attribute of the same name or a property, and a
 * property name can never collide with an attribute name in the channel below
 * because the channel only ever looks at names the DOM actually reported.
 */
const ATTRIBUTE_ALIASES: Record<string, string> = { classList: "class", className: "class" }

/**
 * `CODESIGN.md` §3.5's channel set, as it appears in emitted code:
 * `_$setAttr(el, "id", v)`. `_\$+`, not `_\$`: a fixture whose own source
 * contains `_$` makes the compiler shift every emitted uid to `_$$`, and a
 * scanner pinned to one prefix would silently see no writes at all.
 */
export const CHANNEL_CALL =
  /_\$+(setAttr|setDomProp|setLive|setBool|setClass|setStyleProp|setStyle|setClassList|setHtml)\(\s*(_el\$+\d+)\s*,\s*"([^"]+)"/g

/** `_$bindProp($s, el, _$setAttr, "id", v)` — the channel is the third argument. */
export const BIND_PROP_CALL = /_\$+bindProp\([^,]+,\s*(_el\$+\d+)\s*,[^,]+,\s*"([^"]+)"/g

/**
 * The props the emitted module applies AFTER the clone, by attribute name.
 *
 * Exported because the Chrome differential needs the same partition, and it is
 * computed from the emitted CODE — so it is read once in node, at page-build
 * time, and shipped into the browser as a list of names.
 */
export function patchedAttributeNames(code: string): Set<string> {
  const names = new Set<string>()
  for (const match of code.matchAll(new RegExp(CHANNEL_CALL))) {
    names.add(ATTRIBUTE_ALIASES[match[3]] ?? match[3])
  }
  for (const match of code.matchAll(new RegExp(BIND_PROP_CALL))) {
    names.add(ATTRIBUTE_ALIASES[match[2]] ?? match[2])
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
    | "node-identity-differential"
  step?: number
  expected: string
  actual: string
  message: string
}

export interface Comparison {
  ok: boolean
  divergences: Divergence[]
  /** Negative means the subject created fewer effects than the reference. */
  effectDelta: number
  runDelta: number
  reference: RenderResult
  subject: RenderResult
}

/** `bindEffect`s covering two or more props, counted off the emitted module. */
export function countMerges(code: string): number {
  return bindEffectBodies(code).filter(
    (body) => countMatches(body, new RegExp(CHANNEL_CALL)) >= 2,
  ).length
}

/**
 * Every write the emitted module makes after the clone: the resolved channels
 * plus `bindProp`, which is a channel too — the compiler picked it and passed
 * it in, and only the liveness question is left at run time.
 */
export function propCalls(code: string): number {
  return (
    countMatches(code, new RegExp(CHANNEL_CALL)) +
    countMatches(code, new RegExp(BIND_PROP_CALL))
  )
}

/**
 * Two renders of ONE fixture, compared channel by channel.
 *
 * The reference used to be the un-compiled `createElement` path. `CODESIGN.md`
 * §6 retires it — a second implementation that shares your defect certifies the
 * defect — so nothing in the corpus sweep calls this with a second
 * implementation any more. What survives is the L6 use: the reference is the
 * CLEAN compiled render and the subject is the same fixture compiled with one
 * thing deliberately broken, which is how the suite answers "would I notice a
 * wrong compiler change?".
 *
 * The corpus channels moved to graders that need no reference at all:
 * `effect-counts.ts` (absolute, hand-written per fixture), the per-fixture DOM
 * golden in `oracle.test.ts`, `auditCompiled` below (self-check), and the
 * `-O0`/`-Ox` differential in `optimisation.test.ts`.
 */
export function compareRenders(reference: RenderResult, subject: RenderResult): Comparison {
  const divergences: Divergence[] = []

  if (reference.html !== subject.html) {
    divergences.push({
      kind: "initial-dom",
      expected: reference.html,
      actual: subject.html,
      message: "initial render DOM differs from the reference render",
    })
  }

  if (reference.frames.length !== subject.frames.length) {
    divergences.push({
      kind: "step-count",
      expected: String(reference.frames.length),
      actual: String(subject.frames.length),
      message: "the two renders ran a different number of scripted steps",
    })
  }

  const steps = Math.min(reference.frames.length, subject.frames.length)
  for (let i = 0; i < steps; i++) {
    if (reference.frames[i] === subject.frames[i]) continue
    divergences.push({
      kind: "step-dom",
      step: i,
      expected: reference.frames[i],
      actual: subject.frames[i],
      message: `DOM differs from the reference render after scripted step ${i}`,
    })
  }

  if (reference.eventFrames.length !== subject.eventFrames.length) {
    divergences.push({
      kind: "event-count",
      expected: String(reference.eventFrames.length),
      actual: String(subject.eventFrames.length),
      message: "the two renders dispatched a different number of events",
    })
  }

  const events = Math.min(reference.eventFrames.length, subject.eventFrames.length)
  for (let i = 0; i < events; i++) {
    if (reference.eventFrames[i] === subject.eventFrames[i]) continue
    divergences.push({
      kind: "event-dom",
      step: i,
      expected: reference.eventFrames[i],
      actual: subject.eventFrames[i],
      message: `DOM differs from the reference render after dispatched event ${i}`,
    })
  }

  // Effects are an EQUALITY between two renders of one fixture, not a bound.
  // The bound existed because the reference was a different implementation and
  // creating fewer effects than it was the point; two builds of the same
  // fixture have no such asymmetry, and the corpus-level optimality claim is
  // `effect-counts.ts` rather than a comparison at all.
  if (reference.trace.created !== subject.trace.created) {
    divergences.push({
      kind: "effect-count",
      expected: String(reference.trace.created),
      actual: String(subject.trace.created),
      message: "the two renders created a different number of effects",
    })
  }
  if (reference.trace.totalRuns !== subject.trace.totalRuns) {
    divergences.push({
      kind: "effect-runs",
      expected: String(reference.trace.totalRuns),
      actual: String(subject.trace.totalRuns),
      message: "the two renders ran their effects a different number of times",
    })
  }

  for (let i = 0; i < Math.min(reference.channels.length, subject.channels.length); i++) {
    const want = reference.channels[i].identity.join(",")
    const got = subject.channels[i].identity.join(",")
    if (want === got) continue
    divergences.push({
      kind: "node-identity-differential",
      step: i,
      expected: want,
      actual: got,
      message:
        "the nodes that survived this update are not the ones the reference render kept — a " +
        "rebuilt node loses focus, selection, scroll offset and any dirty form state living on it",
    })
  }

  for (let i = 0; i < Math.min(reference.channels.length, subject.channels.length); i++) {
    const want = reference.channels[i].attributes
    const got = subject.channels[i].attributes
    for (let j = 0; j < Math.max(want.length, got.length); j++) {
      if (want[j] === got[j]) continue
      divergences.push({
        kind: "attribute-order",
        step: i,
        expected: want[j] ?? "<missing>",
        actual: got[j] ?? "<missing>",
        message: "attributes reached the DOM in an order the reference render does not explain",
      })
    }
  }

  return {
    ok: divergences.length === 0,
    divergences,
    effectDelta: subject.trace.created - reference.trace.created,
    runDelta: subject.trace.totalRuns - reference.trace.totalRuns,
    reference,
    subject,
  }
}

export interface CompiledAudit {
  ok: boolean
  divergences: Divergence[]
  render: RenderResult
}

/**
 * Every channel the compiled render can be held to WITHOUT a second render.
 * Both sides of each check come off the emitted module and the DOM that module
 * actually produced, which is §6 L4's `self-check` grade.
 */
export async function auditCompiled(
  name: string,
  corrupt: Corruptions = {},
  options: Record<string, unknown> = {},
): Promise<CompiledAudit> {
  const render = await renderViaCompiler(name, corrupt, options)
  return { ...auditRender(render), render }
}

/** The same audit over a render a caller already has. */
export function auditRender(render: RenderResult): { ok: boolean; divergences: Divergence[] } {
  const divergences: Divergence[] = []
  const code = render.code

  if (code !== undefined) {
    // Both sides are read off the module EXACTLY: anchors at text positions
    // inside `_$template(`…`)`, holes at real call sites. A fixture is source
    // like any other and reaches the emitted module, so a `<!---->` it writes in
    // an attribute value and an `_$insert(` it writes in a doc comment would
    // otherwise both move the bound — one tightening it into a false failure,
    // the other buying slack that was never earned.
    // Every call that CONSUMES an anchor, not only `insert`. Since K5 lowered
    // control flow onto the four primitives, most of the corpus's anchors are
    // read by a region — `_$branch($s, parent, anchor, …)` — and a bound that
    // knew only about `insert` reported those as unanchored. It was masked by
    // the retired oracle registry: `flow-prop-eta-boundary` carried
    // `marker-count` among its declared kinds under a row whose stated cause was
    // C1, so a stale bound sat inside an exemption written for something else.
    const markers = templateAnchors(code)
    const holes = ANCHOR_CONSUMERS.reduce((n, name) => n + emittedCalls(code, name), 0)
    if (markers > holes) {
      divergences.push({
        kind: "marker-count",
        expected: String(holes),
        actual: String(markers),
        message: "the emitted templates carry more anchors than there are holes to anchor",
      })
    }

    // The exact one. Target #9 removes every anchor nothing inserts before, so
    // "one anchor per hole" stopped being the rule and a spurious anchor now
    // satisfies every count above — it reaches the DOM, where rule 4 of
    // normalize.ts makes it invisible. An anchor no `_$insert` names is either
    // an elision the compiler missed or a marker it emitted for nothing.
    const audit = auditAnchors(code)
    if (audit.unused > 0) {
      divergences.push({
        kind: "marker-count",
        expected: String(audit.used),
        actual: String(audit.baked),
        message: `${audit.unused} baked anchor(s) that no insert call uses`,
      })
    }
    if (audit.unresolved > 0) {
      divergences.push({
        kind: "marker-count",
        expected: "0",
        actual: String(audit.unresolved),
        message:
          `${audit.unresolved} insert anchor(s) the walk resolver could not follow — the ` +
          "emitted walk shape changed and this bound has gone blind",
      })
    }

    // The count above is code against code. This one is code against the DOM
    // that actually came out, and it is an EQUALITY for every module.
    //
    // The expectation comes from the clones themselves (tracer.ts wraps
    // `template`), so a component called twice, a `For` cloning a row per item
    // and a `Show` parking its body in a detached fragment are each accounted
    // for exactly and none of them costs any coverage.
    for (const [i, frame] of render.channels.entries()) {
      const allowed = render.expectedAnchors[i] ?? 0
      if (frame.anchors === allowed) continue
      divergences.push({
        kind: "marker-count",
        step: i,
        expected: String(allowed),
        actual: String(frame.anchors),
        message:
          "the anchors in the DOM are not the anchors the template clones attached to it bake in",
      })
    }

    // Attribute ORDER, at the one grade a single render can carry: the props
    // the patch code writes reach the element AFTER every attribute the
    // template baked in. That partition is what source order lowers to on both
    // backends (`CODESIGN.md` §5.3), and it is the half a self-check can see —
    // the order WITHIN each group is pinned absolutely by the per-fixture DOM
    // golden, and a build that reorders either group is caught by comparing it
    // against the clean build (`compareRenders`).
    //
    // A module that emits `_$spread` is EXEMPT, and the exemption is §3.13 item
    // 1 rather than a concession: a spread's names are the one attribute fact
    // the compiler cannot have, so the runtime resolves them and no reading of
    // the emitted code can tell which of an element's attributes the patch code
    // wrote. §5.3's M9 note also makes those elements bake nothing at all, so
    // there is no partition on them to check — every attribute is applied, in
    // source order, and the golden is what records it.
    const patched = patchedAttributeNames(code)
    if (!code.includes("_$spread(")) for (const [i, frame] of render.channels.entries()) {
      for (const line of frame.attributes) {
        const cut = line.indexOf(": ")
        if (cut < 0) continue
        const names = line.slice(cut + 2).split(",")
        let seenPatched = false
        for (const attribute of names) {
          if (patched.has(attribute)) {
            seenPatched = true
            continue
          }
          if (!seenPatched) continue
          divergences.push({
            kind: "attribute-order",
            step: i,
            expected: `${line.slice(0, cut)}: baked before patched`,
            actual: line,
            message:
              `a baked attribute (${attribute}) reached the element after one the patch code ` +
              "writes — source order lowers to baked-then-applied on both backends",
          })
          break
        }
      }
    }
  }

  return { ok: divergences.length === 0, divergences }
}

/**
 * The clean compiled render against a deliberately broken one — L6's channel.
 * `CODESIGN.md` §6 L6: "would my suite notice a wrong compiler change?"
 */
export async function compareToClean(
  name: string,
  corrupt: Corruptions,
  options: Record<string, unknown> = {},
): Promise<Comparison> {
  const clean = await renderViaCompiler(name, {}, options)
  const broken = await renderViaCompiler(name, corrupt, options)
  const comparison = compareRenders(clean, broken)
  // The marker channels are a property of the broken module alone, and they are
  // the ones no DOM diff can see, so they belong in the same verdict.
  comparison.divergences.push(...auditRender(broken).divergences)
  comparison.ok = comparison.divergences.length === 0
  return comparison
}

export function formatDivergences(name: string, divergences: Divergence[]): string {
  const lines = [`fixture "${name}" diverged:`]
  for (const d of divergences) {
    lines.push(`  [${d.kind}${d.step === undefined ? "" : ` step ${d.step}`}] ${d.message}`)
    lines.push(`    expected: ${d.expected}`)
    lines.push(`    actual  : ${d.actual}`)
  }
  return lines.join("\n")
}

/**
 * The precondition every channel over the emitted module ASSUMES and none of
 * them stated. Under an identity `transform(code) { return { code } }` bun
 * lowers the fixture onto `@barqjs/core/jsx-runtime` and every assertion about
 * "the compiled module" goes green against a compiler that compiled nothing.
 *
 * So each check states a fact no build that skipped the work can produce: the
 * emitted module is not the source, and it carries at least one `_$` helper.
 */
export function assertReallyCompiled(name: string, code: string): void {
  if (code === fixtureSource(name)) {
    throw new Error(`${name}: the build handed the source back — nothing compiled it`)
  }
  if (!code.includes("_$")) {
    throw new Error(
      `${name}: the compiled module carries no runtime helper, so this is the un-compiled ` +
        `jsx-runtime path and the check is measuring bun's transform`,
    )
  }
}

/** The compiled render, audited on every channel that needs no second render. */
export async function assertCompiledIsClean(name: string): Promise<CompiledAudit> {
  const result = await auditCompiled(name)
  assertReallyCompiled(name, result.render.code ?? "")
  if (!result.ok) throw new Error(formatDivergences(name, result.divergences))
  return result
}
