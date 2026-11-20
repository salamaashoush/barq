# @barqjs/css

Nested CSS and atomic styles, written beside the component and compiled to a
stylesheet at build time. `css` returns a class name; the call does not survive
the build.

## Install

```bash
bun add @barqjs/css
bun add -d @barqjs/vite
```

The compiler in `barq()` from `@barqjs/vite` is what folds the calls. Without
it every call still works, evaluated in the browser by this package's runtime.

```ts
// vite.config.ts
import barq from "@barqjs/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [barq()] });
```

## A block

```tsx
import type { ParentProps } from "@barqjs/core";
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

export function Card(props: ParentProps) {
  return <div class={card}>{props.children}</div>;
}
```

The compiler resolves the tag by `SymbolId`, replaces the whole tagged
template with `"b1n4k2p0"`, and hands the CSS to Vite. That happens before the
JSX is lowered, so `class={card}` is already a literal when the compiler folds
the template, and the element carries no class channel and no `renderEffect`:

```js
const _tmpl$1 = /* @__PURE__ */ _$template(`<div class="b1n4k2p0"></div>`);
```

A dev build names the class after its binding instead, `card_1n4k2p0`, so
devtools shows where a rule came from.

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
`clsx` here: one way to compose, and it answers the question.

An atom is one property, so the question is answerable without the cascade:

```ts
import { atoms } from "@barqjs/css";

const cls = atoms({ color: "red", margin: 0 }, active() && { color: "blue" });
```

Each class carries its own property (`a-color_1n4k2p0`), and merging keeps the
last class per property. **Passing order decides** for one property under one
condition: a later argument replaces an earlier one, whatever stylesheet either
came from.

Between two different conditions that can both match one element, such as
`:hover` and `[data-active]`, there is nothing to replace: both classes stay and
the stylesheet's order decides, and one stylesheet serves every call on the
page, so it cannot follow each call's writing order. The order is fixed instead.
Within one tier, a condition without an interaction pseudo-class comes first,
then `:link`, `:visited`, `:focus-within`, `:hover`, `:focus`, `:focus-visible`,
`:active`, and `:disabled` last, so `:active` beats `:hover` and `:disabled`
beats them all; two conditions of one place go by their hash. A rule about
something under the element, `& > *` or `& svg`, is in a tier of its own, and
there a rule under an at-rule comes after every rule under none, so
`"@supports (…)": { "& > *": … }` beats `"& > *"` as an element's own `@media`
rule beats its base. The compiler says
so (`BARQ033`) when one object writes such a pair the other way round. A
condition is hashed in one spelling (attribute values in double quotes, one
space around a combinator), so `[class*='x']` and `[class*="x"]` are one
condition and a later call replaces an earlier one.

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

### Named conditions

The same breakpoint written in two places is two spellings, and one spelled
`min-width:768px` is a second condition with its own hash and its own place in
the cascade. `defineConditions` names each once:

```ts
import { atoms, defineConditions } from "@barqjs/css";

export const when = defineConditions({
  md: "@media (min-width: 768px)",
  dark: "[data-theme=dark] &",
});

atoms({ padding: { default: 4, [when.md]: 8 }, [when.dark]: { color: "white" } });
```

The object comes back as it went in, so a computed key is the condition's own
text and folds like a literal one, in this module or through an import. A value
that is not a condition throws at once rather than being read as a property.

`firstThatWorks` emits the declaration repeated, best last, which is CSS's own
fallback mechanism written the right way round:

```ts
atoms({ position: firstThatWorks("sticky", "-webkit-sticky", "fixed") });
// .a-position_x{position:fixed;position:-webkit-sticky;position:sticky}
```

A `var()` in a box shorthand counts as one value, so `padding: "var(--space)"`
gives every side `var(--space)`. A token holding `4px 8px` therefore reaches each
side whole, which no browser keeps; write such a token per axis, or pass the
value through `dynamic`, which splits it when it arrives.

### Typed values

A property takes its own keywords as `csstype` spells them, a bare number where
it has lengths, and a `var()` reference anywhere. A condition key under a
property has to be `default` or a condition:

