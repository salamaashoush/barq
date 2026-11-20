---
name: diagnostics
description: Map a barq runtime diagnostic code (REACTIVE_WRITE_IN_OWNED_SCOPE, STRICT_READ_UNTRACKED, HYDRATION_MISMATCH, SILENT_HOLD, HOT_SCOPE_*, ...) to its repair. Load when a barq console warning, test failure or captured @barqjs/diagnostics artifact reports a [CODE]. Build-time BARQ0NN codes are in the compiler-diagnostics skill of @barqjs/compiler.
---

# Repairing barq code from a runtime diagnostic code

A development build of barq reports findings with stable codes. Find the code's
`### CODE` section below: each says what the runtime observed and what to
change. Every code is a real defect or a real cost, so repair the cause. There
is no comment that silences a runtime code.

Two families share one channel, `DEV.diagnostics` from `@barqjs/core`: the
codes of the reactive engine (`@solidjs/signals`) and the codes of barq's own
renderer, hydration and server. The engine sections follow the `solid-js`
reactivity-diagnostics skill (MIT), restated for barq's API.

Severity `error` means broken behaviour. `warn` means code that works but is
structurally wrong or expensive. `info` is a measurement to read, and stays off
the console.

Compiler codes (`BARQ001` to `BARQ032`) are reported at build time, not here:
see `node_modules/@barqjs/compiler/skills/compiler-diagnostics/SKILL.md`.

## Locating a finding

One console entry per finding:

```text
[REACTIVE_WRITE_IN_OWNED_SCOPE] Writing to reactive state inside an owned scope ...
  in <App> › <Row> › li.title
  at src/routes/index.tsx:15:15
[REACTIVE_WRITE_IN_OWNED_SCOPE] what it means and how to fix it: <docs url>
[REACTIVE_WRITE_IN_OWNED_SCOPE] agent repair guide: node_modules/@barqjs/core/skills/diagnostics/SKILL.md#reactive_write_in_owned_scope
```

- The `in` line is the owner path, root first. `<Name>` is a component. The
  last segment is the binding or primitive the finding is about: `li.title` is
  the `title` attribute of an `<li>`, `li.children` is a child hole, `<Show>`
  or `<For>` is a control-flow construct, and a memo or an effect appears under
  its name.
- The `at` line is `file:line:col`, relative to the project root, of the
  innermost located node. In a browser it prints as a URL on the dev server's
  origin. Open that file at that line first.
- A signal, memo or store is named in the message after the variable it is
  declared as: `count`, or `createCounter.count` when it is declared inside a
  helper function. Search for that declaration.
- No `in` line means the subject has no named owner. For the `NO_OWNER_*` codes
  that is the finding itself.
- In a browser, a finding about a compiled binding also carries the element it
  writes as a second console argument.
- The two footer lines print with the first report of each code only.

The structured event has the same data: `code`, `kind`, `severity`, `message`,
`ownerPath` (string array), `loc`, `nodeName`, `docs` and `data`. The `data`
fields named in the sections below are on that object.

```ts
import { DEV } from "@barqjs/core";

const stop = DEV.diagnostics.subscribe((event) => {
  console.log(event.code, event.ownerPath, event.loc, event.data);
});
```

## Tracking mistakes (reads in the wrong place)

### STRICT_READ_UNTRACKED

A reactive value was read where nothing tracks it, so the read got the current
value once and never updates. `data.strictRead` names the place. barq raises it
in one place of its own: an effect's second function, `"an effect callback"`,
for `createEffect` and `createRenderEffect` alike and on the first run as well
as later ones. A store property read there carries `data.source: "store"` and
`data.property`. The engine also reports under a label you pass yourself: the
second argument of `untrack(fn, label)`, or the `name` option of `mapArray` and
`repeat`.

A read in a component body, in a `<For>` or `<Show>` callback, in an event
handler expression or in a `ref` callback is not reported at run time. A
component body that picks what it returns from one read is reported at build
time as `BARQ018`.

Move the read to the effect's first function and hand the value to the second:

```tsx
// before: the second function reads `label()` untracked
createEffect(
  () => open(),
  (isOpen) => {
    document.title = isOpen ? label() : "closed";
  },
);

// after: read both in the first function, use the result in the second
createEffect(
  () => (open() ? label() : "closed"),
  (title) => {
    document.title = title;
  },
);
```

Pick the repair by what the value is for:

- Rendered: read it in JSX, `<h1>{title()}</h1>`, and drop the effect.
- Derived: `createMemo(() => price() * quantity())`.
- Needed by the side effect: read it in the first function,
  `createEffect(() => id(), (value) => save(value))`.
- Needed when an event fires: read it inside the handler,
  `onClick={() => save(id())}`.

Leave `untrack` alone here. Wrapping the read in `untrack(() => value())` keeps
the stale value and only removes the report. It is for a snapshot a person has
decided must never update.

### PENDING_ASYNC_UNTRACKED_READ

The same place as `STRICT_READ_UNTRACKED` (in barq, an effect's second function
or a label you passed to `untrack`), and the value was an async memo that had
not answered yet, so there was nothing to read and the read threw. Read it in
the effect's first function, which waits for the memo and runs the second
function once it answers:

```tsx
// before
const user = createMemo(() => fetchUser(id()));
createEffect(
  () => open(),
  (isOpen) => {
    if (isOpen) log(user().name);
  },
);

// after
const user = createMemo(() => fetchUser(id()));
createEffect(
  () => (open() ? user().name : undefined),
  (name) => {
    if (name !== undefined) log(name);
  },
);
```

A component body that reads a pending value is not this code: under a
`<Loading>` the boundary shows its fallback, and with no boundary above it
`render` throws.

### UNTRACKED_READ_AFTER_AWAIT

An async computation read a signal, memo or store property for the first time
after an `await`. Only reads before the first `await` are tracked, so the
computation keeps its old result when that value changes. Read every source
before the first `await` and keep it in a local.

```tsx
// before
const results = createMemo(async () => {
  const response = await fetch("/api/items");
  const items = await response.json();
  return items.filter((item) => item.tag === query());
});

// after
const results = createMemo(async () => {
  const tag = query();
  const response = await fetch("/api/items");
  const items = await response.json();
  return items.filter((item) => item.tag === tag);
});
```

Reported in V8 runtimes only (Chromium, Node, Bun), once per computation and
source. The compiler reports the cases it can see in one file as `BARQ021`;
this code also follows the read into helpers and `.then` callbacks.

