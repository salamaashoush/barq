import { For, useStore } from "@barqjs/core"

const [state, setState] = useStore({ items: [{ name: "a", active: true }, { name: "b", active: false }] })

/**
 * `each` bound to a LOCAL function that derives the list. `For` unwraps a
 * function-valued `each` itself, so the accessor passes through unwrapped —
 * wrapping it again yields a function that returns a function, and the list
 * renders as one row containing `[object Function]`. That was the last case in
 * the dead plugin's suite, and it is the η-reduction boundary target 8 lives on.
 */
export default function ForEachLocalFunction() {
  const activeItems = () => state.items.filter((item) => item.active)
  return (
    <ul class="filtered">
      <For each={activeItems}>{(item: { name: string }) => <li>{item.name}</li>}</For>
    </ul>
  )
}

export const steps = [
  () => setState("items", 1, "active", true),
  () => setState("items", [{ name: "c", active: true }]),
]
export const optimality = {
  target: 1,
  milestone: 5,
  templates: 2,
  // `each` η-reduces through a LOCAL arrow with no primitive call in it: the
  // binding is proved to be an accessor by its initialiser, and `activeItems`
  // goes in bare. The row parameter is a plain value, so the row's hole takes
  // `item.name` with no thunk (DESIGN O3).
  emits: ["For(", "each: activeItems", ", item: {"],
  absent: ["each: () => activeItems()", "() => item.name"],
}
