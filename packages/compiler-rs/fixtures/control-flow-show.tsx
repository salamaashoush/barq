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
  // K5: `Show` ceases to exist. The key is the author's own `when` read —
  // `visible() || false`, which collapses every falsy value onto one key so a
  // fallback stays in place across `0`, `""` and `null` — and the body is one
  // Block that picks the arm from the value it reads at ACTIVATION time. The
  // `(parent, anchor)` pair is the one the walk above it produced.
  emits: ["branch(", "() => visible() ? 1 : 0"],
  absent: ["Show(", "when:", "fallback:"],
}
