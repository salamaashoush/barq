# What still reaches the browser, and what it costs

`README.md` describes the surface. This file is about the gap between it and
"an application ships a stylesheet and string literals, and no CSS machinery at
all": what is left, what each remaining lever is worth, and which ones the
measurement kills.

Every number here was taken on the gallery, which is all forty-six components of
`@barqjs/ui` on one page, built through Vite 8 with `barqVitePlugin` and
lightningcss minification. `bunx vite build --config gallery/vite.config.ts`.

## What ships today

|           | raw       | gzip      | brotli   |
| --------- | --------- | --------- | -------- |
| JS bundle | 424.89 KB | 113.91 KB | 91.31 KB |
| CSS asset | 99.56 KB  | 17.75 KB  | 14.80 KB |

And after everything below: 425.10 KB / 113.99 / 91.30 of JS, 99.71 KB /
17.50 / 14.67 of CSS. The point of the work is not the size, and the size says
so.

The CSS asset is not one thing, and reading it as one is where the last session's
largest number came from:

|                                                           | bytes  |
| --------------------------------------------------------- | ------ |
| `@layer barq.ui`, the components' atoms                   | 89,324 |
| `@layer barq.reset`                                       | 4,047  |
| `@layer barq.base`                                        | 1,271  |
| 53 `@property`, 5 `@keyframes`, the gallery's own 6 rules | 4,848  |
| layer wrappers and the layer declaration                  | 71     |

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

|                               | raw         | gzip        | brotli      |
| ----------------------------- | ----------- | ----------- | ----------- |
| gallery JS, today             | 424.89 KB   | 113.91 KB   | 91.31 KB    |
| the same, object path removed | 420.55 KB   | 112.53 KB   | 90.16 KB    |
| **difference**                | **4.34 KB** | **1.35 KB** | **1.15 KB** |

Removed with it go `walk`, `apply`, `remove`, `atom`, `rule`, `atomKey`, `tierOf`,
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
atomsIn("barq.ui", { color: theme.brand }); // an unreadable value
atomsIn(LAYER, { color: "red" }); // a layer that is not a literal
atomsIn("barq.ui", { [MIX]: { color: "red" } }); // a computed key
atomsIn("barq.ui", ...rest); // a spread
atomsIn("barq.ui", { boxShadow: SHADOW }); // SHADOW declared below this line
atomsIn("barq.ui", { borderWidth: W }); // W is a template literal, not a string
createTheme(theme, { brand: "#60a5fa" }); // never compiled at all
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

**BARQ017**, a note: _a style object could not be read at compile time, so this
call is evaluated at run time._ Raised at every site where an object literal
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
`build` an object at run time. `strictCss` proves that no _statically visible_
object reaches the runtime, not that none does.

On its own the flag removes nothing from a bundle: it makes the fact
checkable, and dropping the 4.34 KB is a second switch on top of it that nothing
here has built yet. That is the honest order of the two, and the first is worth
having without the second.

### 2. Global tier order, and why it is not a cascade layer

The only correctness item on the list, and it is real. The fix is not
the one the brief proposed, and a browser is what said so.

Tier order settles the one pair specificity cannot: a base rule against the same
property under an at-rule, since `@media` adds none. It holds within one `atoms`
call, because a call emits its atoms sorted by tier. It does not hold across
modules, because the compiler emits one stylesheet per module and the bundler
concatenates them in import order.

Measured on the gallery, over class strings that co-occur on one element: **56**
pairs are same-property, same-specificity and cross-tier, so order alone decides
each one, and **3** are decided the wrong way today.

**The sub-layer per tier is wrong, and it is wrong by 289 computed values.**
Emitting each tier into `@layer barq.ui.descendant … barq.ui.media` and diffing
the gallery against `main` — every `[data-slot]` element, 485 of them, all 579
computed properties plus the bounding box — moved 289 of them. The reason is one
sentence: **a cascade layer overrides specificity, and the tier is a tie-breaker
on top of it.** CSS decides by specificity first and order second; a layer
decides before either. So a parent's `[data-variant="destructive"] &` at 0-2-0
stopped beating the child's own 0-1-0 the moment the two sat in different
sub-layers, and an `[data-selected]` at 0-2-0 lost to a `@media (hover: hover)`
rule of the same specificity that it should have been ranked against by order.
StyleX can group by priority into `@layer priority1 … priorityN` because every
one of its selectors is one class plus a pseudo, so priority order _is_ the
intended order. barq's atoms carry `:is(.dark *)[data-invalid]` at 0-4-0 beside
`.a-color_x` at 0-1-0, and flattening that is not an option.

**Reordering is right, and it moves 8.** A stable sort by tier, over the
concatenated asset, changes order and never specificity — which is exactly what
a tie-breaker is allowed to do. Every one of the eight is a rule under an at-rule
that a later base rule was beating:

