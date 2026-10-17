import { onCleanup, Show, createSignal, untrack } from "@barqjs/core"

export const [on, setOn] = createSignal(false)

/**
 * How many activations are alive. The cleanup is the only thing that lowers it.
 *
 * `ownedWrite`, because the body is what raises it: a write made while a scope
 * is being built is refused unless the signal says it is written from one.
 */
export const [live, setLive] = createSignal(0, { ownedWrite: true })

/**
 * `NO_SCOPE`'s negative case: the corpus had no `Show` whose body registered a
 * disposable and whose key also flipped, which is the exact shape the flag's
 * proof is about. Here the body registers an `onCleanup` and the key flips three
 * times, so `inert_bodies` must refuse and the emitted integer must be zero —
 * which is what the `absent` list below claims, in every non-zero spelling.
 *
 * The cleanup is made VISIBLE rather than merely present: the body raises `live`
 * on activation and the cleanup lowers it, and the count is rendered by a
 * sibling hole outside the branch, where no rebuild can hide it. The key's three
 * flips take `live` 0 → 1 → 0 → 1.
 *
 * **And that is not what catches a mis-shipped flag, which is worth writing down
 * because it was written down wrong first.** Forcing `NO_SCOPE` on here renders
 * IDENTICALLY, measured by injecting the integer into the emitted call: the
 * region's key lives in a `renderEffect`, the swap runs inside it, so a body's
 * `onCleanup` lands on the effect and the effect re-runs on every key change.
 * The activation scope is not what gives the cleanup its granularity here. The
 * DOM channel that used to kill `flow-ships-no-scope-unproven` — on
 * `dashboard-composite` — stopped killing it when `insert` began owning its
 * render effect by the scope it was handed (O4.5), and that symptom is not
 * coming back. The channel that catches it now is the flag census in
 * `flag-census.ts`, absolute and two-directional, asserted from the L3 suite as
 * well so the mutation runner names it.
 */
export default function ControlFlowShowCleanupBody() {
  return (
    <div class="host">
      <span class="live">{() => live()}</span>
      <Show when={() => on()}>
        {() => {
          setLive(untrack(live) + 1)
          onCleanup(() => setLive(untrack(live) - 1))
          return <p class="panel">open</p>
        }}
      </Show>
    </div>
  )
}

export const steps = [() => setOn(true), () => setOn(false), () => setOn(true)]

export const optimality = {
  target: 8,
  templates: 2,
  patchCalls: 1,
  // The flag integer is the whole point of the fixture. `2` is `NO_SCOPE`, `1`
  // is `STATIC_KEY`, `3` is both — and none of them may appear here: the key
  // reads `on()`, and the body registers a cleanup, so neither proof is
  // available. Zero flags are emitted as NO trailing argument at all, so the
  // claim is the absence of every non-zero integer rather than the presence of
  // a nought.
  emits: ["branch(", "onCleanup("],
  absent: ["Show(", "when: ", "), 1)", "), 2)", "), 3)"],
}