### PENDING_ASYNC_FORBIDDEN_SCOPE

A pending async value was read inside `onSettled`, which cannot wait, so the
read throws. Use `createEffect` and put the async read in its first function,
which waits for the value:

```tsx
// before
onSettled(() => {
  chart.draw(points());
});

// after
createEffect(
  () => points(),
  (value) => {
    chart.draw(value);
  },
);
```

### CAUGHT_REACTIVE_READ

A computation wrapped a reactive read in `try/catch`, the read threw (the value
was not ready, or its source failed), and the catch returned a substitute. That
throw is how a read reaches the nearest `<Loading>` or `<Errored>`, so the catch
hid the first load and the error. It is also unreliable: when the source goes
pending again later, the computation is marked pending and is not re-run, so
the catch does not fire.

Remove the `try/catch`:

- To branch on readiness, read `isPending(() => source())`.
- To show the previous value while a new one loads, read `latest(() => source())`.
- To show a fallback, let the read wait under a `<Loading>`.
- To handle a failure, use `<Errored>` or the `error` function of
  `createEffect(compute, { effect, error })`.

An interop layer that must catch re-throws the not-ready signal:

```ts
import { NotReadyError } from "@barqjs/core";

try {
  return source();
} catch (error) {
  if (error instanceof NotReadyError) throw error;
  return fallbackValue;
}
```

## Writes and imperative calls in the wrong place

### REACTIVE_WRITE_IN_OWNED_SCOPE

A signal or store setter, or `refresh()`, ran while an owned scope was running:
a component body, a JSX expression, a memo, or the first function of an effect.
Development builds throw. The `in` line ends at the scope that made the write.

Derive the value, or move the write to an event handler, `onSettled`, or the
second function of `createEffect`.

```tsx
// before: a write in the component body
function Counter() {
  const [count, setCount] = createSignal(0);
  setCount(1);
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>;
}

// after: the value is the initial value
function Counter() {
  const [count, setCount] = createSignal(1);
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>;
}
```

```tsx
// before: a memo that writes
createMemo(() => setTotal(price() * 2));

// after: a memo that returns
const total = createMemo(() => price() * 2);
```

A write that has to follow a change:

```tsx
createEffect(
  () => price(),
  (value) => {
    setHistory((list) => [...list, value]);
  },
);
```

A signal that is written on purpose during setup opts in where it is created:
`createSignal(0, { ownedWrite: true })`. The compiler reports the writes it can
see in one file as `BARQ019`.

### ASYNC_STORE_SETTER

A store setter's callback returned a promise: `setState(async (draft) => ...)`,
or a callback that calls an async helper. The setter is synchronous: the draft
closes when the callback returns, so every write after the first `await` was
lost. Do the async work first, then write synchronously.

```tsx
// before
setState(async (draft) => {
  draft.user = await fetchUser(id);
});

// after
const save = action(function* (id: string) {
  const user = yield fetchUser(id);
  setState((draft) => {
    draft.user = user;
  });
});
```

A signal is not subject to this: a signal may hold a promise as its value.

### OPTIMISTIC_WRITE_BEFORE_LOAD

An optimistic setter ran before its source's first answer landed
(`createOptimistic(async fn)`, or `createOptimisticStore(fn, seed)` whose
function has not answered; the seed does not count). There is nothing on screen
to be optimistic over. Development builds throw.

Keep pending items in a separate signal or store until the source has loaded,
or disable the control until then: `disabled={isPending(() => items())}`.

### OPTIMISTIC_WRITE_WHILE_LOADING

An optimistic setter ran while its source, which had answered before, was
loading a new answer because an input changed. The guess was composed on the
previous answer and the new answer replaces it. A warning, once per source; the
guess is still made.

Render the control inside the source's `<Loading>`, or disable it while the
source is pending (`isPending(() => source())`), or hold the pending change in
a separate list until the new answer lands.

### STORE_WRITE_OUTSIDE_SETTER

A store was assigned to, deleted from, or had a property defined on it outside
its setter, and the write was ignored. `data.operation` is `set`,
`defineProperty` or `deleteProperty`. Make the write on the setter's draft:

```tsx
// before: ignored
state.count = 5;
state.items.push(item);
delete state.user;

// after
setState((draft) => {
  draft.count = 5;
  draft.items.push(item);
  delete draft.user;
});
```

### STORE_WRITE_THROUGH_LOADING

A store setter wrote inside a value that is another store still loading its
first answer (`setOuter((draft) => { draft.child.x = 9; })`, where `outer`'s
function returned `{ child: inner }`). The inner store has no contents yet, so
the write is dropped. `data.property` names the key holding the loading store.

Write after the inner store has loaded, or replace the whole value:
`setOuter((draft) => { draft.child = { ...next }; })`.

### ACTION_CALLED_IN_OWNED_SCOPE

A function made by `action()` was called while a component body or a
computation was running. An action is an imperative entry point. Call it from
an event handler, `onSettled`, or the second function of `createEffect`.

```tsx
// before
function Page() {
  save();
  return <p>saved</p>;
}

// after
function Page() {
  return <button onClick={() => save()}>Save</button>;
}
```

### FLUSH_IN_EFFECT_CALLBACK

`flush()` was called inside an effect's second function, where it does nothing:
the flush that runs effects is already in progress, and writes made there are
applied in its continuation. Delete the call. If a later drain is truly needed,
defer it: `queueMicrotask(() => flush())`.

## Ownership and lifecycle (leaks)

### NO_OWNER_EFFECT

An effect was created with no owner (not under a component, and not under a
`createRoot`), so nothing can dispose it. Create it in a component body, or
under a root you dispose:

```ts
// before: module scope
createEffect(
  () => theme(),
  (value) => {
    document.body.dataset.theme = value;
  },
);

// after
const dispose = createRoot((dispose) => {
  createEffect(
    () => theme(),
    (value) => {
      document.body.dataset.theme = value;
    },
  );
  return dispose;
});
```

To attach it to an owner captured earlier, use `runWithOwner(owner, fn)`.

### NO_OWNER_BOUNDARY

A `<Loading>` or `<Errored>` boundary (or `createLoadingBoundary`,
`createErrorBoundary`) was created with no owner. Same repair as
`NO_OWNER_EFFECT`: create it under a component or a `createRoot`. Building JSX
at module scope and rendering it later is the usual cause; build it inside the
function passed to `render`.

### NO_OWNER_CLEANUP

