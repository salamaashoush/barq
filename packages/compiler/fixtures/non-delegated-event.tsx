import { createSignal } from "@barqjs/core"

export const [hovered, setHovered] = createSignal(false)

export default function NonDelegatedEvent() {
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
    >
      {() => (hovered() ? "in" : "out")}
    </div>
  )
}

export const steps = [() => setHovered(true)]

export const events = [
  (root: HTMLElement) => root.firstElementChild?.dispatchEvent(new Event("mouseleave")),
  (root: HTMLElement) => root.firstElementChild?.dispatchEvent(new Event("mouseenter")),
  (root: HTMLElement) => root.firstElementChild?.dispatchEvent(new Event("mouseleave")),
  (root: HTMLElement) => root.firstElementChild?.dispatchEvent(new Event("focus")),
]

export const optimality = {
  target: 7,
  emits: ["listen("],
  absent: ["__bq_mouseenter", "__bq_mouseleave", "__bq_focus", "addEventListener"],
}