```ts
atoms({ display: 1 }); // error: `display` has no number
atoms({ position: "middle" }); // error
atoms({ color: { defualt: "red" } }); // error: as a selector it would style `.x defualt`
atoms({ position: tokens.place, width: 8 }); // fine
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
wins without `!important`. The layer becomes part of every class name, so the
compiler has to be able to read it. `layer` names it once a module, **for every
helper that writes a rule**:

```ts
import { layer } from "@barqjs/css";

const ui = layer("barq.ui");

export const shared = ui.create({ ring: { outlineWidth: "3px" } });
const card = ui(shared.ring, { display: "flex", padding: 8 });
const bg = ui.dynamic((colour: string) => ({ backgroundColor: colour }));
const attrs = ui.props(shared.ring, bg(theme()));
```

`ui(…)` is `atoms`, `ui.create` is `create`, `ui.props` is `props` and
`ui.dynamic` is `dynamic`, each with its rules in the layer. Each folds as the
unlayered helper does, because the compiler read `layer("barq.ui")` in **this**
module, so the layer is still a literal at the call site. The name may be a
string literal or a `const` (one imported through `@barqjs/vite` included); a
name the compiler cannot read leaves every call through the binding to the
runtime, and `BARQ017` says so. `ui.layer` is the name, if you need it.

`variants` is deliberately not on it. It writes no CSS (it composes classes
that already carry the layer they were declared in), so there is nothing to
bind.

An arrow function of your own does not fold, which is the difference:
`@barqjs/ui` wrote its wrapper that way once and its whole stylesheet travelled
inside the JS bundle. It is per module because the pass is: a binding that
crosses a module boundary is not one the compiler reads by itself, and
`@barqjs/vite` resolves the ones that do.

### Ordering

Nothing is wrapped in a cascade layer, and that is deliberate. Specificity does
almost all of it: `.a-color_x` is 0-1-0, `.a-color-h_y:hover` is 0-2-0,
`.a-content_z::before` is 0-1-1, and a reset's `* { margin: 0 }` is 0-0-0 and
loses to every atom.

The one pair specificity cannot separate is a base against the same property
under an at-rule, since `@media` adds none. The atom's **tier** decides that one,
and a tier is an ORDER: a production build runs `orderCss` over the concatenated
asset, rule by rule.

**A build writes every atom in one stylesheet.** A code-split build has a
stylesheet per chunk, and the tier order holds inside one sheet. An atom two
chunks use was written in both, so a chunk loaded later put a base rule after an
earlier chunk's `@media` rule for the same property and won a pair it should
lose. Measured on `@barqjs/ui`'s site: the docs sidebar computed `display: none`
at 1280px. Each module holding an atom now imports one shared sheet,
`@barqjs/vite` gathers every chunk's atoms into a file of their own once the
bundle is known, and a chunk's own sheet keeps only its `css` blocks. On that
site this took 8,882 computed values that differed from the dev server down to
1,437 across ten pages, and the stylesheets from 224 KB to 204 KB gzip, since
1,179 rules had been written more than once. With `build.cssCodeSplit: false`
there is one stylesheet for the blocks and the atoms are again a file of their
own, linked after it, so the runtime and a late stylesheet have a link to stand
in front of. A library build keeps its atoms inside its one sheet, after its
blocks, since a consumer imports one file; that sheet is found by what it holds,
whatever `cssFileName` called it.

**An atom beats a `css` block on the same element.** A block class and an atom
are both 0-1-0, so for one property on one element the later rule wins, and the
atom is the one a caller passed to override. So every atom comes after every
block, in every shape a page gets its CSS in:

- Inside one sheet, `orderCss` and the registry write every rule that is not an
  atom first, in the order it was written, and then the atoms in tier order.
  That covers the dev sheet, an unsplit build's one stylesheet and the atoms'
  own file. A rule is an atom's by itself alone: a minifier writes a block and
  an atom under one shared `@media`, or under one selector list when they say
  the same thing, and such a statement is taken apart first, the block's rule
  staying where it was under its own copy of the at-rule, for every group rule
  a condition can wrap an atom in (`@starting-style` and `@scope` as much as
  `@media`). The registry takes a statement apart by the same rule. `@charset`,
  `@import`, `@layer` statements and a leading byte order mark never move. A
  class counts as an atom's by itself: one class in the selector, in the exact
  shape the compiler names one, never by what the body declares, since a
  minifier below its logical-property support writes `inset-inline-start` as
  `left` and `right` under `:lang()`. `.a-button__icon`, somebody's BEM, and
  `url(./x.a-b_c.png)`, which is not in a selector, are not atoms.
- A split build links the atoms' file after every other stylesheet. Every entry
  lists it last, `<HeadContent />` writes it after the route's sheets with a
  `data-barq-atoms` attribute, and an `index.html` the build writes carries the
  same attribute on the link Vite puts last.
- A stylesheet linked after the first paint goes in front of that link: a
  dynamic import's (Vite's preload helper), a frame's (`@barqjs/start`), one
  `useHead` adds and one a streamed boundary's head patch adds.
- What the runtime registers is written in two `<style>` elements either side
  of that link: `#barq-css` with every rule that is not an atom in front of it,
  so a compiled atom beats a block the runtime evaluated, and `#barq-css-atoms`
  after it, so a runtime atom beats a compiled block. In dev there is no link,
  and Vite's dev client appends a `<style>` for each imported `.css` file to the
  end of `<head>`, so the registry writes its atoms into an adopted stylesheet,
  which the cascade puts after every stylesheet the document holds. Moving
  Vite's elements instead does not hold: `<HeadContent />` claims `<head>` by
  tag, and a foreign `<style>` between two of its own takes the place of the
  second. A sheet a render writes at the end of `<body>`, after the head, ends
  with every atom again when it holds a block, and a build links its atoms once
  more after it.

