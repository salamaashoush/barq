# @barqjs/diagram

Whiteboard diagrams for barq, built the way [Excalidraw](https://excalidraw.com)
is built and reading and writing its files. The element model, geometry and
shape generation are Excalidraw's own framework-free packages
(`@excalidraw/element`, `@excalidraw/math`, `@excalidraw/common`), used as
they are. This package carries the rest of what Excalidraw's React package
does around them, without React: restoring and serializing scenes, the canvas
and SVG renderers, export, fonts, a read-only viewer that renders on the
server, and an editor.

An `.excalidraw` file, or a PNG or SVG exported with its scene, opens here
unchanged, and what this package writes opens in Excalidraw.

## Install

```bash
bun add @barqjs/diagram
bun add -d @barqjs/vite
```

`@barqjs/core`, `@barqjs/web`, `@barqjs/server` and `@barqjs/primitives` are
peer dependencies. The package ships its TypeScript source under the `barq`
export condition, and `@barqjs/vite` compiles it for the DOM or the server
with the rest of the application. `@excalidraw/mermaid-to-excalidraw` is an
optional peer dependency, needed only by `@barqjs/diagram/mermaid`.

## Example

A saved diagram on a page: loaded from its file, shown read-only, with a PNG
for a document beside it.

```tsx
import { DiagramViewer, type DiagramScene, exportToBlob, loadFromBlob } from "@barqjs/diagram";

const scene: DiagramScene = await loadFromBlob(file, null, null);

<DiagramViewer scene={scene} label="Release flow" height={360} />;

const png = await exportToBlob({
  elements: scene.elements,
  appState: { ...scene.appState, exportBackground: false, exportScale: 2 },
  files: scene.files,
  mimeType: "image/png",
  exportPadding: 24,
});
```

## The viewer

`DiagramViewer` draws the scene on a canvas and lets a reader move around it:

- drag to pan; the wheel pans on a trackpad, and with ctrl or cmd (how a
  trackpad pinch arrives) it zooms around the pointer, as in Excalidraw;
- a two-finger pinch zooms and pans together;
- the arrow keys pan, by a whole viewport with shift; PageUp and PageDown
  page; `+` and `-` zoom; ctrl+`0` resets to 100%; shift+`1` fits again.

It opens fitted to the content (`fit`, `padding`), and refits as it resizes
until the reader navigates. Without a `height` it takes the content's aspect
ratio at the width it is given. It is a focusable region named by `label`
(the scene's name by default) and described by the diagram's text in reading
order, or by `description`.

The theme is `theme` when given; otherwise it follows the `colorScheme()`
above it, which is what `@barqjs/arc`'s `ArcProvider` sets up, and is light
without one. Dark is Excalidraw's dark mode: every color is filtered, the
background included.

`api` receives `getSceneElements()`, `getAppState()` and `getFiles()` under
Excalidraw's names, with `scrollToContent()`, `zoomIn()`, `zoomOut()`,
`resetZoom()` and `refresh()`.

## The editor

`DiagramEditor` is Excalidraw's editor: draw, select, move, resize, rotate,
bind arrows, group, lock, align, undo and redo, on the same element model.

```tsx
import { DiagramEditor, type DiagramEditorApi, serializeAsJSON } from "@barqjs/diagram";

let api: DiagramEditorApi | undefined;

<DiagramEditor
  initialData={scene}
  label="Release plan"
  height={600}
  api={(editor) => (api = editor)}
  onChange={(elements, appState, files) =>
    save(serializeAsJSON(elements, appState, files, "local"))
  }
/>;
```

`api` is Excalidraw's `excalidrawAPI` under its names: `updateScene`,
`getSceneElements`, `getSceneElementsIncludingDeleted`, `getAppState`,
`getFiles`, `setActiveTool`, `scrollToContent`, `resetScene`, `refresh`,
`history.clear` and `onChange`. `updateScene`'s `captureUpdate` says how a
change is undone, as in Excalidraw: `"IMMEDIATELY"`, `"EVENTUALLY"` or
`"NEVER"`. `theme` (or the `colorScheme()` above), `viewModeEnabled` and
`gridModeEnabled` follow their props. On the server it renders the empty
region, which hydrates into the editor.

What it does, and the keys Excalidraw gives each:

- tools: selection `V` or `1`, rectangle `R` or `2`, diamond `D` or `3`,
  ellipse `O` or `4`, arrow `A` or `5` (again to change its kind), line `L`
  or `6`, freedraw `P`, `X` or `7`, hand `H`; `Q` keeps the tool after
  drawing; shift draws equal sides and alt draws from the centre;
- lines and arrows are drawn by dragging, or click by click and ended with
  Enter or Escape; a line closed on its first point becomes a polygon; Enter
  (Ctrl+Enter on an arrow) or a double-click opens the line editor, where
  points drag, midpoints add points and Delete removes them;
- arrows bind to the shapes they start and end on, and follow them;
- selection by click, shift-click, a box, and alt-click through overlapping
  elements; a click selects a whole group, a double-click enters it and
  Escape leaves it; Ctrl+A selects everything;
- the selection moves by dragging (shift keeps one axis, alt duplicates) and
  by the arrow keys (shift for five pixels, a grid cell on the grid); its
  handles resize (shift keeps the ratio, alt resizes from the centre) and
  rotate (shift in steps of 15°);
- Delete, Ctrl+D duplicates, Ctrl+`[` and `]` restack (with shift, or alt on
  macOS, to the back and front), Ctrl+G groups and Ctrl+Shift+G ungroups,
  Ctrl+Shift+L locks (and unlocks everything with nothing selected),
  Ctrl+Shift with an arrow aligns, Alt+H and Alt+V distribute;
- Ctrl+Z undoes, Ctrl+Shift+Z or Ctrl+Y redoes;
- space-drag, the middle button and the hand tool pan; ctrl-wheel and a
  pinch zoom; Ctrl+`=`, `-` and `0` zoom, Shift+1 fits; Ctrl+`'` shows the
  grid, which elements snap to;
- Alt+S snaps to objects instead: a drag, a resize or a new shape lands on
  the corners, centres and equal gaps of the elements around it, with the
  lines that show it; Ctrl turns it off for one gesture, or on when it is
  off.

Ctrl is Cmd on macOS.

### Accessibility

The editor is a focusable `application` region with a name (`label`) and a
description of its keys. A polite live region announces the active tool, the
selection and each action. Every action has a key, and three keys Excalidraw
does not have make it reachable without a pointer: Enter with a drawing tool
draws its shape in the middle of the viewport; Tab and Shift+Tab move the
selection through the elements, a group as one stop, and past the last let
focus leave the editor; Alt+Shift+H and Alt+Shift+V centre the selection.
With nothing selected the arrow keys pan.

### Without barq

`@barqjs/diagram/editor` exports the editor itself, `DiagramEditor`, which
imports nothing of barq: give it a focusable container and three canvases
(the scene, the element being drawn, and the selection on top) and it is the
same editor, with `api`, `state`, `onAnnounce` and `onTextEditRequest`. Its
state changes at once; the store, history and `onChange` follow once per
input event, and the canvases draw once a frame, so a drag mutates the
dragged elements and redraws without anything reactive in between.

Text editing is left to the host: a double-click, or Enter on text or a
shape, calls `onTextEditRequest` with the scene point and the shape a text
editor should open on.

## Server rendering

On the server the viewer renders its region, its description and `snapshot`:
the scene as SVG markup, which `exportToSvgString` produces in any process,
one without a DOM included. A loader computes it once with the scene:

```ts
import { exportToSvgString } from "@barqjs/diagram";

const snapshot = await exportToSvgString(scene, { theme: "light" });
```

The page then shows the diagram before any script runs. In the browser the
region hydrates without a mismatch, the canvas draws under the snapshot, and
the snapshot goes once the canvas has the scene's fonts and images. Without
a snapshot the server sends an empty box of the content's proportions, so
nothing moves when the canvas arrives.

## Data

The functions Excalidraw exports for its file format, under the same names:

- `loadFromBlob(blob, localAppState, localElements)` opens a `.excalidraw`
  file, or a PNG or SVG with an embedded scene;
  `loadSceneOrLibraryFromBlob` tells a scene from a library and
  `loadLibraryFromBlob` opens a library;
- `restore`, `restoreElements`, `restoreAppState` and `restoreLibraryItems`
  validate and migrate imported data, older versions included;
- `serializeAsJSON(elements, appState, files, "local" | "database")` and
  `serializeLibraryAsJSON` write them;
- `convertToExcalidrawElements` builds elements from skeletons (`{ type,
  x, y, label }`), measuring their text;
- `getDefaultAppState`, `cleanAppStateForExport` and their siblings shape the
  app state.

## Export

`exportToCanvas`, `exportToBlob` and `exportToSvg` take Excalidraw's options:
`elements`, `appState` (whose `exportBackground`, `exportWithDarkMode`,
`exportScale`, `exportEmbedScene` and `viewBackgroundColor` set the
rendering), `files`, `exportPadding`, `maxWidthOrHeight` and
`exportingFrame`. With `exportEmbedScene` the PNG or SVG carries the scene and
opens again with `loadFromBlob`.

`exportScene({ type, data, config })` is the same pipeline with an explicit
config: `"canvas"`, `"png"`, `"jpeg"` or `"svg"`, sizes by `width`, `height`
or `maxWidthOrHeight`, a region by `x` and `y`, and `config.environment` to
export where there is no browser (`createSvgDocument()` is a document an SVG
can be built in on a server).

## Fonts

Excalidraw's fonts (Excalifont, Virgil, Nunito, Lilita One, Comic Shanns,
Cascadia, Liberation Sans, and Xiaolai for Chinese, Japanese and Korean) are
fetched by unicode range, only for the characters a scene uses. They load
from Excalidraw's published package on a public CDN by default; an app that
serves them itself copies that package's `dist/prod/fonts` and calls
`setFontAssetPath("/excalidraw/")` (or sets `window.EXCALIDRAW_ASSET_PATH`,
which is read the same way). An SVG export inlines the faces it needs.

Right-to-left text, Arabic and Hebrew, is laid out right to left on the
canvas and in SVG. Excalidraw's fonts have no Arabic glyphs, so Arabic falls
back to the system's font unless a face is registered for it:

```ts
import { Fonts } from "@barqjs/diagram";

Fonts.register("Excalifont", {
  uri: "/fonts/arabic-hand.woff2",
  descriptors: { unicodeRange: "U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFF" },
});
```

The face then draws that family's Arabic on the canvas and is inlined into
exports for it.

## Mermaid

`@barqjs/diagram/mermaid` turns a Mermaid definition into scene elements
through `@excalidraw/mermaid-to-excalidraw` and `convertToExcalidrawElements`:

```ts
import { mermaidToExcalidraw } from "@barqjs/diagram/mermaid";

const { elements, files } = await mermaidToExcalidraw("flowchart LR\n  A --> B");
```

The converter parses with the document's `DOMParser`. On a server without
one it draws the diagram as a single image, which `files` holds.

## For an editor

The renderers are exported for an editor built on this package:
`renderStaticScene` and `renderInteractiveScene` (selection, handles, snap
lines, remote cursors), `Renderer` for the visible set, `SceneCanvas` for a
static layer with its image cache and fonts, and the navigation the viewer
uses (`wheelNavigation`, `keyboardNavigation`, `PointerNavigation`,
`zoomAt`, `fitToContent`).

## Coming from `@excalidraw/excalidraw`

- `loadFromBlob`, `serializeAsJSON`, `exportToBlob`, `exportToSvg`,
  `exportToCanvas`, `restore` and `convertToExcalidrawElements` take the same
  arguments and return the same things.
- `<Excalidraw viewModeEnabled>` for showing a scene is `<DiagramViewer>`,
  `<Excalidraw>` for editing one is `<DiagramEditor>`, and `excalidrawAPI` is
  `api`.
- `window.EXCALIDRAW_ASSET_PATH` works as before; `setFontAssetPath` says it
  without a global.

## License

MIT. Portions are ported from Excalidraw, MIT, Copyright (c) 2020 Excalidraw.
