/**
 * O6 — the owner and the observer are two ambients, and `untrack` moves one.
 *
 * §13 named this fixture and it did not exist, so the rule read `HOLDS,
 * untested` with nothing behind it. The two directions are separable and both
 * are here: a cleanup registered inside `untrack` must still belong to the scope
 * that lexically encloses it, and a read inside `untrack` must not subscribe the
 * effect that encloses it.
 *
 * SEMANTICS.md §2 O6.
 */
import { effect, onCleanup, render, signal, untrack } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"

export const rules = ["O6"]

const count = signal(0)
const cleanups: string[] = []
const runs: number[] = []

const Subject = () => {
  untrack(() => {
    onCleanup(() => cleanups.push("registered-inside-untrack"))
  })
  effect(() => {
    runs.push(untrack(() => count()))
  })
  return <span class="subject">subject</span>
}

async function mount(kit: Kit) {
  cleanups.length = 0
  runs.length = 0
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
    id: "a-cleanup-registered-inside-untrack-belongs-to-the-enclosing-scope",
    rule: "O6",
    says: "untrack changes the observer and not the owner, so onCleanup inside it attaches where it lexically stands",
    async check(kit) {
      const seen = await mount(kit)
      kit.precondition(seen.host.innerHTML.length > 0, "nothing mounted, so no claim observed anything")
      seen.dispose?.()
      await kit.settle()
      if (cleanups.length !== 1) {
        kit.fail(
          `a cleanup registered inside untrack ran ${cleanups.length} time(s) when the enclosing ` +
            `scope was disposed, expected 1. untrack moved the OWNER as well as the observer, so the ` +
            `cleanup attached to nothing and disposal never reached it`,
        )
      }
    },
  },
  {
    id: "a-read-inside-untrack-subscribes-nothing",
    rule: "O6",
    says: "untrack changes the observer, so the enclosing effect acquires no dependency on what is read inside it",
    async check(kit) {
      const seen = await mount(kit)
      kit.precondition(runs.length === 1, `the effect ran ${runs.length} time(s) at mount, expected 1`)
      count.set(1)
      await kit.settle()
      if (runs.length !== 1) {
        kit.fail(
          `writing a signal read only inside untrack ran the enclosing effect ${runs.length - 1} more ` +
            `time(s) (${JSON.stringify(runs)}). untrack must leave the observer channel untouched by ` +
            `the read it wraps`,
        )
      }
      seen.dispose?.()
    },
  },
]
