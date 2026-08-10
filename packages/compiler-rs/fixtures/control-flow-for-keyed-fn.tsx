import { For, signal } from "@barqjs/core"

export const rows = signal([
  { id: 1, text: "alpha" },
  { id: 2, text: "beta" },
])

/**
 * `keyed={fn}` is a THIRD arm, not the by-item one. `mapArray` keys the row on
 * `fn(item)` and hands the item through a row SIGNAL (`map.ts:53-57`,
 * `components.ts:255-269`), so both `row` and `index` are accessors and
 * `{row().text}` has to become a live binding.
 *
 * Reading `keyed` as "no attribute whose value is the literal false" put this
 * on the by-item arm and applied the read ONCE (ERGONOMICS §4.3). The first
 * frame is identical either way, which is how 110 fixtures missed it — the
 * evidence is step 0, where the keys are unchanged and only the items are new.
 */
export default function ControlFlowForKeyedFn() {
  return (
    <ul class="keyed-fn">
      <For each={() => rows()} keyed={(row) => row.id} fallback={<li class="empty">none</li>}>
        {(row, index) => (
          <li>
            {index()}: {row().text}
          </li>
        )}
      </For>
    </ul>
  )
}

export const steps = [
  // Same keys, new item objects. Every row survives, `_item.set(item)` re-points
  // it, and nothing but a live binding can notice.
  () =>
    rows.set([
      { id: 1, text: "ALPHA" },
      { id: 2, text: "BETA" },
    ]),
  // A reorder: the rows keep their DOM and the index accessor is what moves.
  () =>
    rows.set([
      { id: 2, text: "BETA" },
      { id: 1, text: "ALPHA" },
    ]),
  () => rows.set([]),
]

// Two holes per row, and the list is two rows long: the slack is counted in
// live BINDINGS, not in source positions.
export const goesLive = [
  "row 0 {index()}",
  "row 0 {row().text}",
  "row 1 {index()}",
  "row 1 {row().text}",
]

export const wins = [
  {
    kind: "step",
    index: 0,
    compiled: '<ul class="keyed-fn"><!--For:#--><li>0: ALPHA</li><li>1: BETA</li><!--/For:#--></ul>',
    why: "same keys, new items: the row signal was re-set and the compiled path is bound to it",
  },
  {
    kind: "step",
    index: 1,
    compiled: '<ul class="keyed-fn"><!--For:#--><li>0: BETA</li><li>1: ALPHA</li><!--/For:#--></ul>',
    why: "the reused rows swapped slots, so the index accessor moved under both of them",
  },
]

export const optimality = {
  target: 1,
  milestone: 3,
  // The list, the fallback and the row.
  templates: 3,
  // Both row parameters are accessors. The text hole cannot η-reduce, so it
  // takes the thunk the by-item arm wrongly denied it; the index hole IS a bare
  // accessor call, so it η-reduces to the accessor and passes through as a
  // value the runtime subscribes to.
  // The key function reaches `each` as `keyOf` DIRECTLY. What the runtime used
  // to do — `typeof carrier === "function" && carrier.length >= 1` — the
  // compiler answers from the arity the author declared (§3.0 rule 1).
  emits: ["each(", ", rows, (row) => row.id, ", ", row, index) =>", "() => row().text"],
  absent: ["For(", "() => index()", ", row().text)"],
}
