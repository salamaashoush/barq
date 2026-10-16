import { createSignal } from "@barqjs/core"

export const [on, setOn] = createSignal(false)

/**
 * `class` takes a list of strings and maps, nested to any depth, and the whole
 * value is one channel: the string tokens and the map's true keys are applied
 * together, so none of it may be baked into the template as an attribute.
 */
export default function ClassListProp() {
  return (
    <div class="host">
      <span class={() => ["badge", { active: on(), muted: false }]}>keyed</span>
      <span class={() => [{ "one two": on() }, ["four", { three: !on() }]]}>reactive</span>
    </div>
  )
}

export const steps = [() => setOn(true), () => setOn(false)]
export const optimality = {
  target: 4,
  milestone: 5,
  templates: 1,
  patchCalls: 2,
  // The list reaches the class channel whole, so the static `"badge"` inside it
  // is not split off into the template and nothing is joined at compile time.
  emits: ["<span>keyed</span>", '"one two": on()', "bindEffect("],
  absent: ['class="badge', 'class="four'],
}
