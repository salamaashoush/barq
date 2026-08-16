import { For, signal } from "@barqjs/core"

export const rows = signal(["alpha", "beta"])

const opts = { each: () => ["stale"], keyed: false as const }

/**
 * A spread and a named prop on the same construct, and the ORDER decides which
 * one the lowering can read.
 *
 * A source list is last-wins, so a prop written AFTER the last spread
 * cannot be overridden and stays static — `each` here η-reduces to the accessor
 * and never reaches the source list at all, which is why `opts.each` is dead. A
 * prop that is only in the spread is a member read off the binding the list is
 * evaluated into, and `keyed` is that: the carrier crosses unresolved and
 * `each`'s own `keyMode` reads it.
 *
 * The steps are what tell `keyed: false` from the identity default. Positional
 * rows keep their slots and change their contents; identity rows would be
 * rebuilt.
 */
export default function ControlFlowSpreadPrecedence() {
  return (
    <ul class="precedence">
      <For {...opts} each={() => rows()}>
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
  () => rows.set(["ALPHA", "BETA"]),
  () => rows.set(["ALPHA", "BETA", "gamma"]),
  () => rows.set(["only"]),
]

export const optimality = {
  target: 1,
  milestone: 10,
  templates: 2,
  // The source is the accessor itself, static. The keying carrier is the member
  // read, unresolved. Both in one call, which is the whole claim.
  emits: ["each(", ", rows, ", ".keyed, ", ", row, index) =>"],
  absent: ["For(", "opts.each"],
}
