---
name: compiler-diagnostics
description: Map a barq compiler diagnostic code (BARQ001 to BARQ031) to its repair. Load when a build, the Vite dev overlay, the terminal or a transform result reports BARQ0NN at a file, line and column. Runtime [CODE] findings are in the diagnostics skill of @barqjs/core.
---

# Repairing barq code from a compiler diagnostic code

The barq compiler reports each finding with a stable code, a level (`note`,
`warning` or `error`) and a position. Find the code's `### BARQ0NN` section
below: it says what the compiler saw, the repair, and the default level. An
`error` fails the build. A `warning` or `note` builds, and the code it points
at is still wrong or slower than it could be, so repair it.

Runtime codes such as `[REACTIVE_WRITE_IN_OWNED_SCOPE]` are a different family:
see `node_modules/@barqjs/core/skills/diagnostics/SKILL.md`.

## How a code arrives

- **Terminal and build log**: one line per finding,
  `file:line:col: BARQ0NN level: message`.
- **Vite dev overlay**: a pill in the corner of the page that lists compiler
  findings with the source they are about. The `overlay` option of `barq()`
  chooses what opens it (`"error"` by default).
- **`barq check`** from `@barqjs/cli`: every file of the project with no build.
  `npx barq check --json` prints `{ summary, findings }`, each finding shaped as
  below with `skill`, the section of this file for its code. `npx barq check
  --fix` applies the repairs that are one spelling (BARQ001, BARQ002, BARQ003,
  BARQ022, BARQ023 and the renames of BARQ024) and reports what is left.
- **The compiler's `transform` result**: the `diagnostics` array, one object
  per finding, which serialises to JSON as below. `line` and `column` are
  1-based. `docs` is the code's page. `fix`, when present, is a list of
  `{ pos, end, text }` edits over the source that repair the finding.

```json
{
  "code": "BARQ001",
  "severity": "warning",
  "message": "`count` is an accessor, and here the function itself is used as the value. ...",
  "file": "src/App.tsx",
  "line": 3,
  "column": 42,
  "endLine": 3,
  "endColumn": 47,
  "docs": "https://github.com/salamaashoush/barq/blob/main/packages/compiler/docs/BARQ001.md"
}
```

A finding with no `code` is a syntax error from the parser: fix the syntax at
that position.

Each code also has a page with the full message and more examples at
`node_modules/@barqjs/compiler/docs/BARQ0NN.md`.

## When each code is reported

- `BARQ001`, `BARQ002`, `BARQ003`, `BARQ011`, `BARQ018` to `BARQ021`: when the
  `diagnostics` option is on. It is on in development builds, and
  `barq({ compiler: { diagnostics: true } })` runs them in a production build.
- `BARQ004`, `BARQ010`: development builds only.
- `BARQ012` to `BARQ017`, `BARQ022` to `BARQ031`: every build.
- `BARQ008`, `BARQ009`: every build, about suppression comments.

`BARQ005`, `BARQ006` and `BARQ007` are retired and never reported. A
suppression comment that names one of them is reported as `BARQ009`: delete the
comment.

## Setting a level

For the whole project, in `vite.config.ts`:

```ts
import barq from "@barqjs/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    barq({
      compiler: {
        checks: { BARQ004: "suppress", BARQ001: "error" },
        defaultCategory: "warning",
      },
    }),
  ],
});
```

A level is `suppress`, `note`, `warning` or `error`. An entry in `checks` wins
over `strictCss` (which makes `BARQ014` to `BARQ017` errors), which wins over
`defaultCategory` (every code), which wins over the code's own default. When
calling the compiler's `transform` directly, `checks` is a list of pairs:
`checks: [["BARQ004", "suppress"]]`.

For one line, write a comment directly above the reported line, with the code
and a reason of at least 10 characters in parentheses:

```tsx
// barq-ignore-next-line BARQ001 (the debug panel shows the source text)
const label = `${count}`;

<div>
  {/* barq-ignore-next-line BARQ001 (the debug panel shows the source text) */}
  <pre>{`${count}`}</pre>
</div>;
```

Between JSX children the comment must be the `{/* ... */}` form. Repair the
code first. Suppress only a line that is correct as written, and say why in the
reason.

## Accessors used as values

