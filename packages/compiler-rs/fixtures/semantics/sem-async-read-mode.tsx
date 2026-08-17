/**
 * A5 (f)'s read surface, through the compiler.
 *
 * `isPending(fn)` and `latest(fn)` INVOKE their argument, so the tracked read
 * happens at the call. Nothing else in the classifier can see that: written
 * `isPending(user)` the accessor is only REFERENCED, and written
 * `isPending(() => user())` the read sits inside a nested arrow, which is
 * deferred everywhere else — that deferral is exactly what lets a handler
 * hoist to module scope. So without the rule the binding lands BY VALUE and is
 * applied once at construction, which is the failure this fixture exists for
 * and which no fixture reached before M11: `isPending` and `latest` had no
 * compiled-JSX coverage at all, so the corpus was green either way.
 *
 * The shape is the reference's own documented example —
 * `<h1 class={{ stale: isPending(user) }}>` — and `@dom-expressions/compiler`
 * emits an effect for it, because its rule is that ANY call in an attribute is
 * dynamic. barq's rule is precise rather than conservative, which is why the
 * two combinators have to be named.
 *
 * Every claim observes an UPDATE. The first frame is identical under both
 * emissions — that is what "applied once at construction" means — so a claim
 * that only reads the mount is satisfied by the defect.
 *
 * The EMISSION is `read-mode-binding.tsx`'s to assert, not this file's. A claim
 * that searched `kit.emitted` for `bindEffect` was written here first and was
 * wrong: L1 runs every fixture through the reference backend too, which
 * expresses the same binding as an interpreter op and has no such name in it.
 * A conformance claim is about behaviour; the shape of one backend's output is
 * the corpus channel's question.
 *
 * SEMANTICS.md §10 A5 (f).
 */
import { action, commit, latest, isPending, optimistic, render } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"

export const rules = ["A5"]

let release: (() => void) | null = null

const title = optimistic("settled")

const rename = action(function* (next: string) {
  title.set(next)
  yield new Promise<void>((resolve) => {
    release = resolve
  })
  commit(() => title.set(`${next}-committed`))
})

function Panel() {
  return (
    <div class="host">
      <h1 class={{ stale: isPending(title) }}>{() => title()}</h1>
      <p class="authoritative">{() => latest(() => title())}</p>
    </div>
  )
}

let previous: (() => void) | null = null

async function mount(kit: Kit) {
  previous?.()
  previous = null
  release = null
  title.set("settled")
  const host = kit.container()
  let dispose: (() => void) | undefined
  const thrown = await kit.attempt(() => {
    dispose = render(() => <Panel />, host)
  })
  previous = dispose ?? null
  if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0].message}`)
  return host
}

function stale(host: HTMLElement): boolean {
  return host.querySelector("h1")?.classList.contains("stale") === true
}

function reads(host: HTMLElement): string {
  return JSON.stringify(host.textContent)
}

export const claims: Claim[] = [
  {
    id: "isPending-in-a-class-object-tracks-the-lane",
    rule: "A5",
    says: "the class appears when a lane claims the value and goes when the lane retires, which is the update a by-value binding cannot show",
    async check(kit) {
      const host = await mount(kit)
      if (stale(host)) {
        kit.fail(`the class is set before any action ran; the container reads ${reads(host)}`)
      }

      const running = rename("guess")
      await kit.settle()
      kit.precondition(
        release !== null,
        "the action never reached its yield, so no lane was ever live and this claim would be " +
          "observing an absence",
      )
      if (!stale(host)) {
        kit.fail(
          "the class did not appear while a lane was live. Bound by value it holds whatever " +
            "`isPending` answered at construction, which is `false`, for the life of the page",
        )
      }

      release?.()
      await running
      await kit.settle()
      if (stale(host)) {
        kit.fail(`the class survived the lane's retirement; the container reads ${reads(host)}`)
      }
    },
  },
  {
    id: "latest-in-a-hole-reads-through-the-override",
    rule: "A5",
    says: "a normal read shows the lane's guess and `latest()` reads through it to the authoritative value, and both are live",
    async check(kit) {
      const host = await mount(kit)
      const authoritative = (): string | undefined =>
        host.querySelector("p.authoritative")?.textContent ?? undefined

      if (host.querySelector("h1")?.textContent !== "settled" || authoritative() !== "settled") {
        kit.fail(`the first frame disagrees with itself; the container reads ${reads(host)}`)
      }

      const running = rename("guess")
      await kit.settle()
      kit.precondition(release !== null, "the action never reached its yield")

      if (host.querySelector("h1")?.textContent !== "guess") {
        kit.fail(`the normal read does not show the override; the container reads ${reads(host)}`)
      }
      if (authoritative() !== "settled") {
        kit.fail(
          `\`latest()\` did not read through the override; it reads ${JSON.stringify(
            authoritative(),
          )} where the authoritative value is still "settled"`,
        )
      }

      release?.()
      await running
      await kit.settle()
      // `commit()` wrote underneath the override, so retiring drops onto a
      // value that is already right — and BOTH holes must have moved, which is
      // what says `latest()` is a live read rather than one frozen at mount.
      if (authoritative() !== "guess-committed") {
        kit.fail(
          `the committed value never reached the \`latest()\` hole; it reads ${JSON.stringify(
            authoritative(),
          )}`,
        )
      }
    },
  },
]
