# `@barqjs/ui` — where this is and what is left

The package surface is in `README.md`. This file carries what a README should
not: the framework changes this package caused, the traps that cost a debugging
session each, and what has not been run.

Green on the current tree: `bun test` passes in ui (379), aria (678), core (938),
router (519), primitives (246), start (192), server (122), testing (101),
css (92), ui-cli (59), lucide (17) and query (15), and `cargo test --workspace`
in `compiler-rs` (512 + 34 + 30). `bunx tsc --noEmit` is clean in ui, ui-cli and
lucide, all three build, `bun run verify` reports 3047 of 3047 declarations
present, and `oxlint --type-aware --deny-warnings` is clean over `packages/ui`
and `packages/aria`.

`cargo test` alone runs the root package only, so the twenty-four parity tests
in `crates/barq-css` never ran until the scripts asked for `--workspace`. They
are what pins the class names against `@barqjs/css`'s runtime.

Fifteen commits on `feat/ui-package`, and the tree is clean. `packages/ui`,
`packages/ui-cli` and `packages/lucide` were entirely untracked before them.

`bun run ci` at the root still FAILS, on 30 findings in `packages/router`,
`packages/server` and `packages/core`. Those are on HEAD's own content and
predate this work.

## The look is atoms now, not `css` blocks

Every `css` block became an `atomsIn("barq.ui", { … })` literal: one class per
DECLARATION rather than one per slot. The reason is duplication — 1,948
declarations across the forty-six components, 433 of them distinct — and the
second reason is that an application writing its own component with the same
declaration now lands on the same class, which is what Tailwind gives and a
block cannot.

Four things about it are load-bearing.

- **`atomsIn`, not `atoms`.** An atom is unlayered on purpose, so an
  application's own reset cannot beat it. A design system wants the opposite,
  and `@layer barq.ui` is the only thing that gives it without `!important`.
- **`ui(a, b)` merges where concatenating would not.** Two atoms for one
  property both apply and the stylesheet's order decides; merging by property
  means the later argument wins because it is later. `uiProps` composes a
  caller's class the same way. This is not cosmetic: it is what stopped a
  calendar day button falling back to `inline-flex` and a nav button growing its
  padding back. `variants` merges too now, so the `uiVariants` wrapper that
  used to supply it is gone and components call `variants` directly.
- **This package publishes SOURCE, not a build.** A compiled component is
  specific to one backend AND one `hydratable`: the same file emits
  `template()`/`spread` from `@barqjs/core` for the DOM and `html()`/`esc()`
  from `@barqjs/server` for a string render, and `hydratable` moves it again —
  three distinct outputs for a trivial component, measured. `hydratable` is a
  decision the APPLICATION makes, so no pre-built artefact can be right for
  every consumer, and the one that shipped was DOM-only: `node` resolved
  `@barqjs/ui` to `dist/index.js` and an SSR render got template cloning. There
  is no `tsdown` here now. `exports` carries a `barq` condition on the source,
  `@barqjs/compiler/vite` puts that condition first in every environment and
  compiles the package out of `node_modules`, and `@barqjs/server` is a peer
  dependency because half the compilations need it.
- **`strictCss` is on in all THREE places this package's sources are compiled**:
  `tsdown.config.ts` for the published dist, `gallery/vite.config.ts`, and
  `src/test-setup.ts` — because `bun test` runs the compiler too, over every
  `.tsx` and over this package's `.ts`. Miss one and the suite compiles under
  different rules from the build, so a call that fails one passes the other.
  Every CSS diagnostic is an error, so a call `@barqjs/css`'s runtime would have
  to evaluate fails rather than shipping the object walk to every consumer in
  silence. The package folds every object literal it writes and the flag is what
  keeps it that way.
- **The layer is bound once a module.** `const ui = layer("barq.ui")`, and
  `layer` is a wrapper the COMPILER reads: it takes the literal in the module
  that names it, so the call site is `ui({ … })` and the layer is still folded
  into every class name. A wrapper of one's own is not one it reads, and that
  cost this package a session: all 192 calls stayed on the runtime and the whole
  stylesheet travelled inside the JS bundle. A binding cannot cross a module
  boundary unless the integration resolves it, and `tsdown` hands the compiler
  one file at a time with no resolver — so every module declares its own. A
  binding that folded only under the Vite plugin would put the whole stylesheet
  inside the JS bundle for anyone building this another way.
