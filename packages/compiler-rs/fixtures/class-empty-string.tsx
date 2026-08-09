import { signal } from "@barqjs/core"

export const label = signal<string | null>("")
export const extra = signal(false)

/**
 * An empty class is PRESENT; an absent class is not, and `classList` is neither.
 *
 * `classToString` answers `null` for nullish and `false` — the DOM path calls
 * `removeAttribute` for that — and `""` for an empty string, an empty array and
 * an empty object, which the DOM path assigns to `className` and which leaves
 * `class=""` on the element. The string backend has to draw the same line: it
 * omitted the attribute for both, so `class={() => ""}` rendered one attribute
 * on the client and none on the server.
 *
 * `classList` is the other half. `diffClassList` toggles the keys of an OBJECT
 * and does nothing at all with a string or an array, and no token means no
 * attribute — never an empty one — so the two spellings really do disagree
 * about the same value and the string backend must disagree the same way.
 */
export default function ClassEmptyString() {
  return (
    <div class="host">
      {/* The marker attribute leads on every row, because a dynamic `class`
          reaches the element after the template's baked attributes and the
          corpus compares attribute ORDER as well as content. */}
      <span data-p="static" class="" />
      <span data-p="dynamic" class={() => label()} />
      <span data-p="merged" class={() => (extra() ? "on" : "")} classList={{ hit: () => extra() }} />
      <span data-p="not-an-object" classList={() => "a b"} />
    </div>
  )
}

export const steps = [() => label.set("b"), () => extra.set(true), () => label.set(null)]

export const optimality = {
  target: 4,
  milestone: 6,
  templates: 1,
  // An empty literal class is still an attribute, and it is baked as one.
  emits: ['<span data-p="static" class="">'],
  // `classList` is a different channel from `class` and never becomes markup.
  absent: ['classList="'],
}
