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

`clsx(base, variant)` composes classes, and which one wins is decided by the
order the two blocks were written in the stylesheet, not the order they were
passed. That is the bug every design system hits at scale: a variant that loses
to its own base because the bundler ordered the rules that way.

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
parsing, not by counting. Those are left whole rather than half-expanded, and
`mergeable` says so:

```ts
import { mergeable } from "@barqjs/css";

mergeable("border"); // false — a later `border-color` will not replace it
mergeable("marginTop"); // true
```

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
wins without `!important`. `atomsIn("barq.ui", { … })` says so at every call,
and the layer has to be a literal there because it becomes part of every class
name. `layer` binds it once instead:

```ts
import { createIn, layer } from "@barqjs/css";

const ui = layer("barq.ui");

export const shared = createIn("barq.ui", {
  ring: { outlineWidth: "3px", outlineColor: "var(--ring)" },
});

const card = ui(shared.ring, { display: "flex", padding: 8 });
```

The compiler reads `layer("barq.ui")` in **this** module, so the layer is still
a literal at the call site and every call through the binding folds exactly as
the `atomsIn` it stands for. An arrow function of your own does not fold, which
is the difference: `@barqjs/ui` wrote its wrapper that way once and its whole
stylesheet travelled inside the JS bundle.

It is per module because the pass is: a binding that crosses a module boundary
is not one the compiler reads. `createIn` is `create` with the same layer.

### Ordering

Nothing is wrapped in a cascade layer, and that is deliberate. Specificity does
almost all of it: `.a-color_x` is 0-1-0, `.a-color-h_y:hover` is 0-2-0,
`.a-content_z::before` is 0-1-1, and a reset's `* { margin: 0 }` is 0-0-0 and
loses to every atom.

The one pair specificity cannot separate is a base against the same property
under an at-rule, since `@media` adds none. A module emits its atoms in tier
order and that pair is decided. Ordering across modules is not needed: two atoms
conflict only when merged, merging happens in one `atoms` call, and one call is
in one module.

Atoms **were** emitted into `@layer`. That gave ordering across modules and took
away the thing atoms exist for, because a layered rule loses to an unlayered one
whatever its specificity. Measured in a browser: every `margin` and `padding` on
the page computed to `0px`, beaten by the application's own reset.

## Tokens and themes

```ts
import { createTheme, defineVars } from "@barqjs/css";

export const theme = defineVars({ brand: "#3b82f6", radius: "8px" });
// { brand: "var(--brand-1a2b3c)", radius: "var(--radius-1a2b3c)" }

export const dark = createTheme(theme, { brand: "#60a5fa" });
// a class that redeclares only `--brand-1a2b3c`
```

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

Every arm is an ordinary `css` block that compiles on its own, so `variants` is
pure string work: base first so a variant can override it, then the axes, then
compound arms last so a combination wins over what it refines. Selections are
typed against the groups, so `button({ size: "md" })` does not compile.

## Two helpers the compiler is not involved in

```ts
import { clsx, cssVar } from "@barqjs/css";

clsx("card", { active: true, disabled: false }, ["extra"]); // "card active extra"
cssVar("panel-bg", "#1e293b"); // "var(--panel-bg, #1e293b)"
```

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

| code                                      | when                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| [BARQ014](../compiler-rs/docs/BARQ014.md) | the block is not CSS this compiler can compile                                |
| [BARQ015](../compiler-rs/docs/BARQ015.md) | an interpolation is known only at run time, so the block stays on the runtime |
| [BARQ016](../compiler-rs/docs/BARQ016.md) | `atoms` has more than one conditional argument, so it stays on the runtime    |

## What is compiled, and what is not

Compiled away: `css`, `keyframes`, `globalCss`, `atoms`, `atomsIn`, `create`,
`createIn`, a call through a `layer` binding, `firstThatWorks`, `props`,
`defineVars`, `dynamic` (its class half).

Left to run, and why:

- **`variants`** emits no CSS at all. Its arms are compiled blocks; the function
  joins their class strings, and a selection is made at run time because that is
  the point. 63 ns.
- **A dynamic value.** A colour from a signal is not knowable at build time,
  which is why it becomes a custom property.
- **`clsx` and `cssVar`** are pure string functions over runtime values.
- **`createTheme` on an imported token set**, and any interpolation naming
  another module. `transform` is per-file and holds no cross-file state, which
  is what keeps dev and build identical.
- **`atoms` with two or more conditional arguments** (`BARQ016`). Four outcomes,
  then eight, and a nested ternary over eight class strings is larger than the
  runtime call it replaces.
