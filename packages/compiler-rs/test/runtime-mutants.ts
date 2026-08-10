/**
 * L6 applied to the RUNTIME. `CODESIGN.md` §6 L6 and §8.
 *
 * `mutants.ts` breaks one COMPILER optimisation at a time and reports which
 * driver killed it. This file asks the same question of `packages/core/src/flow.ts`,
 * because M4 moved the interesting behaviour there: the four primitives decide
 * what survives an update, what is torn down, when a Block is invoked and who
 * owns the scope it runs under, and none of that is a compiler pass.
 *
 * Two rows go further down and mutate `enter` itself. They are here because
 * O4.5 — "`CURRENT` is never READ to decide ownership" — had no falsification
 * procedure at all: `SEMANTICS.md` §13 answered `structural (§14)`, which is a
 * claim about where to look rather than a way to find out. Re-binding `enter` to
 * read the ambient owner, and re-binding it to re-parent every scope one level
 * up, are the two shapes the whole redesign exists to remove, and until they had
 * rows nothing in the repository could tell a correct ownership tree from a
 * uniformly wrong one.
 *
 * The point is the same and it is worth restating: **a property no mutation can
 * violate is not a property.** A green L4 run means the oracle found no defect;
 * it does not mean the oracle could have. This runner is the difference.
 *
 * ## How it runs
 *
 * `flow.ts` is copied to a scratch file with one string edit applied, its
 * relative imports rewritten to absolute paths back into `packages/core/src`,
 * and a generated preload installs it over the real module with `mock.module`
 * — the same mechanism `tracer.ts` uses for `signals.ts`. Nothing is written to
 * `packages/core`, and each mutant runs in its own `bun test` process so a
 * mutation can crash without taking the table with it.
 *
 * The first row is always the NULL mutant: the scratch copy built with no edit.
 * It must be green in every channel. Without it a red row could be an artefact
 * of the copy or of the preload, and every row below it would be unattributable.
 *
 * ## What each row reports
 *
 * The channels are run in two groups, and the contrast between them is the
 * finding rather than a detail of the report:
 *
 *  - **the pre-existing channels** — `oracle.test.ts` (initial DOM, per-frame
 *    DOM, effect bounds, marker accounting, node identity against the
 *    `createElement` reference, attribute order) and `ownership.test.ts` (L2b);
 *  - **the L4 channels** — `metamorphic.test.ts`, `leaks.test.ts` and
 *    `single-evaluation.test.ts`.
 *
 * A mutant only the second group kills is a defect the repository could not see
 * before this milestone.
 *
 *   bun test/runtime-mutants.ts            # every mutant
 *   bun test/runtime-mutants.ts key scope  # only those whose id contains a word
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

const CRATE = join(import.meta.dir, "..")
const CORE_SRC = join(CRATE, "..", "core", "src")
const FLOW = join(CORE_SRC, "flow.ts")
const SCRATCH = process.env.BARQ_RUNTIME_MUTANT_DIR ?? join(tmpdir(), "barq-runtime-mutants")

interface Mutant {
  id: string
  /** the primitive or invariant this edit corrupts */
  target: string
  /** what the mutation makes the runtime do wrong, in one line */
  what: string
  /** the channel that is EXPECTED to catch it, so a surprise is visible as one */
  expect: string
  /** a source edit against `flow.ts`; empty for the null mutant and for overrides */
  find: string
  replace: string
  /**
   * An override installed over the `signals.ts` NAMESPACE instead of a source
   * edit, as one object-literal member. The ownership primitives cannot be
   * mutated by copying their file — the tracer has already replaced that module
   * and the L2b channel reads its sink — so they are mutated where they are
   * consumed: `real` is the traced namespace and the member shadows one export.
   */
  override?: string
}

/**
 * The four mutations `CODESIGN.md` §8 names for this milestone — leak a scope,
 * evaluate a Block twice, recreate a row that should have moved, dispose out of
 * order — plus the two the L4 channels were designed around: a region that
 * rebuilds on an unchanged key, and a teardown that forgets the DOM.
 */
