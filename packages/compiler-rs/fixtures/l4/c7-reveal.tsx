/**
 * C7 through `Reveal`, which owns no range and installs a coordinator.
 *
 * It is in the table because `ownership.rs` was changed at M4 to call it a
 * `Provide` rather than a `Branch`, and a construct that owns no range is
 * exactly the one where "invoked once per activation" is easiest to get wrong
 * without anything noticing.
 */
import { Reveal, Show, signal } from "@barqjs/core"

export const log: string[] = []

export const label = signal("one")
export const open = signal(true)

export default function C7Reveal() {
  return (
    <div class="reveal-host">
      <Reveal order="together">
        <Show when={() => open()}>
          {() => {
            log.push("revealed")
            return <p class="first">{() => label()}</p>
          }}
        </Show>
      </Reveal>
    </div>
  )
}

export const steps = [() => label.set("two"), () => open.set(false)]

export const c7 = {
  why: "one activation; a write inside the body is none and closing the branch is none",
  log: ["revealed"],
}
