/**
 * L6 — mutation testing of the harness, generalised. `CODESIGN.md` §6 L6 and §8.
 *
 * The acceptance test for a differential harness is not that it passes. It is
 * that it CATCHES. §8 makes that a shipping gate in as many words: *no
 * optimisation pass ships until a mutation operator exists for it and no mutant
 * survives*. So this script breaks one optimisation at a time, in the compiler
 * itself, and reports which driver and which fixture killed each one.
 *
 * `oracle.test.ts`'s five corruption self-checks are the only mechanism in the
 * twelve-project survey that asks this question at all; they corrupt the EMITTED
 * CODE. This asks the harder version — corrupt the COMPILER — because a pass can
 * be wrong in ways no post-hoc rewrite of its output can imitate: a dedup that
 * merges two templates, a walk planned against the wrong skeleton, an anchor
 * decision taken before the bytes exist.
 *
 * ## How it runs, and what it never touches
 *
 * The crate is COPIED to a scratch directory and mutated there. Nothing writes
 * to `src/`, and nothing overwrites the committed `barq-compiler.*.node` — the
 * mutant is built as a plain `cdylib` and the harness is pointed at it through
 * `BARQ_NATIVE`. `packages/core` is symlinked rather than copied, because
 * `build.rs` derives `DOM_PROPS`, `SVG_TAGS` and the delegated-event table out
 * of the runtime source and a stale copy would be a second, silent mutation.
 *
 * The first row is always the NULL mutant — the scratch crate built unmutated.
 * It must be green. Without it a red row could be an artefact of the debug
 * profile or of the copy, and every number below it would be unattributable.
 *
 *   bun test/mutants.ts            # every mutant
 *   bun test/mutants.ts walk fold  # only those whose id contains a given word
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { cpSync, symlinkSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { generateMany } from "./generator.ts"

const CRATE = join(import.meta.dir, "..")
const CORE = join(CRATE, "..", "core")
const ROOT = process.env.BARQ_MUTANT_DIR ?? join(tmpdir(), "barq-mutants")
const SCRATCH = join(ROOT, "packages", "compiler-rs")
const TARGET = join(ROOT, "target")
const BIN = join(ROOT, "bin")

/**
 * The drivers, by the prefix their test names carry. Which one caught a mutant
 * is the interesting half of the answer: a mutant only the generator kills is a
 * shape the corpus does not contain, and a mutant only EMI kills is a bug in
 * code no driver ever renders.
 */
const DRIVERS: Array<[string, string]> = [
  ["L3 — the -O0/-Ox differential over the corpus", "corpus (DOM)"],
  ["L3 — the flow pass alone, bisected", "flow bisect"],
  ["L3 — the -O0/-Ox differential through the string backend", "corpus (SSR)"],
  ["-O0 is a build, not a debug mode", "corpus (compiles)"],
  ["L3 — the JSX generator", "generator"],
  ["L3 — EMI mutation over the corpus", "EMI (corpus)"],
  ["L3 — EMI mutation over generated programs", "EMI (generated)"],
  ["L3 — the mode axis", "mode axis"],
  ["L3 — attribute order across two levels", "attribute order"],
  ["the front end L3 cannot grade, graded absolutely", "front end (absolute)"],
]

interface Edit {
  file: string
  find: string
  replace: string
}

interface Mutant {
  id: string
  /** The `Opt` flag this mutation is the corruption of. */
  pass: string
  /** What the mutation makes the pass do wrong, in one line. */
  what: string
  edits: Edit[]
}

