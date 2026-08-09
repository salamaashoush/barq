import { signal } from "@barqjs/core"

export const tone = signal("red")
export const label = signal("first")

/**
 * Target #4's boundary. `title` and `id` share one compiled effect; `class`
 * must NOT join them.
 *
 * `applyResolvedProp` diffs the normalised class string against the one it
 * applied last time, so the runtime's class effect only touches the DOM when
 * the class value itself changes. A compiled effect covering `class` alongside
 * `title` re-writes `element.className` whenever the TITLE changes, which wipes
 * whatever another channel put there — here the `extra` key that `classList`
 * added. Step 0 changes only `label`, so a regression shows up as `extra`
 * disappearing from the class attribute.
 */
export default function ClassWithLiveSiblings() {
  return (
    <div
      class={() => tone()}
      title={() => label()}
      id={() => label()}
      classList={{ extra: true }}
    >
      x
    </div>
  )
}

export const steps = [() => label.set("second"), () => tone.set("blue")]

export const optimality = {
  target: 4,
  milestone: 3,
  effects: 2,
  templates: 1,
  emits: ['"class", () => tone()', "renderEffect("],
}
