import { signal } from "@barqjs/core"

export const body = signal("\nfirst line\nsecond line")
export const draft = signal("\ndraft")

/**
 * O9 where the compiler cannot see the newline: a HOLE leading a newline-eating
 * element.
 *
 * `pre-leading-newline` carries the literal half, and the two backends answer it
 * differently for a reason. In a template a hole materialises nothing, so the
 * parser's U+000A lands on the text BEHIND it and the DOM rule looks past the
 * hole to find it. In a string the hole writes the VALUE's own bytes against the
 * open tag, and the compiler cannot see their first one — so the string backend
 * owes the parser a newline of its own to eat, and the value reaches the DOM
 * whole either way.
 *
 * Without it the client keeps a leading newline the server drops:
 * `insert`/`createElement` build a text node no parser ever reads, while the
 * markup `<pre>\nfirst line</pre>` parses to "first line" in real Chrome
 * (`browser-parse-check.ts`, `pre eats a lone newline`). The steps drive the
 * value to one that does NOT lead with a newline, where the guard is eaten and
 * nothing else is.
 *
 * The MIXED shape — a hole, then a literal newline the DOM backend doubles and
 * the string backend leaves for the guard — is deliberately not here. happy-dom
 * eats neither, so the doubled template text reads one newline longer than the
 * oracle's nodes and the fixture would go red for a reason no browser has. Its
 * DOM half is `fixtures/browser-only/pre-hole-newline.tsx`, driven in real
 * Chrome, and its string half is a byte assertion in `test/ssr.test.ts`.
 */
export default function PreDynamicLeadingNewline() {
  return (
    <div class="doc">
      <pre class="hole">{() => body()}</pre>
      <textarea class="field">{() => draft()}</textarea>
    </div>
  )
}

export const steps = [() => body.set("no newline"), () => draft.set("")]

export const optimality = {
  target: 3,
  milestone: 6,
  // The `<textarea>` holding a hole is refused, so it leaves the template.
  templates: 1,
  // Nothing LITERAL leads either element, so the DOM template doubles nothing:
  // the newline it would have doubled is inside a value the template never sees.
  emits: ['<pre class="hole"></pre>'],
  // A character reference does not escape the rule — the tokenizer emits the
  // same character token — so it is never how a newline reaches the wire.
  absent: ["&#10;", '<pre class="hole">\n'],
}
