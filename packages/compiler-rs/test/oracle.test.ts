import { describe, expect, it } from "bun:test"

import {
  assertMatchesOracle,
  boundEffects,
  compareToOracle,
  compileFixture,
  compileSource,
  drive,
  fixtureSource,
  formatDivergences,
  listFixtures,
  renderViaCompiler,
  renderViaRuntime,
  stripLiterals,
  templateAnchors,
} from "./harness.ts"
import { countAnchors, normalizeDom } from "./normalize.ts"

/**
 * Corrupt the compiled path by deleting one exact substring of the fixture
 * source. It throws when the substring is gone, so a fixture edit turns a
 * self-check into a loud failure instead of a silent no-op.
 */
function drop(needle: string): (source: string) => string {
  return (source) => {
    if (!source.includes(needle)) {
      throw new Error(`self-check corruption is stale: ${JSON.stringify(needle)} is not in the fixture`)
    }
    return source.replace(needle, "")
  }
}

/**
 * Rewrite the HTML inside every `_$template(...)` of an emitted module. Throws
 * when there is nothing to rewrite, so a corruption cannot go quietly inert.
 */
function inTemplates(mutate: (html: string) => string): (code: string) => string {
  return (code) => {
    let seen = 0
    const out = code.replace(/(_\$template\(`)([\s\S]*?)(`)/g, (_m, open, html: string, close) => {
      seen++
      return open + mutate(html) + close
    })
    if (seen === 0) {
      throw new Error("self-check corruption is stale: the emitted module has no _$template")
    }
    return out
  }
}

/** The mutation the harness used to survive: one spurious anchor per text node. */
const anchorAfterEveryText = inTemplates((html) => html.replace(/>([^<>]+)</g, ">$1<!----><"))

/** Reverse the attribute order the templates were emitted with. */
const reverseBakedAttributes = inTemplates((html) =>
  html.replace(/<([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+="[^"]*"){2,})/g, (_m, tag, attrs: string) => {
    const pairs = [...attrs.matchAll(/\s+([^\s=>/]+="[^"]*")/g)].map((p) => p[1])
    return `<${tag} ${pairs.reverse().join(" ")}`
  }),
)

/** Reverse the order the patch code applies props in, run by consecutive run. */
function reverseAppliedProps(code: string): string {
  const out: string[] = []
  let run: string[] = []
  for (const line of code.split("\n")) {
    if (line.includes("_$setProp(")) {
      run.push(line)
      continue
    }
    out.push(...run.reverse(), line)
    run = []
  }
  out.push(...run.reverse())
  if (!code.includes("_$setProp(")) {
    throw new Error("self-check corruption is stale: the emitted module applies no props")
  }
  return out.join("\n")
}

/**
 * Fixtures that are known-divergent and deliberately parked. Every entry needs
 * a one-line reason; nothing is ever deleted from the corpus to make the suite
 * green. Empty today.
 *
 * A park switches nine assertion loops off for its fixture, so a park that
 * outlives the bug it describes is a silent hole. `the parked list has no stale
 * entries` below re-runs the comparison for every parked name and fails if it
 * now passes — the same staleness check `NO_DECLARATION` and `wins` already get.
 */
const PARKED: Record<string, string> = {}

const fixtures = listFixtures()

describe("oracle equivalence", () => {
  it("the corpus is big enough to mean something", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(25)
  })

  for (const name of fixtures) {
    const parked = PARKED[name]
    const run = parked ? it.todo : it
    run(`${name}${parked ? ` — ${parked}` : ""}`, async () => {
      await assertMatchesOracle(name)
    })
  }

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
    ]
    for (const name of wasDegraded) {
      expect(fixtures, `${name} is no longer a fixture — fix this list`).toContain(name)
      const result = await renderViaCompiler(name)
      // Each of them really is a module the old predicate gave up on: it calls a
      // component AND bakes an anchor. Without both halves this is a list of
      // fixtures that were never degraded in the first place.
      expect(templateAnchors(result.code ?? ""), `${name} bakes no anchor`).toBeGreaterThan(0)
      expect(/\b[A-Z][\w$]*\(\s*\{|\)\s*\(\s*\{/.test(stripLiterals(result.code ?? "")), `${name} calls no component`).toBe(true)
      // And the bound is now live on it: a real number per frame, compared for
      // equality by `compareToOracle`.
      expect(result.expectedAnchors.length).toBe(result.channels.length)
      expect(
        result.channels.map((frame) => frame.anchors),
        `${name} marker layout`,
      ).toEqual(result.expectedAnchors)
    }
  }, 60_000)

  it("the exact marker bound catches a spurious anchor in a template cloned TWICE", async () => {
    // The mutation the degraded bound could not see, on the fixture the
    // exclusion was written for. `component-boundary-props` renders `Greeting`
    // twice, so its template is cloned twice and the old rule said only "this
    // module bakes an anchor, so it may produce any number of them".
    const result = await compareToOracle("component-boundary-props", {
      emitted: (code) => {
        const out = code.replace('<p class="greeting">', '<p class="greeting"><!---->')
        if (out === code) throw new Error("self-check corruption is stale")
        return out
      },
    })
    expect(result.ok).toBe(false)
    // TWO anchors reached the DOM for one baked — the clone count is exactly
    // what the old bound could not account for.
    const marker = result.divergences.filter((d) => d.kind === "marker-count")
    expect(marker.length).toBeGreaterThan(0)
    expect(marker.some((d) => d.compiled === "2" || d.oracle === "2")).toBe(true)
  })

  it("the parked list has no stale entries", async () => {
    for (const name of Object.keys(PARKED)) {
      expect(fixtures, `${name} is parked but is not a fixture`).toContain(name)
      const result = await compareToOracle(name)
      expect(
        result.ok,
        `${name} is parked as divergent but now matches the oracle — delete the park`,
      ).toBe(false)
    }
  }, 60_000)
})

describe("oracle path integrity", () => {
  // A harness whose oracle silently renders nothing would pass every
  // comparison. These assert the oracle is actually doing work.

  it("the oracle produces non-empty DOM for every fixture", async () => {
    for (const name of fixtures) {
      if (PARKED[name]) continue
      const result = await renderViaRuntime(name)
      expect(result.html.length, `oracle rendered nothing for ${name}`).toBeGreaterThan(0)
    }
  }, 60_000)

  it("fixtures declaring steps actually observe a DOM change", async () => {
    const withSteps: string[] = []
    const inert: string[] = []

    for (const name of fixtures) {
      if (PARKED[name]) continue
      if (!/^export const steps\b/m.test(fixtureSource(name))) continue
      withSteps.push(name)
      const result = await renderViaRuntime(name)
      const changed = result.frames.some((f) => f !== result.html)
      if (!changed) inert.push(name)
    }

    // Raised with the shape catalogue: the floor is what says the sweep is
    // still looking at most of the corpus, so it has to move when the corpus does.
    expect(withSteps.length).toBeGreaterThanOrEqual(40)
    // Three documented exceptions, and all three are statements about the
    // ORACLE:
    //
    //  - spread-static-mix: the un-compiled runtime reads a spread object
    //    exactly once, so its steps are SUPPOSED to be inert. That is the
    //    oracle's spread semantics, and what the compiler's reactive _$spread
    //    must be measured against.
    //  - auto-thunked-read: every hole is a BARE tracked read, which
    //    `createElement` evaluates once at construction. The compiled path
    //    binds them (O4), so the fixture declares the divergence as a win and
    //    the harness asserts the exact DOM the compiled path must produce.
    //  - component-getter-props: `createElement` copies the props object it is
    //    handed, so the oracle's prop is a snapshot and the cell can never
    //    change. The compiled call site passes a getter and it does — which is
    //    the fixture's declared win, and its step is what proves the oracle is
    //    the one standing still.
    //  - props-raw-forward: every read in the chain is a raw `props.x`, and
    //    `createElement` copies the props object at the outermost call, so the
    //    oracle freezes the whole chain at its first value.
    expect(inert).toEqual([
      "auto-thunked-read",
      "component-getter-props",
      "props-raw-forward",
      "spread-static-mix",
    ])
  }, 60_000)

  it("fixtures declaring events actually observe a DOM change", async () => {
    const withEvents: string[] = []

    for (const name of fixtures) {
      if (PARKED[name]) continue
      if (!/^export const events\b/m.test(fixtureSource(name))) continue
      withEvents.push(name)
      const result = await drive(name, "runtime")
      const baseline = result.frames.at(-1) ?? result.html
      const changed = result.eventFrames.some((f) => f !== baseline)
      expect(changed, `${name} dispatches events that change nothing`).toBe(true)
    }

    expect(withEvents.length).toBeGreaterThanOrEqual(5)
  }, 60_000)

  it("the reactivity tracer is intercepting effect creation", async () => {
    // Without this the effect bound goes inert the moment mock.module stops
    // resolving signals.ts, and every comparison silently reports 0 vs 0.
    let tracked = 0
    for (const name of fixtures) {
      if (PARKED[name]) continue
      const result = await renderViaRuntime(name)
      if (result.trace.created > 0) tracked++
    }
    expect(tracked, "the tracer counted nothing — mock.module is no longer intercepting").toBeGreaterThanOrEqual(20)
  }, 60_000)

  it("every fixture creating an effect reports a non-zero run count", async () => {
    for (const name of fixtures) {
      if (PARKED[name]) continue
      const result = await renderViaRuntime(name)
      if (result.trace.created === 0) continue
      expect(result.trace.totalRuns, `${name} created effects that never ran`).toBeGreaterThanOrEqual(
        result.trace.created,
      )
    }
  }, 60_000)
})

describe("marker channel", () => {
  /**
   * `normalize.ts` rule 4 has to drop empty comments — the oracle produces one
   * text node where a compiled template produces text, anchor, text — and it
   * cannot be weakened without failing every legitimate output. So the anchors
   * live here instead: `channels.markers` is the same walk with every anchor
   * kept in place and no text fused across one, snapshotted per fixture.
   *
   * This is the behavioural test target #9 (marker elision, M4) does not
   * otherwise have. When elision lands, every anchor it removes shows up as a
   * line in this snapshot's diff, and an anchor removed where something still
   * follows the hole shows up as a `bun test` failure on the DOM diff.
   */
  for (const name of fixtures) {
    if (PARKED[name]) continue
    it(`${name}: anchor layout`, async () => {
      const compiled = await renderViaCompiler(name)
      expect(compiled.channels[0].markers).toMatchSnapshot()
    })
  }
})

describe("node-identity channel self-check", () => {
  // Every other channel is a function of the DOM's SHAPE, so a compiled path
  // that reused a node where the oracle rebuilt one — or rebuilt where the
  // oracle reused — produced byte-identical html, markers, attributes and
  // anchor counts. These are the mutations that prove the channel is not inert.

  it("catches a control-flow body handed over as a node instead of as a thunk", async () => {
    // The M5 miscompile, exactly: unwrapping the author's `() => _tmpl$N()`
    // evaluates the body once at call time, so `Show` re-inserts the SAME node
    // on every toggle where the oracle calls the arrow again. The fixture
    // toggles off and back on, so the oracle really does build two.
    const unwrapThunk = (code: string): string => {
      const out = code.replace(/children: \(\) => (_tmpl\$\d+\(\))/g, "children: $1")
      if (out === code) {
        throw new Error("self-check corruption is stale: no `children: () => _tmpl$N()` to unwrap")
      }
      return out
    }
    const result = await compareToOracle("control-flow-show-static-body", { emitted: unwrapThunk })
    expect(result.ok).toBe(false)
    const kinds = new Set(result.divergences.map((d) => d.kind))
    // And by NOTHING else: this is the measurement of how blind the rest of the
    // harness is to node identity.
    expect([...kinds]).toEqual(["node-identity"])
  })

  it("catches a re-render that rebuilds a subtree the oracle kept", async () => {
    // The opposite direction, driven from the runtime side of the same fixture:
    // forcing `Show` to build a fresh node every time `when` is read makes the
    // compiled path churn where the oracle's thunk result is stable.
    const rebuildEveryFrame = (code: string): string => {
      const out = code.replace(
        /children: \(\) => (_tmpl\$\d+)\(\)/g,
        "children: () => { const _n = $1(); _n.setAttribute(\"data-x\", \"\"); _n.removeAttribute(\"data-x\"); return _n }",
      )
      if (out === code) throw new Error("self-check corruption is stale")
      return out
    }
    // Same nodes, same attributes, same everything — the corruption is a no-op
    // for every channel including this one, which is what says the detector
    // above is measuring identity and not merely noticing a rewritten module.
    const result = await compareToOracle("control-flow-show-static-body", {
      emitted: rebuildEveryFrame,
    })
    expect(result.ok, formatDivergences("control-flow-show-static-body", result.divergences)).toBe(true)
  })

  it("the channel is live for the whole corpus, not silently empty", async () => {
    let elements = 0
    for (const name of fixtures) {
      const result = await renderViaCompiler(name)
      for (const frame of result.channels) elements += frame.identity.length
    }
    expect(elements).toBeGreaterThan(400)
  }, 120_000)
})

describe("marker channel self-check", () => {
  it("catches one spurious anchor per text node, across the whole corpus", async () => {
    // The exact mutation the harness used to survive green. Every fixture whose
    // templates carry text has to go red under it.
    const affected: string[] = []
    const survived: string[] = []
    const caughtElsewhere: string[] = []

    for (const name of fixtures) {
      if (PARKED[name]) continue
      const clean = compileFixture(name)
      if (!clean.includes("_$template(")) continue
      if (anchorAfterEveryText(clean) === clean) continue
      affected.push(name)
      const result = await compareToOracle(name, { emitted: anchorAfterEveryText })
      if (result.ok) survived.push(name)
      const kinds = new Set(result.divergences.map((d) => d.kind))
      if (kinds.size !== 1 || !kinds.has("marker-count")) caughtElsewhere.push(name)
    }

    expect(affected.length).toBeGreaterThanOrEqual(20)
    expect(survived).toEqual([])
    // Every one of them is caught by the marker channel and by NOTHING else,
    // which is the measurement of how blind the DOM diff is to an anchor.
    expect(caughtElsewhere).toEqual([])
  }, 120_000)

  it("a spurious anchor is invisible to the DOM diff and caught by the count", async () => {
    const result = await compareToOracle("text-hole-trailing", {
      emitted: (code) => code.replace('<div class="counter">', '<div class="counter"><!---->'),
    })
    expect(result.ok).toBe(false)
    expect(result.divergences.map((d) => d.kind)).toEqual(["marker-count"])
  })

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
      code.replace("</div><p>sibling</p>", "</div><!----><p>sibling</p>")
    const after = (code: string) => code.replace("<p>sibling</p>", "<p>sibling</p><!---->")

    const clean = await renderViaCompiler("deep-walk")
    const first = await renderViaCompiler("deep-walk", { emitted: before })
    const second = await renderViaCompiler("deep-walk", { emitted: after })

    expect(first.code).not.toBe(clean.code)
    expect(second.code).not.toBe(first.code)
    expect(first.html).toBe(clean.html)
    expect(second.html).toBe(clean.html)
    expect(countAnchors(first.channels[0].markers)).toBe(1)
    expect(countAnchors(second.channels[0].markers)).toBe(1)
    expect(first.channels[0].markers).not.toBe(second.channels[0].markers)

    // And both are anchors nothing inserts before, so the exact bound reports
    // them where the DOM diff and the counts cannot.
    for (const corrupt of [before, after]) {
      const result = await compareToOracle("deep-walk", { emitted: corrupt })
      expect(result.divergences.map((d) => d.kind)).toEqual(["marker-count"])
    }
  })

  it("the oracle never produces an anchor of its own", async () => {
    // The compiled bounds are all stated against zero. If the runtime starts
    // manufacturing anchors on the un-compiled path they stop meaning anything.
    for (const name of fixtures) {
      if (PARKED[name]) continue
      const oracle = await renderViaRuntime(name)
      for (const frame of oracle.channels) {
        expect(countAnchors(frame.markers), `${name} oracle produced an anchor`).toBe(0)
      }
    }
  }, 60_000)
})

