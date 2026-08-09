import { signal } from "@barqjs/core"

export const note = signal("<!---->")

/**
 * A fixture whose SOURCE legitimately contains the characters the marker bound
 * counts, in every place they can reach the emitted module:
 *
 *  - `data-note` is static, so `<!---->` is baked into the template HTML as an
 *    ATTRIBUTE VALUE. It is characters, not a node, and a substring count of the
 *    template span reads it as an anchor that does not exist.
 *  - `{() => note()}` renders the same characters as TEXT. In the marker channel
 *    a text node and an anchor serialize identically unless the walk keeps them
 *    apart.
 *  - `hint` is a string holding the emitted helper's own name, which a
 *    module-wide `_$insert(` count reads as a hole. Every counted anchor it
 *    fakes is one the compiler could then drop without the bound noticing —
 *    which is precisely what target #9 makes possible.
 *
 * This module bakes ZERO anchors: the `<!---->` in `data-note` is an attribute
 * value, and the hole anchors on the `<span>` that follows it. That is what
 * makes `compareToOracle`'s "the templates carry none, so the DOM must carry
 * none" branch run at all — a substring count reads one here, takes the other
 * branch, and the check silently stops existing.
 */
export default function MarkerLiteralText() {
  const hint = "_$insert( is not a call site here"
  return (
    <div data-note="<!---->" title={hint}>
      {() => note()}
      <span>end</span>
    </div>
  )
}

export const steps = [() => note.set("<!---->x"), () => note.set("plain")]

export const optimality = {
  target: 9,
  milestone: 2,
  templates: 1,
  patchCalls: 1,
  emits: ['data-note="<!---->"'],
}
