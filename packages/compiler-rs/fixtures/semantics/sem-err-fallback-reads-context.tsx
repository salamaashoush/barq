/**
 * The case the adversarial prototype proved: a fallback that reads context
 * through the scope chain.
 *
 * This one is not a construction throw. The boundary is written in the
 * workaround form, so it DOES catch — the child throws from an effect and the
 * fallback renders. Only the provider above it is written in the direct form.
 * That is enough: `ErrorBoundary({…})` is evaluated as an argument to
 * `Locale.Provider({…})`, so the boundary — and everything it later builds,
 * including its fallback — was constructed at the provider's call site and has
 * no scope carrying the binding on its chain.
 *
 * The result is a recovery path that cannot use dependency injection. A
 * localised error message, a themed error card, an error reporter taken from
 * context: none of them can be written. What the user sees is that the recovery
 * itself throws.
 *
 * SEMANTICS.md §2 O2; §4 X3.
 */
import type { Block } from "@barqjs/core"
import { createContext, effect, ErrorBoundary, hasContext, getOwner, render, useContext } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"
import { formatThrown } from "../../test/semantics-support.ts"

export const rules = ["O2", "X3"]

const Locale = createContext<string>()

let boundAtFallback: unknown = "not reached"

let raised = 0

const RAISED =
  "the child under test never threw, so no boundary ever recovered and no fallback ever ran"

function Late() {
  effect(() => {
    raised++
    throw new Error("late")
  })
  return <span class="content">content</span>
}

function Fallback() {
  boundAtFallback = hasContext(Locale, getOwner())
  const locale = useContext(Locale)
  return <p class="fb">{() => locale()}</p>
}

function Direct() {
  return (
    <Locale.Provider value="fr">
      <ErrorBoundary fallback={() => <Fallback />}>{() => <Late />}</ErrorBoundary>
    </Locale.Provider>
  )
}

function Thunked() {
  return (
    <Locale.Provider value="fr">
      {() => <ErrorBoundary fallback={() => <Fallback />}>{() => <Late />}</ErrorBoundary>}
    </Locale.Provider>
  )
}

async function mount(kit: Kit, build: Block<unknown>) {
  raised = 0
  boundAtFallback = "not reached"
  const host = kit.container()
  const thrown = await kit.attempt(() => {
    render(build as never, host)
  })
  return { host, thrown, text: host.textContent ?? "" }
}

export const claims: Claim[] = [
  {
    id: "fallback-reads-the-provider-it-is-written-under",
    rule: "O2",
    says: "a Block runs under the scope it is given, so a boundary's fallback can read a provider the boundary is written under",
    async check(kit) {
      const { host, thrown } = await mount(kit, () => <Direct />)
      kit.precondition(raised > 0, RAISED)
      if (host.querySelector(".fb")?.textContent !== "fr") {
        kit.fail(
          `the fallback rendered ${JSON.stringify(host.querySelector(".fb")?.textContent ?? null)}, ` +
            `expected "fr" (${formatThrown(thrown)}). The boundary caught the error correctly and ` +
            `then the RECOVERY threw, because the boundary was built as an argument to the ` +
            `provider's call and never ran under its scope`,
        )
      }
    },
  },
  {
    id: "the-fallback-scope-chain-reaches-the-provider",
    rule: "X3",
    says: "a read resolves at read time by walking the scope chain, so the provider is on the fallback's chain however late the fallback runs",
    async check(kit) {
      await mount(kit, () => <Direct />)
      kit.precondition(raised > 0, RAISED)
      if (boundAtFallback !== true) {
        kit.fail(
          `at the moment the fallback ran, hasContext(Locale, getOwner()) was ` +
            `${String(boundAtFallback)}. X3 makes install-then-read ordering a non-issue — the ` +
            `binding is found by walking, whenever the walk happens — and this shows there is ` +
            `nothing on the chain to find`,
        )
      }
    },
  },
  {
    id: "control-the-thunked-provider-feeds-the-fallback",
    rule: "O2",
    says: "with the provider in the workaround form the fallback reads it, so the failures above are attributable to the direct form",
    async check(kit) {
      const { host, thrown } = await mount(kit, () => <Thunked />)
      kit.precondition(raised > 0, RAISED)
      if (host.querySelector(".fb")?.textContent !== "fr") {
        kit.fail(
          `the explicit-thunk form rendered ` +
            `${JSON.stringify(host.querySelector(".fb")?.textContent ?? null)}, expected "fr" ` +
            `(${formatThrown(thrown)}). This is the CONTROL for the two claims above`,
        )
      }
    },
  },
]
