import { createMemo, createSignal } from "@barqjs/core"

const [count, setCount] = createSignal(2)
/** A `Computed<T>`: an Accessor whose dep set is its body's, one level removed. */
const doubled = createMemo(() => count() * 2)

export default function ComputedDerived() {
  return (
    <p class="memo">
      <span>{() => doubled() + 1}</span>
      <b>{doubled}</b>
    </p>
  )
}

export const steps = [() => setCount(5), () => setCount(0)]

export const optimality = {
  target: 1,
  milestone: 5,
  templates: 1,
  // `computed` returns an Accessor, so calling it is a tracked read and the bare
  // hole in the `<b>` passes the accessor itself: no closure per hole, and
  // `insert` calls it exactly as it would call a thunk.
  emits: ["() => doubled() + 1", ", doubled)"],
}
