/**
 * js-framework-benchmark, keyed, written once in TypeScript for Solid 2.0 and
 * compiled unchanged for barq (`asBarq` only repoints the two import specifiers).
 *
 * The row is the official `frameworks/keyed/solid` row: a `rowId` read once,
 * `textContent` for both cells, a signal per label. Solid 2.0 removed
 * `createSelector`, so selection is the one shared signal both frameworks read
 * per row, the shape Solid 1's entry used before it had a selector.
 */
import { type Accessor, type Setter, createSignal, flush, For } from "solid-js"
import { render } from "@solidjs/web"

const adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy"] // prettier-ignore
const colors = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"] // prettier-ignore
const nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie", "sandwich", "burger", "pizza", "mouse", "keyboard"] // prettier-ignore

interface Row {
  id: number
  label: Accessor<string>
  setLabel: Setter<string>
}

const random = (max: number) => Math.round(Math.random() * 1000) % max

let nextId = 1

function buildData(count: number): Row[] {
  const data = new Array<Row>(count)
  for (let i = 0; i < count; i++) {
    const [label, setLabel] = createSignal(
      `${adjectives[random(adjectives.length)]} ${colors[random(colors.length)]} ${nouns[random(nouns.length)]}`,
    )
    data[i] = { id: nextId++, label, setLabel }
  }
  return data
}

const [data, setData] = createSignal<Row[]>([])
const [selected, setSelected] = createSignal<number | null>(null)

const run = () => setData(buildData(1_000))
const runLots = () => setData(buildData(10_000))
const add = () => setData((d) => [...d, ...buildData(1_000)])
const update = () =>
  flush(() => {
    const d = data()
    for (let i = 0, len = d.length; i < len; i += 10) d[i].setLabel((l) => l + " !!!")
  })
const clear = () => setData([])
const swapRows = () => {
  const list = data().slice()
  if (list.length > 998) {
    const item = list[1]
    list[1] = list[998]
    list[998] = item
    setData(list)
  }
}
const remove = (id: number) => setData((d) => d.toSpliced(d.findIndex((row) => row.id === id), 1))

function App() {
  return (
    <div class="container">
      <div class="jumbotron">
        <div class="row">
          <div class="col-md-6">
            <h1>jfb</h1>
          </div>
          <div class="col-md-6">
            <div class="row">
              <div class="col-sm-6 smallpad">
                <button id="run" class="btn btn-primary btn-block" type="button" onClick={run}>
                  Create 1,000 rows
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button id="runlots" class="btn btn-primary btn-block" type="button" onClick={runLots}>
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
                <button id="swaprows" class="btn btn-primary btn-block" type="button" onClick={swapRows}>
                  Swap Rows
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <table class="table table-hover table-striped test-data">
        <tbody>
          <For each={data()}>
            {(row: Row) => {
              const rowId = row.id
              return (
                <tr class={selected() === rowId ? "danger" : ""}>
                  <td class="col-md-1" textContent={rowId} />
                  <td class="col-md-4">
                    <a onClick={() => setSelected(rowId)} textContent={row.label()} />
                  </td>
                  <td class="col-md-1">
                    <a onClick={() => remove(rowId)}>
                      <span class="glyphicon glyphicon-remove" aria-hidden="true" />
                    </a>
                  </td>
                  <td class="col-md-6" />
                </tr>
              )
            }}
          </For>
        </tbody>
      </table>
      <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true" />
    </div>
  )
}

render(() => <App />, document.getElementById("main") as HTMLElement)
;(globalThis as { __ready?: boolean }).__ready = true
