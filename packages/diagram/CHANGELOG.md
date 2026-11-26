# @barqjs/diagram

## 0.2.0-next.4

### Minor Changes

- 00331e6: `DiagramEditor` writes text, snaps to objects, and gains Excalidraw's eraser, laser pointer, lasso, frames, images, clipboard, flowcharts and sticky notes.

  - Text is edited in a textarea over the canvas, ported from Excalidraw's `textWysiwyg`: the text tool, labels in shapes and on arrows (and at a free arrow end), wrapping at the view's width, Alt+W, font size, family and alignment actions, IME and right-to-left input, and one undo step per edit. `onTextEditRequest` now carries the text element and an `attach(textarea)`, and `onTextEditEnd` says when to remove it; `<DiagramEditor>` mounts its own textarea.
  - Snapping to objects (Alt+S) lands a drag, a resize or a new shape on the corners, centres and equal gaps of the elements around it, with its snap lines.
  - The eraser (E), the laser pointer (K) and the lasso draw their trails in an SVG over the canvases (`svgLayer`).
  - Frames (F) take in what they are drawn around or dragged into, clip it, and show their names over the canvas through `onFrameNamesChange` and `attachFrameName`; the frame actions wrap, unwrap, select and release.
  - Images come from a file picker (9), a paste or a drop, resized and cached; Enter or a double-click crops one.
  - Copy, cut and paste use Excalidraw's clipboard format; text, HTML, SVG markup, image files and Mermaid paste as what they are; Shift+Alt+C copies a PNG, and SVG and text copies are actions. A dropped scene, image or library item is inserted.
  - Ctrl and Alt with the arrow keys create and walk flowcharts; N draws a sticky note; duplicated list items advance their marker.
  - Tab keeps moving through the elements and out of the editor; Excalidraw's Tab shape switch is Alt+Shift+. and Alt+Shift+,.
  - Zooming with the wheel or a pinch draws elements from their cached bitmaps until it pauses, and the new-element layer is drawn only while something is drawn out.

