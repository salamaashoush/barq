# @barqjs/css

Nested CSS and atomic styles, written beside the component and compiled to a
stylesheet at build time. `css` returns a class name; the call does not survive
the build.

```tsx
import { css } from "@barqjs/css";

const card = css`
  padding: 16px;
  border-radius: 12px;
  background: #1e293b;

  &:hover {
    background: #334155;
  }

  @media (min-width: 600px) {
    padding: 24px;
  }
`;

export function Card(props: { children?: unknown }) {
  return <div class={card}>{props.children}</div>;
}
```

`@barqjs/compiler` resolves the tag by `SymbolId`, replaces the whole tagged
template with `"b1n4k2p0"`, and hands the CSS to Vite. That happens before the
JSX is lowered, so `class={card}` is already a literal when the compiler folds
the template, and the element carries no class channel and no `renderEffect`:

```js
const _tmpl$1 = _$template(`<div class="b1n4k2p0"></div>`);
```

Resolution is by symbol, so a local function named `css` is not this `css`, and
`import { css as style }` still is.

## Two blocks and a global

```ts
import { css, globalCss, keyframes } from "@barqjs/css";

const fade = keyframes`
  from { opacity: 0 }
  to { opacity: 1 }
`;

const panel = css`
  animation: ${fade} 200ms ease-out;
`;

globalCss`
  body { margin: 0; font-family: system-ui }
`;
```

`keyframes` names the animation after its own text, so two identical animations
are one. `globalCss` writes whole rules and its statement is deleted outright.

Both are content-hashed, so two identical blocks in two modules produce one
class and one rule without any cross-module state. That is the dedup StyleX
needs build-level aggregation for, and it is why this package does not need it.

## Atoms

Concatenating classes composes blocks, and which one wins is then decided by the
order they were written in the stylesheet, not the order they were passed. That
is the bug every design system hits at scale: a variant that loses to its own
base because the bundler ordered the rules that way. It is why there is no
`clsx` here — one way to compose, and it answers the question.

An atom is one property, so the question is answerable without the cascade:

```ts
import { atoms } from "@barqjs/css";

const cls = atoms({ color: "red", margin: 0 }, active() && { color: "blue" });
```

Each class carries its own property (`a-color_1n4k2p0`), and merging keeps the
last class per property. **Passing order decides, always.**

### What atoms handle

```ts
atoms({
  // shorthands expand, so a longhand can replace one side and keep three
  margin: "0 4px",
  marginTop: 8,

  // conditions get their own key, so `:hover` never replaces the base
  color: {
    default: "black",
    ":hover": "blue",
    "@media (min-width: 800px)": { default: "navy", ":hover": "teal" },
  },

  // a pseudo-element is a top-level key holding a whole style object
  "::placeholder": { color: "#999" },

  // custom properties are declarations like any other
  "--brand": "#3b82f6",
});
```

`null` **removes** what an earlier argument applied, where `false` and
`undefined` only decline to add:

```ts
atoms(base, { color: null }); // whatever you set, not this
atoms(base, { color: props.colour }); // an absent prop leaves the base alone
```

Arrays are arguments like any other, so `atoms([base, active() && loud])` works.

`firstThatWorks` emits the declaration repeated, best last, which is CSS's own
fallback mechanism written the right way round:

```ts
atoms({ position: firstThatWorks("sticky", "-webkit-sticky", "fixed") });
// .a-position_x{position:fixed;position:-webkit-sticky;position:sticky}
```

### Shorthands that cannot merge

A shorthand whose values go to sub-properties **by type** rather than by
position cannot be expanded by counting them: `border: 1px solid red` puts three
values in three sub-properties, and which one each belongs to is decided by
parsing, not by counting. Those are left whole rather than half-expanded, so a later `border-color` does
not replace a `border`, where a later `margin-top` does replace one side of a
`margin`.

That refusal is the whole of the size difference against StyleX's 900-line
`application-order.js`, and it is a refusal rather than a guess.

### Named groups

