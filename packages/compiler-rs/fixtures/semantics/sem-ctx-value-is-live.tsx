/**
 * A provider whose value UPDATES.
 *
 * X2 is the reason a provided value is a `Cell` rather than a snapshot: the
 * consumer re-reads at its own position, so the provider never rebuilds its
 * subtree. That makes node identity across a provider-value change TOTAL, and
 * the identity half is the half nothing in the corpus asserts.
 *
 * The direct form cannot get as far as the question — the consumer never
 * rendered, so there is no node whose survival could be checked. The thunked
 * control does answer it, and it is the assertion M3 has to keep true.
 *
 * SEMANTICS.md §4 X2.
 */
import type { Block } from "@barqjs/core"
import { context, render, signal, useContext } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"
import { formatThrown } from "../../test/semantics-support.ts"

export const rules = ["X2"]

const Locale = context<() => string>()

export const locale = signal("fr")

function Label() {
  const value = useContext(Locale)
  return <span class="label">{() => value()}</span>
}

function Direct() {
  return (
    <Locale.Provider value={() => locale()}>
      <Label />
    </Locale.Provider>
  )
}

function Thunked() {
  return <Locale.Provider value={() => locale()}>{() => <Label />}</Locale.Provider>
}

interface Update {
  first: string
  second: string
  sameNode: boolean
  thrown: string
}

async function drive(kit: Kit, build: Block<unknown>): Promise<Update> {
  locale.set("fr")
  const host = kit.container()
  const thrown = await kit.attempt(() => {
    render(build as never, host)
  })
  const before = host.querySelector(".label")
  const first = before?.textContent ?? ""
  locale.set("nl")
  await kit.settle()
  const after = host.querySelector(".label")
  return {
    first,
    second: after?.textContent ?? "",
    sameNode: before !== null && before === after,
    thrown: formatThrown(thrown),
  }
}

const PROVIDER =
  "the emitted module contains no Provider call, so there was no provider whose value could change"

export const claims: Claim[] = [
  {
    id: "direct-child-sees-the-updated-value",
    rule: "X2",
    says: "the provided value is a Cell, so a consumer sees a new provider value through its own read",
    async check(kit) {
      kit.precondition(/\bProvider\)\(\s*[\w$]+\s*,\s*\{/.test(kit.emitted), PROVIDER)
      const seen = await drive(kit, () => <Direct />)
      if (seen.first !== "fr" || seen.second !== "nl") {
        kit.fail(
          `the consumer rendered ${JSON.stringify(seen.first)} then ${JSON.stringify(seen.second)}, ` +
            `expected "fr" then "nl" (${seen.thrown}). The provider's value is a Cell and the read ` +
            `is live, but the consumer is not under the provider, so neither is observable`,
        )
      }
    },
  },
  {
    id: "direct-child-node-survives-the-update",
    rule: "X2",
    says: "a provider-value change must not re-render its children: every node in the consuming subtree survives",
    async check(kit) {
      kit.precondition(/\bProvider\)\(\s*[\w$]+\s*,\s*\{/.test(kit.emitted), PROVIDER)
      const seen = await drive(kit, () => <Direct />)
      if (!seen.sameNode) {
        kit.fail(
          `the consuming node was not preserved across the provider-value change ` +
            `(before ${JSON.stringify(seen.first)}, after ${JSON.stringify(seen.second)}, ${seen.thrown}). ` +
            `There is no node to preserve: the direct child never rendered, so total node identity ` +
            `across a provider update is not merely unproven here, it is unaskable`,
        )
      }
    },
  },
  {
    id: "control-the-thunked-form-updates-in-place",
    rule: "X2",
    says: "in the workaround form the value updates AND the node is the same object, which is the assertion M3 must keep",
    async check(kit) {
      const seen = await drive(kit, () => <Thunked />)
      kit.precondition(
        seen.first !== "",
        "the control rendered no label at all, so it establishes nothing about node identity",
      )
      if (seen.first !== "fr" || seen.second !== "nl" || !seen.sameNode) {
        kit.fail(
          `the explicit-thunk form rendered ${JSON.stringify(seen.first)} then ${JSON.stringify(seen.second)} ` +
            `with sameNode=${seen.sameNode}, expected "fr" then "nl" with sameNode=true (${seen.thrown}). ` +
            `This is the CONTROL: it is the half of X2 that holds today`,
        )
      }
    },
  },
]
