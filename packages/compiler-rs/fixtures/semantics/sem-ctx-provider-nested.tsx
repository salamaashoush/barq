/**
 * Two providers, one inside the other, and a consumer that reads both — in the
 * direct form.
 *
 * Both contexts carry a default, so nothing throws. The page renders. It
 * renders `outer-default/inner-default`, which is what a user sees when they
 * have written a provider for each value and neither of them does anything at
 * all.
 *
 * SEMANTICS.md §2 O2; §4 X3; §3 C6.
 */
import type { Block } from "@barqjs/core"
import { createContext, render, useContext } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"
import { formatThrown } from "../../test/semantics-support.ts"

export const rules = ["O2", "X3", "C6"]

const Outer = createContext<string>("outer-default")
const Inner = createContext<string>("inner-default")

let leafRuns = 0

const RAN = "Leaf's body never ran, so nothing was observed about what it read"

function Leaf() {
  leafRuns++
  const outer = useContext(Outer)
  const inner = useContext(Inner)
  return <span class="leaf">{() => `${outer()}/${inner()}`}</span>
}

function Direct() {
  return (
    <Outer.Provider value="O">
      <Inner.Provider value="I">
        <Leaf />
      </Inner.Provider>
    </Outer.Provider>
  )
}

function Thunked() {
  return (
    <Outer.Provider value="O">
      {() => <Inner.Provider value="I">{() => <Leaf />}</Inner.Provider>}
    </Outer.Provider>
  )
}

async function mount(kit: Kit, build: Block<unknown>) {
  leafRuns = 0
  const host = kit.container()
  const thrown = await kit.attempt(() => {
    render(build as never, host)
  })
  return { text: host.textContent ?? "", thrown }
}

export const claims: Claim[] = [
  {
    id: "consumer-reads-the-nearest-provider",
    rule: "O2",
    says: "a Block runs under the scope it is given, so the innermost provider's value reaches a direct descendant",
    async check(kit) {
      const { text, thrown } = await mount(kit, () => <Direct />)
      kit.precondition(leafRuns > 0, RAN)
      if (!text.endsWith("/I")) {
        kit.fail(
          `the consumer rendered ${JSON.stringify(text)}; the inner provider's value "I" is not in it ` +
            `(${formatThrown(thrown)}). Leaf was evaluated as an argument to the inner provider's ` +
            `call, so it ran before that provider's scope existed`,
        )
      }
    },
  },
  {
    id: "consumer-reads-through-the-enclosing-provider",
    rule: "X3",
    says: "a context read resolves at read time by walking the scope chain, so an outer provider two levels up is visible",
    async check(kit) {
      const { text, thrown } = await mount(kit, () => <Direct />)
      kit.precondition(leafRuns > 0, RAN)
      if (!text.startsWith("O/")) {
        kit.fail(
          `the consumer rendered ${JSON.stringify(text)}; the outer provider's value "O" is not in it ` +
            `(${formatThrown(thrown)}). Neither provider is on the reading scope's chain, because ` +
            `nesting the JSX nested the CALLS, not the scopes`,
        )
      }
    },
  },
  {
    id: "nesting-jsx-does-not-nest-arguments",
    rule: "C6",
    says: "a JSX-valued children slot lowers to a Block, so nesting providers nests scopes rather than argument evaluation",
    check(kit) {
      kit.precondition(
        /\bProvider\)\(\s*[\w$]+\s*,\s*\{/.test(kit.emitted),
        "the emitted module contains no Provider call, so there is no children slot to inspect",
      )
      const nested = /\bProvider\)\(\s*[\w$]+\s*,\s*\{[\s\S]{0,200}?children:\s*\(0,\s*[\w$]+\.Provider\)\(/.exec(
        kit.emitted,
      )
      if (nested) {
        kit.fail(
          `the emitted outer provider call takes the inner provider's RESULT as its children slot. ` +
            `Argument evaluation is inside-out, so the inner provider runs first, its own children ` +
            `run before that, and the outer scope is created last — the exact reverse of the ` +
            `nesting the source wrote`,
        )
      }
    },
  },
  {
    id: "control-the-thunked-form-still-nests",
    rule: "O2",
    says: "the explicit-thunk workaround nests both providers, so the direct form's failure is attributable to the direct form",
    async check(kit) {
      const { text, thrown } = await mount(kit, () => <Thunked />)
      kit.precondition(leafRuns > 0, "the control never ran Leaf either, so it controls nothing")
      if (text !== "O/I") {
        kit.fail(
          `the explicit-thunk form rendered ${JSON.stringify(text)}, expected "O/I" ` +
            `(${formatThrown(thrown)}). This is the CONTROL for the two claims above`,
        )
      }
    },
  },
]
