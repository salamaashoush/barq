import { signal } from "@barqjs/core"

export const clicks = signal(0)

export default function TextHoleFused() {
  return <p>Total: {() => clicks()} clicks</p>
}

export const steps = [() => clicks.set(1), () => clicks.set(12)]

export const optimality = {
  target: 9,
  milestone: 4,
  templates: 1,
  patchCalls: 1,
  // The case elision CANNOT remove, stated as the exact bytes: the text either
  // side of the hole parses into ONE node, so there is no existing node to
  // insert before and the comment is the only stable position. This is what
  // makes "no anchor when nothing follows" a theorem rather than a preference.
  emits: ["<p>Total: <!----> clicks</p>"],
}
