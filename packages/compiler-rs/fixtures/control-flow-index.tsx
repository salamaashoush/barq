import { Index, signal } from "@barqjs/core"

export const nums = signal([1, 2, 3])

export default function ControlFlowIndex() {
  return (
    <ol>
      <Index each={() => nums()}>{(item, index) => <li>{index}={() => item()}</li>}</Index>
    </ol>
  )
}

export const steps = [() => nums.set([9, 2, 3]), () => nums.set([9]), () => nums.set([1, 2, 3, 4])]

export const optimality = {
  target: 8,
  milestone: 5,
  templates: 2,
  // `Index` gives its row an ACCESSOR item and a plain-number index — the
  // mirror image of keyed `For` — so the index hole passes through as a value
  // and calling the item is the tracked read.
  emits: ["each(", ", nums, false, ", ", item, index) =>"],
  absent: ["Index(", "each: "],
}
