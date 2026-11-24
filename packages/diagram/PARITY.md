# Parity with Excalidraw's editor

Excalidraw's editor (`@excalidraw/excalidraw` on `@excalidraw/element`
0.18.0-2c3dcc0), feature by feature: **done** names the test that drives it,
**pending** names the phase that owns it. Phase 3a is the UI on
`@barqjs/arc` and `@barqjs/ui` (toolbar, panels, menus, pickers); 3b is the
dialogs, the library and the remaining tools; phase 4 is collaboration and
embeds.

## Data, rendering, export

- done: `.excalidraw` load and save, restore and migration (`data.test.ts`)
- done: PNG and SVG with an embedded scene, export (`svg.test.ts`, `canvas.test.ts`)
- done: canvas and SVG renderers, fonts by unicode range, RTL text (`svg.test.ts`)
- done: viewer, server rendering and hydration (`viewer.test.tsx`, `ssr.test.ts`)
- done: Mermaid to elements (`mermaid.test.ts`)

## Tools

- done: selection, rectangle, diamond, ellipse, arrow, line, freedraw, hand, tool lock (`tools.test.ts`)
- done: text tool, its hover, centre-click labels, drag-to-width (`text.test.ts`)
- done: eraser, alt restore, pen eraser end (`trails.test.ts`)
- done: laser pointer, in view mode too (`trails.test.ts`)
- done: lasso, overlap mode, alt and Ctrl+Alt from the selection tool (`trails.test.ts`)
- done: frame tool, membership on draw and drop (`frame.test.ts`)
- done: image tool with a file picker (`clipboard.test.ts`)
- done: sticky note tool, click and drag sizing (`flowchart.test.ts`)
- pending (3b): autoshape tool (`App.drawshape.ts`, Shift+X); its toolbar entry is there, disabled
- pending (3b): bucket fill tool (`App.bucketFill.ts`, B); its toolbar entry and panel are there
- pending (4): embeddable and iframe tool, `actionLink` embeds; its toolbar entry is there, disabled
- pending (3b): magic frame (AI); the element draws and hit-tests, its toolbar entry is disabled
- done: toolbar drag-to-place of the sticky note (`editor-ui.test.tsx`)

## Selection and transforms

- done: click, shift, box, alt-cycle, groups, deep select (`selection.test.ts`)
- done: move, resize, rotate, alt-duplicate, arrow-key nudge (`transform.test.ts`)
- done: snapping to objects, gaps, new elements, hover lines, Alt+S (`snapping.test.ts`)
- done: binding, elbow arrows, line editor (`binding.test.ts`, `linear.test.ts`)
- done: lock and unlock (`actions.test.ts`)
- done: Tab element navigation, Alt+Shift+. and , shape switch (`convert.test.ts`, `navigation.test.ts`)
- done: flip horizontal and vertical, Shift+H and Shift+V (`ui-actions.test.ts`)
- done: copy and paste styles, Ctrl+Alt+C and Ctrl+Alt+V (`ui-actions.test.ts`)
- done: polygon toggle for closed lines, and a fill closing them (`ui-actions.test.ts`)
- done: arrow binding and midpoint snapping toggles (`ui-actions.test.ts`, `editor-ui.test.tsx`)
- done: the shape switch's panel, opened by Alt+Shift+. and , (`panels.test.tsx`)

## Text

- done: create, edit, delete, commit; Escape, Ctrl+Enter, blur (`text.test.ts`)
- done: labels in shapes and on arrows, container growth (`text.test.ts`)
- done: arrow endpoint labels from the text tool (`text.test.ts`)
- done: wrapping at the view's width, Alt+W, drag-to-width, side resize while editing (`text.test.ts`)
- done: font size steps, family, alignment, vertical alignment actions (`text.test.ts`)
- done: IME composition guards, RTL caret placement, Tab indent (`text.test.ts`)
- done: undo as one step per edit (`text.test.ts`)
- done: paste of copied elements into the textarea as text (`text.test.ts`)
- done: bind text to container, unbind, wrap text in container (`ui-actions.test.ts`)
- done: font picker, font size, text and vertical alignment in the panel (`editor-ui.test.tsx`)

## Frames

- done: children, clipping, hit-testing through clips (`frame.test.ts`)
- done: names over the canvas, editing on double-click and Enter (`frame.test.ts`, `diagram-editor.test.tsx`)
- done: wrap in frame and unwrap, select children, remove children, frame rendering toggle (`frame.test.ts`)

## Images

- done: insert from picker, paste and drop, resize to 1440px and 4MB, grid placement (`clipboard.test.ts`)
- done: files map, image cache, errored images marked (`clipboard.test.ts`)
- done: crop editor: Enter, double-click, handles, moving within the crop, uncrop on handle double-click (`clipboard.test.ts`)

## Clipboard and drop

