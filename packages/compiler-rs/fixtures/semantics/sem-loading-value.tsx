/**
 * A8 through compiled JSX and a real `Loading` boundary.
 *
 * `loading-value.test.ts` runs all ten procedures against the node. What only a
 * fixture can ask is what the BOUNDARY does, and that is the whole point of the
 * option: a node that declared commit #0 must never put a fallback on the page
 * during its first flight, and must behave exactly like every other node on its
 * second.
 *
 * Both claims observe the SECOND flight. The first frame of a `loadingValue`
 * node and of a node that simply never reports pending are identical, so a
 * claim that stopped at the window would be satisfied by an option that just
 * suppressed pendingness for good.
 *
 * A8.
 */
import { Loading, isPending, render, resource, signal } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"

export const rules = ["A8"]

let release: ((value: string) => void) | null = null
let fetches = 0

const generation = signal(0)

function Profile() {
  const user = resource(
    () => generation(),
    () =>
      new Promise<string>((resolve) => {
        fetches++
        release = resolve
      }),
    // The skeleton is the VALUE, not a fallback. An application drives its
    // first-load affordance off the data — here, off the string itself.
    { loadingValue: "skeleton" },
  )

  return (
    <div class="host">
      <Loading fallback={<span class="waiting">waiting</span>}>
        {() => (
          // `isPending` is what makes the two states DISJOINT on the page: the
          // value alone cannot tell them apart, because `Loading` revalidation
          // keeps stale content in both. A5 (f) is what makes this class live.
          <p class={{ name: true, stale: isPending(user) }}>{() => user()}</p>
        )}
      </Loading>
    </div>
  )
}

let previous: (() => void) | null = null

async function mount(kit: Kit) {
  previous?.()
  previous = null
  release = null
  fetches = 0
  generation.set(0)
  const host = kit.container()
  let dispose: (() => void) | undefined
  const thrown = await kit.attempt(() => {
    dispose = render(() => <Profile />, host)
  })
  previous = dispose ?? null
  if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0].message}`)
  return host
}

function reads(host: HTMLElement): string {
  return JSON.stringify(host.textContent)
}

/** Whether the live `isPending` class is on the page right now */
function stale(host: HTMLElement): boolean {
  return host.querySelector("p.name")?.classList.contains("stale") === true
}

export const claims: Claim[] = [
  {
    id: "the-first-flight-shows-commit-zero-and-never-the-fallback",
    rule: "A8",
    says: "a node that declared a loading value puts no fallback on the page during its first flight: the boundary shows content from the first frame, because commit #0 answers the question by declaration",
    async check(kit) {
      const host = await mount(kit)
      kit.precondition(
        fetches > 0,
        "the fetcher never ran, so nothing was ever in flight and this claim would be observing " +
          "an absence",
      )

      if (host.querySelector("span.waiting") !== null) {
        kit.fail(
          `the boundary showed its fallback while a declared loading value was in flight; the ` +
            `container reads ${reads(host)}. Commit #0 exists exactly so this frame never happens`,
        )
      }
      if (host.textContent !== "skeleton") {
        kit.fail(`the first frame is not commit #0; the container reads ${reads(host)}`)
      }
      if (stale(host)) {
        kit.fail(
          "the node reported pending during its own loading window; commit #0 is a SETTLED value " +
            "in every observable, which is what stops a boundary or a transition waiting on it",
        )
      }

      release?.("Ada")
      await kit.settle()
      if (host.textContent !== "Ada") {
        kit.fail(`the first real answer never replaced commit #0; the container reads ${reads(host)}`)
      }
    },
  },
  {
    id: "the-second-flight-is-an-ordinary-revalidation",
    rule: "A8",
    says: "once the first answer lands the loading value leaves the lineage: a second flight keeps the STALE value on the page, not commit #0 and not a fallback",
    async check(kit) {
      const host = await mount(kit)
      kit.precondition(fetches > 0, "the fetcher never ran")

      release?.("Ada")
      await kit.settle()
      if (host.textContent !== "Ada") {
        kit.fail(`the first answer never landed; the container reads ${reads(host)}`)
      }

      const before = fetches
      generation.set(1)
      await kit.settle()
      kit.precondition(
        fetches > before,
        "the source changed and no second fetch was issued, so there is no second flight to " +
          "observe",
      )

      // Stale content, which is the ORDINARY rule (`Loading` revalidation) and
      // not the window's.
      if (host.textContent !== "Ada") {
        kit.fail(`the second flight did not keep stale content; the container reads ${reads(host)}`)
      }
      // And this is the assertion the VALUE cannot make. Revalidation keeps
      // stale content whether the window closed or not, so the page reads "Ada"
      // either way; `isPending` is the only thing that differs, and a window
      // that never closes suppresses it for the life of the node.
      if (!stale(host)) {
        kit.fail(
          "the second flight did not report pending. A8's two states are disjoint — commit #0 " +
            "answers by declaration and a refetch coordinates with boundaries — and a loading " +
            "window that never closes is a permanent pending-suppressor that no read of the " +
            "value can detect",
        )
      }

      release?.("Grace")
      await kit.settle()
      if (host.textContent !== "Grace") {
        kit.fail(`the second answer never landed; the container reads ${reads(host)}`)
      }
    },
  },
]
