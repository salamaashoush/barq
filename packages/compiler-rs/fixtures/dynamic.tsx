import { createSignal, dynamic } from "@barqjs/core"

export const [tag, setTag] = createSignal<"span" | "b">("span")

const Tagged = dynamic(() => tag())

export default function DynamicFixture() {
  return (
    <div>
      <Tagged class="dyn">inner</Tagged>
    </div>
  )
}

export const steps = [() => setTag("b"), () => setTag("span")]
export const optimality = {
  target: 8,
  milestone: 9,
  templates: 1,
  // `dynamic` is a component the author hoists, so the call site is an
  // ordinary component call whose props are Cells. The `branch` keyed on the
  // source, the swap and the teardown are the factory's at run time, and its
  // string arm builds through `spread` and `insert` like every other element.
  emits: ["dynamic(() => tag())", "Tagged({", '() => "dyn"', '() => "inner"'],
  // `<Dynamic>`'s adapter frame, and the props record it read `component` out of.
  absent: ["Dynamic(", "component: "],
}
