/**
 * MM4 `preserves` on the one shape where the branch's OWN driving effect re-runs
 * and the key does not move.
 *
 * `keyed={false}` makes the key the TRUTHINESS of `when`, so writing `label` from
 * `"one"` to `"two"` genuinely wakes the region's `renderEffect` — the value it
 * reads changed — and the key it computes is `true` both times. K2 is then the
 * only thing standing between the write and a full rebuild, and this is the
 * fixture where that is true: everywhere else the equality gate on the `computed`
 * upstream stops the effect before the region is reached.
 *
 * It is therefore the subject the mutation table needs. Deleting `region`'s
 * `if (previous !== UNSET && k === previous) return` produces byte-identical
 * markup here — the oracle, the SSR backend and the L3 differential all stay
 * green — and destroys every node in the branch on every write.
 */
import { Show, signal } from "@barqjs/core"

export const log: string[] = []

export const label = signal("one")

export default function BranchNonKeyedTruthy() {
  return (
    <div class="host">
      <Show when={() => label()} keyed={false} fallback={<span class="empty">none</span>}>
        {(value) => {
          log.push("body")
          return (
            <p class="body">
              <b>{() => value()}</b>
            </p>
          )
        }}
      </Show>
    </div>
  )
}

export const steps = [() => label.set("two"), () => label.set("three")]

export const metamorphic = {
  why: "the driving effect re-runs on every write and the truthiness key never moves",
  steps: ["preserves", "preserves"],
}

export const c7 = {
  why: "one activation: the key is true throughout, so K2 makes every write a no-op",
  log: ["body"],
}
