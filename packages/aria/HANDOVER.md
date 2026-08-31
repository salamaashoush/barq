# `@barqjs/aria` — where this is and what is left

The package surface, its conventions and what is not implemented are in
`README.md`. This file carries only what a README should not: the framework
changes this package caused, the traps that cost a debugging session each, and
what has not been re-run.

Green on the current tree: `bun test` passes in aria (628), core (938),
primitives (246) and css (62). `bunx tsc --noEmit` is clean in `packages/aria` and
`packages/testing`, `bun run build` succeeds in aria, and
`oxlint --type-aware --deny-warnings` and `oxfmt --check` are both clean over
`packages/aria` and `packages/testing`.

`bun run ci` at the root still FAILS, on 29 findings in `packages/router`,
`packages/core` and `packages/server`. Those are on HEAD's own content and
predate this work — verified by linting the tree with this work removed.

`packages/compiler-rs`'s `bun test` has one failure, `(unnamed)` in
`test/browser.test.ts` — "Chrome did not answer Runtime.evaluate within 60s".
It needs a Chrome this machine does not have and predates this work.
`cargo fmt --check` also fails on `route_split.rs`, `routes.rs` and
`bind.rs`'s `ROUTE_COMPONENT_KEYS`. `cargo test` has NOT been run; nothing
since the first session touched Rust.

## Framework bugs found and fixed at the root

Each has a regression test where the bug was, not where it showed up.

### In `@barqjs/core`

1. **`aria-*` written as a boolean attribute.** `dom.ts::setAttr` and
   `ssr.ts::attr`/`attrLit` treated `aria-pressed={false}` as absence.
   `aria-pressed="false"` means "a toggle button, currently off"; removing it
   means "not a toggle button". Fixed with an `ENUMERATED_ATTRS` predicate in
   both, so the client and the server agree and hydration matches.
2. **A component's construction was a dependency of the hole that placed it.**
   `insert`'s `renderEffect` called the child Block with tracking on, so any
   signal the body read made the whole subtree rebuild. Fixed with `buildChild`.
   Applied again at `normalizeChildToNodes`'s `visit` and `childToNodes`.
3. **A fragment at the ROOT of a mount was static.** `insertRendered`'s array
   branch appended nodes once, so a component whose whole output is a
   conditional rendered its first value and never moved.
4. **Two compiler miscompilations**: `render(() => <App/>)` from
   `@barqjs/testing` was not a root mount (`analysis/bind.rs`), and a `<For>`
   row callback building no JSX of its own got no scope parameter (`scope.rs`).
5. **Capture-phase events did not exist.** `onKeyDownCapture` and
   `capture:keydown`, end to end through the compiler and all three backends.

### In `@barqjs/aria`'s own foundation

6. **A component gets no scope of its own, so `install` writes where its
   SIBLINGS read.** `provide` is what every trigger component now uses.
7. **`focusScope` captured its restore target when the hook was CALLED.** An
   overlay's scope is created with its component and opened much later, so it
   restored focus to whatever had it at mount. A submenu returned focus to the
   menu rather than to the item that opened it. Now captured when the scope's
   sentinel mounts, through a signal so the copy onto the scope node re-runs.
8. **`focusScope` resolved its PARENT scope at the same wrong moment**, so a
   portalled scope was parented beside its parent instead of under it, and
   restoration then refused to run. Now resolved again on mount.
9. **`selectableItem` swallowed the second press on a table cell.** The guard
   "a press on a focusable child is that child's" saw the cell as a child,
   because `focusPlace` gives whichever cell holds the roving focus
   `tabindex="0"`. `data-key` now tells the collection's own surfaces from a
   genuinely interactive child; a nested collection is told apart by the
   `data-collection` on its container, which the walk finds first.
10. **`allowsActions` was a static check**, so a caller whose `onAction` is a
    prop could not turn it on later. Now an `Accessor<boolean>` option
    (`hasAction`) on `selectableItem`, threaded through gridlist and table. The
    three `// Read ONCE` workarounds are gone.
11. **Menu item ids came from a global map keyed by item key**, so two menus
    offering the same key wrote the same id. `menuItemIdFor(baseId, key)`, the
    shape listbox, gridlist, table and tag already used.

### In `@barqjs/testing`

12. **`screen` was typed `any`.** `ReturnType` of a generic signature erases
    type parameters to their CONSTRAINTS rather than their defaults, so
    `ReturnType<typeof getQueriesForElement>` landed on an index signature and
    every `screen.getByRole(...)` had type `any`. That hid 104 type-aware lint
    findings across the aria suite.
13. **`user.hover` was not a hover**, and `accessibleName` recursed forever on
    a self-reference, and `ariaViolations` reported inside an `aria-hidden`
    subtree. All three fixed in the first session.

## Leaving takes time, and nothing was giving it any

`presence.ts` is new and it is the whole answer to "the enter animation works
and the exit does not". A conditional removes its content in the frame the
condition turns false, so an exit animation has nothing to animate; `presence`
holds it, marked `data-closed`, for exactly as long as something is still
drawing it. `<Modal>` and `<Popover>` are gated on it.

Two things about it are load-bearing:

- **The duration is READ, never configured.** It belongs to whoever wrote the
  CSS, so a hard-coded 150ms would be wrong for every application that chose
  otherwise and wrong under `prefers-reduced-motion`, where the answer is zero.
- **`data-closed` is written straight onto the element and the element is
  measured in the same tick.** Measuring first reads the ENTER animation, and
  measuring a frame later costs a frame on every close that has no animation at
  all — which broke twenty-one tests when it was a double `requestAnimationFrame`.
  Reading a computed style flushes the pending change, so one tick is enough.

