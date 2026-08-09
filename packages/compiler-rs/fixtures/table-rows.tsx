import { For, signal } from "@barqjs/core"

export const rows = signal([
  { id: 1, label: "alpha" },
  { id: 2, label: "beta" },
])
export const selected = signal(0)

/**
 * The canonical list shape: a row callback that returns a bare `<tr>`.
 *
 * A `<tr>` is refused inside `<table>` — the parser opens a `<tbody>` there
 * that `createElement` never does — and it used to be refused at a template
 * ROOT as well, which sent every row in the ecosystem's commonest markup down
 * the `createElement` path: five calls, four props objects and four rest-arg
 * arrays per row. But a template root is not parsed in "in body". `template()`
 * assigns `innerHTML` on a `<template>`, which parses in "in template"
 * insertion mode, and that mode pushes "in row" for `<td>`/`<th>` and "in table
 * body" for `<tr>`. So the row is one clone and two walks, like any other root.
 *
 * The corpus had no table at all before this fixture, which is why the refusal
 * survived so long. `browser-parse-check.ts` now parses these templates in real
 * Chrome, where the fact this rests on is either true or the row goes red.
 */
export default function TableRows() {
  return (
    <table class="grid">
      <tbody>
        <For each={() => rows()}>
          {(row) => (
            <tr class={() => (selected() === row.id ? "row danger" : "row")} data-id={String(row.id)}>
              <td class="col-id">{row.id}</td>
              <td class="col-label">
                <a class="lbl">{row.label}</a>
              </td>
              <td class="col-pad" />
            </tr>
          )}
        </For>
      </tbody>
    </table>
  )
}

export const steps = [
  () => rows.update((v) => [...v, { id: 3, label: "gamma" }]),
  () => selected.set(3),
  () => rows.update((v) => v.slice(1)),
  () => rows.set([]),
]

export const optimality = {
  target: 2,
  milestone: 6,
  // Two: the table with its tbody, and the row. Before "in template" insertion
  // mode was modelled the second one did not exist and the whole row body was
  // `createElement`.
  templates: 2,
  emits: ['<tr><td class="col-id">', '<td class="col-label"><a class="lbl">'],
  absent: ['createElement("tr"', 'createElement("td"', "<!---->"],
}
