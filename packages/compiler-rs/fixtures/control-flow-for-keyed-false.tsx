import { For, signal } from "@barqjs/core"

export const rows = signal(["alpha", "beta"])

/**
 * `keyed={false}` — the positional mode, and since M7b its ONLY spelling.
 * The row is positional: the item arrives as an ACCESSOR and the index as a
 * plain number, the mirror image of the by-item arm. A literal `false` is the
 * one value the compiler can prove, so this is the only arm where the index is
 * `Inert` and reading it takes no thunk at all.
 */
export default function ControlFlowForKeyedFalse() {
  return (
    <ul class="keyed-false">
      <For each={() => rows()} keyed={false}>
        {(row, index) => (
          <li>
            {index}: {row()}
          </li>
        )}
      </For>
    </ul>
  )
}

export const steps = [
  // The slots stay put and their contents change, which is the whole of what a
  // positional row is for.
  () => rows.set(["ALPHA", "BETA"]),
  () => rows.set(["ALPHA", "BETA", "gamma"]),
  () => rows.set(["only"]),
]

export const optimality = {
  target: 1,
  milestone: 3,
  templates: 2,
  // The index is a plain number here, so it is baked as a value and never
  // wrapped; the item is an accessor, so its read η-reduces to the accessor.
  emits: ["each(", ", rows, false, ", ", row, index) =>"],
  absent: ["For(", "() => false", "() => row()"],
}