- 0e37327: `DiagramEditor` gains the rest of Excalidraw's dialogs and tools.

  - The help dialog lists every shortcut, from `?`, the help button and the main menu.
  - Strings barq adds to Excalidraw's UI (the command palette's categories, the screen reader's keyboard help) live in `locales/barq/`, laid over Excalidraw's locale file as a language loads, so they translate key by key the same way.
  - Save and load: `saveToActiveFile` (Ctrl+S, back into the PNG or SVG a scene came from too), `saveFileToDisk` (Ctrl+Shift+S) and `loadScene` (Ctrl+O, confirmed before it replaces a drawing), through the File System Access API with a download and file input fallback. New props `name` and `onExport`, Excalidraw's; `UIOptions.canvasActions` turns shortcuts off with the entries.
  - The image export dialog (Ctrl+Shift+E) previews the export and sets only selected, background, dark mode, the embedded scene and the scale, then saves a PNG or SVG or copies a PNG; the export dialog saves to disk and shows `onExportToBackend` and `renderCustomUI`.
  - W is Excalidraw's `toggleWrap`: it wraps the selection in a container or a frame, or unwraps it, and the next W takes it back.
  - The pickers' keys: S and G open the stroke and background pickers, Shift+F the font list, and I, Shift+G and Shift+S the eye dropper, which previews under a held pointer, picks the other colour with Alt and stays open while Alt is held in a picker. The font list previews the highlighted font on the selection. `actionChangeFontFamily` takes Excalidraw's preview data as well as a family.
  - The stats panel names the element's type, shows an image's uncropped size while cropping and a group's heading, edits several units each to the value typed, edits the grid's step, folds its sections, and scrubs a value when its label is dragged.
  - The colour and font quick picks are customised by dragging: a palette colour or a font dropped on a slot is pinned there (in `colorTopPicks` and `fontTopPicks`), a pick dragged onto another slot moves, and the strip's context menu or the picker's tip resets them.
  - `welcomeScreen` shows Excalidraw's welcome screen over a scene that has never had an element: `true` for its heading, menu and hints, or the `WelcomeScreen` parts to show.
  - The UI lays itself out by the editor's size as Excalidraw's form factors do (`UIOptions.getFormFactor` decides for the host): on a phone the toolbar is at the bottom with the properties in a bottom sheet and undo beside them; on a tablet the properties open from a button; under a coarse pointer, or once touched, controls are a finger's size. A pen's first stroke turns pen mode on and shows its toggle.
  - The live region speaks the UI's language: the tool, the selection and each action's announcement are keys in `locales/barq/`, and `onAnnounce` gives a headless host the message to translate beside the English.
  - Drag, pan and zoom do less work per frame: a drag no longer copies the scene for snapping with snapping off, the renderable map is kept while the scene's list is, a large settled scene is culled through a grid, and the selection colour is read once per theme. The editor now does a third to a half of Excalidraw's script per frame.
  - `exportCanvas`, `exportToClipboard`, `saveAsJSON`, `loadFromJSON`, `saveLibraryAsJSON`, `fileOpen`, `fileSave` and `muteFSAbortError` are exported under Excalidraw's names, with `isNativeFileSystemSupported`.
  - The autoshape tool (Shift+X) turns a sketch into a rectangle, diamond, ellipse, arrow or line; a sketched arrow binds to the shapes at its ends.
  - The bucket fill tool (B) fills the closed region under a click with a strokeless polygon, restyles a fill it made, and picks its colour with an eye dropper while Alt is held.
  - Cells pasted from a spreadsheet (tab, comma or semicolon separated) open the paste chart dialog, which inserts them as a bar, line or radar chart, or as plain text.
  - The text-to-diagram dialog: its Mermaid tab previews a definition as it is typed, offers Excalidraw's auto-fix and inserts it. With `aiEnabled` and a `textToDiagram` backend (`onTextSubmit`, and an optional `persistenceAdapter`), its chat streams diagrams from the app's backend, repairs and retries them and keeps the chats; without one nothing is offered and nothing is sent anywhere.
  - The library sidebar, opened from its button at the top end: add the selection (context menu, command palette or the sidebar), insert items by click or drag, select (Shift for ranges), remove, reset, import and export `.excalidrawlib`, browse Excalidraw's public libraries, and dock beside the canvas. New props `onLibraryChange`, `libraryReturnUrl` and `libraryPublishEndpoint` (the publish dialog posts there, and is offered only with it); `initialData.libraryItems`; the API's `id` and `updateLibrary`; `useHandleLibrary` and `handleLibrary` for `#addLibrary=` installs and a persistence adapter.
  - Search (Ctrl+F) in the sidebar finds texts and frames' names, highlights them on the canvas and steps through them.
  - The command palette shows the last command run and the library's named items.
  - The magic frame (wireframe to code): with `aiEnabled` and a `diagramToCode` backend (`generate`, Excalidraw's `<DiagramToCodePlugin>`), it wraps the selection and turns it into HTML shown beside it in a sandboxed iframe, streamed as it arrives, whose source copies to the clipboard. Without the backend it is not offered.

- f8f587b: `DiagramEditor` reaches Excalidraw's full feature set and public API, with collaboration and embeds.

  - Embeds: the embeddable tool, links validated by `validateEmbeddable` (Excalidraw's allow-list by default), live iframes placed with the viewport and activated by a centre click, `renderEmbeddable`, and the iframes' sandbox set by `embeddableSandbox`. Pasted and dropped URLs become embeds when they validate. The magic frame's generated pages share the same layer.
  - Collaboration: `updateScene({ collaborators })` draws remote cursors, selections and laser trails, with idle and away states; `isCollaborating`, `onPointerUpdate`, `onScrollChange`, `onUserFollow`, `userToFollow`, `viewportStatusFrame` and `currentUserControls`; the user list with follow mode, `LiveCollaborationTrigger` and `createIdleDetector`.
  - `@barqjs/diagram/collab`: `createCollaboration` binds an editor to one `CollabTransport` interface as Excalidraw's own app does, with `reconcileElements`, end-to-end encryption by room key, binary file sync and room links. `createWebSocketTransport` works with `@barqjs/start`'s `createWebSocketRooms`, and `@barqjs/diagram/collab/yjs` syncs through a Y.Doc and an awareness (yjs is an optional peer dependency).
  - Excalidraw's public API: every export of `@excalidraw/excalidraw`, every `ExcalidrawProps` member and every `ExcalidrawImperativeAPI` method, among them `applyDeltas`, `mutateElement`, `setViewport`, `registerAction`, `setToast`, `addFiles`, `onIncrement`, `onStateChange`, `interaction`, `onPaste`, `onDuplicate` and `onLinkOpen`, plus `Sidebar`, `Footer`, `Stats`, `TTDDialog`, `DiagramToCodePlugin`, `CommandPalette` and the hooks. A test reads the published types and fails on a gap.
  - Breaking: `MainMenu`, `WelcomeScreen`, `TTDDialog` and `DiagramToCodePlugin` are children, as in Excalidraw, replacing the `mainMenu`, `welcomeScreen`, `textToDiagram` and `diagramToCode` props; `excalidrawAPI` is `onExcalidrawAPI`; `ui` takes `false` or a config object.
  - Touch input as Excalidraw's: a pinch clears the selection and an active embed, a long press opens the context menu.
  - The tablet properties are Excalidraw's column of popovers, the phone library a sheet, and the library publish preview a JPEG. The UI's styles compose `@barqjs/arc/style` and `@barqjs/ui`, held by a duplication test.
  - Faster: an input's draw runs outside the frame's commit and an empty selection is answered without walking the scene, so a 1k drag costs 1.7 ms a frame against Excalidraw's 2.6 and a 10k scene renders in 87 ms against 97.

- 518e811: `DiagramEditor` gains Excalidraw's UI, built on `@barqjs/ui` with arc's theme tokens: render it inside `<ArcProvider>` for the theme and the toast stack.

  - The toolbar has every tool with its keys, the tool lock, the hand and a menu of extra tools; the sticky note drags out onto the canvas.
  - The properties panel sets stroke and background colour, fill, stroke width and style, sloppiness, edges, arrow type and arrowheads, font family and size, text and vertical alignment, opacity and pressure, with the layers, align, distribute and per-element actions. The colour picker has quick picks, the palette, shades, a hex code, Excalidraw's keys and an eye dropper.
  - The main menu takes an app's own entries through `mainMenu` and `MainMenu`; a right click, the menu key or Shift+F10 opens the context menu; Ctrl+/ opens the command palette. The stats panel edits position, size, angle and font size, and the minimap, hints, link popups, shape switch panel and scroll back button follow Excalidraw's.
  - New actions: flip, copy and paste styles, bind, unbind and wrap text, the polygon toggle, arrow binding and midpoint snapping, zen and view mode, stats, minimap, theme, clear canvas, canvas background, links. `Action.label` is now Excalidraw's translation key; the live region's text is `announcement`.
  - `langCode` loads any of Excalidraw's 57 locale files on demand (`loadLanguage`), and Arabic, Persian and Hebrew lay the UI out right to left. `toast` and `errorMessage` carry translatable messages.
  - New props under Excalidraw's names: `excalidrawAPI`, `UIOptions`, `onThemeChange`, `zenModeEnabled`, `renderTopLeftUI`, `renderTopRightUI`, `renderCustomStats`, `aiEnabled`, `generateLinkForSelection`, and `initialData` as a promise or a function; `ui={false}` leaves the canvas alone.
  - `@barqjs/ui`, `@barqjs/aria`, `@barqjs/css` and `@barqjs/lucide` are new peer dependencies.

- 2881dfc: `DiagramEditor` is Excalidraw's editor in barq, ported from its `App` onto `@excalidraw/element`: the rectangle, diamond, ellipse, arrow, line and freedraw tools; selection by click, shift-click, box and group, with double-click into a group; moving by drag and arrow keys with grid snapping and alt-drag duplication; resizing and rotating by the handles; arrows binding to shapes; delete, duplicate, z-order, group, lock, align and distribute; undo and redo through the store and history; pan and zoom by space-drag, the middle button, the wheel and a pinch; and Excalidraw's keyboard map. Its API carries Excalidraw's names (`updateScene`, `getSceneElements`, `getAppState`, `setActiveTool`, `scrollToContent`, `history.clear`, `onChange`). It is an `application` region with a live region announcing tool and selection changes, and a key for every action. `@barqjs/diagram/editor` exports the controller without barq.
- d665adc: `@barqjs/diagram` is barq's whiteboard and diagram package, built on Excalidraw's framework-free element model and its file format: `loadFromBlob`, `restore`, `serializeAsJSON`, `convertToExcalidrawElements` and libraries; canvas and SVG rendering with the dark theme and right-to-left text; `exportToCanvas`, `exportToBlob`, `exportToSvg` and `exportScene`; Excalidraw's fonts loaded by unicode range; Mermaid through `@barqjs/diagram/mermaid`; and `DiagramViewer`, a read-only viewer with pan, zoom, pinch and keyboard navigation that follows the color scheme and renders an SVG snapshot on the server before it hydrates.

### Patch Changes

- 9917b6e: `<DiagramEditor>` mounts the textarea it edits text in inside a box of its own over the canvas, as Excalidraw does: the box clips it to the editor and lets pointer events through to the canvas.
- Updated dependencies [6e8bbc2]
- Updated dependencies [c67406a]
- Updated dependencies [47fd28a]
- Updated dependencies [4d59c06]
- Updated dependencies [989b03f]
- Updated dependencies [c001c9a]
- Updated dependencies [41567c2]
- Updated dependencies [12d8d9e]
- Updated dependencies [59a9e79]
- Updated dependencies [97a6789]
- Updated dependencies [95bbb85]
- Updated dependencies [e0d4f09]
- Updated dependencies [220d907]
- Updated dependencies [9b4fbea]
- Updated dependencies [6d04722]
- Updated dependencies [574d694]
- Updated dependencies [eb64d85]
- Updated dependencies [b37e244]
- Updated dependencies [4d3bed4]
- Updated dependencies [c906e09]
- Updated dependencies [3e86dc3]
- Updated dependencies [0464d58]
- Updated dependencies [b6a5593]
- Updated dependencies [0a30c0b]
- Updated dependencies [fe3ed7f]
- Updated dependencies [d2f0fad]
- Updated dependencies [19c99d0]
- Updated dependencies [0a43dbe]
- Updated dependencies [a29585c]
- Updated dependencies [0968d16]
- Updated dependencies [ec06e14]
- Updated dependencies [7847b93]
- Updated dependencies [f265cd9]
- Updated dependencies [657a57b]
- Updated dependencies [64ef645]
- Updated dependencies [3f6aa6d]
- Updated dependencies [b6342be]
- Updated dependencies [e82bd6c]
  - @barqjs/arc@0.2.0-next.4
  - @barqjs/ui@0.2.0-next.4
  - @barqjs/aria@0.2.0-next.4
  - @barqjs/primitives@0.2.0-next.4
  - @barqjs/web@0.2.0-next.4
  - @barqjs/server@0.2.0-next.4
  - @barqjs/core@0.2.0-next.4
  - @barqjs/lucide@0.2.0-next.4
  - @barqjs/css@0.2.0-next.4