Before this the pair went by where each rule happened to land: module order in
a build, registration order in dev, and a route's chunk loaded after the first
paint beat every atom on its elements. It is order and nothing else, for the
reasons the rest of this section gives against a layer, and `!important` would
also beat the application's own rules.

**How a later stylesheet is put in front.** Vite's preload helper appends a
dynamic import's stylesheets to `<head>` with one `document.head.appendChild`,
and `@barqjs/vite` rewrites that call to insert in front of the atoms' link.
Two ways that leave Vite's code alone were weighed and rejected. Moving the
atoms' link back to the end each time something is appended after it takes the
sheet out of the document and puts it back, and the atoms stop applying until it
loads again. Moving the appended link in front from a `MutationObserver`
happens after the helper has inserted it, so its fetch starts, stops and starts
again, the observer runs on every page for the life of the page, and it would
also move stylesheets nothing of barq's put there. The rewrite costs nothing at
run time and the link is in its place before it is fetched. Its weakness is a
future helper written differently, or renamed so `transform` never sees it, and
both fail the build by default: the second is caught once the bundle is known,
when it has atoms and a dynamic import that brings a stylesheet but the rewrite
never ran. `compiler: { preloadHelper: "warn" }` builds anyway and says what it
could not do.

**Two atoms of one tier have one order.** When two atoms of one tier set one
property under different conditions that can both match one element, specificity
and tier tie, and one stylesheet serves every call. Arrival decided, and arrival
is a different thing in dev, a split build and an unsplit one: `@barqjs/ui`'s
button icons came out 12px in one shape and 16px in another. Within a tier the
interaction pseudo-class the rule's selector carries decides, in the order given
under "Atoms" above, and then the hash of the condition, which the class
carries. Both are read off the rule and untouched by a minifier. Two atoms under
one condition, which only meet where class strings are joined by hand rather
than merged, keep the order they arrived in. The icons were two conditions
because a base call wrote `'& svg:not([class*="size-"])'` and a size variant
the same with single quotes; a condition is now hashed in one spelling, so they
are one key and the variant replaces the base.

**Dev orders the same way.** `registerCss` files a compiled module's
stylesheet under the module's id, and the registry splits it back into rules,
reads each atom's tier off its rule text, and orders atoms as `orderCss` orders
the built asset. An atom two modules share is printed once.
`compiler/test/css-parity.test.ts` checks the runtime's sheet against
`orderCss` over the same input, because a second way of deciding a tier is only
safe while the two agree. Before this, composing a group from another module
could invert such a pair, because that module's rules were registered first:
measured on `@barqjs/ui`'s gallery, a calendar laid out in a column at 1280px
because `@media (width >= 48rem) { flex-direction: row }` lost to a `column` a
later module wrote.

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

