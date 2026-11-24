---
"@barqjs/diagram": minor
---

`DiagramEditor` reaches Excalidraw's full feature set and public API, with collaboration and embeds.

- Embeds: the embeddable tool, links validated by `validateEmbeddable` (Excalidraw's allow-list by default), live iframes placed with the viewport and activated by a centre click, `renderEmbeddable`, and the iframes' sandbox set by `embeddableSandbox`. Pasted and dropped URLs become embeds when they validate. The magic frame's generated pages share the same layer.
- Collaboration: `updateScene({ collaborators })` draws remote cursors, selections and laser trails, with idle and away states; `isCollaborating`, `onPointerUpdate`, `onScrollChange`, `onUserFollow`, `userToFollow`, `viewportStatusFrame` and `currentUserControls`; the user list with follow mode, `LiveCollaborationTrigger` and `createIdleDetector`.
- `@barqjs/diagram/collab`: `createCollaboration` binds an editor to one `CollabTransport` interface as Excalidraw's own app does, with `reconcileElements`, end-to-end encryption by room key, binary file sync and room links. `createWebSocketTransport` works with `@barqjs/start`'s `createWebSocketRooms`, and `@barqjs/diagram/collab/yjs` syncs through a Y.Doc and an awareness (yjs is an optional peer dependency).
- Excalidraw's public API: every export of `@excalidraw/excalidraw`, every `ExcalidrawProps` member and every `ExcalidrawImperativeAPI` method, among them `applyDeltas`, `mutateElement`, `setViewport`, `registerAction`, `setToast`, `addFiles`, `onIncrement`, `onStateChange`, `interaction`, `onPaste`, `onDuplicate` and `onLinkOpen`, plus `Sidebar`, `Footer`, `Stats`, `TTDDialog`, `DiagramToCodePlugin`, `CommandPalette` and the hooks. A test reads the published types and fails on a gap.
- Breaking: `MainMenu`, `WelcomeScreen`, `TTDDialog` and `DiagramToCodePlugin` are children, as in Excalidraw, replacing the `mainMenu`, `welcomeScreen`, `textToDiagram` and `diagramToCode` props; `excalidrawAPI` is `onExcalidrawAPI`; `ui` takes `false` or a config object.
- Touch input as Excalidraw's: a pinch clears the selection and an active embed, a long press opens the context menu.
- The tablet properties are Excalidraw's column of popovers, the phone library a sheet, and the library publish preview a JPEG. The UI's styles compose `@barqjs/arc/style` and `@barqjs/ui`, held by a duplication test.
- Faster: an input's draw runs outside the frame's commit and an empty selection is answered without walking the scene, so a 1k drag costs 1.7 ms a frame against Excalidraw's 2.6 and a 10k scene renders in 87 ms against 97.
