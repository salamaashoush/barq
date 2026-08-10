/**
 * MM3 `preserves` on `Index` — the unkeyed list's whole reason to exist.
 *
 * `Index` keys on the POSITION, so changing the value at a position must update
 * that row in place rather than rebuild it. Every node survives both writes, and
 * the row Block is invoked once per position and never again.
 */
import { Index, signal } from "@barqjs/core"

export const log: string[] = []

export const nums = signal([1, 2, 3])

export default function IndexRowStable() {
  return (
    <ol class="nums">
      <Index each={() => nums()}>
        {(item, index) => {
          log.push(`cell-${index}`)
          return (
            <li class="cell">
              <b>{() => item()}</b>
            </li>
          )
        }}
      </Index>
    </ol>
  )
}

export const steps = [() => nums.set([9, 2, 3]), () => nums.set([9, 8, 7])]

export const metamorphic = {
  why: "a positional list updates the value at a position and keeps the node at it",
  steps: ["preserves", "preserves"],
}

export const c7 = {
  why: "three positions, three activations, and a value change at a position is none",
  log: ["cell-0", "cell-1", "cell-2"],
}
