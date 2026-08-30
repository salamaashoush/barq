/**
 * The reference backend.
 *
 * `Interp` serialises the analysed IR and `@barqjs/core/interp` walks it. What
 * makes it an oracle rather than a fourth implementation is stated once and
 * asserted here: it consumes the **same analysed IR** codegen consumes — the
 * anchors P5 chose, the template bytes P7 wrote, the ref plan P6 addressed, the
 * patch program in program order — so "the compiler knows more than the
 * reference" is structurally impossible, and there is no O4-style divergence to
 * buy back with per-fixture slack. The retired `createElement` oracle needed 12
 * `wins` and 16 `goesLive`; this one has no exemption machinery at all, and the
 * day it needs a row the design has gone wrong and the row is the evidence.
 *
 * ## The one tension worth stating, and its answer
 *
 * There are 29 `VIOLATED` rules. `Interp` is new code, so the
 * question is whether it implements those rules AS SPECIFIED (and disagrees
 * with the runtime on all 29) or AS IMPLEMENTED (and reproduces the bugs).
 *
 * The question dissolves once you ask WHOSE defect each rule names. All 29 are
 * defects of the RUNTIME — of ownership, of the calling convention, of context,
 * of error routing, of async, of hydration. None of them is a defect of the
 * lowering. `Interp` reaches the DOM through the same four ABI primitives
 * the emitted module reaches it through — `template`, `insert`,
 * `setProp`, `bindEffect` — because those are the contract both backends are
 * written against, not the thing under test. A rule the runtime violates is
 * therefore violated identically on this path, by construction, with no code
 * here that knows anything about it. That is what "M1 changes no semantics"
 * means for the reference backend, it is why the differential below is green
 * with no exemptions, and it is why this file registers nothing in
 * `known-failures.ts`: there is no claim that fails here for a reason of its
 * own. The rules turn green when M2–M9 change the runtime and the calling
 * convention, on both backends at once.
 *
 * The two rules in the 29 that ARE compiler-side — B1 (`class`/`style`/`ref`
 * knock an element off the template path) and B3 (`ref` is still a prop) — are
 * P2 `classify` exclusions, so P1 refuses the element and the subtree goes
 * through `createElement` here for exactly the reason and by exactly the route
 * it does on the DOM backend. `set_class` / `set_style` / `set_ref` answering
 * `None` is that, written down once per op.
 */

import { describe, expect, it } from "bun:test";

import {
  compileFixture,
  compilerOpcodes,
  drive,
  emittedCalls,
  fixtureSource,
  listFixtures,
  renderViaInterp,
  stripLiterals,
  templateHtml,
  type RenderResult,
} from "./harness.ts";
import { checkOwnership, listOwnershipFixtures, ownershipSource } from "./ownership.ts";
import {
  listSemanticFixtures,
  runSemanticFixture,
  type FixtureRun as SemanticRun,
} from "./semantics.ts";
import { HANDLED, OFF_TEMPLATE } from "@barqjs/core/interp";

const INTERP = { interp: true };

// ---------------------------------------------------------------------------
// the instruction set, checked in both directions
// ---------------------------------------------------------------------------