describe("attribute-order channel", () => {
  /**
   * `normalize.ts` rule 2 sorts attributes, because inline-into-template and
   * setProp-after-clone genuinely reorder them and the main diff would fail
   * every fixture otherwise. So order lives on its own channel, and it is
   * compared against the ORACLE's order — which is source order, since
   * `createElement` walks the props object — partitioned into the attributes
   * the template bakes in and the props the patch code applies after the clone.
   */
  it("reversing the order attributes are baked into the template goes red", async () => {
    for (const name of ["static-only", "svg", "svg-dynamic-class"]) {
      const result = await compareToOracle(name, { emitted: reverseBakedAttributes })
      expect(result.ok, name).toBe(false)
      // Nothing else sees it: the main diff sorts, so this is the only channel.
      expect([...new Set(result.divergences.map((d) => d.kind))], name).toEqual(["attribute-order"])
    }
  })

  it("reversing the order the patch code applies props in goes red", async () => {
    for (const name of ["multi-prop-one-element", "reactive-attribute", "svg-dynamic-class"]) {
      const result = await compareToOracle(name, { emitted: reverseAppliedProps })
      expect(result.ok, name).toBe(false)
      expect([...new Set(result.divergences.map((d) => d.kind))], name).toEqual(["attribute-order"])
    }
  })

  it("a static attribute that merely trails a dynamic one in source is not a divergence", async () => {
    // reactive-attribute is `<a href={…} class={…} data-static="keep">`: the
    // template bakes data-static in first and the patch code sets href and
    // class after. That is the partition, and it must stay green.
    const result = await compareToOracle("reactive-attribute")
    expect(result.divergences).toEqual([])
  })

  it("the channel is live for most of the corpus, not silently empty", async () => {
    let withAttributes = 0
    for (const name of fixtures) {
      if (PARKED[name]) continue
      const compiled = await renderViaCompiler(name)
      if (compiled.channels[0].attributes.length > 0) withAttributes++
    }
    expect(withAttributes).toBeGreaterThanOrEqual(30)
  }, 60_000)
})

