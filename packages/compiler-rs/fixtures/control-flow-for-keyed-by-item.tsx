import { For, signal } from "@barqjs/core"

export const rows = signal([
  { id: 1, text: "alpha" },
  { id: 2, text: "beta" },
])

/**
 * `keyed={true}`, written out — the same arm `keyed` absent takes
 * (`control-flow-for.tsx`). The row keys on the ITEM ITSELF, so a changed item
 * is a different row and `mapArray` builds a new one: `{row.text}` really is a
 * plain value, applied once, with no thunk and no effect. That is O3, and it is
 * only correct because of what step 0 below proves — a new object under the
 * same `id` still replaces the row.
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
    rows.set([
      { id: 1, text: "ALPHA" },
      { id: 2, text: "BETA" },
    ]),
  () => rows.set([]),
]

export const optimality = {
  target: 8,
  milestone: 5,
  templates: 2,
  // The proof that the by-item arm survives the fix: the read is applied once,
  // with no thunk, because the row it reads is rebuilt whenever the item is.
  // `keyed={true}` and `keyed` absent are ONE arm, and the compiler now says so
  // in the emission rather than forwarding a Cell for the runtime to unpick:
  // `each`'s `keyOf` is `null`, which is how identity-is-the-item is spelled.
  emits: ["each(", ", rows, null, ", ", row) =>", ", row.text)"],
  absent: ["For(", "() => true", "() => row.text"],
}
