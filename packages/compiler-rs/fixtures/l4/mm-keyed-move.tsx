/**
 * MM3 `permutes` — a keyed move preserves the moved row's nodes.
 *
 * The three row objects are module constants, so a step is the same INPUT every
 * time it is applied and the only thing that changes is their ORDER. K2's row
 * half: a row whose key is unchanged keeps its scope, its nodes and their
 * identity across a move.
 *
 * This is the property `syncNodeOrder`'s longest-increasing-subsequence exists
 * for, and before this fixture nothing in the repository could tell a move from
 * a rebuild: both produce byte-identical markup, so `html`, `markers`,
 * `attributes` and `anchors` are all invariant under the difference.
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
const REVERSED = [C, B, A]

export const rows = signal<Row[]>([A, B, C])

export default function KeyedMove() {
  return (
    <ul class="rows">
      <For each={() => rows()} keyed={(row: Row) => row.id}>
        {(row) => {
          log.push("row")
          return <li class="row">{() => row().text}</li>
        }}
      </For>
    </ul>
  )
}

export const steps = [() => rows.set(ROTATED), () => rows.set(REVERSED)]

export const metamorphic = {
  why: "the same three row objects in a different order: every node moves, none is built",
  steps: ["permutes", "permutes"],
}

export const c7 = {
  why: "three rows are activated once each and a move activates nothing",
  log: ["row", "row", "row"],
}
