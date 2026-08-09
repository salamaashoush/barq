import { createProjection, signal } from "@barqjs/core"

export const on = signal(false)

/**
 * `createProjection` returns the store PROXY directly, not a tuple and not an
 * accessor: `selected.on` is the tracked read and `selected()` would throw.
 */
const selected = createProjection<{ on: boolean }>(
  (draft) => {
    draft.on = on()
  },
  { on: false },
)

export default function CreateProjectionStore() {
  return (
    <div class="projection" data-on={() => (selected.on ? "1" : "0")}>
      {() => (selected.on ? "yes" : "no")}
    </div>
  )
}

export const steps = [() => on.set(true), () => on.set(false)]

export const optimality = {
  target: 1,
  milestone: 5,
  templates: 1,
  // `createProjection` returns a ReactiveObject directly — not a tuple — so any
  // MEMBER read of it is the tracked read and both holes bind live off `.on`.
  emits: ["() => selected.on"],
  // The unwrapped form the member read would take if `createProjection` had
  // been classified as a tuple instead of a ReactiveObject.
  absent: ["insert(_el, selected.on"],
}
