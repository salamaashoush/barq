# BARQ017 — a call `@barqjs/css`'s runtime has to evaluate

**Level:** note. Raise it with `checks: { BARQ017: "warning" }`, or turn every
CSS code into an error with `strictCss: true`.

A style object in an `atoms`, `atomsIn`, `create`, `createIn`, `props`,
`defineVars`, `dynamic` or `createTheme` call could not be read at compile time,
so the call is left where it is and `@barqjs/css` evaluates it in the browser.

```tsx
import { atoms } from "@barqjs/css";

const card = atoms({ color: theme.brand });   // BARQ017: `theme` is not this module's
```

Nothing is broken. The runtime computes exactly what the compiler would have,
into the same registry and under the same class names, which is what the parity
test in `crates/barq-css/src/atoms.rs` pins. What is lost is the compilation:
that object is walked on every evaluation, and it is the reason `@barqjs/css`
ships its object path at all.

## Why it exists

The three ways to decline used to be two notes and five silences. A call that
fell back said nothing, so the only way to find out an application was still
paying for the runtime was to read the bundle. Measured on the forty-six
component gallery, the object path is 4.34 KB raw and 1.35 KB gzipped, and a
build that never triggers it has no way to say so without this note.

## What it does not report

**An argument that is not a style object.** An imported group, a caller's
`class` prop, a function call: only the runtime knows what those hold, so the
merge happens there. But every literal beside them still folds, their rules
still reach the stylesheet, and what is left is a merge over class strings:

```ts
import { shared } from "./shared.ts";

const card = ui(shared.ring, { color: "red", display: "flex" });
// ui(shared.ring, "a-color_296z6s a-display_18j4hje")
```

That is `@barqjs/css`'s string path, about 200 bytes, and it does not reach the
object walk. Reporting it would fire 127 times in `@barqjs/ui` on the idiom the
README recommends.

**`atoms` with two or more conditional arguments.** That has its own code,
[BARQ016](./BARQ016.md), and `strictCss` covers it too.

## The shapes that report, and the fix for each

| what | fix |
| --- | --- |
| `{ color: theme.brand }`, a value from another module | pass the value through a custom property and set it with `style` |
| `atomsIn(LAYER, …)`, a layer that is not a literal | bind it once with `const ui = layer("barq.ui")`, in this module |
| `atoms(...rest)`, a spread | write the arguments out; `atoms` takes as many as you like |
| `{ color: LATER }` above `const LATER = …` | move the `const` above the call — the fold reads a table the same walk is filling |
| `createTheme(imported, …)` | declare the token set in the module that themes it, or accept the runtime |
| `dynamic((c) => build(c))` | the body must be an object literal, which is the rule StyleX states for the same reason |
| `globalCss` outside statement position | `globalCss` writes rules and returns nothing; give it its own statement |

## `strictCss`

```ts
barq({ strictCss: true });
```

Every CSS code becomes an error: BARQ014, BARQ015, BARQ016 and this one. A build
that passes with it on has no call left for the runtime to evaluate, which is
the fact worth being able to check rather than assert. `@barqjs/ui` sets it at
no cost — no object literal survives compilation in any of its sixty modules.

Precedence runs `checks` (per code) over `strictCss` (per set) over
`defaultCategory` (all codes) over the code's own level, so one accepted call
still has a way back:

```ts
barq({ strictCss: true, checks: { BARQ017: "warning" } });
```

**What it proves, and what it does not.** An argument this pass cannot read is
typed `AtomStyles | string | …`, so a function returning a style object can hand
the runtime an object at run time. `strictCss` proves that no *statically
visible* object reaches it, which is what lets a build drop the object path
deliberately. It is not a proof that none can.
