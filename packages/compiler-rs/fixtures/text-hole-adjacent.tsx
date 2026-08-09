import { signal } from "@barqjs/core"

export const a = signal("a")
export const b = signal("b")

export default function TextHoleAdjacent() {
  return (
    <div>
      {() => a()}
      {() => b()}
    </div>
  )
}

export const steps = [() => a.set("A"), () => b.set("B"), () => a.set("")]

export const optimality = {
  target: 9,
  milestone: 4,
  templates: 1,
  patchCalls: 2,
  // TWO holes, ONE anchor. The first needs a position to insert before, so it
  // gets the comment; the second is last in its parent and appends. A compiler
  // that gave every hole its own anchor would emit two and pass every count.
  emits: ["<div><!----></div>"],
}
