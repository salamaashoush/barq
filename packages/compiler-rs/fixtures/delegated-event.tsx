import { signal } from "@barqjs/core"

export const count = signal(0)

export default function DelegatedEvent() {
  return (
    <button type="button" onClick={() => count.update((n) => n + 1)}>
      clicked {() => count()}
    </button>
  )
}

export const steps = [() => count.set(1)]

export const events = [
  (root: HTMLElement) => root.querySelector("button")?.click(),
  (root: HTMLElement) => root.querySelector("button")?.click(),
]

export const optimality = {
  target: 7,
  milestone: 3,
  emits: ["$$click", "delegateEvents("],
  absent: ["addEventListener"],
}
