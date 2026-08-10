import { signal } from "@barqjs/core"

export const left = signal("l1")
export const right = signal("r1")

/**
 * Two elements, two live props each, driven by DIFFERENT signals.
 *
 * Target #4 groups the live props of ONE element into one `renderEffect`. The
 * boundary is the element: a group that ran across elements would write both
 * values through the second element's group, and would re-run the whole group
 * whenever either signal moved. `multi-prop-one-element` states the positive
 * half — three props, one effect — and nothing in the corpus stated the
 * boundary, so widening the grouping loop to ignore its target was a mutation
 * only the random generator ever killed. This is the input that names it.
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

export const steps = [() => left.set("l2"), () => right.set("r2")]

export const optimality = {
  target: 4,
  milestone: 3,
  // One per element, never one for the pair.
  effects: 2,
  templates: 1,
}
