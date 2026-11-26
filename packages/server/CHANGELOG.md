# @barqjs/server

## 0.2.0-next.4

### Patch Changes

- 0a43dbe: `@barqjs/primitives` adds `colorScheme`, `useColorScheme` and `colorSchemeScript`: a light, dark or system theme kept in a cookie and written on `<html>` before the first paint, so a server-rendered or prerendered page never flashes the wrong theme.

  The Vite plugin finds packages that publish source at any depth and through peer dependencies, resolving each from where its dependent is installed. A design system built on `@barqjs/aria` no longer leaves `@barqjs/primitives` external in the server bundle.

  Inline scripts and styles declared through `useHead` carry the render's CSP nonce, in the shell and in streamed head patches, and an `id` names a script's or style's head identity.

- f265cd9: A function written as a component's prop is the prop's value, and reading it never calls it. `upload={() => send()}`, a named callback and a signal's accessor used to be taken for the prop's Cell, so the component's first read called them and every read called them again; they now cross inside a Cell of their own on every path, and `x={count()}` crosses as `count` itself, one closure fewer. An accessor handed through a component for an attribute, `data-active={() => …}` or `aria-current={() => …}`, still reaches the element as the value it answers and follows it: an element's attribute reads a prop through `readAttr`, and the DOM, server and universal spreads and `Link`'s attributes read through it too. A context's `value` given as an accessor is read through as before, and `Link` now runs an `onClick` it is handed instead of answering with it.
- 3f6aa6d: A `<select>`'s `value` is written after its options again when another attribute on it is also bound. `selectedIndex` is now a property: written after the options, kept against the user's choice like `value`, and absent from server markup.
- Updated dependencies [59a9e79]
- Updated dependencies [0a43dbe]
- Updated dependencies [0968d16]
- Updated dependencies [ec06e14]
- Updated dependencies [7847b93]
- Updated dependencies [f265cd9]
- Updated dependencies [3f6aa6d]
- Updated dependencies [b6342be]
  - @barqjs/web@0.2.0-next.4
  - @barqjs/core@0.2.0-next.4

## 0.2.0-next.3

### Patch Changes

- Updated dependencies [28c1c5a]
- Updated dependencies [66de74c]
  - @barqjs/core@0.2.0-next.3
  - @barqjs/web@0.2.0-next.3

## 0.2.0-next.2

### Patch Changes

- Updated dependencies [9685c39]
  - @barqjs/core@0.2.0-next.2
  - @barqjs/web@0.2.0-next.2

## 0.2.0-next.1

### Patch Changes

- Updated dependencies [1bba6c8]
  - @barqjs/core@0.2.0-next.1
  - @barqjs/web@0.2.0-next.1

## 0.2.0-next.0

### Patch Changes

- Updated dependencies [05c6d38]
  - @barqjs/core@0.2.0-next.0
  - @barqjs/web@0.2.0-next.0
