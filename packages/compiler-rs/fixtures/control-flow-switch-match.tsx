import { Match, Switch, signal } from "@barqjs/core"

export const status = signal<"loading" | "ready" | "error">("loading")

export default function ControlFlowSwitchMatch() {
  return (
    <div class="status">
      <Switch fallback={<span>unknown</span>}>
        <Match when={() => status() === "loading"}>{() => <p>Loading…</p>}</Match>
        <Match when={() => status() === "ready"}>{() => <p class="ok">Ready</p>}</Match>
      </Switch>
    </div>
  )
}

export const steps = [
  () => status.set("ready"),
  () => status.set("error"),
  () => status.set("loading"),
]
