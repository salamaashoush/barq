import { signal } from "@barqjs/core"

export const show = signal(true)
export const label = signal("hello")
export const maybe = signal<string | null>(null)

/**
 * The short-circuit conditional child — `{cond && <jsx/>}` — and its two
 * siblings, `||` and `??`.
 *
 * Nothing else in the corpus writes one. `conditional-children` is a ternary,
 * which always yields one of two branches; a short-circuit yields the OPERAND,
 * so the hole is handed `false`, `""`, `0` and `null` at different moments and
 * every one of them has to render as nothing while `0` and `""` still render as
 * themselves when they are the value rather than the guard. That is
 * `childToNodes`' boolean/nullish arm plus `insert`'s empty-to-node transition,
 * and no other fixture drives either.
 *
 * `zero` is the trap: `{count() && …}` renders the NUMBER 0 when the count is
 * zero, because `&&` returns the falsy left operand rather than a boolean, and
 * a compiler that folded the guard into a boolean would silently delete a
 * character the un-compiled path renders.
 */
export const count = signal(0)

export default function LogicalAndChild() {
  return (
    <div class="cond">
      <span class="head">head</span>
      {() => show() && <em class="flag">on</em>}
      <span class="mid">{() => label() || "fallback"}</span>
      <span class="opt">{() => maybe() ?? "empty"}</span>
      <span class="zero">{() => count() && "nonzero"}</span>
      <span class="tail">tail</span>
    </div>
  )
}

export const steps = [
  () => show.set(false),
  () => label.set(""),
  () => maybe.set("given"),
  () => count.set(2),
  () => show.set(true),
  () => count.set(0),
]

// The bare short-circuit hole is appended by `createElement` with `marker =
// null`, so once the guard has gone false and back true the oracle reconciles
// against "the end of the parent" and puts the `<em>` after `<span class="tail">`.
// The compiled hole is anchored on the `<span class="mid">` that follows it in
// source, so the element comes back where it was written. `conditional-children`
// is the same defect reached through a ternary; this is the short-circuit's, and
// the two differ in what the hole is handed while the guard is false — `false`
// here, `null` there.
const frame = (mid: string, opt: string, zero: string, flag: boolean): string =>
  `<div class="cond"><span class="head">head</span>${flag ? '<em class="flag">on</em>' : ""}` +
  `<span class="mid">${mid}</span><span class="opt">${opt}</span>` +
  `<span class="zero">${zero}</span><span class="tail">tail</span></div>`

export const optimality = {
  target: 9,
  milestone: 5,
  // Four holes and not one baked anchor: three are their span's only child and
  // have nothing after them, and the bare one is followed by an ELEMENT, which
  // is its own anchor. The whole page is two templates — one for the frame with
  // every hole emptied, one for the `<em>` the guard yields.
  templates: 2,
  emits: [
    '<span class="zero"></span>',
    '<span class="tail">tail</span>',
    "show() && ",
    "label() || ",
    "maybe() ?? ",
    "count() && ",
  ],
  // No baked anchor anywhere, and the guard is never rewritten: `!!show()` or
  // `Boolean(count())` would each change what the hole receives.
  absent: ["<!---->", "!!", "Boolean("],
}