`onCleanup` was called with no owner, so the callback never runs. Call it in a
component body, a memo, or the first function of an effect. In an event handler
or a timer there is no owner: capture one with `getOwner()` in the component
body and register through `runWithOwner(owner, () => onCleanup(fn))`.

### CLEANUP_IN_FORBIDDEN_SCOPE

`onCleanup` was called inside `onSettled`. Return the cleanup instead:

```tsx
// before
onSettled(() => {
  const id = setInterval(tick, 1000);
  onCleanup(() => clearInterval(id));
});

// after
onSettled(() => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
});
```

When the message names a ref callback, register the cleanup in the component
body that creates the ref instead.

### SETTLED_CLEANUP_UNOWNED

`onSettled` returned a cleanup while running with no owner, so the cleanup
cannot be kept. Development builds throw; production drops the cleanup. Call
the setup from a component body, not from an event handler or from inside
another `onSettled`.

### ON_FLUSH_IN_OWNED_SCOPE

`onFlush` was called in a component body or a computation. It is for event
handlers and effect second functions. For work after a component's first
render use `onSettled`, and keep side effects out of computations.

### RUN_WITH_DISPOSED_OWNER

`runWithOwner` received an owner that was already disposed, so anything created
inside leaks. The owner was captured across an `await` or stored past its
lifetime. Capture the owner at call time, or guard:
`if (!isDisposed(owner)) runWithOwner(owner, fn)`.

### RENDER_SUBTREE_NOT_OWNED

`render` was given nodes built before the call, so the function it returns
removes the nodes but cannot dispose their effects and listeners. Pass a
function, so the component runs inside the root:

```tsx
// before
const view = <Counter />;
const dispose = render(view, document.body);

// after
const dispose = render(() => <Counter />, document.body);
```

## API misuse

### MISSING_EFFECT_FN

`createEffect` was called with one function. It takes two: the first tracks and
returns a value, the second receives the value and does the side effect.

```tsx
// before
createEffect(() => {
  document.title = title();
});

// after
createEffect(
  () => title(),
  (value) => {
    document.title = value;
  },
);
```

For a derived value use `createMemo`. For a one-time side effect after render
use `onSettled`.

### PRIMITIVE_IN_EFFECT_CALLBACK

A memo, an effect or a root was created inside an effect's second function or
its cleanup, where there is no owner to dispose it. Create it in the component
body or in the effect's first function, or attach it to an owner captured
earlier with `runWithOwner(owner, fn)`. Creating a signal alone is not
reported.

```tsx
// before
createEffect(
  () => id(),
  (value) => {
    const label = createMemo(() => `${value}: ${name()}`);
    show(label());
  },
);

// after
const label = createMemo(() => `${id()}: ${name()}`);
createEffect(
  () => label(),
  (value) => {
    show(value);
  },
);
```

### PRIMITIVE_IN_FORBIDDEN_SCOPE

A memo or an effect was created inside `onSettled`. Move it up to the component
body.

### INVALID_REFRESH_TARGET

`refresh()` was given something that is not a source: a wrapper function, or a
property read from a derived store. Pass the memo accessor or the store itself.

```tsx
// before
refresh(() => user());

// after
refresh(user);
```

### INVALID_AFFECTS_TARGET

`affects()` takes a source accessor or a store, plus at most one key, and a key
only for a store: `affects(user)`, `affects(state, "items")`. Fix the target or
drop the extra arguments.

### SYNC_NODE_RECEIVED_ASYNC

A memo or effect created with `{ sync: true }` returned a promise or an async
iterable. The value would be stored as it is and never awaited. Remove
`sync: true`, or return the unwrapped value.

## Loading boundaries

### ASYNC_OUTSIDE_LOADING_BOUNDARY

An async value was read outside any `<Loading>` while the page mounted, so the
whole mount waits for it. Wrap the part that reads it:

```tsx
// before
render(() => <Profile />, root);

// after
render(
  () => (
    <Loading fallback={<p>loading</p>}>
      <Profile />
    </Loading>
  ),
  root,
);
```

On the server, a memo declared `{ ssrSource: "client" }` read outside a
`<Loading>` throws, because the server cannot run it. Wrap the read in
`<Loading>`, or give the memo a `loadingValue` to render until it answers.

### LOADING_ON_OUTSIDE_HOLD

`on` re-armed a `<Loading>`, but a source the boundary waits for is also read
outside it, and that outside read holds the whole frame. The fallback cannot
appear. Move the outside read under the boundary. If the fallback should show
beside the held frame, read the key through `latest`:
`<Loading on={latest(() => page())} fallback={<Skeleton />}>`.

### LOADING_ON_ACCESSOR

A `<Loading>`'s `on` evaluated to a function, so the boundary read nothing
through it and never re-arms. The compiler hands `on` to the boundary as the
accessor to call, so an identifier (`on={route}`), an arrow that reads
(`on={() => route()}`) and a call (`on={route()}`) all re-arm when `route`
changes and are not reported. Any other expression whose value is an accessor
is: a field holding one (`on={filters.page}`), or a conditional choosing
between two (`on={sorted() ? byName : byDate}`). Call the accessor in the
expression:

```tsx
// before
<Loading on={filters.page} fallback={<p>loading</p>}>

// after
<Loading on={filters.page()} fallback={<p>loading</p>}>
```

For several dependencies pass a list of values: `on={[query(), page()]}`. A
list of accessors (`on={[query, page]}`) reads nothing either, and is not
reported.

## Hard failures

### REACTIVITY_HALTED

An earlier uncaught error stopped the reactive system, and later updates are
ignored. This code is not the bug. Find the first error printed above it and
fix that. The `in` line is the owner path of the computation the error escaped
from. To contain a failure that can happen for outside reasons, wrap the part
in `<Errored fallback={(error, reset) => <p>{error().message}</p>}>`.

### SETTLE_WALK_UNINITIALIZED_SOURCE

An internal consistency check of the engine: it tried to settle a source before
the source had a value or an error. Application code cannot repair it, and
adding `flush()` does not help. Keep the full message, reduce the async
sequence to a small reproduction, and report it at
https://github.com/salamaashoush/barq/issues.

### INVARIANT_VIOLATION

The reactive engine contradicted itself: an internal bug, not a mistake in the
application. Report it at https://github.com/salamaashoush/barq/issues with a
reproduction. Do not work around it.

### BLOCK_EVALUATED_TWICE

