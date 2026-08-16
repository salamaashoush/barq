import { Show, signal } from "@barqjs/core"

export const on = signal(true)

/**
 * A flow component whose children AND fallback are multi-node fragments, driven
 * through a full hide/show/hide cycle.
 *
 * This class had no coverage at all, and it hid a runtime bug that only becomes
 * reachable once the body is re-mounted: the eager form read the built
 * DocumentFragment's `childNodes`, the first insert MOVED those nodes out, and
 * every later read of the same children found an EMPTY fragment. The content
 * was gone permanently after one toggle, on both paths — invisible to the
 * differential precisely because both paths lost it. The steps below drive the
 * cycle twice, so a fragment that drained would show up as an empty
 * `<div class="frag">` on the third frame. A fragment is now an ARRAY of built
 * roots, which has no shared mutable container to drain.
 *
 * Target #8 makes this shape COMMON rather than rare: an eager multi-node body
 * is exactly what the compiler now hands over instead of a thunk.
 */
export default function ControlFlowShowFragmentBody() {
  return (
    <div class="frag">
      <Show
        when={() => on()}
        fallback={
          <>
            <i>fallback-one</i>
            <u>fallback-two</u>
          </>
        }
      >
        <>
          <a href="#one">body-one</a>
          <b>body-two</b>
        </>
      </Show>
    </div>
  )
}

export const steps = [() => on.set(false), () => on.set(true), () => on.set(false)]

export const optimality = {
  target: 8,
  milestone: 5,
  // Five: the host, and one per node in each multi-node fragment. Neither the
  // body nor the fallback is wrapped in a thunk the compiler manufactured —
  // both are arrays of built clones inside the Block the branch owns.
  templates: 5,
  emits: ["branch(", "() => on() || false"],
  absent: ["when:", "children:", "fallback:", "createElement"],
}
