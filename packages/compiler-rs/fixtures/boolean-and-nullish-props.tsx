import { signal } from "@barqjs/core"

export const flag = signal<boolean>(false)

export default function BooleanAndNullishProps() {
  return (
    <div>
      <button type="button" disabled={() => flag()}>
        b
      </button>
      <span data-present={() => (flag() ? "yes" : null)} hidden={false} />
    </div>
  )
}

export const steps = [() => flag.set(true), () => flag.set(false)]
export const optimality = {
  target: 3,
  milestone: 5,
  templates: 1,
  patchCalls: 2,
  // `hidden={false}` is a literal FALSE, and an HTML boolean attribute has no
  // way to spell that — `hidden="false"` is still hidden. So it is not baked at
  // all, where the two LIVE props are not baked either but for the opposite
  // reason: their value is not known yet.
  emits: ['<button type="button">b</button>', "<span></span>"],
  absent: ['hidden="', "data-present="],
}