- done: copy, cut, paste in Excalidraw's clipboard format, frames and labels (`clipboard.test.ts`)
- done: plain text, Ctrl+Shift+V, HTML text and images, SVG markup, image files, Mermaid (`clipboard.test.ts`)
- done: copy as PNG (Shift+Alt+C), as SVG, as text (`clipboard.test.ts`)
- done: drop of scenes (replace, or add with Shift), images, library data (`clipboard.test.ts`)
- pending (3b): pasted spreadsheets as charts (needs the charts dialog)
- pending (4): pasted URLs as embeddables
- done: toasts for `toast` and `errorMessage`, translated (`panels.test.tsx`)

## Flowcharts and lists

- done: Ctrl+arrow node creation, Escape cancel, Alt+arrow navigation (`flowchart.test.ts`)
- done: list marker advance on Ctrl+D and alt-drag, editing the item after (`flowchart.test.ts`)

## Viewport and history

- done: pan, wheel, pinch, zoom keys, fit, scroll constraints, grid (`navigation.test.ts`, `actions.test.ts`)
- done: undo and redo through the store (`history.test.ts`)
- done: minimap, zen mode, view mode, stats panel with editing, theme toggle (`panels.test.tsx`, `ui-actions.test.ts`)
- done: clear canvas with confirmation, canvas background, project name (`ui-actions.test.ts`, `editor-ui.test.tsx`)

## UI

- done: toolbar with every tool, key hints, tool lock, hand, extra tools menu (`editor-ui.test.tsx`)
- done: properties panel: stroke, background, fill, stroke width and style, sloppiness, edges, arrow type, arrowheads, opacity, pressure (`editor-ui.test.tsx`, `ui-actions.test.ts`)
- done: layers, align and distribute, duplicate, delete, group, link, crop and line editor buttons (`editor-ui.test.tsx`)
- done: colour picker: quick picks, palette, shades, hex code, keyboard, eye dropper (`panels.test.tsx`, `editor-ui.test.tsx`)
- done: main menu with app slots (`mainMenu`, `MainMenu`), context menu for canvas, element and selection, Shift+F10 (`editor-ui.test.tsx`, `ui-actions.test.ts`)
- done: command palette, Ctrl+/ and Ctrl+Shift+P (`panels.test.tsx`)
- done: footer zoom, undo and redo, help button, scroll back to content (`editor-ui.test.tsx`, `panels.test.tsx`)
- done: hyperlink popup and editor, element link editor, copy link to element (`panels.test.tsx`, `ui-actions.test.ts`)
- done: hints under the toolbar (`panels.test.tsx`)
- done: Excalidraw's 57 locale files, `langCode`, right to left for Arabic, Persian and Hebrew (`panels.test.tsx`, `diagram-editor.test.tsx`)
- done: `UIOptions` canvas actions and image tool, `renderTopLeftUI`, `renderTopRightUI`, `renderCustomStats`, `aiEnabled`, `excalidrawAPI` (`panels.test.tsx`)
- done: server render of the UI in its language, hydrated without a mismatch (`diagram-editor.test.tsx`)
- done: help dialog with every shortcut, from `?`, the help button and the main menu (`dialogs.test.tsx`)
- done: barq's own strings (the palette's categories, the keyboard help) in `locales/barq/`, laid over Excalidraw's locale as it loads (`dialogs.test.tsx`)
- done: image export dialog: preview, only selected, background, dark mode, embedded scene, scale, PNG, SVG and copy as PNG; Ctrl+Shift+E (`export.test.tsx`, `files.test.ts`)
- done: export dialog: save to disk, `onExportToBackend`, `renderCustomUI` (`export.test.tsx`)
- done: save and load through the File System Access API with a download and file input fallback; `saveToActiveFile` (Ctrl+S, to the image a scene came from too), `saveFileToDisk` (Ctrl+Shift+S), `loadScene` (Ctrl+O) with the overwrite confirmation, `onExport` with its progress (`export.test.tsx`, `files.test.ts`)
- pending (3b): library sidebar, its trigger, add to library (context menu and palette)
- pending (3b): search menu (Ctrl+F); its menu entry is disabled
- pending (3b): Mermaid and text-to-diagram dialog; their extra tools entries are disabled
- pending (3b): welcome screen and its hints
- pending (3b): colour and font top picks customised by dragging, and reset
- pending (3b): font picker previews a font on hover
- pending (3b): command palette's recently used commands and library items
- pending (3b): stats panel's uncropped image size, group rows and scene version
- pending (3b): pen mode button for a detected pen; compact and phone layouts of the panels
- done: `toggleWrap` (W): a text into a container, texts into new containers and back, labels freed and rewrapped, shapes in and out of a frame (`wrap.test.ts`)
- pending (3b): eye dropper's Alt to pick for the other colour

Not carried over: the main menu's links to Excalidraw's own social accounts.

## Collaboration (phase 4)

- pending (4): remote pointers' laser trails are drawn (`LaserTrails.updateCollabTrails`), the collaborators state, follow mode (`goToCollaborator`)
