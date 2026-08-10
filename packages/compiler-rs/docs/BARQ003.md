# BARQ003 — a property is read off the accessor rather than off its value

**Level:** warning · **Rule family:** D1 · [all codes](README.md)

## What fires

A static, non-computed member read whose object is a binding the compiler resolved to an
accessor, where the member is not part of an accessor's own API.

```jsx
const user = signal({ email: "ada@example.com" })

<p>{user.email}</p>       // BARQ003 — undefined; the property is on the VALUE
<p>{user.value}</p>       // BARQ003 — the Vue habit; barq accessors have no `.value`
```

## The fix

Call it first.

```jsx
<p>{user().email}</p>
```

## The member allowlist

These are **not** reported, because they are the accessor's own typed API or the API every
function has:

```
set  update  peek
apply  arguments  bind  call  caller  constructor  length  name  prototype  toString  valueOf
```

`Signal<T>` declares `set`/`update`/`peek` (`signals.ts:1136`) and `Computed<T>` declares
`peek` (`signals.ts:1143`). This list is **D1's own**, deliberately the union over every
primitive rather than the compiler's `MemberMask`: masking a member a primitive does not
have would turn a tracked read into `Static`, so `MemberMask` cannot be widened to cover
`useMemo(…).peek()` — and an unexempted `.peek()` would be a false positive on a
type-checked public API.

The consequence is a set of deliberate false **negatives**, and two of them are worth
naming because they are exactly the reads people write:

- **`items.length`** on an accessor to an array. `length` is `Function.prototype` surface,
  so it reads the accessor's arity — `0` — instead of the array's length, and this rule
  says nothing. `tsc` does not either: an accessor really does have a `length`. Write
  `items().length`.
- **`user.name`** likewise reads the function's own name. The allowlist cannot distinguish
  "reading `Function.prototype.name` on purpose" from "meaning the value's `name`", and
  reporting it would fire on `count.name` in a debug panel.
- `computed(…).set(1)` is not reported here; `tsc` reports it as TS2339, which is the right
  tool for a member a type does not declare.

## What does not fire, and why

- **Computed access** — `count[key]`. The key is not visible to the analysis, and
  `vue/no-ref-as-operand` excludes computed access for the same reason.
- **`props.total`** — props lower to getters; a props member read is ⊤-reactive and
  correct.
- **A store proxy** — `useStore()[0].n` is `ReactiveObject`, where any member read *is* the
  reactive read. Not an accessor, not reported.
- **A row whose `keyed` cannot be read** — `<For keyed={KEYED}>{(row) => row.text}</For>`,
  or a `keyed` arriving through a spread. The row parameters take the accessor arm because
  it is the arm that is safe when wrong; if `KEYED` holds `true` the row is a plain object
  and `row()` is a `TypeError`, so this rule stays out. A key function written out —
  `keyed={(r) => r.id}` — is proof, and there the read *is* reported.

## Silencing it

```ts
// barq-ignore-next-line BARQ003 (reading the function's own metadata on purpose)
const label = count.displayName
```

Inside JSX, the directive has to be a JSX comment — `{/* barq-ignore-next-line … */}` — on
the line immediately above the one the diagnostic points at.
