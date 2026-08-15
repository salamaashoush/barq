import { signal } from "@barqjs/core"

export const tone = signal("red")
export const label = signal("first")

/**
 * The wipe, made unrepresentable — and this is the fixture it used to be
 * reproduced on.
 *
 * Three channels write classes onto one element: `class`, `classList`, and a
 * `ref` callback that adds one imperatively, which is the third case B1's prose
 * names and the one no compiler analysis can see. Before M5 the `class` channel
 * assigned `element.className` whole, so every time its value changed the other
 * two were erased; joining it to a shared effect made an *unrelated* prop change
 * erase them as well, which is why it was excluded from grouping instead.
 *
 * Both halves of the fix are structural, and each covers a case the other does
 * not:
 *
 *  - the fused record guards `class` on its own field, so `title` changing
 *    cannot reach the class channel at all;
 *  - the class channel diffs the tokens it applied last time against the ones
 *    it applies now, so even a real class change leaves `pinned` and `ref-added`
 *    alone. This is the half a differential cannot see — the un-compiled path
 *    calls the same channel, so both paths were wrong together.
 *
 * Step 0 changes only `label`; step 1 changes `tone`. The token survival is
 * asserted absolutely, in `optimality.test.ts`.
 */
export default function ClassOwnsOnlyItsTokens() {
  return (
    <b
      ref={(el: Element) => el.classList.add("ref-added")}
      class={() => tone()}
      title={() => label()}
      classList={{ pinned: true }}
    >
      x
    </b>
  )
}

export const steps = [
  () => label.set("second"),
  () => tone.set("blue"),
]

/**
 * A `ref` callback is client-only — DESIGN §5's opcode table drops it — so the
 * token it adds imperatively has no bytes on the wire. Everything the two
 * CHANNELS wrote is there and in the same order.
 */
export const ssrDiffers = {
  markup: '<b class="red pinned" title="first">x</b>',
  why: "the ref callback runs on the client; the class it adds is not markup",
}

export const optimality = {
  target: 4,
  milestone: 5,
  effects: 1,
  templates: 1,
  // One effect for the element. `ref` is its own channel and `classList` a
  // static object, so neither opens one.
  emits: ["bindEffect(", "setClass(", "setClassList(", "ref("],
  absent: ["bindProp(", "setProp"],
}