The content of one `<Show>`, `<For>` row, `<Loading>` or `<Portal>` was built
twice for a single appearance, so its effects exist twice. No application code
is known to raise it: it is barq checking itself. There is nothing to change in
the component. Report it at https://github.com/salamaashoush/barq/issues with
the component named on the `in` line and the versions of `@barqjs/core` and
`@barqjs/vite`.

## Performance (cost, measured)

These describe cost, not incorrect behaviour, and the numbers in the message
are measurements. `HUGE_FAN_OUT` and `HUGE_FAN_IN` are always on. The rest are
reported while the engine's attribution is enabled, which capturing a run with
`@barqjs/diagnostics` does. For the evidence behind a finding (why each scope
re-ran and what it cost) see
`node_modules/@barqjs/diagnostics/skills/agent-loops/SKILL.md`.

### HUGE_FAN_OUT

One value has very many subscribers (`data.count`), so one change re-runs all
of them. The usual shape is every row of a list comparing itself with one
selected id. Invert the question: keep the answer in a store used as a map, so
each row reads its own key and only the keys that flipped update.

```tsx
// before: every row re-runs when `selectedId` changes
<li class={{ active: row.id === selectedId() }}>{row.name}</li>;

// after: only the two rows whose key changed re-run
const [selected, setSelected] = createStore<Record<string, boolean>>({});
<li class={{ active: selected[row.id] }}>{row.name}</li>;
```

When the map is derived from other state, build it with `createProjection`.

### HUGE_FAN_IN

One computation tracked 2000 or more sources in a single run (`data.count`),
so it re-runs when any of them changes. The message does not list the sources;
`WIDE_SCOPE_DEPS` does, from 200. Narrow what the computation reads, or split
it into smaller memos that each track only what they need.

### WIDE_SCOPE_DEPS

One scope is subscribed to 200 or more sources. The message lists up to 12 of
them: start there. Same repair as `HUGE_FAN_IN`: read less in that scope, or
split it into memos.

### GRAPH_GROWTH

The live reactive graph got bigger on each of the last `data.history.length`
visits to `data.route`, and so did the part that outlived each navigation:
something every visit creates is never disposed. `data.grew` names the leak:

- `owners`: a root that is never disposed, or a `<Portal>` mounted per visit.
- `computations` with `owners` flat: an effect or memo created with no owner.
- `edges` alone: one more subscription per visit to something long-lived.

Look for, in order:

- A `createRoot()` in an effect, an event handler or a module-level helper
  whose disposer is dropped. Return the disposer from `onSettled`, or call it
  in `onCleanup`.
- An `addEventListener`, an observer or a subscription made in a plain function
  instead of under the component. Move it under the component and pair it with
  `onCleanup`.
- A `<Portal>`, panel or modal mounted on each visit into a long-lived root and
  never removed.
- A cache that only adds entries. Bound it, or evict what no page still reads.

The fix is ownership: create the thing under the owner whose lifetime it should
share. Disposing the app root, or sweeping on a timer, is not a repair.

### HOT_SCOPE_RERUNS

A scope re-ran far more often than any screen update needs: a value that
changes per frame or per event is read inside it. The message names the latest
cause. Move that read out of the scope, or put a slower value between them:

```tsx
// before: re-runs on every scroll event
const header = createMemo(() => renderHeader(scrollY()));

// after: re-runs only when the answer flips
const collapsed = createMemo(() => scrollY() > 80);
const header = createMemo(() => renderHeader(collapsed()));
```

### HOT_SCOPE_FANOUT

Many scopes went hot from one root cause, named in the message. This is the
aggregate of `HOT_SCOPE_RERUNS`. Fix the cause, not each scope. If the
consumers ask a keyed question of it (every row against one selected id), turn
it into a store used as a map, as under `HUGE_FAN_OUT`. If it is a per-frame
value, put a slower memo in front of it.

### HOT_SCOPE_TIME

A scope's total compute time went over its budget for the window: few runs,
each expensive. Look at what it computes. Split the expensive part into memos
so unchanged parts are reused, or move the work out of the reactive path (an
event handler, a worker, the server).

### UNSTABLE_MEMO_OUTPUT

A memo keeps returning a new object or array whose contents equal the previous
one, so every subscriber re-runs on every upstream change. Return a stable
reference, or pass `equals`:

```tsx
// before
const range = createMemo(() => ({ from: start(), to: end() }));

// after
const range = createMemo(() => ({ from: start(), to: end() }), {
  equals: (a, b) => a.from === b.from && a.to === b.to,
});
```

### WASTED_RECOMPUTE

The mirror of `UNSTABLE_MEMO_OUTPUT`: this scope re-ran and produced the same
value almost every time (`data.wasted` of `data.runs`, costing
`data.wastedMs`). `data.causes` names the input that keeps triggering it. Fix
it upstream, where the change starts:

- Read a narrower slice. `user().name` re-runs on every write to `user`. Put a
  memo in between, `const name = createMemo(() => user().name)`, or keep `user`
  in a store and read `state.user.name`.
- Give the source an `equals` that compares the part that matters.
- If the input must churn and the scope is expensive, split it: a cheap memo
  that extracts what is needed, feeding the expensive one.

Adding `equals` to the wasted scope itself changes nothing: its comparison
already succeeds, and the cost is the run before it.

### ASYNC_WATERFALL

Async requests ran one after another when they could have run together: each
one could not start until the previous one answered. Durations per link are in
the message and in `data`. Repairs, in order:

1. If the later request does not need the earlier answer, start both from the
   same inputs. In one scope, read every async source before using any of them,
   because the first not-ready read stops the scope and the later ones never
   start.

   ```tsx
   // before: `posts` starts only after `user` answers
   const user = createMemo(() => fetchUser(id()));
   const posts = createMemo(() => fetchPosts(user().id));

   // after: both start from `id`
   const user = createMemo(() => fetchUser(id()));
   const posts = createMemo(() => fetchPosts(id()));
   ```

2. If the dependency is real, preload the dependent data (a route loader), or
   join the two requests on the server.
3. If the work had already been started by a layer the graph cannot see (a
   request cache handing out promises), that layer declares it with
   `OBSERVE.attribution.markFlight(promise, startedAt)` from `@barqjs/core`.

A chain of two is `info` severity: a lead, not a verdict.

### EFFECT_WRITES_OWN_SOURCE

An effect re-ran because of a write it made itself: its second function wrote a
value that its first function reads, so the update took two passes and the
screen showed the first one. The written value is a function of what the effect
reads, so it is a memo.

