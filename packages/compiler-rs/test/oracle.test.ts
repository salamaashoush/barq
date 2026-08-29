import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "bun:test";

import {
  assertCompiledIsClean,
  auditCompiled,
  compareToClean,
  compileFixture,
  compileSource,
  fixtureSource,
  formatDivergences,
  listFixtures,
  renderViaCompiler,
  stripLiterals,
  templateAnchors,
} from "./harness.ts";
import { countAnchors, normalizeDom } from "./normalize.ts";

/**
 * THE ORACLE, after M9 removed its reference implementation.
 *
 * `CODESIGN.md` §6 retires the un-compiled `createElement` path as an oracle on
 * three grounds, the first of which is decisive: both paths rendered a blank
 * page for `<Provider><Child/></Provider>`, so the harness was green on the very
 * bug that prompted the redesign. A second implementation that shares your
 * defect is worse than no oracle, because it certifies the defect.
 *
 * What that leaves, and where each piece went:
 *
 *  - RENDERED DOM was a differential against the reference. It is now the
 *    per-fixture GOLDEN below plus the `-O0`/`-Ox` differential in
 *    `optimisation.test.ts` — the settled answer for an optimising compiler is
 *    your own compiler with the optimisations off.
 *  - EFFECT COUNTS were an upper bound against the reference's count. They are
 *    now absolute, hand-written per fixture, in `effect-counts.ts`.
 *  - NODE IDENTITY was a differential. It is now metamorphic and unconditional
 *    in `metamorphic.ts`; the differential's per-frame `if (html !== html)
 *    continue` guard — a channel that switched itself off exactly where the
 *    frames disagreed — is gone with it.
 *  - MARKER LAYOUT and the ATTRIBUTE PARTITION never needed a reference: both
 *    sides come off the emitted module and the clones it produced. They stay,
 *    as `harness.ts auditCompiled`.
 *  - The corruption self-checks stay, and they are the point of §6 L6 —
 *    "would my suite notice a wrong compiler change?". Their reference is now
 *    the CLEAN compiled render of the same fixture (`compareToClean`), which is
 *    not a second implementation and cannot share an implementation's defect.
 *
 * `wins` and `goesLive` are gone from the corpus with the reference that made
 * them necessary. Both were exemption machinery: a `win` bought one frame out
 * of a DOM comparison the reference could not pass, and a `goesLive` entry
 * bought one effect out of a bound the reference set. Neither has anything left
 * to buy out of — the golden records what the compiled path renders and the
 * table records how many effects it creates.
 */

/**
 * Corrupt the compiled path by deleting one exact substring of the fixture
 * source. It throws when the substring is gone, so a fixture edit turns a
 * self-check into a loud failure instead of a silent no-op.
 */
function drop(needle: string): (source: string) => string {
  return (source) => {
    if (!source.includes(needle)) {
      throw new Error(
        `self-check corruption is stale: ${JSON.stringify(needle)} is not in the fixture`,
      );
    }
    return source.replace(needle, "");
  };
}

/**
 * Rewrite the HTML inside every `_$template(...)` of an emitted module. Throws
 * when there is nothing to rewrite, so a corruption cannot go quietly inert.
 */
