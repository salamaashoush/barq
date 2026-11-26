# @barqjs/compiler

## 0.2.0-next.4

### Minor Changes

- a29585c: Style groups and token objects fold through a barrel, and arc ships only the families an app uses.

  - compiler: `export { x } from`, `export * from`, `export const alias = group` and `import * as ns` fold across modules, and a token object (plain or `as const`, nested, numeric members kept as numbers) folds wherever it is read, even from a module that never imports `@barqjs/css`. A member that is not a static literal still raises `BARQ017`. A `create` key that is not an identifier, such as `"2xl"`, is quoted in the output.
  - vite: the stylesheet carried with a fold is the declaring module's, followed through a barrel, rather than every module compiled on the way.
  - ui: `@barqjs/ui/theme/tokens` exports the token object alone, with no side effect.
  - arc: `@barqjs/arc/style` is a barrel over one module per family (layout, gap, type, colour, surface, focus, interaction, motion, target, tokens), and colours and the radius read ui's tokens.
  - arc: `Stack`, `Inline`, `Grid` and `Container` set a custom property per step inline (`--arc-gap-base`, `--arc-gap-md`), read by one fixed rule per step, and refuse a value that is not one of the system's tokens. The layout components' CSS went from 14.9 KB to 8.2 KB.

### Patch Changes

- 048ed75: A style group read by index, such as `gap[4]` or `gap["4"]`, now composes at build time like one read by name. Every arc style group that composed a gap step used to stay a runtime `layer()` call.
- bb3630d: JSX stored as a value (an item's icon in an array of items, a property of an object handed to a component, a signal's value) compiles to a Block, built where it is finally inserted. It was built where it was written, outside the hydration walk of the position that inserts it, so a page such as an `ActionBar` with icons reported a `structure` mismatch and rebuilt the region.
- 0968d16: Date segments carry their field's name and description, and a spread on a `<select>` selects its option on the first render.

  - Each date segment is named by its part and then by its field's label, as in React Aria: "day, Departure". A field's `aria-label` and `aria-labelledby` reach every segment.
  - `DatePicker` and `DateRangePicker` pass their label, description and error to the segments of the fields inside them, through the new `PickerFieldContext`, without naming or describing the inner field's group. `DatePicker` takes `aria-describedby`.
  - A `value` or `selectedIndex` that reaches a `<select>` through a spread is written after its options, so `select.value` is right as soon as it renders. Everything else in the spread, `multiple` included, is still written before the options. The same holds for a `<select>` built by `element()`.

- 7847b93: A handler reaches what it was handed to. `<button {...props} />` attached each handler's Cell as the listener, so a click answered with the handler instead of running it; the record is now read through `elementProps`, which takes each handler and `ref` out of its Cell. A part branded with `asRecord` and spread onto a component hands its handlers over uncalled, where the component's first read used to call them. `createComponent` called from a `.ts` module takes the record of Cells only, so a record of values with a callback in it is a type error rather than a callback the read calls.
- f265cd9: A function written as a component's prop is the prop's value, and reading it never calls it. `upload={() => send()}`, a named callback and a signal's accessor used to be taken for the prop's Cell, so the component's first read called them and every read called them again; they now cross inside a Cell of their own on every path, and `x={count()}` crosses as `count` itself, one closure fewer. An accessor handed through a component for an attribute, `data-active={() => …}` or `aria-current={() => …}`, still reaches the element as the value it answers and follows it: an element's attribute reads a prop through `readAttr`, and the DOM, server and universal spreads and `Link`'s attributes read through it too. A context's `value` given as an accessor is read through as before, and `Link` now runs an `onClick` it is handed instead of answering with it.
- 644ccc8: A `<Show>`, `<For>` or `<Switch>` that is its element's only child now writes the same hydration markup in development and production builds, so a server and a browser compiled with different `dev` settings claim it instead of reporting a mismatch and rebuilding it. A development build no longer writes the branch key at such a position.
- 3f6aa6d: A `<select>`'s `value` is written after its options again when another attribute on it is also bound. `selectedIndex` is now a property: written after the options, kept against the user's choice like `value`, and absent from server markup.
- b6342be: A `<Show>` or `<Match>` whose only child is a value the compiler cannot see the kind of, such as `{item.label}` inside a render callback, is compiled to a region like any other and hydrates the server's markup. It was left to the component, which carries no hydration flags, so the browser reported it `not-hydratable` and built it again. The arm still decides the child by Solid 2.0's rule, through `callSlot`, now exported from `@barqjs/core`.

## 0.2.0-next.3

No changes in this release.

## 0.2.0-next.2

No changes in this release.

## 0.2.0-next.1

No changes in this release.

## 0.2.0-next.0

No changes in this release.