describe("effect bound arithmetic", () => {
  /**
   * M3 turns the effect count into the proof of target #1, so the bound has to
   * be right before the passes land. These drive `boundEffects` with numbers no
   * fixture produces today; each one names the bug it would catch.
   */
  const base = {
    oracleCreated: 1,
    compiledCreated: 1,
    oracleTotalRuns: 4,
    compiledTotalRuns: 4,
    oracleRuns: [4],
    compiledRuns: [4],
    goesLive: [] as string[],
    frames: 4,
    merges: 0,
  }

  it("no declaration, no slack: matching numbers report nothing", () => {
    expect(boundEffects(base)).toEqual([])
  })

  it("one live hole lifts the RUN allowance by one per frame, not by one", () => {
    // The bug: a flat `+ slack`. A live hole costs one effect that re-runs once
    // per frame, so on a four-frame fixture that is four runs, not one.
    const divergences = boundEffects({
      ...base,
      compiledCreated: 2,
      compiledTotalRuns: 8,
      compiledRuns: [4, 4],
      goesLive: ["the live hole"],
    })
    expect(divergences).toEqual([])
  })

  it("a live hole does not switch the busiest-effect bound off for everyone else", () => {
    // The bug: `slack > 0` disabled the per-effect bound entirely, so one
    // declaration bought unlimited re-runs for every other effect in the
    // module. Here the top rank is the declared hole and the SECOND rank is a
    // regression, and it has to be reported.
    const divergences = boundEffects({
      oracleCreated: 11,
      compiledCreated: 12,
      oracleTotalRuns: 22,
      compiledTotalRuns: 26,
      oracleRuns: Array(11).fill(2),
      compiledRuns: [3, 3, ...Array(10).fill(2)],
      goesLive: ["the live hole"],
      frames: 4,
      merges: 0,
    })
    expect(divergences.map((d) => d.kind)).toEqual(["effect-runs"])
    expect(divergences[0].message).toContain("busiest oracle effect")
  })

  it("a live hole is itself bounded: it may re-run once per frame and no more", () => {
    const divergences = boundEffects({
      ...base,
      compiledCreated: 2,
      compiledTotalRuns: 103,
      compiledRuns: [99, 4],
      goesLive: ["the live hole"],
    })
    expect(divergences.map((d) => d.message).join("\n")).toContain("declared live hole re-ran 99")
  })

  it("a declaration that buys nothing is reported stale, like a stale win", () => {
    const divergences = boundEffects({ ...base, goesLive: ["nothing is live here"] })
    expect(divergences.map((d) => d.message).join("\n")).toContain("stale goesLive")
  })

  it("a coalesced effect may run once per frame — that is target 4, not a regression", () => {
    // Three props on one element: the oracle makes three effects that each run
    // twice; the compiler makes ONE that runs on every frame. Fewer effects,
    // fewer total runs, and a busier single effect — all three at once.
    expect(
      boundEffects({
        oracleCreated: 3,
        compiledCreated: 1,
        oracleTotalRuns: 6,
        compiledTotalRuns: 4,
        oracleRuns: [2, 2, 2],
        compiledRuns: [4],
        goesLive: [],
        frames: 4,
        merges: 1,
      }),
    ).toEqual([])
  })

  it("coalescing does not license a SECOND busy effect it cannot account for", () => {
    // Two oracle effects became one, so exactly one compiled effect may run per
    // frame. A second one at the same rate is not explained by the merge.
    const divergences = boundEffects({
      oracleCreated: 3,
      compiledCreated: 2,
      oracleTotalRuns: 9,
      compiledTotalRuns: 8,
      oracleRuns: [3, 3, 3],
      compiledRuns: [4, 4],
      goesLive: [],
      frames: 4,
      merges: 1,
    })
    expect(divergences.map((d) => d.kind)).toEqual(["effect-runs"])
    expect(divergences[0].message).toContain("busiest oracle effect")
  })

  it("a three-way merge licenses ONE busy effect, not the two its delta would buy", () => {
    // The dead spot in the delta-only allowance. Merging 3 effects into 1
    // removes 2, but yields only ONE effect that runs on the union of their
    // triggers. Reading the allowance off the delta alone excused a second,
    // entirely unrelated per-frame effect — and with total runs equal on both
    // sides, the aggregate bound did not catch it either.
    const numbers = {
      oracleCreated: 4,
      compiledCreated: 2,
      oracleTotalRuns: 8,
      compiledTotalRuns: 8,
      oracleRuns: [2, 2, 2, 2],
      compiledRuns: [4, 4],
      goesLive: [] as string[],
      frames: 4,
    }
    const reported = boundEffects({ ...numbers, merges: 1 })
    expect(reported.map((d) => d.kind)).toEqual(["effect-runs"])
    expect(reported[0].message).toContain("busiest oracle effect")

    // Two real multi-prop effects DO account for both, and are not reported.
    expect(boundEffects({ ...numbers, merges: 2 })).toEqual([])
  })

  it("a live hole on a fixture that also merges is not reported stale", () => {
    // The arithmetic the two relaxations disagreed about: coalescing REMOVES
    // effects, so a fixture that both merges and auto-thunks has a raw excess
    // of zero while its declaration is perfectly real.
    expect(
      boundEffects({
        oracleCreated: 3,
        compiledCreated: 3,
        oracleTotalRuns: 6,
        compiledTotalRuns: 8,
        oracleRuns: [2, 2, 2],
        compiledRuns: [4, 2, 2],
        goesLive: ["the live hole"],
        frames: 4,
        merges: 1,
      }),
    ).toEqual([])
  })

  it("a live hole is not stale merely because the compiler ALSO deleted an oracle effect", () => {
    // The dead spot the merge-adjusted arithmetic still had. Here the compiler
    // does three things at once: it proves one prop static and emits no effect
    // for it (target #1), it merges two more into one (target #4), and it makes
    // one bare read live (O4). Net effect count: 3 -> 2, an excess of MINUS one.
    //
    // Any version of the stale check that measures the declaration against the
    // excess — raw or merge-adjusted — reports this as stale, because every
    // optimization the compiler performs eats the evidence the live hole is
    // supposed to leave. The declaration is load-bearing all the same: without
    // it the second-ranked compiled effect is over the busiest-oracle bound.
    const numbers = {
      oracleCreated: 3,
      compiledCreated: 2,
      oracleTotalRuns: 6,
      compiledTotalRuns: 8,
      oracleRuns: [2, 2, 2],
      compiledRuns: [4, 4],
      frames: 4,
      merges: 1,
    }
    expect(boundEffects({ ...numbers, goesLive: [] }).map((d) => d.kind)).toContain("effect-runs")
    expect(boundEffects({ ...numbers, goesLive: ["the live hole"] })).toEqual([])
  })

  it("a SECOND declaration on a fixture that only needed one is reported stale", () => {
    // Partial staleness: the check names how many holes are actually
    // load-bearing rather than only firing when none of them are.
    const divergences = boundEffects({
      oracleCreated: 1,
      compiledCreated: 2,
      oracleTotalRuns: 4,
      compiledTotalRuns: 8,
      oracleRuns: [4],
      compiledRuns: [4, 4],
      goesLive: ["real", "imaginary"],
      frames: 4,
      merges: 0,
    })
    expect(divergences.map((d) => d.message).join("\n")).toContain(
      "2 hole(s) declared live, but the bound is already clean with 1",
    )
  })

  it("fewer effects than the oracle is never a divergence — it is the point", () => {
    expect(
      boundEffects({ ...base, compiledCreated: 0, compiledTotalRuns: 0, compiledRuns: [] }),
    ).toEqual([])
  })
})

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
    )
  }

  it("every emitted template parses to exactly one root", () => {
    let checked = 0
    for (const name of fixtures) {
      for (const html of templateStrings(compileFixture(name))) {
        const host = document.createElement("template")
        host.innerHTML = html
        expect(
          host.content.childNodes.length,
          `${name}: \`${html}\` parses to ${host.content.childNodes.length} roots`,
        ).toBe(1)
        checked++
      }
    }
    expect(checked).toBeGreaterThanOrEqual(40)
  })

  it("the shapes the browser reshapes are refused, as far as this parser can tell", () => {
    // Each of these was checked in a real browser. happy-dom agrees on some and
    // not others, so the assertion is on the COMPILER's refusal, which is the
    // thing that has to hold either way.
    const cases: Array<[string, string]> = [
      ["<table>text</table>", "<table>"],
      ["<div><body>b</body></div>", "<body"],
      ["<style>{css}</style>", "<style>"],
      ["<textarea>{value}</textarea>", "<textarea>"],
      ["<div><style>{`a`}&lt;/style&gt;</style></div>", "<style>"],
    ]
    for (const [jsx, forbidden] of cases) {
      const code = compileSource(`const V = () => ${jsx};\n`, "probe.tsx")
      for (const html of templateStrings(code)) {
        expect(html, jsx).not.toContain(forbidden)
      }
    }
  })
})

