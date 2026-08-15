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
 * ONE effect, and that is the M5 answer. It was two.
 *
 * `href` and `class` are both proven reactive on the same element, so both are
 * fields of the same record. What kept `class` out was that its APPLIED value —
 * the normalised class string — lived in the runtime, so an effect that wrote
 * the channel afresh each run could only add and never remove. The record slot
 * holds that value now (`Diff::Thread`): the channel is handed the previous
 * applied value out of the record and its return is written back into the same
 * field, which is the removal half surviving inside a shared effect.
 */
export const optimality = {
  target: 4,
  milestone: 5,
  effects: 1,
  templates: 1,
  emits: ['"href"', "setClass(", "bindEffect("],
  absent: ["setProp", "bindProp("],
}
