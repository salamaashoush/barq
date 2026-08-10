import { Repeat, signal } from "@barqjs/core"

export const n = signal(2)

export default function ControlFlowRepeat() {
  return (
    <div>
      <Repeat count={() => n()}>{(i) => <span class="cell">{i}</span>}</Repeat>
    </div>
  )
}

export const steps = [() => n.set(4), () => n.set(1)]

export const optimality = {
  target: 8,
  milestone: 5,
  templates: 2,
  // `Repeat.count` is unwrapped by the runtime, so the accessor goes in bare;
  // the row index is a plain number and needs no thunk at all.
  emits: ["Repeat(", "count: n", ", i) =>"],
  absent: ["(Repeat, {", "count: () =>"],
}
