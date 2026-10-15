import { createSignal } from "@barqjs/core"

export const [a, setA] = createSignal("A")
export const [b, setB] = createSignal("B")

/**
 * A hole whose next materialising sibling is an ELEMENT, followed by a hole at
 * the end of its own parent. Neither needs a comment: the `<span>` is the
 * anchor for the first, and the second appends. The walk that reaches the
 * second hole also has to survive the first one being filled — `insert`
 * splices nodes in, so every ref must be materialised before any mutation.
 */
export default function HoleThenElementSibling() {
  return (
    <div class="pair">
      {() => a()}
      <span class="tail">tail:{() => b()}</span>
    </div>
  )
}

export const steps = [() => setA("Z"), () => setB("Y"), () => setA("")]

export const optimality = {
  target: 9,
  milestone: 4,
  templates: 1,
  patchCalls: 2,
  emits: ['<div class="pair"><span class="tail">tail:</span></div>'],
  absent: ["<!---->"],
}
