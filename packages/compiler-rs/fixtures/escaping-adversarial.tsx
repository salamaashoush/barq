import { signal } from "@barqjs/core"

export const markup = signal('<img src=x onerror="alert(1)">')
export const quoted = signal('" onmouseover="alert(1)" data-x="')
export const amp = signal("a & b &amp; c &#38; d")

/**
 * Values that are themselves markup, in every context that escapes them
 * differently.
 *
 * On the DOM path none of this needs escaping at all — a hole becomes a text
 * node and an attribute goes through `setAttribute`, so the bytes cannot be
 * parsed as anything. That is exactly why this fixture matters: the SSR backend
 * has to reproduce, by escaping at the right moment, a safety the DOM path gets
 * for free, and the two are compared against each other. An SSR escaping bug is
 * an XSS hole on every page the compiler touches.
 *
 * `escaped-text-and-attribute` covers the STATIC half, where the compiler folds
 * the escaped bytes into the template at compile time. This is the dynamic half:
 * the value is not known until the render, so nothing can be folded and the
 * escaping has to happen at the seam.
 *
 * The contexts, and why each is different:
 *
 *  - text — `<` opens a tag and `&` opens a reference.
 *  - a double-quoted attribute — `"` closes the value and lets the next
 *    characters become ATTRIBUTES, which is how `onmouseover=` gets in.
 *  - `<pre>` — whitespace is significant, so an escaper that normalises it
 *    changes the rendered text.
 *  - `<title>` and `<textarea>` — escapable raw text: `<` and `&` are escaped,
 *    but a tag inside is NOT a tag.
 *  - `<style>` — raw text: nothing is escaped, and the only thing that can end
 *    it is the literal closing tag.
 *
 * The static text carries a non-BMP astral character, U+2028, and a NBSP, all
 * of which survive a byte-for-byte copy and none of which survive a naive
 * per-char escaper that assumes UTF-16 code units are characters.
 */
export default function EscapingAdversarial() {
  return (
    <div class="adv">
      <p class="text">{() => markup()}</p>
      <p class="attr" title={() => quoted()} data-amp={() => amp()}>
        attr
      </p>
      <p class="static" title={'" onload="x'}>
        {"<b>not markup</b> &   \u{1D54F}   done"}
      </p>
      <pre class="pre">{() => markup()}</pre>
      <textarea class="area">{() => markup()}</textarea>
      <style class="sheet">{".adv { color: red }"}</style>
    </div>
  )
}

export const steps = [
  () => markup.set("</p><script>alert(1)</script>"),
  () => quoted.set("]]> --> &lt; <!--"),
  () => amp.set("\u{1F600}\u{20B9E} &nbsp;"),
  () => markup.set("plain"),
]

export const optimality = {
  target: 3,
  milestone: 4,
  // The static half folds; the dynamic half cannot. `data-markup` is the proof
  // the folding really happened — a compiler that punted every value to the
  // patch code would satisfy an "is escaped" assertion by never escaping
  // anything at compile time.
  emits: ['title="&quot; onload=&quot;x"', "&lt;b&gt;not markup&lt;/b&gt; &amp;"],
  // Escaping is not URL-encoding and not JS-escaping: the two commonest wrong
  // answers each leave their own signature.
  absent: ["%3C", "\\x3c", "\\u003c"],
}
