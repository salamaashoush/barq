# BARQ004 — `For`'s `each` origin cannot be proved

**Level:** note · **Dev builds only** · [all codes](README.md)

## What fires

A by-item `<For>` — `keyed` absent, or `keyed={true}` — whose `each` expression resolves to
something the compiler could not prove is an array of values `mapArray` recreates.

```jsx
<For each={store.items}>{(item) => <li>{item.name}</li>}</For>   // BARQ004
```

## What it means

A member read on a **by-item** row is applied once, with no thunk and no effect (DESIGN
§12 O3). That is exactly right when the rows really are values `mapArray` recreated: a new
value means a new row, and the row is rebuilt. It is silently stale when the rows are store
**proxies**, because mutating a proxy field leaves the array identity alone, no row is
recreated, and the applied-once read never runs again.

The note is a note and not a warning because the compiler cannot tell the two apart. It is
gated on being able to *resolve* the origin, not on knowing nothing: `each={[…]}` built
inline is silent, and `each={store.items}` — the demonstrable failure — is not.

## The fix

Read the row through an accessor:

```jsx
<For each={store.items} keyed={false}>{(item) => <li>{item().name}</li>}</For>
```

or key it, which boxes the row in a signal and makes both parameters accessors:

```jsx
<For each={store.items} keyed={(row) => row.id}>{(item) => <li>{item().name}</li>}</For>
```

## What does not fire

`keyed={false}` and `keyed={fn}` both hand the row through an accessor, so neither has the
hazard at all. (Before the `keyed={fn}` classification fix this note fired on function-keyed
`For`s, which was wrong twice over — see ERGONOMICS §4.3.)

## Silencing it

```jsx
{/* barq-ignore-next-line BARQ004 (these rows are plain values from a fetch) */}
<For each={rows}>{(row) => <li>{row.name}</li>}</For>
```
