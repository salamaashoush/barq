import { signal } from "@barqjs/core"

export const tail = signal("one")

/**
 * O9 in the MAIN corpus: text that really does begin with a newline, inside the
 * three tags whose first U+000A the parser ignores.
 *
 * A DOUBLED newline is the only spelling that yields a text node reading "\na"
 * — a character reference does not escape the rule, because the tokenizer emits
 * the same character token for it — so the compiler doubles a leading newline
 * on both backends. Every engine then loses one again on the way out: the spec
 * says a serialiser writes the newline back and real Chrome does not, so a byte
 * comparison between an SSR string and a serialised DOM differs by exactly one
 * newline while a tree comparison in a real browser does not differ at all.
 *
 * That is why this shape had no fixture until now. happy-dom implements neither
 * half — it does not eat the newline and does not write one back — so the
 * fixture went red there for a reason a real browser does not have.
 * `normalize.ts` and `ssr.ts` now canonicalise the leading run, each for the
 * half of the round trip that is actually lossy, and the exact byte count is
 * pinned where it can be: `compile.rs`'s two O9 tests over the emitted template
 * and the three rows `browser-parse-check.ts` measures in real Chrome.
 */
export default function PreLeadingNewline() {
  return (
    <div class="doc">
      <pre class="block">&#10;line one&#10;line two</pre>
      <pre class="plain">no leading newline</pre>
      <textarea class="field">&#10;draft</textarea>
      <p class="tail">{() => tail()}</p>
    </div>
  )
}

export const steps = [() => tail.set("two"), () => tail.set("")]

export const optimality = {
  target: 3,
  milestone: 6,
  templates: 1,
  // The doubling, and only where a newline leads. `<pre class="plain">` proves
  // the rule is about the first byte rather than about the tag.
  emits: ['<pre class="block">\n\nline one\nline two</pre>', '<textarea class="field">\n\ndraft'],
  // The rule is about the first BYTE, not about the tag. A character reference
  // would not have worked at all: the tokenizer emits the same character token
  // for it, so the parser eats it just the same.
  absent: ['<pre class="plain">\n', "&#10;"],
}
