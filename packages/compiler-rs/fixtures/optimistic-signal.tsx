import { optimistic } from "@barqjs/core"

/** `optimistic` returns a `Signal<T>`, not a tuple — `.set` is a method. */
export const pending = optimistic(0)

export default function CreateOptimisticSignal() {
  return (
    <button type="button" class="optimistic" onClick={() => pending.set(pending() + 1)}>
      {() => pending()}
    </button>
  )
}

export const events = [(root: HTMLElement) => root.querySelector("button")?.click()]

export const optimality = {
  target: 1,
  milestone: 5,
  templates: 1,
  // `optimistic` returns an Accessor with signal-shaped write members, so
  // `pending.set` is NOT a tracked read: the handler closes over nothing the
  // component owns and hoists to module scope.
  // The hoisted handler is a module-scope const above the component; the read
  // inside the hole is the live one.
  emits: ["= () => pending.set", "() => pending()"],
}
