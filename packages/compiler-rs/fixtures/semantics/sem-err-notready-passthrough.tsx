/**
 * A3 / E2.3 — `NotReady` is a control signal, not an error.
 *
 * A memo that has not settled throws. That throw is how a `Loading` boundary
 * learns there is something to wait for, and it must reach one: an error
 * boundary standing between the read and the `Loading` MUST re-throw it rather
 * than render its own fallback. Otherwise every suspended subtree that happens
 * to sit under an `Errored` reports a failure instead of a wait, and the
 * distinction between "still coming" and "went wrong" — the whole reason the
 * two boundaries are different constructs — disappears.
 *
 * `errorBoundary` grew the re-throw before this fixture existed and nothing
 * observed it, which is why E2.3 read `VIOLATED`: unobserved is not the same
 * state as right.
 *
 * The third claim is the CONTROL, and it is what makes the first two evidence
 * about `NotReady` specifically: with the SAME two boundaries stacked the same
 * way, a real failure still reaches the error fallback.
 *
 * SEMANTICS.md §10 A3, §6 E2.3.
 */
import { Errored, Loading, render, resource } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"

export const rules = ["A3", "E2.3"]

let answer: ((value: string) => void) | null = null
let refuse: ((error: Error) => void) | null = null
let previous: (() => void) | null = null

function Data() {
  const data = resource(
    () => null,
    () =>
      new Promise<string>((resolve, reject) => {
        answer = resolve
        refuse = reject
      }),
  )
  return <p class="data">{() => data()}</p>
}

/** The read is under BOTH boundaries, with the error one innermost. */
function Guarded() {
  return (
    <div class="shell">
      <Loading fallback={<span class="waiting">waiting</span>}>
        {() => (
          <div class="inner">
            <Errored fallback={() => <span class="failed">failed</span>}>{() => <Data />}</Errored>
          </div>
        )}
      </Loading>
    </div>
  )
}

async function mount(kit: Kit) {
  previous?.()
  previous = null
  answer = null
  refuse = null
  const host = kit.container()
  let dispose: (() => void) | undefined
  const thrown = await kit.attempt(() => {
    dispose = render(() => <Guarded />, host)
  })
  previous = dispose ?? null
  return { host, thrown }
}

function reads(host: HTMLElement): string {
  return JSON.stringify(host.textContent)
}

export const claims: Claim[] = [
  {
    id: "a-pending-read-shows-the-loading-fallback",
    rule: "A3",
    says: "an unsettled read is a wait, not a failure: the Loading fallback renders and the content follows when it settles",
    async check(kit) {
      const { host, thrown } = await mount(kit)
      if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0].message}`)
      kit.precondition(
        answer !== null,
        "the fetcher never ran, so nothing was ever pending and this claim would be observing " +
          "an absence",
      )
      if (host.querySelector("span.waiting") === null) {
        kit.fail(`nothing is waiting on the unsettled read; the container reads ${reads(host)}`)
      }

      answer?.("arrived")
      await kit.settle()

      if (host.querySelector("p.data") === null) {
        kit.fail(`the value settled and the content never rendered; the container reads ${reads(host)}`)
      }
      if (host.textContent !== "arrived") {
        kit.fail(`the settled content reads ${reads(host)}`)
      }
    },
  },
  {
    id: "an-error-boundary-between-the-read-and-the-loading-passes-notready-through",
    rule: "E2.3",
    says: "an error boundary re-throws NotReadyError instead of capturing it, so the nearest Loading is what answers",
    async check(kit) {
      const { host, thrown } = await mount(kit)
      if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0].message}`)
      kit.precondition(answer !== null, "the fetcher never ran")

      if (host.querySelector("span.failed") !== null) {
        kit.fail(
          `the error boundary captured the pending read and rendered its fallback; the container ` +
            `reads ${reads(host)}. E2.3 makes NotReadyError the one throw an error boundary must ` +
            "pass through",
        )
      }
      if (host.querySelector("span.waiting") === null) {
        kit.fail(
          `neither boundary answered the pending read; the container reads ${reads(host)}`,
        )
      }
    },
  },
  {
    id: "control-a-real-failure-still-reaches-the-error-boundary",
    rule: "A3",
    says: "the same two boundaries, stacked the same way, still route a genuine error to the error fallback — which is what makes the pass-through a statement about NotReady rather than about a boundary that catches nothing",
    async check(kit) {
      const { host, thrown } = await mount(kit)
      if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0].message}`)
      kit.precondition(refuse !== null, "the fetcher never ran")

      refuse?.(new Error("the request failed"))
      await kit.settle()

      if (host.querySelector("span.failed") === null) {
        kit.fail(
          `a genuine failure did not reach the error boundary; the container reads ${reads(host)}`,
        )
      }
    },
  },
]
