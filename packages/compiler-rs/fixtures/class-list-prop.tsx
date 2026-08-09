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
