import { signal } from "@barqjs/core"

export const id = signal("a")
export const title = signal("first")
export const width = signal(10)

export default function MultiPropOneElement() {
  return <div id={() => id()} title={() => title()} data-width={() => String(width())} />
}

export const steps = [
  () => id.set("b"),
  () => title.set("second"),
  () => width.set(20),
]

export const optimality = {
  target: 4,
  milestone: 3,
  effects: 1,
  templates: 1,
}
