/**
 * C7 on `branch` keyed by a component VALUE rather than by an index.
 *
 * `Dynamic` is the case §3.4 handles by letting `bodies` be a single Block used
 * for every key — one `typeof` per activation and no flag. Each tag change is
 * one activation of that single Block, and the replayed step in between is none.
 *
 * The `Dynamic` is the component's whole output on purpose: the frame and the
 * region are then the same thing, so `rebuilds` says something exact about every
 * element in the frame rather than about a subset a class cannot name.
 */
import { Dynamic, signal } from "@barqjs/core"

export const log: string[] = []

export const tag = signal<"span" | "b">("span")

export default function C7Dynamic() {
  return (
    <Dynamic component={() => tag()} class="dyn">
      {() => {
        log.push("dyn")
        return "inner"
      }}
    </Dynamic>
  )
}

export const steps = [() => tag.set("b"), () => tag.set("span")]

export const metamorphic = {
  why: "the element type changes, so the element itself cannot survive a key change",
  steps: ["rebuilds", "rebuilds"],
}

export const c7 = {
  why: "one Block serves every key, and each key change is one activation of it",
  log: ["dyn", "dyn", "dyn"],
}
