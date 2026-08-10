import { For, signal } from "@barqjs/core"

export const items = signal([
  { id: 1, name: "alpha" },
  { id: 2, name: "beta" },
])

export default function ControlFlowFor() {
  return (
    <ul class="list">
      <For each={() => items()} fallback={<li class="empty">none</li>}>
        {(item, index) => (
          <li data-id={String(item.id)}>
            {() => index()}: {item.name}
          </li>
        )}
      </For>
    </ul>
  )
}

export const steps = [
  () => items.update((v) => [...v, { id: 3, name: "gamma" }]),
  () => items.update((v) => v.slice(1)),
  () => items.set([]),
]

export const optimality = {
  target: 8,
  milestone: 5,
  // Three templates: the list, the fallback, the row. The fallback is a JSX
  // element, so it is built ONCE as a node exactly as `fallbackNodes` expects;
  // the row body is a callback the runtime invokes per item, so it keeps its
  // arrow however static it is. `each` η-reduces to the accessor itself.
  templates: 3,
  // K5: the construct is gone and `each` takes the source, the key mode and the
  // row Block positionally. Absent `keyed` is `null` — identity is the item —
  // and the fallback rides after the flags integer `each` never reads.
  emits: ["each(", ", items, null, ", ", item, index) =>", ", 0, "],
  absent: ["For(", "each: "],
}