/** `SetOnce` → `setOnce`. The one mechanical difference between the two sides. */
function lowerFirst(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

describe("the instruction set cannot drift across the boundary", () => {
  /**
   * Rust exhaustiveness makes a new `Op` variant a compile error in `lower`'s
   * match and then in every `impl Backend` — `Dom`, `Ssr`, `Interp` and the
   * `Trace` backend in `backend.rs`'s tests. Nothing in any language can make
   * it a compile error in `interp.ts`, so the name sets are asserted equal
   * instead: the same bidirectional pinning discipline the rule IDs use, and
   * for the same reason — a one-way check lets the other side
   * rot.
   */
  it("every opcode the compiler can emit is either handled or declared unreachable", () => {
    const compiler = compilerOpcodes().map(lowerFirst).sort();
    const runtime = [...HANDLED, ...OFF_TEMPLATE].sort();
    expect(runtime).toEqual(compiler);
  });

  it("no opcode is both handled and declared unreachable", () => {
    expect(HANDLED.filter((name) => OFF_TEMPLATE.includes(name))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// the emitted shape
// ---------------------------------------------------------------------------

/** `const _ir$N = […]` declarations, counted off the code and nothing else. */
function irDeclarations(code: string): number {
  return (stripLiterals(code).match(/const _ir\$+\d+ =/g) ?? []).length;
}

describe("Interp is a build, not a debug mode", () => {
  const fixtures = listFixtures();

  it("compiles every fixture in the corpus", () => {
    for (const name of fixtures) {
      expect(compileFixture(name, INTERP).length, name).toBeGreaterThan(0);
    }
  });

  /**
   * The structural claim, which is what separates a reference backend from a
   * second copy of the first one: on this target the template path is DATA. If
   * the module still printed a walk and a patch program, the two paths would
   * agree because they are the same code, and the differential below would be
   * measuring nothing.
   */
  it("emits no walk and no patch call — the template path is data", () => {
    for (const name of fixtures) {
      const code = stripLiterals(compileFixture(name, INTERP));
      for (const property of [".firstChild", ".lastChild", ".nextSibling", ".previousSibling"]) {
        expect(code, `${name} walks the DOM in emitted code`).not.toContain(property);
      }
      for (const helper of ["insert", "setProp", "renderEffect", "bindEffect"]) {
        expect(emittedCalls(code, helper), `${name} emits _$${helper}`).toBe(0);
      }
    }
  });

  it("hands every serialised unit to the interpreter exactly once", () => {
    let served = 0;
    for (const name of fixtures) {
      const code = compileFixture(name, INTERP);
      expect(emittedCalls(code, "interp"), name).toBe(irDeclarations(code));
      served += irDeclarations(code);
    }
    // A corpus that serialised nothing would satisfy every equality above.
    expect(served).toBeGreaterThan(fixtures.length);
  });

  /**
   * The template bytes are P7's, not a second serialisation: the same pass
   * writes them for both targets, so a divergence here would mean the reference
   * backend had been given its own front end.
   */
  it("clones the same templates the DOM backend clones", () => {
    for (const name of listFixtures()) {
      expect(templateHtml(compileFixture(name, INTERP)), name).toEqual(
        templateHtml(compileFixture(name)),
      );
    }
  });

  /**
   * The reference backend's entry point is a third module source, so no
   * production bundle can reach it and no `dev`-only path can leak into one.
   */
  it("imports the interpreter from its own entry point and nowhere else", () => {
    const code = compileFixture("walk-from-the-back", INTERP);
    expect(code).toContain('from "@barqjs/core/interp"');
    expect(compileFixture("walk-from-the-back")).not.toContain("/interp");
  });
});

/**
 * One golden, whitespace-collapsed. Not a snapshot: the serialised form is the
 * artefact this milestone adds, and it should be readable in a review diff
 * rather than parked in a file nobody opens.
 */
it("serialises a unit as [clone, refs, ops] with its expressions beside it", () => {
  const flat = (text: string): string => text.replace(/\s+/g, "");
  const code = compileFixture("walk-from-the-back", INTERP);
  expect(flat(code)).toContain(
    flat(`const _ir$1 = [
      _tmpl$1,
      [["root", null, 0], ["lastChild", 0, 0], ["prevSibling", 1, 1]],
      [["insert", 2, 0, "live", null], ["insert", 1, 1, "live", null]]
    ];`),
  );
  expect(flat(code)).toContain(
    flat(`return _$interp(_s$, _ir$1, [() => penultimate(), () => last()]);`),
  );
});

// ---------------------------------------------------------------------------
// L2 — the differential
// ---------------------------------------------------------------------------

/**
 * Every channel, at once. The DOM across every frame is the differential one;
 * `attributes` is the order the DOM reports (which rule 2 of the normaliser
 * sorts out of `html`), `identity` is per-element ordinals stamped on first
 * sight, and `markers`/`anchors`/`runs` are the side channels — all of them
 * comparable here, and this is where the reference backend differs from `-O0`:
 * `-O0` turns elision and fusion OFF, so demanding it agree on anchors and
 * effect counts would be demanding the optimisations do nothing. `Interp` turns
 * NOTHING off. It reads the same optimised IR, so it must agree on all of it.
 */
function divergences(reference: RenderResult, subject: RenderResult): string[] {
  const out: string[] = [];
  const same = (what: string, a: unknown, b: unknown): void => {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      out.push(`${what}\n  reference: ${JSON.stringify(a)}\n  interp   : ${JSON.stringify(b)}`);
    }
  };
  same("initial render", reference.html, subject.html);
  same("scripted steps", reference.frames, subject.frames);
  same("dispatched events", reference.eventFrames, subject.eventFrames);
  same("per-effect run counts", reference.runs, subject.runs);
  same("baked anchors per frame", reference.expectedAnchors, subject.expectedAnchors);
  same("frame count", reference.channels.length, subject.channels.length);
  for (const [index, frame] of reference.channels.entries()) {
    const at = `frame ${index}`;
    same(`${at}: attribute order`, frame.attributes, subject.channels[index]?.attributes);
    same(`${at}: element identity`, frame.identity, subject.channels[index]?.identity);
    same(`${at}: markers`, frame.markers, subject.channels[index]?.markers);
    same(`${at}: anchors`, frame.anchors, subject.channels[index]?.anchors);
  }
  return out;
}

describe("L2 — the Interp differential over the corpus", () => {
  for (const name of listFixtures()) {
    it(`${name} renders identically through the interpreter`, async () => {
      const compiled = await drive(name);
      const reference = await renderViaInterp(name);
      expect(divergences(compiled, reference).join("\n"), name).toBe("");
    });
  }
});

/**
 * The optimisation axis, through the third backend. `Interp` reads the passes'
 * output, so `-O0` moves what it is handed exactly as it moves what codegen is
 * handed — a different template, a different anchor, a different walk, an
 * unfused effect — and the DOM has to come out the same anyway.
 *
 * `markers`, `anchors` and `runs` are excluded here and only here, for the
 * reason `optimisation.test.ts` gives: elision and fusion are the things `-O0`
 * turns off, and demanding they agree is demanding they do nothing.
 */
describe("L3 — the -O0/-Ox differential through the interpreter", () => {
  for (const name of listFixtures()) {
    it(`${name} renders identically at both levels`, async () => {
      const optimised = await renderViaInterp(name);
      const zero = await renderViaInterp(name, {}, { optimize: 0 });
      expect(zero.html, `${name}: initial render`).toBe(optimised.html);
      expect(zero.frames, `${name}: scripted steps`).toEqual(optimised.frames);
      expect(zero.eventFrames, `${name}: dispatched events`).toEqual(optimised.eventFrames);
      expect(zero.channels.length, `${name}: frame count`).toBe(optimised.channels.length);
      for (const [index, frame] of zero.channels.entries()) {
        const at = `${name}: frame ${index}`;
        expect(frame.attributes, `${at}: attribute order`).toEqual(
          optimised.channels[index]!.attributes,
        );
        expect(frame.identity, `${at}: element identity`).toEqual(
          optimised.channels[index]!.identity,
        );
      }
    });
  }
});

/**
 * L2b, through the third backend. The ownership trace is keyed on `template()`,
 * which this path calls through the same ABI primitive, so the census must come
 * out identical: a reference backend that quietly fixed an ownership defect
 * would be a reference backend that disagrees with the thing it is a reference
 * for, and one that introduced a new one is a bug. Both are this assertion.
 */
describe("L2b — the ownership trace is unchanged by the backend", () => {
  const digest = (findings: ReadonlyArray<{ rule: string; kind: string }>): string[] =>
    findings.map((finding) => `${finding.rule}:${finding.kind}`).sort();

  // The `fixtures/ownership/` half is included because it holds the one fixture
  // that crosses a module boundary, and a backend swap has to survive a
  // compiled sibling as well as a single file.
  const corpus = [
    ...listFixtures().map((name) => ({ name, source: fixtureSource(name) })),
    ...listOwnershipFixtures().map((name) => ({ name, source: ownershipSource(name) })),
  ];

  for (const { name, source } of corpus) {
    it(`${name} produces the same ownership findings`, async () => {
      const compiled = await checkOwnership(name, source, `${name}.tsx`);
      const reference = await checkOwnership(name, source, `${name}.tsx`, INTERP);
      expect(reference.crashed, `${name}: the reference backend crashed`).toBe(compiled.crashed);
      expect(digest(reference.findings), name).toEqual(digest(compiled.findings));
    });
  }
});

/**
 * L1, through the reference backend. This file's header argues that all 29
 * `VIOLATED` rules are defects of the RUNTIME and are therefore violated
 * identically on this path, by construction. `fixtures/semantics/` is the only
 * corpus that executes those rules as claims, and it is out of `listFixtures()`'s
 * reach — so until now the argument was prose. The dangerous direction is the
 * one that looks like good news: a registered known failure going GREEN through
 * the reference backend would mean the reference disagrees with the build it is
 * a reference for.
 */
describe("L1 — the conformance corpus reaches the same verdict through the interpreter", () => {
  const shape = (run: SemanticRun): string[] =>
    run.outcomes.map((o) => `${o.claim} :: ${o.rule} :: ${o.failure ?? "HELD"}`);

  for (const name of listSemanticFixtures()) {
    it(`${name} reaches the same verdict`, async () => {
      const compiled = await runSemanticFixture(name);
      const reference = await runSemanticFixture(name, INTERP);
      expect(
        shape(reference),
        `${name}: the reference backend changed a conformance verdict`,
      ).toEqual(shape(compiled));
    });
  }
});

// ---------------------------------------------------------------------------
// L6 — would this suite notice a wrong interpreter?
// ---------------------------------------------------------------------------

/**
 * Rewrite one thing in the serialised IR and require the corpus to notice.
 * This generalises `oracle.test.ts`'s corruption self-checks to
 * one operator per pass; these are the two that address what this file is a
 * test of — the ref plan the interpreter walks, and the reactivity verdict it
 * reads off each hole. Each throws when it matches nothing, so a change to the
 * serialised form turns a self-check into a loud failure rather than a silent
 * no-op.
 */
function mutator(
  what: string,
  pattern: RegExp,
  replace: (...groups: string[]) => string,
): (code: string) => string {
  return (code) => {
    let seen = 0;
    const out = code.replace(pattern, (...args: unknown[]) => {
      seen++;
      return replace(...(args.slice(1, -2) as string[]));
    });
    if (seen === 0) throw new Error(`self-check corruption is stale: no ${what} to rewrite`);
    return out;
  };
}

/** Mis-order a walk step: every sibling run grows by one hop. */
const bumpHops = mutator(
  "ref plan",
  /(\[\s*"(?:firstChild|lastChild|nextSibling|prevSibling)",\s*\d+,\s*)(\d+)(\s*\])/g,
  (head, hops, tail) => head + String(Number(hops) + 1) + tail,
);

/** Demote every proven-reactive hole to a one-shot read. */
const demoteLive = mutator(
  "insert plan",
  /"live",(\s*)(null|\d+)/g,
  (gap, anchor) => `"once",${gap}${anchor}`,
);

/**
 * Mutants that survive because they are EQUIVALENT, named exactly — a set, not
 * a floor, so a new survivor fails the suite and a survivor that starts dying
 * fails it too. It is empty, and the two fixtures that used to be in it are
 * why the channel list in `divergences` is as long as it is: in
 * `text-hole-fused` and `hygiene-shifted-uids` the hole's anchor is a `<!---->`
 * immediately followed by a text node, so "insert before the anchor" and
 * "insert before the node after it" produce byte-identical MARKUP and the
 * extra hop lands on the second. Both are caught by the MARKER channel, which
 * sees that the content went to the other side of the comment. A DOM-only
 * comparison lets both of them live, and did.
 */
const EQUIVALENT_UNDER_BUMPED_HOPS: string[] = [];

describe("harness self-check", () => {
  const survived = async (
    name: string,
    mutate: (code: string) => string,
  ): Promise<boolean | null> => {
    const clean = await renderViaInterp(name);
    // A fixture this operator has nothing to rewrite in is not a survivor and
    // not a kill; it is out of scope. Staleness of the operator ITSELF is
    // caught by the floor on `applied` below, which a stale regex fails.
    let mutated: string;
    try {
      mutated = mutate(clean.code ?? "");
    } catch {
      return null;
    }
    if (mutated === clean.code) return null;
    const reference = await drive(name);
    try {
      const corrupted = await renderViaInterp(name, { emitted: mutate });
      return divergences(reference, corrupted).length === 0;
    } catch {
      return false;
    }
  };

  it("a mis-ordered walk is caught everywhere it is not an equivalent mutant", async () => {
    const alive: string[] = [];
    let applied = 0;
    for (const name of listFixtures()) {
      const outcome = await survived(name, bumpHops);
      if (outcome === null) continue;
      applied++;
      if (outcome) alive.push(name);
    }
    // A mutation that applied to nothing kills nothing and proves nothing.
    expect(applied).toBeGreaterThan(listFixtures().length / 2);
    expect(alive.sort()).toEqual(EQUIVALENT_UNDER_BUMPED_HOPS);
  });

  it("a reactive hole demoted to a one-shot read is caught", async () => {
    let applied = 0;
    let killed = 0;
    for (const name of listFixtures()) {
      const outcome = await survived(name, demoteLive);
      if (outcome === null) continue;
      applied++;
      if (!outcome) killed++;
    }
    expect(applied).toBeGreaterThan(listFixtures().length / 4);
    // The survivors are the fixtures that never drive the hole — no step and no
    // event changes it, so a one-shot read is observationally the same run.
    // They are a majority nowhere, which is what this floor says.
    expect(killed).toBeGreaterThan(applied * 0.9);
  });

  it("an uncorrupted fixture is not reported as divergent", async () => {
    const reference = await drive("walk-from-the-back");
    const subject = await renderViaInterp("walk-from-the-back");
    expect(divergences(reference, subject)).toEqual([]);
  });

  it("a corruption that matches nothing is a loud failure", () => {
    expect(() => bumpHops("const x = 1")).toThrow(/self-check corruption is stale/);
    expect(() => demoteLive("const x = 1")).toThrow(/self-check corruption is stale/);
  });
});
