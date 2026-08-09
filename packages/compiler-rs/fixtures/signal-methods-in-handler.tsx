import { signal } from "@barqjs/core"

export const count = signal(0)
export const seen = signal(0)

/**
 * `count()` is a tracked read and `count.set` / `count.update` / `count.peek`
 * are not — the same identifier, three verdicts, decided by the member name
 * against the Accessor's non-reactive mask. Mangling any of them into a call
 * (`count().set`) throws at runtime.
 */
export default function SignalMethodsInHandler() {
  return (
    <button
      type="button"
      class="methods"
      data-seen={() => String(seen())}
      onClick={() => {
        count.update((n) => n + 1)
        seen.set(count.peek())
      }}
    >
      {() => count()}
    </button>
  )
}

export const events = [
  (root: HTMLElement) => root.querySelector("button")?.click(),
  (root: HTMLElement) => root.querySelector("button")?.click(),
]

export const optimality = {
  target: 1,
  milestone: 4,
  templates: 1,
  patchCalls: 2,
  // The same identifier, three verdicts. `count()` is the tracked read; the
  // three members are not, and mangling any of them into a call throws.
  emits: ["count.update(", "count.peek()", "seen.set("],
  absent: ["count().update", "count().peek", "seen().set"],
}
