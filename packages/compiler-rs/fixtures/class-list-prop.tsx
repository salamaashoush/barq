import { signal } from "@barqjs/core"

export const on = signal(false)

/**
 * `classList` is additive per key and diffed against the previous map, so it is
 * not the same channel as `class` and must never be baked into the template as
 * an attribute.
 */
export default function ClassListProp() {
  return (
    <div class="host">
      <span class="badge" classList={{ active: () => on(), muted: false }}>
        keyed
      </span>
      <span classList={() => ({ "one two": on(), three: !on() })}>reactive</span>
    </div>
  )
}

export const steps = [() => on.set(true), () => on.set(false)]
export const optimality = {
  target: 4,
  milestone: 5,
  templates: 1,
  patchCalls: 2,
  // `classList` is additive per key and diffed against the previous map, so it
  // is a different channel from `class` and the two do not merge: the static
  // `class="badge"` is baked while the `classList` beside it stays in the patch.
  emits: ['<span class="badge">keyed</span>', '"classList", {', '"one two": on()'],
  absent: ['classList="', 'class="badge active"'],
}