const MUTANTS: Mutant[] = [
  {
    id: "null",
    target: "—",
    what: "the scratch copy, unmutated. Every channel must be green",
    expect: "nothing",
    find: "",
    replace: "",
  },
  {
    id: "leak-a-scope",
    target: "activate / O3.7",
    what:
      "an instance scope is opened DETACHED, so nothing above it holds its disposer — the exact " +
      "`<Await>` defect M4's registry row was about",
    expect: "leaks (scope)",
    find: "  const scope = enter(given, kind);",
    replace: "  const scope = enter(null, kind);",
  },
  {
    id: "evaluate-a-block-twice",
    target: "build / C7",
    what:
      "every Block is invoked twice for one activation: two subtrees are built and one is " +
      "discarded, which is the bug `Show` shipped by reading `props.children` at four sites",
    expect: "single-evaluation (log, and BLOCK_EVALUATED_TWICE)",
    find:
      "  if (diagnosticsEnabled()) countCall(body);\n" +
      "  return (body as (s: Scope | null, ...rest: readonly unknown[]) => unknown)(scope, ...args);",
    replace:
      "  if (diagnosticsEnabled()) countCall(body);\n" +
      "  (body as (s: Scope | null, ...rest: readonly unknown[]) => unknown)(scope, ...args);\n" +
      "  if (diagnosticsEnabled()) countCall(body);\n" +
      "  return (body as (s: Scope | null, ...rest: readonly unknown[]) => unknown)(scope, ...args);",
  },
  {
    id: "recreate-a-moved-row",
    target: "each / K2",
    what:
      "every list keys on the INDEX whatever `keyOf` says, so a keyed reorder rewrites the rows " +
      "in place instead of moving the nodes that carry their state",
    expect: "metamorphic (MM4 permutes)",
    find: "      keyed: (keyOf ?? true) as never,",
    replace: "      keyed: false as never,",
  },
  {
    id: "rebuild-on-an-unchanged-key",
    target: "region / K2",
    what:
      "the key-equality gate is gone, so every run of the driving effect tears the instance down " +
      "and builds it again — with byte-identical markup",
    expect: "metamorphic (MM4 preserves, MM3 replay identity) and single-evaluation",
    find: "      if (previous !== UNSET && k === previous) return;\n      previous = k;",
    replace: "      previous = k;",
  },
  {
    id: "dispose-nothing-on-teardown",
    target: "teardown / O3",
    what:
      "an instance's nodes are removed and its scope is never disposed, so its cleanups, its " +
      "context, its abort signal and its effects all outlive the position",
    // NOT the leak oracle, and the reason is worth the line: the instance is
    // still a KID of the scope the construct was given, so the render root's own
    // disposal reaches it at the end of the window and the scope probe — which
    // asks its question after `dispose()` returns — sees nothing. The leak is
    // real and it exists BETWEEN frames, which is where the metamorphic channel
    // is looking.
    expect: "metamorphic (MM4: a `rebuilds` step that disposed nothing)",
    find: "    disposeScope(instance.scope);\n    return;",
    replace: "    removeNodes(instance.nodes);\n    return;",
  },
  {
    id: "build-the-boundary-fallback-twice",
    target: "errorBoundary / C7",
    what:
      "the recovered arm is built twice for one activation — the bug the old `ErrorBoundary` " +
      "shipped, and the one that passed single-evaluation 25/25 while both boundary arms were " +
      "invoked outside the counted call",
    expect: "single-evaluation (c7-error-boundary-fallback) and BLOCK_EVALUATED_TWICE",
    find: "    return invoke(scope, fallback, [error, reset]);",
    replace:
      "    invoke(scope, fallback, [error, reset]);\n" +
      "    return invoke(scope, fallback, [error, reset]);",
  },
  // The two ownership mutants. Neither is a `flow.ts` edit: they replace `enter`
  // itself, which is the primitive every construct decides ownership with, and
  // they are the only rows in this table that can falsify O2 and O4.5.
  {
    id: "own-from-the-ambient-owner",
    target: "enter / O4.5",
    what:
      "every construct owns from the AMBIENT owner rather than from the scope it was handed — the " +
      "exact defect the redesign exists to remove, and the one O4.5 has no other falsification for",
    expect: "ownership (L2b), where the two differ",
    find: "",
    replace: "",
    override: "enter: (_parent, kind) => real.enter(real.getOwner(), kind)",
  },
  {
    id: "own-one-level-up",
    target: "enter / O2",
    what:
      "every scope is re-parented one level up, so the ownership TREE is wrong everywhere while " +
      "every scope still has an owner and every disposal still reaches everything",
    expect: "ownership (L2b), by kind-path",
    find: "",
    replace: "",
    override: "enter: (parent, kind) => real.enter(parent?.parent ?? parent, kind)",
  },
  {
    id: "forget-the-dom-on-teardown",
    target: "removeNodes / O3.5",
    what: "a torn-down instance's nodes are left in the document",
    expect: "oracle (DOM) and leaks (node)",
    find: "  for (let i = 0; i < nodes.length; i++) nodes[i].parentNode?.removeChild(nodes[i]);",
    replace: "  return;",
  },
]

