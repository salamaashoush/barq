/**
 * MM3 `rebuilds` through `Switch`/`Match`.
 *
 * The lowering collapses `Switch` and `Match` into ONE `branch` with one instance scope
 * per activation, so an arm change is a key change and everything the old arm
 * built goes. The component's output IS the switch, so the frame and the region
 * are the same thing and `rebuilds` is exact.
 */
import { Match, Switch, signal } from "@barqjs/core"

export const log: string[] = []

export const status = signal<"loading" | "ready" | "error">("loading")

export default function SwitchArm() {
  return (
    <Switch
      fallback={
        <span class="unknown">
          <i>unknown</i>
        </span>
      }
    >
      <Match when={() => status() === "loading"}>
        {() => {
          log.push("loading")
          return (
            <p class="loading">
              <b>loading</b>
            </p>
          )
        }}
      </Match>
      <Match when={() => status() === "ready"}>
        {() => {
          log.push("ready")
          return (
            <p class="ready">
              <b>ready</b>
            </p>
          )
        }}
      </Match>
    </Switch>
  )
}

export const steps = [
  () => status.set("ready"),
  () => status.set("error"),
  () => status.set("loading"),
]

export const metamorphic = {
  why: "each step selects a different arm, and an arm change is a branch key change",
  steps: ["rebuilds", "rebuilds", "rebuilds"],
}

export const c7 = {
  why: "loading, ready, fallback, loading again — one Block invocation per activation",
  log: ["loading", "ready", "loading"],
}
