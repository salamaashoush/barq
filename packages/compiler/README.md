# @barqjs/compiler

The barq JSX compiler, written in Rust on [oxc](https://oxc.rs) and loaded into
Node or Bun through napi-rs. It turns JSX into templates that are cloned once
and runtime calls from `@barqjs/web` that update only the holes that read a
signal, with the reactive calls from `@barqjs/core`. With `ssr: true` the same
analysis emits a string renderer that imports `@barqjs/server` instead, and
with `target: "universal"` it builds every element through a custom renderer
made with `@barqjs/universal`.

It also generates the file route table, splits route and middleware modules into
their client and server halves, compiles `@barqjs/css` blocks to a stylesheet,
and reports mistakes before the code runs: 26 [diagnostics](./docs/README.md),
each with a stable `BARQ` code, a page that shows the fix, and a required reason
to silence it.

## Install

Applications do not call this package. `@barqjs/vite` depends on it and runs it
on every `.jsx` and `.tsx` file:

```bash
bun add -d @barqjs/vite
```

```ts
import barq from "@barqjs/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [barq()],
});
```

There is one pipeline. If the native binary cannot be loaded, the plugin throws
rather than compiling the file some other way.

The binary is built per platform. The targets are listed under `napi.targets` in
`package.json`: Linux x64 and arm64 (glibc), macOS x64 and arm64, and Windows
x64 and arm64.

## Coming from Solid

The output has the shape Solid 2.0's `@solidjs/compiler` produces: a static
template per element tree, cloned, then one binding per dynamic hole, with
delegated events.

Where it differs:

- A prop crosses a component boundary as a Cell, a function the component calls:
  `props.name()`. Solid passes a getter on the props object and the component
  reads `props.name`.
- What is reactive is decided from the binding a name resolves to (oxc's
  `SymbolId`), never from how it is spelled. `createSignal` imported under
  another name is still a signal.
- The checks run in the compiler, one file at a time, and print a code with a
  docs page. See [docs/README.md](./docs/README.md).

## Writing code the compiler understands

Call an accessor where you want its value. The compiler wraps each JSX
expression in its own tracked scope, so `{count() * 2}` updates when `count`
changes. Code outside JSX is left as written, so a derived value there is a
function or a memo:

```tsx
import { createMemo, createSignal } from "@barqjs/core";

const [count, setCount] = createSignal(0);
const doubled = createMemo(() => count() * 2);

export const Counter = () => (
  <button type="button" onClick={() => setCount(count() + 1)}>
    {count()} doubled is {doubled()}
  </button>
);
```

Passing the accessor itself, `{count}`, is also live. Using it as a value,
`count * 2` or `` `${count}` ``, is a bug that
[BARQ001](./docs/BARQ001.md) reports.

## API

```ts
import { transform } from "@barqjs/compiler";

const { code, map, warnings, diagnostics } = transform(source, {
  filename: "App.tsx",
  sourcemap: true,
  dev: false,
  ssr: false,
});
```

`transform(code, options)` compiles one module. The options a caller sets:

- `filename`: used in diagnostics and source maps. The accessor and props checks
  run only when it ends in `.jsx` or `.tsx`.
- `sourcemap`: return `map`. Without it `map` is absent, not `null`.
- `ssr`: emit the string backend for the server. In Vite this is per module, so
  the plugin reads it from the transform hook rather than from its own options.
- `hydratable`: emit the markers a server-rendered page hydrates against. Off by
  default, so a page that is never hydrated does not pay for them.
- `dev`: the development build. Turns on the dev-only diagnostics, template
  labels and source locations.
- `diagnostics`: run the source-level checks. Defaults to `dev`; set it in CI to
  run them on a production build.
- `checks`, `defaultCategory`, `strictCss`: change the level of a code. See
  [docs/README.md](./docs/README.md#changing-a-level-for-the-whole-project).
- `routes`: the route patterns [BARQ013](./docs/BARQ013.md) checks `<Link to>`
  against. Absent turns the check off.
- `moduleSource`: where the emitted code imports the renderer from. Defaults
  to `@barqjs/web`.
- `coreSource`: where the emitted code imports the reactive calls (`props`,
  `cell`, `block`, `bindEffect`, `createComponent`) and the components an
  author imports from. Defaults to `@barqjs/core`.
- `target`: `"dom"` (the default) or `"universal"`. A universal module creates
  each node with `createElement` or `createTextNode`, places it with
  `insertNode`, and writes every attribute, property and event with one
  `setProp` call under the name the author wrote, all imported from
  `moduleSource`, which is then a module that exports what
  `@barqjs/universal`'s `createRenderer` returned. `bind:` and a form `action`
  are errors there ([BARQ027](./docs/BARQ027.md)), as are `ssr`, `hydratable`
  and `interp` ([BARQ028](./docs/BARQ028.md)).
- `renderers`: per-file renderer selection, a list of
  `{ include, target, moduleSource }`. A file whose name matches one of an
  entry's `include` globs compiles for that entry's `target` (`"universal"` by
  default) and `moduleSource`, and the first entry that matches wins. A file
  an entry gives to the universal target is compiled without `ssr` and
  `hydratable`, which keep describing the build's document files.
- `boundaries`: components whose children compile for another renderer than
  the JSX around them, a list of `{ source, name, target, moduleSource }`. An
  element whose tag resolves to the import `name` from `source` (a named
  import, a renamed one, or a member of a namespace import, and never a local
  binding of the same name) compiles for the module's renderer, and its JSX
  children and `children` prop compile for the entry's `target` and
  `moduleSource`. Boundaries nest. The children stay lazy, so the component
  creates them where it reads `props.children`, inside its own renderer's
  root. A module that writes no boundary compiles exactly as it would without
  the option. Under `ssr` the boundary renders and a universal boundary's
  children are left out of the server module; `@barqjs/vite` also reads
  `"barq": { "boundaries": [...] }` from a dependency's `package.json`.
  [DESIGN.md](./DESIGN.md#8-renderer-boundaries-and-claimed-intrinsics) has the emission.
- `intrinsics`: tags a renderer claims, a list of
  `{ tags, claimUnknown, target, moduleSource }`. Outside every boundary, a
  tree of intrinsic elements whose root tag one entry claims, and the
  document does not have, compiles for that entry's renderer wherever it is
  written, so `function Box() { return <mesh /> }` is a scene object in a page
  file. A tag the document also has (`line`, `audio`, `path`, `source`) is the
  renderer's only when the tree under it holds a tag that renderer alone
  claims, and never under an `<svg>`. With `claimUnknown`, an entry also takes
  any lowercase tag without a hyphen that no entry names and the document does
  not have. A tag with a hyphen is always the document's. JSX written inside a
  claimed tree follows it, and so does a component such as `<Show>` whose JSX
  all went to one renderer. Two entries claiming one tag is
  [BARQ029](./docs/BARQ029.md), and the tree stays the document's.
- `templates`: `false` emits `element()` calls instead of cloned templates.
- `optimize`: `0` turns every optimisation off. The output is larger and slower
  and never behaves differently.

The rest (`env`, `root`, `serverFns`, the other `*Source` names, `cssExports`,
`cssImports`, `ownership`, `addresses`, `interp`, `passes`) are set by
`@barqjs/vite` and documented in `index.d.ts`. An option the compiler does not
know throws, and the message names the closest one, so `sourceMap` is reported
as a misspelling of `sourcemap`.

The result:

- `code`: the compiled module.
- `map`: the source map, when asked for.
- `diagnostics`: structured records with `code`, `severity`, `message`, the
  span (`line`, `column`, `endLine`, `endColumn`, `pos`, `end`) and `docs`, a
  link to the page for the code.
- `warnings`: the same set as `file:line:col: CODE level: message` strings.
- `labels`, `css` and the side outputs the options above ask for.

A syntax error throws instead of returning.

The package also exports the pieces `@barqjs/vite` builds on:

- `diagnosticCodes()`: every code, with its level, summary and docs URL.
- `routeTree(root, dir, outFile?, writeIds?)`: scans a routes directory and
  returns the source of `routeTree.gen.ts`, the route patterns and any warnings.
- `routeSplit(source, filename, specifier, forClient?, splitComponents?)`: splits
  a route module so its components load lazily, and deletes its `server`
  handlers from the client half.
- `middlewareSplit(source, filename, startSource?)`: the client half of a module
  that declares middleware, with `.server(...)` removed.
- `orderCss(css, layers?)` and `layerOrder(sheets)`: order the atoms and cascade
  layers of a bundled stylesheet.

### Deeply nested input

oxc's parser and code generator recurse without a depth limit. `transform()`
estimates the nesting depth with a byte scan and compiles a file that could
overflow the caller's stack on a thread sized for it. A file nested past the
limit fails with an error that names the depth, instead of crashing the process.
Ordinary files never leave the calling thread. The per-level stack costs the
sizing uses are measured and recorded in `src/compile.rs`.

### Bundling

The generated `index.js` holds one guarded `require()` per platform napi-rs
knows. `@barqjs/vite` loads it with `createRequire`, so an application bundle
never includes it. A tool that bundles code importing this package directly
should mark it external.

## Building from source

A Rust toolchain is required. `@napi-rs/cli` needs Node on `PATH`
(`^20.17.0 || ^22.13.0 || >= 23.5.0`) even when it is run through Bun.

```sh
bun run build         # napi build --platform --release
bun run build:debug   # napi build --platform, much faster, same file names
bun test              # the differential harness, needs the binding built first
bun run test          # cargo fmt --check, clippy, cargo test, then bun test
```

`index.js`, `index.d.ts` and `barq-compiler.<triple>.node` are build output and
are not committed. Until one of the build commands has run, the test harness
fails with a message saying so, and `@barqjs/vite` throws naming the command.

The fixture corpus the harness runs is described in
[fixtures/README.md](./fixtures/README.md).
