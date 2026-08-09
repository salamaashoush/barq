import { signal } from "@barqjs/core"

export const tail = signal("x")

/**
 * A text run carrying `>`, followed by an element, a hole and another element —
 * the shape that made the two parsers in this harness disagree about how many
 * nodes a walk crosses.
 *
 * happy-dom splits a text run on a bare `>` where Chrome keeps one node, so
 * `firstChild.nextSibling` landed on `<span>` in Chrome and on a text node in
 * happy-dom. The compiler now escapes `>` as `&gt;` in template text, which is
 * what the HTML serialization spec writes anyway; this fixture is the corpus
 * evidence that the byte cannot come back.
 */
export default function TextGtHole() {
  return (
    <div>
      a &amp; b &gt; c<span>tail</span>
      {() => tail()}
      <b>end</b>
    </div>
  )
}

export const steps = [() => tail.set("y"), () => tail.set("")]
