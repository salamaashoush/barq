import { For, signal } from "@barqjs/core"

export const rows = signal([
  { id: 1, text: "alpha" },
  { id: 2, text: "beta" },
])

const opts = { keyed: (row: { id: number }) => row.id }

/**
 * `keyed` arriving through a SPREAD, and since M10 this LOWERS.
 *
 * Two separate things had to be right, and only one of them is about the row.
 *
 * The row: reading only `JSXAttributeItem::Attribute` left the spread invisible,
 * so the body took the by-item arm and `{row().text}` was applied once — the
 * ERGONOMICS §4.3 stale cell, reached by a different door. A spread cannot be
 * proved not to carry `keyed`, so `analysis::bind` resolves it to the
 * key-function arm, which is the one that is safe when wrong. Step 0 is the only
 * frame that can tell: the keys do not move and the items behind them do.
 *
 * The construct: what M9 recorded as one gap was two, and the one this fixture
 * names was never real. `keyOf` is already a RUNTIME argument — `each` dispatches
 * on it and `mapArray` decides what a row's `item` and `index` ARE — so the row
 * Block's own parameter list is `(scope, item, index)` in all three modes and the
 * three keying fixtures differ at the `keyOf` argument and nowhere else. The
 * carrier therefore crosses unresolved and `flow.ts`'s `keyMode` reads it, which
 * is the same §3.0 rule 1 the compiler applies statically when it can see the
 * prop. What the lowering buys is the `(parent, anchor)` pair §3.4 exists to
 * deliver, in place of an `insert` hole around an adapter frame.
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
  milestone: 10,
  templates: 2,
  // C9's source list is still a runtime object — that part does not change. What
  // changed is that the construct no longer needs to READ it at compile time:
  // every prop it takes is either an argument the primitive accepts as it stands
  // or a slot the runtime already resolves, so the region is emitted against
  // member reads off one binding the source list is evaluated into exactly once.
  //
  // The `keyed` member read below is the whole of the keying decision, crossing
  // unresolved, and the primitive is what resolves it.
  emits: ["each(", ".each, ", ".keyed, ", ".fallback)", ", row) =>", "() => row().text"],
  absent: ["For(", ", row().text)"],
}
