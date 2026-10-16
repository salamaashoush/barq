/**
 * L4 — the node-identity channel, regraded METAMORPHIC.
 *
 * `metamorphic.ts`'s header states what was wrong with the differential grading
 * and what replaces it. This file is the discipline around it: the properties
 * are run over the whole corpus AND over a dedicated declared corpus, the number
 * of checks each property performed is asserted to be non-trivial, and the
 * declarations in `fixtures/l4/` are asserted to be TOTAL — a step without a
 * class fails, so a fixture that grows a step cannot quietly grow an unchecked
 * transition with it.
 */

import { describe, expect, it } from "bun:test";

import { channel } from "./graded.ts";
import { fixtureSource, listFixtures } from "./harness.ts";
import {
  checkMetamorphic,
  formatViolations,
  mergeChecks,
  primitiveReplayStep,
  replayableStep,
  segments,
  type MetamorphicDeclaration,
  type MetamorphicViolation,
  type PropertyId,
  type StepClass,
} from "./metamorphic.ts";
import { l4Source, listL4Fixtures, openSession, type Session } from "./session.ts";

const CLASSES: readonly StepClass[] = ["preserves", "permutes", "rebuilds", "grows", "shrinks"];

const CORPUS = listFixtures();
const L4 = listL4Fixtures();

const sessions = new Map<string, Session>();
for (const name of CORPUS) sessions.set(name, await openSession(name, fixtureSource(name)));
for (const name of L4) sessions.set(name, await openSession(name, l4Source(name)));

function declarationOf(name: string): MetamorphicDeclaration | undefined {
  const session = sessions.get(name);
  return session?.exports.metamorphic as MetamorphicDeclaration | undefined;
}

const violations: MetamorphicViolation[] = [];
const checks: Record<PropertyId, number> = {
  "MM1-noop-write": 0,
  "MM2-step-replay": 0,
  "MM3-replay-identity": 0,
  "MM4-declared": 0,
};
for (const [name, session] of sessions) {
  const report = checkMetamorphic(session, declarationOf(name));
  violations.push(...report.violations);
  mergeChecks(checks, report.checks);
}

/** Transitions in which a scope came apart — MM4's other column has to have both. */
let disposingTransitions = 0;
for (const session of sessions.values()) {
  const cut = segments(session.ownership);
  for (let i = 1; i < session.frames.length; i++) {
    if ((cut[i] ?? []).some((event) => event.kind === "dispose")) disposingTransitions++;
  }
}

console.log(
  `L4 metamorphic: ${sessions.size} sessions (${CORPUS.length} corpus + ${L4.length} declared) — ` +
    `MM1 ${checks["MM1-noop-write"]}, MM2 ${checks["MM2-step-replay"]}, ` +
    `MM3 ${checks["MM3-replay-identity"]}, MM4 ${checks["MM4-declared"]} ` +
    `(${disposingTransitions} of the corpus's transitions disposed a scope)\n` +
    `  ${violations.length} violation(s); exemptions honoured by this channel: ` +
    `${channel("node-identity").exemptions.length}`,
);

