import { signal } from "@barqjs/core"

export const extra = signal<Record<string, unknown>>({ role: "button", "data-n": "1" })

/**
 * A spread between two literal attributes — the shape that decides the ORDER
 * rule.
 *
 * The element stays on the template path and none of its attributes are baked
 * into it. A literal written after the spread would otherwise be applied by the
 * parser BEFORE the spread ran, and a literal written before it would win a
 * collapse the source says it loses: duplicate attributes in markup keep the
 * first, where a props object keeps the last. Applying all three in source
 * order is the one arrangement that agrees with itself on both backends.
 *
 * The steps drive the spread through a rename and an empty object, so a channel
 * that only ever ADDS keys — the shape of every spread implementation that
 * forgets its previous value — leaves `role` and `data-n` behind and fails.
 */
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
  milestone: 9,
  // The markup is still a template; only the attribute list leaves it.
  templates: 1,
  emits: ['<div>spread</div>', '"id", "fixed"', '"class", "after-spread"'],
  // The un-compiled path that used to build this element, and the baked
  // attributes whose order it could not honour.
  absent: ["createElement", '<div id="fixed"'],
}