const MUTANTS: Mutant[] = [
  {
    id: "dedup-merges-different-templates",
    pass: "dedup",
    what: "P7 keys the template cache on byte LENGTH, so two templates of equal length merge",
    edits: [
      {
        file: "src/passes/serialize.rs",
        find: "    let mut hasher = FxHasher::default();\n    html.hash(&mut hasher);",
        replace: "    let mut hasher = FxHasher::default();\n    html.len().hash(&mut hasher);",
      },
      {
        file: "src/passes/serialize.rs",
        find:
          "                && html[row.range.0 as usize..row.range.1 as usize]\n" +
          "                    == html[start as usize..end as usize]",
        replace:
          "                && (row.range.1 - row.range.0) == (end - start)",
      },
    ],
  },
  {
    id: "walk-takes-the-wrong-sibling",
    pass: "walk",
    what: "P6 counts a lastChild descent from the FRONT, so every back-walk lands on the wrong node",
    edits: [
      {
        file: "src/passes/address.rs",
        find: "            Step::LastChild(base, last - index)",
        replace: "            Step::LastChild(base, index)",
      },
    ],
  },
  {
    id: "anchor-drops-a-load-bearing-marker",
    pass: "anchor",
    what: "P5 elides the marker between two literal text runs, which the parser then fuses",
    edits: [
      {
        file: "src/passes/anchor.rs",
        find: "        SkelNode::Text(_) if prev == Prev::Text => Choice::Marker(slot),",
        replace: "        SkelNode::Text(_) if prev == Prev::Text => Choice::Node(next),",
      },
    ],
  },
  {
    id: "anchor-elides-between-two-holes",
    pass: "anchor",
    what: "P5 lets two adjacent holes share one anchor, so their reconciliations interleave",
    edits: [
      {
        file: "src/passes/anchor.rs",
        find: "        SkelNode::Slot(_) => Choice::Marker(slot),",
        replace: "        SkelNode::Slot(_) => Choice::Node(next),",
      },
    ],
  },
  {
    id: "fold-bakes-a-dom-property",
    pass: "fold",
    what: "P3 folds a name the runtime writes through the PROPERTY channel into the template HTML",
    // Three sites since M5, because the refusal is stated twice: `attribute_channel`
    // asks the name question and the `Chan` match asks the channel question. A
    // mutation that removed only one of them would be killed by the other, which
    // is the whole point of expressing the rule in both vocabularies — so the
    // mutant has to defeat both to be the mutation it claims to be.
    edits: [
      {
        file: "src/passes/fold.rs",
        find:
          "    if !crate::lower::names::attribute_channel(interner.name(name).text, is_svg) {\n" +
          "        return false;\n" +
          "    }",
        replace:
          "    let _ = crate::lower::names::attribute_channel(interner.name(name).text, is_svg);",
      },
      {
        file: "src/passes/fold.rs",
        find: "        Chan::Attr => true,",
        replace: "        Chan::Attr | Chan::Prop => true,",
      },
      {
        file: "src/passes/fold.rs",
        find: "        Chan::Prop | Chan::Bool | Chan::StyleProp | Chan::ClassList | Chan::Html => false,",
        replace: "        Chan::Bool | Chan::StyleProp | Chan::ClassList | Chan::Html => false,",
      },
    ],
  },
  {
    id: "fold-folds-a-reassigned-binding",
    pass: "fold",
    what: "P3 folds a binding that is WRITTEN to, so a stale initialiser is baked into the template",
    edits: [
      {
        file: "src/analysis/bind.rs",
        find: "                if self.scoping.symbol_is_mutated(symbol) {",
        replace: "                if false && self.scoping.symbol_is_mutated(symbol) {",
      },
    ],
  },
  {
    id: "fold-bakes-an-attribute-unescaped",
    pass: "fold",
    what: "P3 writes the constant into the template without escaping it",
    edits: [
      {
        file: "src/passes/fold.rs",
        find: "            let escaped = entity::escape_attribute(&text);",
        replace: "            let escaped = text.clone();",
      },
    ],
  },
  {
    id: "fold-bakes-a-text-child-unescaped",
    pass: "fold",
    what: "P3's child half writes the constant into the template without escaping it",
    edits: [
      {
        file: "src/passes/fold.rs",
        find: "            let escaped = entity::escape_text(&text);",
        replace: "            let escaped = text.clone();",
      },
    ],
  },
  {
    id: "fuse-merges-across-elements",
    pass: "fuse",
    what: "P5 puts live props of DIFFERENT elements in one bindEffect",
    edits: [
      {
        file: "src/passes/group.rs",
        find:
          "        while end < old.len()\n" +
          "            && matches!(old[end].op, Op::SetLive { .. })\n" +
          "            && old[end].target == target\n" +
          "        {",
        replace:
          "        let _ = target;\n" +
          "        while end < old.len() && matches!(old[end].op, Op::SetLive { .. }) {",
      },
    ],
  },
  {
    /**
     * B2's exact predecessor defect, re-introduced. `class`, `style`,
     * `classList` and `dangerouslySetInnerHTML` apply a NORMALISED value — the
     * class string, the css map, the toggled key set — so their record slot has
     * to hold what the CHANNEL returned, not what the compute produced. Downgrade
     * `Thread` to `Identity` and the channel is handed `undefined` as its
     * previous value on every run: it can only ever ADD, and it re-writes the
     * whole class attribute on any field's account. That is what `STATEFUL_DIFF`
     * existed to prevent, and the exclusion is what B2 replaces.
     */
    id: "fuse-merges-class-without-threading-its-applied-value",
    pass: "fuse (B2)",
    what: "P2 gives a normalising channel the plain `!==` guard, so the prev it threads is lost",
    edits: [
      {
        file: "src/passes/classify.rs",
        find: "                let diff = if chan.threads_prev() {\n                    Diff::Thread\n                } else if",
        replace: "                let diff = if chan.threads_prev() {\n                    Diff::Identity\n                } else if",
      },
    ],
  },
  {
    /**
     * §3.5's whole claim is that the channel is a compile-time fact. Collapse
     * every channel onto `setAttr` and the name reaches the DOM as an attribute
     * whatever it meant: a `DOM_PROPS` name stops writing the property, a
     * `classList` object is stringified into `class`, `style` is written whole.
     */
    id: "channel-drops-its-resolution",
    pass: "(ungated front end)",
    what: "P8a sends every resolved channel to `setAttr`, so the compile-time resolution buys nothing",
    edits: [
      {
        file: "src/codegen/dom.rs",
        find: "        Chan::Prop => Helper::SetDomProp,",
        replace: "        Chan::Prop => Helper::SetAttr,",
      },
      {
        file: "src/codegen/dom.rs",
        find: "        Chan::Class => Helper::SetClass,",
        replace: "        Chan::Class => Helper::SetAttr,",
      },
      {
        file: "src/codegen/dom.rs",
        find: "        Chan::ClassList => Helper::SetClassList,",
        replace: "        Chan::ClassList => Helper::SetAttr,",
      },
    ],
  },
  {
    /**
     * The hard constraint on the fused record, written down as a mutation: the
     * compute returns the RECORD and never a function. A one-argument effect
     * registers a function return as its cleanup, so a compute that hands back a
     * closure is a cleanup nobody wrote — and even with an apply present, an
     * apply reached with a function instead of the record reads `undefined` out
     * of every field and writes `undefined` down every channel.
     */
    id: "fuse-returns-a-function-instead-of-the-record",
    pass: "fuse (B2)",
    what: "P8a wraps the record in a closure, so the compute's return value is a function",
    edits: [
      {
        file: "src/codegen/dom.rs",
        find:
          "    let compute = arrow(ctx, no_params(ctx, span), ArrowFunctionBody::from(record), span);\n" +
          "    let params = apply_params(ctx, value, reads_prev.then_some((prev, true)), span);",
        replace:
          "    let compute = arrow(ctx, no_params(ctx, span), ArrowFunctionBody::from(record), span);\n" +
          "    let compute = arrow(ctx, no_params(ctx, span), ArrowFunctionBody::from(compute), span);\n" +
          "    let params = apply_params(ctx, value, reads_prev.then_some((prev, true)), span);",
      },
    ],
  },
  {
    id: "hoist-lifts-a-capturing-handler",
    pass: "hoist",
    what: "target #7 hoists a closure that captures a local, to module scope where the local is not",
    edits: [
      {
        file: "src/ir/react.rs",
        find: "        matches!(self.shape, Shape::Accessor | Shape::Handler) && self.free.only_globals",
        replace: "        matches!(self.shape, Shape::Accessor | Shape::Handler)",
      },
    ],
  },
  {
    id: "eta-reduces-outside-the-whitelist",
    pass: "eta",
    what: "η-reduction fires on any call, so `x={f(a)}` is emitted as `x: f`",
    edits: [
      {
        file: "src/codegen/dom.rs",
        find: "    if ctx.opt.eta\n        && rx.thunk == Thunk::Eta\n        && let Expression::CallExpression(call) = expression",
        replace: "    if ctx.opt.eta\n        && let Expression::CallExpression(call) = expression",
      },
    ],
  },
  {
    /**
     * NOT an optimisation, and that is the point of the row.
     *
     * P2 `classify` is shared by both levels and all three backends, so `-O0`
     * and `Interp` are wrong in exactly the same way when it is — the whole L3
     * and L2 apparatus is structurally blind to it (`CODESIGN.md` §6 L3, "what
     * L3 is blind to"). Keeping the row in the table is what stops that from
     * being a claim in prose: it must be killed by the ABSOLUTE grader in
     * `optimisation.test.ts`, never by a differential, and the `killed by`
     * column is where that shows.
     */
    id: "classify-makes-a-tracked-read-static",
    pass: "(ungated front end)",
    what: "P2 classifies every direct `signal()` read as non-reactive, so every hole is read once",
    edits: [
      {
        file: "src/passes/classify.rs",
        find:
          "                SourceKind::Accessor { .. } => {\n" +
          "                    return Rx {\n" +
          "                        react: React::Reactive,\n" +
          "                        deps: self.dep(symbol),\n" +
          "                        thunk: Thunk::Eta,",
        replace:
          "                SourceKind::Accessor { .. } => {\n" +
          "                    return Rx {\n" +
          "                        react: React::Static,\n" +
          "                        deps: self.dep(symbol),\n" +
          "                        thunk: Thunk::Eta,",
      },
    ],
  },
  {
    id: "flow-ships-no-scope-unproven",
    pass: "flow",
    what: "P4b ships NO_SCOPE for every branch, so a body that registers a cleanup keeps no scope to hold it",
    edits: [
      {
        file: "src/passes/flow.rs",
        find: "    region.flags = flags(statik, inert);",
        replace: "    let _ = inert;\n    region.flags = flags(statik, true);",
      },
    ],
  },
  {
    id: "flow-ships-static-key-unproven",
    pass: "flow",
    what: "P4b ships STATIC_KEY for every branch, so a key that moves is read once and never again",
    edits: [
      {
        file: "src/passes/flow.rs",
        find: "    konst || shaper.lift.rx(read).react == React::Static",
        replace: "    let _ = shaper.lift.rx(read).react;\n    konst || true",
      },
    ],
  },
  {
    /**
     * The SAFE direction, and the row is here to show that the differential
     * cannot see it. Dropping a flag the compiler proved leaves a correct
     * program — the runtime does the work the flag would have skipped — so
     * `-O0` and `-Ox` still agree on every frame and L3 is right to stay green.
     * What has to catch it is the ABSOLUTE claim: the flags census in
     * `optimality.test.ts` and the two static-key fixtures' own declarations.
     */
    id: "flow-drops-a-proven-flag",
    pass: "flow",
    what: "P4b emits zero for every branch, so nothing it proved is ever shipped",
    edits: [
      {
        file: "src/passes/flow.rs",
        find: "fn flags(statik: bool, inert: bool) -> u8 {",
        replace: "fn flags(statik: bool, inert: bool) -> u8 {\n    if true {\n        let _ = (statik, inert);\n        return 0;\n    }",
      },
    ],
  },
  {
    id: "flow-keys-on-the-wrong-arm",
    pass: "flow",
    what: "P4b numbers a Switch's arms from 0, so every arm selects the body of the one before it",
    edits: [
      {
        file: "src/passes/flow.rs",
        find: "        let taken = number(shaper, (index + 1) as f64, arm_span);",
        replace: "        let taken = number(shaper, index as f64, arm_span);",
      },
    ],
  },
  {
    id: "flow-hands-the-primitive-no-anchor",
    pass: "flow",
    what: "a region drops the anchor the walk computed, so its content appends at the end of the parent",
    edits: [
      {
        file: "src/codegen/dom.rs",
        // `insert` has the identical line four functions above, so the site is
        // named by the `parent` binding only `region` takes.
        find:
          "        let parent = ref_ident(self.ctx, self.unit, at.target(), span);\n" +
          "        let anchor = anchor.node().map(|node| ref_ident(self.ctx, self.unit, node, span));",
        replace:
          "        let parent = ref_ident(self.ctx, self.unit, at.target(), span);\n" +
          "        let anchor = anchor.node().filter(|_| false).map(|node| ref_ident(self.ctx, self.unit, node, span));",
      },
    ],
  },
  {
    id: "splice-hoists-out-of-an-iife-that-was-needed",
    pass: "splice",
    what: "a unit whose site needs an IIFE emits its statements flat into the enclosing body",
    edits: [
      {
        file: "src/codegen/mod.rs",
        find: "        (!unit.site.needs_iife()).then_some((index, id))",
        replace: "        Some((index, id))",
      },
    ],
  },
  {
    id: "splice-into-a-non-dom-backend",
    pass: "splice",
    what: "splicing is offered to every backend, including the ones that emit one expression and no statements",
    edits: [
      {
        file: "src/codegen/mod.rs",
        find: "        if self.target != Target::Dom || !self.opt.splice {",
        replace: "        if !self.opt.splice {",
      },
    ],
  },
  {
    id: "splice-takes-a-multi-declarator-statement",
    pass: "splice",
    what: "a `const a = <div/>, b = …` splices flat, and the declarators beside it are lost",
    edits: [
      {
        file: "src/codegen/mod.rs",
        find: "            Statement::VariableDeclaration(it) if it.declarations.len() == 1 => {",
        replace: "            Statement::VariableDeclaration(it) if !it.declarations.is_empty() => {",
      },
    ],
  },
]

