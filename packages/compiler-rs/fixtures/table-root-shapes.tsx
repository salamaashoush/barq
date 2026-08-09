import { signal } from "@barqjs/core"

export const revision = signal(1)

/**
 * Every table-scoped tag as a template ROOT, one per hole.
 *
 * "in template" insertion mode has a row for each of them — `caption`,
 * `colgroup`, `tbody`, `tfoot`, `thead` push "in table"; `col` pushes "in
 * column group"; `tr` pushes "in table body"; `td`/`th` push "in row" — so each
 * one parses back as itself with nothing implied above it. Inside a `<table>`
 * they are refused where they are not legal, and that has not changed: the tags
 * below are all legal in place and would inline into the one template, so it is
 * the surrounding hole that makes each of them a root instead.
 *
 * The point of the fixture is `browser-parse-check.ts`, which parses every
 * emitted template in real Chrome and fails a template that comes back as more
 * than one root or with a tag moved. Nothing else in the corpus puts these tags
 * in that position, which is how a refusal that cost every list in the
 * ecosystem its template survived five milestones.
 */
export default function TableRootShapes() {
  return (
    <table class="shapes" data-rev={() => String(revision())}>
      {<caption class="cap">totals</caption>}
      <colgroup>{<col class="wide" />}</colgroup>
      <thead>
        {
          <tr class="hrow">
            <th scope="col">head</th>
          </tr>
        }
      </thead>
      <tbody class="cells">
        <tr>{<td class="cell">7</td>}</tr>
      </tbody>
      {
        <tfoot class="foot">
          <tr>
            <td>total</td>
          </tr>
        </tfoot>
      }
    </table>
  )
}

export const steps = [() => revision.set(2), () => revision.set(3)]

export const optimality = {
  target: 2,
  milestone: 6,
  // The table, then one per hole: caption, col, the head row, the cell, the
  // foot. Every one of them was a `createElement` chain before a template root
  // stopped being modelled as "in body".
  templates: 6,
  emits: ["<caption", "<col ", "<th scope=", "<td class=", "<tfoot"],
  absent: ['createElement("caption"', 'createElement("tr"', 'createElement("td"'],
}
