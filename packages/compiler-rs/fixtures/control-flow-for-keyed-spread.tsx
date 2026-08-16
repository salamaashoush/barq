import { For, signal } from "@barqjs/core"

export const rows = signal([
  { id: 1, text: "alpha" },
  { id: 2, text: "beta" },
])

const opts = { keyed: (row: { id: number }) => row.id }

/**
 * `keyed` arriving through a SPREAD. Reading only `JSXAttributeItem::Attribute`
 * left the spread invisible, so the row took the by-item arm and `{row().text}`
 * was applied once — the ERGONOMICS §4.3 stale cell, reached by a different
 * door. A spread cannot be proved not to carry `keyed`, so it resolves to the
 * key-function arm, which is the one that is safe when wrong.
 *
 * Step 0 is the only frame that can tell: the keys do not move and the items
 * behind them do.
 */
export default function ControlFlowForKeyedSpread() {
  return (
    <ul class="keyed-spread">
      <For each={() => rows()} {...opts}>
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
  () => rows.set([{ id: 1, text: "ALPHA" }]),
]

export const optimality = {
  target: 1,
  milestone: 3,
  templates: 2,
  // C9: a spread makes the props a RUNTIME source list, so there is nothing
  // static to read the construct's shape off and the flow pass refuses. The
  // adapter survives and reaches the same `each` one frame later — refusing is
  // always the safe direction — and the negative below is what says the pass
  // refused rather than guessed.
  emits: ["For(", "opts,", ", row) =>", "() => row().text"],
  absent: ["each(", ", row().text)"],
}