- **A shorthand expands.** `borderWidth` is four longhands, so a test asserting
  on `border-width: 1px` has to name one of them, and a physical `padding: 0`
  does not cancel a logical `padding-block`.

`tools/atomize.ts` did the conversion from the blocks and is what a future
transcription should go through. `tools/verify.ts` reads the CALLS directly
now rather than the stylesheet, because a class is one declaration and
`bestMatch` had nothing left to match on; it folds in the declarations of every
`shared-*` group a call names, because a group IS that component declaring them.

## The shared treatments are six files, and both halves of that matter

The sheet was deduplicated and the source was not. `box-shadow:
var(--ui-inset-shadow), …` was spelled out 52 times across the forty-six
components and `text-sm` 43, so changing a shared treatment was 52 edits with
nothing to say whether the fifty-third had been missed. `src/lib/shared-*.ts`
names twenty-two of them, `createIn` folds each where it is declared, and 90
calls compose one instead of repeating it: 2,452 declarations in the components
down to 1,880, and 1,354 cross-file repeats down to 975.

Three rules decide what belongs in a group, and they are the whole design.

- **A group moves a WHOLE condition subtree or nothing.** `:focus-visible` sets
  `--ui-ring-color` and an `@supports` overrides it; those two are ordered by
  which was emitted last within the call, and split across modules they would be
  ordered by which module was imported first. The `color-mix` would stop
  applying and nothing would say so.
- **A group goes FIRST in the call.** Merging keeps the last per property, so a
  component that sets `border-width` after `box.border` still wins, which is
  what a shared treatment has to allow.
- **A file is a unit of shipping.** The compiler emits one stylesheet per
  MODULE and a bundler drops a module nothing imports. One file holding all
  twenty-two cost an application importing a single `Button` 3.19 KB of rules it
  never composed, which is more than the whole extraction saved a full
  application. Split by what travels together, that button pulls four files and
  0.46 KB of overhead is left.

There is one pair this arrangement could get wrong, and `src/shared.test.ts`
pins it. A group's rules are registered before any component's own, so a rule
under an AT-RULE could be beaten by a later base rule for the same property,
which specificity does not separate. Tier order settles it and the tier is now
GLOBAL: `collectCss` has always sorted by it, and a production build runs
`orderCss` over the concatenated asset so the bundle agrees. `box.forcedColors`
still sits in one file with `box.outline` and after it, which costs nothing and
says the intent locally.

A sub-layer per tier is NOT the fix, and it was tried. A cascade layer overrides
specificity where a tier only breaks a tie, so it moved 289 computed values on
the gallery — a parent's `[data-variant="destructive"] &` at 0-2-0 stopped
beating the child's own 0-1-0. `packages/css/ZERO-RUNTIME.md` has the numbers.

The namespaces are short on purpose and two of them had to move: `text` and
`box` collided with slot constants in three components, which `tsc` caught at
once, and `state` shadowed the object `@barqjs/aria` hands a component in nine,
which is why that one is `when`.

## What compression cost and what it bought

Measured over the package's own sheet, and worth knowing before optimising it
again:

|                                  | raw      | gzip     | brotli   |
| -------------------------------- | -------- | -------- | -------- |
| `css` blocks, where this started | 133.4 KB | 13.89 KB | 11.13 KB |
| atoms, first cut                 | 93.4 KB  | 18.85 KB | 16.20 KB |
| atoms, after the naming work     | 93.2 KB  | 16.17 KB | 13.42 KB |
| the same sheet, groups extracted | 87.5 KB  | 15.22 KB | 12.42 KB |

The last row is the same 1,079 rules in a different order, so extraction bought
nothing here and cost nothing: the sheet was already deduplicated.

The entropy is all in the hashes and none in the readable part: blanking every
hash takes brotli to 9.1 KB, while spelling the property as a two-character
code saves 0.36. That is why the suffix hashes the VALUE alone — 1,078 atoms
share 265 suffixes — and why shortening the property name is not worth doing.

