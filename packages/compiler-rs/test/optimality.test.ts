import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  auditAnchors,
  compareToOracle,
  renderViaCompiler,
  compileFixture,
  compileFixtureBody,
  emittedCalls,
  fixtureOptimality,
  fixtureSource,
  formatDivergences,
  groupTargets,
  listFixtures,
  loadModule,
  renderEffectBodies,
  stripLiterals,
  templateAnchors,
  templateHtml,
  type FixtureModule,
  type OptimalityExpectation,
} from "./harness.ts"
import { measure, typicalComponentFile } from "./measure.ts"
import { countAnchors } from "./normalize.ts"
import { oracleRegistry } from "./oracle-known-failures.ts"

/**
 * The definition of done for milestones 2-6.
 *
 * These assert on the emitted CODE, not on behaviour — oracle.test.ts already
 * proves behaviour. Every optimization target from the project brief has
 * exactly one block here, naming the fixture it runs against.
 *
 * THE TEST FOR WHETHER AN ASSERTION HERE IS EVIDENCE. Take the M1 identity
 * round-trip — a "compiler" that emits its input back unchanged — and ask
 * whether the assertion still passes. If it does, it cannot distinguish this
 * compiler from a no-op and it is not proving a target; it is decoration. Upper
 * bounds (`<= 4 walks`), absences (`no "=>"`) and oracle-equality (`ok === true`)
 * all fail that test on their own, because uncompiled JSX contains no walks, no
 * emitted arrows, and is trivially equal to the oracle it IS. Every block below
 * therefore leads with a POSITIVE claim about what the compiler produced, and
 * uses the bound only to say the produced thing is also cheap.
 *
 * `bun test` against a stub `index.js` returning `{ code }` unchanged is how the
 * six that used to survive were found; re-run it after adding an assertion here.
 */

/**
 * Occurrences in CODE, never in a string a fixture happens to render. `=>` in a
 * doc comment and `.firstChild` in a rendered string both move an exact count,
 * and every count below is an equality — so this is `stripLiterals` for the same
 * reason `emittedCalls` and `templateAnchors` are.
 */
function count(code: string, pattern: RegExp): number {
  return countRaw(stripLiterals(code), pattern)
}

/** The same, on the module as written — for a claim ABOUT a literal's contents. */
function countRaw(code: string, pattern: RegExp): number {
  return code.match(new RegExp(pattern, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))?.length ?? 0
}

/** The runtime helpers the emitted module imports, by their exported names. */
function runtimeImports(code: string): string[] {
  const line = code.match(/^import \{([^}]*)\} from "@barqjs\/core";/m)
  return (line?.[1] ?? "")
    .split(",")
    .map((entry) => entry.trim().split(" as ")[0].trim())
    .filter((name) => name.length > 0)
    .sort()
}

/**
 * The milestone that has landed. Every fixture declaring an `optimality` at or
 * below it is ASSERTED; the ones above it are pending, and raising this number
 * is what turns a milestone's whole claim on at once.
 */
const MILESTONE = 6

const declarations = await Promise.all(
  listFixtures().map(async (name) => [name, await fixtureOptimality(name)] as const),
)

