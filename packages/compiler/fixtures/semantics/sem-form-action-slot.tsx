/**
 * B8 — `action` on a `<form>` is decided by the SLOT, not by the value's shape.
 *
 * A string is the form's URL and a function is its submit handler. Nothing
 * about the expression separates them: an `action()` is `(...args) =>
 * Promise<R>`, so its arity is 0 and the arity rule reads it as a Cell. The slot is
 * the only thing that can decide, exactly as it is for `on*` (the `is_cell`
 * exception).
 *
 * The first two claims are the defect that shipped, and they are separate
 * because it failed twice in one line. Routing `action` down the attribute
 * channel put the function through `bindProp`, which applied the arity rule to it:
 * the action was CALLED at mount, and the promise it returned was written into
 * the form's target as `action="[object Promise]"`. Neither reported anything.
 *
 * The third claim is the behaviour the surface exists for, and the fourth is the
 * CONTROL — without it, "no attribute was written" and "the whole channel is
 * dead" are the same observation.
 *
 * B8.
 */
import { action, render } from "@barqjs/core"

import type { Claim, Kit } from "../../test/semantics-support.ts"

export const rules = ["B8"]

export const seen: FormData[] = []
let ran = 0

const submit = action(function* (data: FormData) {
  ran++
  seen.push(data)
  yield Promise.resolve()
})

export default function SemFormActionSlot() {
  return (
    <form action={submit} class="handler">
      <input name="title" value="hello" />
      <button type="submit" name="intent" value="save">
        go
      </button>
    </form>
  )
}

/** The CONTROL: the same attribute holding a string is still the form's URL. */
export function AsUrl() {
  return (
    <form action="/submit" class="url">
      <input name="title" value="hello" />
    </form>
  )
}

let previous: (() => void) | null = null

async function mount(kit: Kit, which: "handler" | "url"): Promise<HTMLElement> {
  previous?.()
  previous = null
  ran = 0
  seen.length = 0
  const host = kit.container()
  let dispose: (() => void) | undefined
  const thrown = await kit.attempt(() => {
    dispose = render(() => (which === "handler" ? <SemFormActionSlot /> : <AsUrl />), host)
  })
  previous = dispose ?? null
  if (thrown.length > 0) kit.fail(`the mount itself threw: ${thrown[0].message}`)
  return host
}

export const claims: Claim[] = [
  {
    id: "the-handler-is-not-called-to-obtain-an-attribute",
    rule: "B8",
    says: "a function in the action slot is the submit handler, so nothing calls it at construction",
    async check(kit) {
      await mount(kit, "handler")
      await kit.settle()
      if (ran !== 0) {
        kit.fail(
          `the action ran ${ran} time(s) at mount. That is §3.0 rule 1 applied to a slot it does ` +
            "not govern: an `action()` declares rest parameters, so its arity is 0 and the " +
            "attribute channel read it as a Cell to be called for its value",
        )
      }
    },
  },
  {
    id: "the-handler-is-never-serialised-into-the-form-target",
    rule: "B8",
    says: "no `action` attribute is written for a handler, so the form's target is not a stringified function or promise",
    async check(kit) {
      const host = await mount(kit, "handler")
      await kit.settle()
      const form = host.querySelector("form.handler")
      kit.precondition(form !== null, "the form did not render")
      const written = form?.getAttribute("action") ?? null
      if (written !== null) {
        kit.fail(
          `the form's target is ${JSON.stringify(written)}. Before M10 this read ` +
            '"[object Promise]" — the attribute channel called the action and serialised what it ' +
            "returned — and the form posted to a relative URL named after a promise",
        )
      }
    },
  },
  {
    id: "submitting-calls-the-action-with-the-forms-data",
    rule: "B8",
    says: "the handler receives the form's fields and the submitter's own name and value, and the browser does not navigate",
    async check(kit) {
      const host = await mount(kit, "handler")
      await kit.settle()
      const button = host.querySelector("button")
      kit.precondition(button !== null, "the submit button did not render")

      const before = globalThis.location?.href
      button?.click()
      await kit.settle()

      if (ran !== 1) {
        kit.fail(`the action ran ${ran} time(s) on submit; B8 says exactly once`)
        return
      }
      const data = seen[0]
      if (!(data instanceof FormData)) {
        kit.fail(`the handler received ${typeof data}, not a FormData`)
        return
      }
      if (data.get("title") !== "hello") {
        kit.fail(`the payload's \`title\` is ${JSON.stringify(data.get("title"))}, not "hello"`)
      }
      // A `<button name="intent">` is how a form says WHICH action it means.
      // Dropping the submitter would make every button look alike.
      if (data.get("intent") !== "save") {
        kit.fail(
          `the submitter's own name/value is missing: \`intent\` is ` +
            `${JSON.stringify(data.get("intent"))}, not "save"`,
        )
      }
      if (globalThis.location?.href !== before) {
        kit.fail("the browser navigated; a handled submit must have its default prevented")
      }
    },
  },
  {
    id: "a-string-in-the-same-slot-is-still-the-url",
    rule: "B8",
    says: "the CONTROL — `action` holding a string is the attribute it always was",
    async check(kit) {
      const host = await mount(kit, "url")
      await kit.settle()
      const form = host.querySelector("form.url")
      kit.precondition(form !== null, "the control form did not render")
      const written = form?.getAttribute("action") ?? null
      if (written !== "/submit") {
        kit.fail(
          `the URL form's target is ${JSON.stringify(written)}, not "/submit". Without this ` +
            'claim, "a handler writes no attribute" and "this channel writes nothing at all" ' +
            "are the same observation",
        )
      }
    },
  },
]
