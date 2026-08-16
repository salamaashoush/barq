import { signal } from "@barqjs/core"

/**
 * `signal` returns ONE binding that is both the read and the write: `count()`
 * is an Accessor and `count.update(…)` is a member call that writes. The shape
 * that matters to a symbol-resolving compiler is that the same identifier is
 * reactive as a CALL and inert as a MEMBER — so the handler that only writes
 * captures nothing and hoists to module scope.
 */
const count = signal(0)

export default function SignalObject() {
  return (
    <div class="tuple">
      <span data-plus-one={() => String(count() + 1)}>{() => count() + 1}</span>
      <button type="button" onClick={() => count.update((n) => n + 1)}>
        bump
      </button>
    </div>
  )
}

export const steps = [() => count.set(5), () => count.update((n) => n * 2)]

export const events = [(root: HTMLElement) => root.querySelector("button")?.click()]

export const optimality = {
  target: 1,
  milestone: 5,
  templates: 1,
  // The return-shape row: one binding, two verdicts. `count()` reads live, and
  // `count.update` is a write rather than a tracked read — so the handler that
  // only writes hoists to module scope with no closure at all.
  emits: ["() => count() + 1", "= () => count.update("],
  absent: ["() => count.set()"],
}
