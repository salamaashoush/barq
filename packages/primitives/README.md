# @barqjs/primitives

The reactive primitives an application needs and a framework should not ship:
scheduling, events, observers, browser APIs, reactive collections and motion.

```bash
bun add @barqjs/primitives
```

One package, twenty-seven modules, nothing running at import time. Ask for one
primitive and you pay for one primitive:

| what you import             | minified | gzipped |
| --------------------------- | -------- | ------- |
| `debounce`                  | 649 B    | 367 B   |
| `mediaQuery`                | 1.2 kB   | 660 B   |
| `windowSize` and `visible`  | 2.7 kB   | 1.2 kB  |
| every export in the package | 30 kB    | 10.5 kB |

Measured by `src/tree-shaking.test.ts`, which bundles those imports and fails if
anything else survives.

## Two rules the whole package follows

**A primitive cleans up after itself.** Everything that subscribes is released
when the scope that created it disposes. There is no `useEffect` to remember,
because a component body runs once:

```tsx
import { on, windowSize } from "@barqjs/primitives";

function Sidebar() {
  const { width } = windowSize();
  on(document, "keydown", (e) => e.key === "Escape" && close());

  return <aside class={width() < 600 ? "narrow" : "wide"} />;
}
```

Unmount `Sidebar` and both the `resize` and the `keydown` listener go with it.

**A global source is shared.** Twenty components calling `windowSize()` get the
same two signals behind one `resize` listener, and the listener is removed when
the last of them unmounts. The same holds for `mousePosition`, `activeElement`,
`keysDown`, `online`, `windowScroll` and every `mediaQuery` with the same query
string. `ResizeObserver` and `IntersectionObserver` are shared per option set,
with entries routed by `entry.target`.

That sharing is not a detail. A thousand rows each observing their own size is
a thousand browser observations delivered as a thousand callbacks; through
`resizeObserver` it is one.

## Scheduling

```ts
import { debounce, leadingAndTrailing, scheduled, throttle } from "@barqjs/primitives";

const search = debounce((q: string) => fetch(`/search?q=${q}`), 250);
search("ba");
search("barq"); // only this one runs
search.flush(); // …or run it now
search.clear(); // …or not at all
```

`debounce` runs on the trailing edge, `throttle` at most once per window with
the latest arguments, `scheduleIdle` when the browser is next free. `leading`
and `leadingAndTrailing` wrap either one to move the first call to the front of
the window.

`scheduled` is the reactive form: a boolean that reads `false` until the
schedule lets it through, so a computation can rate-limit itself while still
depending on everything it reads.

```ts
import { effect } from "@barqjs/core";
import { debounce, scheduled } from "@barqjs/primitives";

const settled = scheduled((fire) => debounce(fire, 250));

effect(() => {
  const q = query();
  if (settled()) search(q);
});
```

## Derived values

```ts
import { debounced, previous, selector, whenever } from "@barqjs/primitives";

const settled = debounced(query, 250); // starts at query(), never undefined
const before = previous(count); // driven, not lazy: it advances unread
```

`selector` is the one to reach for in a list. A thousand rows each deriving
`row.id === selected()` is a thousand computations woken by every change;
subscribing each row to its own key wakes the row that lost the selection and
the row that gained it, and nothing else:

```tsx
import { For, signal } from "@barqjs/core";
import { selector } from "@barqjs/primitives";

const selected = signal(1);
const isSelected = selector(selected);

<For each={rows}>{(row) => <li classList={{ on: isSelected(row.id) }}>{row.name}</li>}</For>;
```

`whenever(condition, fn)` runs `fn` only while the condition is truthy and
cleans up on the way out, which is the shape most `effect` bodies with an early
return are trying to be.

## Events

```ts
import { eventSignal, on, onMap, once } from "@barqjs/primitives";

on(window, "resize", measure, { passive: true });
on(el, ["mousedown", "touchstart"], start);
on(target, "click", handle); // target is an accessor: rebinds when it changes
```

Any of the target, the type and the options may be an accessor, so a `ref` that
fills in after mount needs no extra effect. Handlers go through the core's own
`listen`, so a throw reaches the enclosing `Errored` boundary exactly as a
compiled `onClick` does.

## Elements and the viewport

```ts
import { bounds, elementSize, visible, windowSize } from "@barqjs/primitives";

const { width, height } = elementSize(el);
const showing = visible(el, { once: true }); // lazy images, load-more sentinels
const rect = bounds(el); // eight signals, not one
```

