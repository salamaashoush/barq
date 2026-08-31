# BARQ017 — a call `@barqjs/css`'s runtime has to evaluate

**Level:** note. Raise it with `checks: { BARQ017: "warning" }`, or turn every
CSS code into an error with `strictCss: true`.

A style object in an `atoms`, `atomsIn`, `create`, `createIn`, `props`,
`defineVars`, `dynamic` or `createTheme` call could not be read at compile time,
so the call is left where it is and `@barqjs/css` evaluates it in the browser.

```tsx
import { atoms } from "@barqjs/css";
import { theme } from "./theme.ts";

const card = atoms({ color: theme.brand });   // BARQ017: another module's value
```

Nothing is broken. The runtime computes exactly what the compiler would have,
into the same registry and under the same class names, which is what the parity
test in `crates/barq-css/src/atoms.rs` pins. What is lost is the compilation:
that object is walked on every evaluation, and it is the reason `@barqjs/css`
ships its object path at all. Measured on the forty-six component gallery, that
path is 4.34 KB raw and 1.35 KB gzipped.

## What reaches this note, and what does not

**Everything this reports is a value from another module or a value that is
genuinely only known at run time.** It is not a list of shapes the compiler has
not got round to. Each of these folds:

```ts
const BRAND = "#3b82f6";                 // wherever in the file it is written
const SAME = BRAND;                      // and a binding naming a binding
const GAP = 8;                           // a number, `px` and all
const MIX = "@supports (color: color-mix(in lab, red, red))";
const LAYER = "barq.ui";

atoms({ color: BRAND, padding: GAP });
atoms({ [MIX]: { color: BRAND } });      // a computed key
atoms([base, active() && loud], extra);  // an array, and a spread of one
atomsIn(LAYER, { color: BRAND });        // a layer named by a constant
createTheme(tokens, { brand: BRAND });   // over a token set this module declares
```

A module-level `const` is a fact about the module, not about the line it is on:
a component written above the `const` it reads folds exactly as one written
below it, and a group or a token set is resolved the same way.

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

Every one of them is the per-file rule or a runtime value:

| what | why | fix |
| --- | --- | --- |
| `{ color: theme.brand }`, imported | `transform` is per-file and holds no cross-file state | pass it through a custom property and set it with `style`, or declare the token set here |
| `atomsIn(LAYER, …)`, `LAYER` imported | the layer joins every class name | bind it in this module with `const ui = layer("barq.ui")` |
| `atoms(...rest)` | not an argument list anything can count through | write the arguments out, or spread an array literal, which does fold |
| `defineVars({ brand: pick() })` | a call is not a value | name the value |
| `dynamic((c) => build(c))` | a body that computes cannot be read statically | the body must be an object literal, which is the rule StyleX states for the same reason |
| `createTheme(imported, …)` | the property names live in the token set | declare the token set in the module that themes it |
| `atoms(opaque, { color: null })` | a removal has to see what came before it | put the removal before the opaque argument, or use a separate call |
| `globalCss` outside statement position | it writes rules and returns nothing | give it its own statement |

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
