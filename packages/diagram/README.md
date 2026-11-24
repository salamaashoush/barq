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

`@barqjs/core`, `@barqjs/web`, `@barqjs/server`, `@barqjs/primitives`, and for
the editor's UI `@barqjs/ui`, `@barqjs/arc` (its `style` entry), `@barqjs/aria`,
`@barqjs/css` and `@barqjs/lucide`, are peer dependencies. The package ships its TypeScript source under the `barq`
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

`api` (or `excalidrawAPI`) is Excalidraw's imperative API under its names: `updateScene`,
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
  or `6`, freedraw `P`, `X` or `7`, text `T` or `8`, eraser `E` or `0`,
  laser pointer `K`, frame `F`, image `9` (a file picker), sticky note
  `N`, hand `H`; `Q` keeps the tool after
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
- text is written in a textarea laid over it, in its font, size, colour,
  alignment and rotation: the text tool writes where it clicks, labels an
  empty shape or arrow clicked near its middle and edits the text it clicks;
  a double-click or Enter writes in a shape (its label, centred and wrapped
  at its width, the shape growing to fit) or edits text; Escape or
  Ctrl+Enter ends it with the text selected, and so does focus moving away;
  Tab and Shift+Tab indent; free text grows to the view's width and wraps
  from there, a drag with the text tool sets the width, and Alt+W toggles
  between the two; Ctrl+Shift+`<` and `>` size it; right-to-left lines and
  an IME's composition are the browser's own;
- the eraser erases what its trail crosses when the pointer goes up (a
  group whole, a shape with its label), alt taking back what it crosses
  again, and a pen's eraser end erases too; the laser pointer draws a
  fading trail, in view mode as well; the lasso selects what it encloses
  (or crosses, in overlap mode), alt turns a box selection into one and
  Ctrl+Alt on an element starts one; the trails are drawn in an SVG over
  the canvases;
- a frame takes in what it is drawn around or dragged into (and lets go of
  what is dragged out), moves its children with it and clips them; its name
  shows above it, and a double-click on the name or Enter on the frame
  edits it; `actionWrapSelectionInFrame` frames the selection (or unwraps
  the frame it is all of), and the frame actions select or release its
  children;
- Ctrl+C, Ctrl+X and Ctrl+V copy, cut and paste elements in Excalidraw's
  clipboard format (as text too, so they paste into Excalidraw); a paste
  of text writes a text per line (one with Ctrl+Shift+V), SVG markup or an
  image file inserts an image, HTML pastes its text or its images, and a
  Mermaid definition becomes a diagram when `@excalidraw/mermaid-to-excalidraw`
  is installed; Shift+Alt+C copies the selection as a PNG, and
  `actionCopyAsSvg` and `actionCopyText` copy it as SVG markup or text;
- images come from the image tool's file picker, a paste or a drop, resized
  to at most 1440px and 4MB (`editor.images.options`), several on a grid;
  their files go in the scene's files and their decoded images in the
  image cache; Enter or a double-click on an image opens the crop editor,
  whose handles crop it and where a drag moves the image within its crop;
- a dropped `.excalidraw` file, or a PNG or SVG with a scene, replaces the
  scene (Shift adds it where it is dropped), and a library's items are
  added where they are dropped;
- a sticky note is a click (a square of the default size) or a drag
  (proportional unless Shift), and opens for writing; its text shrinks to
  fit before the note grows;
- Ctrl with an arrow key adds a flowchart node linked from the selected
  shape, another with each press, when Ctrl is let go (Escape cancels);
  Alt with an arrow key moves along the links;
- Ctrl+D and an alt-drag advance a duplicated list item's marker (`1.` to
  `2.`), an undo step of its own, and an alt-drag then edits the item's text;
- Alt+Shift+`.` and Alt+Shift+`,` switch the selected shapes' type: a
  rectangle, diamond or ellipse to the next, a line or arrow through line,
  sharp, curved and elbow arrow;
- Ctrl+Z undoes, Ctrl+Shift+Z or Ctrl+Y redoes;
- space-drag, the middle button and the hand tool pan; ctrl-wheel and a
  pinch zoom; Ctrl+`=`, `-` and `0` zoom, Shift+1 fits; Ctrl+`'` shows the
  grid, which elements snap to;
- Alt+S snaps to objects instead: a drag, a resize or a new shape lands on
  the corners, centres and equal gaps of the elements around it, with the
  lines that show it; Ctrl turns it off for one gesture, or on when it is
  off.

Ctrl is Cmd on macOS.

### The UI

`<DiagramEditor>` draws Excalidraw's UI over the canvas, on `@barqjs/ui`'s
components and arc's theme tokens, so light, dark and an app's brand all
reach it. Render it inside `<ArcProvider>` from `@barqjs/arc`, which installs
the theme and the toast stack the editor's toasts go to.

