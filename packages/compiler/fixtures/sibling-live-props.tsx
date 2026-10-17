import { createSignal } from "@barqjs/core"

export const [left, setLeft] = createSignal("l1")
export const [right, setRight] = createSignal("r1")

/**
 * Two elements, two live props each, driven by DIFFERENT signals.
 *
 * Target #4 fuses every live prop of ONE template into one `renderEffect`, so
 * the pair costs one effect, not one per element. The record compares each
 * field with its previous value, which is what keeps a write to one signal from
 * reaching the other element: the effect re-runs, and only the fields that
 * moved are written.
 *
 * The two signals are separate so the effect COUNT is not the only channel:
 * writing `left` must move the first element's title and nothing else.
 */
export default function SiblingLiveProps() {
  return (
    <div class="pair">
      <span class="a" title={() => left()} data-tag={() => `${left()}!`}>
        a
      </span>
      <span class="b" title={() => right()} data-tag={() => `${right()}!`}>
        b
      </span>
    </div>
  )
}

export const steps = [() => setLeft("l2"), () => setRight("r2")]

export const optimality = {
  target: 4,
  // One for the pair, never one per element.
  effects: 1,
  templates: 1,
}
