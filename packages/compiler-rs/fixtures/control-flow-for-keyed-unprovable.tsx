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

export const goesLive = ["row 0 {row().text}", "row 1 {row().text}"]

export const wins = [
  {
    kind: "step",
    index: 0,
    compiled: '<ul class="keyed-var"><!--For:#--><li>ALPHA</li><li>BETA</li><!--/For:#--></ul>',
    why: "the keys did not move, so only a live binding sees the new item behind them",
  },
  {
    kind: "step",
    index: 1,
    compiled: '<ul class="keyed-var"><!--For:#--><li>BETA</li><!--/For:#--></ul>',
    why: "the surviving row carries the value it was re-pointed at in step 0",
  },
]

export const optimality = {
  target: 1,
  milestone: 3,
  templates: 2,
  emits: ["For(", "keyed: () => byId", ", row) =>", "() => row().text"],
  absent: ["(For, {", ", row().text)"],
}