describe("declared optimality", () => {
  // Each fixture states what the compiler must make of it, next to the JSX that
  // is the claim. These run the declaration; the blocks below are the targets
  // whose claim needs more than a declaration can say.

  function assertDeclared(name: string, decl: OptimalityExpectation, code: string): void {
    if (decl.templates !== undefined) expect(emittedCalls(code, "template"), "templates").toBe(decl.templates)
    if (decl.patchCalls !== undefined) {
      const patches =
        emittedCalls(code, "insert") + emittedCalls(code, "setProp") + emittedCalls(code, "spread")
      expect(patches, "patch calls").toBe(decl.patchCalls)
    }
    for (const needle of decl.emits ?? []) expect(code, `${name} must emit`).toContain(needle)
    for (const needle of decl.absent ?? []) expect(code, `${name} must not emit`).not.toContain(needle)
    for (const [first, second] of decl.ordered ?? []) {
      const at = code.indexOf(first)
      const then = code.indexOf(second)
      expect(at, `${name}: ${JSON.stringify(first)} is missing`).toBeGreaterThan(-1)
      expect(then, `${name}: ${JSON.stringify(second)} is missing`).toBeGreaterThan(-1)
      expect(at, `${name}: ${JSON.stringify(first)} must come first`).toBeLessThan(then)
    }
  }

  it("no declaration names a compiler-generated identifier", () => {
    // A fixture that mentions `_$`, `_el$` or `_p$` — even inside a string in
    // its own optimality block — owns those names as far as the compiler is
    // concerned, so UID hygiene shifts every emitted uid to `_$$`. The
    // declaration still passes (it is asserted against the body with the block
    // stripped) while every module-wide scan in the harness quietly stops
    // matching: `patchedAttributeNames` sees no props, the attribute-order
    // corruption becomes a no-op. Keep needles uid-free; assert uid shapes from
    // the test file, where they run against the stripped body.
    const offenders = listFixtures().filter((name) => {
      const declaration = fixtureSource(name).match(/export const optimality = \{[\s\S]*?\n\}/)
      // `_s$` joined the list at M3: the scope parameter is a compiler uid like
      // any other, and a fixture that names it in its own declaration block
      // shifts EVERY emitted uid to `_$$` — while the declaration itself keeps
      // passing, because it is asserted against the body with the block
      // stripped. That is the exact silent hole this test exists for, and the
      // C1 call shape is asserted from here instead (`the call shape is C1's`).
      return declaration !== null && /_\$|_el\$|_p\$|_v\$|_tmpl\$|_s\$|_k\$/.test(declaration[0])
    })
    expect(offenders).toEqual([])
  })

  /**
   * C1, stated once for the whole corpus instead of 38 times in fixture
   * strings. A component is invoked with the scope it must run under FIRST, and
   * a slot literal declares the same parameter — so a call that lost the
   * argument, or a Block that lost the parameter, fails here whatever any
   * individual declaration happens to spell.
   *
   * It lives in the test file because a fixture may not name a compiler uid:
   * see the test above for what happens when one does.
   */
  it("the call shape is C1's: scope first at every component call and every Block", () => {
    let calls = 0
    let blocks = 0
    const withProps = new Map<string, string[]>()
    for (const name of listFixtures()) {
      const code = stripLiterals(compileFixtureBody(name))
      // The two shapes the compiler emits for a component call, and the scope
      // is the first argument of both. Anything capitalised whose first
      // argument is a props object or a source list is a call that lost it.
      const lost = [...code.matchAll(/(?<![\w$.])([A-Z][\w$]*)\(\s*(\{|_\$props\()/g)].map(
        (m) => m[1]!,
      )
      if (lost.length > 0) withProps.set(name, [...new Set(lost)])
      calls += [...code.matchAll(/(?<![\w$.])[A-Z][\w$]*\(_s\$[,)]/g)].length
      // §3.0 rule 3: a Block is BRANDED at its definition site, so the slot's
      // value is `_$block((_s$…`. The brand is what lets a consumer test kind
      // instead of guessing it from arity.
      blocks += [
        ...code.matchAll(/(children|fallback|loading|error):\s*[\w$]*block\(\(_s\$[,)]/g),
      ].length
    }
    expect(
      [...withProps].map(([name, callees]) => `${name}: ${callees.join(", ")}`),
      "a component whose FIRST argument is its props object is a call that lost its scope",
    ).toEqual([])
    expect(calls, "the sweep found no component calls at all").toBeGreaterThan(40)
    expect(blocks, "the sweep found no Blocks at all").toBeGreaterThan(30)
  }, 120_000)

  /**
   * A fixture without an `optimality` block contributes nothing to the
   * definition-of-done loop — `assertDeclared` skips it silently. That is a
   * decision for a few fixtures and an omission for none of them, so each one
   * names the channel that carries its claim instead — and the channel is
   * CHECKED.
   *
   * It used to be a string, and the staleness test only asked whether the key
   * still existed. Nine of the reasons said a shape was deferred to M5, which
   * shipped; a reason cannot rot silently when the suite runs it. Every entry
   * below is a predicate over the fixture and its emitted module, and an excuse
   * that stopped being true fails here rather than sitting in a comment.
   */
  interface Excuse {
    why: string
    holds: (subject: { name: string; source: string; code: string; mod: FixtureModule }) => boolean
  }

  /**
   * The fixture's name appears as a literal in a test file that asserts on it —
   * with THIS table cut out first, so an excuse cannot vouch for itself.
   */
  const namedIn = (file: string) => (subject: { name: string }) => {
    const text = readFileSync(join(import.meta.dir, file), "utf8")
    const from = text.indexOf("const NO_DECLARATION")
    const to = from === -1 ? -1 : text.indexOf("\n  }\n", from)
    const body = from === -1 || to === -1 ? text : text.slice(0, from) + text.slice(to)
    return body.includes(JSON.stringify(subject.name))
  }

  const NO_DECLARATION: Record<string, Excuse> = {
    "conditional-children": {
      why: "the claim is the two declared `win`s, which are behavioural",
      holds: ({ mod }) => (mod.wins ?? []).length >= 2,
    },
    "array-hole": {
      why: "an insert() receiving an Array; the claim is the four declared wins",
      holds: ({ mod }) => (mod.wins ?? []).length >= 4,
    },
    "arrow-body-component": {
      why: "the ArrowBody splice site, pinned by the emitted-code snapshot",
      holds: ({ name }) =>
        readFileSync(join(import.meta.dir, "__snapshots__", "roundtrip.test.ts.snap"), "utf8").includes(
          name,
        ),
    },
    "control-flow-nested": {
      why: "asserted by name in the target 8 block",
      holds: namedIn("optimality.test.ts"),
    },
    "delegated-handler-tuple": {
      why: "asserted by name in the target 7 block",
      holds: namedIn("optimality.test.ts"),
    },
    "hygiene-shifted-uids": {
      why: "asserted by name in the target 9 block",
      holds: namedIn("optimality.test.ts"),
    },
    "unicode-long-template": {
      why: "a sourcemap hazard; the claim is asserted by name in roundtrip.test.ts",
      holds: namedIn("roundtrip.test.ts"),
    },
    "svg-dynamic-class": {
      why: "O5; the claim is asserted by name in the real-browser SVG check",
      holds: namedIn("browser-svg-class-check.ts"),
    },
    "property-attrs": {
      why: "the DOM_PROPS channel, pinned by tables.test.ts against dom.ts",
      holds: ({ code }) => emittedCalls(code, "setProp") > 0 && templateHtml(code).join("").includes("<input"),
    },
    "style-object": {
      // The DOM target hands the object to the runtime WHOLE, which is what
      // `tables.test.ts` pins; the px rule only becomes the compiler's decision
      // on the SSR target, where `ssr.test.ts` folds the same object into a
      // `style="…"` chunk and compares the unit against dom.ts's own table. So
      // the excuse names two channels and this predicate holds the DOM half of
      // it: the object reaches `setProp` unopened, with no `px` anywhere.
      why: "the style channel: whole-object on DOM (tables.test.ts), folded with the px rule on SSR (ssr.test.ts)",
      holds: ({ code }) =>
        emittedCalls(code, "setProp") > 0 &&
        !stripLiterals(code).includes("px") &&
        templateHtml(code).join("").includes("style=") === false,
    },
    "dangerously-set-inner-html": {
      // `code.includes("dangerouslySetInnerHTML")` alone is satisfied by
      // un-compiled source. What the fixture is about is that the markup was
      // NOT baked into the template and reaches the runtime as a property
      // write, so the element the parser builds is the one the oracle builds.
      why: "raw HTML the compiler must refuse to bake; checked by the parse conformance pass",
      holds: ({ code }) =>
        templateHtml(code).length > 0 &&
        emittedCalls(code, "setProp") > 0 &&
        !templateHtml(code).join("").includes("<b>"),
    },
    mathml: {
      why:
        "namespace handling: `<math>` is a namespace ROOT and cannot be a template root, so it " +
        "is built through createElement while its subtree stays a template the parse pass reads",
      holds: ({ code }) =>
        code.includes('createElement("math"') && templateHtml(code).join("").includes("<mrow>"),
    },
    svg: {
      why:
        "namespace handling: DESIGN §8 V13 kebab-cases every SVG attribute EXCEPT class and " +
        "viewBox, and the folded bytes are what the parse conformance pass reads back",
      holds: ({ code }) => {
        const html = templateHtml(code).join("")
        return html.includes('viewBox="0 0 24 24"') && html.includes("stroke-width=")
      },
    },
    "pre-whitespace": {
      why: "whitespace preservation; the exact template bytes are asserted in the O9 block",
      holds: namedIn("optimality.test.ts"),
    },
    "text-gt-hole": {
      why: "a parser-divergence hazard; the claim is the escaped byte, and it is in the template",
      holds: ({ code }) => templateHtml(code).join("").includes("&gt;"),
    },
  }

  it("every fixture either declares an optimality or says why it does not", () => {
    const undeclared = declarations.filter(([, d]) => !d).map(([name]) => name)
    expect(undeclared.filter((name) => !NO_DECLARATION[name]), "undeclared and unexplained").toEqual([])
    expect(
      Object.keys(NO_DECLARATION).filter((name) => !undeclared.includes(name)),
      "stale entry: this fixture declares an optimality now, or is gone",
    ).toEqual([])
  })

  it("every excuse for not declaring one is still TRUE", async () => {
    // The half that was missing. `NO_DECLARATION` used to hold prose, and the
    // test above only asked whether the key was still there — so nine reasons
    // could go on saying a shape was deferred to a milestone that had already
    // shipped, and the suite reported them as explained. Each entry is now a
    // predicate, and this runs it.
    const rotted: string[] = []
    for (const [name, excuse] of Object.entries(NO_DECLARATION)) {
      const source = fixtureSource(name)
      const mod = await loadModule(source, `excuse-${name}`)
      if (!excuse.holds({ name, source, code: compileFixtureBody(name), mod })) {
        rotted.push(`${name}: ${excuse.why}`)
      }
    }
    expect(rotted, "the channel this fixture's claim was handed to no longer carries it").toEqual([])
  }, 120_000)

  it("the declarations cover every target M3 is supposed to prove", () => {
    const targets = new Set(declarations.flatMap(([, d]) => (d ? [d.target] : [])))
    for (const target of [1, 2, 3, 4, 7]) {
      expect([...targets], `no fixture declares target ${target}`).toContain(target)
    }
  })

  it("the corpus declares a fixture for every target M4 has to prove", () => {
    // Written down before the passes land, so "M4 is done" is a fact about the
    // corpus rather than about whichever fixture happened to get looked at.
    const by = (target: number) => declarations.filter(([, d]) => d?.target === target).map(([n]) => n)
    expect(by(5), "walk elision").toEqual(expect.arrayContaining(["deep-walk", "walk-from-the-back"]))
    expect(by(6), "template dedup").toContain("dedup-identical-markup")
    expect(by(9), "marker elision").toEqual(
      expect.arrayContaining(["marker-literal-text", "text-hole-followed", "text-hole-trailing"]),
    )
  })

  it("the corpus declares a fixture for every target M5 has to prove", () => {
    // Same contract as the M4 block above: what "M5 is done" means is a fact
    // about the corpus, not about whichever fixture a target block happened to
    // name by hand.
    const by = (target: number) => declarations.filter(([, d]) => d?.target === target).map(([n]) => n)
    expect(by(8), "thunk elision, and its boundary").toEqual(
      expect.arrayContaining([
        "control-flow-show-eager-static-body",
        "control-flow-show-static-body",
        "control-flow-for-static-body",
      ]),
    )
    // Every one of the fourteen flow components is emitted as a real call, and
    // the shape of that call is declared rather than left to a snapshot.
    expect(by(8), "the flow catalogue").toEqual(
      expect.arrayContaining([
        "control-flow-for",
        "control-flow-index",
        "control-flow-repeat",
        "control-flow-show",
        "control-flow-switch-match",
        "control-flow-await-suspense",
        "control-flow-error-boundary",
        "control-flow-errored-loading",
      ]),
    )
    // Props flow: the raw read, the forward, the shapes that snapshot, and the
    // shapes that must NOT become getters.
    expect(by(1), "props across a component boundary").toEqual(
      expect.arrayContaining([
        "component-getter-props",
        "props-raw-forward",
        "component-boundary-props",
        "component-function-props",
        "props-destructured-param",
        "props-destructured-body",
        "props-renamed-and-defaulted",
        "props-rest-spread",
      ]),
    )
  })

  for (const [name, decl] of declarations) {
    if (!decl) continue
    const live = decl.milestone <= MILESTONE
    const run = live ? it : it.todo
    run(`${name} — target ${decl.target} (M${decl.milestone})`, async () => {
      assertDeclared(name, decl, compileFixtureBody(name))
      if (decl.effects === undefined) return
      const result = await compareToOracle(name)
      expect(result.compiled.trace.created, `${name} effects`).toBe(decl.effects)
    })
  }
})

describe("target 1 — semantic reactivity (never name regexes)", () => {
  it("static-only: a provably-static tree emits no thunk and no effect", () => {
    const code = compileFixtureBody("static-only")
    // The positive half. Both clauses below are satisfied by JSX that was never
    // compiled at all, so on their own they assert nothing.
    expect(templateHtml(code)[0]).toStartWith('<section class="card"')
    expect(code).toMatch(/return _tmpl\$\d+\(\)/)

    expect(count(code, /=>/)).toBe(0)
    expect(count(code, /renderEffect|_\$effect/)).toBe(0)
  })

  it("handler-no-closure: a handler closing over nothing is not re-created per instance", () => {
    const code = compileFixtureBody("handler-no-closure")
    // Hoisted to module scope: the arrow appears above the component, not inside
    // it. The needle is the fixture's own handler body — it used to be a string
    // ("static handler") the fixture no longer contains, so this could never
    // have gone green as written.
    const handlerAt = code.indexOf('setAttribute("data-clicked"')
    const componentAt = code.indexOf("function HandlerNoClosure")
    expect(handlerAt).toBeGreaterThan(-1)
    expect(handlerAt).toBeLessThan(componentAt)
  })

  it("handler-closure: a handler closing over a signal stays inside the component", () => {
    const code = compileFixtureBody("handler-closure")
    // Positive first: the handler still has to become an expando write, or
    // "it is not hoisted" is satisfied by output that binds nothing at all.
    expect(code).toMatch(/_el\$\d+\.\$\$click = \(\) => n\.update/)
    expect(code, "no module-scope handler constant for a closure").not.toMatch(/^const _h\$/m)

    const handlerAt = code.indexOf("n.update")
    const componentAt = code.indexOf("function HandlerClosure")
    expect(handlerAt).toBeGreaterThan(componentAt)
  })
})

describe("target 2 — fully-static subtree costs one clone and nothing else", () => {
  it("static-only: exactly one template() and zero patch calls", () => {
    const code = compileFixtureBody("static-only")
    expect(emittedCalls(code, "template")).toBe(1)
    expect(
      emittedCalls(code, "insert") + emittedCalls(code, "setProp") + emittedCalls(code, "spread"),
    ).toBe(0)
  })

  it("static-only: creates zero effects at runtime", async () => {
    const result = await compareToOracle("static-only")
    // Zero effects is a property of un-compiled static JSX too, so the count on
    // its own says nothing. What says something is WHICH runtime surface the
    // module touched: one `template` import and no other helper at all means the
    // whole subtree became a clone, and there is nothing left that could create
    // an effect later.
    expect(runtimeImports(result.compiled.code ?? "")).toEqual(["template"])
    expect(result.compiled.code).toMatch(/return _tmpl\$\d+\(\)/)
    expect(result.compiled.html.length, "and it still rendered something").toBeGreaterThan(0)
    expect(result.compiled.trace.created).toBe(0)
  })

  it.todo("dedup-identical-markup: zero patch calls across both components", () => {
    const code = compileFixtureBody("dedup-identical-markup")
    expect(emittedCalls(code, "insert") + emittedCalls(code, "setProp")).toBe(0)
  })
})

describe("target 3 — constant folding into the template string", () => {
  it("literal-class-style: a literal class concat is baked into the HTML", () => {
    const code = compileFixtureBody("literal-class-style")
    expect(templateHtml(code).join("\n")).toContain('class="btn btn--primary"')
    expect(code).not.toContain("`${base}")
  })

  it("literal-class-style: a literal ternary class is baked in, no setProp", () => {
    const code = compileFixtureBody("literal-class-style")
    expect(templateHtml(code).join("\n")).toContain('class="on"')
    expect(emittedCalls(code, "setProp")).toBe(0)
  })

  it("literal-class-style: a literal style string is baked into the HTML", () => {
    const code = compileFixtureBody("literal-class-style")
    // Inside the TEMPLATE's own bytes. The fixture writes that exact string
    // itself, so a search of the whole module is satisfied by output that was
    // never compiled — this was one of the six.
    expect(templateHtml(code).join("\n")).toContain('style="color: red; font-weight: bold"')
    expect(templateHtml(code), "one template, everything folded into it").toHaveLength(1)
  })
})

describe("target 4 — one effect per element, not one per prop", () => {
  it("multi-prop-one-element: three dynamic props share a single effect", async () => {
    const result = await compareToOracle("multi-prop-one-element")
    expect(result.compiled.trace.created).toBe(1)
    expect(result.oracle.trace.created).toBe(3)
  })

  it("class-with-live-siblings: title and id share one effect while class stays out of it", async () => {
    // The boundary of target #4. `class` is diffed statefully by the runtime,
    // so joining it to a shared effect makes an unrelated prop change rewrite
    // `element.className` and wipe what `classList` (or a ref, or a directive)
    // put there. Two live props still merge; the third is left unwrapped.
    const code = compileFixtureBody("class-with-live-siblings")
    expect(renderEffectBodies(code), "one effect for title+id").toHaveLength(1)
    expect(code).toContain('_$setProp(_s$, _el$1, "class", () => tone())')
    expect(code, "class must not be written from inside the group").not.toMatch(/_p\$\??\.class/)

    const result = await compareToOracle("class-with-live-siblings")
    expect(result.ok, formatDivergences("class-with-live-siblings", result.divergences)).toBe(true)
    expect(result.compiled.trace.created, "one grouped effect + the runtime's class effect").toBe(2)
    expect(result.oracle.trace.created, "the oracle makes one per live prop").toBe(3)
  })

  it("reactive-attribute: a runtime-diffed prop is passed through, not merged", async () => {
    const code = compileFixtureBody("reactive-attribute")
    // Positive: both live props reach `setProp` UNWRAPPED, which is what
    // "passed through" means. "no renderEffect" and "two effects" are both
    // properties of the un-compiled path as well — this was one of the six.
    expect(code).toContain('_$setProp(_s$, _el$1, "href", () => href())')
    expect(code).toContain('_$setProp(_s$, _el$1, "class", () => active()')
    expect(templateHtml(code), "only the static attribute is baked").toEqual([
      '<a data-static="keep">go</a>',
    ])
    expect(renderEffectBodies(code)).toEqual([])

    const result = await compareToOracle("reactive-attribute")
    // Was asserted as 1 at M3 by merging `class` into `href`'s effect. That is
    // unsound (see class-with-live-siblings), so the honest count is 2: one
    // compiled effect for `href`, one the runtime creates for `class`.
    expect(result.compiled.trace.created).toBe(2)
  })

  it("no effect group spans two elements, across the corpus", () => {
    // P5 merges a CONTIGUOUS run of live props on ONE element. Merging across
    // elements would still produce identical DOM and FEWER effects, so no bound
    // in the differential harness can see it — `boundEffects` treats fewer
    // effects as never a divergence. `passes::group::tests` pins the pass
    // itself; this pins what codegen actually emitted.
    let groups = 0
    for (const name of listFixtures()) {
      const code = compileFixtureBody(name)
      const bodies = renderEffectBodies(code)
      // The scan used to be anchored on a four-space closing brace, which
      // reports ZERO groups on a nested emit — indistinguishable from a module
      // that has none. Balanced parens cannot miss one, and this says so.
      expect(bodies, `${name}: every renderEffect must be scanned`).toHaveLength(
        emittedCalls(code, "renderEffect"),
      )
      for (const targets of groupTargets(code)) {
        expect(targets, `${name}: one effect must serve one element`).toHaveLength(1)
        groups++
      }
    }
    expect(groups, "the scan has to be finding real groups").toBeGreaterThan(0)
  })

  it("the one-element rule goes red on a deliberate over-merge", () => {
    // The proof that the assertion above is a detector and not a description.
    // Rewriting one prop inside an existing group to write a DIFFERENT element
    // is exactly what an over-eager P5 would emit: identical DOM, one fewer
    // effect, and nothing else in the suite can see it.
    const code = compileFixtureBody("multi-prop-one-element")
    expect(groupTargets(code)).toEqual([["_el$1"]])

    const overMerged = code.replace('_$setProp(_s$, _el$1, "data-width"', '_$setProp(_s$, _el$2, "data-width"')
    expect(overMerged, "the mutation is stale").not.toBe(code)
    expect(groupTargets(overMerged)).toEqual([["_el$1", "_el$2"]])
  })
})

describe("target 5 — walk elision", () => {
  /**
   * A hop count is not evidence: a module that addresses nothing has zero hops
   * and satisfies every upper bound in sight. So each of these names the ROUTE
   * the compiler took and checks it is the cheapest one available for that
   * shape, with the hole still patched at the end of it.
   */
  function walks(code: string): Array<{ name: string; from: string; route: string }> {
    return [...code.matchAll(/const (_el\$+\d+) = (_el\$+\d+)((?:\.\w+)+);/g)].map((m) => ({
      name: m[1],
      from: m[2],
      route: m[3],
    }))
  }

  /** The named walks, with a missing one reported as such rather than as `undefined`. */
  function names(...walks: Array<{ name: string } | undefined>): string[] {
    return walks.map((walk, index) => {
      if (!walk) throw new Error(`walk ${index} was not emitted at all`)
      return walk.name
    })
  }

  function holes(code: string): string[] {
    return [...code.matchAll(/_\$+insert\([^,]+,\s*(_el\$+\d+)/g)].map((m) => m[1])
  }

  it("deep-walk: five nested single-child divs cost exactly five hops and nothing else", () => {
    const code = compileFixtureBody("deep-walk")
    // The span sits five levels down a chain of single-child divs, so five
    // `firstChild` hops IS the cheapest route and `lastChild` buys nothing.
    // What target #5 is worth here is everything that is NOT spent: no hop to
    // the <p> that follows, and no sixth hop to an anchor, because target #9
    // removed the anchor.
    expect(emittedCalls(code, "insert"), "the hole is still patched").toBe(1)
    expect(count(code, /\.firstChild/)).toBe(5)
    expect(count(code, /\.nextSibling|\.lastChild|\.previousSibling/)).toBe(0)
    expect(templateAnchors(code)).toBe(0)
    expect(holes(code), "and the insert lands on the span, not on the root").toEqual(["_el$6"])
  })

  it("walk-from-the-back: the last two cells are reached from the end, not the front", () => {
    const code = compileFixtureBody("walk-from-the-back")
    // Seven children, holes in the last two. Forward costs 6 + 5 hops; from the
    // back it is 1 + 2, and the second is reached from the first.
    expect(emittedCalls(code, "insert"), "both holes are still patched").toBe(2)
    const [last, penultimate] = [
      walks(code).find((w) => w.route === ".lastChild"),
      walks(code).find((w) => w.route === ".previousSibling"),
    ]
    expect(last?.from, "one hop from the root").toBeDefined()
    expect(penultimate?.from, "and one more from there").toBe(last?.name)
    expect(count(code, /\.nextSibling|\.firstChild/), "nothing walks forward").toBe(0)
    expect(new Set(holes(code))).toEqual(new Set(names(last, penultimate)))
  })

  it("sibling-walk: the second hole walks from the first, not from the root", () => {
    const code = compileFixtureBody("sibling-walk")
    // Five children, holes at index 2 and 4. Forward from the root costs
    // 2 + 4 hops; from the back it is 1 + 2, chained.
    const named = walks(code)
    const patched = holes(code)
    expect(patched, "both holes are still patched").toHaveLength(2)

    const fromRoot = named.find((w) => w.route === ".lastChild")
    const chained = named.find((w) => w.route === ".previousSibling.previousSibling")
    expect(fromRoot, "the far hole is one hop from the end").toBeDefined()
    expect(chained?.from, "and the near one walks from it").toBe(fromRoot?.name)
    expect(new Set(patched)).toEqual(new Set(names(fromRoot, chained)))
    expect(count(code, /\.nextSibling|\.firstChild/), "nothing walks forward").toBe(0)
  })
})

describe("target 6 — template dedup by content hash", () => {
  it("dedup-identical-markup: two identical subtrees yield one template()", () => {
    const code = compileFixtureBody("dedup-identical-markup")
    // <div class="grid"> plus one shared <div class="cell"> template.
    expect(emittedCalls(code, "template")).toBe(2)
    expect(new Set(templateHtml(code)).size, "and no two of them are the same bytes").toBe(2)
  })
})

describe("target 7 — delegated events as expando writes", () => {
  it("delegated-event: onClick emits a $$click assignment, never addEventListener", () => {
    const code = compileFixtureBody("delegated-event")
    expect(code).toMatch(/\$\$click\s*=/)
    expect(code).not.toContain("addEventListener")
  })

  it("non-delegated-event: onMouseEnter/onFocus are bound directly, never as an expando", () => {
    const code = compileFixtureBody("non-delegated-event")
    // A document listener for a non-bubbling type can never fire from a
    // descendant, so the expando would be silently dead. The positive clauses
    // are what make this more than "the compiler emitted nothing".
    expect(code).toMatch(/addEventListener\("mouseenter"/)
    expect(code).toMatch(/addEventListener\("focus"/)
    expect(code, "no module-wide registration for a type that does not bubble").not.toContain(
      "delegateEvents",
    )

    expect(code).not.toMatch(/\$\$mouseenter/)
    expect(code).not.toMatch(/\$\$focus\b/)
  })

  it("handler-by-reference: a handler bound to a name is an expando write at either scope", () => {
    // The commonest shape in real code, and the one target #7 used to miss:
    // `const h = () => …; <button onClick={h}/>` fell all the way back to
    // setProp, getting neither the expando nor the hoist.
    const code = compileFixtureBody("handler-by-reference")
    expect(code).toMatch(/_el\$\d+\.\$\$click = bump/)
    expect(code).toMatch(/_el\$\d+\.\$\$click = reset/)
    expect(code, "no runtime isEventHandlerValue check for either").not.toContain('"onClick"')

    // The module-scope one stays at module scope and the component-scope one
    // stays inside the component — the compiler moves neither.
    expect(code.indexOf("const bump =")).toBeLessThan(code.indexOf("function HandlerByReference"))
    expect(code.indexOf("const reset =")).toBeGreaterThan(code.indexOf("function HandlerByReference"))
  })

  it("delegated-event: the delegated set is registered exactly once per module", () => {
    const code = compileFixtureBody("delegated-event")
    expect(count(code, /delegateEvents\(/)).toBe(1)
  })
})

describe("target 8 — thunk elision for static control-flow bodies", () => {
  it("control-flow-show-eager-static-body: the body is one clone, handed straight in", async () => {
    // M4 emitted `_$createElement(Show, { when: () => on() }, _tmpl$1())`, which
    // copies the props object and pays for a variadic call. P4 Shape makes the
    // call real, and the body — a subtree that produced no patch — reaches
    // `children` as the clone itself: no arrow, no IIFE, no element binding.
    const code = compileFixtureBody("control-flow-show-eager-static-body")
    expect(code).toMatch(/Show\(_s\$, \{/)
    // O2/O2.1 SUPERSEDE target #8's eager arm, and this is where that is said.
    // A child may not be an ARGUMENT, because an argument is evaluated at the
    // call site — before the receiving scope exists — so "the clone itself,
    // handed straight in" is a shape M3 makes unrepresentable. What survives of
    // the elision is the IIFE and the element binding, both still absent.
    expect(code).toMatch(/children:\s*[\w$]*block\(\(_s\$\)\s*=>\s*_tmpl\$\d+\(\)\)/)
    expect(code, "the child is never a built node").not.toMatch(/children:\s*_tmpl\$\d+\(\)/)
    expect(code, "and nothing to bind it to").not.toMatch(/const _el\$/)
    expect(emittedCalls(code, "insert") + emittedCalls(code, "setProp")).toBe(0)

    // The observable consequence of the change, measured rather than asserted:
    // with the Block, each toggle REBUILDS the body. With the eager clone `Show`
    // handed the same node back every time, which is what the un-compiled
    // reference still does — that is the whole of this fixture's row in
    // `oracle-known-failures.ts`, and `oracle.test.ts` owns the comparison.
    const rendered = await renderViaCompiler("control-flow-show-eager-static-body")
    const identities = rendered.channels.map((frame) => frame.identity.join(","))
    expect(new Set(identities).size, "the toggle rebuilt the body").toBeGreaterThan(1)
  })

  it("control-flow-show-static-body: an AUTHOR-written thunk survives, however static the body", async () => {
    // The boundary, and it is behavioural, not cosmetic. Unwrapping the arrow
    // builds the subtree at call time even when the branch is never taken, and
    // reuses one node across every re-mount where the oracle calls the arrow
    // again. `node-identity` in normalize.ts is the only channel that sees the
    // second half — html, markers, attributes and anchors are all identical.
    const code = compileFixtureBody("control-flow-show-static-body")
    expect(code).toMatch(/Show\(_s\$, \{/)
    // C6: the child is a Block, so the arrow declares the scope it runs under.
    expect(code).toMatch(/children:\s*[\w$]*block\(\(_s\$\)\s*=>\s*_tmpl\$\d+\(\)\)/)
    // η-reduction of the prop the runtime unwraps itself, from the same pass.
    expect(code).toMatch(/when:\s*on\b/)

    const result = await compareToOracle("control-flow-show-static-body")
    expect(result.ok, formatDivergences("control-flow-show-static-body", result.divergences)).toBe(true)
    // The fixture toggles off and back on, so the oracle really did build a
    // second `.panel`; matching it means the compiled path did too.
    const identities = result.compiled.channels.map((frame) => frame.identity.join(","))
    expect(new Set(identities).size, "the toggle rebuilt the body").toBeGreaterThan(1)
  })

  it("control-flow-for-static-body: a ROW body keeps its thunk however static it is", () => {
    // The boundary, and the one that has to hold: `For` calls `children(item,
    // index)` per row, so handing it a node is a TypeError — and where it is not,
    // a single node shared by every row would collapse the list to one element.
    // Elision is a fact about the component's children contract, never about the
    // body alone.
    const code = compileFixtureBody("control-flow-for-static-body")
    expect(code).toMatch(/For\(_s\$, \{/)
    expect(code).toMatch(/children:\s*[\w$]*block\(\(_s\$\)\s*=>\s*_tmpl\$\d+\(\)\)/)
  })

  it("control-flow-show: a body with a hole in it also keeps its thunk", async () => {
    // control-flow-nested is a Show whose body builds a <ul> and patches a For
    // into it. That body is not static, so the arrow stays and the DOM is only
    // built when `when` is first true.
    const code = compileFixtureBody("control-flow-nested")
    expect(code).toMatch(/children:\s*[\w$]*block\(\(_s\$\)\s*=>\s*\{/)

    // The oracle leg moved: `control-flow-nested` is registered in
    // `oracle-known-failures.ts` because its reference module binds the scope to
    // the row callback's item slot, and `oracle.test.ts` holds it to exactly
    // that divergence. What is asserted here is the half this test is about —
    // the body really is built, and only when `when` is first true.
    const rendered = await renderViaCompiler("control-flow-nested")
    expect(rendered.html, "the body was built").toContain("<li>")
  })
})

describe("target 9 — marker elision", () => {
  it("text-hole-trailing: a hole with nothing after it emits an anchorless insert", () => {
    const code = compileFixtureBody("text-hole-trailing")
    expect(templateAnchors(code)).toBe(0)
    expect(emittedCalls(code, "insert"), "the hole is still patched").toBe(1)
    expect(code).toMatch(/_\$insert\([^,]+,[^,]+,[^,)]+\)/)
  })

  it("text-hole-followed: a following ELEMENT is the anchor, so no comment is baked", () => {
    // The stronger form of elision, and the one a hole-counting bound cannot
    // state: something does follow the hole, and it still costs no marker,
    // because the <span> that follows is itself a stable node to insert before.
    const code = compileFixtureBody("text-hole-followed")
    expect(templateAnchors(code)).toBe(0)
    expect(templateHtml(code)).toEqual(['<div><span class="suffix">items</span></div>'])
    expect(code).toMatch(/_\$insert\(_s\$, _el\$1, \(\) => count\(\), _el\$2\)/)
    expect(code, "and the anchor it uses is the span itself").toMatch(
      /const _el\$2 = _el\$1\.firstChild;/,
    )
  })

  it("text-hole-fused: adjacent literal text runs fuse, so the hole still needs a marker", () => {
    // The case elision cannot remove. The text either side would parse into ONE
    // node, so there is no existing node to insert before and a comment is the
    // only stable position — which is why the anchor count is not simply zero.
    const code = compileFixtureBody("text-hole-fused")
    expect(templateHtml(code)).toEqual(["<p>Total: <!----> clicks</p>"])
    expect(templateAnchors(code)).toBe(1)
    expect(code).toMatch(/_\$insert\([^,]+,[^,]+,[^,]+,[^,)]+\)/)
  })

  it("the anchor bound counts nodes, not the characters that spell one", async () => {
    // marker-literal-text writes `<!---->` into a static attribute value, into
    // the text a hole renders, and writes `_$insert(` into a string. All three
    // reach the emitted module verbatim, and all three move a substring count.
    //
    // This is the shape that matters most now that elision has landed: the
    // module bakes NO anchor, so the harness's "templates carry none, so the
    // DOM must carry none" branch has to run. A substring count says there IS
    // one, skips that branch, and the check silently stops existing.
    const code = compileFixtureBody("marker-literal-text")
    const html = templateHtml(code).join("")

    expect(html).toContain('data-note="<!---->"')
    expect(countRaw(html, /<!---->/), "the substring count this replaced").toBe(1)
    expect(templateAnchors(code), "and the exact one: no anchor at all").toBe(0)

    expect(code).toContain("_$insert( is not a call site here")
    expect(countRaw(code, /_\$+insert\(/), "the substring count this replaced").toBeGreaterThan(1)
    expect(emittedCalls(code, "insert"), "one call site").toBe(1)

    const result = await compareToOracle("marker-literal-text")
    expect(result.ok, formatDivergences("marker-literal-text", result.divergences)).toBe(true)
    expect(result.compiled.channels[0].anchors, "no anchor reached the DOM").toBe(0)
    expect(
      countAnchors(result.compiled.channels[0].markers),
      "and the marker channel agrees, because it escapes the text a hole renders",
    ).toBe(0)
    expect(result.oracle.channels[0].anchors, "the oracle renders the text and no anchor").toBe(0)
  })

  it("the exact bound still catches a spurious anchor on that same fixture", async () => {
    const result = await compareToOracle("marker-literal-text", {
      emitted: (code) => code.replace("<span>end</span>", "<span>end</span><!---->"),
    })
    expect(result.ok).toBe(false)
    expect(result.divergences.map((d) => d.kind)).toEqual(["marker-count"])
  })

  it("no fixture in the corpus bakes an anchor that nothing inserts before", () => {
    // The invariant target #9 actually states, corpus-wide. `auditAnchors`
    // resolves each emitted walk against the parsed template, so an anchor is
    // "used" only when an `_$insert` really names the node it resolves to.
    let baked = 0
    for (const name of listFixtures()) {
      const audit = auditAnchors(compileFixtureBody(name))
      expect(audit.unused, `${name} bakes an anchor nothing uses`).toBe(0)
      expect(audit.unresolved, `${name}: the walk resolver has gone blind`).toBe(0)
      baked += audit.baked
    }
    expect(baked, "some fixture still needs an anchor, or this proves nothing").toBeGreaterThan(0)
  })

  it("the audit still resolves a module whose uids were hygiene-shifted", () => {
    // The failure this pins is silent by construction: a scanner matching
    // single-`$` names finds no root, no walk and no insert on a module like
    // this, so every field comes back zero and `unused === 0` above passes over
    // a module nobody read. The audit now refuses to answer instead.
    const code = compileFixtureBody("hygiene-shifted-uids")
    expect(code, "the fixture has to actually shift the uids").toContain("_tmpl$$")
    expect(code).toContain("_el$$")

    const audit = auditAnchors(code)
    expect(audit.baked, "the hole sits between two text runs, so it costs one").toBe(1)
    expect(audit.used, "and the audit resolved the walk that names it").toBe(1)
    expect(audit.unused).toBe(0)
    expect(audit.unresolved).toBe(0)
  })

  it("a module the audit cannot read is a failure, not a clean bill", () => {
    const code = compileFixtureBody("text-hole-fused")
    expect(templateHtml(code).length, "the module has templates to read").toBeGreaterThan(0)
    // Rename every root binding out from under the scanner: the templates are
    // still there, so silence would be a lie.
    expect(() => auditAnchors(code.replace(/_tmpl\$+\d+/g, "_renamed"))).toThrow(/gone blind/)
  })
})

/**
 * Target 10 is asserted in `ssr.test.ts`, not here.
 *
 * It used to carry two `it.todo` bodies in this file. They are gone rather than
 * enabled: `SSR emit shape` in `ssr.test.ts` runs the same two claims live and
 * correctly — one of the bodies below asserted `not.toContain("<section")` over
 * a module whose whole job is to carry `<section` inside a template literal, so
 * enabling it as written would have failed — and a second, wrong copy of a
 * claim is worse than none.
 */

describe("target 11 — compile throughput", () => {
  // Live from milestone 1: the compiler already runs, so this is a real budget,
  // not a promise. test/throughput.test.ts prints the full per-fixture table;
  // this asserts the two files that would break the budget first.
  it("the slowest fixture and a typical component file compile in under 1ms", () => {
    const names = listFixtures()
    // A compiler that emits its input back is instantaneous, so the budget on
    // its own measures nothing. What is being timed has to be a real compile —
    // this was one of the six.
    const emitted = names.map((name) => compileFixture(name))
    expect(
      emitted.filter((code, i) => code === fixtureSource(names[i])),
      "a fixture that came back unchanged was not compiled",
    ).toEqual([])
    expect(
      emitted.filter((code) => emittedCalls(code, "template") > 0).length,
      "and most of the corpus reached a template",
    ).toBeGreaterThanOrEqual(40)

    const slowest = names
      .map((name) => measure(name, fixtureSource(name)))
      .reduce((worst, row) => (row.msPerCompile > worst.msPerCompile ? row : worst))
    const typical = measure("typical-component-file", typicalComponentFile(fixtureSource))

    expect(slowest.msPerCompile, `slowest fixture: ${slowest.name}`).toBeLessThan(1)
    expect(typical.msPerCompile).toBeLessThan(1)
  }, 120_000)
})

describe("open questions the harness must be able to state", () => {
  // Not targets: decisions that change what "correct" means. Written down here
  // so they are visible in the suite instead of living only in a design doc.

  it("O4: a bare tracked read is auto-thunked, and every fixture holding one declares it live", async () => {
    // `<div>{count()}</div>` is a dead read in the oracle and a live binding
    // once auto-thunking is on. This used to forbid the shape corpus-wide,
    // which kept the effect bound simple but made the compiler-BUILT thunk
    // unreachable from any fixture — the arrow-construction path in
    // `codegen::dom::thunk` had zero coverage in either suite as a result.
    //
    // The rule is now the one that actually matters: a fixture may hold a bare
    // read, but it must DECLARE what goes live, so the bound is lifted by
    // exactly the holes that earned it and stays a bound for everything else.
    // `(?<!$)` because `${a()}` inside a template literal is an interpolation,
    // not a JSX hole — the compiler never auto-thunks it on its own, and counting
    // it made a fixture whose only holes are author-written thunks demand a
    // `goesLive` it could never earn. `[=>]{` because the attribute form has to
    // start at an attribute (`x={`) or at a hole (`>{`), not mid-expression.
    const bare = listFixtures().filter((name) =>
      /(?<!\$)\{\s*[A-Za-z_$][\w.$]*\(\)\s*\}|[=>]\{`[^`]*\$\{[^}]*\(\)[^}]*\}/.test(
        fixtureSource(name),
      ),
    )
    expect(bare, "the fixture that reaches the compiler-built thunk").toContain("auto-thunked-read")

    const registry = oracleRegistry()
    for (const name of bare) {
      // A registered fixture keeps the declaration half of this rule — the
      // bound is still lifted by exactly the holes that earned it — and loses
      // only the equality, which `oracle-known-failures.ts` explains and
      // `oracle.test.ts` holds to a stated set of channels.
      if (registry.has(name)) {
        const compiled = await renderViaCompiler(name)
        expect(compiled.goesLive.length, `${name} must declare its live holes`).toBeGreaterThan(0)
        continue
      }
      const result = await compareToOracle(name)
      expect(result.compiled.goesLive.length, `${name} must declare its live holes`).toBeGreaterThan(
        0,
      )
      expect(result.ok, formatDivergences(name, result.divergences)).toBe(true)
    }
  })

  it("O4: the compiler-built thunk is a plain arrow, and it is actually reached", async () => {
    // The exact bug this pins: oxc's `new_arrow_function_expression` takes
    // `r#async` as its second argument, so passing `true` there emits
    // `async () => …` and every one of these holes becomes a Promise. No
    // explicit-thunk fixture can catch it, because their arrows come from the
    // author's own source.
    // The ref NUMBERS are P6's to choose — it renumbers whenever a cheaper
    // route is found — so the shapes are pinned and the numbering is not.
    const code = compileFixtureBody("auto-thunked-read")
    expect(code).toMatch(/_\$setProp\(_s\$, _el\$\d+, "title", \(\) => `count: \$\{count\(\)\}`\)/)
    expect(code).toMatch(/_\$insert\(_s\$, _el\$\d+, \(\) => `n=\$\{count\(\)\}`\)/)
    expect(code, "a bare read still η-reduces to the accessor itself").toMatch(
      /_\$insert\(_s\$, _el\$\d+, count\)/,
    )
    expect(code, "an async arrow would make every hole a Promise").not.toMatch(
      /async\s*\(\s*\)\s*=>/,
    )

    const result = await compareToOracle("auto-thunked-read")
    expect(result.ok, formatDivergences("auto-thunked-read", result.divergences)).toBe(true)
    expect(result.wins.length, "the declared win must materialise").toBe(1)
    expect(result.compiled.trace.created, "three live holes, three effects").toBe(3)
    expect(result.oracle.trace.created, "the oracle reads each once and binds nothing").toBe(0)
  })

  it("spread: the oracle reads a spread object once; reactive _$spread does strictly more work", async () => {
    // spread-static-mix has scripted steps that the oracle deliberately
    // ignores. If the compiler emits a reactive spread, its frames will change
    // where the oracle's do not, and this fixture fails on step-dom.
    //
    // `ok === true` is trivially true of an un-compiled module, which IS the
    // oracle — this was one of the six. The positive half is that the JSX went
    // through the compiler and came out on the createElement path, which is the
    // path whose once-only spread semantics the steps are pinning.
    const code = compileFixtureBody("spread-static-mix")
    expect(code, "the JSX is gone").not.toContain("<div")
    expect(code).toContain('_$createElement("div"')
    expect(emittedCalls(code, "spread"), "and no reactive spread was emitted").toBe(0)

    const result = await compareToOracle("spread-static-mix")
    expect(result.ok, formatDivergences("spread-static-mix", result.divergences)).toBe(true)
    expect(
      result.compiled.frames.every((frame) => frame === result.compiled.html),
      "the compiled path's spread stayed inert too",
    ).toBe(true)
  })

  it("pre/textarea: the oracle applies ordinary JSX text cleaning, with no whitespace exemption", async () => {
    // The dead Babel plugin preserved raw text inside <pre>/<textarea>. The
    // JSX runtime does not — the transpiler cleans it like any other JSX text.
    // Matching the oracle means NOT special-casing those tags.
    //
    // Agreeing with the oracle is what an un-compiled module does by
    // definition — this was one of the six. The positive half names the exact
    // bytes the template has to bake, which is where a whitespace exemption
    // would show up.
    const code = compileFixtureBody("pre-whitespace")
    expect(templateHtml(code)).toEqual([
      "<div><pre>  indented lines  kept</pre><textarea>raw   text</textarea></div>",
    ])

    const result = await compareToOracle("pre-whitespace")
    expect(result.divergences).toEqual([])
    expect(result.ok).toBe(true)
  })

  it("output stays readable: no single-letter identifiers in emitted code", () => {
    const code = compileFixtureBody("control-flow-for")
    // Uncompiled JSX also contains no `const x =`, so the negative alone says
    // nothing. Require the compiled shapes whose names are the ones at risk.
    expect(code).toMatch(/const _tmpl\$\d+ = /)
    expect(code).toMatch(/const _el\$\d+ = /)
    expect(code).not.toMatch(/\bconst [a-z] =/)
  })
})
