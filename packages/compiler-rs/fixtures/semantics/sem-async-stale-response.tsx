/**
 * A2 — staleness is decided by the generation captured at CALL TIME.
 *
 * The classic async bug, and it is invisible to a test whose promises resolve
 * in the order they were issued. Before M7 the guard read a mutable outer
 * variable:
 *
 * ```ts
 * const data = await fetcher(…)
 * if (abortController.signal.aborted) return   // the NEWEST controller
 * ```
 *
 * By the time a slow first response arrived, `abortController` named the second
 * request's controller — which is live, not aborted — so the check passed and
 * the stale answer overwrote the fresh one. Every run now captures its own
 * generation and compares the pair it captured; nothing in a continuation reads
 * a variable the next request has since moved.
 *
 * The third claim is the CONTROL: settled IN ORDER, the second response still
 * wins. Without it "the second response wins" would also be satisfied by a
 * framework that simply believes the last thing it was told, which is the bug.
 *
 * SEMANTICS.md §10 A2.
 */
import { render, resource, signal } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"

export const rules = ["A2"]

export const which = signal("slow")

interface Pending {
  resolve: (value: string) => void
  reject: (error: Error) => void
}

let gates: Record<string, Pending> = {}
let issued: string[] = []
let signals: AbortSignal[] = []
let handle: { mutate: (value: string) => void } | null = null
let previous: (() => void) | null = null

function reset(): void {
  previous?.()
  previous = null
  gates = {}
  issued = []
  signals = []
  handle = null
  which.set("slow")
}

function Answer() {
  const data = resource(
    () => which(),
    (name: string, info: { signal: AbortSignal }) => {
      issued.push(name)
      signals.push(info.signal)
      return new Promise<string>((resolve, reject) => {
        gates[name] = { resolve, reject }
      })
    },
  )
  handle = data
  return <b class="answer">{() => data.latest() ?? "…"}</b>
}

async function mount(kit: Kit) {
  reset()
  const host = kit.container()
  let dispose: (() => void) | undefined
  const thrown = await kit.attempt(() => {
    dispose = render(() => <Answer />, host)
  })
  previous = dispose ?? null
  return { host, thrown, dispose }
}

/** Issue the second request, so two are in flight at once. */
async function overtake(kit: Kit): Promise<void> {
  which.set("fast")
  await kit.settle()
}

function shown(host: HTMLElement): string {
  return host.querySelector("b.answer")?.textContent ?? ""
}