```tsx
// before
createEffect(
  () => [page(), max()] as const,
  ([current, limit]) => {
    if (current > limit) setPage(limit);
  },
);

// after
const page = createMemo(() => Math.min(rawPage(), max()));
```

Or normalise where the source is written (in the event handler) instead of
correcting it afterwards. The `info` form names a cycle across several effects;
the repair is the same: derive each relayed value from the original inputs and
delete the writes.

### EFFECT_RELAY_TEAR

Derived state is kept in sync by an effect:
`createEffect(() => f(a()), (value) => setS(value))`. A reader ran twice for
one write to `a`, once against the stale `S` and once after the effect's write,
so its first frame was inconsistent. The message says which case applies:

- The written value is the effect's computed value (`data.copy: true`):
  replace the signal and the effect with `const s = createMemo(() => f(a()))`.
- The written value is `a` itself (`data.passthrough`): read `a` where `S` was
  read.
- Nothing else writes `S` (`data.soleWriter`): the same memo repair, unless the
  effect measures something outside the graph (layout, the clock, an element),
  in which case the double run is the cost of measuring.
- `S` has other writers: local editable state reset from a source. Use
  `createSignal(() => a())`, which is writable and re-seeds when `a` changes.

Deferring the write to a microtask to quiet the report hides the cause and
keeps the double run.

### IMMUTABLE_UPDATE_IN_STORE

A store setter replaced a container with a new object or array whose contents
are mostly unchanged (`data.unchanged` of `data.total`), so every reader under
that path re-ran for one changed leaf. Mutate the draft:

```tsx
// before
setState((draft) => {
  draft.user = { ...draft.user, name };
  draft.items = [...draft.items, item];
  draft.items = draft.items.filter((entry) => entry.id !== id);
});

// after
setState((draft) => {
  draft.user.name = name;
  draft.items.push(item);
  draft.items.splice(
    draft.items.findIndex((entry) => entry.id === id),
    1,
  );
});
```

Data arriving from outside for the same records merges with `reconcile`, which
keeps identity for records that did not change:
`setState((draft) => { reconcile(data, "id")(draft.items); })`.

### UNSTABLE_LIST_IDENTITY

A `<For>` (or `mapArray`) update disposed and rebuilt most rows although the
incoming items were field-for-field equal to the ones they replaced: a refetch
returned new objects for the same records, and identity keying treated each as
a new row. DOM, focus and scroll were thrown away. Key by a stable field:

```tsx
// before
<For each={rows()}>{(row) => <li>{row.name}</li>}</For>

// after: the row is an accessor when a key function is given
<For each={rows()} keyed={(row) => row.id}>
  {(row) => <li>{row().name}</li>}
</For>
```

Or merge the data into a store with `reconcile(data, "id")`, so the same
records keep the same objects. With `data.keyed: true` a key function is
already in use and returns unstable keys: return the stable field.

## Responsiveness (correct, but the user saw nothing)

Reported while attribution is enabled (see the note under Performance). The
runtime held an update until async work finished, which is correct; these codes
are about what the screen showed meanwhile.

### SILENT_HOLD

A write started async work, so the runtime held it and everything derived from
it until the data arrived. For the whole wait nothing on screen acknowledged
it. The message names what the user did, what was held and what blocked it. Add
feedback; keep the hold.

- Show the wait: read `isPending(() => blocker())` in the affected UI.

  ```tsx
  <ul class={{ busy: isPending(() => posts()) }}>
    <For each={posts()}>{(post) => <li>{post.title}</li>}</For>
  </ul>
  ```

- Show the input immediately: `latest(() => page())` reads the new value of the
  held write, so the control the user touched reflects the touch.
- Predict the outcome: write a `createOptimistic` or `createOptimisticStore`
  value beside the real write, or inside the action. When the message says an
  action held, this is the first repair to try.

Moving the write off the async path, or wrapping it in `untrack`, replaces the
hold with a torn screen (old data under new controls). When `data.long` is
true, apply the `LONG_HOLD` repair too.

### LONG_HOLD

The hold was acknowledged (a spinner, an optimistic value) and still ran long:
`data.tailMs` from the user's last input to the commit. At that length the old
screen is no longer useful. Show a fallback where the data lands by keying the
boundary on what changed:

```tsx
// before: the boundary keeps the old content for the whole wait
<Loading fallback={<Skeleton />}>
  <Results page={page()} />
</Loading>

// after: the write commits at once and the fallback shows
<Loading on={page()} fallback={<Skeleton />}>
  <Results page={page()} />
</Loading>
```

If the data itself is slow, preload or cache it. Keep the acknowledgement that
is already there.

### UNTRACKED_ASYNC_HANDLER

An `async` event handler awaited something and wrote nothing before its first
`await`, so the click did nothing visible for `data.continuationMs`. The
finding names the interaction (`click on button#save`), not a scope.

Make the async work an action, so its steps stay attributed to the click and
its writes are held together:

```tsx
// before
<button onClick={async () => setResult(await saveDraft())}>Save</button>;

// after
const save = action(function* () {
  const result = yield saveDraft();
  setResult(result);
});
<button onClick={() => save()}>Save</button>;
```

Or acknowledge before awaiting: write a "saving" signal the UI reads as the
handler's first line. A `try/finally` around the plain `await` changes nothing,
because nothing reactive learns about the wait.

### ABANDONED_FLIGHTS

One async source started request after request and discarded most answers:
`data.abandoned` requests in `data.windowMs` were each replaced by the next
before landing. This is search-as-you-type. Repairs, in order:

- Put a debounced or equality-gated value between the input and the fetch, so
  the memo that fetches reads something that changes only when the query has
  settled.

  ```tsx
  // before
  const results = createMemo(() => search(text()));

  // after: `query` is written by a debounced handler, and trimmed
  const query = createMemo(() => committedText().trim());
  const results = createMemo(() => search(query()));
  ```

- Key the fetch on what really changes (the parsed filter, not the raw text).

Caching the promise in a variable outside the graph hides the wait from the
runtime and is not a repair.

### FALLBACK_FLASH

A `<Loading>` fallback appeared and vanished within 150 ms (`data.shownMs`):
the data was almost there and the spinner read as a flicker. `info` severity.

- Preload or cache the data so it is present before the boundary asks.
- Lift the read above the boundary when the parent already waits.
- A flash on an update means `on` is keyed to something that changes more often
  than the data. Key it on the data's own input.

