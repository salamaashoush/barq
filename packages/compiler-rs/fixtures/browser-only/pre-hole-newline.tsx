import { signal } from "@barqjs/core"

export const head = signal("A")

/**
 * O9 against target #9: a hole in front of the newline-eating position.
 *
 * "In body" ignores ONE U+000A character token directly after `<pre>`, so the
 * skeleton doubles a leading newline. A `Slot` materialises NOTHING, so once P5
 * elided the `<!---->` that used to stand in front of it the newline was back
 * against the open tag and the parser ate it again — in a REAL browser only.
 * happy-dom does not implement the rule at all, and `browser-parse-check.ts`
 * compares tags, roots and comments but never text, so the Chrome differential
 * on this fixture is the only thing that can see it.
 */
export default function PreHoleNewline() {
  return <pre>{() => head()}&#10;hello</pre>
}

export const steps = [() => head.set("B"), () => head.set("")]
