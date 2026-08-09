import { signal } from "@barqjs/core"

export const value = signal("v1")

export default function CustomElements() {
  return (
    <div>
      <my-widget size="lg" />
      <x-thing data-value={() => value()} />
      <my-widget>with children</my-widget>
    </div>
  )
}

export const steps = [() => value.set("v2")]
export const optimality = {
  target: 2,
  milestone: 5,
  templates: 1,
  patchCalls: 1,
  // A hyphenated tag is an ordinary element: it is baked into the template,
  // children and all, rather than punted to `createElement` for being unknown.
  // Only the live attribute leaves the template.
  emits: ['<my-widget size="lg"></my-widget>', "<my-widget>with children</my-widget>", '"data-value"'],
  absent: ["createElement("],
}
