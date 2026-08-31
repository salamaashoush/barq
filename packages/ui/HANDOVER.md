# `@barqjs/ui` — where this is and what is left

The package surface is in `README.md`. This file carries what a README should
not: the framework changes this package caused, the traps that cost a debugging
session each, and what has not been run.

Green on the current tree: `bun test` passes in ui (275), aria (648), core (938),
router (519), primitives (246), start (192), server (122), testing (101),
css (62), ui-cli (47), lucide (17) and query (15), and `cargo test` in
`compiler-rs` (468). `bunx tsc --noEmit` is clean in ui, ui-cli and lucide, all
three build, `bun run verify` reports 2254 of 2254 declarations present, and
`oxlint --type-aware --deny-warnings` is clean over `packages/ui` and
`packages/aria`.

Fifteen commits on `feat/ui-package`, and the tree is clean. `packages/ui`,
`packages/ui-cli` and `packages/lucide` were entirely untracked before them.

`bun run ci` at the root still FAILS, on 30 findings in `packages/router`,
`packages/server` and `packages/core`. Those are on HEAD's own content and
predate this work.

## Where to pick up

Forty-five components. What is left of the classic registry, in value order:

1. **Calendar**, then **DatePicker** — aria has `calendar` and `datepicker`
   state. shadcn's calendar CSS is written against `react-day-picker`'s DOM, so
   the class list does not map one to one and that is the whole of the work.
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

- **Components.** `Calendar`, `DatePicker`, `Toast`, `Sidebar`,
  `NavigationMenu`, `Carousel`, `Resizable`, `InputOTP`, `Drawer` and `Chart`.
  `Toast` needs new work in `@barqjs/aria`; the rest are transcription plus
  composition.
- **The new upstream.** `ui.shadcn.com` has moved to a registry whose look is
  in a stylesheet rather than in class lists, which `tools/css.ts` cannot
  transcribe. Nothing here targets it.
- **`DisclosureGroupItem` and `Disclosure` declare `StyleProps` they cannot
  honour.** They render no element, so a `class` handed to them vanishes. That
  is what cost the accordion its dividers; the next consumer hits it too.
- **The gallery is the only browser check.** It is opened by hand every time,
  and every visual bug in this file was found that way.
- **Server rendering.** Nothing here has been rendered through
  `@barqjs/server`. The CSS arrives through `collectCss`, which `@barqjs/start`
  already inlines, but no test covers a component's markup crossing the wire.
- **`@barqjs/lucide`'s dist is 15 MB** across 3,586 files. That is what a file
  per icon costs and what `lucide-react` also costs; nobody has measured what it
  does to an `npm install`.
- **The gallery is not in CI.** It builds (`bunx vite build --config
gallery/vite.config.ts`) and nothing runs it.
