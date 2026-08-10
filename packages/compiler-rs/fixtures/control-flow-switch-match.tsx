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

export const optimality = {
  target: 8,
  milestone: 5,
  templates: 4,
  // `Match` is NOT a ternary: it returns its own props object and `Switch`
  // reads them, so the DOM backend has to emit real `Match({…})` calls inside
  // the `children` array. Only the SSR backend inlines the construct.
  emits: ["Switch(", "[Match(", "}), Match("],
  absent: ["(Switch, {", "(Match, {"],
}
