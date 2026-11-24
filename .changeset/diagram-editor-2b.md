---
"@barqjs/diagram": minor
---

`DiagramEditor` writes text, snaps to objects, and gains Excalidraw's eraser, laser pointer, lasso, frames, images, clipboard, flowcharts and sticky notes.

- Text is edited in a textarea over the canvas, ported from Excalidraw's `textWysiwyg`: the text tool, labels in shapes and on arrows (and at a free arrow end), wrapping at the view's width, Alt+W, font size, family and alignment actions, IME and right-to-left input, and one undo step per edit. `onTextEditRequest` now carries the text element and an `attach(textarea)`, and `onTextEditEnd` says when to remove it; `<DiagramEditor>` mounts its own textarea.
- Snapping to objects (Alt+S) lands a drag, a resize or a new shape on the corners, centres and equal gaps of the elements around it, with its snap lines.
- The eraser (E), the laser pointer (K) and the lasso draw their trails in an SVG over the canvases (`svgLayer`).
- Frames (F) take in what they are drawn around or dragged into, clip it, and show their names over the canvas through `onFrameNamesChange` and `attachFrameName`; the frame actions wrap, unwrap, select and release.
- Images come from a file picker (9), a paste or a drop, resized and cached; Enter or a double-click crops one.
- Copy, cut and paste use Excalidraw's clipboard format; text, HTML, SVG markup, image files and Mermaid paste as what they are; Shift+Alt+C copies a PNG, and SVG and text copies are actions. A dropped scene, image or library item is inserted.
- Ctrl and Alt with the arrow keys create and walk flowcharts; N draws a sticky note; duplicated list items advance their marker.
- Tab keeps moving through the elements and out of the editor; Excalidraw's Tab shape switch is Alt+Shift+. and Alt+Shift+,.
- Zooming with the wheel or a pinch draws elements from their cached bitmaps until it pauses, and the new-element layer is drawn only while something is drawn out.
