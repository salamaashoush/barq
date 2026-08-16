/**
 * The dangerous variant: a provider whose context has a DEFAULT.
 *
 * `sem-ctx-provider-direct-child` throws `ContextNotFoundError` and the page
 * goes blank, which at least announces itself. This one raises nothing. The
 * page renders, every element is in place, and the value is the default — so
 * the provider is not merely broken, it is INDISTINGUISHABLE from not being
 * written at all. A theme provider silently serving the light theme, a locale
 * provider silently serving English, and a test suite that is green.
 *
 * SEMANTICS.md §2 O2; §4 X3.
 */
import type { Block } from "@barqjs/core"
import { context, render, useContext } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"
import { formatThrown } from "../../test/semantics-support.ts"

export const rules = ["O2", "X3"]

const Theme = context<string>("light")

function Badge() {
  const theme = useContext(Theme)
  return <span class="badge">{() => theme()}</span>
}

function Direct() {
  return (
    <div>
      <Theme.Provider value="dark">
        <Badge />
      </Theme.Provider>
      <Badge />
    </div>
  )
}

function Thunked() {
  return (
    <div>
      <Theme.Provider value="dark">{() => <Badge />}</Theme.Provider>
      <Badge />
    </div>
  )
}

async function mount(kit: Kit, build: Block<unknown>) {
  const host = kit.container()
  const thrown = await kit.attempt(() => {
    render(build as never, host)
  })
  const badges = [...host.querySelectorAll(".badge")].map((n) => n.textContent ?? "")
  return { badges, thrown, text: host.textContent ?? "" }
}

const TWO = "the fixture did not render two badges, so there was no pair to compare"

export const claims: Claim[] = [
  {
    id: "the-provided-value-wins-over-the-default",
    rule: "O2",
    says: "a Block runs under the scope it is given, so a provided value shadows the context's default",
    async check(kit) {
      const { badges, thrown, text } = await mount(kit, () => <Direct />)
      kit.precondition(badges.length === 2, TWO)
      if (badges[0] !== "dark") {
        kit.fail(
          `the badge inside <Theme.Provider value="dark"> rendered ${JSON.stringify(badges[0] ?? text)}, ` +
            `expected "dark" (${formatThrown(thrown)}). Nothing threw and nothing was logged — ` +
            `the default made the failure silent`,
        )
      }
    },
  },
  {
    id: "the-provider-has-an-observable-effect",
    rule: "X3",
    says: "a read resolves through the scope chain at read time, so a consumer inside a provider must differ from one outside it",
    async check(kit) {
      const { badges, thrown } = await mount(kit, () => <Direct />)
      kit.precondition(badges.length === 2, TWO)
      if (badges[0] === badges[1]) {
        kit.fail(
          `the badge inside the provider and the badge outside it both rendered ` +
            `${JSON.stringify(badges[0])} (${formatThrown(thrown)}). The provider is not on the ` +
            `reading scope's chain, so writing it changes nothing a user or a test can see`,
        )
      }
    },
  },
  {
    id: "control-the-thunked-form-shadows-the-default",
    rule: "O2",
    says: "the explicit-thunk workaround shadows the default, so the direct form's failure is attributable to the direct form",
    async check(kit) {
      const { badges, thrown } = await mount(kit, () => <Thunked />)
      kit.precondition(badges.length === 2, TWO)
      if (badges[0] !== "dark" || badges[1] !== "light") {
        kit.fail(
          `the explicit-thunk form rendered ${JSON.stringify(badges)}, expected ["dark","light"] ` +
            `(${formatThrown(thrown)}). This is the CONTROL for the two claims above`,
        )
      }
    },
  },
]
