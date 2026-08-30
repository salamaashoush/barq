/**
 * L6 applied to the RUNTIME. the mutation layer and the shipping gate.
 *
 * `mutants.ts` breaks one COMPILER optimisation at a time and reports which
 * driver killed it. This file asks the same question of `packages/core/src/flow.ts`,
 * because M4 moved the interesting behaviour there: the four primitives decide
 * what survives an update, what is torn down, when a Block is invoked and who
 * owns the scope it runs under, and none of that is a compiler pass.
 *
 * Two rows go further down and mutate `enter` itself. They are here because
 * O4.5 — "`CURRENT` is never READ to decide ownership" — had no falsification
 * procedure at all: the rule set answered `structural`, which is a
 * claim about where to look rather than a way to find out. Re-binding `enter` to
 * read the ambient owner, and re-binding it to re-parent every scope one level
 * up, are the two shapes the whole redesign exists to remove, and until they had
 * rows nothing in the repository could tell a correct ownership tree from a
 * uniformly wrong one.
 *
 * Four rows go against `packages/core/src/dom.ts`, which M5 rewrote and this
 * table could not reach at all: every row was a string edit against `flow.ts`,
 * so the two defects M5's repair round found in `spread` — a listener with no
 * cleanup and a handler bound without its `try` — had nothing here that could
 * have caught them. Extending it needed two fixes rather than four new rows:
 * `test/preload.ts` already owns `dom.ts`'s `mock.module` entry and a second
 * registration on the same path silently loses, so the tracer now WRAPS a
 * module named by `BARQ_DOM_OVERRIDE` instead of `dom.ts` itself; and every
 * scratch copy carries an installed-ness guard, asserted through the same
 * resolution a fixture uses, so a mutation that never loaded reports
 * `NOT INSTALLED` rather than `survived`.
 *
 * The point is the same and it is worth restating: **a property no mutation can
 * violate is not a property.** A green L4 run means the oracle found no defect;
 * it does not mean the oracle could have. This runner is the difference.
 *
 * ## How it runs
 *
 * The target module is copied to a scratch file with one string edit applied, its
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

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

const CRATE = join(import.meta.dir, "..");
const CORE_SRC = join(CRATE, "..", "core", "src");
const FLOW = join(CORE_SRC, "flow.ts");
const DOM = join(CORE_SRC, "dom.ts");
const ASYNC = join(CORE_SRC, "async.ts");
const SCRATCH = process.env.BARQ_RUNTIME_MUTANT_DIR ?? join(tmpdir(), "barq-runtime-mutants");

interface Mutant {
  id: string;
  /**
   * The core module the edit is against. `flow.ts` by default, because that is
   * where M4 put the four primitives — but M5 REWROTE `dom.ts` and this table
   * could not express a mutation of it, which is why the two defects M5's
   * repair round found in `spread` had nothing that could have caught them.
   */
  file?: string;
  /**
   * An export of `file` that the package index also re-exports, used by the
   * generated preload to assert the scratch copy is the one a fixture would
   * import. Defaults to `listen` for `dom.ts` and `branch` for `flow.ts`; any
   * other module has to name its own, or every row against it reports
   * NOT INSTALLED for the wrong reason.
   */
  probe?: string;
  /** the primitive or invariant this edit corrupts */
  target: string;
  /** what the mutation makes the runtime do wrong, in one line */
  what: string;
  /** the channel that is EXPECTED to catch it, so a surprise is visible as one */
  expect: string;
  /** a source edit against `flow.ts`; empty for the null mutant and for overrides */
  find: string;
  replace: string;
  /**
   * An override installed over the `signals.ts` NAMESPACE instead of a source
   * edit, as one object-literal member. The ownership primitives cannot be
   * mutated by copying their file — the tracer has already replaced that module
   * and the L2b channel reads its sink — so they are mutated where they are
   * consumed: `real` is the traced namespace and the member shadows one export.
   */
  override?: string;
}