// ---------------------------------------------------------------------------

function sh(command: string[], cwd: string, env: Record<string, string> = {}): {
  ok: boolean
  out: string
} {
  const result = Bun.spawnSync(command, {
    cwd,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  })
  return {
    ok: result.exitCode === 0,
    out: `${result.stdout.toString()}\n${result.stderr.toString()}`,
  }
}

function prepareScratch(): void {
  rmSync(join(SCRATCH, "src"), { recursive: true, force: true })
  mkdirSync(SCRATCH, { recursive: true })
  cpSync(join(CRATE, "src"), join(SCRATCH, "src"), { recursive: true })
  for (const file of ["Cargo.toml", "Cargo.lock", "build.rs", "rustfmt.toml"]) {
    cpSync(join(CRATE, file), join(SCRATCH, file))
  }
  const core = join(ROOT, "packages", "core")
  if (!existsSync(core)) {
    mkdirSync(dirname(core), { recursive: true })
    symlinkSync(CORE, core)
  }
}

function apply(edits: Edit[]): void {
  for (const edit of edits) {
    const path = join(SCRATCH, edit.file)
    const before = readFileSync(path, "utf8")
    const hits = before.split(edit.find).length - 1
    if (hits !== 1) {
      throw new Error(
        `${edit.file}: the mutation site occurs ${hits} times, not once — the pass has moved ` +
          `and this mutant is no longer the mutation it claims to be:\n${edit.find}`,
      )
    }
    writeFileSync(path, before.replace(edit.find, edit.replace))
  }
}

