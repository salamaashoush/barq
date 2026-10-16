import { createSignal } from "@barqjs/core"

export const [rows, setRows] = createSignal(2)
export const [compact, setCompact] = createSignal(true)
export const [beeps, setBeeps] = createSignal(0)

let grid: Element | null = null

/**
 * B5. A name the compiler cannot classify has
 * no correct default, so the author says which channel it is: `prop:` writes the
 * property. Every other name on a custom element is an attribute, a boolean
 * value is its presence, and an event whose name is not a JSX handler name is
 * bound in a `ref`, verbatim, with no lowercasing; the function the `ref`
 * returns removes it when the element's scope is disposed (B4).
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
        label="grid"
        compact={() => compact()}
      />
      <button
        type="button"
        ref={(el: Element) => {
          const beep = () => setBeeps(beeps() + 1)
          el.addEventListener("my-beep", beep)
          return () => el.removeEventListener("my-beep", beep)
        }}
        data-beeps={() => String(beeps())}
      >
        beep
      </button>
    </div>
  )
}

export const steps = [
  () => setRows(5),
  () => setCompact(false),
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
  emits: ["setDomProp(", '"my-beep"', 'label="grid"'],
  absent: ["setProp(", '"mybeep"', "listen(", "delegateEvents"],
}