Two levers were measured and rejected. A four-character condition hash saves
0.4 KB and risks a silent collision across 257 conditions; sorting rules within
a tier saves 0.3 KB and changes which of two same-tier atoms wins.

## Where to pick up

**What an application ships is already split per component**, and that was the
open question. The compiler emits one stylesheet per MODULE and a bundler drops
a module nothing imports, so one `Button` built through Vite carries 10.23 KB of
CSS against the package's 87.5 KB, and the gallery, which uses all forty-six,
carries 99.56 KB.

**Duplication across those stylesheets is not a lever, and that was measured
wrong here.** The gallery's 99.56 KB against the deduplicated 87.5 KB is not
12 KB of repeated rules: it is `barq.reset` (4.0 KB), `barq.base` (1.3 KB), 53
`@property` declarations, 5 `@keyframes` and the gallery's own six rules. Before
minification the 53 module stylesheets do hold 2,236 rules where 1,079 are
distinct, but `build.cssMinify` is lightningcss and the shipped asset holds
1,042 distinct of 1,053. There is nothing to write.

**The remaining source repetition is not treatments.** `display: "flex"` 72
times, `align-items: center` 59: single declarations shorter than any name for
them. The long `box-shadow` is down from 52 spellings to 14, and every one of
those is inside a condition a group cannot carry, because a group fixes its
condition.

Forty-eight components. What is left of the classic registry, in value order:

1. **DatePicker** — `Calendar` and `RangeCalendar` are built; the picker is
   the popover around them, and aria has the `datepicker` state for it.
2. **InputOTP** — one input per character, with paste and arrow handling.
3. **Sidebar** — big but mechanical: a context, a `Sheet` on narrow screens,
   and a lot of layout.
4. **NavigationMenu** — needs a viewport and an indicator aria has no shape for.
5. **Toast** / **Sonner** — needs a Toast in `@barqjs/aria` first.
6. **Carousel**, **Resizable**, **Drawer**, **Chart** — each wraps a third-party
   engine (embla, react-resizable-panels, vaul, recharts). These are not
   transcription. Decide whether to take the dependency or write the engine
   before starting one.

`Textarea` lives in `input.tsx`; `form.tsx` upstream is a react-hook-form
adapter and has no place here. `attachment`, `bubble`, `message`,
`message-scroller`, `marker` and `direction` belong to the NEW registry, not
this one.

## Two traps this session paid for twice

- **A backtick inside a `css` block ends the template.** A comment mentioning
  `w-[200px]` in backticks produced eight syntax errors twenty lines away. Notes
  about CSS go above the `const`, not inside the block.
- **Measure the box, do not just drive the component.** The combobox opened,
  filtered, chose and reported correctly, and its list was 1265px wide under a
  384px trigger. `width: 100%` on a PORTALLED element resolves against the
  portal container. Every overlay is checked against its trigger now, and
  `overlayPosition` publishes `--barq-trigger-width` for the ones that have to
  match.

## Nothing animated OUT, and it was two different bugs

The enter direction worked everywhere and the exit direction worked nowhere,
which made it look like one bug. It was two.

- **A disclosure panel was hidden before it could collapse.** `hidden` stops
  content being rendered AT ONCE, and `@barqjs/aria` set it the moment the
  state flipped — so the `grid-template-rows` transition ran and painted
  nothing. It waits for the duration the stylesheet declares now.
- **An overlay was removed in the frame it closed.** `presence` in
  `@barqjs/aria` keeps it, marked `data-closed`, for exactly as long as
  something is still drawing it. Focus goes back to the trigger when the
  subtree is finally disposed, which is what Radix and react-aria both do.

The duration is READ, never configured: `data-closed` is written straight onto
the element and the element is measured in the same tick, from the cascade AND
from `getAnimations({ subtree: true })`. Both, because neither is enough on its
own — a disclosure's transition is declared but has not started, and a menu's
animation is on the list INSIDE the popover that carries the attribute.

`is-closed` is the variant for it in `tools/css.ts`, so shadcn's
`data-[state=closed]:animate-out` transcribes the way every other state does.

**`AlertDialog` blocked Escape**, and a test said that was deliberate. shadcn's
own Radix demo closes on Escape, Radix prevents only the outside interaction,
and the APG asks for Escape on every dialog. The test asserts the new behaviour
and says why.

