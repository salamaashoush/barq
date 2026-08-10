import { Show, signal } from "@barqjs/core"

export const on = signal(true)

/**
 * A control-flow component sitting BETWEEN two static siblings inside an
 * intrinsic element. The surrounding markup stays in the template; only the
 * component becomes a hole, and the `<footer>` that follows it is the anchor,
 * so the range the component inserts and removes stays in its source position.
 */
export default function ComponentChildOfElement() {
  return (
    <div class="host">
      <h1>Title</h1>
      <Show when={() => on()} fallback={<em class="off">off</em>}>
        {() => <p class="body">shown</p>}
      </Show>
      <footer>end</footer>
    </div>
  )
}

export const steps = [() => on.set(false), () => on.set(true)]
export const optimality = {
  target: 9,
  milestone: 5,
  templates: 3,
  // Zero patch calls, where there was one: the hole is a REGION now, so the
  // `insert` that used to join the construct to its parent is gone with it —
  // `branch` takes `(parent, anchor)` and inserts into them itself (K5, K7).
  patchCalls: 0,
  // Target #9's second rule, at a component boundary: what follows the hole is
  // an ELEMENT, so the `<footer>` is the anchor and no `<!---->` is baked. The
  // statics either side stay in the caller's template — only the construct
  // becomes a hole, and the anchor the compiler chose is handed straight to
  // the primitive rather than re-derived from a marker at run time.
  emits: ['<div class="host"><h1>Title</h1><footer>end</footer></div>', "branch("],
  absent: ["<!---->", "Show("],
}