A minimum display time on the fallback trades a flicker for a wait.

### STACKED_HOLDS

`data.interactions` interactions were waiting in the same hold when it
committed: the user clicked or typed again while the first answer was pending.
Check the `SILENT_HOLD` or `LONG_HOLD` entry for the same hold first, then stop
the repeats at the control:

- Disable or dim it while the request is out:
  `<button disabled={isPending(() => results())}>`.
- Debounce typed input so a burst of keystrokes is one write.
- Show progress (`latest(() => input())`, an optimistic value) so the user does
  not click again because nothing moved.

### OPTIMISTIC_REVERTED

An optimistic value the screen showed was replaced by a different one.
`data.how` is `reverted` (the action ended and the value went back) or
`superseded` (the real value landed and differed). `info` severity: a count to
read.

- Many reverts on one source: the failure is common and the UI hides it. Show
  it where the value renders: catch in the action and write an error signal the
  UI reads, or put the reader under an `<Errored>`.
- Many supersessions on one source: the guess is wrong for this input. Guess
  only the part the client can know and read `isPending` for the rest.

Writing the guess into the real signal so it cannot revert shows the user a
result that did not happen.

## Elements and bindings (barq's renderer)

### BIND_TARGET_NOT_WRITABLE

A `bind:` attribute was given something that is not a signal (a memo, or the
read half alone), so the element does not follow the value and edits are never
written back. Bind the whole `[read, write]` pair:

```tsx
// before
const [name] = createSignal("salama");
const upper = createMemo(() => name().toUpperCase());
<input type="text" bind:value={upper} />;

// after
const name = createSignal("salama");
<input type="text" bind:value={name} />;

// or, with the pair taken apart
const [name, setName] = createSignal("salama");
<input type="text" bind:value={[name, setName]} />;
```

For a derived value that stays read-only, use the plain attribute:
`value={upper()}`.

### FUNCTION_AS_ATTRIBUTE

An attribute's expression evaluated to a function, so the function's source
text was written to the page. An accessor was named without its call inside a
larger expression. Call it where the value is chosen:

```tsx
// before
<button title={open() ? label : "closed"}>Toggle</button>

// after
<button title={open() ? label() : "closed"}>Toggle</button>
```

A bare accessor on its own, `title={label}`, is read for you and is not
reported.

### DELEGATED_EVENT_DOES_NOT_BUBBLE

A hand-written `delegateEvents([...])` call named an event that does not bubble
(`focus`, `blur`, `mouseenter`, `mouseleave`, `load`, `scroll`), so the handler
never runs. Compiled `on*` handlers never cause this. Listen on the element:

```tsx
// before
import { delegateEvents } from "@barqjs/web";
delegateEvents(["focus"]);

// after
import { listen } from "@barqjs/web";
<input
  ref={(input) => {
    listen(input, "focus", () => input.select());
  }}
/>;
```

Or delete the call and write `onFocus={handler}` on the element.

## Hydration

### HYDRATION_MISMATCH

`hydrate` found that a node the server sent is not the node the component
builds in the browser. The server's markup was discarded and the page rendered
again in the browser. The word in parentheses in the message is the kind, and
`data.template` is where the template being hydrated was written.

- `structure`: an element, a text node or a node count differs. Causes: a
  branch on `typeof window`, the time, or data only one side has; markup the
  HTML parser repairs (a `<div>` inside a `<p>`, which the compiler also
  reports as `BARQ026`); a browser extension.
- `text`: `Date.now()`, `Math.random()`, `toLocaleString()` in another locale
  or time zone.
- `range`: the `<!--[-->` and `<!--]-->` comments are missing. Causes: an HTML
  minifier, proxy or CDN that strips comments.
- `key`: a conditional picked another branch. Causes: a condition reading
  `typeof window`, `localStorage`, a media query or the time.
- `not-hydratable`: one side was compiled without hydration markers. Set
  `ssr: true` in `barq()` from `@barqjs/vite` and deploy both builds together.

Render the same elements on both sides and move what differs into content or
attributes that update after hydration:

```tsx
// before
export default function Page() {
  return typeof window === "undefined" ? <main>Welcome</main> : <div>Welcome</div>;
}

// after
export default function Page() {
  const [inBrowser, setInBrowser] = createSignal(false);
  onSettled(() => {
    setInBrowser(true);
  });
  return <main data-ready={inBrowser() ? "yes" : "no"}>Welcome</main>;
}
```

### HYDRATION_SEED_DRIFT

The server sent async values that no `createMemo` in the browser asked for
(`data.keys`). Values are matched to memos by creation order, so the browser
rendered a different set of components than the server, and an async memo may
be showing a value computed for another one.

Render the same components on both sides (remove branches on
`typeof window` around components that create async memos), and name each async
memo so a mismatch fetches again instead of taking another memo's value:

```tsx
// before
const user = createMemo(async () => (await fetch("/api/user")).json());

// after
const user = createMemo(async () => (await fetch("/api/user")).json(), { name: "user" });
```

`{ key: "current-user" }` replaces the position outright and must be unique on
the page.

## Server rendering and server functions

### SSR_RENDER_ERROR_CONTAINED

Part of the page threw on the server after the shell had been sent (inside a
`<Loading>`). The status was already on the wire, so the stream went on: the
nearest `<Errored>` shows its fallback, and without one the part keeps its
loading fallback and the browser builds it again. `data.error` is the error and
the `in` line names the component.

Fix the throw. Where the part can fail for outside reasons, say what the page
shows:

```tsx
// before
<Loading fallback={<p>Loading the profile</p>}>
  <Profile />
</Loading>

// after
<Errored fallback={<p>The profile could not be loaded.</p>}>
  <Loading fallback={<p>Loading the profile</p>}>
    <Profile />
  </Loading>
</Errored>
```

A route can declare an `errorComponent` for the same purpose.

### LATE_HEADER_WRITE

A status, header or cookie was written after the response head had been sent,
so it changed nothing the browser receives. `data.call` names the call
(`setResponseHeader`, `setCookie`, `setResponseStatus`, `httpHeader`,
`httpStatus` and their relatives). The write ran inside a part that renders
after the shell (under a `<Loading>`), or in a streamed server function after
its first value.

Write it while the response is open: in a route's `beforeLoad`, a loader the
route awaits, a route handler, a middleware, or a server function before it
returns.

