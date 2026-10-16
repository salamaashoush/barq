import { createSignal } from "@barqjs/core"

export const [count, setCount] = createSignal(0)

export default function DelegatedEvent() {
  return (
    <button type="button" onClick={() => setCount((n) => n + 1)}>
      clicked {() => count()}
    </button>
  )
}

export const steps = [() => setCount(1)]

export const events = [
  (root: HTMLElement) => root.querySelector("button")?.click(),
  (root: HTMLElement) => root.querySelector("button")?.click(),
]

export const optimality = {
  target: 7,
  milestone: 3,
  emits: ["__bq_click", "delegateEvents("],
  absent: ["addEventListener"],
}
