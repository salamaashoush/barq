/**
 * R2 — reactivity is left STRUCTURALLY by the apply phase of every element
 * effect. R2, and channel resolution.
 *
 * This fixture was named and did not exist, because until M5 there was no
 * apply phase to test: an element's live props were one tracked function that
 * both read and wrote, so every read a CHANNEL performed was a read of the
 * effect. The fused record splits the two, and the split is what makes the
 * guarantee structural rather than a discipline: the second argument is simply
 * not a tracking scope.
 *
 * The falsification the rule states is "read `el.offsetWidth` in an apply
 * phase; the effect MUST NOT acquire a dependency", and a DOM read is not a
 * falsification of anything — no DOM property is reactive, so a tracked apply
 * and an untracked one are indistinguishable through one. So the read placed in
 * the apply phase here is a read of a SIGNAL, reached the only way a channel can
 * reach one: `setAttr` coerces its value with `String(value)`, and the value is
 * an object whose `toString` reads `probe`.
 *
 * That gives both halves. The apply really does read `probe` — the second claim
 * is the precondition for the first, and without it "no dependency" would be
 * satisfied by an apply that read nothing at all.
 */
import { render, signal } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"

export const rules = ["R2"]

/** Changes in the COMPUTE. Its read is tracked and the effect depends on it. */
export const version = signal("a")
/** Read only from inside `toString`, which the CHANNEL calls in the apply. */
export const probe = signal(0)

let coercions = 0

/**
 * A FRESH object each time, so its identity differs on every compute — the
 * record's `!==` guard would otherwise skip the write and the third claim would
 * be measuring the guard rather than the tracking rule.
 */
function coerced(at: string) {
  return {
    toString(): string {
      coercions++
      return `${at}p${probe()}`
    },
  }
}

/**
 * `title` is a plain attribute, so the channel is `setAttr` and `setAttr`
 * stringifies. The compute reads `version` — that is what makes the binding
 * live — and hands the channel an object; the channel's `String(value)` is
 * where `probe` is read, inside the apply.
 */
function Subject() {
  return <b id={() => version()} title={() => coerced(version())} />
}

async function mount(kit: Kit) {
  coercions = 0
  version.set("a")
  probe.set(0)
  const host = kit.container()
  let dispose: (() => void) | undefined
  const thrown = await kit.attempt(() => {
    dispose = render(Subject as never, host)
  })
  await kit.settle()
  return { host, thrown, dispose, title: () => host.querySelector("b")?.getAttribute("title") }
}

export const claims: Claim[] = [
  {
    id: "the-apply-phase-reads-the-signal-it-is-supposed-to",
    rule: "R2",
    says: "the channel really does read `probe` while applying, so the claim beside this one is not vacuous",
    async check(kit) {
      const seen = await mount(kit)
      kit.precondition(
        seen.thrown.length === 0,
        `mounting threw ${JSON.stringify(seen.thrown)}`,
      )
      kit.precondition(
        coercions > 0,
        `the channel never coerced the value, so nothing was read in the apply phase (${coercions})`,
      )
      if (seen.title() !== "ap0") {
        kit.fail(
          `the apply wrote ${JSON.stringify(seen.title())}, expected "ap0" — the read this rule is ` +
            `about is not happening where it is supposed to`,
        )
      }
      seen.dispose?.()
    },
  },
  {
    id: "a-signal-read-in-the-apply-phase-is-not-a-dependency",
    rule: "R2",
    says: "the apply phase runs untracked, so a read there can never become a dependency of the effect",
    async check(kit) {
      const seen = await mount(kit)
      kit.precondition(coercions > 0, `the channel never coerced the value (${coercions})`)
      const before = coercions
      probe.set(1)
      await kit.settle()
      if (coercions !== before) {
        kit.fail(
          `writing a signal read only in the apply phase re-ran the effect ` +
            `(${before} → ${coercions} coercions) and rewrote the attribute as ` +
            `${JSON.stringify(seen.title())}. R2 says the apply is not a tracking scope; an effect ` +
            `that subscribes to what its own DOM write happened to touch is the feedback loop the ` +
            `split exists to make unrepresentable`,
        )
      }
      seen.dispose?.()
    },
  },
  {
    id: "the-compute-phase-is-still-tracked",
    rule: "R2",
    says: "only the apply leaves tracking: a read in the compute still subscribes, or the rule would be about a dead effect",
    async check(kit) {
      const seen = await mount(kit)
      const before = coercions
      probe.set(2)
      version.set("b")
      await kit.settle()
      if (coercions <= before) {
        kit.fail(
          `writing the signal the COMPUTE reads did not re-run the effect ` +
            `(${before} → ${coercions} coercions). R2 exempts the apply, not the compute; an ` +
            `effect that no longer re-runs at all would satisfy the claim above for the wrong reason`,
        )
      }
      if (seen.title() !== "bp2") {
        kit.fail(
          `the re-run wrote ${JSON.stringify(seen.title())}, expected "bp2" — the apply reads the ` +
            `signal at the value it holds NOW, which is what makes the stale write visible`,
        )
      }
      seen.dispose?.()
    },
  },
]