function build(id: string): { ok: boolean; out: string; binary: string } {
  const built = sh(["cargo", "build", "--lib"], SCRATCH, { CARGO_TARGET_DIR: TARGET })
  const binary = join(BIN, `${id}.node`)
  if (built.ok) {
    mkdirSync(BIN, { recursive: true })
    cpSync(join(TARGET, "debug", "libbarq_compiler.so"), binary)
  }
  return { ...built, binary }
}

interface Result {
  id: string
  pass: string
  what: string
  /** `false` when the mutant did not even build — the mutation itself is stale. */
  built: boolean
  survived: boolean
  /** Driver name → the first test it failed. */
  killers: Map<string, string>
  failures: number
  /**
   * For a survivor only: what the REST of the suite makes of it. "Survived L3"
   * and "nothing in the project can see this" are very different findings, and a
   * table that cannot tell them apart is not worth reading.
   */
  elsewhere?: Map<string, string>
  /**
   * Inputs whose emitted module the mutation actually moved. Zero means the
   * mutant is EQUIVALENT and no oracle could ever have killed it.
   */
  moved?: number
}

/** Every `bun test` file, for the second pass over a survivor. */
const WHOLE_SUITE = ["test"]

/** Wall-clock budgets, which a debug build fails on its own. */
const TIMING = /throughput|costs less than|compiles fast/

