/**
 * B7 — a write that LANDS preserves the selection and the focus.
 *
 * B6 is the write that is skipped; this is the write that is not. When the
 * signal genuinely changes while the user is inside the control, the value has
 * to be written, and `element.value = x` moves the text entry cursor to the end
 * of the control (HTML §4.10.5.5). Everything the user had selected is gone and
 * the next character they type lands in the wrong place.
 *
 * This project has shipped this exact failure once already — replace-based
 * hydration lost focus and discarded typed input at every page size — and it
 * was caught by MEASURING rather than by testing. So the caret is asserted as a
 * NUMBER before and after, on every element kind the channel admits, and the
 * one that matters most is driven the way a browser drives it: the value is set
 * and the caret is moved (which is what a keystroke IS), the edit is reported,
 * and only then does the external write arrive.
 *
 * `test/browser-caret-check.ts` asks the same question of real Chrome with real
 * keystrokes over CDP. Both are kept: this pins the arithmetic — which offsets,
 * clamped how — and Chrome pins that the arithmetic is about the right thing.
 *
 * SEMANTICS.md §9 B7.
 */
import { render, signal } from "@barqjs/core"
import type { Block } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"

export const rules = ["B7"]

const text = signal("hello world")
const area = signal("first line")
const choice = signal("b")
const ticked = signal(false)
const group = signal("y")
const rich = signal("editable text")

function Field() {
  return <input type="text" class="field" bind:value={text} />
}

function Area() {
  return <textarea class="area" bind:value={area} />
}

function Picker() {
  return (
    <select class="picker" bind:value={choice}>
      <option value="a">a</option>
      <option value="b">b</option>
      <option value="c">c</option>
    </select>
  )
}

function Box() {
  return <input type="checkbox" class="box" bind:value={ticked} />
}

function Radios() {
  return (
    <form>
      <input type="radio" class="rx" name="g" value="x" bind:group={group} />
      <input type="radio" class="ry" name="g" value="y" bind:group={group} />
    </form>
  )
}

function Rich() {
  return <div class="rich" contenteditable="true" bind:value={rich} />
}

