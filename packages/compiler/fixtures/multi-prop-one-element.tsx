import { createSignal } from "@barqjs/core"

export const [id, setId] = createSignal("a")
export const [title, setTitle] = createSignal("first")
export const [width, setWidth] = createSignal(10)

export default function MultiPropOneElement() {
  return <div id={() => id()} title={() => title()} data-width={() => String(width())} />
}

export const steps = [
  () => setId("b"),
  () => setTitle("second"),
  () => setWidth(20),
]

export const optimality = {
  target: 4,
  effects: 1,
  templates: 1,
}
