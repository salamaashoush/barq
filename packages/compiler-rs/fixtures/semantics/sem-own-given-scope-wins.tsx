/**
 * O4.5 — `CURRENT` never decides ownership.
 *
 * Every primitive in `packages/core` takes the scope as its first argument, and
 * §13 recorded the rule as pinned by "structural (§14)": the SIGNATURE was the
 * evidence. A signature is not evidence. `insert` and `setProp` both took a
 * `Scope`, validated it with `requireScope`, and then opened their render effect
 * under whatever was ambient — so the argument was decoration, and the L2b
 * corpus could not see it because compiled code never makes `_s$` and `CURRENT`
 * differ.
 *
 * The falsification procedure is therefore to make them differ: enter A, leave
 * it, enter B, and hand A to the primitive while B is current. If ownership
 * follows the argument, disposing A stops it. If it follows `CURRENT`, disposing
 * A does nothing and disposing B is what stops it — which is the Provider bug
 * with a different name.
 *
 * The last claim is the half that does NOT hold, registered rather than hidden:
 * `childToNodes` invokes a children Block with the AMBIENT owner, and handing it
 * the given scope instead is coupled to O5 — `render`'s argument form. Measured,
 * not assumed: making that one-line change today turns
 * `sem-own-render-disposer-disposes`'s
 * `control-the-argument-form-reports-that-it-cannot-dispose` red, because the
 * root then owns a kid and `RENDER_SUBTREE_NOT_OWNED` stops firing.
 *
 * SEMANTICS.md §7 O4.5.
 */
import { block, branch, dispose, effect, enterRoot, exit, insert, onCleanup, setProp, signal } from "@barqjs/core"
import type { Scope } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"

export const rules = ["O4.5"]

/** The subject is the runtime surface, so the module needs no JSX of its own. */
export const Subject = () => <i class="o45">given-scope-wins</i>

/**
 * The COMPILED attribute/class/style/domprop channel, which is the one none of
 * the claims below could see. `insert` and `setProp` are runtime entry points
 * that take a scope; the compiled path emits neither for this channel — it
 * emitted a bare `renderEffect(compute, apply)` taking no scope at all, so the
 * whole channel was ambient-owned in exactly the shape this rule forbids, in
 * the path the design exists for. Driving the emission rather than the helper
 * beside it is what makes the claim about the shipped code.
 */
export const tone = signal("one")

export const Live = () => <i class={tone()}>compiled</i>

/**
 * The AMBIENT-reading half, which the compiled-binding claim above cannot see:
 * `bindEffect` takes the scope explicitly, so that claim holds even if a Block
 * establishes nothing. `onCleanup`, `effect`, `useContext` and a signal's owner
 * all read `CURRENT` instead, and a component call is a plain call — so unless
 * `block` makes the argument current for the whole body, one component handed A
 * while B is ambient splits its ownership across both: its hole under A, its
 * cleanup under B.
 */
export const pulse = signal(0)
export const ambientRuns: string[] = []
export const ambientCleanups: string[] = []

/** A compiled component whose body reads the ambient owner rather than `_s$`. */
function AmbientBody() {
  onCleanup(() => ambientCleanups.push("ambient"))
  effect(() => {
    ambientRuns.push(`effect:${pulse()}`)
  })
  return <i class="ambient">ambient</i>
}

/**
 * The wrapper the compiler emits wherever a component reaches a slot —
 * `_$block((_s$) => Child(_s$, {}))`, pinned as an EMISSION by
 * `sem-ctx-provider-direct-child`. A direct call needs no wrapper because the
 * argument and `CURRENT` are the same object there; a slot is the one position
 * where they can differ, and no compiled fixture makes them.
 */
export const Ambient = block((s: Scope | null) =>
  (AmbientBody as unknown as (s: Scope | null) => unknown)(s),
)

/**
 * A and B, disjoint. A is entered and left, so it is a live scope nobody is
 * standing in; B is entered and stays current, so it is what `CURRENT` answers.
 */
function twoScopes(): { a: Scope; b: Scope; done: () => void } {
  const a = enterRoot()
  exit(a)
  const b = enterRoot()
  return {
    a,
    b,
    done: () => {
      exit(b)
      dispose(b)
      dispose(a)
    },
  }
}

async function verdict(
  kit: Kit,
  what: string,
  read: () => string,
  drive: (a: Scope) => void,
  write: (value: string) => void,
): Promise<void> {
  const { a, done } = twoScopes()
  try {
    drive(a)
    await kit.settle()
    kit.precondition(read() === "one", `${what} never ran: it reads ${JSON.stringify(read())}`)
    dispose(a)
    write("two")
    await kit.settle()
    // The property is that the write no longer reaches it. What is left behind
    // is the primitive's business: `insert` and `setProp` leave the last value
    // standing, `branch` owns a range and disposal removes it. Asserting the
    // stale value would be asserting the primitive's cleanup policy instead.
    const after = read()
    if (after === "two") {
      kit.fail(
        `${what} was handed scope A while B was current, and disposing A did not stop it — it ` +
          `still moved to ${JSON.stringify(after)}. O4.5 says the argument decides ownership; ` +
          `here CURRENT did, so the scope was validated and then thrown away`,
      )
    }
  } finally {
    done()
  }
}

