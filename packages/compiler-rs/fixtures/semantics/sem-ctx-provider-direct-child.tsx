/**
 * `<Ctx.Provider value={…}><Child/></Ctx.Provider>` — the shape the whole
 * redesign exists for, written the way a user writes it.
 *
 * The corpus already has `context-provider.tsx`, and it passes. It is written
 * `<Theme.Provider value={…}>{() => <Badge />}</Theme.Provider>`, which is the
 * hand-written workaround for this exact defect — the same workaround
 * `packages/extra/src/router.tsx:1766` carries with the author's own comment
 * next to it. 117 fixtures missed the bug because every one of them is written
 * that way. This one is not.
 *
 * SEMANTICS.md §2 O2, O2.1; §4 X1; §3 C6.
 */
import { context, getOwner, hasContext, render, signal, useContext } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"
import { formatThrown } from "../../test/semantics-support.ts"

export const rules = ["O2", "O2.1", "X1", "C6"]

const Ctx = context<() => string>()

const provided = signal("provided")

let ownerAtBody: unknown = "not reached"
let boundAtBody: unknown = "not reached"
let childRuns = 0

function Child() {
  childRuns++
  ownerAtBody = getOwner()
  boundAtBody = hasContext(Ctx, getOwner())
  const value = useContext(Ctx)
  return <span class="child">{() => value()}</span>
}

function Direct() {
  return (
    <div>
      <Ctx.Provider value={() => provided()}>
        <Child />
      </Ctx.Provider>
    </div>
  )
}

function Thunked() {
  return (
    <div>
      <Ctx.Provider value={() => provided()}>{() => <Child />}</Ctx.Provider>
    </div>
  )
}

async function mountDirect(kit: Kit) {
  ownerAtBody = "not reached"
  boundAtBody = "not reached"
  childRuns = 0
  const host = kit.container()
  const thrown = await kit.attempt(() => {
    render(<Direct />, host)
  })
  return { host, thrown }
}

export const claims: Claim[] = [
  {
    id: "direct-child-reads-the-provided-value",
    rule: "O2",
    says: "a Block runs under the scope it is given, so a direct child of a Provider reads the provided value",
    async check(kit) {
      const { host, thrown } = await mountDirect(kit)
      kit.precondition(
        childRuns > 0,
        "Child's body never ran, so nothing was observed about the value it read. A fixture that " +
          "no longer contains a Provider with a Child under it fails this claim for a reason that " +
          "is not about O2",
      )
      if (host.textContent !== "provided") {
        kit.fail(
          `<Ctx.Provider value={…}><Child/></Ctx.Provider> rendered ${JSON.stringify(host.textContent)}, ` +
            `expected "provided" (${formatThrown(thrown)}). ` +
            `Child ran at the Provider's call site, under the caller's owner, before the Provider's ` +
            `instance scope existed`,
        )
      }
    },
  },
  {
    id: "child-body-runs-under-a-scope",
    rule: "O2.1",
    says: "a component's body executes while the current scope is the scope of the construct that received it as children",
    async check(kit) {
      await mountDirect(kit)
      kit.precondition(
        childRuns > 0,
        "Child's body never ran, so `getOwner()` inside it was never sampled. Absence of an owner " +
          "and absence of a body are different observations and only one of them is about O2.1",
      )
      if (ownerAtBody === null) {
        kit.fail(
          `getOwner() inside Child's body was ${ownerAtBody === null ? "null" : String(ownerAtBody)}; ` +
            `it must be the Provider's instance scope. The body executed at the call site, ` +
            `where that scope does not exist yet`,
        )
      }
    },
  },
  {
    id: "the-binding-is-installed-before-the-child-runs",
    rule: "X1",
    says: "provide enters the scope, forks the record and writes the value BEFORE invoking the block",
    async check(kit) {
      await mountDirect(kit)
      kit.precondition(
        childRuns > 0,
        "Child's body never ran, so `hasContext` was never called at the moment X1 is about",
      )
      if (boundAtBody !== true) {
        kit.fail(
          `at the moment Child's body ran, the context binding was ${boundAtBody === false ? "absent from" : "unobservable on"} ` +
            `its owner (hasContext returned ${String(boundAtBody)}). ` +
            `The ordering required is enter → fork → write → invoke; the write had not happened`,
        )
      }
    },
  },
  {
    id: "the-children-slot-is-a-block",
    rule: "C6",
    says: "JSX children lower to a Block — a function taking the scope — never to a built node",
    check(kit) {
      kit.precondition(
        /\bProvider\)\(\s*[\w$]+\s*,\s*\{/.test(kit.emitted),
        "the emitted module contains no Provider call at all, so there is no children slot to " +
          "inspect and this claim would pass for a fixture that renders nothing",
      )
      const call = /\bProvider\)\(\s*[\w$]+\s*,\s*\{[\s\S]{0,200}?children:\s*([A-Za-z_$][\w$]*)\(/.exec(kit.emitted)
      // §3.0 rule 3's brand is the ONE call that leaves the slot deferred: it
      // marks the function in place and hands it back. Every other call in this
      // position has already produced a node.
      if (call && !/block$/.test(call[1])) {
        kit.fail(
          `the emitted Provider call passes an ALREADY-INVOKED child in its children slot ` +
            `(the slot's value is a call to ${call[1]}). A built node in a children slot is ` +
            `O2's negation written down: the argument is evaluated before the callee runs`,
        )
      }
    },
  },
  {
    id: "control-the-thunked-form-still-works",
    rule: "O2",
    says: "the explicit-thunk workaround reads the provided value, so the direct form's failure is attributable to the direct form",
    async check(kit) {
      childRuns = 0
      const host = kit.container()
      const thrown = await kit.attempt(() => {
        render(<Thunked />, host)
      })
      kit.precondition(childRuns > 0, "the control never ran Child either, so it controls nothing")
      if (host.textContent !== "provided") {
        kit.fail(
          `the explicit-thunk form rendered ${JSON.stringify(host.textContent)}, expected "provided" ` +
            `(${formatThrown(thrown)}). This is the CONTROL: it holds today, and the direct form's ` +
            `failure is only evidence about the direct form while it does`,
        )
      }
    },
  },
]
