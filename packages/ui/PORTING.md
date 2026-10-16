# Porting a component from shadcn/ui

The procedure, in order, with what to check at each step. Everything here has
been done at least once; where a step exists because something went wrong, the
failure is named so you can recognise it.

`README.md` says what this package IS. This says how to change it.

## Before anything: the reference is a pinned checkout

```bash
git clone --depth 1 https://github.com/shadcn-ui/ui ~/src/shadcn-ui
```

`ui.shadcn.com` serves a newer registry whose look lives in a stylesheet rather
than in class lists, and `tools/css.ts` cannot transcribe that. The checkout at
`apps/v4/registry/new-york-v4/ui` is the reference for every component, and
`apps/v4/registry/styles/style-*.css` is the reference for the eight styles.
Read the component's own source there. Do not read the website.

Two directories, and they disagree on purpose:

- `registry/new-york-v4/ui/*.tsx` — the components. Their `data-slot` names and
  their `className` strings are what this package matches.
- `registry/styles/style-*.css` — the eight styles, written against a NEWER
  registry. Their `cn-*` names are often not the component's `data-slot`, which
  is what `ALIASES` in `tools/styles.ts` is for.

## 1. Decide what you are building

Read upstream's component top to bottom first. Three questions decide the shape.

**Does it wrap a third-party engine?** `carousel` wraps `embla-carousel-react`,
`drawer` wraps `vaul`, `resizable` wraps `react-resizable-panels`. Each wrapper
is React; the question is whether the ENGINE underneath is. Embla's core is
framework-agnostic, so `Carousel` takes the dependency. Vaul is React hooks over
Radix, so `Drawer`'s drag is written in `@barqjs/aria`, and
`react-resizable-panels` is React throughout, so the splitter is
`@barqjs/aria/splitter`. **Say which in the commit message, before starting
one.**

**Does the behaviour belong in `@barqjs/aria`?** Anything with state, timing or
a keyboard model does: `toastQueue`, `navigationMenuState`, `drawerDrag`,
`messageScroller` all live there with their own tests. What stays here is the
shape and the look. The rule is whether a second design system would want it.

**Is it presentation only?** `Marker`, `Bubble`, `Message`, `Attachment` are,
and those are an afternoon each: a spec, a transcription, a component, tests.

## 2. Write the spec

`specs/*.json` is `{ "slot": "the class list" }`, copied out of upstream's
component. It is the provenance for every rule this package ships, and
`tools/verify.ts` reads it forever after.

```bash
# The class lists, extracted from upstream's source:
cd ~/src/shadcn-ui/apps/v4/registry/new-york-v4/ui
grep -n 'data-slot="drawer' -A 6 drawer.tsx
```

Split a `cva` into one entry per variant, named `<slot>-<axis>-<value>`:

```json
{
  "attachment": "relative flex w-fit …",
  "attachment-size-sm": "gap-2.5 text-xs",
  "attachment-orientation-vertical": "w-24 flex-col"
}
```

`tools/styles.ts` splits on the same axes (`variant`, `size`, `orientation`,
`side`, `align`), so a name in that shape resolves to
`[data-slot="attachment"][data-size="sm"]` without further work.

**Drop what cannot be transcribed.** A `group/x` marker class is not a utility
and `transcribe` will say `NOT A UTILITY`. Leave it out of the spec and put the
literal string in the component's class list — see step 4.

## 3. Transcribe

```bash
bun run tools/transcribe.ts --spec specs/drawer.json
```

Real Tailwind v4, shadcn's theme, one CSS block per slot. Anything Tailwind
produced nothing for is reported rather than dropped, because a typo in a class
list is otherwise invisible: the CSS is simply missing.

`tools/atomize.ts` turns a block into the `atoms` object literal the components
actually use, if you want it; by hand is fine for a small one. What ships is one
class per DECLARATION, which is what lets forty components share a 2px radius.

## 4. Write the component

Read two or three neighbours in `src/ui/` first. The conventions are not
decorative and most of them exist because something broke.

