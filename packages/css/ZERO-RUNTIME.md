# What still reaches the browser, and what it costs

`README.md` describes the surface. This file is about the gap between it and
"an application ships a stylesheet and string literals, and no CSS machinery at
all": what is left, what each remaining lever is worth, and which ones the
measurement kills.

Every number here was taken on the gallery, which is all forty-six components of
`@barqjs/ui` on one page, built through Vite 8 with `barqVitePlugin` and
lightningcss minification. `bunx vite build --config gallery/vite.config.ts`.

## What ships today

| | raw | gzip | brotli |
| --- | --- | --- | --- |
| JS bundle | 424.89 KB | 113.91 KB | 91.31 KB |
| CSS asset | 99.56 KB | 17.86 KB | |

The CSS asset is not one thing, and reading it as one is where the last session's
largest number came from:

| | bytes |
| --- | --- |
| `@layer barq.ui`, the components' atoms | 89,324 |
| `@layer barq.reset` | 4,047 |
| `@layer barq.base` | 1,271 |
| 53 `@property`, 5 `@keyframes`, the gallery's own 6 rules | 4,848 |
| layer wrappers and the layer declaration | 71 |

The package's own deduplicated rule set weighs 87.5 KB, and the asset weighs
99.56 KB. **That 12 KB is the reset, the base layer, the `@property` block and
the gallery's own CSS. It is not duplication.** See item 3.

On the JS side, one thing is worth stating precisely because the last
measurement stated it loosely. Counting the identifier `registerCss` in a
minified bundle returns 0, and that proves nothing: the bundle is minified, so
the name is gone whether the function is there or not. `registerCss` **is** in
the bundle. `packages/ui/src/theme/install.ts` calls it, which is what puts the
2,275-character `<style id="barq-css">` holding `@layer barq.theme` on the page.
That is the theme, by design, and it is not the atoms machinery.

## The atoms machinery, measured by removing it

`@barqjs/css`'s `build` accepts an object or a class string. `@barqjs/ui` only
ever hands it class strings at run time, because every object literal folded —
but the signature admits an object, so a bundler cannot drop the object half.

Stubbing `build`'s object branch and rebuilding:

| | raw | gzip | brotli |
| --- | --- | --- | --- |
| gallery JS, today | 424.89 KB | 113.91 KB | 91.31 KB |
| the same, object path removed | 420.55 KB | 112.53 KB | 90.16 KB |
| **difference** | **4.34 KB** | **1.35 KB** | **1.15 KB** |

That is `walk`, `apply`, `remove`, `atom`, `rule`, `atomKey`, `tierOf`,
`aboutSelf`, `expand`, `SHORTHANDS`, `UNEXPANDABLE` and `UNITLESS`. It is above
the "under a kilobyte, stop" bar, and it is not large. What makes it worth doing
is not the kilobyte; it is that a build currently has no way to know whether it
is paying for the fallback or using it.

## Nothing says when a call falls back

This is the finding that reorders the whole list. Only two declines report:

- **BARQ015**, an interpolation in a `css` block that is not knowable.
- **BARQ016**, `atoms` with two or more conditional arguments.

Every other way the pass declines is silent. Compiled standalone, each of these
produces no diagnostic and no CSS, and leaves the call for the runtime:

```ts
atomsIn("barq.ui", { color: theme.brand })       // an unreadable value
atomsIn(LAYER, { color: "red" })                 // a layer that is not a literal
atomsIn("barq.ui", { [MIX]: { color: "red" } })  // a computed key
atomsIn("barq.ui", ...rest)                      // a spread
atomsIn("barq.ui", { boxShadow: SHADOW })        // SHADOW declared below this line
atomsIn("barq.ui", { borderWidth: W })           // W is a template literal, not a string
createTheme(theme, { brand: "#60a5fa" })         // never compiled at all
```

`createTheme` is worth calling out separately: it is not in `Tag::of`, so it is
not compiled in any case, including the local one the README implies works.

