# barq compiler diagnostics

Every message the compiler can produce has a stable code, a level, and a page here.

| code | level | rule |
| --- | --- | --- |
| [BARQ001](BARQ001.md) | warning | an accessor binding is coerced to a value instead of being called |
| [BARQ002](BARQ002.md) | warning | an accessor binding is used as a condition, where a function is always truthy |
| [BARQ003](BARQ003.md) | warning | a property is read off an accessor binding instead of off its value |
| [BARQ004](BARQ004.md) | note | `For`: the origin of `each` cannot be proved to be values `mapArray` recreates |
| [BARQ005](BARQ005.md) | warning | props are destructured in the parameter list, which flattens every getter |
| [BARQ007](BARQ007.md) | note | a control-flow component with no string mode sends this module to the DOM backend |
| [BARQ008](BARQ008.md) | warning | a `barq-ignore-next-line` matched no diagnostic |
| [BARQ009](BARQ009.md) | warning | a `barq-ignore-next-line` could not be parsed |

BARQ001, BARQ002, BARQ003 and BARQ005 are the source-level rules. They run when
`diagnostics` is on, which defaults to `dev`. BARQ004 and BARQ007 are compiler
notes about what the emitted code will do; they have always run under `dev`. BARQ008 and
BARQ009 are the engine reporting on your suppression comments.

## A code is a public API

Codes are **never renamed and never reused.** Svelte 5 renamed every warning code from
dashes to underscores and silently invalidated every `svelte-ignore` comment in every
codebase, breaking CI and blocking upgrades ([sveltejs/svelte#11414][s11414]). An ignore
comment sitting in your source is a call into this table.

Adding a code is a **minor** change and the new code must ship at warning level or below.
Angular's own caveat applies: with `defaultCategory: "error"`, a code added in a minor
release turns a minor upgrade into a build break.

## Silencing one occurrence

In statement position, a line comment:

```ts
// barq-ignore-next-line BARQ001 (the source text is what this debug panel wants)
const label = `${count}`
```

**Inside JSX, use a JSX comment.** A `//` line between JSX children is TEXT, not a comment:
it silences nothing and the directive is baked into the template and rendered onto the
page.

```jsx
<div>
  {/* barq-ignore-next-line BARQ001 (the source text is what this debug panel wants) */}
  <pre>{`${count}`}</pre>
</div>
```

- **The code is mandatory.** A codeless directive silences whatever happens to land on that
  line, including a diagnostic added after you wrote it. TypeScript shipped the codeless
  form and has been unable to undo it since 2020 ([microsoft/TypeScript#38288][ts38288]).
- **Several codes are allowed**, comma- or space-separated: `BARQ001, BARQ003`.
- **A reason is required**, in parentheses, at least 10 characters. typescript-eslint's
  `ban-ts-comment` uses the same floor in its strict config, "because it forces developers
  to articulate why."
- **The directive is scoped to the code AND to the line it covers** — the next line that is
  neither blank nor another comment, so two stacked directives both reach the statement
  below them. Naming the code is what stops a directive swallowing an unrelated diagnostic;
  TypeScript labelled the codeless version of this a Design Limitation and closed it
  ([microsoft/TypeScript#47551][ts47551]).
- **One line, not one statement.** A diagnostic reported on the third line of a multi-line
  statement is not covered by a directive above the first, and you get BARQ008 for the
  unused directive on top of the original. `@ts-expect-error` behaves identically, for the
  same reason: line granularity is what makes the scope readable without an AST. Put the
  directive immediately above the line the diagnostic points at — which, inside JSX, means
  the `{/* … */}` form.
- **An unused directive is reported as BARQ008, at warning level, always.** It cannot be
  escalated to an error even by `defaultCategory: "error"`. An unused suppression that
  fails CI is exactly what pushes teams onto the unsafe form that then silently swallows
  new diagnostics ([microsoft/TypeScript#62579][ts62579]).
- **A directive never changes what the compiler emits.** The React Compiler treated the
  mere presence of an `eslint-disable` as grounds to bail out of optimising a component
  ([facebook/react#34261][r34261]); barq resolves suppressions after codegen has already
  run, and a test pins the emitted bytes.

## Silencing a code project-wide

```ts
barqVitePlugin({
  checks: { BARQ004: "suppress", BARQ001: "error" },
  defaultCategory: "warning",
})
```

`suppress` | `note` | `warning` | `error`, the shape Angular's extended diagnostics use. An
explicit per-code entry wins over `defaultCategory`, which wins over the code's own level.

There is **one** resolution of this, shared by the compiler, the Vite plugin and any CLI.
Svelte's split between `onwarn` and `svelte-check` means a code silenced in one channel
stays loud in the other, and people file issues about it
([sveltejs/language-tools#650][lt650]).

## No autofix, ever

`exhaustive-deps` ships an autofix that **removes** a dependency to satisfy the analyser,
which changes runtime behaviour and can introduce the bug it warns about. Each page here
prints the rewrite as text and stops. barq's codegen only splices at recorded sites, so it
could not autofix even if that were wanted.

## What these rules deliberately cannot see

Recorded rather than papered over, because the alternative is a name heuristic and a name
heuristic is the proximate cause of most of eslint-plugin-solid's open false-positive
reports:

- **Cross-module.** `import { count } from "./barrel"` resolves to `Opaque`; P0 Bind is
  module-scoped. Same limitation as
  [eslint-plugin-solid#127](https://github.com/solidjs-community/eslint-plugin-solid/issues/127).
- **Non-JSX files.** `analysis::bind` only runs when the source type is JSX.
- **Anything reassigned.** A binding that is written to joins ⊤ and stops being an accessor
  as far as the analysis is concerned.
- **A component used only as a VALUE.** BARQ005 needs evidence that a function is a
  component, and that evidence is "written as a JSX tag, or exported". `const Wrapper = ({
  children }) => …` that is only ever passed as a prop is silent — a one-parameter
  JSX-returning arrow is otherwise indistinguishable from a `<For>` row callback.
- **A row whose `keyed` cannot be read.** `<For keyed={KEYED}>` and `<For {...opts}>` put
  the row parameters on the accessor arm because that is the arm that is safe when wrong,
  not because the row is known to be one. BARQ001–3 say nothing about such a row: if
  `KEYED` holds `true`, the row is a plain object and `row()` throws.

[s11414]: https://github.com/sveltejs/svelte/issues/11414
[ts38288]: https://github.com/microsoft/TypeScript/issues/38288
[ts47551]: https://github.com/microsoft/TypeScript/issues/47551
[ts62579]: https://github.com/microsoft/TypeScript/issues/62579
[r34261]: https://github.com/facebook/react/issues/34261
[lt650]: https://github.com/sveltejs/language-tools/issues/650

## Removed

| code | removed in | why |
| --- | --- | --- |
| [BARQ006](BARQ006.md) | M3 | its premise was getters, and C3 replaced every prop with a Cell |