## The context menu was checked at four points in a real browser

`ContextMenu` is the first component here whose whole behaviour is geometry, so
the browser pass is the test. In Chrome at 1280x720, right-clicking the gallery's
region put the panel two pixels right of the pointer with its top edge on it,
every time; a second right-click 220px away moved it there rather than reopening
it where it was. Near the bottom of the viewport it slid up to sit 12px off the
edge and stayed anchored horizontally; in a 520px window a click 4px from the
region's right edge flipped it to `left` and it ended two pixels left of the
pointer with no horizontal overflow. Escape and an outside press both closed it,
`data-closed` was on the panel while the opacity ran 0.65 to 0.03, and focus went
back to the region.

Shift+F10 opens it under whatever has focus, on the first item. A region of
plain text has nothing to focus, so the demo needs a `tabIndex` before the
keyboard can reach it at all — which is what `<ContextMenuTrigger>`'s doc
comment now says.

Two things about the driver rather than the code: `keyboard.down("Shift")`
followed by `press("F10")` sends F10 with `shiftKey: false`, so the chord form
`press("Shift+F10")` is the one that works; and `document.body.click()` does not
dismiss an overlay, because the dismissal is on the pointer events.

## Fourteen registry items were missing dependencies, and nothing said so

`tools/registry.ts` finds a component's imports with a regex, and that regex
stopped at the end of a line — so every import long enough for `oxfmt` to wrap
it was invisible. `slider`, `tabs`, `toggle`, `accordion`, `radio-group` and
`collapsible` all shipped without `@barqjs/aria`; `menubar` and `context-menu`
without the `dropdown-menu` they are built on. `barq-ui add slider` therefore
wrote a file importing a package it had not installed.

`packages/ui-cli/src/build.ts` had the same regex, so a registry someone built
of their own had the same hole. Both now match the import CLAUSE — names,
braces, commas, `*`, whitespace — rather than "anything up to the newline".

`src/registry.test.ts` reads the registry back and finds the imports with a
rule too simple to share the bug: every `from "…"` in the file, wherever it is.
It fails on twelve items with the old regex in place.

## `bun run verify` is how you know it still matches shadcn

The live docs no longer render `new-york-v4`: `ui.shadcn.com/docs/components/*`
serves a NEWER registry built on semantic `cn-button-*` classes, so comparing a
screenshot against the site now compares against a different design system.
The reference for this package is the pinned checkout, and `tools/verify.ts`
compares against it exactly — every class list in `specs/` translated again,
every declaration looked for in the class the component ships. 2000
declarations, 0 missing. Re-syncing to the new upstream is a separate piece of
work and a large one.

## Three more the browser found, in the cascade rather than in a component

`packages/css/ZERO-RUNTIME.md` has the method and the numbers. Each of these
shipped in the stylesheet, on the element, and lost:

1. **The calendar stacked at 1280px.** shadcn's `md:flex-row` is
   `@media (width >= 48rem) { flex-direction: row }`, and a `flex-direction:
column` a later module emitted beat it. Same specificity, so order decided,
   and the order was import order. The breadcrumb's `sm:gap-2.5` and the dialog
   header's `sm:text-left` were the same bug.
2. **Three `@supports (color-mix(…))` colours never applied**, on `item`,
   `checkbox` and `input-group-control`. Same shape.
3. **`menubar.tsx`'s `"[data-expanded], &[data-open]"` painted every expanded
   element on the page.** Both implementations substituted `&` with one
   `replaceAll` over the whole condition, so the branch without one was left as
   a bare `[data-expanded]`. It was giving an open accordion `--accent` three
   sections away, and it survived only because it lost on order.

## Four more the browser found, and this is why you open it

`bun run gallery` again. Every one of these is a POSITION, which is the class of
bug a headless DOM cannot have an opinion about.

1. **An overlay was placed by the box it was PAINTED at.** Every overlay here
   enters with `zoom-in-95`, and `overlayPosition` measured through
   `getBoundingClientRect` — so a 288px popover measured 274 mid-animation, was
   centred on that, and finished 7px off its trigger, where it stayed. It
   measures `offsetWidth`/`offsetHeight` now, which no transform touches. A
   `ResizeObserver` on the trigger and the overlay covers content that grows
   later.