So `strictCss` as the brief describes it — turn the notes into errors — has
almost nothing to turn. **The diagnostic is the deliverable, and the flag is the
switch on top of it.**

Two facts make that cheap to act on. Across `packages/ui`'s 60 modules that
import `@barqjs/css`, **no object literal survives compilation**: 127 `ui(…)`
calls remain, every one of them a merge over class strings the compiler already
produced. And `packages/kitchen-sink` emits 2 BARQ015 notes. Turning the CSS
codes into errors therefore costs `@barqjs/ui` nothing today, which is exactly
the claim worth being able to check rather than assert.

## The six levers, in the order the measurements put them

### 1. A diagnostic for every decline, and `strictCss` on top of it

**BARQ017**, a note: *a style object could not be read at compile time, so this
call is evaluated at run time.* Raised at every site where an object literal
fails to fold, and at BARQ016's site too.

The line is drawn at the object, not at the call, and that is deliberate. Three
outcomes are possible and only one of them keeps the machinery alive:

- The call folds to a literal. Nothing is left.
- The call folds partially: literal arguments become class strings, one argument
  stays opaque, and a merge over strings survives. `build`'s string branch is
  about 200 bytes; `walk` is not reached.
- An object literal reaches the runtime. `walk`, `expand`, `atom` and `register`
  are all live, and that is the 4.34 KB.

Reporting the second case would fire 127 times in `@barqjs/ui` on the documented
idiom, and it would be reporting a merge rather than a fallback. So it does not
report. The README already says this: "That last one is a merge and nothing
more."

`strictCss: true` in `ResolvedOptions` promotes every CSS code to an error.
Precedence is `checks` (per code, explicit) over `strictCss` over
`defaultCategory` over the code's own level, which keeps the existing surface
meaning what it meant.

**The soundness gap, stated rather than hidden.** An opaque argument is typed
`AtomStyles | string | …`, so a function returning a style object can still hand
`build` an object at run time. `strictCss` proves that no *statically visible*
object reaches the runtime, not that none does. That is why removing the object
branch is a second, separate switch (`define`) rather than a consequence of the
first, and why the runtime keeps its object branch by default.

### 2. A sub-layer per tier

This is the only correctness item on the list, and it is real.

Tier order settles the one pair specificity cannot: a base rule against the same
property under an at-rule, since `@media` adds none. It holds within one `atoms`
call, because a call emits its atoms sorted by tier. It does not hold across
modules, because a group declared in another module had its rules registered
first.

Measured on the gallery, over class strings that actually co-occur on one
element:

- **56** pairs are same-property, **same-specificity**, and cross-tier. Order
  alone decides each one.
- **3** of them are decided the wrong way today.

The three are live, in the shipped asset:

| property | wins today | should win |
| --- | --- | --- |
| `width` | `.a-width-1e6etfp_dcgnn > *` | `.a-width_dcgnn` |
| `color` | `.a-color-7khei3_xgag40[data-selected]` | `@media (hover:hover) …:hover` |
| `background-color` | `.a-background-color-7khei3_hbyvh9[data-selected]` | `@media (hover:hover) …:hover` |

The first is the bug `HANDOVER.md` already describes — "a field saying
`& > * { width: 100% }` took a label's own `width: fit-content` away" — back
again, across modules this time, where the within-call fix cannot see it.

The fix: emit each atom into a sub-layer named for its tier, and declare the
order once.

```css
@layer barq.ui.descendant, barq.ui.base, barq.ui.select, barq.ui.element, barq.ui.media;
```

Sub-layers of `barq.ui` are still inside `barq.ui`, so an application's
unlayered rule still beats every one of them, which is the property `atomsIn`
exists for and the reason atoms are not layered by default.

