import { Match, Switch, signal } from "@barqjs/core"

/**
 * `STATIC_KEY` on the INTEGER-key path, which is a different proof from the
 * `Show` one: `Switch` folds every arm's `when` into one ternary chain, so the
 * flag is an AND over the arms and one reactive arm has to sink the whole
 * chain. Nothing else in the corpus exercises that conjunction — the two
 * `Switch` fixtures both key on a signal, where the AND is never asked to
 * combine anything.
 *
 * `Switch` never ships `NO_SCOPE` however inert its arms are, so the integer
 * here is `1` and not `3`: `flow.rs` passes `false` for the second half, and
 * this is the fixture where that shows.
 */
const MODE: "compact" | "full" = "full"

export const count = signal(0)

export default function ControlFlowSwitchStaticKey() {
  return (
    <div class="mode">
      <Switch fallback={<span class="none">none</span>}>
        <Match when={MODE === "compact"}>{() => <p class="compact">{() => count()}</p>}</Match>
        <Match when={MODE === "full"}>{() => <p class="full">{() => count()}</p>}</Match>
      </Switch>
    </div>
  )
}

export const steps = [() => count.set(1), () => count.set(2)]

export const optimality = {
  target: 8,
  milestone: 5,
  templates: 4,
  // Two patches, one per arm's hole. The construct itself costs none.
  patchCalls: 2,
  emits: [
    "branch(",
    '() => MODE === "compact" ? 1 : MODE === "full" ? 2 : 0',
    "? 2 : 0, [",
    // `STATIC_KEY` alone: a `Switch` is never handed `NO_SCOPE`.
    "], 1)",
  ],
  absent: ["Switch(", "Match(", "when: ", "children: ", "], 3)"],
}
