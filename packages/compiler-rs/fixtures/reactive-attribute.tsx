import { signal } from "@barqjs/core"

export const href = signal("/home")
export const active = signal(false)

export default function ReactiveAttribute() {
  return (
    <a href={() => href()} class={() => (active() ? "link active" : "link")} data-static="keep">
      go
    </a>
  )
}

export const steps = [() => active.set(true), () => href.set("/about"), () => active.set(false)]

/**
 * TWO effects, not one, and that is the correct answer.
 *
 * `href` gets a compiled effect. `class` does not join it: `applyResolvedProp`
 * threads the class string it applied last time through the RUNTIME's effect
 * and removes what vanished, so a compiled effect calling `setProp` afresh can
 * only ever add — and an unguarded `element.className = …` fired by an
 * unrelated prop wipes classes another channel put there. Unwrapped, the value
 * reaches the runtime exactly as the un-compiled path delivers it.
 *
 * class-with-live-siblings is the fixture that proves the boundary is where it
 * should be: two non-intercepted props on one element still share one effect.
 */
export const optimality = {
  target: 4,
  milestone: 3,
  effects: 2,
  templates: 1,
  emits: ['"href", () => href()', '"class", () => active()'],
  absent: ["renderEffect"],
}
