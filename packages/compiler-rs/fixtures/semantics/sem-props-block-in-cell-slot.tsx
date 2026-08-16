/**
 * C3.8's negative test, driven through the whole Cell-slot surface rather than
 * through the one call site that happened to ask.
 *
 * The rule is that a Block invoked with no scope THROWS and never falls back to
 * `CURRENT`. Before this fixture, that was a check inside `setProp` — so six of
 * the seven Cell slots on the primitive surface (`branch`'s key, `each`'s
 * source, `portal`'s target, `boundary`'s `on`, a spread's members, a provider's
 * value) invoked a branded Block with `s === undefined` and let it run, and
 * every ambient read inside it resolved against whatever scope happened to be
 * current. That is the Provider bug at the one place §3.0 says nobody would look
 * for it, so the claim below drives every slot and not a representative one.
 *
 * C3.9's half is the compiler's: a Block forwarded out of a rest-destructured
 * props binding must still be a Block. `{ children: () => children }` — a Cell
 * wrapping a Block — is not, and the laundered value walks past a brand test
 * because the wrapper carries no brand.
 *
 * Three more slots were added in the M2 gate round, and they are the two
 * positions where `block`'s entry guard CANNOT fire: `ref` invokes its value
 * with the ELEMENT and an event handler with the EVENT, so `scope === undefined`
 * is never true, `requireScope` accepts a DOM node, and everything the Block
 * builds is parented to something root disposal never reaches. Measured as a
 * leak that survives the root. The guard is the wrong place for the test; the
 * brand is a property of the VALUE, so `applyRefs`, `listen`, `delegate` and the
 * delegated dispatcher each test it where they read. The dispatcher is not
 * redundant with the other three: the compiled path writes `_el$1.$$click = h`
 * itself and never calls `delegate`.
 *
 * SEMANTICS.md §3 C3.6, C3.7, C3.8, C3.9, C5.1.
 */
import { block, delegate, dispose, enterRoot, exit, isBlock, listen, pin, ref, render, setProp } from "@barqjs/core"
import { branch, boundary, each, onCleanup, portal, provide, context, useContext } from "@barqjs/core"
import type { Scope } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"

export const rules = ["C3.6", "C3.7", "C3.8", "C3.9", "C5.1", "O2"]

/** What a Block that fell back to the ambient owner would leave behind. */
let ranWithoutScope = 0

/** A branded Block: it declares it needs the scope it is handed. */
const needsScope = block((s: Scope | null) => {
  if (s === undefined) ranWithoutScope++
  return document.createTextNode("built")
})

/**
 * The three shapes a Block reaches a Cell slot in, because C3.8 is a property of
 * the VALUE and a fixture that drives only the guarded one measures the guard
 * rather than the rule.
 *
 * - `guarded` is `block()`'s: branded AND carrying an entry guard of its own.
 * - `pinned` is `pin()`'s: branded and deliberately UNGUARDED, because `pin`
 *   promises the handed scope is ignored including when there is none. Nothing
 *   but a slot's own test can stop it, and four of the six slots had none.
 * - `laundered` is a Cell that YIELDS a Block: an uncompiled caller wrapping a
 *   forwarded prop in `() => x` produces one, and it carries no brand at all, so
 *   the value test walks past it and only a test on the READ can see it.
 */
type Shape = "guarded" | "pinned" | "laundered"

/** A Cell in a Block slot: arity-tolerant, so `cell($s)` and `cell()` agree (C3.6). */
const arityTolerant = () => "tolerated"

const Theme = context<string>("default")

interface Slotted extends Record<string, unknown> {
  thing: () => unknown
}

/** The laundering shape: destructure the props record, then forward the names. */
function Sink(props: Slotted) {
  return <i class="sink">{props.thing as never}</i>
}

function Mid(props: Slotted) {
  const { thing, ...rest } = props
  return <Sink {...rest} thing={thing} />
}

function Tree() {
  return (
    <div class="host">
      <Mid thing={(<b class="leaf">leaf</b>) as never} />
    </div>
  )
}

export const Subject = () => <Tree />

/**
 * Every Cell slot on the primitive surface, each driven with the same Block.
 *
 * Each runs under a root of its own, opened and disposed around the drive: a
 * construct half-built by a throw leaves an effect behind, and one left
 * ownerless outlives this fixture and reaches whatever renders next.
 */
