---
"@barqjs/diagram": minor
---

`DiagramEditor` gains the rest of Excalidraw's dialogs and tools.

- The help dialog lists every shortcut, from `?`, the help button and the main menu.
- Strings barq adds to Excalidraw's UI (the command palette's categories, the screen reader's keyboard help) live in `locales/barq/`, laid over Excalidraw's locale file as a language loads, so they translate key by key the same way.
- Save and load: `saveToActiveFile` (Ctrl+S, back into the PNG or SVG a scene came from too), `saveFileToDisk` (Ctrl+Shift+S) and `loadScene` (Ctrl+O, confirmed before it replaces a drawing), through the File System Access API with a download and file input fallback. New props `name` and `onExport`, Excalidraw's; `UIOptions.canvasActions` turns shortcuts off with the entries.
- The image export dialog (Ctrl+Shift+E) previews the export and sets only selected, background, dark mode, the embedded scene and the scale, then saves a PNG or SVG or copies a PNG; the export dialog saves to disk and shows `onExportToBackend` and `renderCustomUI`.
- W is Excalidraw's `toggleWrap`: it wraps the selection in a container or a frame, or unwraps it, and the next W takes it back.
- `exportCanvas`, `exportToClipboard`, `saveAsJSON`, `loadFromJSON`, `saveLibraryAsJSON`, `fileOpen`, `fileSave` and `muteFSAbortError` are exported under Excalidraw's names, with `isNativeFileSystemSupported`.
- The autoshape tool (Shift+X) turns a sketch into a rectangle, diamond, ellipse, arrow or line; a sketched arrow binds to the shapes at its ends.
