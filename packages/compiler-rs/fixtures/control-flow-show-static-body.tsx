import { Show, signal } from "@barqjs/core"

export const on = signal(false)

/**
 * The BOUNDARY of target #8: a static body the author wrote as a thunk, which
 * the compiler must leave alone.
 *
 * Unwrapping it looks free — the body is one `template()` clone either way —
 * and is not. It builds the subtree at call time even though `on` starts false
 * and the branch may never be taken, and it hands `Show` the SAME node on every
 * re-mount where the un-compiled path calls the arrow again and gets a fresh
 * one. Anything living on that node survives a toggle it should not: focus,
 * text selection, scroll offset, a dirty form value, a running transition. The
 * `node-identity` channel in normalize.ts is what sees it; every other channel
 * reports the two DOMs as identical.
 *
 * The elision target #8 actually buys is in `control-flow-show-eager-static-body`,
 * where there is no author thunk to remove.
 */
export default function ControlFlowShowStaticBody() {
  return (
    <Show when={() => on()}>
      {() => (
        <div class="panel">
          <h3>Static heading</h3>
          <p>Static paragraph with no holes at all.</p>
        </div>
      )}
    </Show>
  )
}

export const steps = [() => on.set(true), () => on.set(false), () => on.set(true)]

export const optimality = {
  target: 8,
  milestone: 5,
  // The body is a subtree that produced no patch, so it costs one template and
  // not a single patch call anywhere in the module — with the author's thunk
  // still around it, deferring the clone until the branch is taken.
  templates: 1,
  patchCalls: 0,
  emits: ['<div class="panel"><h3>Static heading</h3>', "branch(", "}), 2)"],
  absent: ["children:"],
}
