import { signal } from "@barqjs/core"

export const last = signal("Z")
export const penultimate = signal("Y")

/**
 * Target #5, from the other end. Both holes are near the END of a wide row, so
 * a forward walk pays six and five hops for them where reaching back from the
 * last child costs one and two. `deep-walk` is the same claim about depth; this
 * one is about breadth, and it is the case a forward-only addresser cannot
 * improve at all.
 *
 * The declaration below names the route rather than bounding its length: a
 * module that addresses nothing satisfies any bound on hop count.
 */
export default function WalkFromTheBack() {
  return (
    <ul class="row">
      <li>a</li>
      <li>b</li>
      <li>c</li>
      <li>d</li>
      <li>e</li>
      <li class="penultimate">{() => penultimate()}</li>
      <li class="last">{() => last()}</li>
    </ul>
  )
}

export const steps = [() => last.set("ZZ"), () => penultimate.set("YY")]

export const optimality = {
  target: 5,
  milestone: 3,
  templates: 1,
  patchCalls: 2,
  emits: [".lastChild", ".previousSibling"],
  absent: [".nextSibling"],
}
