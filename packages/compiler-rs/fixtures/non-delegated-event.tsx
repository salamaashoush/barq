import { signal } from "@barqjs/core"

export const hovered = signal(false)

export default function NonDelegatedEvent() {
  return (
    <div
      onMouseEnter={() => hovered.set(true)}
      onMouseLeave={() => hovered.set(false)}
      onFocus={() => hovered.set(true)}
    >
      {() => (hovered() ? "in" : "out")}
    </div>
  )
}

export const steps = [() => hovered.set(true)]

export const events = [
  (root: HTMLElement) => root.firstElementChild?.dispatchEvent(new Event("mouseleave")),
  (root: HTMLElement) => root.firstElementChild?.dispatchEvent(new Event("mouseenter")),
  (root: HTMLElement) => root.firstElementChild?.dispatchEvent(new Event("mouseleave")),
  (root: HTMLElement) => root.firstElementChild?.dispatchEvent(new Event("focus")),
]

export const optimality = {
  target: 7,
  milestone: 3,
  emits: ["listen("],
  absent: ["$$mouseenter", "$$mouseleave", "$$focus", "addEventListener"],
}