`exitDuration` asks the cascade AND `getAnimations({ subtree: true })`, because
neither is enough alone: a disclosure panel's transition is DECLARED but has not
started, and a menu's animation is on the list INSIDE the popover that carries
the attribute.

**`disclosure()` set `hidden` the moment the state flipped**, and `hidden` stops
content being rendered at once — so a panel whose CSS transitions
`grid-template-rows` opened over 200ms and vanished in one frame, with the
transition still running and painting nothing. It waits now, and hides
synchronously in the three cases where waiting would be wrong: a panel that
starts shut, one with no transition, and `prefers-reduced-motion`.

**Focus restoration now happens after the exit animation** rather than in the
same frame, because disposal is what restores it. That is what Radix and
react-aria both do, and it was a deliberate choice rather than a consequence.

## Positioning was measuring the wrong box

Three fixes in `overlayPosition`, all found by opening `@barqjs/ui`'s gallery.

- **An overlay was placed by what it was PAINTED at.** `getBoundingClientRect`
  reports the transformed box, and every overlay in `@barqjs/ui` enters with
  `zoom-in-95` — so a 288px popover measured 274 mid-animation, was centred on
  that, and finished its animation 7px off its trigger. A transform on the thing
  being placed must not decide where it goes: `layoutSize` reads
  `offsetWidth`/`offsetHeight`.
- **The arrow was measured the same way**, and it is a rotated square, so its
  bounding box is 14.1px for a 10px arrow — 2px of error on top of the rest.
- **Nothing re-measured.** A `ResizeObserver` on the trigger and on the overlay
  re-places it when either box actually changes, which is what content that
  grows after it opens needs.

`arrowRef` was declared and never passed by anyone, so `arrowProps` was `{}` and
`@barqjs/ui`'s tooltip arrow fell to its static position in the far corner.
`src/overlays.test.tsx` pins all of it by stating the boxes, since happy-dom
lays nothing out.

## Overlays are portalled now, and that changed timing

`<Popover>` and `<Modal>` render through core's `<Portal>`. `overlays.ts` has
the portal-target context, `dialog.tsx` has `<PortalProvider>` and the
`display: contents` group container a nested popover portals into.

**The one thing every future test must know**: core's `portal` builds its
content on a MICROTASK after the marker connects, so an overlay is not in the
DOM in the same turn it opened. A test that opens a menu needs
`flush(); await tick(); flush();`. `src/submenu.test.tsx` has `open()` and
`openSubmenu()` helpers that do exactly that.

Focus restoration on close is deferred to a `requestAnimationFrame`, so a test
asserting where focus went needs to await a frame as well.

## Things that will bite

- **`<For each={x}>` where `x` is an identifier bound to an accessor does not
  work.** The compiler wraps it as `() => x`, so `For` iterates the function.
  Write `each={() => x()}`. This cost an afternoon in `calendar.tsx`.
- **Keying a `<For>` by an object built in the `each` expression rebuilds every
  row on every read**, and the row holding focus is destroyed under the user.
  `datefield.tsx` keys its segments by INDEX for this reason.
- **A component's JSX assigned to a `const` is built EAGERLY.** `const body =
(<>…</>)` in a component body constructs it there and then, so a `<Show>`
  around it gates nothing. This is what made every menu build at mount rather
  than on open, which then read its autofocus strategy before the trigger had
  set one.
- **A callback prop must declare its parameter.** `callback()` tells a handler
  from a Cell by arity, so `validate={() => "Bad"}` is read as a Cell.
- **A collection item with `children` is a SECTION.** A submenu's items go
  under a different key; `src/submenu.test.tsx` uses `submenu`.
- **`declaring onAction` is no longer a static check**, but `menuItem` still
  routes actions through `onPress` rather than `onAction`, deliberately: a menu
  item is always chosen by a press, never "actioned instead of selected".

## Hydration is tested, within a real limit

`src/hydration.test.ts` compiles ONE fixture twice — with `ssr: true` and
without — writes both to `node_modules/.barq-hydration-fixtures` as `.ts` (so
the suite's own `.tsx` loader does not claim them) and hands both halves to
`renderAndHydrate`. That is the "way to compile one fixture for both backends"
the previous handover asked for.

The limit is real rather than a preference: the fixture uses HOOKS, not this
package's components. A component's own module is compiled for one backend too,
so a `<Checkbox>` reached from the server half would be the DOM-compiled one,
which builds nodes the string backend cannot use. Compiling the whole subtree
twice was attempted through a bun plugin and abandoned — bun's runtime plugins
do not dispatch `onResolve` by namespace, and a path marker fails because the
resolver requires the file to exist before `onLoad` runs.

Ids cannot be compared as strings across the two halves either: `id()` numbers
from the owner's place in the scope tree, and a browser hydrates in a fresh
process where the client is the first mount. The test compares the id GRAPH —
markup with every id replaced by its position in first-appearance order — which
is the property that actually matters and catches a client that renumbers an
element without renumbering what names it.

## What has not been re-run

`packages/kitchen-sink` and `packages/benchmark` have not been touched or run.
Nothing here has been checked in a real browser: `ferridriver` was not used, and
the portal change in particular deserves it, because clipping under
`overflow: hidden` is the thing it fixes and happy-dom lays nothing out.

Mid-session in the first session, something outside this work added
`fetch("/__trace…")` instrumentation to
`packages/router/src/{router,server,client,components}.ts` and
`packages/kitchen-sink/preview-trace.mjs`. It is still in the tree and is not
from this work.
