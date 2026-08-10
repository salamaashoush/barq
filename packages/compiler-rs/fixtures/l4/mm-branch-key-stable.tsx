/**
 * MM3 `preserves`, and C7 on `branch`.
 *
 * `open` is the key and never moves; `label` is read INSIDE the body. K2 says a
 * branch whose key expression evaluates to an unchanged value does nothing at
 * all — no teardown, no rebuild, no Block invocation — so every node in the
 * branch survives both writes and the instrumented Block is invoked once for the
 * whole run.
 *
 * The differential node-identity channel cannot state this. It compares the
 * compiled render against `createElement`, which keeps this node for reasons of
 * its own, so a `Show` that rebuilt its body on every write of `label` would
 * have to be rebuilt by BOTH paths before anything went red.
 */
import { Show, signal } from "@barqjs/core"

export const log: string[] = []

export const open = signal(true)
export const label = signal("one")

export default function BranchKeyStable() {
  return (
    <div class="host">
      <Show when={() => open()} fallback={<span class="closed">closed</span>}>
        {() => {
          log.push("body")
          return (
            <p class="body">
              <b class="inner">{() => label()}</b>
            </p>
          )
        }}
      </Show>
      <footer>tail</footer>
    </div>
  )
}

export const steps = [() => label.set("two"), () => label.set("three")]

export const metamorphic = {
  why: "the key expression never moves, so the branch is never re-activated",
  steps: ["preserves", "preserves"],
}

export const c7 = {
  why: "one activation for the whole run: the key is written nothing and read twice",
  log: ["body"],
}
