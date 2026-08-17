import { optimistic } from "@barqjs/core"

/** `optimistic` returns a `Signal<T>`, not a tuple — `.set` is a method. */
export const pending = optimistic(0)

/**
 * The second button is the one that DISCRIMINATES, and it did not exist until
 * M11. A `.set` inside a closure hoists whatever the compiler believes about
 * the member, because the call is not in a reactive position at all — so the
 * first button was satisfied by both verdicts, and the comment below it
 * asserted a rule nothing observed.
 *
 * By REFERENCE the two verdicts differ visibly: a static member reference goes
 * on the delegated path as a `$$click` expando, and a member the compiler
 * thinks is a tracked read has to be re-read per dispatch, so the position
 * falls out of the delegated set into an `addEventListener` of its own (B4).
 * `optimistic` sat under the plain-accessor shape until M11 and took the second
 * of those, which is a divergence from `signal` in the one place `optimistic`
 * is supposed to be a `signal`.
 */
export default function CreateOptimisticSignal() {
  return (
    <div>
      <button type="button" class="optimistic" onClick={() => pending.set(pending() + 1)}>
        {() => pending()}
      </button>
      <button type="button" class="by-reference" onClick={pending.set}>
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
  // `optimistic` returns an Accessor with signal-shaped write members, so
  // `pending.set` is NOT a tracked read: the handler closes over nothing the
  // component owns and hoists to module scope.
  // The hoisted handler is a module-scope const above the component; the read
  // inside the hole is the live one.
  emits: ["= () => pending.set", "() => pending()", "$$click = pending.set"],
  // The whole claim of the second button: the delegated set, not a listener of
  // its own, and no per-dispatch re-read of the member.
  absent: ["addEventListener", "bindEvent"],
}
