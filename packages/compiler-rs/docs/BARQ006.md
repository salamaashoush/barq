> **REMOVED IN M3.** This code no longer exists: `diagnosticCodes()` does not
> advertise it, nothing emits it, and `barq-ignore-next-line BARQ006` now reports
> BARQ008 (a suppression that matched nothing).
>
> The rule's premise was getters. Under `CODESIGN.md` C3 every prop crosses a
> component boundary as a **Cell**, and C3.4 says a copy of a Cell is the same
> Cell — so `Dynamic` spreading its props reads nothing at all and there is no
> "read every getter once" left to warn about. Warning anyway would be a lie
> about the emitted module (`src/passes/shape.rs`, and `src/compile.rs` pins
> that the source below now produces no codes).
>
> The page is kept because the rule is the reason a shape people still write is
> safe now, and because deleting the page would leave the removal unexplained.

# BARQ006 — `Dynamic` spreads its props

**Level:** warning · **Dev builds only** · [all codes](README.md)

## What fires

A `<Dynamic>` whose props object carries at least one getter — that is, at least one prop
the compiler proved reactive and lowered to a getter.

```jsx
<Dynamic component="div" total={count()} />    // BARQ006
```

## What it means

`Dynamic` does `const { component: _, ...rest } = props` internally. That rest pattern
reads every getter exactly once and hands the rendered component dead values, so
fine-grained flow stops at the `Dynamic` boundary (DESIGN §12 O7).

## The fix

Pass an accessor, so the reader decides when to read:

```jsx
<Dynamic component="div" total={count} />
```

## Silencing it

```jsx
{/* barq-ignore-next-line BARQ006 (this subtree is rebuilt on every change anyway) */}
<Dynamic component={tag()} total={count()} />
```
