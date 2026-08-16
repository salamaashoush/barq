/**
 * E2 entry point #6 — a handler that throws routes to the enclosing boundary.
 *
 * A handler is code the FRAMEWORK invoked: it reached the DOM through
 * `onClick={…}` or `on:…={…}`, and the framework is what called it. Before M5 an
 * exception out of one escaped to `window.onerror` with no framework
 * involvement at all — the delegated dispatcher had no `try`, and a
 * non-delegated handler was a bare `addEventListener` with nothing around it.
 * An `Errored` standing directly over the button caught nothing.
 *
 * Both halves are driven, because they are two different registrations: the
 * delegated set routes through the document-level dispatcher, and everything
 * else through the listener the element owns.
 *
 * The third claim is the CONTROL, and it is what makes the first two evidence
 * of ROUTING rather than of a global catch: with two boundaries stacked, the
 * INNER one recovers and the outer keeps its content. A framework that swallowed
 * every handler exception centrally would pass the first two and fail this. It
 * drives the LISTENER half, because a delegated expando needs the document
 * listener the runner tears down between fixtures and a listener the element
 * owns needs nothing at all.
 *
 * SEMANTICS.md §6 E2, E2.2.
 */
import { Errored, render } from "@barqjs/core"
import type { Block } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"

export const rules = ["E2", "E2.2"]

export const Subject = () => <i class="e22">handler-throw</i>

function Boom(): never {
  throw new Error("handler blew up")
}

function Delegated() {
  return (
    <button type="button" class="delegated" onClick={() => Boom()}>
      go
    </button>
  )
}

/** `my-signal` is nothing the document could ever dispatch, so it is a listener. */
function Direct() {
  return (
    <button type="button" class="direct" on:my-signal={() => Boom()}>
      go
    </button>
  )
}

function GuardedDelegated() {
  return <Errored fallback={() => <b class="fb">caught</b>}>{() => <Delegated />}</Errored>
}

function GuardedDirect() {
  return <Errored fallback={() => <b class="fb">caught</b>}>{() => <Direct />}</Errored>
}

function Nested() {
  return (
    <Errored fallback={() => <b class="outer-fb">outer</b>}>
      {() => (
        <div class="outer">
          <em class="sibling">sibling</em>
          <Errored fallback={() => <b class="fb">inner</b>}>
            {() => <Direct />}
          </Errored>
        </div>
      )}
    </Errored>
  )
}

async function mount(kit: Kit, build: Block<unknown>) {
  const host = kit.container()
  const thrown = await kit.attempt(() => {
    render(build as never, host)
  })
  return { host, thrown }
}

async function fire(kit: Kit, host: HTMLElement, selector: string, type: string): Promise<void> {
  const button = host.querySelector(selector)
  if (button === null) kit.fail(`the ${selector} button never rendered`)
  button.dispatchEvent(new Event(type, { bubbles: true }))
  await kit.settle()
}

export const claims: Claim[] = [
  {
    id: "a-delegated-handler-throw-reaches-the-boundary",
    rule: "E2.2",
    says: "an exception out of a delegated handler is routed to the nearest boundary, not to window.onerror",
    async check(kit) {
      const { host, thrown } = await mount(kit, GuardedDelegated as never)
      if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0].message}`)
      await fire(kit, host, "button.delegated", "click")
      if (host.querySelector("b.fb") === null) {
        kit.fail(
          `the boundary over a delegated handler never recovered; the container reads ` +
            `${JSON.stringify(host.textContent)}. E2 says a handler is a routed entry point: the ` +
            "framework called it, so the framework owns its failure",
        )
      }
    },
  },
  {
    id: "a-direct-handler-throw-reaches-the-boundary",
    rule: "E2.2",
    says: "an exception out of a non-delegated listener is routed the same way the delegated one is",
    async check(kit) {
      const { host, thrown } = await mount(kit, GuardedDirect as never)
      if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0].message}`)
      await fire(kit, host, "button.direct", "my-signal")
      if (host.querySelector("b.fb") === null) {
        kit.fail(
          `the boundary over a listener never recovered; the container reads ` +
            `${JSON.stringify(host.textContent)}. A listener registered through the scope is a ` +
            "routed entry point exactly as the delegated set is",
        )
      }
    },
  },
  {
    id: "control-the-nearest-boundary-is-the-one-that-recovers",
    rule: "E2",
    says: "routing is to the NEAREST boundary, so an outer one keeps its content — which is what makes the two claims above evidence of routing rather than of a global catch",
    async check(kit) {
      const { host, thrown } = await mount(kit, Nested as never)
      if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0].message}`)
      await fire(kit, host, "button.direct", "my-signal")
      if (host.querySelector("b.fb") === null) {
        kit.fail(`the inner boundary did not recover: ${JSON.stringify(host.textContent)}`)
      }
      if (host.querySelector("b.outer-fb") !== null || host.querySelector("em.sibling") === null) {
        kit.fail(
          `the OUTER boundary recovered too, so the error was not routed to the nearest one; the ` +
            `container reads ${JSON.stringify(host.textContent)}`,
        )
      }
    },
  },
]