/**
 * The four mutations the shipping gate names for this milestone — leak a scope,
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
  // The three ownership NEGATIVES. Each deletes a refusal rather than a
  // behaviour, and a refusal is the one thing a differential cannot see: the
  // mutated runtime does MORE, not something else.
  {
    id: "fall-back-to-the-ambient-scope",
    target: "block / C3.8",
    what:
      "a Block invoked with no scope runs under CURRENT instead of throwing — the single most " +
      "important negative in the calling convention, and the Provider bug's actual shape: the " +
      "body's cleanup and its context read land on whatever scope happened to be ambient",
    expect: "semantics (C3.8, sem-props-block-in-cell-slot)",
    find: "",
    replace: "",
    override:
      "block: (fn) => { const guarded = real.block(fn); " +
      "const fallback = function (scope) { return scope === undefined " +
      "? fn.apply(this, arguments) : guarded.apply(this, arguments) }; " +
      'fallback[Symbol.for("barq.block")] = true; return fallback }',
  },
  {
    id: "establish-no-ambient-under-a-block",
    target: "block / O4.5",
    what:
      "the brand and the entry guard stay, and only the `CURRENT = scope` wrapper goes: the scope " +
      "argument then decides for the primitives that take it explicitly and for nothing else, so a " +
      "component handed A while B is ambient files its hole under A and its cleanup under B",
    expect: "semantics (O4.5, a-compiled-component-body-owns-by-the-scope-it-was-given)",
    find: "",
    replace: "",
    override:
      "block: (fn) => { const guarded = real.block(fn); " +
      "const shallow = function (scope) { return scope === undefined " +
      "? guarded.apply(this, arguments) : fn.apply(this, arguments) }; " +
      'shallow[Symbol.for("barq.block")] = true; return shallow }',
  },
  {
    id: "let-the-handed-scope-beat-the-pin",
    target: "pin / O2",
    what:
      "`pin` forwards the scope it was handed instead of ignoring it, which is the exact negation " +
      "of its one promise — and the shape in which a pinned Block silently rejoins the caller's tree",
    find: "",
    replace: "",
    expect: "semantics (O2, a-pinned-block-ignores-the-scope-it-is-handed)",
    override:
      "pin: (scope, body) => real.block((given, ...rest) => " +
      "real.runWithOwner(given ?? scope, () => body(given ?? scope, ...rest)))",
  },
  {
    id: "accept-a-missing-scope",
    target: "requireScope / C3.8",
    what:
      "`undefined` is read as `null` — a legal value naming NO owner — so every primitive handed " +
      "no scope silently detaches everything it builds instead of naming the call site",
    expect: "semantics (C3.8, a-primitive-handed-undefined-throws-before-it-does-anything)",
    find: "",
    replace: "",
    // Spelled through `real.requireScope` for the scopes it already admits, so
    // the install guard can see the shadow: the mutation is the `undefined` arm
    // alone.
    override:
      "requireScope: (scope, origin) => scope === undefined ? null : real.requireScope(scope, origin)",
  },
  // B2/R2. Not a `flow.ts` edit either: the split that makes the apply phase
  // untracked lives in `recompute`, and the only way to reach it from here is to
  // shadow the primitive the compiler emits.
  {
    id: "let-the-apply-subscribe",
    target: "renderEffect / R2",
    what:
      "the fused record's apply is folded back INTO the compute, so every DOM read a channel " +
      "performs is a read of the effect — the bug class B2's split removes, and the shape every " +
      "element binding had before M5",
    expect: "semantics (R2, sem-react-apply-is-untracked)",
    find: "",
    replace: "",
    override:
      "renderEffect: (compute, apply) => real.renderEffect(" +
      "apply === undefined ? compute : (p) => { const v = compute(p); apply(v, p); return v })",
  },
  // The dom.ts rows. M5 rewrote this file — the resolved channels, `listen`,
  // `ref` — and the table pointed only at flow.ts, so nothing here could have
  // caught either of the two defects the repair round found in `spread`.
  {
    id: "listen-registers-no-cleanup",
    file: DOM,
    target: "listen / B4",
    what:
      "a non-delegated listener is registered and never removed, which is exactly the state B4 " +
      "was VIOLATED in until M5 — `addEventListener` with nothing that owns the removal",
    expect: "leaks (listener)",
    find:
      "  if (owner === null) return;\n" +
      '  underScope(owner, "listen", () => {\n' +
      "    onCleanup(() => element.removeEventListener(type, routed, options));\n" +
      "  });",
    replace: "  return;",
  },
  {
    id: "listen-binds-the-raw-handler",
    file: DOM,
    target: "listen / E2.2",
    what:
      "the handler is bound without `routedListener`'s try/catch, so a throw escapes " +
      "`dispatchEvent` to `window.onerror` and the enclosing boundary never fires",
    expect: "semantics (E2.2, sem-err-handler-throw)",
    find: "  const routed = routedListener(owner, element, handler);",
    replace: "  const routed = handler;",
  },
  {
    id: "ref-drops-its-cleanup",
    file: DOM,
    target: "ref / B3",
    what:
      "a ref callback that returned an undo function never has it run, so the position is torn " +
      "down with the registration it handed out still live",
    expect: "leaks / oracle (a ref fixture's teardown)",
    find: "  if (undo.length === 0 || owner === null) return;",
    replace: "  return;",
  },
  {
    id: "a-property-channel-writes-an-attribute",
    file: DOM,
    target: "setDomProp / §3.5",
    what:
      "the resolved PROPERTY channel writes an attribute instead, which is the whole thing §3.5's " +
      "compile-time channel decision exists to get right — and it is invisible in the HTML for " +
      "every name whose attribute and property agree",
    expect: "oracle (node identity / DOM against the createElement reference)",
    find: "  setProperty(element, name, value);",
    replace: "  element.setAttribute(name, String(value));",
  },
  // M7's three, against the `bind:` channel's two halves. Both are shapes the channel HAD
  // before this milestone, so each row is a real past defect rather than an
  // invented one. All three edit `dom.ts` — the module whose `mock.module`
  // entry the tracer owns and hands over through `BARQ_DOM_OVERRIDE` — by
  // rebinding the name `forms.ts` exports, which is the only way to reach a
  // module the package index re-exports without a second registry owner.
  {
    id: "drop-the-dom-compare",
    file: DOM,
    target: "writeLive / B6",
    what:
      "every write to a user-mutable property LANDS, with no compare against the element — the " +
      "pre-M7 channel, where a value written while the user is typing rewrites the field they " +
      "are inside and the caret goes to the end of it",
    // The caret restore is KEPT, so the two rows below cannot cover for each
    // other: this one changes nothing a caret assertion can see, and is killed
    // only by the claim that COUNTS the writes.
    expect: "semantics (B6, the counted-writes claim)",
    find: 'import { writeLive } from "./forms.ts";',
    replace:
      'import { coerceLive, captureCaret, restoreCaret } from "./forms.ts";\n' +
      "const writeLive = (element, name, value) => { const next = coerceLive(name, value); " +
      "const saved = captureCaret(element); element[name] = next; restoreCaret(element, saved); return true };",
  },
  {
    id: "write-through-an-active-selection",
    file: DOM,
    target: "captureCaret / B7",
    what:
      "the compare is KEPT and the caret restore is dropped, so a write that genuinely lands " +
      "while the control is focused collapses the selection to the end of the new text — the " +
      "failure this project already shipped once, in replace-based hydration",
    expect: "semantics (B7) and the real-browser caret check's control row",
    find: 'import { writeLive } from "./forms.ts";',
    replace:
      'import { coerceLive, holdsLive } from "./forms.ts";\n' +
      "const writeLive = (element, name, value) => { const next = coerceLive(name, value); " +
      "if (holdsLive(element, name, next)) return false; element[name] = next; return true };",
  },
  {
    id: "bind-never-re-asserts",
    file: DOM,
    target: "bindValue / B6",
    what:
      "a reported edit sets the signal and stops there. The DOM-compare cannot save it: a " +
      "REJECTED keystroke leaves the signal unchanged, so the effect never re-runs and no " +
      "comparison of any kind gets the chance to run",
    expect: "semantics (B6, the rejecting setter)",
    find: "    write(untrack(() => readSlot(value, `bind:${name}`)));",
    replace: "",
  },
  // A2, the classic async bug, as a row rather than as a belief. It is not
  // M7's forms half, and it is here because the question "did the suite catch
  // it" has to be asked of the async half too: a table that only mutates what
  // its author was working on measures its author's attention.
  {
    id: "let-a-stale-response-win",
    file: ASYNC,
    probe: "resource",
    target: "resource / A2",
    what:
      "the generation guard is dropped, so whichever request answers LAST wins — which is what " +
      "the channel did before M7, and which is invisible to any test that resolves its promises " +
      "in the order it issued them",
    // This row SURVIVED EVERYTHING when it was first written, and the reason is
    // worth keeping: every A2 claim read through the memo, whose value is the
    // newest promise whatever the stale continuation did to `settled`, so the
    // outcome held while the mechanism was unpinned. The two claims that see
    // the guard itself were cut in the M7 gate round — a stale continuation may
    // retire neither a `mutate()` overlay nor the LIVE request's controller.
    expect: "semantics (A2, the overlay and the live controller)",
    find: "      gen === issued && (owner === null || owner.gen === scopeGen) && !controller.signal.aborted;",
    replace: "      true;",
  },
  {
    id: "forget-the-dom-on-teardown",
    target: "removeNodes / O3.5",
    what: "a torn-down instance's nodes are left in the document",
    expect: "oracle (DOM) and leaks (node)",
    find: "  for (let i = 0; i < nodes.length; i++) nodes[i].parentNode?.removeChild(nodes[i]);",
    replace: "  return;",
  },
];

const PRE_EXISTING = ["test/oracle.test.ts", "test/ownership.test.ts"];
const L4 = [
  "test/metamorphic.test.ts",
  "test/leaks.test.ts",
  "test/single-evaluation.test.ts",
  // L1. Added with M5's row: `let-the-apply-subscribe` corrupts a property no
  // differential can see — a tracked apply and an untracked one produce the same
  // DOM until something inside a channel reads a signal — so the only channel
  // that can kill it is the absolute one.
  "test/semantics.test.ts",
];

/**
 * The marker every scratch copy carries, asserted by the generated preload.
 *
 * A stale `find` is already a throw. This is the OTHER failure: a mutation that
 * applies to the text and is then never installed, because something else owns
 * that module's `mock.module` entry. Four dom.ts mutants — two of them real
 * defects planted on purpose — reported "433 pass / 0 fail SURVIVED", identical
 * to the null mutant, with the edit sitting in a file nothing loaded. A runner
 * that reports SURVIVED when its mutation was never installed is worse than no
 * runner.
 */
