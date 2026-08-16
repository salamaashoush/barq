/**
 * A4 — optimistic state is DERIVED, never restored.
 *
 * The value everyone reads is `reduce(settled, pending)`. An action's writes
 * are a pending layer over the settled state; retiring the action drops the
 * layer and the derivation falls back on its own. There is no snapshot,
 * therefore there is nothing to clobber.
 *
 * The first claim is the one the old implementation could not pass. It captured
 * `revertTo` once per (target, action) and wrote it back at completion, so the
 * refresh the action exists to trigger — the server's answer, a push, another
 * user's edit — was rolled back to a value that was by then wrong. Rollback on
 * failure (claim two) is the SAME act, which is the point: it is not a second
 * code path that has to agree with the first.
 *
 * The third claim is the CONTROL. Writes outside an action have to reach the
 * settled state and stay there, or "the layer was dropped" and "nothing was
 * ever written" would be the same observation.
 *
 * SEMANTICS.md §10 A4.
 */
import { action, optimistic, render } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"

export const status = optimistic("saved")

let release: (() => void) | null = null
let previous: (() => void) | null = null

export const rules = ["A4"]

const save = action(function* () {
  status.set("saving…")
  yield new Promise<void>((resolve) => {
    release = resolve
  })
})

const failing = action(function* () {
  status.set("saving…")
  yield Promise.reject(new Error("the server refused"))
})

function Status() {
  return <b class="status">{() => status()}</b>
}

async function mount(kit: Kit) {
  previous?.()
  previous = null
  release = null
  status.set("saved")
  const host = kit.container()
  let dispose: (() => void) | undefined
  const thrown = await kit.attempt(() => {
    dispose = render(() => <Status />, host)
  })
  previous = dispose ?? null
  return { host, thrown }
}

function shown(host: HTMLElement): string {
  return host.querySelector("b.status")?.textContent ?? ""
}

export const claims: Claim[] = [
  {
    id: "a-real-write-landing-during-the-action-survives-its-retirement",
    rule: "A4",
    says: "the settled state is read live, so a value that lands while the action is in flight is what remains when the pending layer is dropped",
    async check(kit) {
      const { host, thrown } = await mount(kit)
      if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0].message}`)

      const running = save()
      await kit.settle()
      kit.precondition(
        shown(host) === "saving…",
        `the optimistic value never appeared; the element reads ${JSON.stringify(shown(host))}`,
      )

      // Outside the action context: a push, a refresh, another user's edit.
      status.set("from-server")
      await kit.settle()

      release?.()
      await running
      await kit.settle()

      if (shown(host) !== "from-server") {
        kit.fail(
          `the action retired and the element reads ${JSON.stringify(shown(host))}. A4 forbids a ` +
            "snapshot: restoring the value the settled state held when the action STARTED " +
            "discards the write the action itself was waiting for",
        )
      }
    },
  },
  {
    id: "rollback-on-failure-follows-from-the-derivation",
    rule: "A4",
    says: "a failed action needs no rollback code — dropping its layer IS the rollback",
    async check(kit) {
      const { host, thrown } = await mount(kit)
      if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0].message}`)

      await failing().catch(() => {})
      await kit.settle()

      if (shown(host) !== "saved") {
        kit.fail(
          `the failed action left the element reading ${JSON.stringify(shown(host))} rather than ` +
            "the settled value it never reached",
        )
      }
    },
  },
  {
    id: "control-a-write-outside-an-action-is-the-settled-state",
    rule: "A4",
    says: "an ordinary write reaches the settled state and stays there — which is what makes the two claims above evidence of a layer being dropped rather than of writes going nowhere",
    async check(kit) {
      const { host, thrown } = await mount(kit)
      if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0].message}`)

      status.set("edited")
      await kit.settle()
      if (shown(host) !== "edited") {
        kit.fail(`an ordinary write did not render; the element reads ${JSON.stringify(shown(host))}`)
      }

      await failing().catch(() => {})
      await kit.settle()

      if (shown(host) !== "edited") {
        kit.fail(
          `an action retiring reverted a write made BEFORE it started; the element reads ` +
            `${JSON.stringify(shown(host))}`,
        )
      }
    },
  },
]
