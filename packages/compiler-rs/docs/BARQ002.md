# BARQ002 — an accessor is used as a condition

**Level:** warning · **Rule family:** D1 · [all codes](README.md)

## What fires

A binding the compiler resolved to an accessor in a position that tests it for truthiness.
A function is **always truthy**, so the condition can never take its other branch.

| position | example |
| --- | --- |
| `if` test | `if (loading) { … }` |
| `switch` discriminant | `switch (mode) { … }` |
| loop test | `while (loading) …` · `do … while (loading)` · `for (; loading; )` |
| conditional **test** | `loading ? <Spinner/> : <List/>` |
| logical **left** operand | `loading \|\| fallback` · `loading && <Spinner/>` |
| `!` | `!loading` |

```jsx
const loading = signal(true)

if (loading) render()      // BARQ002 — always taken
```

## The fix

Call it.

```jsx
if (loading()) render()
```

## What does not fire, and why

Every narrowing below is a refusal to guess, taken from
[`vue/no-ref-as-operand`][vue]:

- **Right operand of `||` / `&&`** — `other || count` is a normal way to pass an accessor
  along to a consumer that will call it.
- **Consequent and alternate of `?:`** — `flag() ? count : other` likewise.
- **`typeof count === "function"`** — that is how a caller checks whether it was handed an
  accessor at all.
- **`props.loading ? a : b`** — props lower to getters, so a props member read is a value.
- **A `case` test** — `switch (x) { case count: }` compares by identity, which is the same
  refusal the equality operators get in [BARQ001](BARQ001.md).
- **`for (const x of items)`** — not a test position.
- A binding that is written to anywhere never reaches accessor classification, so a `let`
  reassigned to a plain value cannot be reported here.
- **A row whose `keyed` cannot be read** — `<For keyed={KEYED}>`, `<For {...opts}>`. The row
  is on the accessor arm because that arm is safe when wrong, which is not evidence that it
  is an accessor.

The loop arms are the one place this rule is **wider** than `vue/no-ref-as-operand`, which
has only `IfStatement>Identifier` and `SwitchStatement>Identifier`. A loop test reads its
operand as a boolean and nothing else — the same argument as `if` — and the failure is
worse, because the loop never ends.

`loading ? a : b` is also reported by `tsc --strict` as TS2774, *"This condition will
always return true since this function is always defined. Did you mean to call it
instead?"* — the `if`/`switch`/logical arms and every JavaScript user are what this code
adds.

## Silencing it

```ts
// barq-ignore-next-line BARQ002 (deliberately testing that the accessor exists)
if (maybeAccessor) …
```

[vue]: https://eslint.vuejs.org/rules/no-ref-as-operand.html