```tsx
<ArcProvider>
  <DiagramEditor
    initialData={loadFromBlob(file, null, null)}
    langCode="ar-SA"
    UIOptions={{ canvasActions: { loadScene: false, export: false, saveAsImage: false } }}
    renderTopRightUI={() => <Button onPress={share}>Share</Button>}
    excalidrawAPI={(api) => (editor = api)}
  />
</ArcProvider>
```

- the toolbar, top centre: every tool with its key, the tool lock, the hand
  and the extra tools; the sticky note can be dragged out onto the canvas;
- the properties panel, top start, for the selection or the tool about to
  draw: colours (a palette, shades, a hex code and an eye dropper), fill,
  stroke, sloppiness, edges, arrows, fonts, alignment, opacity, layers,
  align and distribute;
- the main menu, top start, whose entries an app replaces with `mainMenu`,
  a function returning `MainMenu` parts (`MainMenu.DefaultItems.Help`,
  `MainMenu.Item`, `MainMenu.Separator`, ...);
- the context menu (a right click, the menu key or Shift+F10), the command
  palette (Ctrl+/ or Ctrl+Shift+P), the stats panel (Alt+/), the minimap,
  the hints under the toolbar, the link popup (Ctrl+K), the element link
  editor and the shape switch's panel;
- zoom, undo and redo at the bottom start, help at the bottom end.

The main menu opens a scene file (Ctrl+O, asking first when it would replace
a drawing), saves to the file the scene came from (Ctrl+S, an image file
with its scene embedded included) or to a new one (Ctrl+Shift+S), and exports
an image (Ctrl+Shift+E): a PNG or SVG, with or without the background, dark,
at 1, 2 or 3 times, with the scene embedded so it opens again, or copied as a
PNG. Where the browser has the File System Access API a saved file is
written in place; elsewhere it downloads and a file input opens one. `name`
is the file's name when the scene has none, and `onExport` (Excalidraw's) lets
a save wait for the host, with a progress toast. `UIOptions.canvasActions`
turns each of these off, entries and shortcuts both.

The library button at the top end opens the sidebar on the library, and
Ctrl+F (or the main menu's entry) on the search; undocked, a press on the
canvas or Escape closes it, and where it fits beside the canvas (wider than
`UIOptions.dockedSidebarBreakpoint`, 1229px by default) its pin docks it:

- the library: the selection is added from the context menu, the command
  palette or the sidebar's own button; a click on an item places it in the
  middle of the view and a drag places it where it is dropped; the checkboxes
  (Shift for a range) select items to export, remove or publish; its menu
  opens a `.excalidrawlib`, exports the library, and resets it; the browse
  button opens Excalidraw's public library site, which installs a library
  back by URL;
- the search: the canvas's texts and frames' names that contain what is
  typed, highlighted on the canvas, the first in view focused; Enter and the
  down arrow step on, Shift+Enter and the up arrow back, and a match out of
  view or too small to read is brought into view.

`initialData.libraryItems` joins the library, `onLibraryChange` hears each
change, and the API's `updateLibrary` replaces or merges items (a list or a
library file) as Excalidraw's does. `useHandleLibrary` (or `handleLibrary`
without barq) installs the library an `#addLibrary=<url>&token=` address
names, asking first unless the token is the editor's (`api.id`, which the
browse button sends) and refusing URLs outside Excalidraw's library sites
unless `validateLibraryUrl` lets them in, and keeps the library in an
`adapter` (with a `migrationAdapter` to move it out of an older store):

```tsx
const [api, setApi] = createSignal<DiagramEditorApi | null>(null);
useHandleLibrary({
  excalidrawAPI: api,
  adapter: {
    load: () => JSON.parse(localStorage.getItem("library") ?? "null"),
    save: (data) => localStorage.setItem("library", JSON.stringify(data)),
  },
});
<DiagramEditor api={setApi} libraryReturnUrl="https://example.com/draw" />;
```

Publishing sends selected items, named, with a preview to
`libraryPublishEndpoint` as Excalidraw's form (`excalidrawLib`,
`previewImage`, `name`, `description`, `authorName`, ...), which answers
`{ url }`; without the prop nothing is published. The command palette lists
the library's named items, and the command run last first while nothing is
typed.

The UI follows the editor's size as Excalidraw's does: a phone's (narrower
than 600px, or a landscape phone's) has the main menu and the library along
the top and the toolbar along the bottom, with the selection's properties in a
bottom sheet and undo and redo beside them; a tablet's opens the properties
from a button; a desktop's is the one above. `UIOptions.getFormFactor` decides
for the host. Under a coarse pointer, or once the editor is touched, its
controls are a finger's size. A pen's first stroke turns pen mode on (the pen
draws, a finger pans) and shows its toggle beside the toolbar.