function slots(carrier: () => unknown): Array<{ name: string; drive: (s: Scope) => void }> {
  const parent = document.createElement("div")
  const needsScope = carrier() as never
  return [
    {
      name: "setProp value",
      drive: (s) => setProp(s, document.createElement("div"), "id", needsScope as never),
    },
    {
      name: "branch key",
      drive: (s) => void branch(s, parent, null, needsScope as never, [() => null]),
    },
    {
      name: "each source",
      drive: (s) => void each(s, parent, null, needsScope as never, null, () => null),
    },
    {
      name: "portal target",
      drive: (s) => void portal(s, needsScope as never, () => null),
    },
    {
      name: "boundary on",
      drive: (s) =>
        void boundary(s, parent, null, "loading", null, () => null, 0, needsScope as never),
    },
    {
      name: "provide value",
      drive: (s) => provide(s, Theme, needsScope as never, () => null),
    },
    // The two slots where `block`'s entry guard is structurally unreachable,
    // because the value is invoked with something that is NOT `undefined`.
    // `ref` hands it the Element and a handler hands it the Event, so
    // `requireScope` accepts, the body runs, and its subtree is parented to a
    // DOM node that root disposal never reaches. Only a test on the VALUE, at
    // the read, can answer here — which is what C3.8 says the rule is.
    {
      name: "ref value",
      drive: (s) => ref(s, document.createElement("div"), needsScope as never),
    },
    {
      name: "delegated handler value",
      drive: (s) => delegate(s, document.createElement("div"), "click", needsScope as never),
    },
    {
      name: "direct listener value",
      drive: (s) => listen(s, document.createElement("div"), "scroll", needsScope as never),
    },
  ]
}