```tsx
// before: inside an async memo under <Loading>
const profile = createMemo(async () => {
  const loaded = await loadProfile();
  setResponseHeader("cache-control", "private, max-age=60");
  return loaded;
});

// after
import { createFileRoute } from "@barqjs/router";
import { setResponseHeader } from "@barqjs/start";

export const Route = createFileRoute("/profile")({
  beforeLoad: () => {
    setResponseHeader("cache-control", "private, max-age=60");
  },
  component: Profile,
});
```

### SERVER_FUNCTION_FAILED

A server function, or a request middleware in front of it, threw, and the
caller received a 500. `data.id` is the function (`src/orders.ts#placeOrder`)
and `data.error` is the error. Fix the throw at the top of the stack. Where the
failure is an answer the caller should act on, throw a `Response`:

```tsx
// before
export const placeOrder = createServerFn({ method: "POST" })
  .validator((input: { lines?: string[] }) => input)
  .handler(async ({ data }) => data.lines!.length);

// after
export const placeOrder = createServerFn({ method: "POST" })
  .validator((input: { lines?: string[] }) => input)
  .handler(async ({ data }) => {
    if (data.lines === undefined) {
      throw new Response("an order needs at least one line", { status: 422 });
    }
    return data.lines.length;
  });
```

Input the caller sent wrong is a validator's job: its issues reach the caller
as `error.issues`. In production the caller gets only the status, so handle a
failure by `error.status`.

## Engine codes a renderer raises

These codes are in the engine's list, and only Solid's own renderer and server
emit them. barq never raises them: the engine's development build has no emit
site for any of them, and neither does barq's runtime. Each section says what
barq does in the same situation, which barq code reports it when one does, and
the repair.

### SSR_SUBTREE_ABANDONED

barq does not raise this code. When a streamed part throws after the shell, the
nearest `<Errored>` the stream wrote shows its fallback in place of everything
it wraps, and the parts still loading inside it are dropped without a report.
On a `renderToStream` render the throw itself is reported as
`SSR_RENDER_ERROR_CONTAINED`: fix that throw. To keep one failure from taking
its neighbours with it, wrap the part that can fail in its own `<Errored>`:

```tsx
<Errored fallback={(error) => <p>{error().message}</p>}>
  <Comments postId={id()} />
</Errored>
```

### SSR_STREAM_ABANDONED

barq does not raise this code. When the browser goes away or the request is
aborted, `renderToStream` stops after its current round and disposes the
render's scope, and nothing is reported: it is not an application bug. A server
function's handler receives `signal`, which aborts with the request; hand it to
the `fetch` calls the handler makes so their work stops too.

### SSR_CLIENT_CONTENT_MASKED

barq does not raise this code. A memo declared `{ ssrSource: "client" }` never
settles on the server, so the `<Loading>` around it ships its fallback even
after its other reads have answered, and the browser renders that content. The
values the server fetched are still seeded; the user just sees the fallback
longer. Give the client-only read its own `<Loading>`, or give the memo a
`loadingValue`, which the server renders in its place:

```tsx
const width = createMemo(() => measure(), { ssrSource: "client", loadingValue: 0 });
```

### SERVER_ERROR_SANITIZED

barq does not raise this code. A production build replaces an error it sends to
the browser with a generic one, both in a server function's reply (a 500 with
no text) and in a rendered error fallback, and records nothing. The failure
itself is reported as `SERVER_FUNCTION_FAILED`, or on a streamed render as
`SSR_RENDER_ERROR_CONTAINED`: fix that. If the user is meant to read the error,
mark it with `markSafeError` from `@barqjs/core`; a server function's caller
then gets its name and message on `ServerFnError.thrown`, and a render's
fallback shows it. A server function can also throw a `Response`, and the call
rejects with it.

```ts
throw markSafeError(new Error("That name is taken"));
```

### SSR_BOUNDARY_WATERFALL

barq does not raise this code, and the cost is real: when a read inside a
`<Loading>` can only start after another one answers, the server resumes that
boundary once per link before its content can stream. The repair is
`ASYNC_WATERFALL`'s. If the second read does not need the first answer, start
both from the same inputs; if it does, load the dependent data in the route's
`loader`.

```tsx
const user = createMemo(() => fetchUser(id()));
const posts = createMemo(() => fetchPosts(id()));
```

### SSR_UNDECLARED_LIVE_SOURCE

barq does not raise this code: a server render takes an async iterable's first
value and does not wait for the rest, so it never holds the document open. The
mistake barq allows is the opposite one. By default the browser adopts that
first value and the stream stops there. To keep it going after hydration,
declare the memo `{ ssrSource: "hybrid" }`, which runs it again in the browser
and continues from the server's value:

```tsx
const prices = createMemo(() => watchPrices(), { ssrSource: "hybrid" });
```

`live` from `@barqjs/start` is a different thing: it wraps a server function so
that calling it in the browser returns an iterable that stays connected.

### SSR_LIVE_HOLE_LATCHED

barq does not raise this code and has no live holes. A frame read through
`live` is rendered again whole each time a source it reads moves, and the new
rendering replaces the old one in the browser, so no single part of it can stop
updating on its own.

### SERVER_WRITE

barq does not raise this code. A setter called while a component renders is
reported at build time as `BARQ019`; in a development build it throws the
engine's `REACTIVE_WRITE_IN_OWNED_SCOPE`, and in production the write does
nothing and the render shows the old value. Derive the value instead:
`createMemo(() => load())`, or `createStore(fn, seed)` for a store. If the write
bridged a subscription, make the subscription the source:
`createMemo(() => from(source))`.

### REVEAL_IN_RENDER_TO_STRING

barq does not raise this code. `renderToString` renders every pending
`<Loading>` as its fallback, so a `<Reveal>` has nothing to order there.
`renderToStream` orders the boundaries directly inside one `<Reveal>` by its
`order`, but it does not coordinate a nested `<Reveal>` with its parent, and the
server ignores `collapsed`. Put the boundaries that must be ordered directly in
one `<Reveal>` and render with `renderToStream` from `@barqjs/server`.

### LAZY_ASSET_UNMAPPED

barq does not raise this code. A `lazy()` component's chunk is preloaded only
when the call carries its module URL and the render was given the build's asset
manifest; otherwise the chunk loads late during hydration and nothing is
reported. The router's Vite plugin, which `barq()` adds when `@barqjs/router` is
installed, writes the URL in, but only into `lazy(() => import("./x"))` with a
literal path, optionally followed by an options object. Name the export with
`{ export: "Name" }`: the plugin leaves a call that picks it with a function
alone.

