/**
 * R1 — a component body is not a tracking scope.
 *
 * This fixture was named and did not exist, so R1 read `HOLDS` on an
 * assertion nothing ran. The falsification procedure is the rule's own: read a
 * signal in a component body, write it, and the body must not run again — and
 * nothing may re-render on account of that read, which is the half a body-run
 * counter alone does not cover.
 *
 * R1.
 */
import { render, signal } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"

export const rules = ["R1"]

const count = signal(0)
const bodies: number[] = []

/** The read is in the BODY, not in a hole: the rendered text is a snapshot. */
function Snapshot() {
  const at = count()
  bodies.push(at)
  return <b class="snapshot">{String(at)}</b>
}

const Subject = () => <Snapshot />

async function mount(kit: Kit) {
  bodies.length = 0
  count.set(0)
  const host = kit.container()
  let dispose: (() => void) | undefined
  const thrown = await kit.attempt(() => {
    dispose = render(Subject as never, host)
  })
  await kit.settle()
  return { host, thrown, dispose }
}

export const claims: Claim[] = [
  {
    id: "a-signal-read-in-a-component-body-does-not-re-run-it",
    rule: "R1",
    says: "a component body is not one of the four tracking scopes, so a read there subscribes nothing",
    async check(kit) {
      const seen = await mount(kit)
      kit.precondition(bodies.length === 1, `the body ran ${bodies.length} time(s) at mount, expected 1`)
      count.set(1)
      await kit.settle()
      if (bodies.length !== 1) {
        kit.fail(
          `writing a signal read in a component body ran the body ${bodies.length - 1} more time(s) ` +
            `(${JSON.stringify(bodies)}). R1 names four tracking scopes and a component body is not ` +
            `one of them; a body that re-runs is the whole-component re-render model this design removes`,
        )
      }
      seen.dispose?.()
    },
  },
  {
    id: "nothing-re-renders-on-account-of-a-body-read",
    rule: "R1",
    says: "the read produced a snapshot, so the markup it wrote does not move when the signal is written",
    async check(kit) {
      const seen = await mount(kit)
      const before = seen.host.innerHTML
      kit.precondition(before.includes("0"), `the mount rendered ${JSON.stringify(before)}, expected the snapshot 0`)
      count.set(1)
      await kit.settle()
      const after = seen.host.innerHTML
      if (after !== before) {
        kit.fail(
          `the markup moved from ${JSON.stringify(before)} to ${JSON.stringify(after)} on a write to a ` +
            `signal read only in the component body. A body read is a snapshot: making it live means ` +
            `the body was tracked, and R1 says it is not`,
        )
      }
      seen.dispose?.()
    },
  },
]
