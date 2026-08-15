import { signal } from "@barqjs/core"

export const on = signal(false)

export default function ClassListArrayObject() {
  return (
    <div>
      <span class={["a", "b"]}>array</span>
      <span class={() => ({ base: true, active: on() })}>object</span>
    </div>
  )
}

export const steps = [() => on.set(true), () => on.set(false)]
export const optimality = {
  target: 4,
  milestone: 5,
  templates: 1,
  patchCalls: 2,
  // `class` normalises its value, so an array or an object has to reach the
  // channel WHOLE: nothing is joined into a string at compile time and nothing
  // is baked into the template, however constant it looks. The reactive one is
  // a field of the fused record and threads the string it applied last time.
  emits: ['"class", ["a", "b"]', "bindEffect("],
  absent: ['class="'],
}