// Tokens group to any depth, and a token is named by its path.
export const scale = globalVars({ space: { sm: "4px", lg: "16px" } });
// :root{--space-sm:4px;--space-lg:16px}
// { space: { sm: "var(--space-sm)", lg: "var(--space-lg)" } }
```

A token reads as `` `var(--${string})` `` to the type checker, which every
property accepts, and a numbered key such as a palette's `{ 50: …, 900: … }`
reads as `scale[900]`. Both nesting and numbered keys compile, here and in a
module that imports the token set.

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
  border-radius: ${tokens.radius};
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

Each variable is registered as `@property --… { syntax: "*"; inherits: false }`,
because only the element that sets it reads it, and an inherited custom property
changed on an element restyles everything under it. Measured in Chrome over
6,300 descendants: 1.26 ms a change unregistered, 0.002 ms registered. A value
under a descendant or a pseudo-element condition is read by inheritance and is
left unregistered.

A value can sit under any condition, as in `atoms`:

```ts
const tint = dynamic((colour: string, hover: string) => ({
  color: { default: colour, ":hover": hover },
  "@media (min-width: 600px)": { outlineColor: colour },
}));
```

`undefined`, `null` and `false` decline to add, so `props(base, tint(maybe))`
keeps whatever `base` set for that property when `maybe` is absent, and a
shorthand is split across its longhands when the value arrives:
`dynamic((m) => ({ margin: m }))` called with `"4px 8px"` sets four variables,
one per side.

A `props` call whose arguments the compiler has all read (style objects, groups,
and calls to a `dynamic` group declared as a `const` in the same module) is
compiled to `mergeStyles`, which merges class strings and writes variables and
nothing else. The object walk and the registry behind `props` are then not in
the bundle: measured on a one-component Vite app using `create`, `dynamic` and
`props`, 26.47 KB of JS gzipped became 22.79 KB, with the same classes and
styles on the page. A `layer` binding is marked pure for the same reason, so it
goes once every call through it has folded.

The function body must be an object literal, which is the same rule StyleX
states, and for the same reason: a body that computes cannot be read statically.
A `firstThatWorks` list is several declarations and cannot be one variable, so a
group holding one stays on the runtime (`BARQ017`).

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
a whole-block arm nothing: a `css` block's class carries no property, so it
merges against itself and survives whatever follows it.

An axis spelled `{ true: …, false: … }` is selected with a boolean, and its
default is written the same way: `defaults: { loud: true }`.

A compound arm may list several arms of an axis, and matches any of them:
`when: { size: ["sm", "md"] }`. `VariantProps<typeof button>` is the selection
as a type, for a component's own props.

A component made of several elements passes `slots`, and every arm names a class
for whichever parts it changes. The function then returns a class per part:

```ts
const field = variants({
  slots: { root: ui({ display: "grid" }), label: ui({ fontWeight: 500 }) },
  variants: {
    size: { lg: { root: ui({ gap: 8 }), label: ui({ fontSize: 18 }) } },
    invalid: { true: { label: ui({ color: "red" }) } },
  },
});

const { root, label } = field({ size: "lg", invalid: true });
```

## A value from another file

Most projects put the tokens in one file and import them, and share treatments
the same way. All of it folds:

```ts
// tokens.ts, with no `@barqjs/css` in it at all
export const BRAND = "var(--brand)";

// theme.ts
export const theme = defineVars({ brand: "#3b82f6" });

// shared.ts
export const ui = layer("app");
export const shared = ui.create({ ring: { outlineWidth: "3px" } });

