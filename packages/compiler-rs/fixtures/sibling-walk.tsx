import { signal } from "@barqjs/core"

export const a = signal("1")
export const b = signal("2")

export default function SiblingWalk() {
  return (
    <div>
      <i>0</i>
      <i>1</i>
      <i>{() => a()}</i>
      <i>3</i>
      <i>{() => b()}</i>
    </div>
  )
}

export const steps = [() => a.set("A"), () => b.set("B")]

export const optimality = {
  target: 5,
  milestone: 3,
  templates: 1,
  patchCalls: 2,
  // Holes at index 2 and 4 of five children. Forward costs 2 + 4 hops; from the
  // end it is 1 + 2, and the second hole is reached from the first.
  emits: [".lastChild", ".previousSibling"],
  absent: [".nextSibling"],
}