function run(
  binary: string,
  files: string[],
): { failures: number; killers: Map<string, string> } {
  const out = sh(["bun", "test", ...files], CRATE, { BARQ_NATIVE: binary }).out

  const killers = new Map<string, string>()
  let failures = 0
  for (const line of out.split("\n")) {
    const failed = /^\(fail\) (.*?) \[/.exec(line.trim())
    if (!failed) continue
    failures++
    const name = failed[1]
    // The mutants are built with `cargo build`, not `--release`, so a wall-clock
    // budget fails for the profile rather than for the mutation. Counting one as
    // a kill would credit the harness with catching something it did not.
    if (TIMING.test(name)) {
      failures--
      continue
    }
    const driver = DRIVERS.find(([prefix]) => name.startsWith(prefix))?.[1] ?? "other"
    if (!killers.has(driver)) killers.set(driver, name.slice(name.indexOf(" > ") + 3))
  }
  return { failures, killers }
}

const L3_FILES = ["test/optimisation.test.ts", "test/differential.test.ts"]

// ---------------------------------------------------------------------------
// equivalent mutants
// ---------------------------------------------------------------------------

const require_ = createRequire(import.meta.url)

interface Native {
  transform(code: string, options?: Record<string, unknown>): { code: string }
}

/**
 * Every input the harness can put in front of the compiler, as source.
 * Deliberately the corpus AND a slice of the generator: the generator expresses
 * shapes no fixture contains, so a mutation the corpus cannot reach may still be
 * reachable, and calling it equivalent on the corpus alone would be wrong.
 */
function everyInput(): Array<[string, string]> {
  const fixtures = join(CRATE, "fixtures")
  const corpus: Array<[string, string]> = readdirSync(fixtures)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => [f, readFileSync(join(fixtures, f), "utf8")])
  return [
    ...corpus,
    ...generateMany(1, 200).map((p): [string, string] => [`${p.name}.tsx`, p.source]),
  ]
}

