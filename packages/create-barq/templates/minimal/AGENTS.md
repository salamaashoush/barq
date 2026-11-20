# Working in this project

This is a barq application: a JSX framework where a component function runs
once and only the DOM nodes that read a changed signal update. It is not React
and not Solid, so read the authoring skill before writing components.

## Skills

Installed with the packages, under `node_modules`:

- `node_modules/@barqjs/core/skills/barq/SKILL.md`: how to write barq (props
  as values, signals, the two-function `createEffect`, stores, control flow,
  async). Read it before writing or reviewing application code.
- `node_modules/@barqjs/core/skills/diagnostics/SKILL.md`: one section per
  runtime `[CODE]`, with the repair.
- `node_modules/@barqjs/compiler/skills/compiler-diagnostics/SKILL.md`: one
  section per build-time `BARQ0NN` code, with the repair.
- `node_modules/@barqjs/diagnostics/skills/agent-loops/SKILL.md`: capturing a
  run as evidence for cost and responsiveness findings. Present when
  `@barqjs/diagnostics` is installed.

## Rule

When a console or build message carries a `[CODE]` or a `BARQ0NN`, open the
skill section for that code before changing code. The console entry's `in`
line is the component path and its `at` line is `file:line:col`. Repair the
cause; a suppression comment or `untrack` leaves the defect in place.

## Commands

```bash
npm run dev        # the Vite dev server, http://localhost:5173
npm run build      # production build into dist
npm run preview    # serve the build
npm run typecheck  # tsc --noEmit
npm run check      # barq check: the compiler's findings, no build needed
```

Run `npm run check` and `npm run typecheck` after a change, and `npm run build`
before calling it done. `npx barq check --json` gives the findings as JSON, and
`npx barq check --fix` applies the repairs that are one spelling. Diagnostics print
in the browser console and the terminal of `npm run dev`.

## Layout

- `index.html`: the document.
- `src/main.tsx`: `render(() => <App />, root)`.
- `src/App.tsx`: the root component.
