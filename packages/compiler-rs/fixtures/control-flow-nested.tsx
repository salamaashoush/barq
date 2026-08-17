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

export const optimality = {
  target: 8,
  milestone: 5,
  templates: 4,
  // One patch call, and it is the row's `{item}` hole. Neither construct costs
  // one: since K5 a region IS a patch, so the `insert` that used to join each
  // adapter's return value to its parent is gone from both of them.
  patchCalls: 1,
  // Control flow inside control flow, both lowered. The `Show` becomes a
  // `branch`; the `For` inside its body becomes an `each` addressed against the
  // `<ul>` that body's OWN template walk produced — which is the point of
  // handing the primitive a pair rather than letting it re-derive one, because
  // the pair here belongs to a tree that does not exist until the branch
  // activates.
  emits: ["branch(", "() => visible() ? 1 : 0", "each(", ", items, null, "],
  absent: ["Show(", "For(", "when: ", "each: ", "children: ", "fallback: "],
}
