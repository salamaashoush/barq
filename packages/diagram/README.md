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
optional peer dependency, needed only by `@barqjs/diagram/mermaid`, and so is
`yjs`, needed only by `@barqjs/diagram/collab/yjs`.

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
`getFiles`, `addFiles`, `setActiveTool`, `scrollToContent`, `resetScene`, `refresh`,
`history.clear`, `onChange`, and for collaboration `onPointerUpdate`,
`onScrollChange` and `onUserFollow` (see [Collaboration](#collaboration)),
each subscription returning its unsubscribe. `updateScene`'s `captureUpdate` says how a
change is undone, as in Excalidraw: `"IMMEDIATELY"`, `"EVENTUALLY"` or
`"NEVER"`. `theme` (or the `colorScheme()` above), `viewModeEnabled` and
`gridModeEnabled` follow their props. On the server it renders the empty
region, which hydrates into the editor.

What it does, and the keys Excalidraw gives each:

- tools: selection `V` or `1`, rectangle `R` or `2`, diamond `D` or `3`,
  ellipse `O` or `4`, arrow `A` or `5` (again to change its kind), line `L`
  or `6`, freedraw `P`, `X` or `7`, text `T` or `8`, eraser `E` or `0`,
  laser pointer `K`, frame `F`, image `9` (a file picker), sticky note
  `N`, web embed (the extra tools, no key), hand `H`; `Q` keeps the tool
  after drawing; shift draws equal sides and alt draws from the centre;
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
  is installed; links the embeds allow, one per line (or an embed's
  `<iframe>` code), paste as web embeds side by side, and other links as
  text; Shift+Alt+C copies the selection as a PNG, and
  `actionCopyAsSvg` and `actionCopyText` copy it as SVG markup or text;
- images come from the image tool's file picker, a paste or a drop, resized
  to at most 1440px and 4MB (`editor.images.options`), several on a grid;
  their files go in the scene's files and their decoded images in the
  image cache; Enter or a double-click on an image opens the crop editor,
  whose handles crop it and where a drag moves the image within its crop;
- a dropped `.excalidraw` file, or a PNG or SVG with a scene, replaces the
  scene (Shift adds it where it is dropped), a library's items are added
  where they are dropped, and so is a web embed for a dropped link the
  embeds allow;
- a web embed is dragged out with its tool and opens its link editor
  (Ctrl+K edits it again): a link the embeds allow shows its page in an
  iframe over the canvas, YouTube, Vimeo and Google Drive videos at their
  proportions, X, Reddit and GitHub gist posts as documents of their own;
  any other link stays a placeholder, with Excalidraw's toast. A hover on
  the middle third of an embed offers it, a click there (or a
  double-click) activates it after a moment, playing or pausing a video,
  and an active embed takes the pointer; Escape or a click away ends it. In
  view mode a click anywhere on an embed activates it. The magic frame's
  generated pages are embeds too, active once generated;
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
- on a touch screen a double tap writes text, a pinch keeps the selection it
  began with, and a finger held still opens the context menu;
- Alt+S snaps to objects instead: a drag, a resize or a new shape lands on
  the corners, centres and equal gaps of the elements around it, with the
  lines that show it; Ctrl turns it off for one gesture, or on when it is
  off.

Ctrl is Cmd on macOS.

### The UI

`<DiagramEditor>` draws Excalidraw's UI over the canvas, on `@barqjs/ui`'s
components and `@barqjs/arc/style`'s treatments, so light, dark, density and
an app's brand all reach it. Its styles compose those treatments and ui's
shared groups rather than write them again, and what is the editor's own is
written once; `src/ui/duplication.test.ts` holds it to arc's rule. Render it inside `<ArcProvider>` from `@barqjs/arc`, which installs
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
bottom sheet and undo and redo beside them, and the library and the search in
a sheet over the editor's end; a tablet's has Excalidraw's compact properties,
a column of buttons at the top start: the stroke and background colours and
the font each open their picker, and the stroke styles, the arrow, the text
and the other actions each open a popover of their own, one at a time; a
desktop's is the one above. `UIOptions.getFormFactor` decides
for the host. Under a coarse pointer, or once the editor is touched, its
controls are a finger's size. A pen's first stroke turns pen mode on (the pen
draws, a finger pans) and shows its toggle beside the toolbar.

`welcomeScreen` puts Excalidraw's welcome screen over a scene that has never
had an element while the selection tool is active: `true` for a heading, a
menu (open a file, help) and hints pointing at the main menu, the toolbar and
help, or the `WelcomeScreen` parts to show (as JSX), as Excalidraw's children
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
sandboxed iframe beside the frame (scripts run, with no access to the page),
with buttons to copy its source and show it in full screen.

`validateEmbeddable` is Excalidraw's: the links a web embed shows. Without it,
Excalidraw's allow-list (YouTube, Vimeo, Google Drive, Figma, GitHub gists, X
and Twitter, Reddit, Excalidraw links, StackBlitz, Val Town, Giphy, Microsoft
Forms, Instagram); `true` or `false` for every link or none, hostnames and
patterns (`["example.com", /^https:\/\/docs\./]`) for those alone, or a
function deciding, which falls back to the allow-list when it returns
`undefined`. `renderEmbeddable(element, appState)`, Excalidraw's too, shows
what it returns in place of an embed's iframe. `embeddableSandbox` is the
iframes' `sandbox`, one value or a function of the link; by default
Excalidraw's, `allow-scripts allow-forms allow-popups
allow-popups-to-escape-sandbox allow-presentation allow-downloads` with
`allow-same-origin` for the sites it trusts with their own origin.

```tsx
<DiagramEditor
  validateEmbeddable={["example.com", /^https:\/\/www\.youtube\.com\//]}
  embeddableSandbox="allow-scripts allow-presentation"
  renderEmbeddable={(element) =>
    element.link?.startsWith("https://example.com/") ? <Preview url={element.link} /> : null
  }
/>
```

### Collaboration

The editor is the collaborating half of Excalidraw's collaboration: it draws
the others and reports the user, and a sync layer carries both between
editors. `updateScene({ collaborators })` replaces the collaborators, a
`Map` from each one's socket id to a `Collaborator` (`username`,
`avatarUrl`, `color`, `pointer` with its `tool`, `button`,
`selectedElementIds`, `userState`, `isCurrentUser`, `isInCall`,
`isSpeaking`, `isMuted`). Each one's cursor is drawn with their name in
their colour (held at the edge and dimmed when out of view, dimmed when
`userState` is idle or away, none at all with `pointer.renderCursor:
false`), what they selected is outlined in their colour, and a pointer
whose `tool` is `"laser"` draws their laser trail while their button is
down, in `pointer.laserColor` or theirs.

What the user does goes out through props and API subscriptions alike:

- `onPointerUpdate({ pointer: { x, y, tool }, button, pointersMap })` as the
  pointer moves, presses and releases, in scene coordinates, `tool` being
  `"laser"` with the laser pointer; `pointersMap` holds the pointers down
  (a sync layer leaves a pinch out);
- `onScrollChange(scrollX, scrollY, zoom)` as the viewport moves or zooms;
- `onUserFollow({ userToFollow, action })`, `"FOLLOW"` or `"UNFOLLOW"`.

As in Excalidraw, who is followed is the host's: `userToFollow` is a prop
the editor reads and never sets. Pressing a collaborator (or running
`actionGoToCollaborator` with one) asks to follow them, or to stop when
they are the one followed; panning, zooming, a press on the canvas with
any tool but the laser, and the followed user leaving `collaborators` ask
to stop. The follower's viewport is moved by the host to the bounds the
followed user's `getVisibleSceneBounds(appState)` gave, with
`zoomToFitBounds`, which does not stop following:

```tsx
api.updateScene({
  appState: zoomToFitBounds({ appState: api.getAppState(), bounds, fit: "contain" }).appState,
});
```

The UI shows the collaborators at the top end, beside `renderTopRightUI`:
as many avatars as fit, pressed to follow, the followed one ringed, and
the current user's last, opening the list of everyone (searchable from
eight people on, with their call state) and the host's
`currentUserControls` below it. On a phone they are in the main menu.
`viewportStatusFrame` frames the canvas in a colour with a badge, which
is how an app shows that it follows someone; `isCollaborating` puts the
laser pointer beside the toolbar. `LiveCollaborationTrigger` (and
`MainMenu.DefaultItems.LiveCollaborationTrigger`) is Excalidraw's share
button, with the number of collaborators on it.

```tsx
<DiagramEditor
  isCollaborating={collab() !== null}
  userToFollow={collab()?.userToFollow ?? null}
  viewportStatusFrame={collab()?.viewportStatusFrame ?? null}
  renderTopRightUI={() => (
    <LiveCollaborationTrigger isCollaborating={collab() !== null} onSelect={openShareDialog} />
  )}
/>
```

The sync layer below fills `collab()`; a host with its own may answer
`onPointerUpdate`, `onScrollChange` and `onUserFollow` itself instead.

`createIdleDetector({ onChange })` is Excalidraw's idle detection, which
its app does: `UserIdleState.ACTIVE` every three seconds while the pointer
moves, `IDLE` after a minute without, `AWAY` while the page is hidden; it
returns the stop.

#### The sync layer: `@barqjs/diagram/collab`

`createCollaboration` is excalidraw.com's `Collab` and `Portal`: it binds
an editor's `api` to a room through a transport. Scene changes go out as
increments, each element once per version, with the whole scene every
twenty seconds in case a message was lost; a client that joins gets the
whole scene from everyone in the room. What arrives is restored and
merged with `reconcileElements` (exported from `@barqjs/diagram` too):
the higher version of each element wins, the lower `versionNonce` on a
tie, and the element being drawn or resized here keeps its local copy;
the order is the elements' fractional indices. Deleted elements are sent
for a day, invisibly small ones never. Remote changes are not undoable.

The session also sends the pointer (as `onPointerUpdate` reports it, thirty
times a second at most, a pinch left out), with the laser's tool and
button and the selection, and the idle state `createIdleDetector` reports;
each client is a collaborator in the editor. Following is the host's
`userToFollow`: the session takes the editor's `onUserFollow` requests, and
its state carries `userToFollow` and a `viewportStatusFrame` ("Following"
and the name, closable; `followingFrame` makes another). The followed
client sends its visible bounds to its followers only, as its viewport
moves, and the follower's viewport fits them with `zoomToFitBounds`;
taking the viewport over, the frame's close, or the followed user leaving
stops it. Images are uploaded once per version when they are added, the
element's `status` going from `"pending"` to `"saved"`, which tells the
others to fetch the file; a file that cannot be fetched marks its images
`"error"`. Files over `maxFileBytes` (4 MiB) are refused with
`errors.fileTooBig` in `errorMessage`.

```tsx
import { createSignal } from "@barqjs/core";
import { DiagramEditor } from "@barqjs/diagram";
import {
  type CollaborationState,
  createCollaboration,
  createWebSocketTransport,
  getCollaborationLinkData,
} from "@barqjs/diagram/collab";

function Board() {
  const room = getCollaborationLinkData(location.href);
  const [collab, setCollab] = createSignal<CollaborationState | null>(null);
  return (
    <DiagramEditor
      api={(api) => {
        if (!room) return;
        const session = createCollaboration({
          api,
          transport: createWebSocketTransport({ url: "wss://example.com/rooms" }),
          ...room,
          username: "Salama",
          existingRoom: true,
        });
        session.subscribe(setCollab);
      }}
      isCollaborating={collab() !== null}
      userToFollow={collab()?.userToFollow ?? null}
      viewportStatusFrame={collab()?.viewportStatusFrame ?? null}
    />
  );
}
```

`existingRoom` says whether the room's scene replaces the editor's (a
shared link) or the room starts with it (a new room, whose saved images
go back to pending and whose deleted elements are left out). `ready`
settles once the room's scene is in the editor. `getState()` and
`subscribe` give `status` (`"connecting"`, also while reconnecting,
`"connected"`, or `"closed"` once stopped), `socketId`, `username`, `collaborators`,
`userToFollow`, `followedBy` and `viewportStatusFrame`, the listeners
called a microtask after each change; `setUsername`, `setUserToFollow`
and `fetchImageFiles` are the rest of `CollabAPI`. `stop()` saves the
scene, finishes the uploads and leaves; the editor keeps the scene, its
images pending again. On the headless editor the same session takes
`editor.api`, and `editor.setHost({ userToFollow })` from `subscribe`
plays the prop's part.

#### Transports

A transport implements `CollabTransport`: it connects to a room and
reports who is in it, sends and receives the session's messages, follows,
and stores and fetches files (and, where it can, the room's scene for a
client that joins an empty room). Two come with the package.

`createWebSocketTransport({ url })` speaks to a room server: `@barqjs/start`
serves one with `createWebSocketRooms` (see its README). The server relays
each message to the rest of the room and the followed client's bounds to
its followers, keeps the room's files, and stores its scene, saved over
the revision it was read at, so two saves reconcile rather than overwrite.
A dropped connection comes back as socket.io's does, after a second and
then twice as long each time up to thirty (`reconnectDelay`), under a new
id: the session sends its scene and who it follows again, and the room's
scene, reconciled, brings what it missed.

`createYjsTransport({ doc, awareness })` from `@barqjs/diagram/collab/yjs`
keeps the elements in a `Y.Map` by id and the files in another, and each
client's pointer, selection, idle state, who it follows and, while it is
followed, its visible bounds in its awareness state. Any provider carries
them (y-websocket, Hocuspocus, y-webrtc), and its store is the room's
store; the awareness is typed by the methods it uses, so y-protocols is
not a dependency. What arrives is reconciled exactly as above; a copy that
loses a race for the map to an older one is written again. `yjs` is an
optional peer dependency.

```ts
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { createCollaboration } from "@barqjs/diagram/collab";
import { createYjsTransport } from "@barqjs/diagram/collab/yjs";

const doc = new Y.Doc();
const provider = new WebsocketProvider("wss://example.com/yjs", room.roomId, doc);
createCollaboration({
  api,
  transport: createYjsTransport({ doc, awareness: provider.awareness }),
  ...room,
  username: "Salama",
  existingRoom: true,
});
```

#### Encryption and links

Nothing leaves a client unencrypted: messages, elements, presence, files
and the stored scene are sealed with the room key, AES-GCM with a fresh IV
each time, so the room server, the Y.Doc's provider and their stores hold
ciphertext. Files are `compressData`'s format, Excalidraw's (metadata,
deflated, encrypted). The key travels in the link's hash, which browsers
do not send: `generateCollaborationLinkData()` makes a room (a random id
and a new key), `getCollaborationLink(room)` the page's link to it
(`#room=id,key`), and `getCollaborationLinkData(link)` reads it back,
`null` for a link without a room and a `LocalizedError` with
`alerts.invalidEncryptionKey` for a key of the wrong length. The pieces are
exported for other uses: `generateEncryptionKey`, `encryptData`,
`decryptData`, `getCryptoKey`, `createIV`, `IV_LENGTH_BYTES`,
`compressData`, `decompressData`, `createRoomCipher`,
`encodeFilesForUpload`, `FileManager`.

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

Embeds are the host's in the same way: `onEmbedsChange` lists the embeds to
show (each with its element, the `src` or `srcdoc` to load, its `sandbox`
and its hover or active `state`), the host renders an iframe in a container
for each and gives them to `attachEmbed(id, { container, content, iframe })`,
and the editor places the container over its element at the zoom, rotated
and clipped by its frame, hidden out of view, taking the pointer only while
active. `DiagramEditorOptions.host` (and `setHost`) takes
`validateEmbeddable` and `embeddableSandbox`; `<DiagramEditor>` renders the
embeds itself, with the canvas alone too.

For collaboration the host options are the props' names: `isCollaborating`,
`userToFollow` (changed with `setHost`), `onPointerUpdate`, `onScrollChange`
and `onUserFollow`; `actionGoToCollaborator` is exported beside the text
actions.

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
