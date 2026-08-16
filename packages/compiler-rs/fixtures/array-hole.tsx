import { signal } from "@barqjs/core"

export const rows = signal(["a", "b"])

/**
 * A hole whose value is an ARRAY of nodes, built by `.map` rather than by a
 * flow component — the shape the dead plugin's ref-ordering case is really
 * about, and the only way `insert` receives an Array without `For` mediating
 * it.
 *
 * The list grows and shrinks beside a LATER sibling hole, so `insert`'s array
 * reconciliation has to keep both holes' ranges apart: sharing an anchor
 * between them interleaves their reconciliations, which is exactly why
 * `Anchor::Marker` is mandatory when the next materialising node is another
 * slot (DESIGN P5, rule 2).
 *
 * The row callback's parameter is a plain `.map` argument, NOT a props object —
 * a one-parameter JSX-returning arrow that must not be thunked.
 */
export default function ArrayHole() {
  return (
    <ul class="list">
      {() =>
        rows().map((row) => (
          <li class="row">{row}</li>
        ))
      }
      <li class="count">{rows().length}</li>
    </ul>
  )
}

export const steps = [
  () => rows.set(["a", "b", "c"]),
  () => rows.set(["c"]),
  () => rows.set([]),
  () => rows.set(["x", "y"]),
]

const frame = (items: string[]): string =>
  `<ul class="list">${items.map((r) => `<li class="row">${r}</li>`).join("")}` +
  `<li class="count">${items.length}</li></ul>`