describe("harness self-check", () => {
  // The guard against a vacuous suite. Each case corrupts one thing and names
  // the detector that must catch it; if any of these start passing, the
  // corresponding assertion in the suite above has stopped working.

  it("detects a changed static attribute value (initial-dom)", async () => {
    const result = await compareToOracle("text-hole-trailing", {
      emitted: (code) => code.replace('"counter"', '"corrupted"'),
    })
    expect(result.ok).toBe(false)
    expect(result.divergences.map((d) => d.kind)).toContain("initial-dom")
  })

  it("detects a dropped reactive binding only after a scripted update (step-dom)", async () => {
    // `.peek()` is the runtime's own escape hatch: a read that is deliberately
    // not tracked, so the hole can never update. `{count()}` used to serve here
    // and no longer does — O4 auto-thunking makes the compiler keep THAT one
    // live, which is a fix, not a corruption.
    const result = await compareToOracle("text-hole-trailing", {
      source: (src) => src.replace("{() => count()}", "{count.peek()}"),
    })
    expect(result.ok).toBe(false)
    // The initial render is identical — this is precisely the corruption that a
    // render-only harness cannot see, so drive() is what catches it.
    expect(result.divergences.map((d) => d.kind)).toContain("step-dom")
    expect(result.divergences.map((d) => d.kind)).not.toContain("initial-dom")
  })

  it("detects extra reactive work on identical DOM (effect-count)", async () => {
    const result = await compareToOracle("static-only", {
      source: (src) => src.replace('class="card"', 'class={() => "card"}'),
    })
    expect(result.ok).toBe(false)
    expect(result.divergences.map((d) => d.kind)).toContain("effect-count")
    // The DOM is byte-identical; only the effect bound catches this.
    expect(result.divergences.map((d) => d.kind)).not.toContain("initial-dom")
    expect(result.effectDelta).toBeGreaterThan(0)
  })

  it("detects a removed element (initial-dom)", async () => {
    const result = await compareToOracle("static-only", {
      source: (src) => src.replace("<li>two</li>", ""),
    })
    expect(result.ok).toBe(false)
    expect(result.divergences.map((d) => d.kind)).toContain("initial-dom")
  })

  it("whitespace normalization does not mask a text-content change", async () => {
    // Rule 3 of normalize.ts drops whitespace-only text that contains a
    // newline. A trailing space INSIDE a text node is not that, and must fail.
    const result = await compareToOracle("static-only", {
      source: (src) => src.replace(">Barq<", ">Barq <"),
    })
    expect(result.ok).toBe(false)
    expect(result.divergences.map((d) => d.kind)).toContain("initial-dom")
  })

  it("attribute sorting does not mask a changed attribute value", async () => {
    const result = await compareToOracle("static-only", {
      source: (src) => src.replace('data-kind="static"', 'data-kind="dynamic"'),
    })
    expect(result.ok).toBe(false)
    expect(result.divergences.map((d) => d.kind)).toContain("initial-dom")
  })

  it("detects a dropped delegated handler (event-dom)", async () => {
    const result = await compareToOracle("delegated-event", {
      source: drop("onClick={() => count.update((n) => n + 1)}"),
    })
    expect(result.ok).toBe(false)
    expect(result.divergences.map((d) => d.kind)).toContain("event-dom")
    // The handler is invisible until an event is dispatched: neither the
    // initial render nor the scripted signal writes can see it missing.
    expect(result.divergences.map((d) => d.kind)).not.toContain("initial-dom")
    expect(result.divergences.map((d) => d.kind)).not.toContain("step-dom")
  })

  it("detects a dropped non-delegated handler (event-dom)", async () => {
    const result = await compareToOracle("non-delegated-event", {
      source: drop("onMouseLeave={() => hovered.set(false)}"),
    })
    expect(result.ok).toBe(false)
    expect(result.divergences.map((d) => d.kind)).toContain("event-dom")
  })

  it("detects a dropped tuple handler (event-dom)", async () => {
    const result = await compareToOracle("delegated-handler-tuple", {
      source: drop('onClick={[pick, "b"]}'),
    })
    expect(result.ok).toBe(false)
    expect(result.divergences.map((d) => d.kind)).toContain("event-dom")
  })

  it("detects a dropped object ref (step-dom)", async () => {
    const result = await compareToOracle("ref-binding", { source: drop(" ref={box}") })
    expect(result.ok).toBe(false)
    expect(result.divergences.map((d) => d.kind)).toContain("step-dom")
  })

  it("detects a dropped callback ref (initial-dom)", async () => {
    const result = await compareToOracle("ref-binding", {
      source: drop(' ref={(el: HTMLElement) => el.setAttribute("data-reffed", "yes")}'),
    })
    expect(result.ok).toBe(false)
    expect(result.divergences.map((d) => d.kind)).toContain("initial-dom")
  })

  it("indentation is dropped in a <div> and kept in a <pre>", () => {
    // Constructed rather than compiled: JSX text cleaning removes indentation on
    // both paths today, so only a hand-built DOM reaches the normalizer's rule.
    // A compiled <pre> that loses its source indentation must not read as equal.
    const build = (tag: string, gap: string): HTMLElement => {
      const host = document.createElement("div")
      host.appendChild(document.createElement(tag)).innerHTML = `<b>B</b>${gap}<i>c</i>`
      return host
    }
    expect(normalizeDom(build("div", "\n   "))).toBe(normalizeDom(build("div", "")))
    expect(normalizeDom(build("pre", "\n   "))).not.toBe(normalizeDom(build("pre", "")))
    expect(normalizeDom(build("textarea", "\n   "))).not.toBe(normalizeDom(build("textarea", "")))
  })

  it("detects a spurious template marker (marker-count)", async () => {
    // normalize.ts rule 4 fuses text runs across an empty comment, so no DOM
    // comparison can see this one. The count bound is the only detector.
    const result = await compareToOracle("text-hole-trailing", {
      emitted: (code) => code.replace('<div class="counter">', '<div class="counter"><!---->'),
    })
    expect(result.ok).toBe(false)
    expect(result.divergences.map((d) => d.kind)).toContain("marker-count")
  })

  it("a declared live hole lifts the effect bound, across every frame", async () => {
    // What M3 turns on: an auto-thunked hole costs one extra effect that re-runs
    // once per scripted step. The DOM is identical throughout.
    const goLive = (src: string) =>
      src.replace('class="counter"', 'class={() => (count(), "counter")}')
    const declare = (code: string) => `${code}\nexport const goesLive = ["counter class"]\n`

    const undeclared = await compareToOracle("text-hole-trailing", { source: goLive })
    expect(undeclared.ok).toBe(false)
    expect(undeclared.divergences.map((d) => d.kind)).toContain("effect-count")

    const declared = await compareToOracle("text-hole-trailing", {
      source: goLive,
      emitted: (code) => declare(goLive(code)),
    })
    expect(declared.divergences).toEqual([])
    expect(declared.ok).toBe(true)
    expect(declared.effectDelta).toBe(1)
    // the run delta is per-frame, which is exactly what the flat `+ slack` bound
    // used to get wrong
    expect(declared.runDelta).toBeGreaterThan(1)
  })

  it("detects a goesLive declaration that is not earning its slack (stale)", async () => {
    const result = await compareToOracle("text-hole-trailing", {
      emitted: (code) => `${code}\nexport const goesLive = ["nothing is live here"]\n`,
    })
    expect(result.ok).toBe(false)
    expect(result.divergences.map((d) => d.message).join("\n")).toContain("stale goesLive")
  })

  it("an uncorrupted fixture is not reported as divergent", async () => {
    const result = await compareToOracle("text-hole-trailing")
    expect(result.divergences).toEqual([])
    expect(result.ok).toBe(true)
  })
})
