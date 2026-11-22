# @barqjs/core

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