2. **The tooltip's arrow was never given an offset.** `overlayPosition` computes
   one only when it is handed an `arrowRef`, and nobody handed it one, so
   `arrowProps` was `{}` and the arrow fell to its static position: the end of
   the tooltip's own text. It sat in the far corner pointing at nothing.
3. **The slider's thumb was cut in half.** shadcn's track is `overflow-hidden`
   to clip its `<SliderRange>`. `@barqjs/aria`'s track renders the THUMBS as its
   children, so the same rule cut a 16px thumb down to the track's 6px. It also
   hung from the track's top rather than its centre line, because a sibling of
   the track is centred by the root's `align-items` and a child is not. The fill
   is a gradient now, which `border-radius` clips on its own, and `place` sets
   the cross axis.
4. **The accordion had no dividers.** `AccordionItem` wrote `data-slot` and a
   `border-b` class onto `<DisclosureGroupItem>`, which renders NO element —
   it is a provider, like every grouping component in `@barqjs/aria`. Both went
   nowhere, in silence. `AccordionItem` renders its own `<div>` around it now.

`DisclosureGroupItem` still declares `StyleProps` it cannot honour. Anything
built on a provider-shaped aria component has to bring its own element.

## `data-slot` was a component's last word, not its default

`uiProps` merged its own `data-slot` LAST and `<Button>` wrote one after the
props spread, so a caller could not rename either. `AlertDialogAction` and
`AlertDialogCancel` had been asking for their own names since they were written
and rendering as `data-slot="button"`. The default is first now, in `slot.ts`
and in `Button` and `Separator`, which is what lets `InputGroupInput` be
`input-group-control` and `ItemSeparator` be `item-separator`.

## Four bugs a browser found and no test could

`bun run gallery` is what found them. Each has a regression test where the bug
was, but three of the four are only _observable_ in a real browser — the tests
pin the rule rather than reproduce the symptom, and the note beside each says
so.

1. **`ownerDocument` answered for the wrong document.** barq builds every
   element by cloning a `<template>`, and a clone belongs to the INERT template
   document until it is inserted: no browsing context, `activeElement` null,
   `defaultView` null, a listener added to it never fires. So an overlay's focus
   scope recorded `null` as the element to give focus back to. `defaultView` is
   now the test, which is the one the platform itself uses.
2. **A focus scope never re-read itself.** `ScopeNodes.start`/`end` were plain
   fields, and `focusScope` creates its effects before the JSX holding the
   sentinels exists — so the first read found nothing and nothing invalidated
   it. An overlay built that way did not autofocus, did not contain Tab and did
   not close on Escape. They are setters that bump now.
3. **The scope outlived the overlay.** `<Modal>` and `<Popover>` called
   `focusScope` beside their `<Show>` rather than inside it, so closing removed
   the content and disposed nothing — and disposal is what restores focus.
   `ModalBody` and `PopoverBody` exist for that reason and no other.
4. **Cleanups run LIFO.** `focusScope`'s scope-tree teardown was registered
   after `restoreFocusOnDispose`, so it ran first and erased the record the
   restore reads. It is registered first now, which is what makes it run last.

None of these showed under happy-dom, where a template clone keeps the real
document and a removed element keeps focus.

## Three more, found by writing the package

5. **A trigger slot reached the element and not the control.**
   `provideTriggerSlot`'s props were merged onto `<Button>`'s ELEMENT, where
   `onPress` is not a DOM event — it became `addEventListener("press")` and
   never fired — and `aria-haspopup` lost to the button's own accessor for that
   key, which yields `undefined` and is still a value as far as `mergeProps` can
   tell. They go through the button's OPTIONS now.
6. **`styleProps` always occupied `style`.** A popover with no `style` prop of
   its own lost the `position: absolute` `overlayPosition` had just computed and
   rendered in the document flow. A key is only present when the caller gave it.
7. **A container literal at a component prop was frozen.**
   `<Comp style={{ width: size() }} />` compiled to `_$cell({ width: size() })`
   and never moved, while the identical expression on an intrinsic element was
   correctly a `bindEffect`. Fixed in `compiler-rs`'s shape pass
   (`a_container_literal_holding_a_reactive_read_is_rebuilt_not_frozen`).