export const claims: Claim[] = [
  {
    id: "a-slow-first-response-does-not-overwrite-a-fresh-second",
    rule: "A2",
    says: "a response that arrives after a newer request was issued never wins, however long it took",
    async check(kit) {
      const { host, thrown } = await mount(kit)
      if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0].message}`)
      await overtake(kit)
      kit.precondition(
        issued.join(",") === "slow,fast",
        `the two requests this claim is about were not both issued; issued [${issued.join(", ")}]`,
      )

      gates.fast.resolve("FRESH")
      await kit.settle()
      kit.precondition(
        shown(host) === "FRESH",
        `the second response never landed; the element reads ${JSON.stringify(shown(host))}`,
      )

      // The out-of-order arrival. In a suite whose promises settle in order this
      // line never runs before the assertion above and the bug is invisible.
      gates.slow.resolve("STALE")
      await kit.settle()

      if (shown(host) !== "FRESH") {
        kit.fail(
          `the first request answered last and overwrote the fresh value; the element reads ` +
            `${JSON.stringify(shown(host))}. A2 requires the continuation to compare the ` +
            "generation it captured at CALL TIME, not a variable the newer request has since moved",
        )
      }
    },
  },
  {
    id: "a-stale-rejection-does-not-error-a-resource-that-already-settled",
    rule: "A2",
    says: "the same generation guard governs a failure, so a superseded request's error is not the resource's error",
    async check(kit) {
      const { host, thrown } = await mount(kit)
      if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0].message}`)
      await overtake(kit)
      kit.precondition(
        issued.join(",") === "slow,fast",
        `the two requests this claim is about were not both issued; issued [${issued.join(", ")}]`,
      )

      gates.fast.resolve("FRESH")
      await kit.settle()
      kit.precondition(shown(host) === "FRESH", "the second response never landed")

      gates.slow.reject(new Error("the superseded request failed"))
      await kit.settle()

      if (shown(host) !== "FRESH") {
        kit.fail(
          `a superseded request's REJECTION moved a resource that had already settled; the ` +
            `element reads ${JSON.stringify(shown(host))}`,
        )
      }
    },
  },
  {
    id: "a-stale-response-does-not-clobber-an-optimistic-overlay",
    rule: "A2",
    says: "the guard is what makes the three claims around it true, and this is the path that OBSERVES it: a superseded continuation retires nothing, so a `mutate()` overlay written after it was superseded survives its arrival",
    async check(kit) {
      // The claims above hold through the MEMO alone — a discarded promise is
      // discarded whatever its continuation writes — so deleting the generation
      // guard leaves every one of them green. Measured, which is why this claim
      // exists: with the guard gone the stale continuation reaches
      // `override.set(null)` and takes the overlay with it.
      const { host, thrown } = await mount(kit)
      if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0].message}`)
      await overtake(kit)
      kit.precondition(
        issued.join(",") === "slow,fast" && handle !== null,
        `the two requests this claim is about were not both issued; issued [${issued.join(", ")}]`,
      )

      gates.fast.resolve("FRESH")
      await kit.settle()
      kit.precondition(shown(host) === "FRESH", "the second response never landed")

      handle?.mutate("OPTIMISTIC")
      await kit.settle()
      kit.precondition(
        shown(host) === "OPTIMISTIC",
        `the overlay never took effect; the element reads ${JSON.stringify(shown(host))}`,
      )

      gates.slow.resolve("STALE")
      await kit.settle()

      if (shown(host) !== "OPTIMISTIC") {
        kit.fail(
          `a superseded request's continuation retired an overlay written after it was already ` +
            `superseded; the element reads ${JSON.stringify(shown(host))}. The stale run has no ` +
            `standing to touch anything, and the generation pair captured at CALL TIME is what says so`,
        )
      }
    },
  },
  {
    id: "a-stale-response-does-not-release-the-newer-requests-cancellation",
    rule: "A2",
    says: "A1's half of the same guard: a superseded continuation may not clear the in-flight controller, which by then names the LIVE request — clearing it leaves that request outliving the scope that owns it",
    async check(kit) {
      const { thrown, dispose } = await mount(kit)
      if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0].message}`)
      await overtake(kit)
      kit.precondition(
        signals.length === 2,
        `the two requests this claim is about were not both issued; ${signals.length} signal(s) handed out`,
      )

      gates.slow.resolve("STALE")
      await kit.settle()
      kit.precondition(
        !signals[1].aborted,
        "the newer request was already aborted before the mount was disposed, so this claim observes nothing",
      )

      dispose?.()
      await kit.settle()

      if (!signals[1].aborted) {
        kit.fail(
          "a superseded response cleared the in-flight controller, so disposing the scope that " +
            "owns the resource aborted nothing and the LIVE request outlived its owner. That is " +
            "the leak A1 is about, reached through A2's guard",
        )
      }
    },
  },
  {
    id: "control-in-order-settlement-still-ends-on-the-second-response",
    rule: "A2",
    says: "the second response wins when it arrives second as well — which is what makes the claims above evidence about ORDER rather than about a framework that ignores every answer but the newest",
    async check(kit) {
      const { host, thrown } = await mount(kit)
      if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0].message}`)
      await overtake(kit)
      kit.precondition(
        issued.join(",") === "slow,fast",
        `the two requests this claim is about were not both issued; issued [${issued.join(", ")}]`,
      )

      gates.slow.resolve("STALE")
      await kit.settle()
      gates.fast.resolve("FRESH")
      await kit.settle()

      if (shown(host) !== "FRESH") {
        kit.fail(
          `settled in issue order, the resource ended on ${JSON.stringify(shown(host))} rather ` +
            "than on the newest request's answer",
        )
      }
    },
  },
]
