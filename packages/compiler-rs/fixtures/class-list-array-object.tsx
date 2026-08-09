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
