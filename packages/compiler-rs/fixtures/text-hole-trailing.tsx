import { signal } from "@barqjs/core"

export const count = signal(0)

export default function TextHoleTrailing() {
  return <div class="counter">{() => count()}</div>
}

export const steps = [() => count.set(1), () => count.set(42), () => count.set(0)]

export const optimality = {
  target: 9,
  milestone: 3,
  templates: 1,
  patchCalls: 1,
  // Nothing follows the hole, so `insert` can append and the anchor goes.
  absent: ["<!---->"],
}
