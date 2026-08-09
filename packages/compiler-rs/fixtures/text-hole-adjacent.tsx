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
