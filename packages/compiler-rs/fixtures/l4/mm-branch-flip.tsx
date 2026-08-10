/**
 * MM3 `rebuilds`, and C7 on `branch` across a key flip.
 *
 * The component's whole output IS the branch, so "no element of the previous
 * frame survives" is exact at frame granularity rather than approximated.
 *
 * K6: a hide/show cycle produces FRESH nodes, never the same object handed back.
 * C7: A → B → A shows A's Block invoked twice — two activations, two subtrees —
 * and the replayed step in between shows no additional invocation (K2).
 */
import { Show, signal } from "@barqjs/core"

export const log: string[] = []

export const open = signal(true)

export default function BranchFlip() {
  return (
    <Show
      when={() => open()}
      fallback={
        <span class="closed">
          <i>closed</i>
        </span>
      }
    >
      {() => {
        log.push("open")
        return (
          <p class="open">
            <b>open</b>
          </p>
        )
      }}
    </Show>
  )
}

export const steps = [() => open.set(false), () => open.set(true)]

export const metamorphic = {
  why: "each step flips the key, and a fresh activation may hand back no node of the old one",
  steps: ["rebuilds", "rebuilds"],
}

export const c7 = {
  why: "A → B → A is two activations of A, and the replay of each step is none",
  log: ["open", "open"],
}