| slot                                      | on `main`                | after           | why                                                               |
| ----------------------------------------- | ------------------------ | --------------- | ----------------------------------------------------------------- |
| `calendar-months`                         | `flex-direction: column` | `row`           | `@media (width >= 48rem)` lost, so the calendar stacked at 1280px |
| `breadcrumb-list`                         | `gap: 6px`               | `10px`          | `@media (width >= 40rem)` lost, and three rects moved with it     |
| `dialog-header`                           | `text-align: center`     | `left`          | `@media (width >= 40rem)` lost                                    |
| `item`, `checkbox`, `input-group-control` | a solid colour           | the `color-mix` | `@supports (color-mix(…))` lost                                   |

The first three are shadcn's `md:flex-row`, `sm:gap-2.5` and `sm:text-left`. They
are live visual bugs on `main`, and no test could have found them: the rule is in
the stylesheet, the class is on the element, and only a browser resolves the
cascade.

`collectCss` has always sorted globally, so **dev was already right and only the
production bundle was not**. `orderCss` is that same sort, exported from the
compiler crate that owns `tier_of` and applied in the Vite plugin's
`generateBundle`. `generateBundle` and not `transform`, because the ordering is a
fact about the whole asset and `transform` is per file — which is the property
that keeps dev and build identical everywhere else, and the one StyleX gives up.

Deriving the tier a second time, from the rule text rather than from the
condition, is the cost. `the two ways of deciding a tier agree` pins them against
each other over every condition shape the pass produces, because a stylesheet
ordered by one rule and written by another is worse than one not ordered at all.

Rules that are not atoms do not move. A hand-written `@layer barq.ui { … }` block
carries an author's own intent about where it sits, and `@barqjs/ui`'s `srOnly`
is exactly that.

### 2b. A comma in a condition dropped the class from half the rule

The browser pass found a second bug, live on `main` and nothing to do with
ordering except that ordering exposed it.

```ts
"[data-expanded], &[data-open]": { backgroundColor: "var(--accent)" }
```

Both implementations substituted `&` with one `replaceAll` over the whole
condition part. The second branch has a `&` so the substitution "worked", and the
first was left as a bare `[data-expanded]` — a rule about **every element on the
page** carrying that attribute. It is in `@barqjs/ui`'s menubar, and it was
painting an open accordion three sections away with `--accent` and
`--accent-foreground`, inherited by its content and its body.

It survived because it lost on order. Reordering let it win, which is how it was
found. Each branch of a selector list gets the class now, splitting at commas at
bracket depth zero so `:is(a, b)` is untouched, and a list counts as a descendant
when any branch is.

### 3. Deduplicate rules across modules — already done, by lightningcss

The premise does not survive measurement.

Before minification, the gallery's 53 module stylesheets hold **2,236**
`barq.ui` rules, of which **1,079** are distinct: 73,379 bytes of the 162,974
are repeated text. That is real, and it is what the 12 KB figure was reaching
for. But it never ships. `build.cssMinify` defaults to lightningcss, and the
asset it produces holds **1,053 rules, 1,042 distinct, 1,761 duplicate bytes**.

|                                           | raw     | gzip   | brotli |
| ----------------------------------------- | ------- | ------ | ------ |
| all 2,236 rules concatenated              | 162,974 | 20,933 | 14,511 |
| the 1,079 distinct rules                  | 89,595  | 15,466 | 12,713 |
| what `@layer barq.ui` weighs in the asset | 89,324  |        |        |

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

### 5. `variants` — two bugs, and neither was the folding

The item asked whether to fold a literal selection. That was the wrong question:
a literal selection is a call you would have written as `ui(…)` anyway, and the
dominant shape is a signal read, which nothing can fold. What `variants` needed
was to stop being different from everything else.

It joined where the rest of the package merges — the exact bug atoms exist
to remove, since two classes for one property both apply and the stylesheet
decides. `@barqjs/ui` wrapped it in `uiVariants` to fix that, and the wrapper's
comment records the cost: the calendar's day buttons fell back to `inline-flex`
and its month buttons regained a padding they had overridden. It merges now, and
the wrapper is gone. A whole-block arm is untouched, because a block's class
carries no property and merges against itself.

A boolean axis also took the default silently. `{ true: …, false: … }` is how an
on/off variant is spelled, and `false` was both a legal key and the sentinel for
"not chosen":

```
b({ loud: "false" })  -> OFF-arm   correct
b({ loud: false })    -> ON-arm    the default, not the arm written for it
```

An arm is chosen by the TEXT of the value now, and a value the axis has no arm
for falls to the default. One rule, both cases.

Merging also cost it 17x at first. 65 ns joining, 1,110 ns merging, because it rebuilt
the same `Map` every render. A selection is memoised — a spec has finitely many,
since the axes are enumerated by hand — and it lands at **50 ns**, faster than
the join it replaced.

