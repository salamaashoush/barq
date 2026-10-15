import { createSignal } from "@barqjs/core"

export const [tone, setTone] = createSignal("red")
export const [label, setLabel] = createSignal("first")

/**
 * The wipe, made unrepresentable — and this is the fixture it used to be
 * reproduced on.
 *
 * Two channels write classes onto one element: `class`, whose list carries a
 * fixed `pinned` key beside the live tone, and a `ref` callback that adds one
 * imperatively, which is the case B1's prose names and the one no compiler
 * analysis can see. Before M5 the `class` channel assigned `element.className`
 * whole, so every time its value changed the ref's token was erased; joining it
 * to a shared effect made an *unrelated* prop change erase it as well, which is
 * why it was excluded from grouping instead.
 *
 * Both halves of the fix are structural, and each covers a case the other does
 * not:
 *
 *  - the fused record guards `class` on its own field, so `title` changing
 *  cannot reach the class channel at all;
 *  - the class channel diffs the tokens it applied last time against the ones
 *  it applies now, so even a real class change keeps `pinned` and leaves
 *  `ref-added` alone. This is the half a differential cannot see — the
 *  un-compiled path calls the same channel, so both paths were wrong together.
 *
 * Step 0 changes only `label`; step 1 changes `tone`. The token survival is
 * asserted absolutely, in `optimality.test.ts`.
 */
export default function ClassOwnsOnlyItsTokens() {
  return (
    <b
      ref={(el: Element) => el.classList.add("ref-added")}
      class={() => [tone(), { pinned: true }]}
      title={() => label()}
    >
      x
    </b>
  )
}

export const steps = [
  () => setLabel("second"),
  () => setTone("blue"),
]

/**
 * A `ref` callback is client-only — the opcode table drops it — so the
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
  // One effect for the element. `ref` is its own channel and opens none.
  emits: ["bindEffect(", "setClass(", "ref("],
  absent: ["bindProp(", "setProp"],
}
