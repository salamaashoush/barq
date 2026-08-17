import { isPending, latest, optimistic } from "@barqjs/core"

export const guess = optimistic("a")

/** A module constant, so the control below is provably static. */
const flagIsSet = false

/**
 * A5 (f)'s read surface, as an EMISSION, and target 1 in its purest form:
 * reactivity decided semantically rather than from a name.
 *
 * `isPending(fn)` and `latest(fn)` CALL their argument, so the tracked read is
 * theirs and not the call site's. Written either way an ordinary classifier
 * sees nothing reactive: `isPending(guess)` only REFERENCES the accessor, and
 * `isPending(() => guess())` puts the read inside a nested arrow, which is
 * deferred everywhere else — that deferral is exactly what makes a handler
 * hoistable to module scope.
 *
 * So both spellings bound BY VALUE until M11, and B1 says every binding on an
 * element is equally live. `<h1 class={{ stale: isPending(user) }}>` — the
 * reference's own documented shape — was applied once at construction and never
 * again. `@dom-expressions/compiler` gets this right by being CONSERVATIVE: any
 * call in an attribute is dynamic. barq is precise instead, so the two
 * combinators have to be named in the symbol table, which is target 1's whole
 * argument seen from the losing side.
 *
 * The `<span>` is the CONTROL and it is what makes the other three evidence.
 * Nothing in it is reactive, so it must stay on the once-only path — without it
 * "everything is live" and "this rule works" are the same observation, and a
 * compiler that gave up and wrapped every attribute would pass.
 */
export default function ReadModeBinding() {
  return (
    <div class="read-mode">
      <h1 class={{ stale: isPending(guess) }}>by reference</h1>
      <h2 class={{ stale: isPending(() => guess()) }}>through a thunk</h2>
      <p class="settled">{() => latest(() => guess())}</p>
      <span class={{ plain: flagIsSet }}>control</span>
    </div>
  )
}

export const steps = [() => guess.set("b")]

export const optimality = {
  target: 1,
  milestone: 11,
  templates: 1,
  // One fused effect per element (B2) for the three live positions, and the
  // control's class object handed straight to `setClass` with no thunk around
  // it and no effect over it.
  emits: [
    "bindEffect(",
    "isPending(guess)",
    "isPending(() => guess())",
    "latest(() => guess())",
    '"class", { plain: flagIsSet }',
  ],
  // `bindProp` is the by-value channel: its appearance anywhere here is the
  // defect, because the only three bindings that are not static are the three
  // that must be effects.
  absent: ["bindProp("],
}
