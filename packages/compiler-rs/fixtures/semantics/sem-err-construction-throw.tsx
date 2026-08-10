/**
 * The second M0 gate. A child that throws while it is being CONSTRUCTED throws
 * at the boundary's call site, before the boundary function has been entered,
 * so the boundary's own `try` can never fire.
 *
 * `Errored({ fallback: …, children: Boom({}) })` — `Boom({})` is an argument.
 * Arguments are evaluated before the callee. There is no boundary yet when it
 * throws, and the throw walks straight out of `render` and kills the page. The
 * same is true of `ErrorBoundary`, of `Loading` and a `NotReadyError`, and of
 * the `Reveal > Loading > Errored` stack that `control-flow-errored-loading`
 * already carries in its workaround form.
 *
 * The last claim is the CONTROL: all four boundaries do catch, in the
 * explicit-thunk form. The boundaries are not broken. The calling convention is.
 *
 * SEMANTICS.md §6 E2.1; §2 O4.4.
 */
import type { Block } from "@barqjs/core"
import {
  ErrorBoundary,
  Errored,
  Loading,
  NotReadyError,
  onCleanup,
  render,
  Reveal,
} from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"
import { formatThrown } from "../../test/semantics-support.ts"

export const rules = ["E2.1", "O4.4"]

export const cleanups: string[] = []

let raised = 0

function Boom(): never {
  raised++
  throw new Error("boom")
}

function Suspending(): never {
  raised++
  throw new NotReadyError()
}

function Tracked() {
  onCleanup(() => cleanups.push("tracked"))
  return <span class="tracked">tracked</span>
}

async function mount(kit: Kit, build: Block<unknown>) {
  raised = 0
  const host = kit.container()
  const thrown = await kit.attempt(() => {
    render(build as never, host)
  })
  return { host, thrown, text: host.textContent ?? "" }
}

/**
 * Nothing raised, so nothing was observed about where a raise goes. A fixture
 * that stopped throwing would otherwise satisfy every claim below by rendering
 * no fallback for a reason that has nothing to do with a boundary.
 */
const THREW = "the child under test never raised, so no boundary was ever given anything to catch"

export const claims: Claim[] = [
  {
    id: "errorboundary-catches-a-direct-child",
    rule: "E2.1",
    says: "a boundary enters its scope, installs its catcher, and THEN invokes the content Block inside a try",
    async check(kit) {
      const { host, thrown } = await mount(kit, () => (
        <ErrorBoundary fallback={() => <p class="fb">caught</p>}>
          <Boom />
        </ErrorBoundary>
      ))
      kit.precondition(raised > 0, THREW)
      if (host.querySelector(".fb") === null) {
        kit.fail(
          `the fallback did not render; ${formatThrown(thrown)} escaped past the boundary and out ` +
            `of render(). The throwing child is a syntactic ARGUMENT of the ErrorBoundary call, ` +
            `so it ran before the boundary existed`,
        )
      }
    },
  },
  {
    id: "errored-catches-a-direct-child",
    rule: "E2.1",
    says: "the same, for Errored — the boundary is entered before its content Block is invoked",
    async check(kit) {
      const { host, thrown } = await mount(kit, () => (
        <Errored fallback={() => <p class="fb">caught</p>}>
          <Boom />
        </Errored>
      ))
      kit.precondition(raised > 0, THREW)
      if (host.querySelector(".fb") === null) {
        kit.fail(
          `the fallback did not render; ${formatThrown(thrown)} escaped past the boundary and out ` +
            `of render()`,
        )
      }
    },
  },
  {
    id: "loading-catches-a-direct-suspending-child",
    rule: "E2.1",
    says: "a NotReadyError raised while constructing a direct child reaches the enclosing Loading boundary",
    async check(kit) {
      const { host, thrown } = await mount(kit, () => (
        <Loading fallback={<span class="busy">busy</span>}>
          <Suspending />
        </Loading>
      ))
      kit.precondition(raised > 0, THREW)
      if (host.querySelector(".busy") === null) {
        kit.fail(
          `the loading fallback did not render; ${formatThrown(thrown)} escaped past the boundary ` +
            `and out of render(). Suspending during construction is the ordinary case — it is what ` +
            `every async component does on its first frame`,
        )
      }
    },
  },
  {
    id: "reveal-loading-errored-stack-catches",
    rule: "E2.1",
    says: "a stack of Reveal, Loading and Errored, written in the natural shape, still routes a construction throw to the innermost boundary",
    async check(kit) {
      const { host, thrown } = await mount(kit, () => (
        <Reveal order="together">
          <Loading fallback={<span class="busy">busy</span>}>
            <Errored fallback={() => <p class="fb">caught</p>}>
              <Boom />
            </Errored>
          </Loading>
        </Reveal>
      ))
      kit.precondition(raised > 0, THREW)
      if (host.querySelector(".fb") === null) {
        kit.fail(
          `none of the three boundaries saw the throw; ${formatThrown(thrown)} escaped all of them ` +
            `and out of render(). This is control-flow-errored-loading.tsx with its {() => …} ` +
            `wrappers removed, and removing them is the only difference`,
        )
      }
    },
  },
  {
    id: "the-failed-subtree-is-disposed-not-abandoned",
    rule: "O4.4",
    says: "on the exceptional path every scope entered and not yet exited is DISPOSED, so a half-built subtree runs its cleanups",
    async check(kit) {
      cleanups.length = 0
      const { thrown } = await mount(kit, () => (
        <ErrorBoundary fallback={() => <p class="fb">caught</p>}>
          <Tracked />
          <Boom />
        </ErrorBoundary>
      ))
      kit.precondition(raised > 0, THREW)
      if (cleanups.length !== 1) {
        kit.fail(
          `the sibling that was built before the throw registered a cleanup and it ran ` +
            `${cleanups.length} times, expected 1 (${formatThrown(thrown)}). Its subtree was ` +
            `abandoned rather than disposed: no scope owned it, so nothing had the standing to ` +
            `unwind it`,
        )
      }
    },
  },
  {
    id: "control-the-thunked-form-is-caught",
    rule: "E2.1",
    says: "all four boundaries catch in the explicit-thunk form, so the failures above are attributable to the direct form",
    async check(kit) {
      cleanups.length = 0
      const { host, thrown } = await mount(kit, () => (
        <div>
          <ErrorBoundary fallback={() => <p class="eb">eb</p>}>{() => <Boom />}</ErrorBoundary>
          <Errored fallback={() => <p class="er">er</p>}>{() => <Boom />}</Errored>
          <Loading fallback={<span class="ld">ld</span>}>{() => <Suspending />}</Loading>
          <ErrorBoundary fallback={() => <p class="cl">cl</p>}>
            {() => [<Tracked />, <Boom />]}
          </ErrorBoundary>
        </div>
      ))
      kit.precondition(raised > 0, THREW)
      const missing = [".eb", ".er", ".ld", ".cl"].filter((s) => host.querySelector(s) === null)
      if (missing.length > 0 || cleanups.length !== 1) {
        kit.fail(
          `the explicit-thunk form did not recover: missing ${JSON.stringify(missing)}, ` +
            `cleanups ran ${cleanups.length} times (${formatThrown(thrown)}). This is the CONTROL — ` +
            `the boundaries themselves work, and the claims above are only evidence while it holds`,
        )
      }
    },
  },
]