```tsx
import { atoms, create } from "@barqjs/css";

const styles = create({
  root: { width: "100%", maxWidth: 800, minHeight: 40 },
  child: { backgroundColor: "black", marginBlock: "1rem" },
});

const colours = create({
  red: { backgroundColor: "red", borderColor: "darkred" },
  green: { backgroundColor: "lightgreen", borderColor: "darkgreen" },
});

<div class={atoms(styles.root, active() && colours.red)} />;
```

`create` costs nothing beyond `atoms`: a group is one merge, and two groups
compose by handing both back to `atoms`, which merges names by the key each one
carries. The compiler turns the whole thing into an object of string literals
and the call site into one string, or one ternary when a group is conditional.

A group is what a treatment shared across a package is written as once. The
object is plain strings, so it crosses a module boundary as data and every
module composing it lands on the classes the group's own module registered.

### A layer, named once

A design system's rules belong in a cascade layer, so an application's own rule
wins without `!important`. `atomsIn("barq.ui", { … })` says so at every call, and
the layer has to be a literal there because it becomes part of every class name.
`layer` binds it once instead, **for every helper that writes a rule**:

```ts
import { layer } from "@barqjs/css";

const ui = layer("barq.ui");

export const shared = ui.create({ ring: { outlineWidth: "3px" } });
const card = ui(shared.ring, { display: "flex", padding: 8 });
const bg = ui.dynamic((colour: string) => ({ backgroundColor: colour }));
const attrs = ui.props(shared.ring, bg(theme()));
```

`ui(…)` is `atomsIn`, `ui.create` is `createIn`, `ui.props` is `propsIn` and
`ui.dynamic` is `dynamicIn`. Each folds exactly as the `…In` it stands for,
because it is that call: the compiler read `layer("barq.ui")` in **this** module,
so the layer is still a literal at the call site. `ui.layer` is the name, if you
need it.

`variants` is deliberately not on it. It writes no CSS — it composes classes
that already carry the layer they were declared in — so there is nothing to
bind.

An arrow function of your own does not fold, which is the difference:
`@barqjs/ui` wrote its wrapper that way once and its whole stylesheet travelled
inside the JS bundle. It is per module because the pass is: a binding that
crosses a module boundary is not one the compiler reads by itself, and
`@barqjs/compiler/vite` resolves the ones that do.

### Ordering

Nothing is wrapped in a cascade layer, and that is deliberate. Specificity does
almost all of it: `.a-color_x` is 0-1-0, `.a-color-h_y:hover` is 0-2-0,
`.a-content_z::before` is 0-1-1, and a reset's `* { margin: 0 }` is 0-0-0 and
loses to every atom.

The one pair specificity cannot separate is a base against the same property
under an at-rule, since `@media` adds none. The atom's **tier** decides that one,
and a tier is an ORDER: `collectCss` sorts every rule it holds by it, and a
production build runs `orderCss` over the concatenated asset so the bundle agrees
with dev. Composing a group from another module used to invert such a pair,
because that module's rules were registered first — measured on `@barqjs/ui`'s
gallery, a calendar laid out in a column at 1280px because
`@media (width >= 48rem) { flex-direction: row }` lost to a `column` a later
module wrote.

A tier is never a cascade layer, and that distinction is load-bearing. CSS
decides by specificity first and order second; a layer decides before either. One
sub-layer per tier was tried and moved 289 computed values on the same gallery,
because a parent's `[data-variant="destructive"] &` at 0-2-0 stopped beating the
child's own 0-1-0. Reordering moves 8, and all 8 are the pair above.

Atoms **were** emitted into `@layer`. That gave ordering across modules and took
away the thing atoms exist for, because a layered rule loses to an unlayered one
whatever its specificity. Measured in a browser: every `margin` and `padding` on
the page computed to `0px`, beaten by the application's own reset.

## Tokens and themes

