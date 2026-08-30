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
  // K5, and the shape the lowering asks for: `Switch` and its arms collapse into ONE
  // `branch` whose key is an INTEGER — the winning arm's index, with 0 for the
  // fallback — and a hoisted body table indexed by it. `Match` ceases to exist
  // on this backend as it already had on the string one.
  emits: [
    "branch(",
    '() => status() === "loading" ? 1 : status() === "ready" ? 2 : 0',
    // The table stands where a single body would, immediately after the key,
    // and row 0 is the fallback — so "no arm matched" is a key like any other
    // rather than a second mechanism.
    "? 2 : 0, [",
  ],
  // The frames -O0 still pays: one `Switch` props object, one `Match` props
  // object PER ARM, and the `when` thunk on each arm that the integer replaced.
  absent: ["Switch(", "Match(", "when: ", "children: "],
}
