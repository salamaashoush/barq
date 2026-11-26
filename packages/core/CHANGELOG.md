# @barqjs/core

## 0.2.0-next.4

### Patch Changes

- ec06e14: A `<For>` row that renders nothing (a component returning `null` or `undefined`, or an empty string) now hydrates the server's markup when it comes after the last row that rendered something. The browser reported such a row as one the server did not send, so the list counted as longer in the browser and a structure mismatch was recorded for a page that matched.
- 7847b93: A handler reaches what it was handed to. `<button {...props} />` attached each handler's Cell as the listener, so a click answered with the handler instead of running it; the record is now read through `elementProps`, which takes each handler and `ref` out of its Cell. A part branded with `asRecord` and spread onto a component hands its handlers over uncalled, where the component's first read used to call them. `createComponent` called from a `.ts` module takes the record of Cells only, so a record of values with a callback in it is a type error rather than a callback the read calls.
- f265cd9: A function written as a component's prop is the prop's value, and reading it never calls it. `upload={() => send()}`, a named callback and a signal's accessor used to be taken for the prop's Cell, so the component's first read called them and every read called them again; they now cross inside a Cell of their own on every path, and `x={count()}` crosses as `count` itself, one closure fewer. An accessor handed through a component for an attribute, `data-active={() => …}` or `aria-current={() => …}`, still reaches the element as the value it answers and follows it: an element's attribute reads a prop through `readAttr`, and the DOM, server and universal spreads and `Link`'s attributes read through it too. A context's `value` given as an accessor is read through as before, and `Link` now runs an `onClick` it is handed instead of answering with it.
- b6342be: A `<Show>` or `<Match>` whose only child is a value the compiler cannot see the kind of, such as `{item.label}` inside a render callback, is compiled to a region like any other and hydrates the server's markup. It was left to the component, which carries no hydration flags, so the browser reported it `not-hydratable` and built it again. The arm still decides the child by Solid 2.0's rule, through `callSlot`, now exported from `@barqjs/core`.

## 0.2.0-next.3

### Minor Changes

- 28c1c5a: `create-barq` does the whole job. It asks for (or takes a flag for) the template, add-ons, package manager, install and git, then installs, writes the generated files and makes the first commit. `--yes` takes every default, and `--list-templates --json` and `--list-add-ons --json` answer a tool.

  Templates come from the `templates` branch on GitHub, so a template fix needs no release. `--offline` and a run without network use the copy the package ships.

  The `ui` add-on sets up `barq-ui`, adds a starter set of components and imports the theme.

### Patch Changes

- 66de74c: The `create-barq` templates draw from the same theme tokens as the `barq-ui` components, with light fallbacks. With the kit added and the system in dark mode, components had white surfaces under the template's light text.

## 0.2.0-next.2

### Patch Changes

- 9685c39: `barq-ui add` installs barq packages at the CLI's own release. It used the `latest` tag, which during a prerelease is an older release than the components it copies, so a fresh project failed to typecheck.

  The `create-barq` templates start with a real design, a component test (`npm test`), the diagnostics endpoint for coding agents and a `CLAUDE.md` that points at `AGENTS.md`.

  `@barqjs/aria`: a popover closes when focus leaves it, drag and drop works inside a Virtualizer and speaks 34 languages, and a kit Switch marked `required` holds a native form.

## 0.2.0-next.1

### Minor Changes

- 1bba6c8: `@barqjs/aria` catches up with React Aria Components 1.22.

  - New: Tree, NavigationTree, Sheet, TokenField, Autocomplete, ColorSwatchPicker, DropZone, FileTrigger, PreviewTrigger and the toast parts.
  - Drag and drop for ListBox, GridList, Tree and Table, in 34 languages and inside a Virtualizer.
  - Fixes across the existing controls: TimeField, native form validation, popovers inside a modal, keyboard access to table cells, touch editing of dates.

  Two new packages: `@barqjs/diagnostics` gathers findings and attribution into one artifact, with assertions and a dev-server endpoint. `@barqjs/cli` adds `barq check`, with JSON output and `--fix`.

  The compiler names signals, components and elements in development findings and reports BARQ030 to BARQ034. It runs every component under an owner of its own, and rebuilds an array literal when what it spreads changes. Server rendering is faster: a list's rows share a scope until one writes a binding.

## 0.2.0-next.0

### Minor Changes

- 05c6d38: First release of every package from this repository. `@barqjs/core` and `@barqjs/testing` 0.1.0 on npm predate it and are superseded.
