import { For, Show, signal, store } from "@barqjs/core"

const tab = signal("posts")
const [state, setState] = store({ filters: { search: "" }, user: { name: "John" } })
const rows = signal(["alpha", "beta"])

/**
 * The dead plugin's "complete component", rebuilt as one module: a ternary
 * class over one source, a `Show` over another, a store read in a DOM_PROPS
 * channel, an event handler that writes the store from the event object, and a
 * list. Every one of those is covered on its own elsewhere; this is the one
 * that proves they compose, and it is the closest thing in the corpus to a
 * page a user would actually write.
 */
export default function DashboardComposite() {
  return (
    <div class={() => (tab() === "posts" ? "posts" : "other")}>
      <Show when={() => state.user.name !== ""} fallback={<p class="anon">anonymous</p>}>
        {() => <h1>Hello, {() => state.user.name}</h1>}
      </Show>

      <input
        class="search"
        value={() => state.filters.search}
        onInput={(event: InputEvent) =>
          setState("filters", "search", (event.target as HTMLInputElement).value)
        }
      />

      <button type="button" class="tab" onClick={() => tab.set("other")}>
        switch
      </button>

      <ul class="rows">
        <For each={() => rows()}>{(row: string) => <li>{row}</li>}</For>
      </ul>
    </div>
  )
}

export const steps = [
  () => setState("filters", "search", "q"),
  () => setState("user", "name", "Ada"),
  () => rows.set(["gamma"]),
]

export const events = [
  (root: HTMLElement) => root.querySelector("button")?.click(),
  (root: HTMLElement) => {
    const input = root.querySelector("input") as HTMLInputElement
    input.value = "typed"
    input.dispatchEvent(new Event("input", { bubbles: true }))
  },
]

export const optimality = {
  target: 7,
  milestone: 5,
  // Everything at once, and every one of them still holds in each other's
  // company: two closure-free handlers hoisted to module scope with ONE
  // `delegateEvents` for both types, `value` staying in the property channel
  // (DOM_PROPS) rather than being baked, `each` η-reduced to the accessor, and
  // four templates for a whole page — the frame, the fallback, the greeting and
  // the row.
  templates: 4,
  emits: [
    "delegateEvents([",
    '"click"',
    '"input"',
    "$$input = ",
    "$$click = ",
    '"value"',
    ", rows, null, ",
    // K5, in the company of everything else: both constructs are regions. The
    // `Show` is the corpus's clearest case of the pair coming from the walk —
    // it stands BETWEEN the search input and the tab button, so its anchor is a
    // node the template already carries and the runtime re-derives nothing.
    "branch(",
    '() => state.user.name !== "" || false',
    "each(",
  ],
  // The handlers are hoisted, so nothing rebuilds them per instance; the one
  // prop the runtime diffs at runtime is never folded into the markup; and the
  // two adapter frames -O0 pays for the page are both gone.
  absent: ['value="', "each: ", "addEventListener", "Show(", "For(", "when: ", "children: "],
}
