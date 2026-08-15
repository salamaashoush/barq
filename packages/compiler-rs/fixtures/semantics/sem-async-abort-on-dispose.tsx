/**
 * A1 — cancellation is structural.
 *
 * The `AbortController` is a cleanup on the scope that created the resource:
 * disposing that scope aborts the request, a re-run aborts the one it
 * supersedes, and — the half that made the rule worth writing — the signal is
 * actually HANDED TO THE FETCHER. Before M7 a controller was created inside
 * `load()` and never passed anywhere, so "abort" meant "ignore the answer": the
 * socket stayed open, the server kept working, and a request outlived the page
 * that wanted it. That is the exact shape the leak oracle exists to catch and
 * it could not see it, because nothing about it was reachable from a scope.
 *
 * The last claim is the CONTROL. A fixture that only ever asserts `aborted` is
 * satisfied by a framework that aborts everything the moment it is created, and
 * that framework would pass the first three.
 *
 * SEMANTICS.md §10 A1.
 */
import { render, resource, signal } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"

export const rules = ["A1"]

export const key = signal(1)

let handed: AbortSignal[] = []
let calls = 0
let settleNext: ((value: string) => void) | null = null
let previous: (() => void) | null = null

function reset(): void {
  // Every mount is torn down before the next one, or the resources of earlier
  // claims are still subscribed to `key` and answer a source change meant for
  // this one.
  previous?.()
  previous = null
  handed = []
  calls = 0
  settleNext = null
  key.set(1)
}

function Panel() {
  const data = resource(
    () => key(),
    (_source, info) => {
      handed.push(info.signal)
      calls++
      // A request that never answers on its own, so only cancellation ends it.
      return new Promise<string>(() => {})
    },
  )
  return <i class="panel">{() => data.state()}</i>
}

function Settling() {
  const data = resource(
    () => key(),
    (_source, info) => {
      handed.push(info.signal)
      calls++
      return new Promise<string>((resolve) => {
        settleNext = resolve
      })
    },
  )
  return <i class="settling">{() => data.state()}</i>
}

async function mount(kit: Kit, which: "open" | "settling") {
  reset()
  const host = kit.container()
  let dispose: (() => void) | undefined
  const thrown = await kit.attempt(() => {
    dispose = which === "open" ? render(() => <Panel />, host) : render(() => <Settling />, host)
  })
  previous = dispose ?? null
  return { host, thrown, dispose }
}

export const claims: Claim[] = [
  {
    id: "the-fetcher-is-handed-the-signal",
    rule: "A1",
    says: "the fetcher receives the AbortSignal, so a cancellation reaches the request rather than only the answer",
    async check(kit) {
      const { thrown } = await mount(kit, "open")
      if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0].message}`)
      kit.precondition(
        calls === 1,
        `the fetcher ran ${calls} times, so this claim would be observing an absence`,
      )
      if (!(handed[0] instanceof AbortSignal)) {
        kit.fail(
          `the fetcher was handed ${String(handed[0])} where A1 requires an AbortSignal. A ` +
            "controller the runtime creates and keeps to itself cancels nothing; it only decides " +
            "which answer to believe",
        )
      }
      if (handed[0].aborted) {
        kit.fail("the signal arrived already aborted, so nothing was ever in flight")
      }
    },
  },
  {
    id: "disposing-the-owning-scope-aborts-the-request",
    rule: "A1",
    says: "the request dies with the scope that owns it, cancelled rather than ignored",
    async check(kit) {
      const { dispose } = await mount(kit, "open")
      kit.precondition(handed.length === 1, `${handed.length} requests were issued, expected 1`)
      kit.precondition(!handed[0].aborted, "the request was already cancelled before disposal")

      dispose?.()
      await kit.settle()

      if (!handed[0].aborted) {
        kit.fail(
          "the render root was disposed and the in-flight request is still open. A1 makes the " +
            "controller a cleanup on the creating scope: the act that kills the scope is the act " +
            "that kills the request",
        )
      }
    },
  },
  {
    id: "a-re-run-aborts-the-request-it-supersedes",
    rule: "A1",
    says: "issuing a new request cancels the previous one instead of leaving it running to be discarded on arrival",
    async check(kit) {
      await mount(kit, "open")
      kit.precondition(handed.length === 1, `${handed.length} requests were issued, expected 1`)

      key.set(2)
      await kit.settle()

      kit.precondition(
        handed.length === 2,
        `changing the source issued ${handed.length} requests in total, expected 2`,
      )
      if (!handed[0].aborted) {
        kit.fail("a second request was issued and the first is still open")
      }
      if (handed[1].aborted) {
        kit.fail("the request that was just issued arrived aborted")
      }
    },
  },
  {
    id: "control-a-settled-request-is-not-aborted-by-a-later-disposal",
    rule: "A1",
    says: "only an IN-FLIGHT request is cancelled — which is what makes the three claims above evidence of cancellation rather than of a controller that is always aborted",
    async check(kit) {
      const { dispose } = await mount(kit, "settling")
      kit.precondition(handed.length === 1, `${handed.length} requests were issued, expected 1`)

      settleNext?.("answered")
      await kit.settle()

      dispose?.()
      await kit.settle()

      if (handed[0].aborted) {
        kit.fail(
          "a request that had already answered was aborted when its scope died, so `aborted` " +
            "carries no information about whether anything was cancelled",
        )
      }
    },
  },
]
