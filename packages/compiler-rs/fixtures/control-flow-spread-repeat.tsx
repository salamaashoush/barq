import { Repeat, signal } from "@barqjs/core"

export const n = signal(2)

const opts = { count: () => n(), from: () => 10 }

/**
 * `Repeat` with both of its value props behind a spread.
 *
 * Two slots, two different rules, and the difference is what the primitive does
 * with each. `count` is `each`'s source and the primitive CALLS it, so the
 * member read crosses as it stands. `from` is not a slot any primitive reads —
 * the index shift is the compiler's own arrow — so it goes through `readSlot`
 * exactly where the adapter's `readValue` was, and `?? 0` is still what an
 * absent `from` reads as.
 */
export default function ControlFlowSpreadRepeat() {
  return (
    <div class="spread-repeat">
      <Repeat {...opts}>{(i) => <span class="cell">{i}</span>}</Repeat>
    </div>
  )
}

export const steps = [() => n.set(4), () => n.set(1)]

export const optimality = {
  target: 8,
  milestone: 10,
  templates: 2,
  // The count is the member read, called by the primitive. The shift is the
  // slot read, wrapped by the compiler.
  emits: ["each(", ".count, ", "COUNT", "readSlot(", "?? 0", ", i) =>"],
  absent: ["Repeat(", "count: "],
}
