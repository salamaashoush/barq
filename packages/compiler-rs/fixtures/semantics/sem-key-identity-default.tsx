/**
 * K1 — the default row identity is the ITEM, and K3 — what `keyed={false}`
 * costs, observed rather than described.
 *
 * The reversal these claims pin was made on the record. The
 * index-keyed default rested on a compile-time diagnostic for stateful row DOM,
 * and that diagnostic cannot cross a component boundary: `{x => <Row item={x}/>}`
 * with an `<input>` inside `Row` compiles to an opaque call and produces
 * nothing. So the mitigation covered inline stateful tags only — the case a
 * reviewer already catches — and an index default would have shipped a third
 * silent-failure class on purpose.
 *
 * What every claim here has in common is that it observes an UPDATE. The first
 * frame is identical under all three keying modes, which is exactly how 110
 * fixtures missed the `keyed={fn}` miscompile, and it is why a claim that
 * mounted and looked would be worth nothing.
 *
 * The two directions are both asserted, because the trade is real and only one
 * half of it is comfortable:
 *
 *  1. a REORDER of the same items moves each row's nodes with its item, so the
 *  `<input>` the user typed into travels with the row it belongs to;
 *  2. an immutable update that REPLACES the row objects rebuilds every row and
 *  loses that state — the visible performance-and-state cost identity keying
 *  trades for, and the reason `keyed={r => r.id}` exists;
 *  3. under `keyed={false}` the first direction inverts: the nodes stay put and
 *  the VALUES move through them, so the typed text is left behind at slot N.
 *  That is the loss BARQ011 hints at, and the reason it is only a hint — it
 *  is a fact about a spelling the author asked for by hand.
 *
 * K1, K3.
 */
import { For, render, signal } from "@barqjs/core"
import type { Block } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"

export const rules = ["K1", "K3"]

interface Row {
  readonly id: number
  readonly text: string
}

const A: Row = { id: 1, text: "alpha" }
const B: Row = { id: 2, text: "beta" }
const C: Row = { id: 3, text: "gamma" }

const keyless = signal<readonly Row[]>([A, B, C])
const positional = signal<readonly Row[]>([A, B, C])

/** `keyed` absent: identity keying, so the row VALUE is a plain value (O3). */
function Keyless() {
  return (
    <ul class="keyless">
      <For each={() => keyless()}>
        {(row: Row) => (
          <li class="row">
            <input class="note" type="text" />
            <b class="label">{row.text}</b>
          </li>
        )}
      </For>
    </ul>
  )
}

/** `keyed={false}`: positional, so the item arrives as an accessor. */
function Positional() {
  return (
    <ul class="positional">
      <For each={() => positional()} keyed={false}>
        {(row: () => Row) => (
          <li class="row">
            <input class="note" type="text" />
            <b class="label">{() => row().text}</b>
          </li>
        )}
      </For>
    </ul>
  )
}

