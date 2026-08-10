import { Show, signal } from "@barqjs/core"

/**
 * The `STATIC_KEY` half of §3.4's flag catalogue, which had no fixture at all
 * until this one: every `Show` in the corpus keys on a signal, so the flag was
 * emittable and never emitted, and a flag with no fixture is a flag with no
 * number.
 *
 * The gate here is a MODULE CONSTANT — a build flag, a capability check hoisted
 * out of a component, the shape every codebase has. The key expression the
 * compiler builds for it reads nothing reactive, so `branch` can call it once,
 * keep no previous-key record and open no renderEffect for it. The proof is on
 * the READ and not on the prop: `when={on}` is a `Static` expression whose read
 * `on()` is not, and getting that backwards would elide the effect for a key
 * that moves.
 *
 * Two branches, because the two flags are separately observable and a fixture
 * that shipped them together could not say which one it was pinning:
 *
 *  - `loud` has a hole in its body, so the body is not inert and `NO_SCOPE` is
 *    NOT proved — it ships `STATIC_KEY` alone.
 *  - `quiet` is one clone with no patch at all, so both are proved.
 */
const VERBOSE: boolean = true

export const label = signal("ready")

export default function ControlFlowShowStaticKey() {
  return (
    <div class="gate">
      <Show when={VERBOSE} fallback={<span class="hushed">hushed</span>}>
        {() => <p class="loud">{() => label()}</p>}
      </Show>
      <Show when={VERBOSE} fallback={<span class="off">off</span>}>
        {() => <p class="quiet">on</p>}
      </Show>
    </div>
  )
}

// The key cannot move, so nothing here may flip a branch — what the step drives
// is the body's own hole, which is exactly the read the elided effect must not
// have been subscribing to.
export const steps = [() => label.set("done")]

export const optimality = {
  target: 8,
  milestone: 5,
  templates: 5,
  // One patch, the `loud` body's hole. Neither branch is inserted into
  // anything: since K5 a region IS the patch.
  patchCalls: 1,
  // The two integers, which are the whole point of the fixture. `1` is
  // `STATIC_KEY` alone and `3` is `STATIC_KEY | NO_SCOPE`, and no other fixture
  // in the corpus emits either.
  emits: ["branch(", "() => VERBOSE || false", "}), 1)", "}), 3)"],
  absent: ["Show(", "when: ", "children: ", "fallback: "],
}
