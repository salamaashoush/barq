/**
 * What each control-flow flag is worth. The standing rule:
 *
 *   "Discipline, enforced in review: a flag that moves neither an allocation
 *    count nor a wall-clock number on a named benchmark is deleted, not kept."
 *
 * So this file is the gate a flag has to pass to exist. Each case builds ONE
 * region twice — once with the flag off, once with it on, everything else
 * identical — and reports two numbers: the `Scope` allocations the mount cost
 * (`scopeAllocations()`, which counts real allocations and not scopes some
 * construct declared) and the paired wall-clock with a Wilcoxon p over the
 * per-trial differences.
 *
 * ## M4b: the region under test is COMPILED, not hand-written
 *
 * Until M4b nothing in the compiler emitted a flag, so this file called
 * `branch(...)` by hand with the integer it wanted to measure. That measures the
 * runtime and says nothing about the compiler: a flag the pass can never prove
 * would have scored exactly as well, and `STATIC_KEY` was in that position for a
 * whole milestone — emittable, never emitted, and measured anyway.
 *
 * Each row now names a CORPUS FIXTURE, compiles it with the real compiler, and
 * asserts that the flags integer in the emitted call is the one the row claims.
 * The twin is that same emitted module with ONE BIT cleared in that integer and
 * nothing else touched — so the pair differs in exactly the decision the flag
 * is, and the "flag on" side is a program the compiler actually produces rather
 * than one this file wrote to flatter it.
 *
 * A flag with no fixture is therefore a flag with no number, and fails here
 * rather than passing quietly.
 *
 * ## The two that were deleted
 *
 * A flag that reports 0 allocations saved and p > 0.05 is deleted from
 * `packages/core/src/flow.ts` in the same change that runs this. Two were, and
 * `grep -rn 'FAST_CLEAR|INDEX_UNUSED' packages` now finds them only in this
 * paragraph. The measurement that
 * killed them, 81 trials × 400 iterations:
 *
 *   FAST_CLEAR     52.00 -> 52.00 scopes,  1.1% faster,  p = 4.4e-1
 *   INDEX_UNUSED   52.00 -> 52.00 scopes,  0.5% faster,  p = 5.8e-1
 *
 * `FAST_CLEAR` traded N `removeChild` calls for one `textContent` write and the
 * trade did not pay at 50 rows. `INDEX_UNUSED`'s saving is N `Signal` objects
 * per list, which is real and which neither counter here could see: the scope
 * counter counts `Scope`s only, and the retained-heap probe under happy-dom
 * reported numbers too noisy to publish. So it has an argument and no number,
 * and the rule is about the number. Either may come back with a benchmark that
 * shows
 * it earning, and it comes back with a row in this table, not with a comment.
 *
 * Run: bun --conditions=browser run src/flow-flags.ts
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

import { transform } from "@barqjs/compiler-rs";
import { effectAllocations, flush, render, scopeAllocations } from "@barqjs/core";

import { paired, wilcoxon } from "./stats.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FIXTURES = join(HERE, "..", "..", "compiler-rs", "fixtures");
const TMP = join(HERE, "..", ".flags-tmp");

interface Case {
  /** The flag under test, by its name in `flow.ts`. */
  flag: string;
  /** Its value, taken from the runtime rather than restated here. */
  bit: number;
  /** The corpus fixture whose emitted region carries it. */
  fixture: string;
  /** The whole integer the compiler emits for that region. */
  emitted: number;
  /** What the compiler proves to emit it. */
  proves: string;
  /** What the runtime skips because of it. */
  skips: string;
}

const TRIALS = 81;
const ITERATIONS = 400;

/**
 * The flags integer as it stands in an emitted primitive call: the last
 * argument, after either a `})` (one Block) or a `]` (the hoisted table a
 * `Switch` folds its arms into).
 */
const FLAGS = /(\}\)|\]), (\d+)\)/g;

/**
 * The fixture WITHOUT its optimality declaration, which is source like any other
 * and reaches the emitted module: `control-flow-switch-static-key` asserts the
 * strings `"], 1)"` and `"], 3)"` in its own block, and the scan below counted
 * all three as regions.
 */
