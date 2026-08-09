import { For, signal } from "@barqjs/core"

export const words = signal(["a", "b"])

/**
 * `<For keyed={false}>` DELEGATES to `Index` at runtime, which inverts the row
 * callback's contract: the item becomes an accessor and the index becomes a
 * plain number. Attributing the parameters from the component's name alone
 * gets both of them backwards — `item()` would throw and `index()` would not
 * update.
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
  // `keyed: false` makes `For` delegate to `Index`, which INVERTS the row
  // contract: the item becomes an accessor and the index becomes a plain
  // number. The compiler passes the flag through and rewrites neither — turning
  // the call into `Index(...)` itself would be right about the semantics and
  // wrong about the props the author wrote.
  emits: ["For({", "each: words", "keyed: false", "(word: () => string, index: number)"],
  absent: ["Index(", "each: () => words()"],
}
