# BARQ028: A module compiled for a custom renderer is also asked for `ssr`, `hydratable` or `interp`

**Level:** error · [all codes](README.md)

## Message

> `ssr: true` was asked for together with `target: "universal"`, and the string backend
> renders the document's markup, which a custom host does not have. It was turned off for
> this module. Remove it from this module's options, or give the files of the custom
> renderer their own entry in `renderers`, which leaves `ssr` to the rest of the build.

The same message names `hydratable` (hydration claims the document's server markup) or
`interp` (the reference backend walks the document).

## Failing example

```tsx
// compiled with { target: "universal", ssr: true }
export const Scene = (props) => <box>{props.label()}</box>;
```

## Fixed example

```tsx
// compiled with { target: "universal" }
export const Scene = (props) => <box>{props.label()}</box>;
```

## Why this rule exists

`ssr`, `hydratable` and `interp` each choose how a module reaches the document: as a string
of markup, as a client that claims that markup, or through the reference backend's walk. A
module compiled for a custom renderer reaches its own host instead, so asking for both is a
configuration that cannot mean anything. The compiler turns the document option off and
fails the build, so the mistake is seen rather than compiled into a bundle that ignores
half of what it was told.

An app that renders the document on the server and a custom host in the browser keeps
`ssr` and `hydratable` for its document files and gives the others a `renderers` entry,
which is not reported: the build's document options describe its document files, and the
files an entry gives to a custom renderer are not among them.

```ts
barq({
  ssr: true,
  compiler: {
    renderers: [{ include: ["src/scene/**"], target: "universal", moduleSource: "/src/renderer.ts" }],
  },
});
```

## Turning it off

This code is about the options a module is compiled with rather than a line of it, so there
is no line to silence. To change the level for the whole project, see
[the index](README.md#changing-a-level-for-the-whole-project).