function inTemplates(mutate: (html: string) => string): (code: string) => string {
  return (code) => {
    let seen = 0;
    const out = code.replace(/(_\$template\(`)([\s\S]*?)(`)/g, (_m, open, html: string, close) => {
      seen++;
      return open + mutate(html) + close;
    });
    if (seen === 0) {
      throw new Error("self-check corruption is stale: the emitted module has no _$template");
    }
    return out;
  };
}

/** The mutation the harness used to survive: one spurious anchor per text node. */
const anchorAfterEveryText = inTemplates((html) => html.replace(/>([^<>]+)</g, ">$1<!----><"));

/** Reverse the attribute order the templates were emitted with. */
const reverseBakedAttributes = inTemplates((html) =>
  html.replace(/<([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+="[^"]*"){2,})/g, (_m, tag, attrs: string) => {
    const pairs = [...attrs.matchAll(/\s+([^\s=>/]+="[^"]*")/g)].map((p) => p[1]);
    return `<${tag} ${pairs.reverse().join(" ")}`;
  }),
);

/** Reverse the order the patch code applies props in, run by consecutive run. */
function reverseAppliedProps(code: string): string {
  // A resolved channel write: `_$setAttr(_el$1, "href", v)`.
  const writes =
    /_\$+(setAttr|setDomProp|setLive|setBool|setClass|setStyle|setStyleProp|setClassList|setHtml|bindProp)\(/;
  if (!writes.test(code)) {
    throw new Error("self-check corruption is stale: the emitted module applies no props");
  }

  /** Reverse every maximal run of consecutive matching units. */
  const flip = (units: string[]): string[] => {
    const out: string[] = [];
    let run: string[] = [];
    for (const unit of units) {
      if (writes.test(unit)) {
        run.push(unit);
        continue;
      }
      out.push(...run.reverse(), unit);
      run = [];
    }
    out.push(...run.reverse());
    return out;
  };

  // Two passes, because a write can sit at two levels now. Inside a fused
  // effect the writes are consecutive LINES, and reversing the effect as a
  // whole would not touch them; between statements a live prop's write is
  // wrapped in the effect the compiler emitted for it, and reversing lines
  // would not touch THAT. A one-level corruption went quietly inert on one of
  // the two shapes, which is the way a self-check stops being one.
  const lines = flip(code.split("\n"));

  const statements: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/_\$+bindEffect\(/.test(lines[i])) {
      statements.push(lines[i]);
      continue;
    }
    const indent = lines[i].length - lines[i].trimStart().length;
    let end = i;
    while (end < lines.length && lines[end].trimEnd() !== `${" ".repeat(indent)}});`) end++;
    statements.push(lines.slice(i, Math.min(end + 1, lines.length)).join("\n"));
    i = Math.min(end, lines.length - 1);
  }
  return flip(statements).join("\n");
}

/**
 * Fixtures that are known-divergent and deliberately parked. Every entry needs
 * a one-line reason; nothing is ever deleted from the corpus to make the suite
 * green. Empty today.
 *
 * A park switches the sweeps below off for its fixture, so a park that outlives
 * the bug it describes is a silent hole. `the parked list has no stale entries`
 * re-runs the audit for every parked name and fails if it now passes.
 */
const PARKED: Record<string, string> = {};

const fixtures = listFixtures();

describe("compiled render integrity", () => {
  it("the corpus is big enough to mean something", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(25);
  });

  for (const name of fixtures) {
    const parked = PARKED[name];
    const run = parked ? it.todo : it;
    run(`${name}${parked ? ` — ${parked}` : ""}`, async () => {
      await assertCompiledIsClean(name);
    });
  }

  it("the parked list has no stale entries", async () => {
    for (const name of Object.keys(PARKED)) {
      expect(fixtures, `${name} is parked but is not a fixture`).toContain(name);
      const result = await auditCompiled(name);
      expect(result.ok, `${name} is parked as divergent but is now clean — delete the park`).toBe(
        false,
      );
    }
  }, 60_000);

  /**
   * Across the whole cycle, not just the first frame. K7 deletes the markers a
   * control-flow instance used to splice in, so a root-position `Show` that
   * starts closed and has no fallback renders exactly nothing at frame 0 —
   * correctly. Asserting frame 0 alone would be asserting the comment nodes are
   * back. What "the compiler is doing work" needs is that SOME frame the fixture
   * drives has DOM in it.
   */
  it("the compiled path produces non-empty DOM for every fixture", async () => {
    for (const name of fixtures) {
      if (PARKED[name] !== undefined) continue;
      const result = await renderViaCompiler(name);
      const widest = Math.max(result.html.length, ...result.frames.map((frame) => frame.length));
      expect(widest, `nothing rendered for ${name}, in any frame`).toBeGreaterThan(0);
    }
  }, 60_000);

  /**
   * A fixture whose steps change nothing is a fixture whose step channel is
   * decoration: every DOM assertion after frame 0 compares two identical
   * strings and a dropped binding is invisible.
   *
   * Under the retired oracle this list held four exceptions, and all four were
   * statements about the REFERENCE rather than about the fixture —
   * `createElement` reads a bare `{count()}` once at construction, so
   * `auto-thunked-read`, `equal-liveness` and `ref-writable-binding` were inert
   * on the reference and declared `wins` against it, and `spread-static-mix`
   * read its spread object exactly once. The compiled path binds all four (O4,
   * B1, B3, and `_$spread`'s source list), so the exception list is now empty
   * and the assertion is the flat one.
   */
  it("fixtures declaring steps actually observe a DOM change", async () => {
    const withSteps: string[] = [];
    const inert: string[] = [];

    for (const name of fixtures) {
      if (PARKED[name] !== undefined) continue;
      if (!/^export const steps\b/m.test(fixtureSource(name))) continue;
      withSteps.push(name);
      const result = await renderViaCompiler(name);
      if (!result.frames.some((f) => f !== result.html)) inert.push(name);
    }

    // Raised with the shape catalogue: the floor is what says the sweep is
    // still looking at most of the corpus, so it has to move when the corpus does.
    expect(withSteps.length).toBeGreaterThanOrEqual(40);
    expect(inert).toEqual([]);
  }, 60_000);

  it("fixtures declaring events actually observe a DOM change", async () => {
    const withEvents: string[] = [];

    for (const name of fixtures) {
      if (PARKED[name] !== undefined) continue;
      if (!/^export const events\b/m.test(fixtureSource(name))) continue;
      withEvents.push(name);
      const result = await renderViaCompiler(name);
      const baseline = result.frames.at(-1) ?? result.html;
      expect(
        result.eventFrames.some((f) => f !== baseline),
        `${name} dispatches events that change nothing`,
      ).toBe(true);
    }

    expect(withEvents.length).toBeGreaterThanOrEqual(5);
  }, 60_000);

  it("the marker bound is an equality for every fixture, with nothing excused", async () => {
    // There used to be a degraded bound here, and a list of seven fixtures on
    // it: a module that clones a template an unknown number of times could not
    // be held to "the anchors in the DOM ARE the anchors the templates bake in",
    // so it dropped to "a module whose templates bake none cannot produce one" —
    // no check at all for a module that bakes one, which every fixture below
    // does. The expectation is now taken off the clones themselves, so it is an
    // equality everywhere and the list is gone rather than merely shorter.
    const wasDegraded = [
      "component-boundary-props",
      "component-spread",
      "context-provider",
      "dedup-identical-markup",
      "props-destructured-param",
      "props-renamed-and-defaulted",
      "two-components-two-templates",
    ];
    for (const name of wasDegraded) {
      expect(fixtures, `${name} is no longer a fixture — fix this list`).toContain(name);
      const result = await renderViaCompiler(name);
      // Each of them really is a module the old predicate gave up on: it calls a
      // component AND bakes an anchor. Without both halves this is a list of
      // fixtures that were never degraded in the first place.
      expect(templateAnchors(result.code ?? ""), `${name} bakes no anchor`).toBeGreaterThan(0);
      // C1 moved the call shape: a component takes its scope first, so the
      // props object is the SECOND argument.
      const callsComponent =
        /\b[A-Z][\w$]*\(_s\$,\s*(\{|_\$props\()|\)\s*\(_s\$,\s*(\{|_\$props\()/;
      expect(
        callsComponent.test(stripLiterals(result.code ?? "")),
        `${name} calls no component`,
      ).toBe(true);
      // And the bound is now live on it: a real number per frame, compared for
      // equality by `auditCompiled`.
      expect(result.expectedAnchors.length).toBe(result.channels.length);
      expect(
        result.channels.map((frame) => frame.anchors),
        `${name} marker layout`,
      ).toEqual(result.expectedAnchors);
    }
  }, 60_000);

  it("the exact marker bound catches a spurious anchor in a template cloned TWICE", async () => {
    // The mutation the degraded bound could not see. `dedup-identical-markup`
    // folds `Left` and `Right` onto ONE template and calls both, so that
    // template is cloned twice and the old rule said only "this module bakes an
    // anchor, so it may produce any number of them".
    const result = await auditCompiled("dedup-identical-markup", {
      emitted: (code) => {
        const out = code.replace("<span>x</span>", "<span>x</span><!---->");
        if (out === code) throw new Error("self-check corruption is stale");
        return out;
      },
    });
    expect(result.ok).toBe(false);
    const marker = result.divergences.filter((d) => d.kind === "marker-count");
    expect(marker.length).toBeGreaterThan(0);
    // TWO anchors baked where ONE is used: the audit is code against code and
    // does not care how often the template is cloned.
    expect(marker.some((d) => d.actual === "2" && d.expected === "1")).toBe(true);
    // And the subject really is a template cloned TWICE, which is the half the
    // old bound could not account for and the reason this fixture is here: the
    // expected anchor count per frame grows by 2 for the one anchor added.
    const clean = await renderViaCompiler("dedup-identical-markup");
    expect(
      result.render.expectedAnchors[0]! - clean.expectedAnchors[0]!,
      "one baked anchor, two clones",
    ).toBe(2);
  });

  it("the reactivity tracer is intercepting effect creation", async () => {
    // Without this every effect channel goes inert the moment mock.module stops
    // resolving signals.ts, and `effect-counts.ts` becomes a table of zeroes
    // that agrees with itself.
    let tracked = 0;
    for (const name of fixtures) {
      if (PARKED[name] !== undefined) continue;
      const result = await renderViaCompiler(name);
      if (result.trace.created > 0) tracked++;
    }
    expect(
      tracked,
      "the tracer counted nothing — mock.module is no longer intercepting",
    ).toBeGreaterThanOrEqual(20);
  }, 60_000);

  it("every fixture creating an effect reports a non-zero run count", async () => {
    for (const name of fixtures) {
      if (PARKED[name] !== undefined) continue;
      const result = await renderViaCompiler(name);
      if (result.trace.created === 0) continue;
      expect(
        result.trace.totalRuns,
        `${name} created effects that never ran`,
      ).toBeGreaterThanOrEqual(result.trace.created);
    }
  }, 60_000);
});

describe("rendered DOM golden", () => {
  /**
   * The absolute grader for rendered DOM, and the half that had been carried by
   * the retired reference. §6 L4 assigns a golden to attribute order, emitted
   * bytes, diagnostics and sourcemaps for a reason that applies here word for
   * word — "a silently-dropped diagnostic, a corrupted mapping or a size
   * regression becomes a visible diff" — and once the reference is gone, the
   * DOM the compiler produces has the same need and no other grader.
   *
   * What it records is every frame the fixture drives, plus the attribute-order
   * channel, which `normalize.ts` rule 2 sorts out of the main diff. A
   * differential can only ever say the two sides agree; this says WHAT they
   * agree on, which is the thing a review can read.
   */
  for (const name of fixtures) {
    if (PARKED[name] !== undefined) continue;
    it(`${name}: rendered DOM`, async () => {
      const result = await renderViaCompiler(name);
      const frames = [
        `initial: ${result.html}`,
        ...result.frames.map((frame, i) => `step ${i}: ${frame}`),
        ...result.eventFrames.map((frame, i) => `event ${i}: ${frame}`),
        ...result.channels.flatMap((frame, i) =>
          frame.attributes.map((line) => `attrs ${i}: ${line}`),
        ),
      ];
      expect(frames.join("\n")).toMatchSnapshot();
    });
  }

  it("records exactly one DOM snapshot per fixture", () => {
    const recorded = new Set<string>();
    const text = readFileSync(
      join(import.meta.dir, "__snapshots__", "oracle.test.ts.snap"),
      "utf8",
    );
    for (const [, name] of text.matchAll(
      /^exports\[`rendered DOM golden (.+): rendered DOM 1`\]/gm,
    )) {
      recorded.add(name);
    }
    const live = new Set(fixtures.filter((name) => !PARKED[name]));

    expect([...recorded].filter((name) => !live.has(name))).toEqual([]);
    expect([...live].filter((name) => !recorded.has(name))).toEqual([]);
  });
});

describe("marker channel", () => {
  /**
   * `normalize.ts` rule 4 has to drop empty comments — an anchor is invisible in
   * the main diff by construction — so the anchors live here instead:
   * `channels.markers` is the same walk with every anchor kept in place and no
   * text fused across one, snapshotted per fixture.
   *
   * This is the behavioural test target #9 (marker elision, M4) does not
   * otherwise have. Every anchor elision removes shows up as a line in this
   * snapshot's diff, and an anchor removed where something still follows the
   * hole shows up as a `bun test` failure on the DOM golden above.
   */
  for (const name of fixtures) {
    if (PARKED[name] !== undefined) continue;
    it(`${name}: anchor layout`, async () => {
      const compiled = await renderViaCompiler(name);
      expect(compiled.channels[0].markers).toMatchSnapshot();
    });
  }

  /**
   * The same invariant `roundtrip.test.ts` states over its own snapshot file:
   * one entry per live fixture, in both directions, so a recorded entry with no
   * fixture behind it is a stale snapshot and a fixture with no entry is an
   * unrecorded one. Asserted here rather than read off `git diff`, so it holds
   * whatever HEAD happens to contain.
   *
   * The file is read as it stood when the run started — bun rewrites it on
   * completion — so the run that ADDS a fixture reports the miss and the next
   * one is green.
   */
  it("records exactly one marker snapshot per fixture", () => {
    const recorded = new Set<string>();
    const text = readFileSync(
      join(import.meta.dir, "__snapshots__", "oracle.test.ts.snap"),
      "utf8",
    );
    for (const [, name] of text.matchAll(/^exports\[`marker channel (.+): anchor layout 1`\]/gm)) {
      recorded.add(name);
    }
    const live = new Set(fixtures.filter((name) => !PARKED[name]));

    expect([...recorded].filter((name) => !live.has(name))).toEqual([]);
    expect([...live].filter((name) => !recorded.has(name))).toEqual([]);
  });
});

describe("node-identity self-check", () => {
  // Every other channel is a function of the DOM's SHAPE, so a build that
  // reused a node where the clean one rebuilt it — or rebuilt where the clean
  // one reused — produces byte-identical html, markers, attributes and anchor
  // counts. These are the mutations that prove the channel is not inert.
  //
  // The unconditional version of this property is `metamorphic.ts`, which
  // compares a render against ITSELF under a transform of the input and needs
  // no second render at all. What lives here is the DETECTOR: proof that a
  // corrupted build shows up on this channel and on no other.

  it("catches a control-flow body handed over as a node instead of as a thunk", async () => {
    // The M5 miscompile, exactly: unwrapping the author's `() => _tmpl$N()`
    // evaluates the body once at call time, so `branch` re-inserts the SAME node
    // on every toggle where the clean build calls the Block again. The fixture
    // toggles off and back on, so the clean build really does build two.
    const unwrapThunk = (code: string): string => {
      const out = code.replace(
        /([\w$]*block)\(\(_s\$\) => (_tmpl\$\d+)\(\)\)/g,
        "$1((_s$) => ($2.$$n ??= $2()))",
      );
      if (out === code) {
        throw new Error(
          "self-check corruption is stale: no `_$block((_s$) => _tmpl$N())` to memoise",
        );
      }
      return out;
    };
    const result = await compareToClean("control-flow-show-static-body", { emitted: unwrapThunk });
    expect(result.ok).toBe(false);
    const kinds = new Set(result.divergences.map((d) => d.kind));
    // And by NOTHING else: this is the measurement of how blind the rest of the
    // harness is to node identity.
    expect([...kinds]).toEqual(["node-identity-differential"]);
  });

  it("catches a re-render that rebuilds a subtree the clean build kept", async () => {
    // The opposite direction: forcing the body to build a fresh node every time
    // the branch key is read makes the corrupted build churn where the clean
    // one's Block result is stable.
    const rebuildEveryFrame = (code: string): string => {
      const out = code.replace(
        /([\w$]*block\()\(_s\$\) => (_tmpl\$\d+)\(\)/g,
        '$1(_s$) => { const _n = $2(); _n.setAttribute("data-x", ""); _n.removeAttribute("data-x"); return _n }',
      );
      if (out === code) throw new Error("self-check corruption is stale");
      return out;
    };
    // Same nodes, same attributes, same everything — the corruption is a no-op
    // for every channel including this one, which is what says the detector
    // above is measuring identity and not merely noticing a rewritten module.
    const result = await compareToClean("control-flow-show-static-body", {
      emitted: rebuildEveryFrame,
    });
    expect(result.ok, formatDivergences("control-flow-show-static-body", result.divergences)).toBe(
      true,
    );
  });

  it("the channel is live for the whole corpus, not silently empty", async () => {
    let elements = 0;
    for (const name of fixtures) {
      const result = await renderViaCompiler(name);
      for (const frame of result.channels) elements += frame.identity.length;
    }
    expect(elements).toBeGreaterThan(400);
  }, 120_000);
});

describe("marker channel self-check", () => {
  it("catches one spurious anchor per text node, across the whole corpus", async () => {
    // The exact mutation the harness used to survive green. Every fixture whose
    // templates carry text has to go red under it.
    const affected: string[] = [];
    const survived: string[] = [];
    const caughtElsewhere: string[] = [];

    for (const name of fixtures) {
      if (PARKED[name] !== undefined) continue;
      const clean = compileFixture(name);
      if (!clean.includes("_$template(")) continue;
      if (anchorAfterEveryText(clean) === clean) continue;
      affected.push(name);
      const result = await auditCompiled(name, { emitted: anchorAfterEveryText });
      if (result.ok) survived.push(name);
      const kinds = new Set(result.divergences.map((d) => d.kind));
      if (kinds.size !== 1 || !kinds.has("marker-count")) caughtElsewhere.push(name);
    }

    expect(affected.length).toBeGreaterThanOrEqual(20);
    expect(survived).toEqual([]);
    // Every one of them is caught by the marker channel and by NOTHING else,
    // which is the measurement of how blind the DOM diff is to an anchor.
    expect(caughtElsewhere).toEqual([]);
  }, 120_000);

  it("a spurious anchor is invisible to the DOM diff and caught by the count", async () => {
    const result = await compareToClean("text-hole-trailing", {
      emitted: (code) => code.replace('<div class="counter">', '<div class="counter"><!---->'),
    });
    expect(result.ok).toBe(false);
    expect(result.divergences.map((d) => d.kind)).toEqual(["marker-count"]);
  });

  it("two anchors in different places keep the same count and DOM, and only the layout shows it", async () => {
    // Target #9 removed the spare anchor this used to move: after elision
    // `text-hole-followed` inserts before the <span> itself and bakes no
    // comment at all, so there is nothing left in the corpus to relocate. The
    // claim is the same one, stated on an anchor that is ADDED at two different
    // positions instead: identical anchor counts, identical rendered
    // characters, and only the layout channel can tell them apart. That is what
    // the per-fixture snapshot above is guarding, and it is why the snapshot
    // cannot be replaced by a count.
    const before = (code: string) =>
      code.replace("</div><p>sibling</p>", "</div><!----><p>sibling</p>");
    const after = (code: string) => code.replace("<p>sibling</p>", "<p>sibling</p><!---->");

    const clean = await renderViaCompiler("deep-walk");
    const first = await renderViaCompiler("deep-walk", { emitted: before });
    const second = await renderViaCompiler("deep-walk", { emitted: after });

    expect(first.code).not.toBe(clean.code);
    expect(second.code).not.toBe(first.code);
    expect(first.html).toBe(clean.html);
    expect(second.html).toBe(clean.html);
    expect(countAnchors(first.channels[0].markers)).toBe(1);
    expect(countAnchors(second.channels[0].markers)).toBe(1);
    expect(first.channels[0].markers).not.toBe(second.channels[0].markers);

    // And both are anchors nothing inserts before, so the exact bound reports
    // them where the DOM diff and the counts cannot.
    for (const corrupt of [before, after]) {
      const result = await compareToClean("deep-walk", { emitted: corrupt });
      expect(result.divergences.map((d) => d.kind)).toEqual(["marker-count"]);
    }
  });
});

describe("attribute-order channel", () => {
  /**
   * `normalize.ts` rule 2 sorts attributes, because inline-into-template and
   * setProp-after-clone genuinely reorder them and the main diff would fail
   * every fixture otherwise. So order lives on its own channel, at two grades.
   *
   * ABSOLUTE: the per-fixture DOM golden above records every element's
   * attribute line verbatim, so any reordering anywhere in the corpus is a
   * visible diff. That is the grade §6 L4 assigns attribute order, and it is
   * what the retired reference was standing in for.
   *
   * SELF-CHECK: `auditCompiled` asserts the PARTITION — every prop the patch
   * code writes reaches the element after every attribute the template baked
   * in. That is what source order lowers to on both backends (§5.3), and it
   * holds without any reference at all.
   *
   * The two below are the detectors that say neither grade is inert.
   */
  it("reversing the order attributes are baked into the template goes red", async () => {
    for (const name of ["static-only", "svg", "svg-dynamic-class"]) {
      const result = await compareToClean(name, { emitted: reverseBakedAttributes });
      expect(result.ok, name).toBe(false);
      // Nothing else sees it: the main diff sorts, so this is the only channel.
      expect([...new Set(result.divergences.map((d) => d.kind))], name).toEqual([
        "attribute-order",
      ]);
    }
  });

  it("reversing the order the patch code applies props in goes red", async () => {
    for (const name of ["multi-prop-one-element", "reactive-attribute", "svg-dynamic-class"]) {
      const result = await compareToClean(name, { emitted: reverseAppliedProps });
      expect(result.ok, name).toBe(false);
      expect([...new Set(result.divergences.map((d) => d.kind))], name).toEqual([
        "attribute-order",
      ]);
    }
  });

  it("a static attribute that merely trails a dynamic one in source is not a divergence", async () => {
    // reactive-attribute is `<a href={…} class={…} data-static="keep">`: the
    // template bakes data-static in first and the patch code sets href and
    // class after. That is the partition, and it must stay green.
    const result = await auditCompiled("reactive-attribute");
    expect(result.divergences).toEqual([]);
  });

  it("the partition is live for most of the corpus, not silently empty", async () => {
    let withAttributes = 0;
    for (const name of fixtures) {
      if (PARKED[name] !== undefined) continue;
      const compiled = await renderViaCompiler(name);
      if (compiled.channels[0].attributes.length > 0) withAttributes++;
    }
    expect(withAttributes).toBeGreaterThanOrEqual(30);
  }, 60_000);

  it("the partition goes red when a baked attribute lands after a patched one", async () => {
    // The partition can only be trusted if a violation of it is reachable. Move
    // a baked attribute out of the template and write it AFTER the live ones,
    // which is the shape a mis-ordered codegen produces.
    const result = await auditCompiled("reactive-attribute", {
      emitted: (code) => {
        const out = code
          .replace(' data-static="keep"', "")
          .replace(
            /\n(\s*)return (_el\$\d+)/,
            (_m, indent: string, el: string) =>
              `\n${indent}${el}.setAttribute("data-static", "keep");\n${indent}return ${el}`,
          );
        if (out === code) throw new Error("self-check corruption is stale");
        return out;
      },
    });
    expect(result.divergences.map((d) => d.kind)).toContain("attribute-order");
  });
});

describe("template parse conformance", () => {
  /**
   * `template()` returns `content.firstChild`, so a template string the parser
   * splits into more than one root silently loses everything after the first —
   * and it is the tree-construction algorithm, not the compiler, that decides.
   * `src/lower/parse.rs` is the predicate that keeps those shapes out; this is
   * the corpus-level check that it is actually doing so.
   *
   * KNOWN LIMIT: happy-dom's tree construction is a subset of the real one. It
   * does not foster-parent, does not auto-close `<p>`, and does not run the
   * adoption agency, so this sweep can only catch the cases it does model. The
   * table in `src/lower/parse.rs` is spec-derived and its Rust tests are what
   * hold the predicate honest. `bun test/browser-parse-check.ts` runs the same
   * sweep against a real Chrome and is the strong version; it is out of the
   * suite on purpose, because CI has no browser.
   */
  function templateStrings(code: string): string[] {
    return [...code.matchAll(/_\$template\(`([\s\S]*?)`(?:,\s*(true))?\)/g)].map((m) =>
      m[2] ? `<svg xmlns="http://www.w3.org/2000/svg">${m[1]}</svg>` : m[1],
    );
  }

  it("every emitted template parses to exactly one root", () => {
    let checked = 0;
    for (const name of fixtures) {
      for (const html of templateStrings(compileFixture(name))) {
        const host = document.createElement("template");
        host.innerHTML = html;
        expect(
          host.content.childNodes.length,
          `${name}: \`${html}\` parses to ${host.content.childNodes.length} roots`,
        ).toBe(1);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(40);
  });

  it("the shapes the browser reshapes are refused, as far as this parser can tell", () => {
    // Each of these was checked in a real browser. happy-dom agrees on some and
    // not others, so the assertion is on the COMPILER's refusal, which is the
    // thing that has to hold either way.
    const cases: Array<[string, string]> = [
      ["<table>text</table>", "<table>"],
      ["<div><body>b</body></div>", "<body"],
      // A raw-text element with a hole in it KEEPS its template since M9 — what
      // it may not do is bake anything into it, because a `<!---->` there is
      // text and a literal `</style` closes the element. So the forbidden shape
      // is the CONTENT, not the tag.
      ["<style>{css}</style>", "<style>."],
      ["<textarea>{value}</textarea>", "<textarea>x"],
      ["<div><style>{`a`}&lt;/style&gt;</style></div>", "</style></style>"],
    ];
    for (const [jsx, forbidden] of cases) {
      const code = compileSource(`const V = () => ${jsx};\n`, "probe.tsx");
      for (const html of templateStrings(code)) {
        expect(html, jsx).not.toContain(forbidden);
      }
    }

    // The same rule stated positively: the element is baked EMPTY, and its
    // whole child list is one insert.
    for (const [jsx, template] of [
      ["<style>{css}</style>", "<style></style>"],
      ["<textarea>x {value} y</textarea>", "<textarea></textarea>"],
    ]) {
      const code = compileSource(`const V = () => ${jsx};\n`, "probe.tsx");
      expect(templateStrings(code), jsx).toEqual([template]);
    }
  });
});

describe("harness self-check", () => {
  // §6 L6, the layer no other project in the survey has: "would my suite notice
  // a wrong compiler change?" Each case corrupts one thing and names the
  // detector that must catch it; if any of these start passing, the
  // corresponding assertion above has stopped working.
  //
  // The reference for every one of them is the CLEAN compiled render of the
  // same fixture. That is not a second implementation — it is the same compiler
  // on the same source with nothing broken — so it cannot share an
  // implementation's defect, which is the objection §6 raises against the
  // retired `createElement` oracle.

  it("detects a changed static attribute value (initial-dom)", async () => {
    const result = await compareToClean("text-hole-trailing", {
      emitted: (code) => code.replace('"counter"', '"corrupted"'),
    });
    expect(result.ok).toBe(false);
    expect(result.divergences.map((d) => d.kind)).toContain("initial-dom");
  });

  it("detects a dropped reactive binding only after a scripted update (step-dom)", async () => {
    // `.peek()` is the runtime's own escape hatch: a read that is deliberately
    // not tracked, so the hole can never update. `{count()}` used to serve here
    // and no longer does — O4 auto-thunking makes the compiler keep THAT one
    // live, which is a fix, not a corruption.
    const result = await compareToClean("text-hole-trailing", {
      source: (src) => src.replace("{() => count()}", "{count.peek()}"),
    });
    expect(result.ok).toBe(false);
    // The initial render is identical — this is precisely the corruption that a
    // render-only harness cannot see, so driving the steps is what catches it.
    expect(result.divergences.map((d) => d.kind)).toContain("step-dom");
    expect(result.divergences.map((d) => d.kind)).not.toContain("initial-dom");
  });

  it("detects extra reactive work on identical DOM (effect-count)", async () => {
    const result = await compareToClean("static-only", {
      source: (src) => src.replace('class="card"', 'class={() => "card"}'),
    });
    expect(result.ok).toBe(false);
    expect(result.divergences.map((d) => d.kind)).toContain("effect-count");
    // The DOM is byte-identical; only the effect channel catches this.
    expect(result.divergences.map((d) => d.kind)).not.toContain("initial-dom");
    expect(result.effectDelta).toBeGreaterThan(0);
  });

  it("detects a removed element (initial-dom)", async () => {
    const result = await compareToClean("static-only", {
      source: (src) => src.replace("<li>two</li>", ""),
    });
    expect(result.ok).toBe(false);
    expect(result.divergences.map((d) => d.kind)).toContain("initial-dom");
  });

  it("whitespace normalization does not mask a text-content change", async () => {
    // Rule 3 of normalize.ts drops whitespace-only text that contains a
    // newline. A trailing space INSIDE a text node is not that, and must fail.
    const result = await compareToClean("static-only", {
      source: (src) => src.replace(">Barq<", ">Barq <"),
    });
    expect(result.ok).toBe(false);
    expect(result.divergences.map((d) => d.kind)).toContain("initial-dom");
  });

  it("attribute sorting does not mask a changed attribute value", async () => {
    const result = await compareToClean("static-only", {
      source: (src) => src.replace('data-kind="static"', 'data-kind="dynamic"'),
    });
    expect(result.ok).toBe(false);
    expect(result.divergences.map((d) => d.kind)).toContain("initial-dom");
  });

  it("detects a dropped delegated handler (event-dom)", async () => {
    const result = await compareToClean("delegated-event", {
      source: drop("onClick={() => count.update((n) => n + 1)}"),
    });
    expect(result.ok).toBe(false);
    expect(result.divergences.map((d) => d.kind)).toContain("event-dom");
    // The handler is invisible until an event is dispatched: neither the
    // initial render nor the scripted signal writes can see it missing.
    expect(result.divergences.map((d) => d.kind)).not.toContain("initial-dom");
    expect(result.divergences.map((d) => d.kind)).not.toContain("step-dom");
  });

  it("detects a dropped non-delegated handler (event-dom)", async () => {
    const result = await compareToClean("non-delegated-event", {
      source: drop("onMouseLeave={() => hovered.set(false)}"),
    });
    expect(result.ok).toBe(false);
    expect(result.divergences.map((d) => d.kind)).toContain("event-dom");
  });

  it("detects a dropped tuple handler (event-dom)", async () => {
    const result = await compareToClean("delegated-handler-tuple", {
      source: drop('onClick={[pick, "b"]}'),
    });
    expect(result.ok).toBe(false);
    expect(result.divergences.map((d) => d.kind)).toContain("event-dom");
  });

  it("detects a dropped object ref (step-dom)", async () => {
    const result = await compareToClean("ref-binding", { source: drop(" ref={box}") });
    expect(result.ok).toBe(false);
    expect(result.divergences.map((d) => d.kind)).toContain("step-dom");
  });

  it("detects a dropped callback ref (initial-dom)", async () => {
    const result = await compareToClean("ref-binding", {
      source: drop(' ref={(el: HTMLElement) => el.setAttribute("data-reffed", "yes")}'),
    });
    expect(result.ok).toBe(false);
    expect(result.divergences.map((d) => d.kind)).toContain("initial-dom");
  });

  it("indentation is dropped in a <div> and kept in a <pre>", () => {
    // Constructed rather than compiled: JSX text cleaning removes indentation on
    // both paths today, so only a hand-built DOM reaches the normalizer's rule.
    // A compiled <pre> that loses its source indentation must not read as equal.
    const build = (tag: string, gap: string): HTMLElement => {
      const host = document.createElement("div");
      host.appendChild(document.createElement(tag)).innerHTML = `<b>B</b>${gap}<i>c</i>`;
      return host;
    };
    expect(normalizeDom(build("div", "\n   "))).toBe(normalizeDom(build("div", "")));
    expect(normalizeDom(build("pre", "\n   "))).not.toBe(normalizeDom(build("pre", "")));
    expect(normalizeDom(build("textarea", "\n   "))).not.toBe(normalizeDom(build("textarea", "")));
  });

  it("detects a spurious template marker (marker-count)", async () => {
    // normalize.ts rule 4 fuses text runs across an empty comment, so no DOM
    // comparison can see this one. The count bound is the only detector.
    const result = await compareToClean("text-hole-trailing", {
      emitted: (code) => code.replace('<div class="counter">', '<div class="counter"><!---->'),
    });
    expect(result.ok).toBe(false);
    expect(result.divergences.map((d) => d.kind)).toContain("marker-count");
  });

  /**
   * The channel that made `goesLive` necessary, stated without it.
   *
   * Turning a static attribute into a live one costs exactly one effect that
   * re-runs once per frame. Under the retired oracle that read as the compiled
   * path creating MORE effects than the reference, so the fixture had to buy
   * the difference back with a declaration. Between two builds of one fixture
   * there is nothing to buy: the corruption creates one effect the clean build
   * does not, the equality reports it, and `effect-counts.ts` carries the
   * absolute number for the clean build.
   */
  it("a hole that goes live costs one effect, re-running once per frame", async () => {
    const goLive = (src: string) =>
      src.replace('class="counter"', 'class={() => (count(), "counter")}');

    const result = await compareToClean("text-hole-trailing", { source: goLive });
    expect(result.divergences.map((d) => d.kind)).toContain("effect-count");
    expect(result.effectDelta).toBe(1);
    // The run delta is per-frame, which is exactly what a flat `+ 1` bound used
    // to get wrong.
    expect(result.runDelta).toBeGreaterThan(1);
    // And the DOM is identical throughout: this is reactive work nothing else
    // in the harness can see.
    expect(result.divergences.map((d) => d.kind)).not.toContain("initial-dom");
    expect(result.divergences.map((d) => d.kind)).not.toContain("step-dom");
  });

  it("an uncorrupted fixture is not reported as divergent", async () => {
    const result = await compareToClean("text-hole-trailing", {});
    expect(result.divergences).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
