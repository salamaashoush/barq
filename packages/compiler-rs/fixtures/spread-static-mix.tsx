import { signal } from "@barqjs/core"

export const extra = signal<Record<string, unknown>>({ role: "button", "data-n": "1" })

// The steps below are deliberately inert: createElement receives a plain props
// object, so the un-compiled runtime reads a spread exactly once. A reactive
// _$spread would change the DOM here where the oracle does not.
export default function SpreadStaticMix() {
  return (
    <div id="fixed" {...extra()} class="after-spread">
      spread
    </div>
  )
}

export const steps = [() => extra.set({ role: "link", "data-n": "2" }), () => extra.set({})]
export const optimality = {
  target: 2,
  milestone: 5,
  // An element with a spread has no attribute list the compiler can bake, so
  // the whole element leaves the template path — NO template, no patch, and no
  // reactive `spread()` either. The un-compiled runtime reads a spread exactly
  // once, and the steps above are inert precisely so that a reactive spread
  // would show up as a divergence.
  templates: 0,
  patchCalls: 0,
  emits: ['createElement("div"', 'id: "fixed"', "...extra()", 'class: "after-spread"'],
  absent: ["spread(", "template("],
}