A signal's read half, a memo and a keyed `<For>` row are accessors: functions
that return the value. These three codes are about an accessor used without its
call. A prop is not an accessor: `props.count` and a destructured `count` are
values, and are never reported here.

### BARQ001

Default level: warning.

An accessor is used as a value without being called, in a string or in
arithmetic. It prints its own source text, or gives `NaN`. Call it.

```tsx
// before
<p>{`total: ${count}`}</p>

// after
<p>{`total: ${count()}`}</p>
```

`<p>{count}</p>` and `<div id={count}>` are correct and are not reported.

### BARQ002

Default level: warning.

An accessor is used as a condition (`if`, `? :`, `&&`, `!`, a loop test). A
function is always truthy, so one branch never runs. Call it.

```tsx
// before
<p>{loading ? "Loading" : "Ready"}</p>

// after
<p>{loading() ? "Loading" : "Ready"}</p>
```

### BARQ003

Default level: warning.

A property is read from the accessor instead of from its value, so the result
is `undefined` (or `0` for `.length`, which is the function's parameter count).
Call it first. An accessor has no `.value`, `.set` or `.peek`.

```tsx
// before
<p>{user.email}</p>
<p>{items.length} items</p>

// after
<p>{user().email}</p>
<p>{items().length} items</p>
```

## Lists

### BARQ004

Default level: note.

A `<For>` row reads a field of its item once, while the row is built, and the
items may be store objects. A store changes a field in place, the row is kept,
and it goes on showing the old value. The reads that are reported: a
destructured row parameter, a read in statements above the row's JSX, a read
that picks which JSX to return.

Read the field in the row's JSX, or key the list and call the row:

```tsx
// before
<For each={state.rows}>{({ name }) => <li>{name}</li>}</For>

// after
<For each={state.rows}>{(row) => <li>{row.name}</li>}</For>

// or
<For each={state.rows} keyed={(row) => row.id}>
  {(row) => <li>{row().name}</li>}
</For>
```

### BARQ011

Default level: note.

`keyed={false}` on a `<For>` whose row holds an element with state of its own
(`input`, `textarea`, `select`, `video`, `audio`, `details`, `canvas`,
`dialog`, a custom element). Rows are reused by position, so typed text, the
caret or playback stays in place when the list reorders and ends up on another
item. Remove `keyed={false}`, or key by a stable field:

```tsx
// before
<For each={todos} keyed={false}>
  {(todo) => <input value={todo().text} />}
</For>

// after
<For each={todos} keyed={(todo) => todo.id}>
  {(todo) => <input value={todo().text} />}
</For>
```

## Suppression comments

### BARQ008

Default level: warning. Stays a warning under `defaultCategory: "error"`.

A `barq-ignore-next-line` comment names a code that nothing on the next line
reports. Delete the comment, or move it directly above the line the diagnostic
points at (it covers one line, not one statement). Between JSX children write
it as `{/* barq-ignore-next-line BARQ001 (reason) */}`.

### BARQ009

Default level: warning. Stays a warning under `defaultCategory: "error"`.

A `barq-ignore-next-line` comment is malformed and silences nothing. The
message says what is missing: the code, a known code, a reason of at least 10
characters, or the closing parenthesis. Write the full form:

```tsx
// before
// barq-ignore-next-line BARQ001

// after
// barq-ignore-next-line BARQ001 (the debug panel shows the source text)
```

A comment naming the retired `BARQ005`, `BARQ006` or `BARQ007` is reported
here too: delete it.

## Components and props

### BARQ010

Default level: warning.

JSX is passed to a prop that the component (declared in the same file) reads as
a value: in an attribute, an event handler, a `ref`, or the `each`, `when` or
`mount` of a flow component. JSX passed as a prop can only be rendered as a
child, and reading it as a value throws `ScopeMissingError` at run time.

Pass a value, or change the component to render the prop as a child:

```tsx
// before
function Card(props) {
  return <section title={props.heading}>{props.children}</section>;
}
<Card heading={<b>Today</b>}>Hello</Card>;

// after: pass a value
<Card heading="Today">Hello</Card>;

// or: render the prop as a child
function Card(props) {
  return (
    <section>
      <h2>{props.heading}</h2>
      {props.children}
    </section>
  );
}
```

### BARQ018

Default level: warning.

A component chooses what to return (`if`, `switch`, an early `return`, a
ternary as the whole return value) from a signal, memo, store or changing prop
that it reads while its body runs. The body runs once, so the page keeps what
it showed first. Make the choice inside the returned JSX:

```tsx
// before
function Greeting() {
  if (!user()) return <button onClick={() => setUser("salama")}>Sign in</button>;
  return <p>Hello, {user()}</p>;
}

// after
function Greeting() {
  return (
    <Show when={user()} fallback={<button onClick={() => setUser("salama")}>Sign in</button>}>
      <p>Hello, {user()}</p>
    </Show>
  );
}
```

For a prop, wrap the choice in a fragment so it is a JSX expression:

```tsx
// before
function Status(props) {
  return props.online ? <b>online</b> : <i>offline</i>;
}

// after
function Status(props) {
  return <>{props.online ? <b>online</b> : <i>offline</i>}</>;
}
```

A value that is read once on purpose says so: `if (!untrack(user)) ...`.

### BARQ019

Default level: warning.

A setter (`createSignal`, `createStore`, `createOptimistic`,
`createOptimisticStore`) or an `action` is called while a component body, a
JSX expression, a memo or the first function of an effect runs. Development
builds throw `REACTIVE_WRITE_IN_OWNED_SCOPE` at that call. Derive the value, or
write from an event handler, `onSettled`, or the second function of
`createEffect`.

```tsx
// before
function Counter() {
  const [count, setCount] = createSignal(0);
  setCount(1);
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>;
}

// after
function Counter() {
  const [count, setCount] = createSignal(1);
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>;
}
```

```tsx
// before
const sync = createMemo(() => setTotal(price() * 2));

// after
const total = createMemo(() => price() * 2);
```

```tsx
// a write that follows a change
createEffect(
  () => price(),
  (value) => {
    setHistory((list) => [...list, value]);
  },
);
```

### BARQ020

Default level: warning.

A store is destructured in a component body, so each name holds the value its
property had when the body ran and never updates. Read the property where it
is used.

```tsx
// before
function Badge() {
  const { count, owner } = cart;
  return (
    <p>
      {owner}: {count}
    </p>
  );
}

// after
function Badge() {
  return (
    <p>
      {cart.owner}: {cart.count}
    </p>
  );
}
```

Destructuring props is different and is supported: `const { title } = props`
stays live.

### BARQ021

Default level: warning.

An async function passed to `createMemo`, `createProjection`, the function
forms of `createSignal` and `createStore`, or the first function of
`createEffect` reads a signal, memo, store or prop after its first `await`.
That read is not tracked, so the computation does not run again when it
changes. Read it before the first `await` and keep it in a local.

```tsx
// before
const results = createMemo(async () => {
  const response = await fetch("https://example.com/items");
  const items = await response.json();
  return items.filter((item) => item.tag === query());
});

// after
const results = createMemo(async () => {
  const tag = query();
  const response = await fetch("https://example.com/items");
  const items = await response.json();
  return items.filter((item) => item.tag === tag);
});
```

### BARQ030

Default level: error.

A prop is assigned (`=`, `+=`, `++`) through `props.name`, a destructured name,
or a member of what `omit(props, ...)` returns. Props are read-only: the parent
owns the value. Ask for the change through a function prop, or keep a signal of
your own.

```tsx
// before
function Counter(props: { count: number }) {
  return (
    <button
      onClick={() => {
        props.count = props.count + 1;
      }}
    >
      {props.count}
    </button>
  );
}

// after
function Counter(props: { count: number; onChange: (next: number) => void }) {
  return <button onClick={() => props.onChange(props.count + 1)}>{props.count}</button>;
}
```

### BARQ031

Default level: error.

A props destructuring pattern has a shape that cannot stay reactive: a computed
key (`{ [key]: value }`), a default inside a nested pattern
(`{ user: { name = "guest" } }`), or a rest element inside a nested pattern
(`{ user: { id, ...others } }`). Destructure one level and read the rest where
it is used.

```tsx
// before
function Card({ user: { name = "guest" } }: { user: { name?: string } }) {
  return <p>{name}</p>;
}

// after
function Card({ user }: { user: { name?: string } }) {
  return <p>{user.name ?? "guest"}</p>;
}
```

One level (names, renames, defaults, a rest element) is always supported, and
so is a nested pattern with none of the three shapes.

## Server functions and routes

### BARQ012

Default level: error.

A module exports a server function (`createServerFn`) together with something
else, such as a component. The browser build replaces a server-function module
with request stubs, so it cannot keep any other export. Move the server
functions into a file that exports nothing else (types are allowed) and import
them.

```tsx
// todos.server.ts: every export is a server function
import { createServerFn } from "@barqjs/start";

export const saveTodo = createServerFn({ method: "POST" }).handler(async () => {
  return { saved: true };
});
```

```tsx
// TodoList.tsx
import { saveTodo } from "./todos.server.ts";

export function TodoList() {
  return <button onClick={() => saveTodo()}>Save</button>;
}
```

### BARQ013

Default level: warning.

A `<Link to>` or `<NavLink to>` from `@barqjs/router` has a literal, absolute
path that matches none of the project's routes, so following it shows the
not-found page. Correct the path, or add the route file. The route pattern
itself matches too, with `params`:

```tsx
// before, with routes "/", "/users" and "/users/$id"
<Link to="/user/7">Profile</Link>

// after
<Link to="/users/7">Profile</Link>

// or
<Link to="/users/$id" params={{ id: "7" }}>
  Profile
</Link>
```

## Styles (`@barqjs/css`)

### BARQ014

Default level: error.

A `css`, `keyframes` or `globalCss` block is not valid CSS. The message names
the problem: Sass or Less syntax, `@import`, `@charset` or `@namespace` outside
`globalCss`, a declaration at the top level of `globalCss` with no selector, or
an `&` with no parent selector. Write plain CSS.

```tsx
// before
const card = css`
  $brand: #3b82f6;
  color: $brand;
`;

// after
const card = css`
  --brand: #3b82f6;
  color: var(--brand);
`;
```

### BARQ015

Default level: note. An error under `strictCss: true`.

A `css` block interpolates a value known only at run time, so its CSS is built
in the browser instead of at build time. Write a custom property in the block
and set its value on the element.

```tsx
// before
const panel = (background: string) => css`
  padding: 12px;
  background: ${background};
`;

// after
const panel = css`
  padding: 12px;
  background: var(--panel-bg);
`;

function Panel(props) {
  return <div class={panel} style={{ "--panel-bg": props.background }} />;
}
```

### BARQ016

Default level: note. An error under `strictCss: true`.

An `atoms` call has more than one conditional argument, and the compiler
compiles one, so the call runs in the browser. Merge the conditions into one
object, or nest the calls:

```tsx
// before
atoms({ color: "red" }, active && { color: "blue" }, wide && { padding: 8 });

// after
atoms(atoms({ color: "red" }, active && { color: "blue" }), wide && { padding: 8 });
```

### BARQ017

Default level: note. An error under `strictCss: true`.

A `@barqjs/css` call (`atoms`, `create`, `defineVars`, `createTheme`,
`dynamic`) has a value, key or nested object the compiler cannot read in this
file: an import, a function call, a spread, a parameter. The call runs in the
browser. Write literals or a `const` declared in the same module. For a value
that changes, use `var(--name)` and set it through `style`, or a `dynamic`
group.

```tsx
// before
import { theme } from "./theme.ts";
const card = atoms({ color: theme.brand });

// after
const BRAND = "#3b82f6";
const card = atoms({ color: BRAND });
```

## Solid 1.x spellings

These still parse, would build, and would misbehave at run time, so they are
errors.

### BARQ022

Default level: error.

A context is rendered through `.Provider`. A context is its own provider.

```tsx
// before
<Theme.Provider value="dark">{props.children}</Theme.Provider>

// after
<Theme value="dark">{props.children}</Theme>
```

### BARQ023

Default level: error.

`classList` is written on an element, where it is an ordinary attribute and
would be written as `[object Object]`. Pass the map to `class`, which takes a
string, a map of names to whether each applies, or a list of both.

```tsx
// before
<div class="card" classList={{ active: active() }} />

// after
<div class={["card", { active: active() }]} />
```

### BARQ024

Default level: error.

An attribute uses a removed namespace prefix. Replace it by prefix:

- `on:x`: `onX={handler}`, or `addEventListener` in a `ref` for a hyphenated
  event name or listener options.
- `capture:x`, `oncapture:x`: `onXCapture={handler}`.
- `attr:x`: `x={value}`.
- `bool:x`: `x={on()}`, where `true` adds the attribute and `false` removes it.
- `style:x`: a key of the `style` object.
- `class:x`: a key of the `class` map.
- `use:x`: `ref={x(options)}`, and `ref={[x(options), y]}` for several.

```tsx
// before
<input on:input={props.onInput} />

// after
<input onInput={props.onInput} />
```

`prop:` and `bind:` keep their meaning and are not reported.

### BARQ025

Default level: error.

`<Dynamic component={...}>` is rendered. barq has the `dynamic` factory from
`@barqjs/web` instead. Hoist one to the component body (or to the module when
the choice reads only module state) and render it with the other props.

```tsx
// before
import { Dynamic } from "@barqjs/web";
const Field = (props) => (
  <Dynamic component={props.editing ? Editor : Viewer} value={props.value} />
);

// after
import { dynamic } from "@barqjs/web";
const Field = (props) => {
  const Chosen = dynamic(() => (props.editing ? Editor : Viewer));
  return <Chosen value={props.value} />;
};
```

The source may answer with a tag name (`dynamic(() => "h" + props.level)`), or
with `null`, `undefined` or `false` to render nothing.

## Markup

### BARQ026

Default level: error.

The JSX nests elements in a way the browser's HTML parser rebuilds, so a
server-rendered page hydrates against a different tree (a
`HYDRATION_MISMATCH` and a full re-render). The message names the pair:

- a block element such as `<div>` inside a `<p>`;
- a table part outside its parent (`<tr>` directly in `<table>`, `<td>` in a
  `<div>`), or a non-table element inside a `<tr>`;
- an element that `<select>`, `<optgroup>` or `<option>` does not take;
- a second `<a>`, `<button>`, `<form>`, `<li>`, `<dd>` or `<dt>` inside an open
  one;
- `<html>`, `<head>` or `<body>` inside a page.

Move the inner element out, change the outer element, or write the wrapper the
parser expects (`<tbody>` around rows).

```tsx
// before
<p>
  Your order shipped.
  <div class="details">{props.tracking}</div>
</p>

// after
<div>
  <p>Your order shipped.</p>
  <div class="details">{props.tracking}</div>
</div>
```

## Custom renderers

### BARQ027

Default level: error.

A `bind:` attribute or a form `action` function is written on an element that a
custom renderer builds (`target: "universal"`). Both need a document form
control. Pass the value as a prop and write it back from the host's own event.

```tsx
// before
<input bind:value={props.text} />

// after
<input value={props.text} onChange={(next: string) => props.setText(next)} />
```

For `action`, call the function from the host's event:
`onSubmit={() => save()}`.

### BARQ028

Default level: error.

A module compiled with `target: "universal"` is also asked for `ssr`,
`hydratable` or `interp`, which describe a document. This is about the build
options, not a line of source. Remove the document option from that module's
options, or give the custom renderer's files their own `renderers` entry and
keep `ssr` for the rest:

```ts
barq({
  ssr: true,
  compiler: {
    renderers: [
      { include: ["src/scene/**"], target: "universal", moduleSource: "/src/renderer.ts" },
    ],
  },
});
```

### BARQ029

Default level: warning.

Two installed renderers claim the same intrinsic tag (the message names the tag
and both packages), so the tag compiles for the document. Claim it in the
application's own configuration, which wins over what a package declares:

```ts
barq({
  compiler: {
    intrinsics: [{ tags: ["mesh"], target: "universal", moduleSource: "@acme/scene/renderer" }],
  },
});
```

## What the compiler cannot see

The checks report only what one file proves, so silence is not a guarantee:

- An accessor imported from another module is not known to be one (`BARQ001`
  to `BARQ003`), and `BARQ010` does not follow a prop into a component declared
  in another file.
- A write inside a helper function the component body calls is not seen by
  `BARQ019`. The runtime reports it as `REACTIVE_WRITE_IN_OWNED_SCOPE`.
- `BARQ018` counts a prop only where the same file renders the component with
  a value that changes.
- `BARQ030` and `BARQ031` apply to components: a function with a capitalised
  name that renders JSX, a default export that does, or a function written
  inline at a route's `component` option.