function compile(fixture: string): string {
  const source = readFileSync(join(FIXTURES, `${fixture}.tsx`), "utf8");
  const body = source.replace(/\nexport const optimality = \{[\s\S]*?\n\}\n/, "\n");
  if (body === source) throw new Error(`${fixture}: the optimality declaration did not strip`);
  return transform(body, { filename: `${fixture}.tsx` }).code;
}

/**
 * The emitted module with `bit` cleared in its one flags integer, and every
 * other byte identical. Refuses anything it cannot do exactly: a fixture with
 * two regions has no single decision to isolate, and a fixture whose integer is
 * not the one the row declares means the compiler stopped proving the property
 * and the number below would be measuring something else.
 */
function withoutFlag(code: string, testCase: Case): string {
  const found = [...code.matchAll(FLAGS)];
  if (found.length !== 1) {
    throw new Error(
      `${testCase.fixture}: ${found.length} regions carry a flags integer, not 1 — a paired ` +
        "measurement needs exactly one decision to turn off",
    );
  }
  const actual = Number(found[0][2]);
  if (actual !== testCase.emitted) {
    throw new Error(
      `${testCase.fixture}: the compiler emits flags ${actual}, and this row is written against ` +
        `${testCase.emitted}. Either the pass stopped proving ${testCase.flag} or the fixture ` +
        "changed; the number below would not be about this flag either way.",
    );
  }
  if ((actual & testCase.bit) === 0) {
    throw new Error(`${testCase.fixture}: emits flags ${actual}, which does not carry ${testCase.flag}`);
  }
  return code.replace(FLAGS, (_all, tail: string) => `${tail}, ${actual & ~testCase.bit})`);
}

let seq = 0;

async function load(code: string): Promise<{ default: (scope: unknown) => Node }> {
  const file = join(TMP, `m${seq++}.tsx`);
  writeFileSync(file, `/** @jsxImportSource @barqjs/core */\n${code}`);
  return (await import(file)) as { default: (scope: unknown) => Node };
}

/** One mount-and-dispose cycle of a compiled module. */
function cycle(mod: { default: (scope: unknown) => Node }): void {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const off = render(mod.default as never, host);
  flush();
  off();
  host.remove();
}

/** What one mount of a compiled module leaves in its host. */
function markup(mod: { default: (scope: unknown) => Node }): string {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const off = render(mod.default as never, host);
  flush();
  const html = host.innerHTML;
  off();
  host.remove();
  return html;
}

function allocations(
  mount: () => void,
  counter: () => number,
): number {
  mount(); // warm the shape
  const before = counter();
  for (let i = 0; i < 100; i++) mount();
  return (counter() - before) / 100;
}

/**
 * `control-flow-switch-static-key` is one `branch` over a module constant. It
 * ships `STATIC_KEY` and not `NO_SCOPE` — a `Switch` is never handed the second
 * — so clearing bit 0 leaves 0 and the pair differs in one decision.
 */
const staticKey: Case = {
  flag: "STATIC_KEY",
  bit: 0,
  fixture: "control-flow-switch-static-key",
  emitted: 1,
  proves: "the key expression reads nothing reactive",
  skips: "the renderEffect, its subscription and the previous-key record",
};

/**
 * `control-flow-show-static-body` is one `branch` whose body is a subtree that
 * produced no patch at all: one `template()` clone, nothing an activation's
 * `Scope` could hold. It ships `NO_SCOPE` and not `STATIC_KEY` — its key reads
 * a signal — so clearing bit 1 leaves 0.
 */
const noScope: Case = {
  flag: "NO_SCOPE",
  bit: 0,
  fixture: "control-flow-show-static-body",
  emitted: 2,
  proves: "no body registers an effect, a cleanup, a listener or a context",
  skips: "the per-activation Scope allocation and its ownRange closure",
};

const CASES: readonly Case[] = [staticKey, noScope];

