import { For, signal } from "@barqjs/core"

export const rows = signal([1, 2])

/**
 * Target 8 on the list side. The row body reads nothing at all — not the item,
 * not the index — so every row is one clone of one template and zero patch
 * calls, and the row callback needs no thunk around its body.
 */
export default function ControlFlowForStaticBody() {
  return (
    <ul class="static-rows">
      <For each={() => rows()}>
        {() => (
          <li class="row">
            <span>fixed</span>
          </li>
        )}
      </For>
    </ul>
  )
}

export const steps = [() => rows.set([1, 2, 3]), () => rows.set([1]), () => rows.set([])]

export const optimality = {
  target: 8,
  milestone: 5,
  // The BOUNDARY of target 8, and the reason it is a fact about the children
  // contract rather than about the body. `For` calls `children(item, index)`
  // per row, so the row thunk survives however static its body is — one shared
  // template, cloned per row, and one insert joining the list to its parent.
  templates: 2,
  // Zero patch calls, where there was one: the list is a REGION, so the
  // `insert` that joined it to its parent is gone — `each` is handed
  // `(parent, anchor)` and does the joining itself (K5, K7).
  patchCalls: 0,
  emits: ['<li class="row"><span>fixed</span></li>', "each(", ", rows, null, "],
  // The adapter frame -O0 still pays, named so the claim above is a difference
  // between two builds rather than a sentence: a props object with the two
  // named slots, and the `insert` that joined its return value to the tree.
  absent: ["For(", "each: ", "children: ", "insert("],
}
