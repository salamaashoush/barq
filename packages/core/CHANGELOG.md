# @barqjs/core

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
