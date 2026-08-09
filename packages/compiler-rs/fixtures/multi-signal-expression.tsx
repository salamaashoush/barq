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
  // element carries exactly ONE live prop, and target #4's grouping is for
  // coalescing several — so a group here would be a `renderEffect` wrapper
  // around a single write, which is strictly more work than the write.
  emits: ['"data-both"', "a() + b()"],
  absent: ["renderEffect("],
}