```ts
import { createTheme, defineVars, globalVars } from "@barqjs/css";

// The names are the contract: an application brings its own `:root`, and a
// theme copied out of a generator lands on your components unrewritten.
export const tokens = globalVars({ primary: "#3b82f6", radius: "8px" });
// { primary: "var(--primary)", radius: "var(--radius)" }

// The names are yours alone, and a collision would be a bug. The suffix is a
// hash of the whole token object.
export const theme = defineVars({ brand: "#3b82f6" });
// { brand: "var(--brand-1a2b3c)" }

export const dark = createTheme(theme, { brand: "#60a5fa" });
// a class that redeclares only `--brand-1a2b3c`
```

**Reach for `globalVars` when the names are published and `defineVars` when they
are private.** A design system wants the first: hashing makes the token set a
closed system, so nothing outside it can write `--primary` and be heard, and
`@barqjs/ui` hand-wrote its tokens for exactly that reason before this existed.

The returned object is plain strings, so a token set crosses a module boundary
as **data** rather than as something the compiler has to resolve there. That is
the machinery behind StyleX's Vite dev path diverging from its build, and this
does not need it.

The group suffix is a hash of the whole token object, so two files declaring the
same tokens share them and two whose `brand` differs do not collide. A theme is
a class you put on any element; the subtree below reads the new values because
that is what a custom property does, with no component re-rendered and no second
copy of any rule.

A token used inside a block in the same module folds:

```ts
const card = css`
  color: ${theme.brand};
  padding: ${theme.radius};
`;
```

## Dynamic values

```tsx
import { create, dynamic, props } from "@barqjs/css";

const styles = create({ root: { padding: 8 } });
const bg = dynamic((colour: string) => ({ backgroundColor: colour }));

<div {...props(styles.root, bg(theme()))} />;
```

`props` returns `class` and `style`. The class is fixed, reading
`var(--background-color-1j1m7tz)`, and only the variable changes, so a colour
that changes every frame writes one custom property and produces **no new CSS**.
Measured in a browser: the sheet held 105 rules before and after three different
values. barq's spread is reactive, so that one write is the only thing that
happens.

The function body must be an object literal, which is the same rule StyleX
states, and for the same reason: a body that computes cannot be read statically.

## Variants

```tsx
import { css, variants } from "@barqjs/css";

const button = variants({
  base: css`
    border: 0;
    cursor: pointer;
  `,
  variants: {
    size: {
      sm: css`
        padding: 4px 8px;
      `,
      lg: css`
        padding: 12px 20px;
      `,
    },
    tone: {
      primary: css`
        background: #3b82f6;
      `,
      muted: css`
        background: #475569;
      `,
    },
  },
  defaults: { size: "sm", tone: "primary" },
  compound: [
    {
      when: { size: "lg", tone: "primary" },
      use: css`
        font-weight: 600;
      `,
    },
  ],
});

<button class={button({ size: "lg" })} />;
```

Every arm is a class something else already compiled, so `variants` is pure
string work: base first so a variant can override it, then the axes, then
compound arms last so a combination wins over what it refines. Selections are
typed against the groups, so `button({ size: "md" })` does not compile.

It **merges**, which is what `atoms` does and what the rest of this package
means by composing. Joining was the other option and it was wrong: two atoms for
one property both apply and the stylesheet's order decides, so a `size` that
sets `width` over a `base` that sets `width` lost to its own base. Merging costs
a whole-block arm nothing — a `css` block's class carries no property, so it
merges against itself and survives whatever follows it.

## A value from another file

Most projects put the tokens in one file and import them, and share treatments
the same way. All of it folds:

```ts
// tokens.ts — no `@barqjs/css` in it at all
export const BRAND = "var(--brand)";

// theme.ts
export const theme = defineVars({ brand: "#3b82f6" });

// shared.ts
export const ui = layer("app");
export const shared = createIn("app", { ring: { outlineWidth: "3px" } });

// card.tsx — every one of these is a literal after the build
const a = atomsIn("app", { color: theme.brand, borderColor: BRAND });
const b = atomsIn("app", shared.ring, { padding: 12 });
const c = ui({ padding: 4 });
```

