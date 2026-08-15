import { signal } from "@barqjs/core"

export const a = signal(1)
export const b = signal(2)

/** Two independent dep sets joined into one hole and one attribute. */
export default function MultiSignalExpression() {
  return (
    <div class="sum" data-both={() => `${a()}/${b()}`}>
      {() => a() + b()}
    </div>
  )
}

export const steps = [() => a.set(10), () => b.set(20)]
export const optimality = {
  target: 4,
  milestone: 5,
  templates: 1,
  patchCalls: 2,
  // Two independent dep sets joined into one hole and one attribute. The
  // element carries exactly ONE live prop, so there is nothing to coalesce —
  // and the effect around it is not the grouping, it is the write: §3.5 leaves
  // no `setProp` for a thunk to be handed to, so a proven-live prop owns its
  // own effect and threads its own prev through the compute's return.
  emits: ['"data-both"', "a() + b()", "bindEffect("],
  // A group of one threads a SCALAR previous value, not the record a real
  // group needs: the accumulator's default object is what a group costs.
  absent: [" = {}"],
}
