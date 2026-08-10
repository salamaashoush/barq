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
  milestone: 5,
  templates: 1,
  // `component` is one of the five props the runtime unwraps, so the accessor
  // goes in bare; everything else `Dynamic` is given is an ordinary object
  // property it spreads onto the element it renders.
  emits: ["Dynamic(", "component: tag", '() => "dyn"', '() => "inner"'],
  absent: ["(Dynamic, {", "component: () =>"],
}