const PRE_EXISTING = ["test/oracle.test.ts", "test/ownership.test.ts"]
const L4 = [
  "test/metamorphic.test.ts",
  "test/leaks.test.ts",
  "test/single-evaluation.test.ts",
]

function prepare(mutant: Mutant): string {
  if (mutant.override !== undefined) return prepareOverride(mutant)
  const original = readFileSync(FLOW, "utf8")
  let source = original
  if (mutant.find !== "") {
    if (!source.includes(mutant.find)) {
      throw new Error(
        `mutant ${mutant.id} is STALE: flow.ts no longer contains\n${mutant.find}\n` +
          "A mutation that cannot be applied is a mutation that is not being run, and a table " +
          "of unapplied mutations reports a coverage that does not exist.",
      )
    }
    source = source.replace(mutant.find, mutant.replace)
    if (source === original) throw new Error(`mutant ${mutant.id} changed nothing`)
  }
  // Relative imports have to keep resolving to the REAL sibling modules, and to
  // the same file paths the tracer's `mock.module` keys on.
  source = source.replace(/from "\.\/([\w.-]+)"/g, (_m, file: string) => `from "${join(CORE_SRC, file)}"`)

  mkdirSync(SCRATCH, { recursive: true })
  const file = join(SCRATCH, `flow-${mutant.id}.ts`)
  writeFileSync(file, source)

  const preload = join(SCRATCH, `preload-${mutant.id}.ts`)
  writeFileSync(
    preload,
    [
      `import "${join(CRATE, "test", "preload.ts")}"`,
      `import { mock } from "bun:test"`,
      ``,
      `// AFTER the tracer, so the mutant's own \`import { renderEffect } from "signals.ts"\``,
      `// binds the counted effects rather than the originals.`,
      `const mutant = require(${JSON.stringify(file)})`,
      `mock.module(${JSON.stringify(FLOW)}, () => mutant)`,
      ``,
    ].join("\n"),
  )
  return preload
}

/**
 * A namespace override. `real` is the module the tracer already patched, so the
 * effect counters and the ownership sink stay installed and only the one export
 * named by the mutant changes.
 */
function prepareOverride(mutant: Mutant): string {
  const coreIndex = Bun.resolveSync("@barqjs/core", join(CRATE, "test"))
  const signals = join(dirname(coreIndex), "signals.ts")
  mkdirSync(SCRATCH, { recursive: true })
  const preload = join(SCRATCH, `preload-${mutant.id}.ts`)
  writeFileSync(
    preload,
    [
      `import "${join(CRATE, "test", "preload.ts")}"`,
      `import { mock } from "bun:test"`,
      ``,
      `const real = require(${JSON.stringify(signals)})`,
      `const patched = { ...real, ${mutant.override} }`,
      `mock.module(${JSON.stringify(signals)}, () => patched)`,
      ``,
    ].join("\n"),
  )
  return preload
}