## The configurator, and the compiler bug it found

`bun run gallery` picks a base, an accent, a radius and light or dark, applies
each through `installTheme`, and offers the result as CSS with a swatch per
colour. That is shadcn's own story over data that is shaped differently here:
seven BASES declare the whole token set and seventeen ACCENTS layer a handful
over one, where shadcn has a single flat list.

**`themeValues` is why the copy is honest.** `themeCss` is built from it, so the
values on screen and the text on the clipboard are one computation rather than
two that have to be kept agreeing. shadcn's customiser has the other shape:
`getThemeCodeOKLCH` spells the CSS a second time beside the page that is already
displaying it.

Checked in Chrome at 1280x720: switching base moved `--primary` and a real
button's background; the accent moved `--primary` alone; `Large` gave
`--radius: 0.875rem` and a button `border-radius: 12px`, which is the
`calc(var(--radius) - 2px)` it should be. The keyed replacement holds under
switching, and this is the number to check if it ever stops: one `:root`, one
`.dark`, one `@layer barq.theme` in `<style id="barq-css">` however many times
you switch, and the character count returns EXACTLY to its starting value on
returning to the starting theme. All 53 declarations shown in the dialog were
byte-identical to lines in what the Copy button put on the clipboard.

**A chosen radius used to be written twice.** Every base declares `radius` among
its tokens and both generators appended rather than overrode, so every themed
project carried two `--radius` declarations. The cascade took the second and the
page was right, which is why nothing caught it. It overrides the token now, so
it also keeps the token's PLACE in the list.

### The bug the copy button found

`<Comp><Icon />{label()}</Comp>` rendered `label()`'s first value and never moved
again. Two defects in `compiler-rs`'s shape pass, and the second is the one that
matters to anyone writing a component here:

1. **`builds_dom` stopped at a ternary.** So `{on() ? <A/> : <B/>}` looked like
   it built nothing and the array holding it was a Cell over a value built once.
   `compile.rs`'s `builds_dom_eagerly` had always seen through a conditional, a
   logical and a sequence, so the pass that DECIDES and the pass that CHECKS
   disagreed and only the deciding one was consulted.
2. **Nothing wrapped a moving child inside a children Block.** The array goes
   into a Block as soon as any child builds DOM, and `buildChild` runs a Block
   UNTRACKED on purpose, so the per-element thunk is the only thing that can
   keep a read alive there. One child that built DOM froze every other child
   beside it.

The shape now: a construction written directly stays bare, one reached through a
CHOICE is thunked, and a LONE choice becomes an array of one so `insert` sees a
live hole. Both halves are load-bearing and each broke the tree when I got it
wrong. Thunking a directly-written construction captures the scope at the call
site; wrapping one in a Block of its own shadows the `_s$` the array just
rebound, and `<ContextMenuTrigger>` stopped finding its `<ContextMenu>` — 68
aria tests and 58 here. `chooses_dom` is the distinction, and anything weaker
than it (`react != Static`, say) takes a plain `<Child />` back out of its Block,
because an ordinary component call is `Opaque` rather than `Static`.

`packages/aria/src/children.test.tsx` is the runtime half, in aria because that
is the lowest package whose suite goes through the compiler. Every one of those
cases rendered CORRECTLY on first paint; the failures were all in the second
assertion, which is why no existing test had it.

## Two tools that were quietly stale

- **`tools/exports.ts` still wrote the `dist` exports map.** `c840bf3` moved the
  package to publishing SOURCE under a `barq` condition by editing
  `package.json` directly, and running `bun run exports` put the old map back:
  `types` and `import` pointing at a build that no longer exists. The generator
  writes the source map now, and `package.json` is byte-identical to the
  hand-written one, which is the check that it agrees.
- **The gallery was never typechecked.** `tsconfig.json` included `src`, `tools`
  and `types` and not `gallery`, so 900 lines of the package's only browser
  surface answered to nothing. It is in now, with a `paths` entry for the
  `@barqjs/ui` self-import that Vite aliases and `tsc` cannot. Twenty of the
  errors that surfaced were kebab-case style keys, which were a bug in
  `@barqjs/core`'s `CSSProperties` rather than in the gallery, and one was
  `Section` declaring plain props where barq hands a component Cells.

