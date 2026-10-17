import { createSignal } from "@barqjs/core"

export const [a, setA] = createSignal("A")
export const [b, setB] = createSignal("B")

/**
 * Two holes in two different parents, each preceded by literal text and
 * followed by nothing. Both anchor at the end of their own element, so the
 * module carries two inserts, two walks and no comment at all.
 */
export default function TwoNestedHoles() {
  return (
    <div class="nested">
      <span>1:{() => a()}</span>
      <span>2:{() => b()}</span>
    </div>
  )
}

export const steps = [() => setB("Z"), () => setA("Y")]

export const optimality = {
  target: 9,
  templates: 1,
  patchCalls: 2,
  emits: ["<div class=\"nested\"><span>1:</span><span>2:</span></div>"],
  absent: ["<!---->"],
}