`width` and `height` are separate signals, and `bounds` gives eight, for the
same reason: a tooltip reading `top` and `left` should not re-run because the
element got wider.

## Browser state

```ts
import {
  clipboard,
  devicePixelRatio,
  languages,
  mediaQuery,
  online,
  pageVisible,
  permission,
  persisted,
  prefersDark,
  prefersReducedMotion,
  userIdle,
} from "@barqjs/primitives";

const theme = persisted("theme", "system"); // and it follows other tabs
const dark = prefersDark();
const wide = mediaQuery("(min-width: 768px)");
```

`persisted` reads once at creation, writes on every change, and follows the
`storage` event so two tabs agree. It does not write the initial value back, so
a key nobody has set stays unset. A quota failure reaches `onError` instead of
taking the render down.

`online` is honest about what it knows: `navigator.onLine` reports that a route
exists, not that anything is reachable, so treat `false` as certainly offline
and `true` as unknown.

## Input

```ts
import { activeElement, clickOutside, keysDown, mousePosition, shortcut } from "@barqjs/primitives";

shortcut("mod+k", () => palette.open());
clickOutside(menu, close, { ignore: [trigger] });
```

`mod` is Command on Apple platforms and Control everywhere else. Modifiers must
match exactly, so `"k"` does not fire on `mod+k`, and a bare letter is
suppressed while someone is typing in a field.

## Reactive collections

```ts
import { ReactiveMap, ReactiveSet } from "@barqjs/primitives";

const users = new ReactiveMap<string, User>();
users.get("ada"); // subscribes to that key, and nothing else
users.size; // subscribes to the structure
```

A key gets a dependency only when something reads it inside a tracked scope,
and the dependency is dropped again when its last reader goes away, so a
virtual list scrolling through a million ids does not grow a million entries.

For nested object state use `store` from `@barqjs/core`, which is the same idea
applied to property paths.

## Motion

```ts
import { cubicBezier, easing, spring, tween } from "@barqjs/primitives";

const x = tween(target, { duration: 200, easing: easing.cubicOut });
const position = spring(point); // number, or a list of them
```

Both retarget mid-flight, both stop their loop once they arrive, and both jump
straight to the target when the user has asked for reduced motion. The spring
integrates at a fixed timestep, so it looks the same at 60Hz and 144Hz.

## Async

```ts
import { abortOnCleanup, raceTimeout, until } from "@barqjs/primitives";

const user = await until(currentUser); // resolves at once if it is already there
const data = await raceTimeout(fetch(url, { signal: abortOnCleanup() }), 5000);
```

## Refs

```tsx
import { mergeRefs, onElement, ref } from "@barqjs/primitives";

const box = ref<HTMLDivElement>(); // a ref that is also a signal
const size = elementSize(box); // …so an effect sees the element land
<div ref={box.set} />;
```

A `{ current }` box is not reactive — it is filled while the JSX around it is
built, after the code holding it has run, so an effect reading it sees `null`
forever. `ref()` is a signal instead. `mergeRefs` is for forwarding: one `ref`
prop feeding several consumers, keeping the `{ current }` form and running the
cleanup a callback returned.

## State machines

```ts
import { machine } from "@barqjs/primitives";

const fetcher = machine({
  initial: "idle",
  context: { tries: 0 },
  states: {
    idle: { on: { FETCH: "loading" } },
    loading: {
      on: {
        RESOLVED: "ready",
        REJECTED: { to: "failed", action: (c) => ({ tries: c.tries + 1 }) },
      },
    },
    ready: { on: { FETCH: "loading" } },
    failed: { on: { FETCH: { to: "loading", guard: (c) => c.tries < 3 } } },
  },
});
```

`loading && !error && !empty` has eight states and describes four; the other
four are the bugs. Here an event a state does not handle is ignored rather than
producing an impossible combination. A state's `enter` may return a cleanup, so
a timer that belongs to one state is written beside it.

## Virtual lists

```ts
import { virtual } from "@barqjs/primitives";

const rows = virtual(container, { count: () => data().length, size: 32 });
rows.items(); // only what fits, plus overscan
rows.total(); // the spacer's height
```

Ragged rows take a function, and the offsets become a prefix sum: a scroll
costs two binary searches rather than a walk, which is what lets a hundred
thousand uneven rows behave like ten. A uniform list skips the array and
divides.

## Sockets

