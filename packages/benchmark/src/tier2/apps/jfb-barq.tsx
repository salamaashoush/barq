/**
 * @jsxImportSource @barqjs/core
 *
 * js-framework-benchmark, keyed, in barq.
 *
 * A transliteration of `frameworks/keyed/solid/src/main.jsx` from
 * krausest/js-framework-benchmark (Apache-2.0) — same markup, same ids, same
 * `buildData`, same `random`, same operations — into the idiom barq compiles.
 * Two differences, both stated rather than hidden, because a benchmark that
 * quietly changes the workload is not the workload:
 *
 *  1. `createSelector` has no barq equivalent, so the selected class is a
 *     per-row read of one signal instead of an O(1) selector fan-out. barq
 *     therefore does O(n) subscriber work on `select row` where Solid does
 *     O(1). That is a real difference in what the two frameworks provide, and
 *     it is why the `select row` row is reported and never used to adjudicate a
 *     barq-internal claim.
 * 2. barq's `For` is identity-keyed by default, which
 *     is what "keyed" means here, so no `keyed` prop is written.
 */
import { For, batch, render, signal } from "@barqjs/core"

const adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy"] // prettier-ignore
const colors = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"] // prettier-ignore
const nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie", "sandwich", "burger", "pizza", "mouse", "keyboard"] // prettier-ignore

const random = (max: number) => Math.round(Math.random() * 1000) % max

let nextId = 1

interface Row {
  id: number
  label: { (): string; set(v: string): void; update(fn: (p: string) => string): void }
}

function buildData(count: number): Row[] {
  const data = new Array<Row>(count)
  for (let i = 0; i < count; i++) {
    const label = signal(
      `${adjectives[random(adjectives.length)]} ${colors[random(colors.length)]} ${nouns[random(nouns.length)]}`,
    )
    data[i] = { id: nextId++, label }
  }
  return data
}

const data = signal<Row[]>([])
const selected = signal<number | null>(null)

const run = () => data.set(buildData(1_000))
const runLots = () => data.set(buildData(10_000))
const add = () => data.set([...data(), ...buildData(1_000)])
const update = () =>
  batch(() => {
    const d = data()
    for (let i = 0, len = d.length; i < len; i += 10) d[i].label.update((l) => `${l} !!!`)
  })
const clear = () => data.set([])
const swapRows = () => {
  const list = data().slice()
  if (list.length > 998) {
    const item = list[1]
    list[1] = list[998]
    list[998] = item
    data.set(list)
  }
}
const remove = (id: number) => {
  const d = data()
  data.set(d.toSpliced(d.findIndex((row) => row.id === id), 1))
}

function App() {
  return (
    <div class="container">
      <div class="jumbotron">
        <div class="row">
          <div class="col-md-6">
            <h1>barq</h1>
          </div>
          <div class="col-md-6">
            <div class="row">
              <div class="col-sm-6 smallpad">
                <button id="run" class="btn btn-primary btn-block" type="button" onClick={run}>
                  Create 1,000 rows
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button
                  id="runlots"
                  class="btn btn-primary btn-block"
                  type="button"
                  onClick={runLots}
                >
                  Create 10,000 rows
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button id="add" class="btn btn-primary btn-block" type="button" onClick={add}>
                  Append 1,000 rows
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button id="update" class="btn btn-primary btn-block" type="button" onClick={update}>
                  Update every 10th row
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button id="clear" class="btn btn-primary btn-block" type="button" onClick={clear}>
                  Clear
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button
                  id="swaprows"
                  class="btn btn-primary btn-block"
                  type="button"
                  onClick={swapRows}
                >
                  Swap Rows
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <table class="table table-hover table-striped test-data">
        <tbody>
          <For each={() => data()}>
            {(row: Row) => (
              <tr class={() => (selected() === row.id ? "danger" : "")}>
                <td class="col-md-1">{row.id}</td>
                <td class="col-md-4">
                  <a onClick={() => selected.set(row.id)}>{() => row.label()}</a>
                </td>
                <td class="col-md-1">
                  <a onClick={() => remove(row.id)}>
                    <span class="glyphicon glyphicon-remove" aria-hidden="true" />
                  </a>
                </td>
                <td class="col-md-6" />
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true" />
    </div>
  )
}

render(() => <App />, document.getElementById("main") as HTMLElement)
;(globalThis as { __ready?: boolean }).__ready = true
