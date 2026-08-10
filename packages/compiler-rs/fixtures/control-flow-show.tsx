import { Show, signal } from "@barqjs/core"

export const visible = signal(true)

export default function ControlFlowShow() {
  return (
    <div>
      <Show when={() => visible()} fallback={<span class="empty">nothing</span>}>
        {() => <p class="content">shown</p>}
      </Show>
      <footer>tail</footer>
    </div>
  )
}

export const steps = [() => visible.set(false), () => visible.set(true)]

export const optimality = {
  target: 8,
  milestone: 5,
  templates: 3,
  // The fallback is JSX, so it is a built node — `fallbackNodes` evaluates it
  // eagerly and a thunk there would only add a closure. The children were
  // written as a thunk and stay one.
  emits: ["Show(", "when: visible", "fallback: "],
  absent: ["(Show, {", "fallback: () =>", "when: () =>"],
}
