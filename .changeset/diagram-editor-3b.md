---
"@barqjs/diagram": minor
---

`DiagramEditor` gains the rest of Excalidraw's dialogs and tools.

- The help dialog lists every shortcut, from `?`, the help button and the main menu.
- Strings barq adds to Excalidraw's UI (the command palette's categories, the screen reader's keyboard help) live in `locales/barq/`, laid over Excalidraw's locale file as a language loads, so they translate key by key the same way.
- Save and load: `saveToActiveFile` (Ctrl+S, back into the PNG or SVG a scene came from too), `saveFileToDisk` (Ctrl+Shift+S) and `loadScene` (Ctrl+O, confirmed before it replaces a drawing), through the File System Access API with a download and file input fallback. New props `name` and `onExport`, Excalidraw's; `UIOptions.canvasActions` turns shortcuts off with the entries.
- The image export dialog (Ctrl+Shift+E) previews the export and sets only selected, background, dark mode, the embedded scene and the scale, then saves a PNG or SVG or copies a PNG; the export dialog saves to disk and shows `onExportToBackend` and `renderCustomUI`.
- W is Excalidraw's `toggleWrap`: it wraps the selection in a container or a frame, or unwraps it, and the next W takes it back.
- The pickers' keys: S and G open the stroke and background pickers, Shift+F the font list, and I, Shift+G and Shift+S the eye dropper, which previews under a held pointer, picks the other colour with Alt and stays open while Alt is held in a picker. The font list previews the highlighted font on the selection. `actionChangeFontFamily` takes Excalidraw's preview data as well as a family.
- `exportCanvas`, `exportToClipboard`, `saveAsJSON`, `loadFromJSON`, `saveLibraryAsJSON`, `fileOpen`, `fileSave` and `muteFSAbortError` are exported under Excalidraw's names, with `isNativeFileSystemSupported`.
- The autoshape tool (Shift+X) turns a sketch into a rectangle, diamond, ellipse, arrow or line; a sketched arrow binds to the shapes at its ends.
- The bucket fill tool (B) fills the closed region under a click with a strokeless polygon, restyles a fill it made, and picks its colour with an eye dropper while Alt is held.
- Cells pasted from a spreadsheet (tab, comma or semicolon separated) open the paste chart dialog, which inserts them as a bar, line or radar chart, or as plain text.
