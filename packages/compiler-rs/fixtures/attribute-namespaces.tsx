import { signal } from "@barqjs/core"

export const rows = signal(2)
export const compact = signal(true)
export const beeps = signal(0)

let grid: Element | null = null

/**
 * CODESIGN §3.5/§3.12 and SEMANTICS B5. A name the compiler cannot classify has
 * no correct default, so the author says which channel it is: `prop:` writes the
 * property, `attr:` the attribute, `bool:` its presence, `on:` a verbatim event
 * name with no lowercasing.
 *
 * `prop:rows` is the case the rule exists for. `<my-grid rows={n}>` under a
 * name table becomes `setAttribute("rows", …)` — and for an object value,
 * `"[object Object]"`. Step 1 reads the property back and writes it into an
 * attribute, because a property write is otherwise invisible to a DOM
 * comparison, which is exactly why nothing could see this before.
 */
export default function AttributeNamespaces() {
  return (
    <div>
      <my-grid
        ref={(el: Element) => {
          grid = el
        }}
        prop:rows={() => rows()}
        attr:label="grid"
        bool:compact={() => compact()}
      />
      <button
        type="button"
        on:my-beep={() => beeps.set(beeps() + 1)}
        data-beeps={() => String(beeps())}
      >
        beep
      </button>
    </div>
  )
}

export const steps = [
  () => rows.set(5),
  () => compact.set(false),
  () => grid?.setAttribute("data-rows", String((grid as unknown as { rows?: unknown }).rows)),
]

export const events = [
  (root: HTMLElement) =>
    root.querySelector("button")?.dispatchEvent(new CustomEvent("my-beep", { bubbles: true })),
]

/**
 * `prop:` writes a PROPERTY, and a property has no bytes on the wire — the
 * string backend has one `rows="2"` attribute where the DOM has an element with
 * `.rows === 2` and no attribute at all. Claiming the two agree would be
 * claiming the property survives a server render, which is M6's hydration work
 * and not something a `setAttribute` can stand in for.
 */
export const ssrDiffers = {
  markup:
    '<div><my-grid compact="" label="grid" rows="2"></my-grid>' +
    '<button data-beeps="0" type="button">beep</button></div>',
  why: "prop: writes a property; a property is not markup, so the wire carries an attribute the DOM does not",
}

export const optimality = {
  target: 2,
  milestone: 5,
  templates: 1,
  // The channels are resolved at compile time, so the emitted module names the
  // write and never the classification: no `setProp`, and `my-beep` is never
  // lowercased into `mybeep`.
  emits: ['setDomProp(', "setBool(", 'listen(', '"my-beep"', 'label="grid"'],
  absent: ["setProp(", '"mybeep"', "addEventListener", "delegateEvents"],
}
