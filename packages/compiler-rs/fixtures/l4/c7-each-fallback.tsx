/**
 * C7 on `each`'s FALLBACK Block, which is a separate compile-addressed slot from
 * the row Block and owes the same count.
 *
 * Empty → two rows → empty again: the fallback is activated at mount and again
 * when the list empties, and the rows once each. A consumer that read the
 * fallback slot twice per activation would build two subtrees and drop one, and
 * the DOM would be identical.
 */
import { For, signal } from "@barqjs/core"

export const log: string[] = []

interface Row {
  id: number
  text: string
}

const A: Row = { id: 1, text: "alpha" }
const B: Row = { id: 2, text: "beta" }

const FULL = [A, B]
const EMPTY: Row[] = []

export const rows = signal<Row[]>(EMPTY)

export default function C7EachFallback() {
  return (
    <ul class="rows">
      <For
        each={() => rows()}
        keyed={(row: Row) => row.id}
        fallback={
          <li class="empty">
            <i>none</i>
          </li>
        }
      >
        {(row) => {
          log.push(`row-${row().id}`)
          return <li class="row">{() => row().text}</li>
        }}
      </For>
    </ul>
  )
}

export const steps = [() => rows.set(FULL), () => rows.set(EMPTY)]

export const c7 = {
  why: "two rows activated once each; the fallback is a slot of its own",
  log: ["row-1", "row-2"],
}
