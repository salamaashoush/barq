import { For, Show, signal } from "@barqjs/core"

export const visible = signal(true)
export const items = signal([1, 2, 3])

/**
 * Control flow inside control flow. The `For` is built inside the `Show`'s
 * body, so the whole list fragment — markers, effects and rows — is created and
 * torn down every time the branch flips, and the row template has to be shared
 * across every one of those lifetimes.
 */
export default function ControlFlowNested() {
  return (
    <div class="nest">
      <Show when={() => visible()} fallback={<span class="off">off</span>}>
        {() => (
          <ul class="rows">
            <For each={() => items()}>{(item: number) => <li>{item}</li>}</For>
          </ul>
        )}
      </Show>
    </div>
  )
}

export const steps = [
  () => items.set([1, 2]),
  () => visible.set(false),
  () => visible.set(true),
  () => items.set([4, 5, 6]),
]
