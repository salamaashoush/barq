import { useState } from "@barqjs/core"

/**
 * `useState` is the TUPLE primitive: `[() => T, setter]`. The dead Babel plugin
 * proved it could track this shape by rewriting `{count + 1}` into a thunk; the
 * shape that matters to a symbol-resolving compiler is that `count` is an
 * Accessor and `setCount` is Inert, both bound by the same array pattern.
 */
const [count, setCount] = useState(0)

export default function UseStateTuple() {
  return (
    <div class="tuple">
      <span data-plus-one={() => String(count() + 1)}>{() => count() + 1}</span>
      <button type="button" onClick={() => setCount((n) => n + 1)}>
        bump
      </button>
    </div>
  )
}

export const steps = [() => setCount(5), () => setCount((n) => n * 2)]

export const events = [(root: HTMLElement) => root.querySelector("button")?.click()]

export const optimality = {
  target: 1,
  milestone: 5,
  templates: 1,
  // The return-shape row: `useState(v)` is a TUPLE whose first element is an
  // accessor and whose second is inert. Both halves have to be right — `count`
  // reads live, and `setCount` is not a tracked read, so the handler that only
  // captures it hoists to module scope with no closure at all.
  emits: ["() => count() + 1", "= () => setCount"],
  absent: ["() => setCount()"],
}
