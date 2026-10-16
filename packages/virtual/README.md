# @barqjs/virtual

Virtualized scrolling for barq. A list of ten thousand rows puts only the ones
in view in the DOM, and scrolling changes which ones. `createVirtualizer` and
`createWindowVirtualizer` run on `@tanstack/virtual-core`, the engine of
[TanStack Virtual](https://tanstack.com/virtual), and the API follows
`@tanstack/solid-virtual` with the differences listed below.

## Install

```bash
bun add @barqjs/virtual
```

`@barqjs/core` is a peer dependency. `@tanstack/virtual-core` is a dependency of
this package and is re-exported from it, so one import covers the adapter and
the core.

## Example

A list of 10,000 rows of unknown height. Only the rows in the viewport, plus the
overscan, are in the document.

```tsx
import { For, render } from "@barqjs/core";
import { type VirtualItem, createVirtualizer } from "@barqjs/virtual";

const contacts = Array.from({ length: 10_000 }, (_, id) => ({
  id,
  name: `salama ${id}`,
  email: `salama+${id}@example.com`,
}));

function Contacts() {
  let scroller: HTMLDivElement | null = null;

  const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>(() => ({
    count: contacts.length,
    getScrollElement: () => scroller,
    estimateSize: () => 48,
    getItemKey: (index) => contacts[index].id,
    overscan: 5,
  }));

  return (
    <>
      <button type="button" onClick={() => virtualizer.scrollToIndex(5000, { align: "center" })}>
        Jump to the middle
      </button>
      <div
        ref={(el: HTMLDivElement) => (scroller = el)}
        style={{ height: "400px", overflow: "auto" }}
      >
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
          <For each={virtualizer.getVirtualItems()} keyed={(item: VirtualItem) => item.key}>
            {(item: () => VirtualItem) => (
              <div
                data-index={item().index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${item().start}px)`,
                }}
              >
                {contacts[item().index].name} ({contacts[item().index].email})
              </div>
            )}
          </For>
        </div>
      </div>
    </>
  );
}

render(() => <Contacts />, document.body);
```

Three things in it are barq, not TanStack:

- Options are an accessor. A signal read inside it (`count: rows().length`)
  re-applies the options when it changes. A plain object works too, and so does
  an object of getters.
- `For` takes a key function, `keyed={(item) => item.key}`, which hands the row
  an accessor. `item().start` is then a tracked read, and a measurement moves
  the rows already rendered. The items are a store reconciled by key, so a
  by-item `For` reading `item.start` keeps its rows and moves them too, but the
  compiler cannot see where the items come from and reports `BARQ004` for it.
- `ref={virtualizer.measureElement}` is enough for dynamic sizes. A barq ref
  runs before its element is in the document, so the adapter measures on the
  next microtask.

## API

- `createVirtualizer(options)`: an element scrolls. `count`, `getScrollElement`
  and `estimateSize` are required; `observeElementRect`, `observeElementOffset`
  and `scrollToFn` default to the core's element implementations.
- `createWindowVirtualizer(options)`: the window scrolls. `getScrollElement`
  defaults to `window` and `initialOffset` to `window.scrollY`.
- `CreateVirtualizerOptions`, `CreateWindowVirtualizerOptions`: the option types
  of the two functions.
- Everything `@tanstack/virtual-core` exports: `Virtualizer`, `VirtualItem`,
  `VirtualizerOptions`, `Range`, `defaultRangeExtractor`, `defaultKeyExtractor`,
  `measureElement`, `elementScroll`, `windowScroll`, `observeElementRect`,
  `observeElementOffset`, `observeWindowRect`, `observeWindowOffset` and the
  rest.

Both functions return the core's `Virtualizer`, so every option and method in
the [TanStack Virtual API](https://tanstack.com/virtual/latest/docs/api/virtualizer)
applies: `lanes`, `gap`, `paddingStart`, `paddingEnd`, `scrollMargin`,
`horizontal`, `overscan`, `rangeExtractor`, `anchorTo`, `enabled`,
`scrollToIndex`, `scrollToOffset`, `scrollBy`, `scrollToEnd`, `measure`,
`resizeItem`.

## What is reactive

The core owns its state. The adapter mirrors four reads into barq's graph and
passes everything else straight through.

- `getVirtualItems()` returns a store, reconciled by item key. A row keeps its
  identity while its item stays in the window, and each field is its own
  dependency.
- `getTotalSize()`, `isScrolling` and `range` are tracked when read inside a
  tracking scope, and read the core directly anywhere else. An event handler
  that calls `resizeItem` and then `getTotalSize()` sees the new total without
  a `flush()`.
- `getVirtualItems()` is the rendered snapshot everywhere. After an imperative
  write, call `flush()` before reading it, or read `getVirtualIndexes()`.
- `scrollOffset`, `scrollDirection`, `scrollRect`, `options` and the caches are
  the core's own fields and are not tracked. The core only notifies when the
  range or `isScrolling` changes, so a mirror of them would be stale between
  notifications.

`isScrolling` and `range` are fields. The compiler wraps a member read in JSX,
so they render reactively as they are written:

```tsx
<div class={virtualizer.isScrolling ? "list scrolling" : "list"} />
```

## Server rendering

Nothing touches `window` or `document` at import or during a server render. On
the server the virtualizer never attaches to a scroll element, so it renders the
window that `initialRect` and `initialOffset` describe:

```tsx
createVirtualizer(() => ({
  count: 1000,
  getScrollElement: () => scroller,
  estimateSize: () => 48,
  initialRect: { width: 0, height: 600 },
}));
```

## Differences from the Solid adapter

- Options may be an accessor, which is how barq passes reactive options.
  Solid's object of getters is still accepted.
- The mirrored items are reconciled by `key`, not by `index`. With a custom
  `getItemKey` a row follows its item through a prepend instead of being
  rewritten in place.
- `isScrolling` and `range` are reactive. The Solid adapter leaves them as plain
  fields.
- `measureElement` defers to a microtask for an element that is not in the
  document yet. With the Solid adapter the caller writes that `queueMicrotask`.
- `_willUpdate` runs in an effect after the rows are written, where the Solid
  adapter calls it inside `onChange` before they are. The core uses it to sync
  the scroll position after a prepend, and that write is clamped if the sizer
  has not grown yet.
- An option set to `undefined` keeps the adapter's default.

The React adapter's `useFlushSync`, `directDomUpdates` and `containerRef` are
not ported. A barq write is flushed in a microtask, before the browser paints,
and a scroll already updates only the fields that changed.
