/**
 * `render()` returns a disposer. It does not dispose.
 *
 * `dom.ts:1112` takes an already-built element, opens no owner, and returns
 * `() => { container.textContent = "" }`. Emptying a container is not disposal:
 * the effects, the cleanups, the listeners and the reactive graph the subtree
 * built are all still there, attached to nothing, and every one of them still
 * runs when a signal they read is written.
 *
 * That is not a leak in one place. Every barq mount leaks its entire reactive
 * graph, and O3.7 — "after dispose the subtree has zero scheduled effects, zero
 * live scopes, zero retained nodes" — is not merely false, it is not
 * FORMULABLE, because nothing owns the subtree in the first place.
 *
 * O5, O3.7.
 */
import { scope, DEV, effect, onCleanup, render, renderEffect, signal } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"
import { formatThrown } from "../../test/semantics-support.ts"

export const rules = ["O5", "O3.7"]

export const count = signal(0)
export const runs: string[] = []
export const cleanups: string[] = []

let escaped: HTMLElement | null = null

// Read through a call: `escaped` is written from inside Painter, which the
// checker cannot see running between the reset and the read, so a direct
// `escaped?.textContent` narrows to `never` at the read site.
function painted(): string | null {
  return escaped?.textContent ?? null
}

function Leaf() {
  effect(() => {
    runs.push(`effect:${count()}`)
  })
  onCleanup(() => cleanups.push("leaf"))
  return <span class="leaf">{() => count()}</span>
}

function Painter() {
  const node = document.createElement("b")
  node.className = "painted"
  escaped = node
  renderEffect(() => {
    node.textContent = String(count())
  })
  return <span class="painter">painter</span>
}

function Tree() {
  return (
    <div>
      <Leaf />
      <Painter />
    </div>
  )
}

async function mountAndDispose(kit: Kit) {
  count.set(0)
  runs.length = 0
  cleanups.length = 0
  escaped = null
  const host = kit.container()
  let dispose: (() => void) | undefined
  const thrown = await kit.attempt(() => {
    dispose = render(<Tree />, host)
  })
  const before = runs.length
  dispose?.()
  await kit.settle()
  count.set(1)
  await kit.settle()
  return { host, thrown, before, after: runs.length, painted: painted() }
}

const MOUNTED =
  "the tree never mounted: no effect ran and no node was built, so there was nothing for a " +
  "disposer to dispose and this claim would be satisfied by an empty fixture"

/**
 * The same mount, wrapped in a scope, which is how every non-trivial caller
 * reaches `render` — `hydrate` did it, and both compiler-rs harnesses do.
 *
 * `eager` chooses which of the two argument forms O5's RUNTIME allows. With the
 * already-built form the subtree is constructed BEFORE `render` is entered,
 * under whatever owner is current at the call site, so it is that owner's and
 * not the root's. With the Block form the root is what builds it.
 *
 * **Re-cut at M12, and the re-cut is the point.** `render(<Tree/>, host)` no
 * longer compiles to the eager form: `scope` wraps a bare JSX argument in
 * `render`/`hydrate`'s first position into `(_s$) => <Tree/>`, so the two
 * spellings are ONE program and the eager form has no compiled spelling left.
 * The claims below that are about the eager form would then have been silently
 * measuring the Block form — passing for the wrong reason, which is worse than
 * failing.
 *
 * So there are THREE positions now where there were two, and the claims below
 * are re-pointed at them:
 *
 *  - `jsx` — `render(<Tree/>, host)`, the spelling an application writes.
 *  It is a Block after the wrap, and it is what O5's own claim
 *  measures, because O5 is about what `render` does for the code
 *  people write.
 *  - `block` — `render((s) => <Tree/>, host)`, written out by hand. The
 *  control that says the wrap produced the shape it claims to.
 *  - `built` — `const built = <Tree/>` through a LOCAL, then `render(built,
 *  host)`. An ordinary declarator, so the compiler leaves it eager
 *  and the callee is handed a value. This is the runtime's
 *  argument form, which still EXISTS — a hand-written or
 *  un-compiled caller can still produce one — and the two controls
 *  about relocation and the diagnostic drive it, because they are
 *  statements about the runtime and not about the compiler.
 *
 * Without the third position those two controls would have gone on passing
 * while silently measuring the Block form, which is worse than failing.
 */
type Form = "jsx" | "block" | "built"

