import { Show, signal } from "@barqjs/core"

export const visible = signal(true)

/**
 * `Show` whose children and fallback are JSX ELEMENTS rather than thunks. Both
 * subtrees are built EAGERLY, at the call site, before `when` is ever read —
 * that is what the un-compiled runtime does, and a compiler that helpfully
 * wraps them in arrows changes when the DOM is created and when the effects
 * inside it run. The dead plugin's two `Show` cases were both this shape.
 */
export default function ControlFlowShowEagerChildren() {
  return (
    <div class="eager">
      <Show when={() => visible()} fallback={<span class="hidden">Hidden</span>}>
        <div class="content">Content</div>
      </Show>
    </div>
  )
}

export const steps = [() => visible.set(false), () => visible.set(true)]
export const optimality = {
  target: 8,
  milestone: 5,
  templates: 3,
  // Zero patch calls: the construct is a REGION, so its `insert` is gone.
  patchCalls: 0,
  // Target #8 on BOTH branches at once: the author wrote neither the body nor
  // the fallback as a thunk, so neither gets one — each is a single clone
  // inside the Block the branch invokes, with no arrow of the compiler's own,
  // no IIFE and no element binding.
  emits: ["branch(", "() => visible() || false"],
  absent: ["when:", "children:", "fallback:"],
}
