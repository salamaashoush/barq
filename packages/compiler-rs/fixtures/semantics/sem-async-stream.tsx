/**
 * A7 through compiled JSX, and a `Loading` boundary.
 *
 * `async-source.test.ts` runs all eight procedures against the node. This
 * fixture asks the question the node cannot answer: what the BOUNDARY does
 * across a stream's steps. A7 says a stream is pending until its FIRST yield
 * and settled from then on, and the whole point of that rule is what a
 * `<Loading>` above it shows — so the claim has to be made where a boundary
 * exists, which is here.
 *
 * Both claims observe MORE THAN ONE yield. One yield is indistinguishable from
 * a promise — the same "fallback, then content" — so a single-yield fixture is
 * satisfied by an implementation that awaits the first step and abandons the
 * iterator, which is most of the ways to get this wrong.
 *
 * SEMANTICS.md §10 A7, A3.
 */
import { Loading, computed, render } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"

export const rules = ["A7"]

/** Resolvers for the steps a claim releases one at a time. */
let release: (() => void)[] = []
let pulls = 0
let closed = false

function gate(): Promise<void> {
  return new Promise<void>((resolve) => {
    release.push(resolve)
  })
}

function Streamed() {
  const data = computed<number>(() =>
    (async function* () {
      try {
        let n = 0
        while (n < 3) {
          n++
          pulls++
          await gate()
          yield n
        }
      } finally {
        closed = true
      }
    })(),
  )

  return (
    <div class="host">
      <Loading fallback={<span class="waiting">waiting</span>}>
        {() => <p class="value">{() => `v${data()}`}</p>}
      </Loading>
    </div>
  )
}

let previous: (() => void) | null = null

async function mount(kit: Kit) {
  previous?.()
  previous = null
  release = []
  pulls = 0
  closed = false
  const host = kit.container()
  let dispose: (() => void) | undefined
  const thrown = await kit.attempt(() => {
    dispose = render(() => <Streamed />, host)
  })
  previous = dispose ?? null
  if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0].message}`)
  return host
}

/** Let the next buffered step through, then settle the scheduler. */
async function step(kit: Kit): Promise<void> {
  release.shift()?.()
  await kit.settle()
}

function reads(host: HTMLElement): string {
  return JSON.stringify(host.textContent)
}

export const claims: Claim[] = [
  {
    id: "the-boundary-falls-back-once-and-every-later-yield-lands-under-content",
    rule: "A7",
    says: "a stream suspends its boundary until the FIRST yield and never again: the second and third values replace the first in place, with no fallback between them",
    async check(kit) {
      const host = await mount(kit)
      kit.precondition(
        pulls > 0,
        "the generator's body never ran, so nothing was ever pending and this claim would be " +
          "observing an absence",
      )
      if (host.querySelector("span.waiting") === null) {
        kit.fail(`the first frame is not the fallback; the container reads ${reads(host)}`)
      }

      await step(kit)
      if (host.textContent !== "v1") {
        kit.fail(`the first yield did not reach the content; the container reads ${reads(host)}`)
      }

      await step(kit)
      if (host.querySelector("span.waiting") !== null) {
        kit.fail(
          `the boundary fell back to its fallback between yields; the container reads ` +
            `${reads(host)}. A stream that re-marks itself pending per step flaps every Loading ` +
            "above it once per element, which is what the rule exists to prevent",
        )
      }
      if (host.textContent !== "v2") {
        kit.fail(
          `the second yield never landed; the container reads ${reads(host)}. An implementation ` +
            "that awaits the first step and abandons the iterator is green up to here, which is " +
            "why this claim observes more than one yield",
        )
      }

      await step(kit)
      if (host.textContent !== "v3") {
        kit.fail(`the third yield never landed; the container reads ${reads(host)}`)
      }
    },
  },
  {
    id: "disposing-the-tree-closes-the-producer",
    rule: "A7",
    says: "disposal reaches the stream through `iterator.return()`, so the producer's own `finally` runs and it stops being pulled — A1 for a source whose only handle is its iterator",
    async check(kit) {
      await mount(kit)
      kit.precondition(pulls > 0, "the generator's body never ran")
      await step(kit)

      const before = pulls
      previous?.()
      previous = null
      // Whatever the producer was waiting on completes AFTER the disposal, which
      // is the case a dropped iterator gets wrong: it resumes into a node
      // nothing observes and goes on pulling.
      await step(kit)
      await kit.settle()

      if (!closed) {
        kit.fail(
          "the producer's `finally` never ran, so a generator holding a socket, an interval or a " +
            "subscription is never told the reader is gone",
        )
      }
      if (pulls > before + 1) {
        kit.fail(`the stream was pulled ${pulls - before} more times after its scope was disposed`)
      }
    },
  },
]