`welcomeScreen` puts Excalidraw's welcome screen over a scene that has never
had an element while the selection tool is active: `true` for a heading, a
menu (open a file, help) and hints pointing at the main menu, the toolbar and
help, or a function returning `WelcomeScreen` parts, as Excalidraw's children
are (`WelcomeScreen.Center`, `.Center.Logo`, `.Center.Heading`,
`.Center.Menu`, `.Center.MenuItem`, `.Center.MenuItemLink`,
`.Center.MenuItemHelp`, `.Center.MenuItemLoadScene`, `WelcomeScreen.Hints`).

`langCode` is one of Excalidraw's locale codes; each language loads when
first asked for (`loadLanguage` loads one ahead, which a server render that
should arrive in it does on both sides). Arabic, Persian and Hebrew lay the
UI out right to left. `UIOptions`, `onThemeChange`, `zenModeEnabled`,
`renderTopLeftUI`, `renderTopRightUI`, `renderCustomStats`, `aiEnabled` and
`generateLinkForSelection` are Excalidraw's props; `ui={false}` draws the
canvas alone. The UI reads the editor once per change, outside gestures, so
a drag, a pan or a zoom re-renders nothing but the zoom level.

The text-to-diagram dialog converts Mermaid as it is typed. Its chat talks
to the app's own backend, which the editor never chooses: `textToDiagram`
takes Excalidraw's `<TTDDialog>` props, `onTextSubmit` (given the messages,
an `onChunk` to stream into and an abort `signal`, it resolves to the
generated Mermaid or an error) and an optional `persistenceAdapter` that
loads and saves the chats. Without it, or with `aiEnabled={false}`, the chat
is not offered. `diagramToCode` is the magic frame's backend, Excalidraw's
`<DiagramToCodePlugin generate>`: given the frame, its children and an
`onPartial` to stream into, it resolves to `{ html }`, which shows in a
sandboxed iframe beside the frame (scripts run, with no access to the page).

### Accessibility

The editor is a focusable `application` region with a name (`label`) and a
description of its keys. A polite live region announces the active tool, the
selection and each action. Every action has a key, and three keys Excalidraw
does not have make it reachable without a pointer: Enter with a drawing tool
draws its shape in the middle of the viewport; Tab and Shift+Tab move the
selection through the elements, a group as one stop, and past the last let
focus leave the editor (Excalidraw's Tab switches the selected shape's type,
which is Alt+Shift+`.` and Alt+Shift+`,` here: with Tab on the switch, a
selected rectangle would keep Tab in the editor, and the elements would have
no keyboard order); Alt+Shift+H and Alt+Shift+V centre the selection.
With nothing selected the arrow keys pan.

### Without barq

`@barqjs/diagram/editor` exports the editor itself, `DiagramEditor`, which
imports nothing of barq: give it a focusable container and three canvases
(the scene, the element being drawn, and the selection on top), and an SVG
over them for the laser, eraser and lasso trails (`svgLayer`), and it is the
same editor, with `api`, `state`, `onAnnounce` and `onTextEditRequest`. Its
state changes at once; the store, history and `onChange` follow once per
input event, and the canvases draw once a frame, so a drag mutates the
dragged elements and redraws without anything reactive in between.

Text is edited in a textarea the host makes: `onTextEditRequest` hands it
a request with the text element (new text is in the scene already), and
the host puts a `<textarea>` in the container and gives it to
`request.attach`; the editor places, styles and drives it, and
`onTextEditEnd` says when to remove it. Frame names are the host's too:
`onFrameNamesChange` lists them as frames come, go or are renamed, the host
renders an element for each (an input while `editing`) and gives it to
`attachFrameName`, and the editor places it above its frame as the viewport
moves; `renameFrame` and `endFrameNameEdit` edit the name. Without a subscriber, text is not
edited. `<DiagramEditor>` answers both with a textarea of its own, so a
keystroke goes from the textarea to the element without anything reactive
in between. The text actions (`actionChangeFontSize`,
`actionChangeFontFamily`, `actionChangeTextAlign`,
`actionChangeVerticalAlign`, `actionTextAutoResize` and the size steps) run
through `editor.actionManager.executeAction`.

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
  and `<Excalidraw>` for editing one is `<DiagramEditor>`, which takes
  `excalidrawAPI` (or `api`), `langCode`, `UIOptions`, `theme` and
  `aiEnabled` as they are.
- `window.EXCALIDRAW_ASSET_PATH` works as before; `setFontAssetPath` says it
  without a global.

## License

MIT. Portions are ported from Excalidraw, MIT, Copyright (c) 2020 Excalidraw.
