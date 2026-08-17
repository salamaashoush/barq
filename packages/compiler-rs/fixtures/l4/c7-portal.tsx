/**
 * C7 on `portal`.
 *
 * The portal's content is built somewhere else entirely, which is why it needs
 * its own line in the conformance table: it appears in no frame of the
 * container, so a second invocation would leave no trace anywhere the DOM
 * channels look.
 */
import { Portal, signal } from "@barqjs/core"

export const log: string[] = []

export const label = signal("over here")

export default function C7Portal() {
  return (
    <div class="host">
      <div id="c7-portal-target" />
      <Portal mount="#c7-portal-target">
        {() => {
          log.push("portal")
          return <p class="teleported">{() => label()}</p>
        }}
      </Portal>
    </div>
  )
}

export const steps = [() => label.set("still here")]

export const c7 = {
  why: "one activation, and a write inside the portal's body is not another one",
  log: ["portal"],
}
