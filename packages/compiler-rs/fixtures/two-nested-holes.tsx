import { signal } from "@barqjs/core"

export const a = signal("A")
export const b = signal("B")

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

export const steps = [() => b.set("Z"), () => a.set("Y")]

export const optimality = {
  target: 9,
  milestone: 4,
  templates: 1,
  patchCalls: 2,
  emits: ["<div class=\"nested\"><span>1:</span><span>2:</span></div>"],
  absent: ["<!---->"],
}
