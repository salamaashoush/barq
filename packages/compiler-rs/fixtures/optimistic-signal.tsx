import { action, createOptimistic } from "@barqjs/core"

export const [pending, setPending] = createOptimistic(0)

/**
 * An optimistic write is a guess over an action that is still running, so the
 * handler starts one and leaves it open for the guess to show.
 */
const bump = action(function* () {
  setPending(pending() + 1)
  yield new Promise<void>(() => {})
})

/**
 * The second button is the one that DISCRIMINATES. A setter handed over BY
 * REFERENCE is a function the compiler can see is not a tracked read, so it goes
 * on the delegated path as a `__bq_click` expando. A value it took for a tracked
 * read would have to be re-read per dispatch, and the position would fall out
 * of the delegated set into an `addEventListener` of its own (B4).
 */
export default function CreateOptimisticSignal() {
  return (
    <div>
      <button type="button" class="optimistic" onClick={() => void bump()}>
        {() => pending()}
      </button>
      <button type="button" class="by-reference" onClick={setPending}>
        set
      </button>
    </div>
  )
}

export const events = [(root: HTMLElement) => root.querySelector("button")?.click()]

export const optimality = {
  target: 1,
  milestone: 5,
  templates: 1,
  // The setter is a function the compiler can see through, so the handler that
  // calls the action hoists to module scope and the one handed over by
  // reference is the expando itself. The read inside the hole is the live one.
  emits: ["= () => void bump()", "() => pending()", "__bq_click = setPending"],
  // The whole claim of the second button: the delegated set, not a listener of
  // its own, and no per-dispatch re-read of the member.
  absent: ["addEventListener", "bindEvent"],
}
