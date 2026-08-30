import { For, signal } from "@barqjs/core"

export const nums = signal([1, 2, 3])

/**
 * The positional mode, which since M7b has ONE spelling: `keyed={false}`.
 * `Index` is deleted — Solid ran `For` and `Index` side by side for five years
 * and removed the second because having both "encourages bikeshedding and
 * accidental misuse". The emission is unchanged: the
 * construct was already `each(src, false, row)` under either name.
 */
export default function ControlFlowIndex() {
  return (
    <ol>
      <For each={() => nums()} keyed={false}>
        {(item, index) => (
          <li>
            {index}={() => item()}
          </li>
        )}
      </For>
    </ol>
  )
}

export const steps = [() => nums.set([9, 2, 3]), () => nums.set([9]), () => nums.set([1, 2, 3, 4])]

export const optimality = {
  target: 8,
  milestone: 5,
  templates: 2,
  // The positional mode gives its row an ACCESSOR item and a plain-number index
  // — the mirror image of the identity-keyed default — so the index hole passes
  // through as a value and calling the item is the tracked read.
  emits: ["each(", ", nums, false, ", ", item, index) =>"],
  absent: ["For(", "each: "],
}