async function mount(kit: Kit, build: Block<unknown>): Promise<HTMLElement> {
  const host = kit.container()
  const thrown = await kit.attempt(() => {
    render(build as never, host)
  })
  if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0]!.message}`)
  await kit.settle()
  return host
}

interface Observed {
  readonly li: HTMLElement
  readonly label: string
  readonly typed: string
}

/** One frame of the list, as node OBJECTS plus what each row is showing. */
function observe(kit: Kit, host: HTMLElement, selector: string): Observed[] {
  const rows = [...host.querySelectorAll(`${selector} > li.row`)] as HTMLElement[]
  kit.precondition(rows.length === 3, `the list rendered ${rows.length} rows, not 3`)
  return rows.map((li) => ({
    li,
    label: li.querySelector("b.label")?.textContent ?? "",
    typed: (li.querySelector("input.note") as HTMLInputElement | null)?.value ?? "",
  }))
}

/** What a user does: distinct text in each row's field, matched to its label. */
function typeIntoEachRow(frame: readonly Observed[]): void {
  for (const row of frame) {
    const field = row.li.querySelector("input.note") as HTMLInputElement
    field.value = `typed-${row.label}`
    field.dispatchEvent(new Event("input", { bubbles: true }))
  }
}

export const claims: Claim[] = [
  {
    id: "a-reorder-moves-each-row-with-its-item",
    rule: "K1",
    says: "with `keyed` absent the row's identity is the ITEM, so reordering the same objects moves each row's nodes — and the DOM state inside them — rather than rewriting the values through fixed slots",
    async check(kit) {
      keyless.set([A, B, C])
      const host = await mount(kit, Keyless as never)
      const before = observe(kit, host, "ul.keyless")
      kit.precondition(
        before.map((row) => row.label).join(",") === "alpha,beta,gamma",
        `the list started as ${before.map((row) => row.label).join(",")}`,
      )
      typeIntoEachRow(before)
      kit.precondition(
        (before[0]!.li.querySelector("input.note") as HTMLInputElement).value === "typed-alpha",
        "the typed text did not take, so there is no row state to follow",
      )

      // The SAME three objects, in a different order. Nothing about any row
      // changed; only their positions did.
      keyless.set([C, A, B])
      await kit.settle()
      const after = observe(kit, host, "ul.keyless")

      const order = after.map((row) => row.label).join(",")
      if (order !== "gamma,alpha,beta") {
        kit.fail(`the list reordered to ${order}, not gamma,alpha,beta`)
      }
      // The claim: node OBJECT identity followed the item across the move.
      const want = [before[2]!.li, before[0]!.li, before[1]!.li]
      const moved = after.map((row, at) => row.li === want[at])
      if (moved.some((ok) => !ok)) {
        kit.fail(
          `the rows at ${moved.flatMap((ok, at) => (ok ? [] : [at])).join(", ")} are NOT the ` +
            "same elements the items had before the reorder. Under index keying every row is " +
            "rewritten in place, which is what this rule reversed away from",
        )
      }
      const carried = after.map((row) => row.typed).join(",")
      if (carried !== "typed-gamma,typed-alpha,typed-beta") {
        kit.fail(
          `the typed text ended up as ${carried}. It has to travel with the item, not stay at ` +
            "the slot: state the compiler cannot see — a caret, a scroll offset, an open " +
            "<dialog>, a widget behind a ref — is lost exactly the same way",
        )
      }
    },
  },
  {
    id: "replacing-the-items-rebuilds-every-row",
    rule: "K1",
    says: "identity keying's cost is stated rather than assumed: an immutable update that replaces the row objects rebuilds every row, even when the new objects are structurally equal",
    async check(kit) {
      keyless.set([A, B, C])
      const host = await mount(kit, Keyless as never)
      const before = observe(kit, host, "ul.keyless")
      typeIntoEachRow(before)

      // Structurally equal, freshly allocated — the shape an immutable update
      // produces, and the case `keyed={r => r.id}` exists for.
      keyless.set([
        { id: 1, text: "alpha" },
        { id: 2, text: "beta" },
        { id: 3, text: "gamma" },
      ])
      await kit.settle()
      const after = observe(kit, host, "ul.keyless")

      const survivors = after.filter((row) => before.some((was) => was.li === row.li))
      if (survivors.length > 0) {
        kit.fail(
          `${survivors.length} of 3 rows survived a full item replacement. K1 says the item IS ` +
            "the identity, so a new object is a new row; a survivor here would mean the runtime " +
            "is comparing something other than the item and the `{row.text}` read — which is " +
            "applied ONCE, with no thunk (O3) — would be stale",
        )
      }
      const carried = after.map((row) => row.typed).join(",")
      if (carried !== ",,") {
        kit.fail(
          `the rebuilt rows carried ${carried} forward, so they were not rebuilt. The state ` +
            "loss is the DECLARED cost of this default, and a claim that let it pass silently " +
            "would be certifying the opposite rule",
        )
      }
    },
  },
  {
    id: "positional-rows-leave-their-dom-state-behind",
    rule: "K3",
    says: "`keyed={false}` binds the row to the SLOT, so a reorder rewrites the values through fixed nodes and the DOM state inside them stays at the position — which is what BARQ011 hints at, and all it claims",
    async check(kit) {
      positional.set([A, B, C])
      const host = await mount(kit, Positional as never)
      const before = observe(kit, host, "ul.positional")
      kit.precondition(
        before.map((row) => row.label).join(",") === "alpha,beta,gamma",
        `the list started as ${before.map((row) => row.label).join(",")}`,
      )
      typeIntoEachRow(before)

      positional.set([C, A, B])
      await kit.settle()
      const after = observe(kit, host, "ul.positional")

      const order = after.map((row) => row.label).join(",")
      if (order !== "gamma,alpha,beta") {
        kit.fail(`the list reordered to ${order}, not gamma,alpha,beta`)
      }
      // The mirror image of K1's claim, and the reason the default is not this.
      const stayed = after.every((row, at) => row.li === before[at]!.li)
      if (!stayed) {
        kit.fail(
          "the positional rows moved their nodes. `keyed={false}` reuses slot N for whatever " +
            "item is at index N — if the nodes travelled, the mode is not positional at all",
        )
      }
      const carried = after.map((row) => row.typed).join(",")
      if (carried !== "typed-alpha,typed-beta,typed-gamma") {
        kit.fail(
          `the typed text ended up as ${carried}, so it did not stay at its slot. The whole ` +
            "content of K3 is that this state belongs to the position here, and BARQ011 is a " +
            "hint about markup the compiler can see rather than a guarantee about any of it",
        )
      }
    },
  },
]
