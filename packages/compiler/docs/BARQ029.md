# BARQ029: Two renderers claim the same intrinsic tag

**Level:** warning · [all codes](README.md)

## Message

> `<mesh>` is claimed by two renderers, `@acme/scene/renderer` and `@acme/other/renderer`, so
> it compiles for the document. Claim it in your own `intrinsics` configuration, which wins over
> what a package declares.

For a tag that no entry names and the document does not have, the message says that two
renderers claim every such tag (both declare `claimUnknown: true`).

## Failing example

```tsx
// two installed packages both list "mesh" under barq.intrinsics
export const Box = () => <mesh />;
```

## Fixed example

```tsx
// the application's own intrinsics entry gives "mesh" to one of them
export const Box = () => <mesh />;
```

## Why this rule exists

A tree of intrinsic elements written outside every boundary builds through the renderer that
claims its root tag, so `function Box() { return <mesh /> }` is a scene object wherever it is
declared. When two renderers claim the tag, nothing in the source says which one the author
meant, and picking either would build the tree on a host the author may not render it into.
The tree compiles for the document instead, as it would with no renderer installed, and the
warning names both claimants.

An `intrinsics` entry in the application's own configuration takes the tag from every package
that declares it:

```ts
barq({
  compiler: {
    intrinsics: [{ tags: ["mesh"], target: "universal", moduleSource: "@acme/scene/renderer" }],
  },
});
```

## Silencing one line

```tsx
// barq-ignore-next-line BARQ029 (this tree is only rendered in the document)
export const Box = () => <mesh />;
```

The reason in parentheses is required and has to be at least 10 characters. Silencing the code
does not choose a renderer: the tree still compiles for the document. To change the level for
the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
