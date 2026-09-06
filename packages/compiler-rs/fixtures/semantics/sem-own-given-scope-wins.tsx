/**
 * O4.5 — ownership is decided WHERE the construct runs, not by what is ambient
 * afterwards.
 *
 * The rule used to read "`CURRENT` never decides ownership", because every
 * primitive took the scope as its first argument. It no longer does: ownership
 * is ambient, and `CURRENT` is exactly what decides. What survives is the
 * property the argument existed to protect, and it is the falsifiable half:
 * a primitive files its work on the owner current AT THE CALL, and nothing that
 * becomes current later can adopt it.
 *
 * The falsification procedure is unchanged in shape and inverted in setup. A
 * and B are disjoint live scopes. The primitive runs under A; B is then current
 * for the rest of the test. Disposing A must stop the work. If disposal does
 * nothing and B is what stops it, the primitive captured no owner at the call
 * and read one later, which is the Provider bug with a different name.
 *
 * Two of these could not be seen at all while the scope was threaded: the
 * compiled element binding emitted a bare `renderEffect` taking no scope, and a
 * children Block reached through `insert`'s array path was invoked with the
 * ambient owner. Both are now the same one rule as the rest, because there is
 * one channel rather than an argument beside an ambient.
 *
 * O4.5.
 */
import {
  block,
  branch,
  dispose,
  effect,
  enterRoot,
  exit,
  getOwner,
  insert,
  onCleanup,
  runWithOwner,
  setProp,
  signal,
} from "@barqjs/core"
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

/** A compiled component whose body reads the ambient owner. */
function AmbientBody() {
  onCleanup(() => ambientCleanups.push("ambient"))
  effect(() => {
    ambientRuns.push(`effect:${pulse()}`)
  })
  return <i class="ambient">ambient</i>
}

/**
 * The wrapper the compiler emits wherever a component reaches a slot,
 * `_$block(() => Child({}))`, pinned as an EMISSION by
 * `sem-ctx-provider-direct-child`. The brand is what marks it a construction;
 * the owner it runs under is whatever the construct entered before invoking it.
 */
export const Ambient = block(() => AmbientBody())