**The compiler still reads no file.** It reports which binding a fold would have
needed, `@barqjs/compiler/vite` resolves that one module and compiles again with
the answer, so `transform` stays a pure function of its inputs and a name means
the same thing in dev and in a build. That is what separates it from StyleX,
whose `@layer priority1 … priorityN` is derived from every rule in the project
and needs a store shared across the client, SSR and RSC environments to exist at
all. It is also not vanilla-extract's answer, which is to start a second Vite
server and _execute_ the `.css.ts` file — the reason that file has to be a
different kind of file from one that ships.

Costs one extra compile per imported file, cached by path and mtime, and only
for the files something asked for. `resolveImports: false` turns it off.

Two things follow from it and are worth knowing.

- **A module you fold a value out of may be dropped.** Inlining its value can
  leave it with no used export, and a bundler then drops the module and the
  stylesheet import inside it. The consumer carries that stylesheet instead, so
  the rules a class on the page needs are still there.
- **Under `bun test` there is no integration**, so those calls fall back to the
  runtime, which computes the same class names. Nothing diverges; only the CSS
  arrives through `<style id="barq-css">` rather than an asset, which is already
  true of every block in dev.

A token set that crosses as a plain object of `var()` strings needs none of
this, and is what `@barqjs/ui` does: `tokens.ts` there is hand-written
`"var(--primary)"` rather than `defineVars`, so an application can bring its own
`:root` and the package is not a closed system.

## How the CSS reaches the page

The compiler produces a module's stylesheet; the integration decides how it
arrives.

- **Production build.** A real `.css` asset the transformed module imports, so
  Vite emits it and `<HeadContent />` links one per route. `build.cssMinify`
  defaults to lightningcss, so minification, prefixing and target downleveling
  all happen downstream and no MPL-licensed crate enters barq's Cargo tree.
- **Dev, and `bun test`.** Neither has a bundle to emit an asset from, so the
  compiler appends `registerCss(id, css)` to the module instead. Keyed by module
  id, so an HMR update replaces that module's rules rather than stacking a
  second copy.

Both funnel into one registry, which is what makes a server-rendered dev page
arrive styled. Before that, it arrived with 23 classes in its markup and no
stylesheet of any kind.

## The runtime

There is one, and it is the escape hatch rather than the plan. It evaluates the
blocks the compiler declined (`BARQ015` names each one and why), and it is what
makes a component work under `bun test` with no build in front of it. Its
classes are prefixed `r` where compiled ones are prefixed `b`, so an `r` in
devtools is how you find a block that did not compile.

The package is `sideEffects: false`. An application that never writes an
uncompiled block pays 76 bytes for the registry the server entry imports, and
nothing on the client.

### Server rendering

```ts
import { collectCss, setCssSink } from "@barqjs/css";
```

`collectCss()` returns the rules registered when the application was **imported**
— module scope, which every request needs. A rule a component body registers
belongs to **one** request, and `setCssSink` is how a host claims it:

```ts
setCssSink((key, rules) => {
  // return true if this host took the rule, false to leave it in the shared sheet
});
```

`@barqjs/start` installs a sink backed by the `AsyncLocalStorage` it already
uses for `withRequest`, so two requests in flight at once cannot take each
other's rules. Without the split, a server imported the application once and
served forever: `/about` inlined the rules a request for `/css` had produced.

In a browser no sink is installed and everything goes to the one sheet, which is
right — a rule from one route is still valid after navigating away and back.

## The whole surface

Everything a consumer may rely on, in one list. Anything not here is
`@barqjs/css/internal` and is not API: the hash, the tier table and the
shorthand map exist so the compiler and this package can be checked against each
other, and none of them is stable.

|                                           |                                              |
| ----------------------------------------- | -------------------------------------------- |
| `css`, `keyframes`, `globalCss`           | a block, an animation, whole rules           |
| `atoms`, `atomsIn`                        | declarations as classes, merged              |
| `create`, `createIn`                      | a named set of those                         |
| `props`, `propsIn`                        | the `class` and `style` an element takes     |
| `dynamic`, `dynamicIn`                    | a group whose values arrive at run time      |
| `layer`                                   | all five above, with one layer bound         |
| `variants`                                | a class per combination, merged and memoised |
| `defineVars`, `globalVars`, `createTheme` | tokens as custom properties                  |
| `firstThatWorks`                          | a declaration repeated, best last            |
| `collectCss`, `registerCss`, `setCssSink` | the registry, for a server render            |