// card.tsx, where every one of these is a literal after the build
const a = ui({ color: theme.brand, borderColor: BRAND });
const b = ui(shared.ring, { padding: 12 });
```

**The compiler still reads no file.** It reports which binding a fold would have
needed, `@barqjs/vite` resolves that one module and compiles again with
the answer, so `transform` stays a pure function of its inputs and a name means
the same thing in dev and in a build. That is what separates it from StyleX,
whose `@layer priority1 … priorityN` is derived from every rule in the project
and needs a store shared across the client, SSR and RSC environments to exist at
all. It is also not vanilla-extract's answer, which is to start a second Vite
server and _execute_ the `.css.ts` file, which is why that file has to be a
different kind of file from one that ships.

Costs one extra compile per imported file, cached by path and mtime, and only
for the files something asked for. `barq({ compiler: { resolveImports: false } })`
turns it off.

Two things follow from it and are worth knowing.

- **A module you fold a value out of may be dropped.** Inlining its value can
  leave it with no used export, and a bundler then drops the module and the
  stylesheet import inside it. The consumer carries that stylesheet instead, so
  the rules a class on the page needs are still there.
- **Under `bun test` nothing resolves imports.** `@barqjs/testing`'s preload
  compiles each `.tsx` file on its own, so those calls fall back to the
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
  integration (`@barqjs/vite` in dev, `@barqjs/testing`'s preload under
  `bun test`) appends `registerCss(id, css)` to the module instead. Keyed by module
  id, so an HMR update replaces that module's rules rather than stacking a
  second copy.

Both funnel into one registry, which is what makes a server-rendered dev page
arrive styled. Before that, it arrived with 23 classes in its markup and no
stylesheet of any kind.

## The runtime

There is one, and it is the escape hatch rather than the plan. It evaluates the
blocks the compiler declined (`BARQ015` names each one and why), and it is what
makes a component work under `bun test` with no build in front of it. Its
classes are prefixed `r`, where compiled ones are prefixed `b` (or named after
their binding in dev), so an `r` in devtools is how you find a block that did
not compile.

The package is `sideEffects: false`. An application that never writes an
uncompiled block pays 76 bytes for the registry the server entry imports, and
nothing on the client.

In a browser the registry writes one `<style>`, rewritten whole so it stays
readable in devtools. A call registers all of its rules before the one rewrite:
a cold `atoms` call of four declarations measured 3.49 ms over a 2,000-rule sheet
painting after each rule, and 0.72 ms painting once.

### Server rendering

```ts
import { collectCss, collectCssParts, setCssSink } from "@barqjs/css";
```

`collectCss()` returns the shared sheet: every rule registered so far, ordered.
A production build registers only what the compiler declined, because a
compiled block's CSS is an asset the document links. Dev registers everything,
which is what makes a server-rendered dev page arrive styled. `collectCssParts()`
is the same sheet as `{ blocks, atoms }`, the two `<style>` elements a head
writes either side of a build's atoms.

Both take a scope: the registry keys of the compiled module stylesheets one page
reaches, in the order its modules run. A server imports the application once,
so its registry holds every module any request has reached, and an unscoped
dev page carried them all: `/` rendered after `/create` had `/create`'s `#app`
rules. `@barqjs/vite`'s dev server answers the scope off its module graph, in
the order a build links the same stylesheets, following a route module's
`lazy()` targets and importing them first, so a lazy module's rules are in the
head on the first request as on every later one. Start's server entry passes
it through `devStylesheets(routes)` from `@barqjs/start`.

A sheet `registerCss` files while a request renders, such as a theme a
component installs, belongs to the requests that register it, where a host can
say which request is rendering (a sink with `owns`, which Start installs). It
reached every later page before: `/` after `/create` carried `/create`'s
`:root`, `.dark` and `[data-slot="preview"]` rules. A rule `atoms` or `css`
registers at run time is a class and stays in the shared sheet, since a later
request reuses it from a memo without registering it again.

A server imports the application once and renders many requests, so a host
also needs to know which rules arrived during one render. `setCssSink` installs
a function that is handed a copy of every new rule as it registers:

```ts
setCssSink((key, rules) => {
  // attribute the rule to the request in flight; the return value is unused
  return false;
});
```

It is a copy, not a move: the rule reaches the shared sheet either way. A
lazily routed module registers its rules inside whichever request first
imported it, and a sink that took them left every later page with no styles for
that module. A sink may also carry `head(late)`, which is told each time the
whole sheet is read (how a host serialises `<head>`) and handed a reader for
every rule registered after that read.