## DatePicker and InputOTP, and what each cost

**shadcn ships no `date-picker.tsx`.** It is a documented composition of three
components upstream does ship, so this is that composition rather than a
transcription, and the three an application already overrides are the three it
is made of. The trigger reads its date through `Intl.DateTimeFormat` rather than
`date-fns` for one `format(date, "PPP")` call, which is also what
`@barqjs/aria` formats every date segment with. `@barqjs/aria`'s own
`<DatePicker>` stays where it is: it puts a `<DateField>` with typed segments in
the trigger, which is the better component for a form and is not this look.

**`InputOTP` is one invisible input over the row, not one per box.** That is
`input-otp`'s arrangement and the arrangement IS the component: an input per
character takes one character of a six-character paste, gets
`autocomplete="one-time-code"` filled into one field, and hands a screen reader
six unlabelled boxes where there is one field. The engine is written here
because `input-otp` is React to its foundations, a hook and a context with no
part that survives leaving them.

### Two traps, one of them a full debugging session each

- **A `provide` callback that BUILDS closes over the wrong scope.** Every
  working provider here returns `props.children` and builds nothing:
  `provide(owner, Ctx, () => value, () => props.children)`. Write the elements
  inside that callback instead and the compiler makes it a Block over the
  scope at the CALL site, so the children go up beside the context rather than
  under it. `InputOTP` rendered its container, its input and an EMPTY row, with
  no error anywhere. The fix is a `Provider` component of its own around the
  children, which is what `AccordionItem` and `DropdownMenuTrigger` already do.

- **A positioned row swallows the click meant for the control behind it.** Every
  `input-otp-slot` is `position: relative` for the caret it may hold, so the row
  is POSITIONED and paints above the absolutely positioned input however the two
  are ordered. Clicking a box left `document.activeElement` at `BODY` and the
  component unusable with a mouse, while all sixteen of its tests passed. The
  row is `aria-hidden` decoration and declines the pointer now. Playwright is
  what says it is fixed, by REFUSING to click a slot: an element that takes no
  pointer events fails its actionability check, so the test drives
  `page.mouse.click(x, y)` at the box's centre the way a person does.

## The styles apply, and `data-slot` is why

shadcn's eight styles were already transcribed into `styles/*.css` and selected
NOTHING: they were written as `.cn-button`, and no component here carries that
class. This package has put a `data-slot` on every element since before styles
existed, and upstream's `.cn-button` sits on exactly the element carrying
`data-slot="button"`. `tools/styles.ts` writes the second where upstream writes
the first, and the whole of a style applies with no component change at all.

They land in `@layer barq.style`, declared after `barq.ui`. A style is a second
opinion about how every component looks and has to win:
`[data-slot="button"]` inside `.style-nova` is 0-2-0 against an atom's 0-1-0 and
would usually beat it, but an atom under a condition is 0-2-0 too and the tie
would fall to import order.

**305 of upstream's 421 classes reach an element**, and the generator NAMES the
rest rather than dropping them, because a style quietly missing a third of its
rules looks like a style that does not work.

Four things were keeping rules off the page, and none was a missing component. A
slot written as an object entry rather than a JSX attribute was invisible to the
scan. `-logical` is upstream's logical-property twin of a slot, the way `-aria`
is its other component base. An axis whose value is appended with no axis word
between it, like `separator-horizontal`, matched nothing. And some slots are
named differently between the classic registry this package transcribes and the
new one the styles are written against, which is what `ALIASES` records.

**A style is opt-in and costs one file.** No style is this package's own look.
`barq-ui init --style lyra` copies that 180 KB in, and the gallery fetches
exactly one sheet through `import.meta.glob`.

## Three more the compiler owed, all one defect

Every one of these is the same mistake in a different position: a value that has
to stay a CHOICE was handed over as the result of making it.

1. **A moving child beside one that builds.** `<Comp><Icon />{label()}</Comp>`
   rendered `label()`'s first value forever, because the array goes into a Block
   as soon as any child builds DOM and `buildChild` runs a Block untracked.
2. **`builds_dom` stopped at a ternary**, so the array holding
   `{on() ? <A/> : <B/>}` was a Cell over a value built once.