- **`data-slot` on every element.** It is the styling hook, it is what the eight
  styles select on, and it is what `tools/styles.ts` matches. Use upstream's
  name, not a better one.
- **`uiProps(slot, className, props)`** builds the props. It filters: a design
  system prop like `variant` must not become an attribute. `controlProps` is the
  widened set for `<input>`, `<textarea>` and `<select>` — without it
  `placeholder` and `onInput` are dropped in silence.
- **`layer("barq.ui")` once a module.** Bound, not named at every call: the
  compiler reads the layer as a literal in the module that names it.
- **State is an ATTRIBUTE.** `data-state`, `data-size`, `data-align`. One write
  changes the look of every part, and the parts read it with a descendant
  selector instead of taking four props through a context.
- **`variants()` for a `cva`.** The base and each axis, with `defaults`.
- **A marker class stays a literal.** `ui(root, "group/attachment")` — upstream's
  styles compile to `.group\/attachment:has(…) .cn-x`, so the group part has to
  be the class it expects.
- **A trigger part renders no element.** shadcn's `asChild` clones a child and
  there is nothing to clone here, so every `*Trigger` returns `TriggerPart` from
  `lib/trigger.tsx` and reaches its control one of two ways. A control from this
  package written inside it takes the props itself, through the trigger slot.
  Anything else is handed them: `render={(trigger) => <button {...trigger.props}
  ref={trigger.ref} />}` for a plain element, `useTrigger()` inside a component
  of your own. A `*Close` part IS a `Button`, and an item given `href` renders
  the `<a>` itself.
- **Upstream's state attributes sit beside barq's.** `data-state`, `data-side`,
  `data-align`, `data-disabled` and `data-highlighted` are written wherever
  upstream has them, so a selector copied from shadcn matches, and `data-open`,
  `data-closed`, `data-selected`, `data-focused` and `data-placement` stay.
  Inside a popover `popoverStateProps()` from `@barqjs/aria/dialog` gives the
  three positional ones to the element the design system names, because the
  popover's own element is the positioner.
- **`side`/`align`/`sideOffset`/`alignOffset` and `placement`/`offset` are the
  same position.** `placementFor(side, align)` in `@barqjs/aria/overlays` turns
  one into the other; a part accepts both and `placement` wins.
- **Logical properties, not left and right.** `paddingInlineStart`,
  `insetInlineEnd`, `marginInlineStart: "auto"`, `borderEndEndRadius`. Upstream's
  class lists are physical (`pl-7`, `right-2`), so a spec entry is written with
  the logical utility the component ships (`ps-7`, `end-2`) and `verify` checks
  that. A physical side stays physical only where the side IS physical: a
  sheet on the left, an arrow under a tooltip.
