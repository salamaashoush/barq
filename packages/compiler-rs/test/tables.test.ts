import { describe, expect, it } from "bun:test"

import { compileSource, emittedCalls, stripLiterals, templateHtml } from "./harness.ts"
import {
  CSS_NUMBER_PROPS,
  DELEGATED_EVENTS,
  DOM_PROPS,
  NON_BUBBLING_EVENTS,
  SVG_TAGS,
  USER_MUTABLE_PROPS,
} from "./dom-tables.ts"

/**
 * DESIGN §9's drift check, from the side that reaches a user: `dom.ts` as it is
 * on disk RIGHT NOW, against the behaviour of the binding the harness loaded. It
 * goes red the moment the two disagree, whether the cause is a stale prebuilt
 * artifact or a table the generator never learned about.
 *
 * The extraction itself lives in `dom-tables.ts`, shared with `ssr.test.ts`.
 */

/** `onclick` for `click`, `onpointerdown` for `pointerdown`. */
function jsxEventName(type: string): string {
  return `on${type[0].toUpperCase()}${type.slice(1)}`
}

// `handler` is declared, not free: a free identifier is unresolvable, and the
// compiler correctly refuses to write an expando for a name it cannot prove is
// a function. Leaving it free made every row below pass for the wrong reason.
/** `dom.ts`'s own resolution, from the same table: `*` first, then the tag. */
function userMutableOn(tag: string, prop: string): boolean {
  return USER_MUTABLE_PROPS.includes(`*:${prop}`) || USER_MUTABLE_PROPS.includes(`${tag}:${prop}`)
}

function compile(jsx: string): string {
  return compileSource(
    `import { signal } from "@barqjs/core";\nconst live = signal("x");\nconst handler = () => {};\nconst Probe = () => ${jsx};\n`,
    "probe.tsx",
  )
}