const MARKER = "__barqMutantId";

function prepare(mutant: Mutant): { preload: string; env: Record<string, string> } {
  if (mutant.override !== undefined) {
    return prepareOverride(mutant as Mutant & { override: string });
  }
  const target = mutant.file ?? FLOW;
  const original = readFileSync(target, "utf8");
  let source = original;
  if (mutant.find !== "") {
    if (!source.includes(mutant.find)) {
      throw new Error(
        `mutant ${mutant.id} is STALE: ${target} no longer contains\n${mutant.find}\n` +
          "A mutation that cannot be applied is a mutation that is not being run, and a table " +
          "of unapplied mutations reports a coverage that does not exist.",
      );
    }
    source = source.replace(mutant.find, mutant.replace);
    if (source === original) throw new Error(`mutant ${mutant.id} changed nothing`);
  }
  source += `\nexport const ${MARKER} = ${JSON.stringify(mutant.id)};\n`;
  // Relative imports have to keep resolving to the REAL sibling modules, and to
  // the same file paths the tracer's `mock.module` keys on.
  source = source.replace(
    /from "\.\/([\w.-]+)"/g,
    (_m, file: string) => `from "${join(CORE_SRC, file)}"`,
  );

  mkdirSync(SCRATCH, { recursive: true });
  const file = join(SCRATCH, `${basename(target, ".ts")}-${mutant.id}.ts`);
  writeFileSync(file, source);

  const preload = join(SCRATCH, `preload-${mutant.id}.ts`);
  // `dom.ts`'s registry entry belongs to the tracer, so a dom mutant is handed
  // to it as the module to WRAP; `flow.ts` has no such owner and is registered
  // here, after the tracer, so the mutant binds the counted effects.
  const dom = target === DOM;
  const probe = mutant.probe ?? (dom ? "listen" : "branch");
  const coreIndex = Bun.resolveSync("@barqjs/core", join(CRATE, "test"));
  writeFileSync(
    preload,
    [
      ...(dom ? [] : [`import { mock } from "bun:test"`]),
      `import "${join(CRATE, "test", "preload.ts")}"`,
      ``,
      ...(dom
        ? []
        : [
            `const mutant = require(${JSON.stringify(file)})`,
            `mock.module(${JSON.stringify(target)}, () => mutant)`,
          ]),
      // Installed-ness, asked through the SAME resolution the test files use.
      // The tracer re-exports every name it does not wrap BY REFERENCE, so this
      // is identity between the scratch copy's export and the one a fixture
      // would import — and it is false exactly when someone else owns the
      // module's registry entry, which is the state four dom.ts mutants sat in
      // while reporting "433 pass / 0 fail SURVIVED".
      `const scratch = require(${JSON.stringify(file)})`,
      `const core = require(${JSON.stringify(coreIndex)})`,
      `if (core.${probe} !== scratch.${probe} || scratch.${MARKER} !== ${JSON.stringify(mutant.id)}) {`,
      `  throw new Error(`,
      `    "mutant ${mutant.id} was NOT INSTALLED: @barqjs/core's ${probe} is not the scratch " +`,
      `    "copy's. The mutation applied to the text and nothing loaded it, so every channel " +`,
      `    "below would have reported survived.",`,
      `  )`,
      `}`,
      ``,
    ].join("\n"),
  );
  return { preload, env: dom ? { BARQ_DOM_OVERRIDE: file } : {} };
}