async function mount(kit: Kit, build: Block<unknown>) {
  const host = kit.container()
  const thrown = await kit.attempt(() => {
    render(build as never, host)
  })
  if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0]!.message}`)
  await kit.settle()
  return host
}

interface TextControl extends HTMLElement {
  value: string
  selectionStart: number | null
  selectionEnd: number | null
  selectionDirection: string | null
  setSelectionRange(start: number, end: number, direction?: string): void
}

/** What a keystroke IS: the value moves, the caret moves, the edit is reported. */
function typeInto(element: TextControl, next: string, caret: number): void {
  element.value = next
  element.setSelectionRange(caret, caret)
  element.dispatchEvent(new Event("input", { bubbles: true }))
}

function find<T extends Element>(kit: Kit, host: HTMLElement, selector: string): T {
  const found = host.querySelector(selector)
  if (found === null) kit.fail(`${selector} never rendered`)
  return found as T
}

export const claims: Claim[] = [
  {
    id: "an-external-write-during-typing-keeps-the-caret",
    rule: "B7",
    says: "the caret and the selection range survive a write that arrives from elsewhere while the user is inside the field",
    async check(kit) {
      text.set("hello world")
      const host = await mount(kit, Field as never)
      const field = find<TextControl>(kit, host, "input.field")

      field.focus()
      typeInto(field, "hello worlds", 6)
      field.setSelectionRange(2, 7, "backward")
      const before = [field.selectionStart, field.selectionEnd, field.selectionDirection] as const
      kit.precondition(
        before[0] === 2 && before[1] === 7,
        `the selection did not take: ${before[0]}..${before[1]}`,
      )

      // From elsewhere, mid-typing, and long enough that no clamp is involved.
      text.set("hello there world")
      await kit.settle()

      if (field.value !== "hello there world") {
        kit.fail(`the external write never landed: the field reads ${JSON.stringify(field.value)}`)
      }
      if (field.selectionStart !== 2 || field.selectionEnd !== 7) {
        kit.fail(
          `the caret moved to ${field.selectionStart}..${field.selectionEnd}; it was ` +
            `${before[0]}..${before[1]} before the write. Assigning \`value\` moves the text ` +
            "entry cursor to the end of the control, so the range has to be saved and restored " +
            "around the write",
        )
      }
      if (field.selectionDirection !== before[2]) {
        kit.fail(`the direction became ${field.selectionDirection}, was ${before[2]}`)
      }
      if (host.ownerDocument.activeElement !== field) {
        kit.fail("the field lost focus to the write")
      }
    },
  },
  {
    id: "a-shorter-value-clamps-rather-than-throwing",
    rule: "B7",
    says: "a restore is clamped to the text that is now there, so a write that shortens the value puts the caret at the end instead of throwing or landing past it",
    async check(kit) {
      text.set("hello world")
      const host = await mount(kit, Field as never)
      const field = find<TextControl>(kit, host, "input.field")
      field.focus()
      field.setSelectionRange(6, 11)
      text.set("hi")
      await kit.settle()
      if (field.value !== "hi") kit.fail(`the write never landed: ${JSON.stringify(field.value)}`)
      if (field.selectionStart !== 2 || field.selectionEnd !== 2) {
        kit.fail(`the caret is at ${field.selectionStart}..${field.selectionEnd}, not clamped to 2`)
      }
    },
  },
  {
    id: "a-textarea-is-the-same-channel",
    rule: "B7",
    says: "a textarea's caret survives an external write exactly as an input's does",
    async check(kit) {
      area.set("first line")
      const host = await mount(kit, Area as never)
      const box = find<TextControl>(kit, host, "textarea.area")
      box.focus()
      typeInto(box, "first lines", 5)
      box.setSelectionRange(3, 5)
      area.set("second line here")
      await kit.settle()
      if (box.value !== "second line here") {
        kit.fail(`the write never landed: ${JSON.stringify(box.value)}`)
      }
      if (box.selectionStart !== 3 || box.selectionEnd !== 5) {
        kit.fail(`the caret moved to ${box.selectionStart}..${box.selectionEnd}, was 3..5`)
      }
    },
  },
  {
    id: "a-select-keeps-its-focus-across-an-external-write",
    rule: "B7",
    says: "a select has no caret, so what must survive is the focus — the next keystroke has to still reach it",
    async check(kit) {
      choice.set("b")
      const host = await mount(kit, Picker as never)
      const picker = find<HTMLSelectElement>(kit, host, "select.picker")
      kit.precondition(picker.value === "b", `the select started at ${picker.value}`)
      picker.focus()
      kit.precondition(
        host.ownerDocument.activeElement === picker,
        "the select never took focus, so there is nothing to preserve",
      )
      choice.set("c")
      await kit.settle()
      if (picker.value !== "c") kit.fail(`the write never landed: the select reads ${picker.value}`)
      if (host.ownerDocument.activeElement !== picker) {
        kit.fail("the select lost focus to the write")
      }
      // And the other direction, through the event it reports on.
      picker.value = "a"
      picker.dispatchEvent(new Event("change", { bubbles: true }))
      if (choice.peek() !== "a") kit.fail(`the change never reached the signal: ${choice.peek()}`)
    },
  },
  {
    id: "a-checkbox-keeps-its-focus-across-an-external-write",
    rule: "B7",
    says: "the same for a checkbox, whose write is a boolean and whose focus is just as losable",
    async check(kit) {
      ticked.set(false)
      const host = await mount(kit, Box as never)
      const box = find<HTMLInputElement>(kit, host, "input.box")
      box.focus()
      kit.precondition(host.ownerDocument.activeElement === box, "the checkbox never took focus")
      ticked.set(true)
      await kit.settle()
      if (box.checked !== true) kit.fail("the write never landed")
      if (host.ownerDocument.activeElement !== box) kit.fail("the checkbox lost focus to the write")
    },
  },
  {
    id: "a-radio-group-is-one-signal-and-keeps-its-focus",
    rule: "B7",
    says: "`bind:group` writes `checked` from the member's own value and reports the value of whichever member the user turned ON — and the focused member keeps the focus across a write",
    async check(kit) {
      group.set("y")
      const host = await mount(kit, Radios as never)
      const x = find<HTMLInputElement>(kit, host, "input.rx")
      const y = find<HTMLInputElement>(kit, host, "input.ry")
      if (y.checked !== true || x.checked !== false) {
        kit.fail(`the group did not seed from the signal: x=${x.checked} y=${y.checked}`)
      }
      y.focus()
      // The user moves to x, which is what a browser reports: the newly checked
      // member fires `change`; the one being turned off reports nothing.
      x.checked = true
      y.checked = false
      x.dispatchEvent(new Event("change", { bubbles: true }))
      if (group.peek() !== "x") kit.fail(`the group signal reads ${JSON.stringify(group.peek())}`)

      group.set("y")
      await kit.settle()
      if (y.checked !== true || x.checked !== false) {
        kit.fail(`an external write did not move the group: x=${x.checked} y=${y.checked}`)
      }
      if (host.ownerDocument.activeElement !== y) kit.fail("the radio lost focus to the write")
    },
  },
  {
    id: "a-contenteditable-caret-is-preserved-by-text-offset",
    rule: "B7",
    says: "a contenteditable has no `value` and no selectionStart, so its caret is saved as a TEXT OFFSET and survives the replacement of the very text node it was in",
    async check(kit) {
      rich.set("editable text")
      const host = await mount(kit, Rich as never)
      const editor = find<HTMLElement>(kit, host, "div.rich")
      if (editor.textContent !== "editable text") {
        kit.fail(`the editor seeded as ${JSON.stringify(editor.textContent)}`)
      }
      const view = host.ownerDocument.defaultView
      const selection = view?.getSelection?.()
      kit.precondition(
        selection !== null && selection !== undefined,
        "this DOM has no Selection, so there is no caret to preserve",
      )
      editor.focus()
      const node = editor.firstChild
      kit.precondition(node !== null, "the editor has no text node to put a caret in")
      // The RANGE rather than the anchor/focus pair: a range is what every DOM
      // agrees on, and happy-dom's `focusOffset` returns the anchor's.
      const put = host.ownerDocument.createRange()
      put.setStart(node, 4)
      put.setEnd(node, 9)
      selection.removeAllRanges()
      selection.addRange(put)
      const seeded = selection.getRangeAt(0)
      kit.precondition(
        seeded.startOffset === 4 && seeded.endOffset === 9,
        `the selection did not take: ${seeded.startOffset}..${seeded.endOffset}`,
      )

      rich.set("editable words here")
      await kit.settle()

      if (editor.textContent !== "editable words here") {
        kit.fail(`the write never landed: ${JSON.stringify(editor.textContent)}`)
      }
      const after = view!.getSelection()!
      if (after.rangeCount === 0) kit.fail("the caret was dropped entirely by the write")
      const range = after.getRangeAt(0)
      const offsets = `${range.startOffset}..${range.endOffset}`
      if (!editor.contains(range.startContainer)) {
        kit.fail("the caret left the editor entirely when its text node was replaced")
      }
      if (offsets !== "4..9") {
        kit.fail(
          `the caret is at ${offsets}, was 4..9. Writing \`textContent\` replaces the text node, ` +
            "so the offset has to be saved against the ELEMENT and re-resolved afterwards",
        )
      }
    },
  },
  {
    id: "control-a-write-the-compare-skips-does-not-touch-the-caret-either",
    rule: "B7",
    says: "the preservation is not doing the compare's job: when the value is already what the signal holds, nothing is written and the caret is untouched — without this claim a channel that saved and restored on EVERY run would pass all of the above",
    async check(kit) {
      text.set("hello world")
      const host = await mount(kit, Field as never)
      const field = find<TextControl>(kit, host, "input.field")
      field.focus()
      field.setSelectionRange(3, 8, "backward")
      // A different signal changes; this element's own value does not.
      typeInto(field, "hello world", 11)
      field.setSelectionRange(3, 8, "backward")
      await kit.settle()
      if (field.selectionStart !== 3 || field.selectionEnd !== 8) {
        kit.fail(`the caret moved to ${field.selectionStart}..${field.selectionEnd} with no write`)
      }
      if (field.selectionDirection !== "backward") {
        kit.fail(`the direction became ${field.selectionDirection} with no write`)
      }
    },
  },
]
