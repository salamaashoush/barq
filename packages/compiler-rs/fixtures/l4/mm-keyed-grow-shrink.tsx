/**
 * MM3 `grows` then `shrinks`, on the same keyed list.
 *
 * Growing must build exactly the new row and touch none of the old ones;
 * shrinking must destroy exactly the removed row and touch none of the rest.
 * Both directions are asserted: a `grows` step that destroyed something and a
 * `grows` step that built nothing are both failures.
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

const THREE = [A, B, C]
const ONE = [B]

export const rows = signal<Row[]>([A, B])

export default function KeyedGrowShrink() {
  return (
    <ul class="rows">
      <For each={() => rows()} keyed={(row: Row) => row.id}>
        {(row) => {
          log.push(`row-${row().id}`)
          return <li class="row">{() => row().text}</li>
        }}
      </For>
    </ul>
  )
}

export const steps = [() => rows.set(THREE), () => rows.set(ONE)]

export const metamorphic = {
  why: "append one keyed row, then drop two: the survivors are the same objects throughout",
  steps: ["grows", "shrinks"],
}

export const c7 = {
  why: "two rows at mount, one more on the append, and the removal activates nothing",
  log: ["row-1", "row-2", "row-3"],
}