/**
 * Whether a mutant emits a different byte for ANY input, at either level.
 *
 * This is the distinction a mutation-testing report is worthless without.
 * "Survived" means the harness watched a wrong compiler produce different output
 * and said nothing — a coverage hole, and a shipping gate under §8. "Equivalent"
 * means the mutation is unreachable: the mutated compiler and the original agree
 * on every byte of every input, so there was nothing for any oracle to catch and
 * no suite in existence could have caught it. Reporting the second as the first
 * would send someone hunting for a test that cannot exist.
 */
/**
 * Every configuration the compiler has, not just the two optimisation levels.
 * Checking only `{optimize: 1｜0}` is how the non-DOM splice mutant came back
 * "equivalent" while panicking the SSR backend on 106 fixtures: the mutation was
 * in a branch no DOM compile takes.
 */
const CONFIGURATIONS: Array<Record<string, unknown>> = [
  { optimize: 1 },
  { optimize: 0 },
  { ssr: true },
  { ssr: true, optimize: 0 },
  { interp: true },
  { interp: true, optimize: 0 },
]

function emitsAnythingDifferent(mutantBinary: string, controlBinary: string): number {
  const mutant = require_(mutantBinary) as Native
  const control = require_(controlBinary) as Native
  let moved = 0
  for (const [filename, source] of everyInput()) {
    for (const configuration of CONFIGURATIONS) {
      let a: string
      let b: string
      try {
        a = control.transform(source, { filename, ...configuration }).code
      } catch {
        continue
      }
      try {
        b = mutant.transform(source, { filename, ...configuration }).code
      } catch {
        // A mutant that REFUSES an input the control accepts has very much
        // changed something.
        moved++
        break
      }
      if (a !== b) {
        moved++
        break
      }
    }
  }
  return moved
}

