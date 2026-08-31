# Porting a component from shadcn/ui

The procedure, in order, with what to check at each step. Everything here has
been done at least once; where a step exists because something went wrong, the
failure is named so you can recognise it.

`README.md` says what this package IS. This says how to change it.

## Before anything: the reference is a pinned checkout

```bash
git clone --depth 1 https://github.com/shadcn-ui/ui ~/Workspace/vendor/ui
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
Radix, so `Drawer`'s drag is written in `@barqjs/aria`. **Say which in the commit
message, before starting one.**

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
cd ~/Workspace/vendor/ui/apps/v4/registry/new-york-v4/ui
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

Four traps, each of which cost a session:

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
bun run styles ~/Workspace/vendor/ui   # styles/*.css, the eight
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

```bash
bun run gallery      # add the component to gallery/src/main.tsx first
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

The geometry harness compares against upstream directly:

```bash
bun run gallery:build && bun run tools/geometry.ts
bun run gallery
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
bun run gallery:build              # what CI builds
bun run --cwd ../aria test         # if you touched aria
```

From the repository root, because `oxlint` and `oxfmt` refuse a path holding
`..`:

```bash
bunx oxlint --type-aware --deny-warnings packages/ui packages/aria
bunx oxfmt packages/ui/src packages/ui/tools packages/ui/gallery packages/aria/src
```

CI runs `bun run ci` at the root, which is lint plus format check, and a
separate job builds the gallery. The gallery build is the part the suite cannot
do: `bun test` compiles each module on its own, and what breaks in a gallery is
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

## What is deliberately not the same as upstream

Recorded so nobody re-opens them:

- **The scroll area is the native scroller** with `scrollbar-color` on it, not
  Radix's two `<div>`s and a resize observer. `scrollbar-color` did not exist
  when that component was written. The cost is stated in the component: a native
  scrollbar cannot overlay content or fade out.
- **The select has no scroll arrows.** Radix needs them because its popper does
  not scroll; this list is a real scroller with `overflow-y: auto`, and a fake
  arrow over a native scrollbar is worse than the scrollbar.
- **`Select` and `Combobox` are one component, not five.** Radix needs the tree
  written out; `@barqjs/aria` builds the trigger, the popover and the list from
  the same `items`.
- **`DatePicker` is a composition**, because upstream ships no `date-picker.tsx`
  and documents a `<Popover>` around a `<Calendar>`.
- **`Form` is `Field`.** No react-hook-form, so no `<Form>`.

## What is still open

- The specs are this package's transcription INPUTS, and several were written
  against an older shadcn: `tabs-list` without `bg-muted`, `native-select` with
  `px-3` where upstream now has `pr-8`. `verify` cannot see it, since it asks
  only that every spec declaration exists here and never the reverse. Reading
  the class lists straight out of the pinned components is the fix.
- `@barqjs/lucide`'s dist is 15 MB across 3,586 files. Nobody has measured what
  that does to an `npm install`.
- `Disclosure` and `DisclosureGroupItem` in `@barqjs/aria` render no element, so
  a `class` handed to them vanishes. That cost the accordion its dividers.
