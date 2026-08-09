import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { compileSource, emittedCalls, stripLiterals, templateHtml } from "./harness.ts"

/**
 * DESIGN §9 calls table generation "the only mechanism that keeps the compiler
 * and the runtime honest". `build.rs` re-derives the tables from `dom.ts` on
 * every build that `cargo:rerun-if-changed` triggers, and `src/tables.rs`'s own
 * test proves the GENERATOR is sensitive to an edit.
 *
 * Neither of those can see the drift that actually reaches a user: the compiler
 * is shipped as a prebuilt `.node`, and a `dom.ts` that moved after that binary
 * was produced is a compiler emitting `$$` expandos for events the runtime no
 * longer delegates. This is the check from the other side — `dom.ts` as it is on
 * disk RIGHT NOW, against the behaviour of the binding the harness loaded — and
 * it goes red the moment the two disagree, whether the cause is a stale artifact
 * or a table the generator never learned about.
 *
 * `BARQ_DOM_TS` points it at a different `dom.ts`, which is how the check is
 * itself checked: aim it at an edited copy and the rows below fail.
 */

const DOM_TS = process.env.BARQ_DOM_TS ?? join(import.meta.dir, "..", "..", "core", "src", "dom.ts")
const source = readFileSync(DOM_TS, "utf8")

const unquote = (text: string): string => text.trim().replace(/^["']|["']$/g, "").trim()

/** `const NAME: Record<string, 1> = { a: 1, "b-c": 1 };` */
function record(name: string): string[] {
  return entries(`const ${name}: Record<string, 1> = {`, "{", "}", name).map((entry) =>
    unquote(entry.slice(0, entry.lastIndexOf(":"))),
  )
}

/** `const NAME = new Set(["a", "b"]);` */
function set(name: string): string[] {
  return entries(`const ${name} = new Set([`, "[", "]", name).map(unquote)
}

function entries(header: string, open: string, close: string, name: string): string[] {
  const at = source.indexOf(header)
  if (at === -1) throw new Error(`dom.ts no longer declares \`${header}\` — this check is stale`)
  let depth = 1
  let end = at + header.length
  while (end < source.length && depth > 0) {
    if (source[end] === open) depth++
    else if (source[end] === close) depth--
    if (depth > 0) end++
  }
  const out = source
    .slice(at + header.length, end)
    .split("\n")
    .map((line) => (line.includes("//") ? line.slice(0, line.indexOf("//")) : line))
    .join("\n")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
  if (out.length === 0) throw new Error(`\`${name}\` in dom.ts came out empty — this check is stale`)
  return out
}

const DELEGATED_EVENTS = set("DELEGATED_EVENTS")
const NON_BUBBLING_EVENTS = set("NON_BUBBLING_EVENTS")
const SVG_TAGS = record("SVG_TAGS")
const DOM_PROPS = record("DOM_PROPS")
const CSS_NUMBER_PROPS = record("CSS_NUMBER_PROPS")

/** `onclick` for `click`, `onpointerdown` for `pointerdown`. */
function jsxEventName(type: string): string {
  return `on${type[0].toUpperCase()}${type.slice(1)}`
}

// `handler` is declared, not free: a free identifier is unresolvable, and the
// compiler correctly refuses to write an expando for a name it cannot prove is
// a function. Leaving it free made every row below pass for the wrong reason.
function compile(jsx: string): string {
  return compileSource(`const handler = () => {};\nconst Probe = () => ${jsx};\n`, "probe.tsx")
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
    // `setElementAttr` writes these through the PROPERTY channel, so baking a
    // literal into the HTML sets only the default attribute and diverges the
    // moment the field is dirty.
    const folded: string[] = []
    for (const prop of DOM_PROPS) {
      const code = compile(`<input ${prop}="x" />`)
      if (templateHtml(code).join("").includes(`${prop}=`)) folded.push(prop)
      if (emittedCalls(code, "setProp") === 0) folded.push(`${prop} (not applied at all)`)
    }
    expect(folded, "dom.ts routes these through the property channel").toEqual([])
  })

  it("a style OBJECT is handed to the runtime whole — CSS_NUMBER_PROPS drift is UNOBSERVABLE today", () => {
    // CSS_NUMBER_PROPS is the one table whose drift produces wrong PIXELS
    // rather than a wrong node, and it is the one table the emitted code cannot
    // yet witness: nothing folds a style object at M3, so the compiler never
    // has to decide about `px`. That is the correct behaviour to pin TODAY —
    // and the day P3 starts folding literal style objects (target #3), this row
    // is where the drift becomes observable and has to become a real loop over
    // CSS_NUMBER_PROPS.
    for (const prop of CSS_NUMBER_PROPS) {
      const code = compile(`<div style={{ "${prop}": 2 }} />`)
      expect(templateHtml(code).join(""), `${prop} must not be folded`).not.toContain("style=")
      expect(stripLiterals(code), `${prop} is unitless in dom.ts`).not.toContain("px")
      expect(code).toContain(`"${prop}": 2`)
    }
  })
})