function one(mutant: Mutant, control: string): Result {
  prepareScratch()
  apply(mutant.edits)
  const built = build(mutant.id)
  if (!built.ok) {
    return {
      id: mutant.id,
      pass: mutant.pass,
      what: mutant.what,
      built: false,
      survived: false,
      killers: new Map([["build", built.out.split("\n").filter((l) => l.includes("error")).slice(0, 2).join(" / ")]]),
      failures: 0,
    }
  }
  const { failures, killers } = run(built.binary, L3_FILES)
  return {
    id: mutant.id,
    pass: mutant.pass,
    what: mutant.what,
    built: true,
    survived: failures === 0,
    killers,
    failures,
    elsewhere: failures === 0 ? run(built.binary, WHOLE_SUITE).killers : undefined,
    moved: failures === 0 ? emitsAnythingDifferent(built.binary, control) : undefined,
  }
}

function main(): void {
  const filters = process.argv.slice(2)
  const chosen = filters.length
    ? MUTANTS.filter((m) => filters.some((f) => m.id.includes(f) || m.pass === f))
    : MUTANTS

  prepareScratch()
  const control = build("null-mutant")
  if (!control.ok) {
    console.error("the UNMUTATED scratch crate did not build; nothing below would mean anything")
    console.error(control.out.slice(-4000))
    process.exit(1)
  }
  const zero = run(control.binary, L3_FILES)
  console.log(
    `null mutant (the scratch crate, unmutated): ${zero.failures === 0 ? "GREEN" : `RED — ${zero.failures} failures`}`,
  )
  if (zero.failures !== 0) {
    console.error("the control is red, so no row below is attributable to a mutation")
    for (const [driver, test] of zero.killers) console.error(`  ${driver}: ${test}`)
    process.exit(1)
  }

  const results: Result[] = []
  for (const mutant of chosen) {
    process.stderr.write(`· ${mutant.id}\n`)
    results.push(one(mutant, control.binary))
  }

  console.log()
  console.log("| pass | mutation | survived? | failures | killed by |")
  console.log("| --- | --- | --- | --- | --- |")
  for (const result of results) {
    const killers = [...result.killers]
      .map(([driver, test]) => `**${driver}** — \`${test}\``)
      .join("<br>")
    const equivalent = result.survived && result.moved === 0
    const survived = !result.built
      ? "did not build"
      : equivalent
        ? "equivalent — no input moves a byte"
        : result.survived
          ? "**SURVIVED L3**"
          : "killed"
    const elsewhere = result.elsewhere
      ? [...result.elsewhere].map(([driver, test]) => `${driver}: \`${test}\``).join("<br>")
      : ""
    console.log(
      `| \`${result.pass}\` | ${result.what} | ${survived} | ${result.failures} | ${killers || elsewhere || "**nothing in the project sees it**"} |`,
    )
  }

  const survivors = results.filter((r) => (r.survived && r.moved !== 0) || !r.built)
  console.log()
  console.log(
    survivors.length === 0
      ? `all ${results.length} mutants killed`
      : `${survivors.length}/${results.length} SURVIVED: ${survivors.map((r) => r.id).join(", ")}`,
  )
  process.exit(survivors.length === 0 ? 0 : 1)
}

main()
