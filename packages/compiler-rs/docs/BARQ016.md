# BARQ016 — `atoms` has more than one conditional argument

**Level:** note. Raise it with `checks: { BARQ016: "warning" }`.

An `atoms` call with two or more `cond && { … }` arguments is left for the
runtime, because compiling it means emitting every outcome.

```tsx
import { atoms } from "@barqjs/css";

// compiles: one ternary of two class strings
atoms({ color: "red" }, active() && { color: "blue" });

// BARQ016: four outcomes
atoms({ color: "red" }, active() && { color: "blue" }, wide() && { padding: 8 });
```

One conditional is two outcomes and one ternary. Two is four, three is eight,
and a nested ternary over eight class strings is larger than the runtime call it
replaces — so past one, the runtime keeps it. Nothing is broken: `atoms` at run
time computes exactly what the compiler would have, into the same registry and
under the same class names, which is what the parity test in
`crates/barq-css/src/atoms.rs` pins.

## Fixing it

Merge the conditions into one object, which is usually what was meant:

```tsx
atoms({ color: "red" }, active() && { color: "blue", ...(wide() ? { padding: 8 } : {}) });
```

Or apply the second with its own call, since a class string is an `atoms`
argument like any other and merges by the key each name carries:

```tsx
const base = atoms({ color: "red" }, active() && { color: "blue" });
<div class={atoms(base, wide() && { padding: 8 })} />;
```

Or name the combinations with `create`, and choose between them:

```tsx
const styles = create({ calm: { color: "red" }, loud: { color: "blue", padding: 8 } });
<div class={active() ? styles.loud : styles.calm} />;
```
