# BARQ001 — an accessor is coerced to a value instead of being called

**Level:** warning · **Rule family:** D1 · [all codes](README.md)

## What fires

A binding the compiler resolved to an accessor — `signal()`, `computed()`, `useMemo()`,
`useState()[0]`, `createAsync()` — appearing as an operand in a position that turns it into
a value:

| position | example |
| --- | --- |
| template literal, untagged | `` `total: ${count}` `` |
| arithmetic, concatenation, relational | `count + ""` · `"x" + count` · `count * 2` · `count < 5` |
| unary `-` `+` `~` | `-count` · `+count` · `~count` |

```jsx
const count = signal(0)

<p>{`total: ${count}`}</p>   // BARQ001
```

`` `${count}` `` renders the accessor's **own source text** into the DOM. `-count` is
`NaN`. Neither throws, so nothing tells you.

## The fix

Call it.

```jsx
<p>{`total: ${count()}`}</p>
```

## Why this is not TypeScript's job

`tsc --strict` already reports `count * 2` (TS2362), `count > 1` (TS2365), `count === 5`
(TS2367) and `count.toFixed(2)` (TS2339) against barq's `Signal<T>`. What it reports
**zero** errors on, verified against this repo's own tsc:

`` `${count}` `` · `count + ""` · `"x" + count` · `-count` · `+count` · `String(count)` ·
`JSON.stringify({count})`

That coercion family, plus every position above for JavaScript users, is what this code is
for.

## What does not fire, and why

- `<p>{count}</p>` and `<div id={count}>` — **correct barq code.** `insert()` does
  `if (typeof value === "function") { renderEffect(…) }` (`dom.ts:954`) and the attribute
  path does the same, so a function value in either position is the fine-grained path.
  eslint-plugin-solid's `badSignal` has a JSX arm; porting it would make this rule fire on
  the framework's own idiom in the first fixture anyone writes.
- `count === other`, `count !== other`, `count == null` — **identity, not coercion.**
  Filtering a collection of accessors by reference — `all.filter((s) => s !== count)` — is
  correct code, and the fix this page prints would silently turn an identity comparison into
  a value comparison. `vue/no-ref-as-operand` fires here (its selector is a bare
  `BinaryExpression>Identifier` with no operator narrowing); dropping the four equality
  operators is a deliberate divergence, and it is the whole of the divergence.
- `count instanceof X`, `"k" in count` — a function is a legitimate operand of both.
- `` tag`${count}` `` — a tagged template hands the tag the raw value and the tag decides.
- `props.count + 1` — props lower to getters, so a props member read is correct in every
  position. The rule keys on the **binding**, never on "a reactive read".
- `import { count } from "./barrel"` — invisible; P0 Bind is module-scoped. See
  [the index](README.md#what-these-rules-deliberately-cannot-see).

## Silencing it

```jsx
{/* barq-ignore-next-line BARQ001 (the debug panel wants the source text) */}
<pre>{`${count}`}</pre>
```

Inside JSX the directive has to be a JSX comment: a `//` line between children is text, and
it would be baked into the template. In statement position, `// barq-ignore-next-line …`.

## Prior art

The position allowlist is [`vue/no-ref-as-operand`][vue]'s. That rule has a handful of
known issues where `solid/reactivity` has ~25 open false-positive reports, and the reason
is the *shape* of the question: it reports only where no correct program could put the
value, rather than inferring where a value "can never re-run".

[vue]: https://eslint.vuejs.org/rules/no-ref-as-operand.html