// The rule made machine-checked rather than "enforced in review": a flag
// declared in
// the runtime with no row in this table has no number, and a flag with no number
// is deleted. Read off the source, so adding a `1 << n` and forgetting the
// benchmark fails here instead of shipping. The VALUE is read off the same line,
// so a row cannot drift from the bit it claims to be turning off.
const declared = new Map(
  [
    ...readFileSync(new URL("../../core/src/flow.ts", import.meta.url), "utf8").matchAll(
      /^export const (\w+) = 1 << (\d+);$/gm,
    ),
  ].map((match) => [match[1], 1 << Number(match[2])] as const),
);
const unmeasured = [...declared.keys()].filter((flag) => !CASES.some((c) => c.flag === flag));
if (unmeasured.length > 0) {
  throw new Error(
    `flow.ts declares ${unmeasured.join(", ")} with no row in this table. CODESIGN.md §8: a flag ` +
      "that moves neither an allocation count nor a wall-clock number is deleted, not kept.",
  );
}
for (const testCase of CASES) {
  const bit = declared.get(testCase.flag);
  if (bit === undefined) throw new Error(`${testCase.flag} is not declared in flow.ts at all`);
  testCase.bit = bit;
}

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
writeFileSync(join(TMP, ".gitignore"), "*\n");

console.log("flow flags — what each one is worth, measured on the flag the COMPILER emitted\n");
console.log(
  `${"flag".padEnd(12)}${"fixture".padEnd(32)}${"flags".padStart(6)}` +
    `${"scopes off".padStart(11)}${"scopes on".padStart(10)}` +
    `${"fx off".padStart(8)}${"fx on".padStart(7)}` +
    `${"ns off".padStart(10)}${"ns on".padStart(9)}${"delta".padStart(9)}${"p".padStart(9)}`,
);

const rows: string[] = [];
for (const testCase of CASES) {
  const on = compile(testCase.fixture);
  const off = withoutFlag(on, testCase);

  const withFlag = await load(on);
  const without = await load(off);
  const mountOn = (): void => cycle(withFlag);
  const mountOff = (): void => cycle(without);

  // A twin that renders something else is not a measurement of a flag, it is a
  // measurement of a bug. The -O0/-Ox differential is what proves the two
  // PROGRAMS agree; this is the much smaller claim that the two sides of THIS
  // pair agree, which has to hold before either number below means anything.
  if (markup(withFlag) !== markup(without)) {
    throw new Error(
      `${testCase.fixture}: clearing ${testCase.flag} changed what the region renders — ` +
        `${markup(withFlag)} with the flag, ${markup(without)} without it`,
    );
  }

  const scopesOff = allocations(mountOff, scopeAllocations);
  const scopesOn = allocations(mountOn, scopeAllocations);
  const fxOff = allocations(mountOff, effectAllocations);
  const fxOn = allocations(mountOn, effectAllocations);
  const result = paired(
    () => mountOff,
    () => mountOn,
    { trials: TRIALS, iterations: ITERATIONS },
  );
  const { p } = wilcoxon(result.diffs);
  const delta = (result.a.median - result.b.median) / result.a.median;
  rows.push(
    `${testCase.flag.padEnd(12)}${testCase.fixture.padEnd(32)}${String(testCase.emitted).padStart(6)}` +
      `${scopesOff.toFixed(2).padStart(11)}${scopesOn.toFixed(2).padStart(10)}` +
      `${fxOff.toFixed(2).padStart(8)}${fxOn.toFixed(2).padStart(7)}` +
      `${result.a.median.toFixed(0).padStart(10)}${result.b.median.toFixed(0).padStart(9)}` +
      `${`${(delta * 100).toFixed(1)}%`.padStart(9)}${p.toExponential(1).padStart(9)}`,
  );
  console.log(rows[rows.length - 1]);
}

console.log("\nwhat each flag proves and skips\n");
for (const testCase of CASES) {
  console.log(`  ${testCase.flag}  (${testCase.fixture}, flags ${testCase.emitted})`);
  console.log(`    proves: ${testCase.proves}`);
  console.log(`    skips : ${testCase.skips}`);
}

// The compiled twins are the evidence; leaving them behind makes the run
// reproducible without a rebuild, and they are gitignored where they sit.
console.log(`\ncompiled pairs left in ${TMP}`);
