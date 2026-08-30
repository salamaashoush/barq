/**
 * `packages/testing` — the framework's own test harness — has the same defect,
 * hand-written, at `packages/testing/src/index.ts:74`:
 *
 * ```ts
 * const wrappedUi: Ui = wrapper ? () => wrapper({ children: ui() }): ui;
 * ```
 *
 * `ui()` is an argument. The component under test is therefore built BEFORE the
 * wrapper is called, and the wrapper's whole purpose is to put something above
 * it — a provider, a router, a store. Its own JSDoc example, four lines up, is
 * a `ThemeProvider` wrapper.
 *
 * So a 445-line shipped package cannot test a context-consuming component, and
 * a user who writes that test watches it fail and concludes their component is
 * wrong. `packages/testing` is a first-class consumer of the calling convention
 * and it is the reason the "one rule across props, context,
 * rows, refs, slot args" has to reach outside `packages/core`.
 *
 * The import is by relative path on purpose: `compiler-rs` does not depend on
 * `@barqjs/testing`, and adding a package dependency so that a regression
 * fixture can resolve is a real edge bought for a test-only reason. Both this
 * file and the compiled module the harness writes sit two directories below the
 * package root, so the one specifier resolves from either.
 *
 * O2, O2.1 and C6.
 */
import { context, useContext } from "@barqjs/core"

import { cleanup, render } from "../../../testing/src/index.ts"
import type { Claim, Kit } from "../../test/semantics-support.ts"
import { formatThrown } from "../../test/semantics-support.ts"

export const rules = ["O2", "O2.1", "C6"]

const Theme = context<string>("light")

export const order: string[] = []

let childrenKind = "not reached"

function Badge() {
  order.push("component-under-test")
  const theme = useContext(Theme)
  return <span class="badge">{() => theme()}</span>
}

function ThemeProvider(props: { children: unknown }) {
  order.push("wrapper")
  return <Theme.Provider value="dark">{props.children as never}</Theme.Provider>
}

function Wrapper(props: { children: unknown }) {
  childrenKind = typeof props.children
  return <ThemeProvider>{props.children}</ThemeProvider>
}

// Both of these are Blocks: `render` invokes the subject with the root scope,
// and `packages/testing` invokes the wrapper with the same one. C2 says a
// component is DECLARED, so they are written as declarations the module lets
// out rather than as anonymous arguments — an arrow in an argument list is
// indistinguishable from a `.map` callback, and the compiler is not allowed to
// guess which one it is looking at.
export const Subject = () => <Badge />

export const ThemeWrapper = (props: { children: unknown }) => (
  <Wrapper>{props.children}</Wrapper>
)

async function mount(kit: Kit) {
  order.length = 0
  childrenKind = "not reached"
  let text = ""
  const thrown = await kit.attempt(() => {
    const result = render(Subject, { wrapper: ThemeWrapper })
    text = result.container.textContent ?? ""
  })
  cleanup()
  return { text, thrown, ran: [...order] }
}

const RAN =
  "neither the wrapper nor the component under test ran, so nothing was observed about their order"

export const claims: Claim[] = [
  {
    id: "the-wrapper-provider-reaches-the-component-under-test",
    rule: "O2",
    says: "a Block runs under the scope it is given, so a render() wrapper's provider is visible to the component it wraps",
    async check(kit) {
      const { text, thrown, ran } = await mount(kit)
      kit.precondition(ran.length > 0, RAN)
      if (text !== "dark") {
        kit.fail(
          `render(() => <Badge />, { wrapper: ThemeProvider }) rendered ${JSON.stringify(text)}, ` +
            `expected "dark" (${formatThrown(thrown)}). packages/testing cannot test a ` +
            `context-consuming component; with no default on the context it throws ` +
            `ContextNotFoundError instead, and the test author reads that as their own bug`,
        )
      }
    },
  },
  {
    id: "the-wrapper-runs-before-the-component-it-wraps",
    rule: "O2.1",
    says: "a component's body executes under the scope of the construct that received it as children, and therefore after it",
    async check(kit) {
      const { ran, thrown } = await mount(kit)
      kit.precondition(ran.length === 2, RAN)
      if (ran[0] !== "wrapper") {
        kit.fail(
          `the bodies ran in the order ${JSON.stringify(ran)}; the wrapper must run first. ` +
            `A wrapper that runs after the thing it wraps is not a wrapper (${formatThrown(thrown)})`,
        )
      }
    },
  },
  {
    id: "the-wrapper-receives-children-as-a-block",
    rule: "C6",
    says: "a slot is Block-valued: what a wrapper receives as `children` is a function taking a scope, never an already-built node",
    async check(kit) {
      const { thrown, ran } = await mount(kit)
      kit.precondition(ran.length > 0, RAN)
      kit.precondition(
        childrenKind !== "not reached",
        "the wrapper never received children at all, so their kind was never sampled",
      )
      if (childrenKind !== "function") {
        kit.fail(
          `the wrapper received children of type ${JSON.stringify(childrenKind)}, expected ` +
            `"function" (${formatThrown(thrown)}). packages/testing/src/index.ts:74 builds the ` +
            `subject and hands over the RESULT, so there is nothing left for the wrapper to defer`,
        )
      }
    },
  },
]
