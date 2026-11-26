---
"@barqjs/diagram": minor
---

`DiagramEditor` is Excalidraw's editor in barq, ported from its `App` onto `@excalidraw/element`: the rectangle, diamond, ellipse, arrow, line and freedraw tools; selection by click, shift-click, box and group, with double-click into a group; moving by drag and arrow keys with grid snapping and alt-drag duplication; resizing and rotating by the handles; arrows binding to shapes; delete, duplicate, z-order, group, lock, align and distribute; undo and redo through the store and history; pan and zoom by space-drag, the middle button, the wheel and a pinch; and Excalidraw's keyboard map. Its API carries Excalidraw's names (`updateScene`, `getSceneElements`, `getAppState`, `setActiveTool`, `scrollToContent`, `history.clear`, `onChange`). It is an `application` region with a live region announcing tool and selection changes, and a key for every action. `@barqjs/diagram/editor` exports the controller without barq.
