import { createSignal } from "@barqjs/core"

export const [label, setLabel] = createSignal("")
export const [extra, setExtra] = createSignal(false)

/**
 * An empty class is PRESENT, an absent class is not, and a list or a map with
 * no token in it is empty rather than absent.
 *
 * `classToString` answers `null` for nullish and `false` — the DOM path calls
 * `removeAttribute` for that — and `""` for an empty string, an empty array and
 * an empty object, which the DOM path assigns to `className` and which leaves
 * `class=""` on the element. The string backend has to draw the same line: it
 * omitted the attribute for both, so `class={() => ""}` rendered one attribute
 * on the client and none on the server.
 *
 * The nullish half is not spelled here because the JSX types do not admit a
 * `class` thunk that returns one; it is pinned in `packages/core/src/ssr.test.ts`
 * against `renderToString` of the same value.
 *
 * A list or a map is the other half. Every falsy entry and every false key
 * contributes nothing, so a list whose only string is `""` and a map whose
 * every key is off both stringify to `""`, and the string backend has to write
 * the same empty attribute the DOM path leaves.
 */
export default function ClassEmptyString() {
  return (
    <div class="host">
      {/* The marker attribute leads on every row, because a dynamic `class`
          reaches the element after the template's baked attributes and the
          corpus compares attribute ORDER as well as content. */}
      <span data-p="static" class="" />
      <span data-p="dynamic" class={() => label()} />
      <span data-p="merged" class={() => [extra() ? "on" : "", { hit: extra() }]} />
      <span data-p="map" class={() => ({ a: extra(), b: extra() })} />
    </div>
  )
}

export const steps = [() => setLabel("b"), () => setExtra(true)]

export const optimality = {
  target: 4,
  templates: 1,
  // An empty literal class is still an attribute, and it is baked as one.
  emits: ['<span data-p="static" class="">'],
  // A live list or map is applied whole by the class channel, never baked.
  absent: ['data-p="merged" class=', 'data-p="map" class='],
}
