# barq compiler diagnostics

Every diagnostic the compiler reports has a stable code, a level and a page here. Each
page shows the message, an example that raises it, the fixed example, why the rule
exists and how to silence it.

| code | level | what it reports |
| --- | --- | --- |
| [BARQ001](BARQ001.md) | warning | An accessor is used as a value without being called |
| [BARQ002](BARQ002.md) | warning | An accessor is used as a condition, which is always true |
| [BARQ003](BARQ003.md) | warning | A property is read from an accessor instead of from its value |
| [BARQ004](BARQ004.md) | note | `<For>` rows may show stale fields when `each` holds store objects |
| [BARQ005](BARQ005.md) | warning | Props are destructured in the parameter list, so each name is a function |
| [BARQ008](BARQ008.md) | warning | A `barq-ignore-next-line` comment silences nothing on the next line |
| [BARQ009](BARQ009.md) | warning | A `barq-ignore-next-line` comment is malformed and silences nothing |
| [BARQ010](BARQ010.md) | warning | JSX is passed to a prop the component reads as a value, which throws |
| [BARQ011](BARQ011.md) | note | `keyed={false}` keeps element state in place when the list reorders |
| [BARQ012](BARQ012.md) | error | A module exports server functions together with other things |
| [BARQ013](BARQ013.md) | warning | `<Link to>` names a path that no route matches |
| [BARQ014](BARQ014.md) | error | A `css`, `keyframes` or `globalCss` block is not valid CSS |
| [BARQ015](BARQ015.md) | note | A `css` block interpolates a runtime value, so the browser builds it |
| [BARQ016](BARQ016.md) | note | `atoms` has several conditional arguments, so the browser evaluates it |
| [BARQ017](BARQ017.md) | note | A `@barqjs/css` call cannot be compiled, so the browser evaluates it |

BARQ001, BARQ002, BARQ003, BARQ005 and BARQ011 are reported when the `diagnostics` option
is on, which it is in development builds. BARQ004 and BARQ010 are reported in development
builds only.
BARQ012 to BARQ017 are reported in every build, so they can fail CI. BARQ008 and BARQ009
report on your own suppression comments.

[BARQ006](BARQ006.md) was removed and is not reported.

## Codes are stable

A code is never renamed and never reused, because a suppression comment in your source
refers to it by name. A new code arrives in a minor release at warning level or below.
With `defaultCategory: "error"`, a new code can therefore turn a minor upgrade into a
failing build.

## Silencing one line

In statement position, write a line comment directly above the reported line:

```ts
// barq-ignore-next-line BARQ001 (the debug panel shows the source text)
const label = `${count}`;
```

Between JSX children, write a JSX comment. A `//` line there is text: it silences
nothing and it is rendered on the page.

```tsx
<div>
  {/* barq-ignore-next-line BARQ001 (the debug panel shows the source text) */}
  <pre>{`${count}`}</pre>
</div>
```

- The code is required. A comment without one would also hide a diagnostic added to that
  line later.
- Several codes can be listed, separated by commas or spaces: `BARQ001, BARQ003`.
- A reason in parentheses is required and has to be at least 10 characters.
- The comment covers the next line that is not blank and not a comment, so two comments
  stacked above one line both apply to it. It covers one line, not one statement: a
  diagnostic on the third line of a long statement needs the comment directly above that
  line.
- A comment that silences nothing is reported as [BARQ008](BARQ008.md), and a comment
  that cannot be read as [BARQ009](BARQ009.md). Both stay warnings whatever the project
  settings say, so a comment cannot fail a build.
- A comment never changes the code the compiler produces.

## Changing a level for the whole project

```ts
barqVitePlugin({
  checks: { BARQ004: "suppress", BARQ001: "error" },
  defaultCategory: "warning",
});
```

A level is `suppress`, `note`, `warning` or `error`. An entry in `checks` wins over
`strictCss`, which makes BARQ014 to BARQ017 errors; that wins over `defaultCategory`,
which applies to every code; and that wins over the code's own level. The compiler and
the Vite plugin read the same settings, so a code silenced here is silent everywhere.

The compiler prints each fix as text and never rewrites your source.

## What the rules cannot see

The checks report only what they can prove from one file, so silence is not a guarantee.

- **Other files.** An accessor imported from another module is not known to be one, so
  BARQ001 to BARQ003 say nothing about it, and BARQ010 does not follow a prop into a
  component declared in another file.
- **Files without JSX.** The accessor and props rules run on `.jsx` and `.tsx` files.
- **A reassigned name.** A `let` that is assigned again is not treated as an
  accessor.
- **A component only ever passed as a value.** BARQ005 needs to know that a function is
  a component, which it learns from a JSX tag, an export, or a route option such as
  `component`. A function that is only passed to another function is not reported.
- **A row whose `keyed` is not written out.** With `<For keyed={KEYED}>` or
  `<For {...options}>` the compiler does not know whether the row is an accessor, so
  BARQ001 to BARQ003 say nothing about that row.
