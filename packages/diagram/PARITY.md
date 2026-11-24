# Parity with Excalidraw's editor

Excalidraw's editor (`@excalidraw/excalidraw` on `@excalidraw/element`
0.18.0-2c3dcc0), feature by feature: **done** names the test that drives it,
**pending** names the phase that owns it. Phase 3 is the UI chrome on
`@barqjs/arc` (toolbar, panels, menus, dialogs); phase 4 is collaboration and
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
- pending (3): autoshape tool (`App.drawshape.ts`, Shift+X)
- pending (3): bucket fill tool (`App.bucketFill.ts`, B)
- pending (4): embeddable and iframe tool, `actionLink` embeds
- pending (3): magic frame (AI); the element draws and hit-tests, the tool is not exposed
- pending (3): toolbar drag-to-place (`App.toolDrag.ts`)

## Selection and transforms

- done: click, shift, box, alt-cycle, groups, deep select (`selection.test.ts`)
- done: move, resize, rotate, alt-duplicate, arrow-key nudge (`transform.test.ts`)
- done: snapping to objects, gaps, new elements, hover lines, Alt+S (`snapping.test.ts`)
- done: binding, elbow arrows, line editor (`binding.test.ts`, `linear.test.ts`)
- done: lock and unlock (`actions.test.ts`)
- done: Tab element navigation, Alt+Shift+. and , shape switch (`convert.test.ts`, `navigation.test.ts`)
- pending (3): flip horizontal and vertical (Shift+H, Shift+V; `actionFlip`)
- pending (3): copy and paste styles (Ctrl+Alt+C, Ctrl+Alt+V)
- pending (3): polygon toggle for closed lines (`togglePolygon`)
- pending (3): arrow binding and midpoint snapping toggles (`arrowBinding`, `midpointSnapping`)
- pending (3): the shape switch's popup panel (`ConvertElementTypePopup`)

## Text

- done: create, edit, delete, commit; Escape, Ctrl+Enter, blur (`text.test.ts`)
- done: labels in shapes and on arrows, container growth (`text.test.ts`)
- done: arrow endpoint labels from the text tool (`text.test.ts`)
- done: wrapping at the view's width, Alt+W, drag-to-width, side resize while editing (`text.test.ts`)
- done: font size steps, family, alignment, vertical alignment actions (`text.test.ts`)
- done: IME composition guards, RTL caret placement, Tab indent (`text.test.ts`)
- done: undo as one step per edit (`text.test.ts`)
- done: paste of copied elements into the textarea as text (`text.test.ts`)
- pending (3): bind text to container, unbind, wrap text in container (`actionBoundText`, context menu)
- pending (3): font picker, colour and property panels feeding the text actions

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
- pending (3): pasted spreadsheets as charts (needs the charts dialog)
- pending (4): pasted URLs as embeddables
- pending (3): toasts for paste hints and errors (`errorMessage` is set)

## Flowcharts and lists

- done: Ctrl+arrow node creation, Escape cancel, Alt+arrow navigation (`flowchart.test.ts`)
- done: list marker advance on Ctrl+D and alt-drag, editing the item after (`flowchart.test.ts`)

## Viewport and history

- done: pan, wheel, pinch, zoom keys, fit, scroll constraints, grid (`navigation.test.ts`, `actions.test.ts`)
- done: undo and redo through the store (`history.test.ts`)
- pending (3): minimap, zen mode, view mode toggle action, stats panel, theme toggle action
- pending (3): clear canvas, change view background, project name

## UI chrome (phase 3)

- pending (3): toolbar, properties panel, main menu, context menu, command palette
- pending (3): help dialog, image export dialog, library sidebar, add to library
- pending (3): search menu, hints, hyperlinks and element links (`hyperlink`, `copyElementLink`, `linkToElement`)
- pending (3): eye dropper, colour pickers, font picker, Mermaid and text-to-diagram dialogs
- pending (3): save and load actions (`saveToActiveFile`, `saveFileToDisk`, `loadScene`)

## Collaboration (phase 4)

- pending (4): remote pointers' laser trails are drawn (`LaserTrails.updateCollabTrails`), the collaborators state, follow mode (`goToCollaborator`)
