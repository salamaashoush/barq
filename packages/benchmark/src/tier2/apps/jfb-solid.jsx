/**
 * js-framework-benchmark, keyed, in Solid.
 *
 * `frameworks/keyed/solid/src/main.jsx` from krausest/js-framework-benchmark
 * (Apache-2.0), vendored with two edits and no others: the `Button` component
 * is expanded inline so both apps emit the same element tree from the same
 * source shape, and `__ready` is set so the driver knows when to start. This is
 * the comparand's OWN official entry, not this project's reading of it.
 */
import { batch, createSelector, createSignal } from "solid-js"
import { render } from "solid-js/web"

const adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy"]; // prettier-ignore
const colors = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"]; // prettier-ignore
const nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie", "sandwich", "burger", "pizza", "mouse", "keyboard"]; // prettier-ignore

const random = (max) => Math.round(Math.random() * 1000) % max

let nextId = 1

const buildData = (count) => {
  let data = new Array(count)
  for (let i = 0; i < count; i++) {
    const [label, setLabel] = createSignal(
      `${adjectives[random(adjectives.length)]} ${colors[random(colors.length)]} ${nouns[random(nouns.length)]}`,
    )
    data[i] = { id: nextId++, label, setLabel }
  }
  return data
}

render(() => {
  const [data, setData] = createSignal([])
  const [selected, setSelected] = createSignal(null)
  const run = () => setData(buildData(1_000))
  const runLots = () => setData(buildData(10_000))
  const add = () => setData((d) => [...d, ...buildData(1_000)])
  const update = () =>
    batch(() => {
      for (let i = 0, d = data(), len = d.length; i < len; i += 10) d[i].setLabel((l) => l + " !!!")
    })
  const clear = () => setData([])
  const swapRows = () => {
    const list = data().slice()
    if (list.length > 998) {
      let item = list[1]
      list[1] = list[998]
      list[998] = item
      setData(list)
    }
  }
  const isSelected = createSelector(selected)

  return (
    <div class="container">
      <div class="jumbotron">
        <div class="row">
          <div class="col-md-6">
            <h1>Solid</h1>
          </div>
          <div class="col-md-6">
            <div class="row">
              <div class="col-sm-6 smallpad">
                <button prop:id="run" class="btn btn-primary btn-block" type="button" onClick={run}>
                  Create 1,000 rows
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button prop:id="runlots" class="btn btn-primary btn-block" type="button" onClick={runLots}>
                  Create 10,000 rows
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button prop:id="add" class="btn btn-primary btn-block" type="button" onClick={add}>
                  Append 1,000 rows
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button prop:id="update" class="btn btn-primary btn-block" type="button" onClick={update}>
                  Update every 10th row
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button prop:id="clear" class="btn btn-primary btn-block" type="button" onClick={clear}>
                  Clear
                </button>
              </div>
              <div class="col-sm-6 smallpad">
                <button prop:id="swaprows" class="btn btn-primary btn-block" type="button" onClick={swapRows}>
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
            {(row) => {
              let rowId = row.id;
              return (
                <tr class={isSelected(rowId) ? "danger" : ""}>
                  <td class="col-md-1" textContent={rowId} />
                  <td class="col-md-4">
                    <a onClick={() => setSelected(rowId)} textContent={row.label()} />
                  </td>
                  <td class="col-md-1">
                    <a onClick={() => setData((d) => d.toSpliced(d.findIndex((d) => d.id === rowId), 1))}>
                      <span class="glyphicon glyphicon-remove" aria-hidden="true" />
                    </a>
                  </td>
                  <td class="col-md-6" />
                </tr>
              ); // prettier-ignore
            }}
          </For>
        </tbody>
      </table>
      <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true" />
    </div>
  )
}, document.getElementById("main"))

globalThis.__ready = true