### 6. Cross-module values — solved, by resolving the import

A value another module owns was the one thing left, and it is the shape most
projects have: the tokens in one file, the shared treatments in another, the
components importing both. Measured before the fix, on four files:

| what `card.tsx` imports                | folded | what ran in the browser                   |
| -------------------------------------- | ------ | ----------------------------------------- |
| a `createIn` group                     | partly | a merge over class strings, 443 ns a call |
| a `defineVars` token                   | **no** | the whole call, object walk and all       |
| a plain `const BRAND = "var(--brand)"` | **no** | the whole call                            |
| a `layer("app")` binding               | **no** | the whole call                            |

Only the first was acceptable. The other three are the common case, and they
fell all the way back.

**The fix keeps the compiler per-file.** It reads no file. It reports which
binding a fold would have needed (`cssWanted`), the Vite plugin resolves that
one module, compiles it for its exported constants (`cssExports`), and compiles
the consumer again with the answer (`cssImports`). `transform` is still a pure
function of its inputs, so a name means the same thing in dev and in a build.

That is a different thing from what the neighbours give up:

- **StyleX** derives `@layer priority1 … priorityN` from every rule in the
  project. That is a whole-project reduction, and its Vite plugin pays for it
  with `globalThis.__stylex_unplugin_store` shared across the client, SSR and
  RSC environments, plus an opt-in `devPersistToDisk` that serialises rules to a
  JSON file "to bridge multiple plugin containers/processes".
- **vanilla-extract** starts a second Vite server and a `ViteNodeRunner` and
  calls `runner.executeFile(path)`. There is no static analysis to defeat, which
  is why a `.css.ts` file may compute anything — and why it has to be a
  different kind of file from one that ships.

Resolving one named module for its literal constants is neither. It is a
pointwise, deterministic lookup, cached by path and mtime, and it happens only
for files something asked for.

**What it costs, measured on the gallery:**

|            | raw       | gzip      | brotli   |
| ---------- | --------- | --------- | -------- |
| JS, before | 425.10 KB | 113.99 KB | 91.30 KB |
| JS, after  | 443.67 KB | 114.15 KB | 90.97 KB |

The 18.6 KB of raw growth is the same class-name text inlined at 94 call sites,
which both compressors eat: gzip is 162 bytes worse and brotli 337 bytes better.
On the wire it is a wash, and it buys 94 runtime merges and, for a project whose
tokens live in a file, the difference between compiling and not compiling at
all. The CSS asset does not move.

**One hazard, and it is not obvious.** Folding an imported value INLINES it,
which can leave that module with no used export — and a bundler then drops the
module and the `import "….barq.css"` inside it. Measured on a four-file app: the
JS carried `a-outline-width_o01p2h` and the asset defined nothing. The consumer
carries the stylesheet of everything it folded a value out of, which is a
side-effect import and survives.

**Verified in a browser.** The gallery built with resolution against the same
gallery without it: 485 elements, 579 computed properties and the box, five
resting scenarios and 28 overlay frames. **Zero differences.**

Under `bun test` there is no integration, so those calls fall back to the
runtime, which computes the same class names. Nothing diverges; only the CSS
arrives through `<style id="barq-css">` rather than an asset, which is already
true of every block in dev.

What is still left, and correctly: an argument whose value is genuinely only
known at run time. `ui(shared.ring, props.class?.())` keeps a merge over strings,
because `props.class?.()` is a signal read. 230 of `@barqjs/ui`'s 324 calls are
that shape, and no compiler can do better than leave them.

## How this was checked

Two builds of the gallery served side by side, and for every `[data-slot]`
element on each page — 485 of them — the whole of `getComputedStyle` plus
`getBoundingClientRect`, keyed on the element's DOM path and diffed. Animations
are pinned to `currentTime = 0` and paused first, or the spinner and the skeleton
report differences that are only a frame.

Five resting scenarios (default, dark, a focus ring after six `Tab` presses,
`forcedColors: active`, and a 700px viewport) and 28 overlay frames: every
`[aria-expanded="false"]` trigger opened one at a time, addressed by DOM path
rather than by index, and each one sampled again 40 ms after `Escape` while
`data-closed` is still on it.

Every difference is in this file. Nothing else moved.

Two things about the method, since both cost time. Addressing a trigger by
`querySelectorAll(…)[0]` opens the same trigger fourteen times, because `Escape`
puts it back to `aria-expanded="false"`; address it by path. And a 485 by 579
dump per frame does not fit through the driver, so the sweep compares a hash per
element and fetches the properties only for what differs.

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
9. **A sub-layer per tier.** 289 computed values on the gallery. A cascade layer
   overrides specificity and a tier is a tie-breaker on top of it, so promoting
   one to the other decides pairs specificity had already decided correctly.
