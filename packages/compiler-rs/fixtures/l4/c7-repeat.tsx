/**
 * C7 on `each`'s count mode (`Repeat`).
 *
 * The row Block is invoked once per position that comes into existence and never
 * again: growing the count activates only the new positions, shrinking it
 * activates none.
 */
import { Repeat, signal } from "@barqjs/core"

export const log: string[] = []

export const n = signal(2)

export default function C7Repeat() {
  return (
    <div class="cells">
      <Repeat count={() => n()}>
        {(i) => {
          log.push(`cell-${i}`)
          return <span class="cell">{i}</span>
        }}
      </Repeat>
    </div>
  )
}

export const steps = [() => n.set(4), () => n.set(1)]

export const metamorphic = {
  why: "positions 0 and 1 exist throughout; 2 and 3 are built then dropped",
  steps: ["grows", "shrinks"],
}

export const c7 = {
  why: "two positions at mount, two more on the growth, none on the shrink",
  log: ["cell-0", "cell-1", "cell-2", "cell-3"],
}