```ts
import { websocket } from "@barqjs/primitives";

const feed = websocket(() => `wss://example.com/rooms/${room()}`, {
  reconnect: true,
  heartbeat: { every: 30_000 },
});
feed.send("hello"); // buffered if it is not open yet, flushed on connect
```

Reconnects with exponential backoff on an unclean close and never on a clean
one — `close()` and code 1000 mean "I am done", and retrying through that is
how a logout loop starts. The retry budget counts consecutive failures, so a
socket that drops once an hour keeps its full budget each time. A reactive URL
reconnects to the new one.

## Everything else

`bus` and `emitter` for typed events that unsubscribe with their scope,
`trigger` for a dependency with no value, `history` for undo and redo over a
signal, `interval` and `timeout` with reactive delays, `raf` and `fps`,
`mutationObserver`, `scrollPosition`, `focused`, `focusWithin`, `breakpoints`,
`documentTitle`, `devicePixelRatio`, `languages`, `fullscreen`, `geolocation`,
and `shared` and `sharedKeyed` for building your own shared source.

Every module is also its own entry point: `@barqjs/primitives/media` and a
tree-shaken import from the root cost the same. `src/dist-entries.test.ts`
checks that the two are still one module, because two copies of the registry
would mean two listeners.

## Every module

Each is also its own entry point — `@barqjs/primitives/media` and a tree-shaken
import from the root cost the same.

| module        | what is in it                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------- |
| `scheduled`   | `debounce` `throttle` `scheduleIdle` `leading` `leadingAndTrailing` `scheduled`                                       |
| `derived`     | `debounced` `throttled` `deferred` `previous` `whenever` `every` `some` `not` `selector`                              |
| `event`       | `on` `once` `onMap` `eventSignal`                                                                                     |
| `observers`   | `resizeObserver` `intersectionObserver` `mutationObserver`                                                            |
| `element`     | `elementSize` `bounds` `visible` `windowSize`                                                                         |
| `scroll`      | `windowScroll` `scrollPosition`                                                                                       |
| `mouse`       | `mousePosition` `mouseInElement`                                                                                      |
| `keyboard`    | `keysDown` `isKeyDown` `shortcut` `parseCombo`                                                                        |
| `focus`       | `activeElement` `focused` `focusWithin` `clickOutside`                                                                |
| `media`       | `mediaQuery` `breakpoints` `prefersDark` `prefersReducedMotion` `coarsePointer`                                       |
| `storage`     | `persisted` `persistedSession` `clearPersisted` `peekPersisted`                                                       |
| `browser`     | `online` `pageVisible` `userIdle` `permission` `devicePixelRatio` `languages` `documentTitle`                         |
| `clipboard`   | `clipboard` `writeClipboard` `readClipboard`                                                                          |
| `fullscreen`  | `fullscreen` `fullscreenElement`                                                                                      |
| `geolocation` | `geolocation`                                                                                                         |
| `refs`        | `ref` `mergeRefs` `onElement`                                                                                         |
| `collections` | `ReactiveMap` `ReactiveSet`                                                                                           |
| `virtual`     | `virtual`                                                                                                             |
| `machine`     | `machine`                                                                                                             |
| `history`     | `history`                                                                                                             |
| `animation`   | `tween` `spring` `easing` `cubicBezier`                                                                               |
| `websocket`   | `websocket`                                                                                                           |
| `timer`       | `timeout` `interval` `now` `elapsed`                                                                                  |
| `raf`         | `raf` `fps`                                                                                                           |
| `promise`     | `until` `raceTimeout` `sleep` `abortOnCleanup`                                                                        |
| `bus`         | `emitter` `bus` `trigger`                                                                                             |
| `utils`       | `access` `asAccessor` `asArray` `chain` `clamp` `arrayEquals` `microtask` `owned` `tryCleanup` `shared` `sharedKeyed` |

## On the server

Nothing here needs a DOM to import. The browser primitives read a neutral
value — `windowSize` is zero, `mediaQuery` is `false`, `online` and
`pageVisible` are `true` — and subscribe to nothing, so a string render is not
left holding a timer or an animation frame. Read them again after hydration if
a first paint has to differ.

Two deliberate exceptions. `leading` and `leadingAndTrailing` run their first
call, because the leading edge is a moment a string render has and the end of
the window is not; and `sleep`, `until` and `raceTimeout` work normally,
because waiting is not a DOM concern. `timeout` and `interval` are inert —
use `sleep` where the point is the waiting rather than the scheduling.

`src/server.test.ts` measures all of this in a process that never had a DOM,
which is the only place it can be measured: this package's own test setup
registers happy-dom, and `isServer` is read once at module scope.
