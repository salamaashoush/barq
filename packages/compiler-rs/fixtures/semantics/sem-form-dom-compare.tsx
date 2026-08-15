/**
 * B6 — a user-mutable property is compared against the ELEMENT.
 *
 * Two writers, one property. Every other prop on an element has exactly one
 * writer, which is why the fused record's `!==` guard is correct for all of
 * them and wrong for these: its subject is what the FRAMEWORK last wrote, and
 * the user writes here too.
 *
 * The claims are driven through real `input` and `change` events, because the
 * defect is invisible to anything that writes `.value` and reads it back. The
 * first claim is the rejecting setter — the defining case controlled inputs
 * exist for — and it needs BOTH halves of the rule: the compare cannot repair
 * it on its own, because a rejected keystroke leaves the signal unchanged and
 * the effect therefore never re-runs at all.
 *
 * The last claim is the CONTROL. Without it "the element holds the signal's
 * value" is also satisfied by a framework that writes the property on every
 * animation frame, or by one that never lets the user's keystroke land in the
 * first place — so it asserts that an ACCEPTED edit reaches the signal and is
 * not overwritten.
 *
 * SEMANTICS.md §9 B6.
 */
import { render, signal } from "@barqjs/core"
import type { Block } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"

export const rules = ["B6"]

/** Digits are refused. The signal does not change, so nothing re-runs. */
const guarded = signal("")
const guardedSet = (next: unknown): void => {
  guarded.set(String(next).replace(/[0-9]/g, ""))
}

const plain = signal("start")
const ticked = signal(false)

const writable = {
  guarded: Object.assign(() => guarded(), { set: guardedSet, peek: () => guarded.peek() }),
}

function Guarded() {
  return <input type="text" class="guarded" bind:value={writable.guarded} />
}

function Plain() {
  return <input type="text" class="plain" bind:value={plain} />
}

function Box() {
  return <input type="checkbox" class="box" bind:value={ticked} />
}

/**
 * The per-pair partition, in one module: the `<input>`'s `value` is the user's
 * and reaches the compare-against-the-element channel; the `<option>`'s is not
 * and keeps the plain property channel.
 */
function Partition() {
  return (
    <form>
      <input type="text" class="field" value={() => plain()} />
      <select class="picker">
        <option value={() => plain()}>one</option>
      </select>
    </form>
  )
}