**Class names do not have to change, and should not.** The brief assumed they
would, because the layer joins an atom's identity through the suffix. That is
true of the *declared* layer and false of the tier: the tier is a pure function
of the condition, and the condition is already in the key. Two atoms with the
same key and the same value are the same tier by construction, so the tier adds
nothing to identity and the suffix keeps hashing `barq.ui|<value>`. The parity
test still proves the two implementations agree, on the rule text rather than on
a churn of 1,079 renamed classes.

Ordering the sub-layer declaration is the one thing a per-file pass has to be
careful about. `collectCss` emits a layer's block where the layer was first
named, so a module whose first atom is a media atom would otherwise declare
`barq.ui.media` first. The compiler therefore writes the declaration at the top
of every module stylesheet that uses the layer, and `collectCss` writes it before
the first sub-layer block it emits. A repeated `@layer a, b;` is idempotent, so
the repetition costs bytes and nothing else.

This has to land before item 3 could, if item 3 were worth doing.

### 3. Deduplicate rules across modules — already done, by lightningcss

The premise does not survive measurement.

Before minification, the gallery's 53 module stylesheets hold **2,236**
`barq.ui` rules, of which **1,079** are distinct: 73,379 bytes of the 162,974
are repeated text. That is real, and it is what the 12 KB figure was reaching
for. But it never ships. `build.cssMinify` defaults to lightningcss, and the
asset it produces holds **1,053 rules, 1,042 distinct, 1,761 duplicate bytes**.

| | raw | gzip | brotli |
| --- | --- | --- | --- |
| all 2,236 rules concatenated | 162,974 | 20,933 | 14,511 |
| the 1,079 distinct rules | 89,595 | 15,466 | 12,713 |
| what `@layer barq.ui` weighs in the asset | 89,324 | | |

The shipped layer is the deduplicated set, three hundred bytes under it because
lightningcss also shortens values. The 1,761 bytes it leaves are eleven rules
wrapped in `@supports` and `@media`, where it does not merge across the wrapper.

**No `generateBundle` pass. No work here.** The right thing was to check whether
lightningcss already offered it, and it does.

### 4. Fold what the object literal still cannot hold

Three of the four things in this item already work or are one line.

**A `const` holding a string already folds.** `text_of` resolves an identifier
through the `folded` table, so `const SHADOW = "var(--a), …"` then
`{ boxShadow: SHADOW }` compiles today and `shared-box.ts` could name that string
now. The premise that "a `const` is not an object literal" is about the argument
position, not the value position.

What does not fold:

- **A computed key.** `{ [MIX]: { … } }` for a repeated `@supports` condition.
  `key_name` returns `None` for anything but a static identifier or a string
  literal, and the whole call goes to the runtime in silence. One arm, resolving
  the key expression through `text_of`.
- **A `const` holding a no-substitution template literal.** `` const W = `2px` ``
  is recorded nowhere: `visit_variable_declarator` only files a `StringLiteral`.
  `text_of` already reads such a template, so this is one arm in the recorder.
- **A `const` used above its declaration.** The fold reads a table the same walk
  is filling, so this cannot be fixed without a second pass, and it should not
  be: BARQ015 already documents the same rule for `css` blocks. BARQ017 makes it
  visible, which is what was missing.

And one addition the item did not name. **`createTheme` over a local token set
is statically readable and is not compiled.** The compiler already holds the
`defineVars` result in `groups`, so the property name is in hand and the class
and its rule can both be computed. That removes `createTheme`, `hash` and
`register` from any bundle whose themes are local.

### 5. `variants` — rejected, on three call sites

`variants` is 63 ns and every `@barqjs/ui` component goes through `uiVariants`.
Folding a literal selection would need the compiler to read `uiVariants`, which
is a wrapper of the package's own and therefore not one it reads — the same rule
`layer` exists to work around.

That is moot, because of the nineteen variant call sites outside tests,
**three** pass a literal:

```
badgeVariants({ variant: "outline" })
buttonVariants({ variant: "outline" })
buttonVariants({ variant: "ghost", size: "icon" })
```