interface Outcome {
  pass: number
  fail: number
  crashed: boolean
  detail: string
}

async function run(preload: string, files: string[]): Promise<Outcome> {
  const proc = Bun.spawn(["bun", "test", "--preload", preload, ...files], {
    cwd: CRATE,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, BARQ_RUNTIME_MUTANT: "1" },
  })
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  await proc.exited
  const text = `${out}\n${err}`
  const pass = Number(/^\s*(\d+) pass$/m.exec(text)?.[1] ?? "0")
  const fail = Number(/^\s*(\d+) fail$/m.exec(text)?.[1] ?? "0")
  const crashed = pass === 0 && fail === 0
  const names = [...text.matchAll(/^\(fail\) (.+?)( \[[\d.]+m?s\])?$/gm)].map((m) => m[1])
  return {
    pass,
    fail,
    crashed,
    detail: crashed
      ? text.split("\n").filter((line) => line.trim() !== "").slice(-4).join(" / ").slice(0, 240)
      : [...new Set(names)].slice(0, 4).join(" · "),
  }
}

function verdict(outcome: Outcome): string {
  if (outcome.crashed) return "CRASHED"
  return outcome.fail > 0 ? `KILLED (${outcome.fail})` : "survived"
}

const filters = process.argv.slice(2)
const selected = MUTANTS.filter(
  (m) => m.id === "null" || filters.length === 0 || filters.some((word) => m.id.includes(word)),
)

console.log(
  `runtime mutants: ${selected.length} of ${MUTANTS.length}, against flow.ts and the ownership primitive\n` +
    `  pre-existing channels: ${PRE_EXISTING.join(" ")}\n` +
    `  L4 channels:           ${L4.join(" ")}\n`,
)

const rows: string[] = []
for (const mutant of selected) {
  const preload = prepare(mutant)
  const before = await run(preload, PRE_EXISTING)
  const after = await run(preload, L4)
  const caught = before.fail + after.fail > 0 || before.crashed || after.crashed
  console.log(
    `── ${mutant.id}\n` +
      `   target   ${mutant.target}\n` +
      `   mutation ${mutant.what}\n` +
      `   expected ${mutant.expect}\n` +
      `   L1/L2/L3 ${verdict(before)}${before.detail ? ` — ${before.detail}` : ""}\n` +
      `   L4       ${verdict(after)}${after.detail ? ` — ${after.detail}` : ""}\n`,
  )
  rows.push(
    [
      mutant.id,
      mutant.target,
      verdict(before),
      verdict(after),
      mutant.id === "null" ? "green, as required" : caught ? "caught" : "SURVIVED EVERYTHING",
    ].join(" | "),
  )
}

console.log("\n| mutant | target | pre-existing | L4 | verdict |")
console.log("|---|---|---|---|---|")
for (const row of rows) console.log(`| ${row} |`)

if (!process.env.BARQ_KEEP_MUTANTS) rmSync(SCRATCH, { recursive: true, force: true })

const survived = rows.filter((row) => row.endsWith("| SURVIVED EVERYTHING"))
if (survived.length > 0) {
  console.log(`\n${survived.length} mutant(s) survived every channel — that is the finding.`)
}
if (rows[0] !== undefined && !rows[0].startsWith("null | — | survived | survived")) {
  console.log(
    "\nThe NULL mutant is not green. Every row above is unattributable until it is: a red row " +
      "could be an artefact of the copy or of the preload rather than of any mutation.",
  )
}

export { MUTANTS }
export const MUTANT_DIR = dirname(SCRATCH)
