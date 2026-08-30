/**
 * `<ThemeProvider><Label/></ThemeProvider>` — the provider bug in the shape
 * every application actually has it.
 *
 * `sem-ctx-provider-direct-child.tsx` writes `<Ctx.Provider>` and its child on
 * adjacent lines, which is the shape that makes the defect explainable. It is
 * not the shape anybody writes. What people write is a wrapper — `AuthProvider`,
 * `QueryClientProvider`, `StoreProvider`, `ThemeProvider` — a component whose
 * body is `<Ctx.Provider value={…}>{props.children}</Ctx.Provider>` and whose
 * call site is a plain element with children.
 *
 * That distance is the whole point. The thunk that works around O2 has to be
 * written at the CALL SITE of a component whose body the author is not looking
 * at, and nothing at the call site suggests one is needed. A reviewer reading
 * `<ThemeProvider><Label/></ThemeProvider>` sees no provider at all.
 *
 * This fixture is a gate because it is what the L2b channel was blind to as
 * well: its static tree attributed a call site's children to the call site,
 * which is exactly where the runtime wrongly builds them, so the compiler's
 * expected value agreed with the runtime's defect and the comparison reported
 * nothing. A component owns nothing (O1), so forwarding children through one
 * cannot move ownership to it.
 *
 * O1, O2, O2.1 and X1;.
 */
import type { Block } from "@barqjs/core"
import { context, getOwner, hasContext, render, useContext } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"
import { formatThrown } from "../../test/semantics-support.ts"

export const rules = ["O2", "O2.1", "X1"]

const Theme = context<string>("fallback-theme")

let labelRuns = 0
let ownerAtBody: unknown = "not reached"
let boundAtBody: unknown = "not reached"

const RAN =
  "Label's body never ran, so nothing was observed about the scope it ran under. A fixture with " +
  "no wrapped child fails these claims for a reason that is not about ownership"

function Label() {
  labelRuns++
  ownerAtBody = getOwner()
  boundAtBody = hasContext(Theme, getOwner())
  const theme = useContext(Theme)
  return <span class="label">{() => theme()}</span>
}

function ThemeProvider(props: { children: unknown }) {
  return <Theme.Provider value="provided-theme">{props.children as never}</Theme.Provider>
}

function Direct() {
  return (
    <div>
      <ThemeProvider>
        <Label />
      </ThemeProvider>
    </div>
  )
}

function Thunked() {
  return (
    <div>
      <ThemeProvider>{() => <Label />}</ThemeProvider>
    </div>
  )
}

async function mount(kit: Kit, build: Block<unknown>) {
  labelRuns = 0
  ownerAtBody = "not reached"
  boundAtBody = "not reached"
  const host = kit.container()
  const thrown = await kit.attempt(() => {
    render(build as never, host)
  })
  return { host, thrown, text: host.textContent ?? "" }
}

export const claims: Claim[] = [
  {
    id: "a-wrapped-child-reads-the-wrappers-provided-value",
    rule: "O2",
    says: "a Block runs under the scope it is given, so children forwarded through a wrapper reach the provider the wrapper hands them to",
    async check(kit) {
      const { text, thrown } = await mount(kit, () => <Direct />)
      kit.precondition(labelRuns > 0, RAN)
      if (text !== "provided-theme") {
        kit.fail(
          `<ThemeProvider><Label/></ThemeProvider> rendered ${JSON.stringify(text)}, expected ` +
            `"provided-theme" (${formatThrown(thrown)}). The context carries a default, so nothing ` +
            `throws and the page looks right: the wrapper is not broken, it is INDISTINGUISHABLE ` +
            `from not having been written`,
        )
      }
    },
  },
  {
    id: "the-forwarded-child-runs-under-the-inner-providers-scope",
    rule: "O2.1",
    says: "a component owns nothing, so children forwarded through one are owned by the construct it forwards them to",
    async check(kit) {
      await mount(kit, () => <Direct />)
      kit.precondition(labelRuns > 0, RAN)
      if (boundAtBody !== true) {
        kit.fail(
          `at the moment Label's body ran, the Theme binding was absent from its owner ` +
            `(hasContext returned ${String(boundAtBody)}, getOwner() was ` +
            `${ownerAtBody === null ? "null" : "a scope that does not carry it"}). Label was built ` +
            `as an argument at ThemeProvider's CALL SITE, one component away from the provider ` +
            `that was supposed to own it`,
        )
      }
    },
  },
  {
    id: "the-binding-is-installed-before-a-forwarded-child-runs",
    rule: "X1",
    says: "provide enters the scope, forks the record and writes the value BEFORE invoking the block, however many components the block travelled through",
    async check(kit) {
      await mount(kit, () => <Direct />)
      kit.precondition(labelRuns > 0, RAN)
      if (ownerAtBody === null) {
        kit.fail(
          `getOwner() inside Label's body was null, so the body ran under no scope at all. ` +
            `The ordering X1 requires is enter → fork → write → invoke; here the invoke happened ` +
            `at a call site two constructs above the enter`,
        )
      }
    },
  },
  {
    id: "control-the-thunked-call-site-still-works",
    rule: "O2",
    says: "the explicit-thunk workaround, written at the wrapper's call site, reads the provided value",
    async check(kit) {
      const { text, thrown } = await mount(kit, () => <Thunked />)
      kit.precondition(labelRuns > 0, "the control never ran Label either, so it controls nothing")
      if (text !== "provided-theme") {
        kit.fail(
          `the explicit-thunk form rendered ${JSON.stringify(text)}, expected "provided-theme" ` +
            `(${formatThrown(thrown)}). This is the CONTROL: the failures above are evidence about ` +
            `the direct call site only while it holds — and note that the fix has to be written ` +
            `HERE, at a call site whose component body gives no sign that it is needed`,
        )
      }
    },
  },
]