describe("the compiler's tables against dom.ts as it is on disk", () => {
  it("the extraction found tables, not an empty file", () => {
    // Every row below is a loop, so a table that silently came out empty would
    // turn this whole file into zero assertions.
    expect(DELEGATED_EVENTS.length).toBeGreaterThanOrEqual(20)
    expect(NON_BUBBLING_EVENTS.length).toBeGreaterThanOrEqual(10)
    expect(SVG_TAGS.length).toBeGreaterThanOrEqual(50)
    expect(DOM_PROPS.length).toBeGreaterThanOrEqual(10)
    expect(CSS_NUMBER_PROPS.length).toBeGreaterThanOrEqual(10)
  })

  it("nothing is both delegated and non-bubbling", () => {
    // A document listener for a non-bubbling type never fires from a
    // descendant, so a name in both tables makes the compiler emit an expando
    // the runtime warns about and that never runs.
    expect(DELEGATED_EVENTS.filter((event) => NON_BUBBLING_EVENTS.includes(event))).toEqual([])
  })

  it("every delegated event compiles to an expando write and a registration", () => {
    const missed: string[] = []
    for (const event of DELEGATED_EVENTS) {
      const code = compile(`<div ${jsxEventName(event)}={handler} />`)
      const expando = new RegExp(`\\$\\$${event}\\s*=`).test(code)
      const registered = code.includes(`delegateEvents([`) && code.includes(`"${event}"`)
      if (!expando || !registered) missed.push(event)
    }
    expect(missed, "dom.ts delegates these; the loaded compiler does not").toEqual([])
  })

  it("no non-bubbling event compiles to an expando write, where a delegated one does", () => {
    // Both clauses below are NEGATIVE, and a compiler that emitted nothing at
    // all would satisfy them — which is exactly how a row goes vacuous. So each
    // non-bubbling name is compiled BESIDE a delegated one in the same element:
    // the positive half has to hold in the same module that the negative half
    // is asserted on.
    const wrong: string[] = []
    for (const event of NON_BUBBLING_EVENTS) {
      const code = compile(`<div ${jsxEventName(event)}={handler} onClick={handler} />`)
      if (new RegExp(`\\$\\$${event}\\b`).test(code)) wrong.push(event)
      if (!/\$\$click\s*=/.test(code)) wrong.push(`${event} (the compiler emitted nothing)`)
      if (!/delegateEvents\(\[\s*"click"\s*\]\)/.test(code)) {
        wrong.push(`${event} (click was not registered)`)
      }
      if (new RegExp(`delegateEvents\\([^)]*"${event}"`).test(code)) {
        wrong.push(`${event} (registered)`)
      }
    }
    expect(wrong, "dom.ts says these never bubble to document").toEqual([])
  })

  it("every SVG tag compiles to a namespaced template", () => {
    const missed: string[] = []
    for (const tag of SVG_TAGS) {
      // `svg` itself is the namespace root and needs no flag; everything else
      // reaches the DOM through createElementNS and must be told so.
      const code = compile(`<${tag} />`)
      if (!/_\$+template\(`[^`]*`,\s*true\)/.test(code) && tag !== "svg") missed.push(tag)
    }
    expect(missed, "dom.ts creates these with createElementNS").toEqual([])
  })

  it("no DOM_PROPS name is folded into the template on an HTML element", () => {
    // The property channel writes these, so baking a literal into the HTML sets
    // only the default attribute and diverges the moment the field is dirty.
    // The compiler picks the channel now (§3.5), so the assertion is which
    // channel it picked — and there are two of them: §3.10.1 splits the names
    // the USER also writes onto `setLive`, which compares against the element
    // instead of against the framework's own last write. The split is asserted
    // as a PARTITION rather than as two independent lists: a name on both
    // channels, or on neither, fails here.
    const folded: string[] = []
    for (const prop of DOM_PROPS) {
      const code = compile(`<input ${prop}="x" />`)
      const live = userMutableOn("input", prop)
      const wanted = live ? "setLive" : "setDomProp"
      const other = live ? "setDomProp" : "setLive"
      if (templateHtml(code).join("").includes(`${prop}=`)) folded.push(prop)
      if (emittedCalls(code, wanted) === 0) folded.push(`${prop} (not applied by ${wanted})`)
      if (emittedCalls(code, other) !== 0) folded.push(`${prop} (also went to ${other})`)
      if (emittedCalls(code, "setAttr") !== 0) folded.push(`${prop} (went to the attribute channel)`)
    }
    expect(folded, "dom.ts routes these through the property channel").toEqual([])
  })

  /**
   * §3.10.1's own row. `USER_MUTABLE_PROPS` is keyed `tag:property` because the
   * question is not whether a property can be written but whether the USER can
   * write it on THIS element — and the compiler has to answer it the same way
   * the runtime does or the two paths diverge on the one element that matters.
   *
   * `<option value="one">` is the negative that made the key a pair: an
   * option's `value` falls back to its TEXT, so a compare against the element
   * reports "already holds it" and the reflected attribute never appears. The
   * oracle, which writes props before it appends children, writes it.
   */
  it("the user-mutable channel is resolved per tag, not per name", () => {
    const wrong: string[] = []
    for (const key of USER_MUTABLE_PROPS) {
      const [tag, prop] = key.split(":")
      const on = tag === "*" ? "div" : tag!
      // A LIVE value: the compare exists for a write that repeats, and a
      // literal the parser can bake never fights a user for the field.
      const code = compile(`<${on} ${prop}={live()} />`)
      if (emittedCalls(code, "setLive") === 0) wrong.push(`${key} (not on the live channel)`)
      if (emittedCalls(code, "setDomProp") !== 0) wrong.push(`${key} (also on setDomProp)`)
      // The same property on a tag the table does NOT name must not reach it.
      if (tag !== "*") {
        const elsewhere = compile(`<span ${prop}={live()} />`)
        if (emittedCalls(elsewhere, "setLive") !== 0) wrong.push(`${key} (reached span too)`)
      }
    }
    // The negative the table was rewritten for.
    const option = compile(`<option value={live()}>one</option>`)
    if (emittedCalls(option, "setLive") !== 0) {
      wrong.push("option:value (an option's value is not the user's)")
    }
    expect(wrong, "dom.ts resolves the user-mutable channel from the tag AND the name").toEqual([])
  })

  /**
   * What "the style object is handed over whole" means, as a predicate over one
   * emitted module rather than as three loose `expect`s.
   *
   * Stated this way for one reason: every clause is a NEGATIVE except the last,
   * and the row it replaces could not be shown to fail. Renaming a
   * CSS_NUMBER_PROPS entry in `dom.ts` and rerunning it — the exact drift the
   * file exists to catch — left it green, because the compiler passes ANY key
   * through unchanged and the assertions only ever looked at the key they had
   * just written. A predicate can be run against a corrupted module, and the
   * `it` below does that.
   */
  function styleObjectStaysWhole(code: string, prop: string): string[] {
    const wrong: string[] = []
    // The POSITIVE clause, and it is load-bearing. Every other clause here is a
    // negative, and un-compiled JSX satisfies all of them: it folds nothing into
    // a template it does not have, it contains no `px`, and it contains
    // `"z-index": 2` because that is what the author wrote. Requiring the object
    // to have reached the runtime's style channel — one `setStyle`, on an
    // element that came out of a template — is what makes this a claim about a
    // compiler at all.
    if (emittedCalls(code, "setStyle") !== 1) wrong.push(`${prop}: not applied through the style channel`)
    if (emittedCalls(code, "template") !== 1) wrong.push(`${prop}: the element never reached a template`)
    if (templateHtml(code).join("").includes("style=")) wrong.push(`${prop}: folded into the template`)
    if (stripLiterals(code).includes("px")) wrong.push(`${prop}: a px suffix reached the code`)
    if (!code.includes(`"${prop}": 2`)) wrong.push(`${prop}: the key did not reach the runtime verbatim`)
    return wrong
  }

  it("a style OBJECT is handed to the runtime whole — CSS_NUMBER_PROPS drift is UNOBSERVABLE on the DOM target", () => {
    // CSS_NUMBER_PROPS is the one table whose drift produces wrong PIXELS rather
    // than a wrong node, and on the DOM target the emitted code cannot witness
    // it: nothing folds a style object, so the compiler never has to decide
    // about `px`. That is the correct behaviour to pin here.
    //
    // Where the drift DOES become observable is the SSR backend: markup has one
    // `style=` slot and no CSSOM, so a literal style object is folded into the
    // chunk at compile time (DESIGN §5's M6 amendment) and the px rule becomes
    // the COMPILER's decision, which it can get wrong. `ssr.test.ts` holds that
    // comparison — it asserts the fold really happened and then diffs the unit
    // against the runtime's own answer — driven by the same table this file
    // reads out of `dom.ts`. This row is not that check and does not pretend to
    // be; it pins the other half, which is that the DOM target must NOT fold.
    //
    // The claim here is narrower and is asserted exactly: the key reaches the
    // runtime BYTE FOR BYTE, which is what makes the runtime's own
    // `cssProp in CSS_NUMBER_PROPS` lookup land in the right class. A compiler
    // that helpfully kebab-cased `zIndex` would flip `z-index` from the px rule
    // to the unitless one, and this is the clause that sees it.
    for (const prop of CSS_NUMBER_PROPS) {
      expect(styleObjectStaysWhole(compile(`<div style={{ "${prop}": 2 }} />`), prop)).toEqual([])
    }
    // The same for a property that is NOT in the table, so the row is not
    // quietly measuring one class only.
    expect(styleObjectStaysWhole(compile(`<div style={{ "width": 2 }} />`), "width")).toEqual([])
  })

  it("and that claim is a detector, including against a compiler that did nothing at all", () => {
    // The proof the row above is a measurement. Each mutation is a thing a
    // future P3 could plausibly do, applied to a real emitted module.
    const clean = compile(`<div style={{ "z-index": 2 }} />`)
    expect(styleObjectStaysWhole(clean, "z-index"), "the clean module must pass").toEqual([])

    // 1. the object folded into the template HTML
    const folded = clean.replace(/_\$template\(`<div/, '_$template(`<div style="z-index:2"')
    expect(folded, "mutation 1 is stale").not.toBe(clean)
    expect(styleObjectStaysWhole(folded, "z-index")).not.toEqual([])

    // 2. a px suffix applied at compile time to a UNITLESS property
    const pixels = clean.replace(`"z-index": 2`, `"z-index": "2px"`)
    expect(pixels, "mutation 2 is stale").not.toBe(clean)
    expect(styleObjectStaysWhole(pixels, "z-index")).not.toEqual([])

    // 3. the key rewritten, which is what silently moves a property between the
    //    unitless class and the px class at runtime
    const renamed = clean.replace(`"z-index": 2`, `"zIndex": 2`)
    expect(renamed, "mutation 3 is stale").not.toBe(clean)
    expect(styleObjectStaysWhole(renamed, "z-index")).not.toEqual([])

    // 4. no compiler at all. The three mutations above are things a future P3
    //    could do; this one is the thing the M1 identity round-trip does, and it
    //    used to satisfy every clause — un-compiled JSX folds nothing, contains
    //    no `px`, and contains `"z-index": 2` because the author wrote it there.
    const uncompiled = `const Probe = () => <div style={{ "z-index": 2 }} />;\n`
    expect(styleObjectStaysWhole(uncompiled, "z-index")).not.toEqual([])
  })
})
