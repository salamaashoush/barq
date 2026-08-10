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
import { branch, dispose, enterRoot, exit, insert, onCleanup, setProp, signal } from "@barqjs/core"
import type { Scope } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"

export const rules = ["O4.5"]

/** The subject is the runtime surface, so the module needs no JSX of its own. */
export const Subject = () => <i class="o45">given-scope-wins</i>

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
