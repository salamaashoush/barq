import { For, createSignal } from "@barqjs/core"

export const [rows, setRows] = createSignal([
  { id: 1, text: "alpha" },
  { id: 2, text: "beta" },
])

/**
 * `keyed={true}`, written out — the same arm `keyed` absent takes
 * (`control-flow-for.tsx`). The row keys on the ITEM ITSELF, so a changed item
 * is a different row and `mapArray` builds a new one. The item is also the
 * SAME row when one of its fields is written in place, which a store does, so
 * `{row.text}` is a read that crosses as a read: step 0 below replaces the
 * objects, and `store-rows.test.ts` writes one in place.
 */
export default function ControlFlowForKeyedByItem() {
  return (
    <ul class="keyed-item">
      <For each={() => rows()} keyed={true}>
        {(row) => <li>{row.text}</li>}
      </For>
    </ul>
  )
}

export const steps = [
  () =>
    setRows([
      { id: 1, text: "ALPHA" },
      { id: 2, text: "BETA" },
    ]),
  () => setRows([]),
]

export const optimality = {
  target: 8,
  milestone: 5,
  templates: 2,
  // `keyed={true}` and `keyed` absent are ONE arm, and the compiler says so in
  // the emission rather than forwarding a Cell for the runtime to unpick:
  // `each`'s `keyOf` is `null`, which is how identity-is-the-item is spelled.
  // The row's field is read where it is used, because the row outlives a write
  // to it.
  emits: ["each(", ", rows, null, ", "(row) =>", "() => row.text"],
  absent: ["For(", "() => true", ", row.text)"],
}
