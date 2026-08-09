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