export const claims: Claim[] = [
  {
    id: "insert-owns-by-the-scope-it-was-given",
    rule: "O4.5",
    says: "`insert(A, …)` opens its render effect under A, so disposing A stops the hole even while B is current",
    async check(kit) {
      const value = signal("one")
      const host = document.createElement("div")
      await verdict(
        kit,
        "insert",
        () => host.textContent ?? "",
        (a) => insert(a, host, () => value()),
        (next) => value.set(next),
      )
    },
  },
  {
    id: "set-prop-owns-by-the-scope-it-was-given",
    rule: "O4.5",
    says: "`setProp(A, …)` opens its render effect under A, so disposing A stops the attribute even while B is current",
    async check(kit) {
      const value = signal("one")
      const element = document.createElement("div")
      await verdict(
        kit,
        "setProp",
        () => element.id,
        (a) => setProp(a, element, "id", () => value()),
        (next) => value.set(next),
      )
    },
  },
  {
    id: "control-branch-owns-by-the-scope-it-was-given",
    rule: "O4.5",
    says: "the four flow primitives already take their scope by the argument, which is what makes the two above comparable rather than merely different",
    async check(kit) {
      const value = signal("one")
      const host = document.createElement("div")
      await verdict(
        kit,
        "branch",
        () => host.textContent ?? "",
        (a) =>
          void branch(a, host, null, () => value(), (s: Scope | null) => {
            void s
            return document.createTextNode(value())
          }),
        (next) => value.set(next),
      )
    },
  },
  {
    id: "the-compiled-element-binding-owns-by-the-scope-it-was-given",
    rule: "O4.5",
    says: "the effect the COMPILER emits for a live attribute opens under the scope the Block was handed, so disposing A stops the attribute even while B is current",
    async check(kit) {
      tone.set("one")
      const { a, done } = twoScopes()
      try {
        const element = (Live as unknown as (s: Scope | null) => Element)(a)
        await kit.settle()
        kit.precondition(
          element.getAttribute("class") === "one",
          `the compiled binding never ran: class is ${JSON.stringify(element.getAttribute("class"))}`,
        )
        // Non-vacuity, stated behaviourally rather than by searching the
        // emitted text: the reference backend serialises the same effect into
        // IR data and emits no call for it at all, so a text probe would be a
        // claim about the DOM backend's spelling. A binding that is not live
        // would satisfy the assertion below for the wrong reason.
        tone.set("two")
        await kit.settle()
        kit.precondition(
          element.getAttribute("class") === "two",
          "the class binding is not live, so nothing about its ownership is observable here",
        )
        dispose(a)
        tone.set("three")
        await kit.settle()
        if (element.getAttribute("class") === "three") {
          kit.fail(
            "a compiled component was invoked with scope A while B was current, and disposing A " +
              "did not stop its class binding — the emitted effect took no scope at all and was " +
              "owned by CURRENT, which is O4.5's original defect in the compiled channel",
          )
        }
      } finally {
        done()
      }
    },
  },
  {
    id: "a-compiled-component-body-owns-by-the-scope-it-was-given",
    rule: "O4.5",
    says: "the scope a Block is HANDED is `CURRENT` for its whole body, so the `onCleanup` and the `effect` inside the component it wraps follow the argument and not the ambient owner",
    async check(kit) {
      ambientRuns.length = 0
      ambientCleanups.length = 0
      pulse.set(0)
      const { a, done } = twoScopes()
      try {
        ;(Ambient as unknown as (s: Scope | null) => unknown)(a)
        await kit.settle()
        kit.precondition(
          ambientRuns.length === 1,
          `the component's effect never ran: ${JSON.stringify(ambientRuns)}`,
        )

        dispose(a)
        await kit.settle()
        pulse.set(1)
        await kit.settle()

        if (ambientRuns.length !== 1 || ambientCleanups.length !== 1) {
          kit.fail(
            `the Block wrapper the compiler emits for a slot was invoked with scope A while B was current. Disposing A ran ` +
              `${ambientCleanups.length} of its cleanups (expected 1) and left its effect running ` +
              `${ambientRuns.length - 1} more time(s) (expected 0): ${JSON.stringify(ambientRuns)}. ` +
              `A component call is a plain call, so nothing but the Block itself can establish the ` +
              `ambient — without that the argument decides for the primitives that take it and for ` +
              `nothing else, which is O4.5's defect in the half no compiled fixture makes visible`,
          )
        }
      } finally {
        done()
      }
    },
  },
  {
    id: "a-children-block-is-invoked-with-the-given-scope",
    rule: "O4.5",
    says: "a children Block reached through `insert`'s array path is invoked with the scope the call was given, not with the ambient owner",
    async check(kit) {
      const { a, done } = twoScopes()
      let sawScope: Scope | null | undefined = undefined
      let ranCleanup = 0
      try {
        const host = document.createElement("div")
        insert(a, host, [
          (s: Scope | null) => {
            sawScope = s
            onCleanup(() => {
              ranCleanup++
            })
            return document.createTextNode("leaf")
          },
        ] as never)
        await kit.settle()
        kit.precondition(host.textContent === "leaf", "the children Block never built anything")
        dispose(a)
        await kit.settle()
        if (sawScope !== a || ranCleanup !== 1) {
          kit.fail(
            `a children Block was handed ${sawScope === a ? "A" : sawScope === null ? "null" : "some other scope"} ` +
              `when the call was given A, and disposing A ran ${ranCleanup} of its cleanups. O4.5 says ` +
              `the given scope decides; \`childToNodes\` hands over \`getOwner()\` instead, and the ` +
              `fix is coupled to O5 — see this fixture's header`,
          )
        }
      } finally {
        done()
      }
    },
  },
]