Every one of the pairs reads the same: the bare name is unlayered, the `…In`
name takes a cascade layer as its first argument, and `layer(name)` binds that
argument once for all of them.

## Grammar

Whatever `oxc-css-parser` accepts, which is the parser Oxfmt formats CSS with
and whose tests come from Web Platform Tests, the SWC CSS suite, esbuild,
sass-spec and the Less suite: native nesting, `@container`, `@layer`, `@scope`,
`@starting-style`, `@property`, and functional pseudo-classes such as
`:is(&, .plain)` and `:has(& > img)`.

A preprocessor's syntax is not CSS and is refused by name (`BARQ014`). The
parser runs in SCSS mode because that is the only dialect its interpolation
placeholders are legal in, and everything that widening lets through — `$var`,
`@mixin`, `@if` — would otherwise compile to a rule no browser applies.

## Diagnostics

| code                                      | when                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| [BARQ014](../compiler-rs/docs/BARQ014.md) | the block is not CSS this compiler can compile                                  |
| [BARQ015](../compiler-rs/docs/BARQ015.md) | an interpolation is known only at run time, so the block stays on the runtime   |
| [BARQ016](../compiler-rs/docs/BARQ016.md) | `atoms` has more than one conditional argument, so it stays on the runtime      |
| [BARQ017](../compiler-rs/docs/BARQ017.md) | a style object could not be read, so `@barqjs/css`'s runtime evaluates the call |

`strictCss: true` turns all four into errors. A build that passes with it on has
no call left for the runtime to evaluate, which is the fact worth being able to
check rather than assert; `@barqjs/ui` passes today. `ZERO-RUNTIME.md` measures
what that is worth.

## What is compiled, and what is not

Compiled away: `css`, `keyframes`, `globalCss`, `atoms`, `atomsIn`, `create`,
`createIn`, `props`, `propsIn`, `dynamic` (its class half), `dynamicIn`, every
call through a `layer` binding, `firstThatWorks`, `defineVars`, `globalVars`,
and `createTheme` over a token set the same module declares.

A module-level `const` is a fact about the module rather than about the line it
is on, so all of these fold wherever in the file the binding is written: a string,
a number, a template with no substitutions, a binding naming another binding, a
computed key, a layer name, a group and a token set. An array argument is the
argument list it always meant (`atoms([base, active() && loud])`), and so is a
spread of an array literal.

Left to run, and why:

- **`variants`** emits no CSS at all. Its arms are compiled blocks; the function
  merges their class strings, and a selection is made at run time because that
  is the point. 50 ns, memoised per selection — a spec has finitely many.
- **A dynamic value.** A colour from a signal is not knowable at build time,
  which is why it becomes a custom property.
- **A value from a module the integration cannot resolve.** See below: with
  `@barqjs/compiler/vite` an imported token, group or layer binding folds, and
  what is left is a specifier nothing on disk answers for.
- **`atoms` with two or more conditional arguments** (`BARQ016`). Four outcomes,
  then eight, and a nested ternary over eight class strings is larger than the
  runtime call it replaces.
- **The merge, when an argument is not readable here.** An imported group, a
  caller's `class` prop, a function call: only the runtime knows what it holds.

That last one is a merge and nothing more. Every literal argument beside it
still folds, so the rules still reach the stylesheet rather than being
registered from the JS bundle at import time, and what is left is
`atoms(group, "a-color_x a-display_y")` over class strings:

```ts
import { shared } from "./shared.ts";

const card = ui(shared.ring, { color: "red", display: "flex" });
// ui(shared.ring, "a-color_296z6s a-display_18j4hje")
```

The one thing that does not fold beside an opaque argument is `null`, because a
removal has to see what came before it. Written after one, the call stays whole.