The other sixteen pass a signal read (`props.variant?.()`), which is the point of
a variant. Three calls times 63 ns is not a reason to teach the compiler a fifth
wrapper shape.

### 6. Cross-module groups, and why the merge stays

`shared.focusRing` imported from another module is opaque, so the merge stays at
run time. Fixing that means the compiler knowing something about another file,
and `transform` is per-file by design: that is what keeps dev and build
identical.

The two ways out, both taken by a neighbour, both read from their own source:

**StyleX holds cross-file state.** `processStylexRules` collects every rule from
every module, sorts them by a numeric priority, groups by
`Math.floor(priority / 1000)` and emits `@layer priority1, priority2, …`. The
layer list is derived from the whole rule set, so it cannot be written by a
per-file pass at all. Its Vite plugin pays for that with
`globalThis.__stylex_unplugin_store`, a map shared across the client, SSR and RSC
environments, plus an opt-in `devPersistToDisk` that serialises the rules to a
JSON file "to bridge multiple plugin containers/processes". That is the divergence
this project already rejected, written out in its own code.

**vanilla-extract evaluates the file.** `@vanilla-extract/compiler` starts a
second Vite server and a `ViteNodeRunner`, then calls `runner.executeFile(path)`
and reads the exports. There is no static analysis to defeat, which is why a
`.css.ts` file may compute anything — and that is what the separate-file
requirement buys: a file that is *executed at build time* is a different kind of
file from one that ships, and the extension says so. Colocation cannot have it,
because a component file cannot be executed at build time without executing the
component.

**Panda** reaches for sub-layers exactly as item 2 does (`recipes.slots`, `_base`
nested inside `recipes`) and ships `@csstools/postcss-cascade-layers` as a
polyfill; it also builds the whole sheet in one codegen step. **Tailwind v4**
declares `@layer theme, base, components, utilities;` once and sorts utilities
globally by a bigint variant mask then a property order — again, whole-project.
**Linaria**'s atomic mode has no ordering machinery at all: it hashes property
and value into a class and joins them, which is barq's problem with none of
barq's answer.

Every one of the four buys global ordering with a whole-project step. barq's
answer is different and it is the reason item 2 is cheap here: **the tier set is
fixed at five names, so the ordering declaration is a constant and a per-file
pass can write it.** StyleX cannot, because its priority groups depend on which
rules exist.

What is left, then, is the merge, and the honest number for it:

```
merge two class strings (7 classes)   443 ns/call
merge one class string (4 classes)    257 ns/call
atoms, 4 declarations                1092 ns/call
variants, two axes                     65 ns/call
```

443 ns per composing call, per render, is the price of a group crossing a module
boundary. It buys the property that a group is data, that the compiler never
reads another file, and that dev and build are the same pipeline. The rules
themselves already reach the stylesheet — partial folding put them there — so
what crosses is a `Map` over seven strings and not a stylesheet.

## What is not worth doing, with the number

Carried forward, so a later session does not re-derive them:

1. A four-character condition hash. 0.4 KB brotli, against a silent collision
   across 257 conditions.
2. Sorting rules within a tier. 0.3 KB brotli, and it changes which of two
   same-tier atoms wins.
3. Emitting atoms into a cascade layer unconditionally. Measured in a browser:
   every `margin` and `padding` computed to `0px`, because a layered rule loses
   to an unlayered one whatever its specificity.
4. One file for all twenty-two shared treatments. 3.19 KB of unused CSS for an
   application importing one `Button`, against 0.46 KB for six files.
5. A runtime wrapper for the layer. All 192 calls stayed on the runtime.
6. Shortening the property name in a class. 0.36 KB, where the entropy is in the
   hashes.
7. **A `generateBundle` dedup pass.** lightningcss already does it; the asset
   holds 1,042 distinct rules of 1,053.
8. **Folding a literal `variants` selection.** Three call sites.