```tsx
// before
const Chart = lazy(
  () => import("./Chart.tsx"),
  (module) => module.Chart,
);

// after
const Chart = lazy(() => import("./Chart.tsx"), { export: "Chart" });
```

### PRELOAD_DESCRIPTOR_INVALID

barq does not raise this code and does not check preload links. A preload is an
ordinary head tag: `useHead` writes its props as attributes as given, and a
route's `head().links` render the same way. One with no `as`, or an `as` the
browser does not know, still ships and fetches nothing useful, and the router
leaves it out of the 103 Early Hints and the `Link` header. Give every preload
`rel`, `href` and `as`:

```tsx
useHead({ tag: "link", props: { rel: "preload", href: "/hero.avif", as: "image" } });
```

### HEAD_TAG_INVALID

barq does not raise this code; `useHead` handles these cases without a report.
A tag other than `title`, `meta`, `link`, `style`, `script` or `base` is
dropped, a second declaration with the same identity (one title, one meta per
name or property) replaces the first, and a call on the server outside a render
does nothing. Attribute names are written as given, so an invalid one breaks
the server's markup and throws in the browser. A tag declared inside a
`<Loading>` that resolves after the shell arrives as a patch with that
boundary, so declare a tag that must be in the first bytes outside any
`<Loading>`, or in the route's `head`.

### UNRECOGNIZED_INSERT_VALUE

barq does not raise this code. A plain object in a JSX child position is written
as its string, `[object Object]`, on the server and in the browser. A function
there is not this mistake: barq calls it as a reactive hole. Render the field
you meant:

```tsx
// before
<p>{user()}</p>

// after
<p>{user().name}</p>
```

### UNSCOPED_HOLE_ALLOCATED_IDS

barq does not raise this code. A function in a JSX hole is a valid child: the
browser calls it as a reactive hole and the server calls it while writing the
hole, and `createUniqueId` values and async seed keys are numbered by where
they are declared rather than by how many effects ran. When the browser builds a
different tree from the server, the async values it strands are reported as
`HYDRATION_SEED_DRIFT` and a different element structure as
`HYDRATION_MISMATCH`.

### LOWERCASE_EVENT_ATTRIBUTE

barq does not raise this code, because every prop whose name starts with `on`
is an event: `onclick={handler}` and `onClick={handler}` both bind `click`, and
no `on` attribute is written into server markup. A value that is not a
function, such as `onclick="track()"`, binds nothing and is dropped without a
report. A Solid 1.x `on:click` written in JSX is the compile error `BARQ024`:
write `onClick={handler}`.

### UNCOMMITTED_INPUT_OVERWRITTEN

barq does not raise this code, and the overwrite happens without a report. A
`value` or `checked` binding writes the bound value whenever it differs from
what the element holds. The bindings of one element share one effect, so when
another binding on it changes, `value` is written again, and text the user typed
that never reached the signal is replaced. `onChange` fires on commit, not per
keystroke, so it leaves that window open. Write the signal on every edit with
`bind:value`, which listens to `input` on a text field, or with `onInput`:

```tsx
// before
<input
  value={name()}
  class={tone()}
  onChange={(event) => setName(event.currentTarget.value)}
/>

// after
<input type="text" bind:value={[name, setName]} class={tone()} />
```

For a field the program only seeds, use `defaultValue`.

### INVALID_HTML_NESTING

barq reports this at build time as `BARQ026`, an error in every build, when the
outer and inner elements are in the same JSX tree. A component boundary starts
the check over, and that includes the children of `<For>` and `<Show>`. Across
that boundary the page fails its claim at hydration and is rendered again in
the browser, reported as `HYDRATION_MISMATCH` (in a development build
`data.kind` is `structure` or `range`). Change the outer element (a `<div>` for
a `<p>` that holds blocks), move the inner element out, or write the wrapper the
parser expects:

```tsx
<table>
  <tbody>
    <For each={rows()}>{(row) => <Row row={row} />}</For>
  </tbody>
</table>
```

### FRAME_MARKER_CORRUPTED

barq does not raise this code. A barq frame is a `<barq-frame>` element, and
only its slots are delimited by `<!--s:N-->` and `<!--/s:N-->` comments. A slot
whose opening comment has no matching close among its siblings is left unfilled
without a report. The causes are markup the HTML parser restructures (see
`INVALID_HTML_NESTING` and `BARQ026`) or a layer between server and browser
that strips HTML comments, which on a hydrated page also shows as
`HYDRATION_MISMATCH` with kind `range`. Fix the nesting, and stop the CDN or
minifier from rewriting the HTML.

### DYNAMIC_ASYNC_COMPONENT

barq does not raise this code. A `dynamic()` source is typed to return a tag or
a component synchronously. If it returns a promise anyway, the server does not
wait for it: the `<Loading>` around it ships its fallback and the browser
renders the component. Do the async work upstream and choose synchronously,
and for a component that loads later use `lazy`, which a `<Loading>` waits for
on the server too:

```tsx
// before
const View = dynamic(async () => (await import("./Editor.tsx")).Editor);

// after
const Editor = lazy(() => import("./Editor.tsx"), { export: "Editor" });
const View = dynamic(() => (editing() ? Editor : Viewer));
```

### ASYNC_MEMO_ELEMENT

barq does not raise this code. An async memo's value is seeded to the browser
as data, and markup cannot be encoded, so a memo that resolves to JSX fails the
seed with `Seroval Error (step: 1)`: `renderPage` rejects, and a stream reports
`SSR_RENDER_ERROR_CONTAINED` and stops before its scripts, so the page never
hydrates. Return data from the async memo and render the JSX from it:

```tsx
// before
const card = createMemo(async () => {
  const user = await fetchUser(id());
  return <Card user={user} />;
});

// after
const user = createMemo(() => fetchUser(id()));
<Loading fallback={<p>loading</p>}>
  <Card user={user()} />
</Loading>;
```

## Verifying a fix

Run the page or the test again in a development build: the code no longer
prints, and `DEV.diagnostics.capture()` collects nothing for it.

```ts
import { DEV, flush } from "@barqjs/core";

const capture = DEV.diagnostics.capture();
runTheScenario();
flush();
const remaining = capture.stop().filter((event) => event.code === "SILENT_HOLD");
```

For the performance and responsiveness codes, capture the run as an artifact
with `@barqjs/diagnostics` and compare before and after: see
`node_modules/@barqjs/diagnostics/skills/agent-loops/SKILL.md`.
