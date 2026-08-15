import { signal } from "@barqjs/core"

export const clicks = signal(0)
export const inputs = signal(0)

/**
 * Two DELEGATED types on ONE element. The `$$s` expando carrying the owning
 * scope is per ELEMENT — the dispatcher reads it to route a throw to
 * `scope.catcher` — so a second handler on the same element writes only its own
 * `$$<type>`, and nothing in the corpus had two until this fixture.
 */
export default function DelegatedTwoTypes() {
  return (
    <button type="button" onClick={() => clicks.update((n) => n + 1)} onInput={() => inputs.update((n) => n + 1)}>
      {() => `${clicks()}/${inputs()}`}
    </button>
  )
}

export const steps = [() => clicks.set(5)]

export const events = [
  (root: HTMLElement) => root.querySelector("button")?.dispatchEvent(new Event("click", { bubbles: true })),
  (root: HTMLElement) => root.querySelector("button")?.dispatchEvent(new Event("input", { bubbles: true })),
  (root: HTMLElement) => root.querySelector("button")?.dispatchEvent(new Event("click", { bubbles: true })),
]

export const optimality = {
  target: 7,
  milestone: 3,
  emits: ["$$click", "$$input", "delegateEvents("],
  absent: ["addEventListener"],
}