/**
 * A namespace override. `real` is the module the tracer already patched, so the
 * effect counters and the ownership sink stay installed and only the one export
 * named by the mutant changes.
 */
function prepareOverride(mutant: Mutant & { override: string }): {
  preload: string;
  env: Record<string, string>;
} {
  const coreIndex = Bun.resolveSync("@barqjs/core", join(CRATE, "test"));
  const signals = join(dirname(coreIndex), "signals.ts");
  mkdirSync(SCRATCH, { recursive: true });
  const preload = join(SCRATCH, `preload-${mutant.id}.ts`);
  writeFileSync(
    preload,
    [
      `import "${join(CRATE, "test", "preload.ts")}"`,
      `import { mock } from "bun:test"`,
      ``,
      `const real = require(${JSON.stringify(signals)})`,
      `const patched = { ...real, ${mutant.override} }`,
      `mock.module(${JSON.stringify(signals)}, () => patched)`,
      `const shadowed = ${JSON.stringify(mutant.override.split(":")[0].trim())}`,
      `if (!String(require(${JSON.stringify(signals)})[shadowed]).includes("real.")) {`,
      `  throw new Error(`,
      `    "mutant ${mutant.id} was NOT INSTALLED: signals." + shadowed + " is still the original.",`,
      `  )`,
      `}`,
      ``,
    ].join("\n"),
  );
  return { preload, env: {} };
}

