---
"@barqjs/diagram": minor
---

`DiagramEditor` gains Excalidraw's UI, built on `@barqjs/ui` with arc's theme tokens: render it inside `<ArcProvider>` for the theme and the toast stack.

- The toolbar has every tool with its keys, the tool lock, the hand and a menu of extra tools; the sticky note drags out onto the canvas.
- The properties panel sets stroke and background colour, fill, stroke width and style, sloppiness, edges, arrow type and arrowheads, font family and size, text and vertical alignment, opacity and pressure, with the layers, align, distribute and per-element actions. The colour picker has quick picks, the palette, shades, a hex code, Excalidraw's keys and an eye dropper.
- The main menu takes an app's own entries through `mainMenu` and `MainMenu`; a right click, the menu key or Shift+F10 opens the context menu; Ctrl+/ opens the command palette. The stats panel edits position, size, angle and font size, and the minimap, hints, link popups, shape switch panel and scroll back button follow Excalidraw's.
- New actions: flip, copy and paste styles, bind, unbind and wrap text, the polygon toggle, arrow binding and midpoint snapping, zen and view mode, stats, minimap, theme, clear canvas, canvas background, links. `Action.label` is now Excalidraw's translation key; the live region's text is `announcement`.
- `langCode` loads any of Excalidraw's 57 locale files on demand (`loadLanguage`), and Arabic, Persian and Hebrew lay the UI out right to left. `toast` and `errorMessage` carry translatable messages.
- New props under Excalidraw's names: `excalidrawAPI`, `UIOptions`, `onThemeChange`, `zenModeEnabled`, `renderTopLeftUI`, `renderTopRightUI`, `renderCustomStats`, `aiEnabled`, `generateLinkForSelection`, and `initialData` as a promise or a function; `ui={false}` leaves the canvas alone.
- `@barqjs/ui`, `@barqjs/aria`, `@barqjs/css` and `@barqjs/lucide` are new peer dependencies.