- **What the caller writes reaches the element.** `uiProps` hands on `class`,
  `style`, `id`, `data-*`, the labelling `aria-*` and the `ref`. An element
  with a `ref` of its own merges the caller's in (`mergeRefs(own,
  props.ref?.())`), because a `ref` written after the spread replaces the one
  in it. A part drawn by another component spreads `handedOn(props)` onto it,
  and `named(props)` onto the element that has the role.
  `src/forwarding.test.tsx` holds a row per part.
- **A collection part works written or from data.** `<Select items={…}>` is
  built by `@barqjs/aria` from the values; `<Select>` with `<SelectItem>`
  children registers each item as it renders, through
  `@barqjs/aria/static-collection`. The same component serves both, decided by
  whether `items` was given, and the same holds for `Combobox`, `Command` and
  the three menus. Written, an item says what it is (`value`, `disabled`,
  `textValue`, `onSelect`); a label or a separator is not an item and may sit
  anywhere between them.

Five traps, each of which cost a session:

- **A provider goes OUTSIDE its element.** A provider handed `{props.children}`
  and a `<Show>` builds the `<Show>` first, and hydration then claims the wrong
  node.

- **A `provide` callback that BUILDS its children needs a component of its own.**
  Inlined, the callback runs where its SIBLINGS read and the context is missing.
  Every provider here is `function XProvider(props)` for that reason.
- **The compiler PROVES reactivity; it does not guess.** A prop whose value comes
  from an opaque method call is bound once. `style={at(group, i)}` moves;
  `style={{ "--x": group.getThumbPercent(i) }}` does not. When a value has to
  move, make the whole thing a call.
- **A children callback arrives in one of two shapes.** One that builds no JSX —
  `{(entry) => entry.name}` — is a Cell, and calling it yields the callback. One
  that builds an element is a BLOCK, which takes its scope as the first argument
  and throws "a Block was invoked without a scope" if you call it. `isBlock`
  tells them apart; `combobox.tsx` does it.
- **`oxfmt` formats the CSS inside a `css` block**, quoting attribute-selector
  values, which changes the block's content hash. A test asserting on rule text
  asserts on the FORMATTED text. Run `oxfmt` before believing a failure.

## 5. Test it

One `.test.tsx` beside the component. Assert what the component DECIDES, not
what it renders: the slot names a style depends on, the attribute a rule selects
on, the ARIA a screen reader reads, and the behaviour a person would notice.

happy-dom measures nothing, so anything geometric has to be declared:

```tsx
element.getBoundingClientRect = () => ({ height: 400, width: 400 }) as DOMRect;
```

and anything it cannot do at all — focus lifetime, hit testing, a native
scrollbar — belongs in step 8 instead.

## 6. Regenerate

```bash
bun run exports     # src/index.ts, src/entries.ts, package.json's exports map
bun run registry    # registry/, which is what `barq-ui add` writes
bun run styles ~/src/shadcn-ui   # styles/*.css, the eight
```

Never edit a generated file. `tools/exports.ts` was stale once and rewrote
`package.json` to point at a `dist` that does not exist; the fix is always the
generator.

`bun run styles` prints three lists and only the first is work:

```
7 classes reach nothing, and upstream renders the element:   ← fix these
24 name elements the pinned registry does not render either  ← not ours
scroll-area-scrollbar is deliberate: …                       ← a decision
```

A class in the first list means a style ships a rule your component cannot
receive. Either the element is missing, or it is named differently — add an
entry to `ALIASES`. The alias is consulted BEFORE the direct match, because the
interesting aliases rename a slot this package also emits: `cn-radio-group`
styles the row inside the group here, and matching the wrapper first sent those
rules to an element with one child.

## 7. Verify

```bash
bun run verify          # every spec, or `bun run verify drawer` for one
```

Every class list in `specs/` is translated again and each declaration looked for
in the `ui(…)` call the component actually ships. A rule never pasted, one lost
to an edit and one whose value drifted all look the same from outside — part of
the look is missing — and no test asserting on the rules it knows about will say
so.

The bar is **0 not in the stylesheet**. A deliberate divergence goes in
`ALLOWED` in `tools/verify.ts` with its reason, and that list is the whole
record of where this package does not match upstream.

## 8. Open a browser

**This is the method, not a suggestion.** Every visual bug in this package was
found this way and none by a test.

The browser surface is the docs site, `packages/site`. Give the component a
page: its examples go in `packages/site/src/docs/examples/<name>/`, one file per
example and an `index.ts` listing them, and the site's own suite renders every
one.

```bash
bun run --cwd ../site dev      # then open /docs/components/<name>
```

Then drive it. Not "look at it": measure it.

- `page.mouse.click` for anything that reads pointer events. `.click()` fires no
  pointer events at all, and `user.click` is not a real pointer either. A
  navigation menu that opened on hover and closed on press only failed under a
  real click.
- `getComputedStyle` and `getBoundingClientRect` for anything positional. A
  component can pass every interaction test and be full width.
- `document.activeElement` for anything about focus. happy-dom leaves it on a
  removed element, so a focus test can pass for the wrong reason.

The geometry harness compares against upstream directly. It was written for
the standalone gallery this package used to carry, and `tools/geometry.ts`
still reads that gallery's build output (`gallery/dist/assets`), which no longer
exists; pointing it at the site's build is not done yet. When it ran:

```bash
bun run tools/geometry.ts
# in the page:
#   eval(await (await fetch("/geometry/compare.js")).text());
#   await globalThis.__geometry;
```

It appends a probe carrying upstream's own utility classes beside each element
this package rendered and reports every computed property that differs. It found
`cn-radio-group` landing on the wrapper rather than the row, which `verify` and
`styles` both called a success. Read its doc block for what it does NOT prove.

## 9. Server rendering and hydration

Two suites, and they are different claims.

- `src/ssr.test.ts` — the component renders to markup through the string
  backend. It bundles a fixture rather than importing one, because the suite's
  loader compiles `.tsx` for the DOM and importing a component would measure the
  DOM backend under a server renderer.
- `src/ui/hydrate.test.tsx` — the client CLAIMS that markup. Both halves are
  built from one fixture with `hydratable: true`, which is off by default, and
  `reuse` is asserted at 1 — by REFERENCE, not by markup, because a tree that
  looks right and holds rebuilt nodes is the failure this is for.

A component with a `<Show>` beside a sibling is the shape that broke: the server
wrote a badge and the hydrated page did not have one, silently. Add anything new
to both suites.

## 10. The gate

From `packages/ui`:

```bash
bun test
bun run typecheck
bun run --cwd ../site build        # what CI builds
bun run --cwd ../aria test         # if you touched aria
```

From the repository root, because `oxlint` and `oxfmt` refuse a path holding
`..`:

```bash
bunx oxlint --type-aware --deny-warnings packages/ui packages/aria
bunx oxfmt packages/ui/src packages/ui/tools packages/aria/src
```

CI runs `bun run ci` at the root, which is lint plus format check, and a
separate step builds the docs site. That build is the part the suite cannot
do: `bun test` compiles each module on its own, and what breaks in a site is
the GRAPH — an export condition a package never declared, a module the bundler
cannot resolve.

## Adding behaviour to `@barqjs/aria`

Four engines were added this way and the shape is the same each time.

1. `src/<name>.ts` with a doc block that states the DECISIONS, not the
   mechanism. "The threshold is a fraction of the drawer, not a distance"
   is worth a paragraph; "sets a signal" is worth none.
2. `src/<name>.test.ts` beside it. Pure state is easy to test exhaustively;
   do that here so the UI test does not have to.
3. `src/index.ts` and `package.json`'s `exports` map, both by hand.
4. `bun run --cwd packages/aria test` before touching the UI half.

An element that `@barqjs/aria` owns and a design system needs to name takes a
slot PROP: `underlaySlot` on `<Modal>`, `listSlot` on `<Select>`,
`indicatorSlot` on the dropdown's checkbox item. Without one, the only way to
reach it is a global rule that every instance on the page would share.

Two rules for anything that opens:

- **Read an overlay's open state through `followOpen`**, never in a tracked
  effect's own first run. An overlay opened from `onSettled` (a welcome
  popover, a dialog restored from the URL) is written in the same pass that
  first run falls in, and the effect then holds the value from before the write
  and is never woken. `followOpen(read, apply)` in `@barqjs/aria/overlays` puts
  the read in the compute half, which the graph keeps consistent.
- **Opening on the server does nothing.** The overlay stack, the outside-press
  listeners, the scroll lock and the positioner are all skipped under
  `isServer`, so a component may open an overlay from `onSettled` without a
  guard of its own. `ssr.test.ts` renders an open popover and an open dialog in
  a process with no DOM to keep it that way.

## What is deliberately not the same as upstream

Recorded so nobody re-opens them:

- **The scroll area is the native scroller by default**, with `scrollbar-color`
  on it. Rendering a `<ScrollBar>` inside switches that area to Radix's
  arrangement: the viewport scrolls, the native bars are hidden, and the drawn
  bar is `@barqjs/aria/scroller`'s `scrollbar()`. Upstream adds a vertical
  `<ScrollBar>` for you; here it is written out, because an area without one
  keeps the native scroller.
- **The select has scroll arrows when it is written as parts.** `SelectContent`
  hides the viewport's scrollbar and shows `SelectScrollUpButton` and
  `SelectScrollDownButton` while it can scroll; a `Select` given `items` keeps
  the native scroller. `role="listbox"` is on the viewport rather than the
  content, so the arrows are outside the listbox.
- **`Select` is both.** With `items` it is one component built by
  `@barqjs/aria`; without, it is shadcn's parts, whose options register from a
  copy built off the document while the list is closed, which is how the
  trigger shows the chosen item's text before the list has ever opened.
  `position="item-aligned"` falls back to popper placement where the list would
  leave the viewport; Radix shrinks and scrolls it instead.
- **`Combobox` is both.** Given parts as children it is the root of upstream's
  composable API (`ComboboxInput`, `ComboboxContent`, `ComboboxList`,
  `ComboboxItem`, chips); given `items` and a callback it is still the
  one-component picker. Trigger, clear and chip-remove parts ARE buttons rather
  than taking `render`. Written items are filtered for you, where Base UI leaves
  that to the caller, and a written item's label is its rendered text, so a
  `defaultValue` reads as its raw value until the list first opens unless
  `itemToStringLabel` or object items say otherwise.
- **`Command` takes its parts as children when given no `items`**; the `items`
  form stays. It ranks with CSS `order` rather than re-appending nodes as cmdk
  does, because the renderer tracks its own nodes; it keeps a non-matching item
  mounted and `hidden`, because an item's value defaults to its text; and it
  restores the written order when the search is cleared. cmdk's source is not in
  the pinned checkout, so the scorer is written to its documented behaviour.
- **Menus take their items as data or as written children.** Space on a written
  checkbox or radio item toggles and leaves the menu open, as the ARIA pattern
  has it; a press or Enter closes, as Radix does. An item with `href` is a real
  anchor inside a presentational `<li>`, followed through the router. `loop` is
  on by default.
- **`*Overlay` is a request, not an element.** The modal draws the underlay, so
  `<DialogOverlay class="…" />` renders nothing and what it is given lands on
  the underlay. The same holds for the alert dialog and the sheet.
- **`TooltipProvider` is optional.** Inside one, a tooltip opens after the
  provider's `delayDuration` (0 by default, as upstream) and at once within
  `skipDelayDuration` of the last one closing; outside one it waits 1500ms. A
  close delay stands in for Radix's pointer grace area, and no part takes
  `forceMount`.
- **The navigation menu's ArrowDown opens a closed trigger and goes into its
  panel**, where Radix moves along the bar. A press closes only what a press
  opened, the close delay is 300ms rather than 150, and Tab order is corrected
  in a key handler rather than with a hidden focus proxy. `NavigationMenu.Sub`
  is not here, because shadcn does not export it.
- **Overlay roots take `isOpen`, not `open`**, like every other component built
  on `@barqjs/aria`. The menus, `Select`, `Combobox` and `CommandDialog` also
  accept upstream's `open`.
- **`DatePicker` is a composition**, because upstream ships no `date-picker.tsx`
  and documents a `<Popover>` around a `<Calendar>`. `DateRangePicker`,
  `DatePickerInput` and `presets` are upstream's documented variants.
- **`Calendar` takes `CalendarDate`s and `{ start, end }`**, not `Date`s and
  `{ from, to }`. A range is anchored: the first press starts one and the second
  finishes it, so a press inside a finished range starts again.
  `buttonVariant` is the arrows', as upstream's is, and `dayButtonVariant` is
  the days'. Dropdown captions are native selects. `date.ts` models the
  Gregorian calendar only, so there is no non-Gregorian month grid.
- **`Form` is `Field`.** No react-hook-form, so no `<Form>`.
- **Nothing is cloned, so `asChild` is not a general prop.** `Button`, `Badge`
  and `Item` take `href`; a part that has to be another component's trigger
  takes the trigger slot, which is how `SidebarMenuButton`, `SidebarMenuAction`
  and `SidebarGroupLabel` open a menu. `CollapsibleTrigger` is the one part
  that renders a button of its own by default, so it is the one that takes
  `asChild` (the control inside takes the slot) and `render`. `Collapsible`,
  `BreadcrumbLink` and `BubbleContent` take `render` for upstream's `asChild`:
  the caller builds the element from the props and the ref it is handed.
- **`Tabs` and `Accordion` take `items` or written-out parts**, and `items`
  decides. Written-out tabs always have a selection: with no `value` the first
  enabled tab is selected, where Radix selects none.
- **`Toaster` from `sonner` draws only the newest `visibleToasts`**; older ones
  stay queued and return when there is room. Its close button is on by default
  and its `left` and `right` positions are inline start and end. `sonner` and
  `toast` both export `toast` and `Toaster`: the barrel carries sonner's, and
  the other pair is `@barqjs/ui/toast`.
- **`DrawerContent` owns its portal and overlay.** `DrawerPortal` and
  `DrawerOverlay` are for a surface that is not `DrawerContent`. A snap point
  is clamped to the drawer's own size.
- **`InputOTP`'s `pattern` has two meanings.** A string is upstream's
  whole-value test; a RegExp is the characters to remove. With neither and a
  numeric keyboard, anything that is not a digit is dropped.
- **A `ResizablePanel` size is a percentage**, `minSize` defaults to 10 and an
  arrow key moves 1. Enter on the handle collapses a collapsible panel and
  restores the size it had.
- **A `ToggleGroup` item is an `aria-pressed` button in both modes**, where
  Radix makes a single group's items radios. Inside a `Toolbar` the group gives
  up its own roving focus.
- **The slider has no `slider-range` element**: the fill is drawn by the track.
  Its CSS stays physical with mirrored numbers, to match the pointer maths in
  `@barqjs/aria`. `Separator`'s `decorative` defaults to false.
- **Horizontal arrow keys follow the writing direction** in the carousel and
  the questionnaire, where upstream's do not flip.
- **Typography is not a component.** Upstream ships none; its page is examples.
- **`scroll-fade` and `shimmer` are classes plus a style helper**
  (`scrollFadeStyle()`, `shimmerStyle()`), not parametric utilities.
- **`DirectionProvider` renders no element.** It declares the direction every
  widget reads through `useLocale()`; putting `dir` on an element is the
  caller's.

## What is still open

- The specs are this package's transcription INPUTS, and several were written
  against an older shadcn: `tabs-list` without `bg-muted`, `native-select` with
  `px-3` where upstream now has `pr-8`. `verify` cannot see it, since it asks
  only that every spec declaration exists here and never the reverse. Reading
  the class lists straight out of the pinned components is the fix.
- `@barqjs/lucide`'s dist is 15 MB across 3,586 files. Nobody has measured what
  that does to an `npm install`.
- `Disclosure` and `DisclosureGroupItem` in `@barqjs/aria` render no element.
  A `class` handed to them used to vanish, which cost the accordion its
  dividers; they no longer declare `StyleProps`.
- The overlays, menus, select, combobox, command and navigation menu ported in
  parts were driven through `@barqjs/testing` only. Nothing in step 8 was done
  for them: exit animations, the navigation viewport's size, the indicator's
  position, item-aligned select placement and where focus lands while a closing
  menu is still animating are all unmeasured in a browser.
- The libraries shadcn wraps are read from their published sources, unpacked
  one directory each beside the shadcn checkout. `InputOTP` writes no `<noscript>`
  fallback, which a component that needs script to type into has no use for.
  The drawer's `autoFocus` defaults to true where vaul's is false. The Base UI
  toast announces a high priority toast through `aria-live="assertive"` on the
  toast, where upstream hides the toast and writes a `role="alert"` copy: hidden,
  a toast with buttons in it is focusable content a screen reader cannot see.
- `ScrollBar`'s layout, the drawer's snap points and background scale, the
  splitter's drag and the multi-month calendar were driven through
  `@barqjs/testing` only. Nothing in step 8 was done for them.
