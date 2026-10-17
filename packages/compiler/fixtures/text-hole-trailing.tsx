import { createSignal } from "@barqjs/core"

export const [count, setCount] = createSignal(0)

export default function TextHoleTrailing() {
  return <div class="counter">{() => count()}</div>
}

export const steps = [() => setCount(1), () => setCount(42), () => setCount(0)]

export const optimality = {
  target: 9,
  templates: 1,
  patchCalls: 1,
  // Nothing follows the hole, so `insert` can append and the anchor goes.
  absent: ["<!---->"],
}