async function mount(kit: Kit, build: Block<unknown>) {
  const host = kit.container()
  const thrown = await kit.attempt(() => {
    render(build as never, host)
  })
  if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0]!.message}`)
  return host
}

/** What a keystroke IS: the browser updates the value, then reports it. */
function type(element: HTMLInputElement, text: string): void {
  element.value = text
  element.dispatchEvent(new Event("input", { bubbles: true }))
}

export const claims: Claim[] = [
  {
    id: "a-rejected-keystroke-is-repaired-inside-the-event",
    rule: "B6",
    says: "when the setter refuses an edit the element holds the signal's value again by the time the event returns, even though the signal never changed and no effect re-ran",
    async check(kit) {
      guarded.set("")
      const host = await mount(kit, Guarded as never)
      const input = host.querySelector("input.guarded") as HTMLInputElement | null
      if (input === null) kit.fail("the guarded input never rendered")
      kit.precondition(input.value === "", `the input started at ${JSON.stringify(input.value)}`)

      type(input, "a1")
      // Synchronously, with no settle: the repair is inside the event, before
      // paint, so the rejected character is never displayed.
      if (guarded.peek() !== "a") {
        kit.fail(`the setter did not run: the signal reads ${JSON.stringify(guarded.peek())}`)
      }
      if (input.value !== "a") {
        kit.fail(
          `the element still reads ${JSON.stringify(input.value)} after the setter refused the ` +
            "digit. The signal did not change, so the effect never re-ran and no cached compare " +
            "could have repaired it — B6 says the write is re-asserted inside the reported edit",
        )
      }
      await kit.settle()
      if (input.value !== "a") {
        kit.fail(`the flush undid the repair: the element reads ${JSON.stringify(input.value)}`)
      }
    },
  },
  {
    id: "a-second-rejected-keystroke-is-repaired-too",
    rule: "B6",
    says: "the repair is not a one-shot: a framework that cached its last write would compare equal on the second rejection and stop repairing",
    async check(kit) {
      guarded.set("")
      const host = await mount(kit, Guarded as never)
      const input = host.querySelector("input.guarded") as HTMLInputElement | null
      if (input === null) kit.fail("the guarded input never rendered")
      type(input, "a1")
      type(input, "a2")
      if (input.value !== "a") {
        kit.fail(
          `the second rejection was not repaired: the element reads ` +
            `${JSON.stringify(input.value)} while the signal reads ` +
            `${JSON.stringify(guarded.peek())}`,
        )
      }
    },
  },
  {
    id: "the-channel-is-resolved-per-tag-and-property",
    rule: "B6",
    says: "an option's `value` is NOT user-mutable, so it keeps the plain property channel — a compare against the element would report `already holds it` from the option's own text and the reflected attribute would never appear",
    async check(kit) {
      // Behavioural, not emitted: the same claim has to hold through the
      // reference backend, whose ops table names no channel a regex can find.
      // The EMISSION half of the partition is `tables.test.ts`'s per-pair row.
      plain.set("start")
      const host = await mount(kit, Partition as never)
      await kit.settle()
      const option = host.querySelector("option")
      if (option === null) kit.fail("the option never rendered")
      if (option.getAttribute("value") !== "start") {
        kit.fail(
          `the option carries value=${JSON.stringify(option.getAttribute("value"))}. ` +
            "`option.value` falls back to the option's TEXT, so a compare against the element " +
            "skips the write and the reflected attribute never appears — which is why B6's " +
            "table is keyed by the PAIR",
        )
      }
      const field = host.querySelector("input.field") as HTMLInputElement | null
      if (field === null) kit.fail("the input never rendered")
      if (field.value !== "start") kit.fail(`the input reads ${JSON.stringify(field.value)}`)
    },
  },
  {
    id: "a-write-of-the-value-the-element-already-holds-does-not-happen",
    rule: "B6",
    says: "the compare SKIPS the write — counted on the element itself, because `the DOM ends up correct` is satisfied by writing every time and is not what the rule says",
    async check(kit) {
      plain.set("start")
      const host = await mount(kit, Plain as never)
      const input = host.querySelector("input.plain") as HTMLInputElement | null
      if (input === null) kit.fail("the plain input never rendered")

      // A counting accessor on the INSTANCE, installed after the seeding write.
      // `holdsLive` reads the property, so it goes through the getter; the
      // setter is the thing B6 says must not run.
      let held = input.value
      let writes = 0
      Object.defineProperty(input, "value", {
        configurable: true,
        get: () => held,
        set: (next: string) => {
          writes += 1
          held = next
        },
      })

      // A reported edit that changes nothing. It re-asserts the signal and it
      // re-runs every two-way binding — two chances to write, and the element
      // already holds the value, so B6 says neither of them takes it.
      input.dispatchEvent(new Event("input", { bubbles: true }))
      await kit.settle()
      if (writes !== 0) {
        kit.fail(
          `the channel wrote the property ${writes} time(s) with the element already holding ` +
            `${JSON.stringify(held)}. B6 says the compare is against the ELEMENT, and a channel ` +
            "that writes anyway is one that rewrites the field on every keystroke",
        )
      }

      // A value the element does NOT hold: exactly one write, so the compare is
      // a compare rather than an unconditional refusal.
      plain.set("moved")
      await kit.settle()
      if (writes !== 1) {
        kit.fail(`a genuine change produced ${writes} write(s), not 1; the element holds ${held}`)
      }

      // And the coercion is part of the compare: `input.value` is a DOMString,
      // so a signal moving from "moved" to the NUMBER 7 must write once, and
      // moving from 7 to the string "7" must not write at all.
      ;(plain as unknown as { set(next: unknown): void }).set(7)
      await kit.settle()
      if (writes !== 2 || held !== "7") {
        kit.fail(`the number did not land as "7": ${writes} write(s), the element holds ${held}`)
      }
      plain.set("7")
      await kit.settle()
      if (writes !== 2) {
        kit.fail(
          `the string "7" was written over the DOMString "7" the element already held ` +
            `(${writes} writes). \`coerceLive\` is part of the compare, not a nicety`,
        )
      }
      plain.set("start")
    },
  },
  {
    id: "control-an-accepted-edit-reaches-the-signal-and-survives",
    rule: "B6",
    says: "an edit the setter accepts lands in the signal and is NOT overwritten — without this the two claims above are also satisfied by a channel that simply refuses to let the user type",
    async check(kit) {
      plain.set("start")
      ticked.set(false)
      const host = await mount(kit, Plain as never)
      const input = host.querySelector("input.plain") as HTMLInputElement | null
      if (input === null) kit.fail("the plain input never rendered")
      type(input, "edited")
      if (plain.peek() !== "edited") {
        kit.fail(`the edit never reached the signal: it reads ${JSON.stringify(plain.peek())}`)
      }
      await kit.settle()
      if (input.value !== "edited") {
        kit.fail(`the element was overwritten: it reads ${JSON.stringify(input.value)}`)
      }
    },
  },
  {
    id: "control-a-checkbox-reports-through-its-own-channel",
    rule: "B6",
    says: "`bind:value` on a checkbox resolves to `checked`/`change`, and the boolean round-trips both ways",
    async check(kit) {
      ticked.set(false)
      const host = await mount(kit, Box as never)
      const box = host.querySelector("input.box") as HTMLInputElement | null
      if (box === null) kit.fail("the checkbox never rendered")
      if (box.checked !== false) kit.fail("the checkbox did not start unchecked")
      box.checked = true
      box.dispatchEvent(new Event("change", { bubbles: true }))
      if (ticked.peek() !== true) kit.fail("the tick never reached the signal")
      ticked.set(false)
      await kit.settle()
      if (box.checked !== false) kit.fail("writing the signal did not clear the checkbox")
    },
  },
]