3. **A choice of COMPONENTS at a hole.** `{on() ? <A /> : <B />}` on an
   intrinsic element rendered one and never swapped. A JSX element classifies as
   `Opaque` with no thunk; an intrinsic lowers to a `_tmpl$()` CALL, which
   already carries `Thunk::Arrow`, so the intrinsic form worked BY ACCIDENT and
   the component form did not. The gallery's own preview switcher is what found
   it.

The shape that works, and each half cost a full suite when wrong: a construction
written DIRECTLY stays bare, one reached through a CHOICE is thunked, and a lone
choice becomes an array of one so `insert` sees a live hole. Thunking a
directly-written construction captures the scope at the call site; Blocking one
shadows the `_s$` the array just rebound.

**A conditional at a component's ROOT return is still spent once.**
`return <>{open() ? <div/> : null}</>` is emitted as `[open() ? … : null]` and
evaluated at return time. `<Show>` is the primitive for a reactive conditional
and is what to reach for; `sidebar.tsx` has the bare shape and gets away with it
only because `collapsible` never changes at run time.

## Things that will bite

- **The compiler PROVES reactivity; it does not guess.** A prop whose value
  comes from an opaque method call is bound once. `style={at(group, index)}` is
  reactive because a CALL is not something the compiler will evaluate at the
  call site; `style={{ "--x": group.state.getThumbPercent(i) }}` is not, and the
  slider thumb sat at `left: 0` because of it. When a prop has to move, make the
  whole value a call.
- **A component built by a factory is not a component.** `overlayFamily()`
  returns `Root` and `Trigger`; the compiler gives them a scope parameter but
  does not brand them with `block()`, because their bodies never name it. They
  work as tags — `<family.Root>` and a destructured `<Root>` both — but the
  trigger slot only reaches the control when the `provide` that installs it runs
  in a scope of its own.
- **`oxfmt` formats the CSS inside a `css` block.** It quotes attribute-selector
  values, so `[data-slot=x]` becomes `[data-slot="x"]` and the block's content
  hash changes with it. A test asserting on rule text has to assert on the
  FORMATTED text; run `oxfmt` before believing a failure.
- **The `styleProps`/`filterDOMProps` pair decides what reaches an element.** A
  component's prop that is not in `GLOBAL_ATTRS`, not `data-*`, not labelable
  and not in `propNames` is dropped in silence. `controlProps` in `lib/slot.ts`
  is the widened set for form controls, and it exists because `placeholder` and
  `onInput` were being dropped.

## What has not been done

- **Components.** `Toast`, `Carousel`, `Resizable` and `Drawer`. `Toast` needs new work in `@barqjs/aria`;
  the rest are transcription plus composition. `Carousel`, `Resizable`,
  `Drawer` and `Chart` each wrap a third-party engine upstream, and every one of
  those engines is React, so the decision `InputOTP` already faced is the
  decision each of them faces: write it, or leave it out.
- **The new upstream.** `ui.shadcn.com` has moved to a registry whose look is
  in a stylesheet rather than in class lists, which `tools/css.ts` cannot
  transcribe. Nothing here targets it.
- **`DisclosureGroupItem` and `Disclosure` declare `StyleProps` they cannot
  honour.** They render no element, so a `class` handed to them vanishes. That
  is what cost the accordion its dividers; the next consumer hits it too.
- **The gallery is the only browser check.** It is opened by hand every time,
  and every visual bug in this file was found that way.
- **The theme configurator is the gallery's, not the package's.** A consumer
  building one of their own has `themeValues` and `themeCss` and writes the
  controls; nothing here ships a `<ThemeConfigurator>`.
- **Server rendering.** Nothing here has been rendered through
  `@barqjs/server`. The CSS arrives through `collectCss`, which `@barqjs/start`
  already inlines, but no test covers a component's markup crossing the wire.
- **`@barqjs/lucide`'s dist is 15 MB** across 3,586 files. That is what a file
  per icon costs and what `lucide-react` also costs; nobody has measured what it
  does to an `npm install`.
- **The gallery is not in CI.** It builds (`bunx vite build --config
gallery/vite.config.ts`) and nothing runs it.
