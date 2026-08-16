import { Dynamic, signal } from "@barqjs/core"

export const tag = signal<"span" | "b">("span")

export default function DynamicFixture() {
  return (
    <div>
      <Dynamic component={() => tag()} class="dyn">
        inner
      </Dynamic>
    </div>
  )
}

export const steps = [() => tag.set("b"), () => tag.set("span")]
export const optimality = {
  target: 8,
  milestone: 9,
  templates: 1,
  // K5 lowers `Dynamic` onto the `branch` it always reached, keyed on the
  // component itself: the swap and the teardown are the primitive's, and the
  // body is one call that resolves the value. Its string arm builds through
  // `spread` and `insert` — the two entry points every other element goes
  // through — so the fifth element-creation path that kept this construct on
  // its adapter does not exist to emit.
  emits: ["branch(", "dynamic(", '() => "dyn"', '() => "inner"'],
  // The adapter frame, and the props record it read `component` out of.
  absent: ["Dynamic(", "component: "],
}
