# @barqjs/web

## 0.2.0-next.4

### Patch Changes

- 59a9e79: arc's editor gains the formatting and block shell of a document editor.

  - arc formatting: superscript and subscript, text colour and highlight from nine colours, small, large and huge text and clear formatting (`formattingExtension`, `TextColourMenu`, `TextSizeMenu`), each on its key, kept from pasted HTML and drawn by the renderer.
  - arc floating bar: Turn into, stays away from code and a pressed pointer, and a bar for a block chosen whole reached by Tab; a link on a caret writes its address.
  - arc block shell: the block menu on a right click and Mod+/, Mod+D, Alt+Shift with the arrows, Turn into callouts and toggles, picker group chips, placeholders in toggle titles and one-line callouts, typing after a chosen block, a divider that keeps the caret, cells that take text only. Extensions add toolbar `control`s, `turnInto` kinds and `placeholder`s.
  - arc editor shell: `validate` and `onValidityChange`, `autoFocus`, `language` and a document's own direction, `historyLimit`, and `replaceDocument`.
  - arc tables: row and column grips, moves, header column, merge and split, cell colour and alignment, striped rows, a line beside the table, and Tab in the last cell adds a row.
  - arc code blocks: a language menu, line numbers and copy; and the document as markdown in a dialog.
  - arc fix: the renderer draws pictures, and page breaks round-trip through markdown.
  - web fix: a `<pre>`'s `innerHTML` keeps the server's nodes when hydrating.

- 0a43dbe: `@barqjs/primitives` adds `colorScheme`, `useColorScheme` and `colorSchemeScript`: a light, dark or system theme kept in a cookie and written on `<html>` before the first paint, so a server-rendered or prerendered page never flashes the wrong theme.

  The Vite plugin finds packages that publish source at any depth and through peer dependencies, resolving each from where its dependent is installed. A design system built on `@barqjs/aria` no longer leaves `@barqjs/primitives` external in the server bundle.

  Inline scripts and styles declared through `useHead` carry the render's CSP nonce, in the shell and in streamed head patches, and an `id` names a script's or style's head identity.

- 0968d16: Date segments carry their field's name and description, and a spread on a `<select>` selects its option on the first render.

  - Each date segment is named by its part and then by its field's label, as in React Aria: "day, Departure". A field's `aria-label` and `aria-labelledby` reach every segment.
  - `DatePicker` and `DateRangePicker` pass their label, description and error to the segments of the fields inside them, through the new `PickerFieldContext`, without naming or describing the inner field's group. `DatePicker` takes `aria-describedby`.
  - A `value` or `selectedIndex` that reaches a `<select>` through a spread is written after its options, so `select.value` is right as soon as it renders. Everything else in the spread, `multiple` included, is still written before the options. The same holds for a `<select>` built by `element()`.

- ec06e14: A `<For>` row that renders nothing (a component returning `null` or `undefined`, or an empty string) now hydrates the server's markup when it comes after the last row that rendered something. The browser reported such a row as one the server did not send, so the list counted as longer in the browser and a structure mismatch was recorded for a page that matched.
- f265cd9: A function written as a component's prop is the prop's value, and reading it never calls it. `upload={() => send()}`, a named callback and a signal's accessor used to be taken for the prop's Cell, so the component's first read called them and every read called them again; they now cross inside a Cell of their own on every path, and `x={count()}` crosses as `count` itself, one closure fewer. An accessor handed through a component for an attribute, `data-active={() => …}` or `aria-current={() => …}`, still reaches the element as the value it answers and follows it: an element's attribute reads a prop through `readAttr`, and the DOM, server and universal spreads and `Link`'s attributes read through it too. A context's `value` given as an accessor is read through as before, and `Link` now runs an `onClick` it is handed instead of answering with it.
- 3f6aa6d: A `<select>`'s `value` is written after its options again when another attribute on it is also bound. `selectedIndex` is now a property: written after the options, kept against the user's choice like `value`, and absent from server markup.
- Updated dependencies [ec06e14]
- Updated dependencies [7847b93]
- Updated dependencies [f265cd9]
- Updated dependencies [b6342be]
  - @barqjs/core@0.2.0-next.4

## 0.2.0-next.3

### Patch Changes

- Updated dependencies [28c1c5a]
- Updated dependencies [66de74c]
  - @barqjs/core@0.2.0-next.3

## 0.2.0-next.2

### Patch Changes

- Updated dependencies [9685c39]
  - @barqjs/core@0.2.0-next.2

## 0.2.0-next.1

### Patch Changes

- Updated dependencies [1bba6c8]
  - @barqjs/core@0.2.0-next.1

## 0.2.0-next.0

### Patch Changes

- Updated dependencies [05c6d38]
  - @barqjs/core@0.2.0-next.0