interface Outcome {
  pass: number;
  fail: number;
  crashed: boolean;
  /** the install guard fired: the mutation applied to the text and nothing loaded it */
  uninstalled: boolean;
  detail: string;
}

async function run(
  prepared: { preload: string; env: Record<string, string> },
  files: string[],
): Promise<Outcome> {
  const proc = Bun.spawn(["bun", "test", "--preload", prepared.preload, ...files], {
    cwd: CRATE,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...prepared.env, BARQ_RUNTIME_MUTANT: "1" },
  });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  const text = `${out}\n${err}`;
  const pass = Number(/^\s*(\d+) pass$/m.exec(text)?.[1] ?? "0");
  const fail = Number(/^\s*(\d+) fail$/m.exec(text)?.[1] ?? "0");
  const crashed = pass === 0 && fail === 0;
  const uninstalled = text.includes("was NOT INSTALLED");
  const names = [...text.matchAll(/^\(fail\) (.+?)( \[[\d.]+m?s\])?$/gm)].map((m) => m[1]);
  return {
    pass,
    fail,
    crashed,
    uninstalled,
    detail: crashed
      ? text
          .split("\n")
          .filter((line) => line.trim() !== "")
          .slice(-4)
          .join(" / ")
          .slice(0, 240)
      : [...new Set(names)].slice(0, 4).join(" · "),
  };
}

