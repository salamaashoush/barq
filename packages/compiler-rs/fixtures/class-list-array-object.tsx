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
  // `class` is diffed against its previous value by the runtime, so an array or
  // an object has to reach it WHOLE: nothing is joined into a string at compile
  // time and nothing is baked into the template, however constant it looks.
  emits: ['"class", ["a", "b"]', '"class", () => ({'],
  absent: ['class="'],
}