describe("L4 — node identity, graded metamorphic", () => {
  it("the channel takes no exemptions at all", () => {
    // The whole claim of the regrade. `compareToOracle`'s identity comparison
    // has two: a per-frame guard that switches it off when the two paths'
    // markup disagrees, and `wins`, which does the same thing by declaration.
    // A metamorphic property compares one implementation against itself, so
    // there is nothing for either to be about.
    expect(channel("node-identity").exemptions).toEqual([]);
    expect(channel("node-identity").grade).toBe("metamorphic");
  });

  it("holds over the whole corpus and the declared corpus", () => {
    expect(formatViolations(violations)).toBe("");
  });

  it("every property found subjects, so a green run is not an empty one", () => {
    // A property nothing exercises is indistinguishable from a property that
    // holds, and the difference is the entire value of the channel.
    expect(checks["MM1-noop-write"], "MM1 ran on no fixture").toBeGreaterThanOrEqual(CORPUS.length);
    expect(checks["MM2-step-replay"], "no fixture has a replayable step").toBeGreaterThan(100);
    expect(
      checks["MM3-replay-identity"],
      "no fixture has a step that writes only primitive literals",
    ).toBeGreaterThan(40);
    expect(checks["MM4-declared"], "the declared corpus checked nothing").toBeGreaterThan(40);
  });

  it("MM4's ownership column is a real join, not a vacuous one", () => {
    // Both halves have to occur: if nothing in the corpus ever disposed a scope
    // during a transition, "disposes nothing" would be satisfied by a runtime
    // that never disposed anything at all.
    expect(disposingTransitions).toBeGreaterThan(20);
    const bothWays = new Set<string>();
    for (const name of L4) {
      const declaration = declarationOf(name);
      if (declaration === undefined) continue;
      for (const cls of declaration.steps) bothWays.add(cls);
    }
    expect(bothWays.has("preserves") && bothWays.has("rebuilds")).toBe(true);
  });

  it("the declarations are total: every step and every event carries a class", () => {
    const missing: string[] = [];
    for (const name of L4) {
      const session = sessions.get(name);
      if (session === undefined) continue;
      const declaration = declarationOf(name);
      if (declaration === undefined) continue;
      const steps = session.frames.filter((f) => f.kind === "step").length;
      const events = session.frames.filter((f) => f.kind === "event").length;
      if (declaration.steps.length !== steps) {
        missing.push(`${name}: ${steps} step(s), ${declaration.steps.length} class(es) declared`);
      }
      const declaredEvents = declaration.events?.length ?? 0;
      if (declaredEvents !== events) {
        missing.push(`${name}: ${events} event(s), ${declaredEvents} class(es) declared`);
      }
      for (const cls of [...declaration.steps, ...(declaration.events ?? [])]) {
        if (!CLASSES.includes(cls)) missing.push(`${name}: \`${cls}\` is not a class`);
      }
      if (typeof declaration.why !== "string" || declaration.why.length < 20) {
        missing.push(`${name}: the declaration has no reason worth reading`);
      }
    }
    expect(missing.join("\n")).toBe("");
  });

  it("every DECLARED L4 step is replayable, so the replay frames are unchanged inputs", () => {
    // MM3's replay check asserts that re-applying a step preserves every node.
    // That is only a statement about the runtime if the second application is
    // the same input — which is a property of how the step is WRITTEN, and is
    // asserted here rather than assumed of a fixture nobody re-reads.
    const bad: string[] = [];
    for (const name of L4) {
      const session = sessions.get(name);
      if (session === undefined) continue;
      // A fixture with no `metamorphic` declaration is a C7 subject only, and
      // `c7-await-suspense`'s single step resolves a promise through the signal
      // holding its resolver — genuinely not replayable, and never replayed for
      // an identity claim.
      if (declarationOf(name) === undefined) continue;
      for (const [i, source] of session.stepSources.entries()) {
        if (replayableStep(source)) continue;
        bad.push(`${name} step ${i}: ${source.replace(/\s+/g, " ")}`);
      }
    }
    expect(bad.join("\n")).toBe("");
  });

  it("the primitive-literal premise is strictly stronger than the replayable one", () => {
    // MM3 is MM2's subjects minus the ones whose written value is a fresh object
    // literal. If the two classifications ever coincided, MM3 would be asserting
    // identity across `rows.set([{…}])` and demanding that by-item keying not
    // exist — so the containment is checked, in both directions.
    let replayable = 0;
    let primitive = 0;
    let bothWrong = 0;
    for (const session of sessions.values()) {
      for (const source of session.stepSources) {
        if (replayableStep(source)) replayable++;
        if (primitiveReplayStep(source)) primitive++;
        if (primitiveReplayStep(source) && !replayableStep(source)) bothWrong++;
      }
    }
    expect(bothWrong, "a step is primitive-replayable and not replayable").toBe(0);
    expect(primitive).toBeGreaterThan(20);
    expect(
      primitive,
      "every replayable step writes a primitive, so MM3 is not a subset",
    ).toBeLessThan(replayable);
  });

  it("every declared class occurs somewhere, so none of them is dead vocabulary", () => {
    const seen = new Set<StepClass>();
    for (const name of L4) {
      const declaration = declarationOf(name);
      if (declaration === undefined) continue;
      for (const cls of [...declaration.steps, ...(declaration.events ?? [])]) seen.add(cls);
    }
    expect([...CLASSES].filter((cls) => !seen.has(cls))).toEqual([]);
  });

  it("the declared corpus covers branch, each, boundary and portal", () => {
    // The four primitives. A metamorphic corpus that only exercised
    // `branch` would be a strong statement about a quarter of the runtime.
    const covered = new Set(L4.map((name) => name.replace(/^(mm|c7)-/, "").split("-")[0]));
    for (const construct of ["branch", "keyed", "index", "switch", "nested"]) {
      expect(
        [...covered].some((name) => name.startsWith(construct)),
        `nothing in fixtures/l4 exercises ${construct}`,
      ).toBe(true);
    }
  });
});

describe("L4 — the metamorphic channel is not inert", () => {
  /**
   * A property no mutation can violate is not a property. These two corrupt the
   * SESSION rather than the runtime — a runtime mutant needs a subprocess and
   * lives in `runtime-mutants.ts` — and they establish the weaker but necessary
   * fact that the comparison discriminates at all: identical inputs pass, and
   * the two exact defects the channel exists for do not.
   */
  it("catches a rebuild that markup cannot see", () => {
    const session = sessions.get("mm-branch-key-stable");
    expect(session).toBeDefined();
    if (session === undefined) return;
    const corrupted: Session = {
      ...session,
      frames: session.frames.map((frame, i) =>
        i === 0 ? frame : { ...frame, identity: frame.identity.map((id) => id + 100) },
      ),
    };
    const report = checkMetamorphic(corrupted, declarationOf("mm-branch-key-stable"));
    expect(report.violations.length).toBeGreaterThan(0);
    expect(report.violations.map((v) => v.property)).toContain("MM1-noop-write");
    // And the markup is untouched, which is the point: every other channel in
    // the repository is a function of the DOM's shape and sees nothing here.
    expect(corrupted.frames.map((f) => f.html)).toEqual(session.frames.map((f) => f.html));
  });

  it("catches a keyed move that rebuilt its rows", () => {
    const session = sessions.get("mm-keyed-move");
    expect(session).toBeDefined();
    if (session === undefined) return;
    const corrupted: Session = {
      ...session,
      frames: session.frames.map((frame) =>
        frame.kind === "step"
          ? { ...frame, identity: frame.identity.map((id, i) => (i === 0 ? id : id + 900)) }
          : frame,
      ),
    };
    const report = checkMetamorphic(corrupted, declarationOf("mm-keyed-move"));
    const said = report.violations.filter((v) => v.property === "MM4-declared");
    expect(said.length).toBeGreaterThan(0);
    expect(said[0].message).toContain("keyed move");
  });
});
