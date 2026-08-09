import { Show, signal } from "@barqjs/core"

export const on = signal(false)

/**
 * Target #8, in the shape it is actually about: a control-flow child written as
 * JSX rather than as a thunk.
 *
 * `Show.children` is typed `Child`, so a node is as good as a function, and the
 * un-compiled path builds this subtree EAGERLY at the call site — `createElement`
 * evaluates its arguments before `Show` ever sees them. The compiler has to do
 * the same thing and nothing more: one `template()` clone passed straight in,
 * with no arrow, no IIFE, no element binding and no patch call anywhere in the
 * module. A compiler that helpfully wraps it in `() => …` changes when the DOM
 * is created and hands `Show` a fresh node on every re-mount where the oracle
 * hands back the same one.
 *
 * The opposite mistake is `control-flow-show-static-body`, which writes the same
 * static body as an author thunk and must KEEP it.
 *
 * `when` is an author-written thunk here on purpose: with it the ORACLE toggles
 * too, so the whole cycle is a strict frame-for-frame equality — including the
 * node-identity channel, which is the only one that can tell "handed the same
 * node back" from "built a new one".
 */
export default function ControlFlowShowEagerStaticBody() {
  return (
    <Show when={() => on()}>
      <div class="panel">
        <h3>Static heading</h3>
        <p>Static paragraph with no holes at all.</p>
      </div>
    </Show>
  )
}

export const steps = [() => on.set(true), () => on.set(false), () => on.set(true)]

export const optimality = {
  target: 8,
  milestone: 5,
  // One template for the body, and not one patch call in the module: the
  // subtree produced no patch, so there is nothing left to defer.
  templates: 1,
  patchCalls: 0,
  emits: ['<div class="panel"><h3>Static heading</h3>', "children: "],
  // The two shapes a thunk would take. Neither may appear around the body.
  absent: ["children: () =>", "children: (()"],
}