export const claims: Claim[] = [
  {
    id: "a-block-in-every-cell-slot-throws",
    rule: "C3.8",
    says: "a Block invoked without a scope throws ScopeMissingError at every Cell slot, and never falls back to the ambient owner",
    async check(kit) {
      ranWithoutScope = 0
      const surviving: string[] = []
      const wrong: string[] = []
      const cases = slots(() => needsScope)
      kit.precondition(cases.length >= 6, "the slot list is empty, so nothing was driven")
      for (const slot of cases) {
        let thrown: unknown = null
        const root = enterRoot()
        try {
          slot.drive(root)
        } catch (error) {
          thrown = error
        } finally {
          exit(root)
          dispose(root)
        }
        await kit.settle()
        if (thrown === null) {
          surviving.push(slot.name)
        } else if ((thrown as Error).name !== "ScopeMissingError") {
          wrong.push(`${slot.name} -> ${(thrown as Error).name}`)
        }
      }
      if (surviving.length > 0 || wrong.length > 0 || ranWithoutScope > 0) {
        kit.fail(
          `${surviving.length} of ${cases.length} Cell slots invoked a branded Block and did not ` +
            `throw (${surviving.join(", ") || "none"}); ${wrong.length} threw something else ` +
            `(${wrong.join(", ") || "none"}); the Block observed s === undefined ` +
            `${ranWithoutScope} time(s). C3.8 is a property of the Block, not of a call site`,
        )
      }
    },
  },
  {
    id: "every-shape-of-block-throws-at-every-cell-slot",
    rule: "C3.8",
    says: "C3.8 is a property of the VALUE: a pinned Block and a laundered Cell-yielding-a-Block reach the same nine slots and get the same answer as a guarded one",
    async check(kit) {
      const home = enterRoot()
      exit(home)
      const carriers: Record<Shape, () => unknown> = {
        guarded: () => needsScope,
        pinned: () =>
          pin(home, (owner: Scope) => {
            void owner
            return document.createTextNode("pinned")
          }),
        laundered: () => () => needsScope,
      }
      const surviving: string[] = []
      let driven = 0
      try {
        for (const shape of ["pinned", "laundered"] as const) {
          const cases = slots(carriers[shape])
          kit.precondition(cases.length >= 6, "the slot list is empty, so nothing was driven")
          for (const slot of cases) {
            driven++
            let thrown: unknown = null
            const root = enterRoot()
            try {
              slot.drive(root)
            } catch (error) {
              thrown = error
            } finally {
              exit(root)
              dispose(root)
            }
            await kit.settle()
            if (thrown === null || (thrown as Error).name !== "ScopeMissingError") {
              surviving.push(`${shape}/${slot.name}`)
            }
          }
        }
      } finally {
        dispose(home)
      }
      kit.precondition(driven === 18, `only ${driven} of the 18 (shape, slot) pairs were driven`)
      if (surviving.length > 0) {
        kit.fail(
          `${surviving.length} of ${driven} (shape, slot) pairs took a Block and did not throw: ` +
            `${surviving.join(", ")}. C3.8 is a property of the Block, not of a call site — a ` +
            `\`pin()\`ned Block is branded and deliberately unguarded, so only the slot's own test ` +
            `can stop it, and a laundered \`() => aBlock\` carries no brand at all and is visible ` +
            `only on the READ`,
        )
      }
    },
  },
  {
    id: "a-pinned-block-ignores-the-scope-it-is-handed",
    rule: "O2",
    says: "O2's one sanctioned escape hatch is total: a pinned Block's cleanups and effects belong to the PINNED scope even when it is handed a different live one",
    async check(kit) {
      const home = enterRoot()
      exit(home)
      const other = enterRoot()
      exit(other)
      const filed: string[] = []
      const pinned = pin(home, (owner: Scope) => {
        void owner
        onCleanup(() => filed.push("pinned"))
        return document.createTextNode("pinned")
      })
      ;(pinned as unknown as (s?: Scope | null) => unknown)(other)
      await kit.settle()

      dispose(other)
      await kit.settle()
      const afterOther = filed.length
      dispose(home)
      await kit.settle()

      if (afterOther !== 0 || filed.length !== 1) {
        kit.fail(
          `a pinned Block was handed a live scope OTHER than the one it was pinned to. Disposing ` +
            `that scope ran ${afterOther} of its cleanups (expected 0) and disposing the pinned ` +
            `scope ran ${filed.length - afterOther} (expected 1). \`pin\` promises the handed scope ` +
            `is ignored — forwarding it is the shape in which a pinned Block silently rejoins the ` +
            `caller's tree, and the pinned shape driven at every slot below cannot see it`,
        )
      }
    },
  },
  {
    id: "a-block-invoked-with-undefined-never-runs-under-the-ambient-scope",
    rule: "C3.8",
    says: "the refusal is `block`'s own entry guard and not a downstream stringification: a Block whose body only registers a cleanup, reads context and returns a plain string throws while a scope is ambient, and files NOTHING on that scope",
    async check(kit) {
      // The claim beside this one observes the STRINGIFICATION — a built
      // subtree's markup in an attribute — which is `toString`'s own brand test
      // and not the entry guard. A Block that returns a string is invisible to
      // it, and that Block is the Provider bug's actual shape: the cleanup and
      // the context read go to whatever scope happened to be current.
      let bodyRan = 0
      let sawContext: string | null = null
      const filed: string[] = []
      const quiet = block((s: Scope | null) => {
        bodyRan++
        void s
        onCleanup(() => filed.push("quiet"))
        sawContext = useContext(Theme) ?? null
        return "a plain string"
      })

      const ambient = enterRoot()
      let thrown: unknown = null
      try {
        ;(quiet as unknown as (s?: Scope | null) => unknown)(undefined)
      } catch (error) {
        thrown = error
      }
      await kit.settle()
      exit(ambient)
      dispose(ambient)
      await kit.settle()

      if (thrown === null || (thrown as Error).name !== "ScopeMissingError") {
        kit.fail(
          `a branded Block invoked with \`undefined\` while a scope was ambient ` +
            `${thrown === null ? "did not throw at all" : `threw ${(thrown as Error).name}`}; its body ran ` +
            `${bodyRan} time(s) and read ${JSON.stringify(sawContext)} from the ambient chain. C3.8's ` +
            `negative half is that the fallback to CURRENT does not exist — not that a built subtree ` +
            `is refused where it would have been stringified`,
        )
      }
      if (bodyRan !== 0 || filed.length !== 0) {
        kit.fail(
          `the Block's body ran ${bodyRan} time(s) and disposing the AMBIENT scope ran ` +
            `${filed.length} cleanup(s) it registered (${JSON.stringify(filed)}), expected 0 and 0. ` +
            `That is the Provider bug exactly: a child's cleanup filed on whatever scope happened to ` +
            `be current, and it is invisible to any claim that observes what reached the DOM`,
        )
      }
    },
  },
  {
    id: "a-primitive-handed-undefined-throws-before-it-does-anything",
    rule: "C3.8",
    says: "`requireScope` is the other half of the same negative: every Cell-slot primitive refuses `undefined` itself, so a missing scope is named at the entry point rather than resolved against CURRENT",
    async check(kit) {
      // Every drive here carries a plain CELL, so nothing in the value can
      // throw: the only thing under test is the primitive's own refusal of a
      // missing scope. Without it `scope ?? null` reads as "no owner", which is
      // a legal value (§3.0) and silently detaches everything the call builds.
      const cases = slots(() => () => "a cell")
      const surviving: string[] = []
      const wrong: string[] = []
      const ambient = enterRoot()
      try {
        for (const slot of cases) {
          let thrown: unknown = null
          try {
            slot.drive(undefined as never)
          } catch (error) {
            thrown = error
          }
          if (thrown === null) surviving.push(slot.name)
          else if ((thrown as Error).name !== "ScopeMissingError")
            wrong.push(`${slot.name} -> ${(thrown as Error).name}: ${(thrown as Error).message}`)
        }
      } finally {
        exit(ambient)
        dispose(ambient)
      }
      await kit.settle()
      kit.precondition(cases.length >= 9, "the slot list is empty, so nothing was driven")
      if (surviving.length > 0 || wrong.length > 0) {
        kit.fail(
          `${surviving.length} of ${cases.length} primitives accepted \`undefined\` as their scope ` +
            `(${surviving.join(", ") || "none"}); ${wrong.length} refused it with something other than ` +
            `ScopeMissingError (${wrong.join(", ") || "none"}). A construct invoked with no scope is ` +
            `named, not resolved against CURRENT and not silently detached`,
        )
      }
    },
  },
  {
    id: "a-cell-ignores-every-argument",
    rule: "C3.6",
    says: "`cell($s)` and `cell()` are the same call, which is what makes one call site serve both kinds",
    check(kit) {
      const asBlock = arityTolerant as unknown as (s: Scope | null) => string
      const withScope = asBlock(null)
      const withNone = arityTolerant()
      if (withScope !== withNone || withScope !== "tolerated") {
        kit.fail(
          `a Cell invoked with a scope yielded ${JSON.stringify(withScope)} and invoked with none ` +
            `yielded ${JSON.stringify(withNone)}; C3.6 makes the two the same call`,
        )
      }
    },
  },
  {
    id: "a-cell-in-a-block-slot-degrades",
    rule: "C3.7",
    says: "the asymmetry runs one way: a Cell in a Block slot degrades harmlessly, and the brand is what tells the two apart",
    check(kit) {
      if (isBlock(arityTolerant)) {
        kit.fail("a plain Cell reported as a Block, so the brand is not the discriminator")
      }
      if (!isBlock(needsScope)) {
        kit.fail("a branded Block did not report as one, so C3.8's test has nothing to key on")
      }
    },
  },
  {
    id: "kind-survives-a-body-destructure",
    rule: "C3.9",
    says: "a Block forwarded out of a rest-destructured props binding is still a Block, so the compiler may not re-wrap it in a Cell",
    async check(kit) {
      const host = kit.container()
      const thrown = await kit.attempt(() => {
        render(Subject as never, host)
      })
      await kit.settle()
      kit.precondition(host.innerHTML.length > 0, "nothing rendered, so no claim observed anything")
      if (!host.innerHTML.includes("leaf") || thrown.length > 0) {
        kit.fail(
          `a JSX prop forwarded through a rest-destructure rendered ${JSON.stringify(host.innerHTML)} ` +
            `(${thrown.map((t) => `${t.name}: ${t.message}`).join("; ") || "no throw"}), expected the ` +
            `leaf. Re-wrapping the binding as \`() => children\` makes a Cell that YIELDS a Block, ` +
            `and its source text is what reaches the DOM`,
        )
      }
    },
  },
  {
    id: "the-emitted-forward-is-the-name-not-a-wrapper",
    rule: "C5.1",
    says: "the compiler forwards a destructured props binding by identity, because a re-wrap destroys the brand it cannot restore",
    check(kit) {
      if (/thing:\s*\(\)\s*=>\s*thing/.test(kit.emitted)) {
        kit.fail(
          "the emitted module re-wraps the destructured binding as `thing: () => thing`, which is a " +
            "Cell holding whatever `props.thing` carried — a Block loses its brand and a Cell gains " +
            "a level. C5 says forwarding is identity",
        )
      }
    },
  },
]
