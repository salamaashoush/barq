import { For, signal } from "@barqjs/core"

export const words = signal(["a", "b"])

/**
 * `<For keyed={false}>` INVERTS the row callback's contract against the identity
 * default: the item becomes an accessor and the index becomes a plain number.
 * Attributing the parameters from the component's name alone gets both of them
 * backwards — `item()` would throw and `index()` would not update.
 *
 * The file name is historical. Since K1 reversed, "unkeyed" is no longer the
 * default: `keyed` absent keys by ITEM IDENTITY, and this is the mode an author
 * has to ask for.
 */
export default function ForUnkeyedRows() {
  return (
    <ul class="unkeyed">
      <For each={() => words()} keyed={false}>
        {(word: () => string, index: number) => (
          <li data-index={String(index)}>{() => word()}</li>
        )}
      </For>
    </ul>
  )
}

export const steps = [() => words.set(["z", "b"]), () => words.set(["z", "b", "c"])]
export const optimality = {
  target: 8,
  milestone: 5,
  templates: 2,
  // `keyed={false}` INVERTS the row contract: the item becomes an accessor and
  // the index becomes a plain number. Since M4b the compiler does not pass a
  // flag through for the runtime to resolve — `keyOf: false` IS the positional
  // mode. There is no longer a "which component did the author write" for the
  // emission to be wrong about, and since M7b there is no second component to
  // have written.
  emits: ["each(", ", words, false, ", ", word: () => string, index: number)"],
  absent: ["each: ", "() => false"],
}
