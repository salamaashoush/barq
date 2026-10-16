/**
 * C7 on `branch` keyed by a component VALUE rather than by an index.
 *
 * A `dynamic` component is a `branch` whose `bodies` is a single Block used for
 * every key — one `typeof` per activation and no flag. Each tag change is one
 * activation of that single Block, and the replayed step in between is none.
 *
 * The `dynamic` component is the whole output on purpose: the frame and the
 * region are then the same thing, so `rebuilds` says something exact about every
 * element in the frame rather than about a subset a class cannot name.
 */
import { createSignal, dynamic } from "@barqjs/core"

export const log: string[] = []

export const [tag, setTag] = createSignal<"span" | "b">("span")

const Tagged = dynamic(() => tag())

export default function C7Dynamic() {
  return (
    <Tagged class="dyn">
      {() => {
        log.push("dyn")
        return "inner"
      }}
    </Tagged>
  )
}

export const steps = [() => setTag("b"), () => setTag("span")]

export const metamorphic = {
  why: "the element type changes, so the element itself cannot survive a key change",
  steps: ["rebuilds", "rebuilds"],
}

export const c7 = {
  why: "one Block serves every key, and each key change is one activation of it",
  log: ["dyn", "dyn", "dyn"],
}