The server entry `@barqjs/vite` generates installs one through
`installCssSink` from `@barqjs/start`, backed by the `AsyncLocalStorage` it
already uses for `withRequest`, so two requests in flight at once cannot take
each other's rules.

In a browser no sink is installed and everything goes to the one sheet, which
is right: a rule from one route is still valid after navigating away and back.

## The whole surface

Everything a consumer may rely on, in one list. Anything not here is
`@barqjs/css/internal` and is not API: the hash, the tier table and the
shorthand map exist so the compiler and this package can be checked against each
other, and none of them is stable.

- `css`, `keyframes`, `globalCss`: a block, an animation, whole rules.
- `atoms`: declarations as classes, merged.
- `create`: a named set of those.
- `defineConditions`: conditions named once, for use as keys.
- `props`: the `class` and `style` an element takes.
- `mergeStyles`: what a compiled `props` call becomes.
- `dynamic`: a group whose values arrive at run time.
- `layer`: `atoms`, `create`, `props` and `dynamic` with their rules in one
  cascade layer.
- `variants`: a class per combination, merged and memoised.
- `defineVars`, `globalVars`, `createTheme`: tokens as custom properties.
- `firstThatWorks`: a declaration repeated, best last.
- `collectCss`, `registerCss`, `setCssSink`: the registry, for a server render.

The bare helpers are unlayered, and `layer(name)` is the one way to write into
a cascade layer.

## Grammar

Whatever `oxc-css-parser` accepts, which is the parser Oxfmt formats CSS with
and whose tests come from Web Platform Tests, the SWC CSS suite, esbuild,
sass-spec and the Less suite: native nesting, `@container`, `@layer`, `@scope`,
`@starting-style`, `@property`, and functional pseudo-classes such as
`:is(&, .plain)` and `:has(& > img)`.

A preprocessor's syntax is not CSS and is refused by name (`BARQ014`). The
parser runs in SCSS mode because that is the only dialect its interpolation
placeholders are legal in, and everything that widening lets through (`$var`,
`@mixin`, `@if`) would otherwise compile to a rule no browser applies.

## Diagnostics

- [BARQ014](../compiler/docs/BARQ014.md), an error: the block is not CSS
  this compiler can compile.
- [BARQ015](../compiler/docs/BARQ015.md), a note: an interpolation is known
  only at run time, so the block stays on the runtime.
- [BARQ016](../compiler/docs/BARQ016.md), a note: `atoms` has more than one
  conditional argument, so it stays on the runtime.
- [BARQ017](../compiler/docs/BARQ017.md), a note: a style object could not
  be read, so `@barqjs/css`'s runtime evaluates the call.

`barq({ compiler: { strictCss: true } })` turns all four into errors, and an
explicit `checks` entry for one code still wins over it. A build that passes with it on has
no call left for the runtime to evaluate, which is the fact worth being able to
check rather than assert; `@barqjs/ui` passes today. `ZERO-RUNTIME.md` measures
what that is worth.

## What is compiled, and what is not

Compiled away: `css`, `keyframes`, `globalCss`, `atoms`, `create`, `props`,
`dynamic` (its class half, conditions included), every call through a `layer`
binding, `firstThatWorks`,
`defineVars`, `globalVars` (nested to any depth, numbered keys included), and
`createTheme` over a token set the same module declares.

A module-level `const` is a fact about the module rather than about the line it
is on, so all of these fold wherever in the file the binding is written: a string,
a number, a template with no substitutions, a binding naming another binding, a
computed key, a layer name, a group and a token set. An array argument is the
argument list it always meant (`atoms([base, active() && loud])`), and so is a
spread of an array literal.

Left to run, and why:

- **`variants`** emits no CSS at all. Its arms are compiled blocks; the function
  merges their class strings, and a selection is made at run time because that
  is the point. 50 ns, memoised per selection, since a spec has finitely many.
- **A dynamic value.** A colour from a signal is not knowable at build time,
  which is why it becomes a custom property.
- **A value from a module the integration cannot resolve.** See below: with
  `@barqjs/vite` an imported token, group or layer binding folds, and
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