async function mountInsideAScope(kit: Kit, form: Form) {
  count.set(0)
  runs.length = 0
  cleanups.length = 0
  escaped = null
  const host = kit.container()
  let clear: (() => void) | undefined
  let outer: (() => void) | undefined
  const capture = DEV.diagnostics.capture()
  const thrown = await kit.attempt(() => {
    outer = scope((d: () => void) => {
      if (form === "built") {
        // Built BEFORE `render` is entered, and through a LOCAL so the wrap
        // does not reach it. The shape a hand-written caller still produces.
        const built = <Tree />
        clear = render(built, host)
      } else if (form === "block") {
        clear = render(() => <Tree />, host)
      } else {
        clear = render(<Tree />, host)
      }
      return d
    }, true)
  })
  const diagnostics = capture.stop().map((event) => event.code)
  const before = runs.length
  clear?.()
  await kit.settle()
  count.set(1)
  await kit.settle()
  const afterClear = runs.length
  outer?.()
  await kit.settle()
  count.set(2)
  await kit.settle()
  return { host, thrown, before, afterClear, afterOuter: runs.length, diagnostics }
}

export const claims: Claim[] = [
  {
    id: "the-disposer-stops-effects",
    rule: "O5",
    says: "the disposer disposes the root scope, so writing a signal the tree depended on runs nothing",
    async check(kit) {
      const seen = await mountAndDispose(kit)
      kit.precondition(seen.before > 0, MOUNTED)
      if (seen.after !== seen.before) {
        kit.fail(
          `after the disposer returned, writing count ran ${seen.after - seen.before} more effect(s) ` +
            `(${JSON.stringify(runs)}, ${formatThrown(seen.thrown)}). render() opened no owner, ` +
            `so its "disposer" has nothing to dispose and only empties the container`,
        )
      }
    },
  },
  {
    id: "the-disposer-runs-cleanups",
    rule: "O5",
    says: "the disposer disposes the root scope, which by O3.3 runs every cleanup the subtree registered",
    async check(kit) {
      const seen = await mountAndDispose(kit)
      kit.precondition(seen.before > 0, MOUNTED)
      if (cleanups.length !== 1) {
        kit.fail(
          `onCleanup ran ${cleanups.length} times across dispose, expected 1 ` +
            `(${formatThrown(seen.thrown)}). Nothing owns the subtree, so nothing has the standing ` +
            `to unwind it — a subscription opened on mount is never closed`,
        )
      }
    },
  },
  {
    id: "the-subtree-holds-nothing-afterwards",
    rule: "O3.7",
    says: "after dispose returns, the subtree has zero scheduled effects, zero live scopes and zero retained nodes",
    async check(kit) {
      const seen = await mountAndDispose(kit)
      kit.precondition(seen.before > 0, MOUNTED)
      kit.precondition(seen.painted !== null, "Painter never built the node whose survival is the observation")
      if (seen.painted !== "0") {
        kit.fail(
          `a render effect created by the disposed subtree wrote ${JSON.stringify(seen.painted)} into ` +
            `a node it built, after dispose returned; it held "0" at dispose time ` +
            `(${formatThrown(seen.thrown)}). The container is empty and the graph is alive: every ` +
            `mount retains its whole subtree, and the leak has a visible fingerprint`,
        )
      }
    },
  },
  {
    id: "the-disposer-disposes-when-an-owner-is-current",
    rule: "O5",
    says: "the disposer disposes the root scope even when render was called with an owner already current",
    async check(kit) {
      const seen = await mountInsideAScope(kit, "jsx")
      kit.precondition(seen.before > 0, MOUNTED)
      if (seen.afterClear !== seen.before) {
        kit.fail(
          `render() was called inside a scope, the way hydrate and both harnesses call it. After its ` +
            `disposer returned, writing count ran ${seen.afterClear - seen.before} more effect(s) ` +
            `(${JSON.stringify(runs)}, ${formatThrown(seen.thrown)}). The subtree is an ARGUMENT: it is ` +
            `built before render is entered, so its effects are the CALLER's owner's kids and the root ` +
            `never held them. Nothing running after the call can tell them from anything else that owner ` +
            `holds, so this needs the Block form the calling convention lands`,
        )
      }
    },
  },
  {
    id: "control-the-block-form-disposes-when-an-owner-is-current",
    rule: "O5",
    says: "the Block form builds under the root, so the disposer disposes whatever the ambient owner is",
    async check(kit) {
      const seen = await mountInsideAScope(kit, "block")
      kit.precondition(seen.before > 0, MOUNTED)
      if (seen.afterClear !== seen.before) {
        kit.fail(
          `render((scope) => …, host) invokes the Block with the root, so the root owns everything the ` +
            `mount builds. After the disposer returned, writing count still ran ` +
            `${seen.afterClear - seen.before} more effect(s) (${formatThrown(seen.thrown)}). This is the ` +
            `CONTROL: it is the shape the calling convention emits, and it is what makes the failure ` +
            `beside it a statement about the ARGUMENT form and not about render`,
        )
      }
      if (cleanups.length !== 1) {
        kit.fail(`the Block form ran ${cleanups.length} cleanup(s) across dispose, expected 1`)
      }
    },
  },
  {
    id: "control-the-ambient-owner-disposes-what-it-was-handed",
    rule: "O3.7",
    says: "an eagerly built subtree is owned by the owner current at the call site, so disposing THAT owner disposes it",
    async check(kit) {
      const seen = await mountInsideAScope(kit, "built")
      kit.precondition(seen.before > 0, MOUNTED)
      kit.precondition(
        seen.afterClear !== seen.before,
        "render's own disposer already stopped the subtree, so this claim is not observing the relocation it is about",
      )
      if (seen.afterOuter !== seen.afterClear) {
        kit.fail(
          `after the SCOPE render was called inside was disposed, writing count ran ` +
            `${seen.afterOuter - seen.afterClear} more effect(s) (${formatThrown(seen.thrown)}). This is ` +
            `the CONTROL for the claim above: with the argument form ownership is RELOCATED to the caller's ` +
            `owner, not lost, and O3.7 holds for that owner. If this fails too, the subtree is owned by ` +
            `nothing at all and the leak is unconditional`,
        )
      }
    },
  },
  {
    id: "control-the-argument-form-reports-that-it-cannot-dispose",
    rule: "O5",
    says: "render says so when it is handed an already-built subtree it will not own",
    async check(kit) {
      const seen = await mountInsideAScope(kit, "built")
      kit.precondition(seen.before > 0, MOUNTED)
      if (!seen.diagnostics.includes("RENDER_SUBTREE_NOT_OWNED")) {
        kit.fail(
          `render() was handed a built subtree while an owner was current and emitted ` +
            `${JSON.stringify(seen.diagnostics)}. A disposer that silently disposes nothing is the ` +
            `shape this fixture exists to catch; while the argument form survives, the runtime has to ` +
            `name it`,
        )
      }
    },
  },
  {
    id: "the-block-form-claims-nothing-it-did-not-build",
    rule: "O5",
    says: "a Block-form mount adopts no ownerless work it did not build, so its disposer cannot stop a library's effect that merely happened to be created in the same turn",
    async check(kit) {
      count.set(0)
      runs.length = 0
      cleanups.length = 0
      escaped = null
      const pulse = signal(0)
      const library: number[] = []
      let libraryCleanups = 0
      // Ownerless, and in the same synchronous turn as the mount below: the
      // orphan list bounds the claim in TIME, not by PROVENANCE, so this is the
      // ordinary module-initialisation shape and not a contrived one.
      effect(() => {
        library.push(pulse())
      })
      onCleanup(() => {
        libraryCleanups++
      })

      const host = kit.container()
      let dispose: (() => void) | undefined
      const thrown = await kit.attempt(() => {
        dispose = render(() => <Tree />, host)
      })
      await kit.settle()
      const before = library.length
      kit.precondition(before > 0, "the ownerless effect never ran, so nothing here could be adopted")
      kit.precondition(runs.length > 0, MOUNTED)

      dispose?.()
      await kit.settle()
      pulse.set(1)
      await kit.settle()

      if (library.length === before || libraryCleanups !== 0) {
        kit.fail(
          `a Block-form mount's disposer stopped an unrelated ownerless effect (ran ` +
            `${library.length - before} time(s) after dispose, expected 1) and ran ` +
            `${libraryCleanups} of its cleanups, expected 0 (${formatThrown(thrown)}). ` +
            `enterRoot's claim is the ALREADY-BUILT form's bridge: with a Block there is nothing ` +
            `built before the root exists, so claiming relocates work the mount had nothing to do with`,
        )
      }
    },
  },
  {
    id: "control-the-disposer-empties-the-container",
    rule: "O5",
    says: "the disposer removes the root's range, which is the half of O5 that holds today",
    async check(kit) {
      const seen = await mountAndDispose(kit)
      kit.precondition(seen.before > 0, MOUNTED)
      if (seen.host.childNodes.length !== 0) {
        kit.fail(
          `the container still holds ${seen.host.childNodes.length} node(s) after dispose ` +
            `(${formatThrown(seen.thrown)}). This is the CONTROL: range removal is the one thing ` +
            `today's disposer does, and O5 keeps requiring it`,
        )
      }
    },
  },
]
