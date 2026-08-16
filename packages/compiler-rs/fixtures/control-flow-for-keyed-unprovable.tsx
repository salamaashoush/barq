import { For, signal } from "@barqjs/core"

export const rows = signal([
  { id: 1, text: "alpha" },
  { id: 2, text: "beta" },
])

const byId = (row: { id: number }): number => row.id

/**
 * `keyed` behind a BINDING. The compiler cannot prove what it holds, and the
 * unprovable case has a safe side: classifying the row an accessor makes a
 * plain-value read fall out `Opaque` (emitted unwrapped, exactly what the
 * un-compiled runtime does), where classifying it a plain value makes an
 * accessor read `Static` — applied once, never updated. So unprovable takes the
 * key-function arm.
 */
export default function ControlFlowForKeyedUnprovable() {
  return (
    <ul class="keyed-var">
      <For each={() => rows()} keyed={byId}>
        {(row) => <li>{row().text}</li>}
      </For>
    </ul>
  )
}

export const steps = [
  () =>
    rows.set([
      { id: 1, text: "ALPHA" },
      { id: 2, text: "BETA" },
    ]),
  () => rows.set([{ id: 2, text: "BETA" }]),
]

export const optimality = {
  target: 1,
  milestone: 3,
  templates: 2,
  // A BINDING resolved to a function that declares a parameter is a key
  // function, so it reaches `keyOf` by name — no Cell around it, and no runtime
  // arity test. What stays unprovable is the row's KIND, and that is what the
  // live read below is about.
  emits: ["each(", ", rows, byId, ", ", row) =>", "() => row().text"],
  absent: ["For(", "keyed: ", ", row().text)"],
}
