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
