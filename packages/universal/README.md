# @barqjs/universal

barq on a host other than the document: a terminal, a canvas scene graph, a
native view tree, or anything else that has nodes with children. You describe
the host's node operations once, and `createRenderer` returns `render` and the
runtime the compiler's universal target calls. Signals, components and control
flow come from `@barqjs/core`, which this package lists as a peer dependency.

## Install

```bash
bun add @barqjs/core @barqjs/universal
bun add -d @barqjs/vite vite
```

## A renderer

```ts
// src/renderer.ts
import { createRenderer } from "@barqjs/universal";

export const {
  render,
  createElement,
  createTextNode,
  insertNode,
  setProp,
  insert,
  spread,
  branch,
  each,
  boundary,
  island,
  reveal,
  portal,
  dynamic,
  Portal,
} = createRenderer<SceneNode>({
  createElement: (tag) => new SceneNode(tag),
  createTextNode: (value) => new SceneText(value),
  replaceText: (node, value) => ((node as SceneText).value = value),
  isTextNode: (node) => node instanceof SceneText,
  setProperty: (node, name, value) => node.set(name, value),
  insertNode: (parent, node, anchor) => parent.insertBefore(node, anchor),
  removeNode: (parent, node) => parent.removeChild(node),
  getParentNode: (node) => node.parent,
  getFirstChild: (node) => node.firstChild,
  getNextSibling: (node) => node.nextSibling,
});
```

`insertNode` has to move a node that already has a parent, as the document's
`insertBefore` does. `createSentinel` and `createContainer` are optional: the
first defaults to an empty text node, the second to `createElement("#container")`.

`attachRef(node, deliver)` is optional too. Without it a `ref` is handed the
node. A host whose node stands for an object it builds later, such as a three.js
object that needs constructor arguments a later property brings, calls
`deliver` with that object once it exists and again whenever it is replaced, and
returns a function that stops delivering.

## Compiling for it

Point the compiler at the renderer module for the files that render through it:

```ts
// vite.config.ts
import barq from "@barqjs/vite";

export default {
  plugins: [
    barq({
      compiler: {
        renderers: [
          { include: ["src/scene/**"], target: "universal", moduleSource: "/src/renderer.ts" },
        ],
      },
    }),
  ],
};
```

Every other file keeps compiling for the document, so one app can hold both.
A whole project for one host sets `compiler: { target: "universal",
moduleSource }` instead. In the files compiled for it, an element is created with
`createElement`, every attribute and event is one `setProp` call
(`onClick={handler}` is `setProp(node, "onClick", handler)`), and `<Show>`,
`<For>`, `<Loading>`, `<Errored>` and `<Portal>` run over the host. `bind:`,
a form `action`, `hydratable` and `ssr` are document concepts and are
reported as errors.

Set `"jsxImportSource": "@barqjs/universal"` for any tag and any property, or
point it at your renderer package's own `jsx-runtime` to type its tags.

## Rendering

```tsx
import { render } from "./renderer.ts";

const dispose = render(() => <App />, scene.root);
```

A tree rendered this way renders `<Show>` and its siblings through this host
even in an app that also renders into the document. `<Portal mount={node}>`
mounts into another node of the same host, and into the render root when
`mount` is left out.
