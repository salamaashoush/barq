/**
 * MM4 on the DEFAULT keying mode — `keyed` absent, which since M7b means keyed
 * by ITEM IDENTITY (K1).
 *
 * `mm-keyed-move` proves a keyed move for `keyed={fn}` and `mm-index-row-stable`
 * proves positional reuse for `keyed={false}`. The arm nobody wrote a fixture
 * for is the one every author gets without asking for it, and it is the arm the
 * milestone reversed onto. Both of its directions are declared here, because the
 * trade is real and only one half is comfortable:
 *
 *  - step 0 reorders the SAME three objects, so every row moves and none is
 *    built — `permutes`;
 *  - step 1 replaces them with structurally-equal FRESH objects, which under
 *    identity keying is three new rows — `rebuilds`. That is the declared cost
 *    of this default, and a fixture that only asserted the comfortable half
 *    would be certifying index keying by omission.
 *
 * Both replacement arrays are module constants, so replaying a step is the same
 * INPUT rather than a fresh allocation — which is what makes MM2 and MM3 sound
 * over a list of objects. The list is the whole subject and has no wrapper
 * element, because `rebuilds` means no element of the previous frame survives
 * and a container that outlives every row would satisfy it trivially in reverse.
 */
import { For, signal } from "@barqjs/core"

export const log: string[] = []

interface Row {
  id: number
  text: string
}

const A: Row = { id: 1, text: "alpha" }
const B: Row = { id: 2, text: "beta" }
const C: Row = { id: 3, text: "gamma" }

const ROTATED = [C, A, B]
const REPLACED: Row[] = [
  { id: 3, text: "gamma" },
  { id: 1, text: "alpha" },
  { id: 2, text: "beta" },
]

export const rows = signal<Row[]>([A, B, C])

export default function IdentityDefaultMove() {
  return (
    <For each={() => rows()}>
      {(row) => {
        log.push("row")
        return <b class="row">{row.text}</b>
      }}
    </For>
  )
}

export const steps = [() => rows.set(ROTATED), () => rows.set(REPLACED)]

export const metamorphic = {
  why: "the default keys on the item: the same objects reordered move, and fresh objects with the same fields are new rows",
  steps: ["permutes", "rebuilds"],
}

export const c7 = {
  why: "three rows are activated once each, a move activates nothing, and replacing the items activates three more",
  log: ["row", "row", "row", "row", "row", "row"],
}