function verdict(outcome: Outcome): string {
  // Reported apart from KILLED on purpose: a red row here says nothing about
  // the mutation, only that it never reached the runtime.
  if (outcome.uninstalled) return "NOT INSTALLED";
  if (outcome.crashed) return "CRASHED";
  return outcome.fail > 0 ? `KILLED (${outcome.fail})` : "survived";
}

const filters = process.argv.slice(2);
const selected = MUTANTS.filter(
  (m) => m.id === "null" || filters.length === 0 || filters.some((word) => m.id.includes(word)),
);

console.log(
  `runtime mutants: ${selected.length} of ${MUTANTS.length}, against flow.ts and the ownership primitive\n` +
    `  pre-existing channels: ${PRE_EXISTING.join(" ")}\n` +
    `  L4 channels:           ${L4.join(" ")}\n`,
);

const rows: string[] = [];
for (const mutant of selected) {
  const prepared = prepare(mutant);
  const before = await run(prepared, PRE_EXISTING);
  const after = await run(prepared, L4);
  const caught = before.fail + after.fail > 0 || before.crashed || after.crashed;
  console.log(
    `── ${mutant.id}\n` +
      `   target   ${mutant.target}\n` +
      `   mutation ${mutant.what}\n` +
      `   expected ${mutant.expect}\n` +
      `   L1/L2/L3 ${verdict(before)}${before.detail ? ` — ${before.detail}` : ""}\n` +
      `   L4       ${verdict(after)}${after.detail ? ` — ${after.detail}` : ""}\n`,
  );
  rows.push(
    [
      mutant.id,
      mutant.target,
      verdict(before),
      verdict(after),
      mutant.id === "null" ? "green, as required" : caught ? "caught" : "SURVIVED EVERYTHING",
    ].join(" | "),
  );
}

console.log("\n| mutant | target | pre-existing | L4 | verdict |");
console.log("|---|---|---|---|---|");
for (const row of rows) console.log(`| ${row} |`);

if (!process.env.BARQ_KEEP_MUTANTS) rmSync(SCRATCH, { recursive: true, force: true });

const survived = rows.filter((row) => row.endsWith("| SURVIVED EVERYTHING"));
if (survived.length > 0) {
  console.log(`\n${survived.length} mutant(s) survived every channel — that is the finding.`);
}
if (rows[0] !== undefined && !rows[0].startsWith("null | — | survived | survived")) {
  console.log(
    "\nThe NULL mutant is not green. Every row above is unattributable until it is: a red row " +
      "could be an artefact of the copy or of the preload rather than of any mutation.",
  );
}

export { MUTANTS };
export const MUTANT_DIR = dirname(SCRATCH);