/**
 * A and B, disjoint. A is entered and left, so it is a live scope nobody is
 * standing in; B is entered and stays current, so it is what `CURRENT` answers
 * for the rest of the test. Work run under A must therefore die with A.
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
  drive: () => void,
  write: (value: string) => void,
): Promise<void> {
  const { a, done } = twoScopes()
  try {
    // UNDER A, and only for the call. B is current before and after, so the
    // owner a primitive files on is the one it read at the call or nothing.
    runWithOwner(a, drive)
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
        `${what} ran under scope A while B was current afterwards, and disposing A did not stop ` +
          `it: the value still moved to ${JSON.stringify(after)}. O4.5 says the owner current AT ` +
          `THE CALL decides, so this one captured none and read one later`,
      )
    }
  } finally {
    done()
  }
}

export const claims: Claim[] = [
  {
    id: "insert-owns-the-scope-it-ran-under",
    rule: "O4.5",
    says: "`insert` opens its render effect under the owner current at the call, so disposing that owner stops the hole even while another is current",
    async check(kit) {
      const value = signal("one")
      const host = document.createElement("div")
      await verdict(
        kit,
        "insert",
        () => host.textContent ?? "",
        () => insert(host, () => value()),
        (next) => value.set(next),
      )
    },
  },
  {
    id: "set-prop-owns-the-scope-it-ran-under",
    rule: "O4.5",
    says: "`setProp` opens its render effect under the owner current at the call, so disposing that owner stops the attribute even while another is current",
    async check(kit) {
      const value = signal("one")
      const element = document.createElement("div")
      await verdict(
        kit,
        "setProp",
        () => element.id,
        () => setProp(element, "id", () => value()),
        (next) => value.set(next),
      )
    },
  },
  {
    id: "control-branch-owns-the-scope-it-ran-under",
    rule: "O4.5",
    says: "the four flow primitives capture their owner the same way, which is what makes the two above comparable rather than merely different",
    async check(kit) {
      const value = signal("one")
      const host = document.createElement("div")
      await verdict(
        kit,
        "branch",
        () => host.textContent ?? "",
        // The body as a FUNCTION, not a table: the key here is the value
        // itself, so `bodies[k]` would index an array by a string.
        () => void branch(host, null, () => value(), () => document.createTextNode(value())),
        (next) => value.set(next),
      )
    },
  },
  {
    id: "the-compiled-element-binding-owns-the-scope-it-ran-under",
    rule: "O4.5",
    says: "the effect the COMPILER emits for a live attribute opens under the owner the body ran under, so disposing it stops the attribute even while another is current",
    async check(kit) {
      tone.set("one")
      const { a, done } = twoScopes()
      try {
        const element = runWithOwner(a, () => Live() as unknown as Element)
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
            "a compiled component body ran under scope A and disposing A did not stop its class " +
              "binding, so the emitted effect filed itself on an owner it read later rather than " +
              "on the one current at the call. That is O4.5's defect in the compiled channel",
          )
        }
      } finally {
        done()
      }
    },
  },
  {
    id: "a-compiled-component-body-owns-the-scope-it-ran-under",
    rule: "O4.5",
    says: "the owner a Block runs under is `CURRENT` for its whole body, so the `onCleanup` and the `effect` inside the component it wraps follow it and not whatever becomes current later",
    async check(kit) {
      ambientRuns.length = 0
      ambientCleanups.length = 0
      pulse.set(0)
      const { a, done } = twoScopes()
      try {
        runWithOwner(a, () => (Ambient as unknown as () => unknown)())
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
            `the Block wrapper the compiler emits for a slot ran under scope A. Disposing A ran ` +
              `${ambientCleanups.length} of its cleanups (expected 1) and left its effect running ` +
              `${ambientRuns.length - 1} more time(s) (expected 0): ${JSON.stringify(ambientRuns)}. ` +
              `A component call is a plain call, so the owner it inherits is the whole of what ` +
              `owns its body: if that is not established for the WHOLE body, a component splits ` +
              `its ownership across two scopes, which is O4.5's defect`,
          )
        }
      } finally {
        done()
      }
    },
  },
  {
    id: "a-children-block-runs-under-the-scope-the-call-ran-under",
    rule: "O4.5",
    says: "a children Block reached through `insert`'s array path runs under the owner the call ran under, so its cleanups are filed there",
    async check(kit) {
      const { a, done } = twoScopes()
      let sawScope: Scope | null | undefined = undefined
      let ranCleanup = 0
      try {
        const host = document.createElement("div")
        runWithOwner(a, () =>
          insert(host, [
            () => {
              sawScope = getOwner()
              onCleanup(() => {
                ranCleanup++
              })
              return document.createTextNode("leaf")
            },
          ] as never),
        )
        await kit.settle()
        kit.precondition(host.textContent === "leaf", "the children Block never built anything")
        dispose(a)
        await kit.settle()
        // UNDER A's subtree, not A itself: `insert` enters an instance scope
        // for the body, so the Block's owner is a child of A. Pinning identity
        // would pin that construct's internals; what the rule is about is which
        // disposal reaches the cleanup.
        if (sawScope === null || sawScope === undefined || ranCleanup !== 1) {
          kit.fail(
            `a children Block ran under ${sawScope === undefined ? "nothing at all" : "no owner"} ` +
              `when the call ran under A, and disposing A ran ${ranCleanup} of its cleanups ` +
              `(expected 1). O4.5 says the owner current at the call decides, and a children ` +
              `Block is invoked by that call rather than beside it`,
          )
        }
      } finally {
        done()
      }
    },
  },
]
