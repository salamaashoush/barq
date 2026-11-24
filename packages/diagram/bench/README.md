# Diagram editor benchmark

`<DiagramEditor>` against `@excalidraw/excalidraw`'s `<Excalidraw>` at
0.18.0-2c3dcc0, the build whose `@excalidraw/element` the editor runs on,
in headless Chrome over CDP (the driver in `packages/benchmark/src/tier2`).

```bash
bun install
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" bun run bench 5
```

`BENCH_SIZES=1000` limits the scenes, and `BENCH_PROFILE=barq` (or
`excalidraw`) prints where each scenario's main-thread time goes, from an
unminified bundle.

Both pages are minified production bundles: barq compiled by
`@barqjs/compiler`, React 19 in its production build. The scenes are 1k, 5k
and 10k elements (`scene.ts`): rectangles, ellipses and diamonds on a grid,
an arrow from every fifth, a label in every seventh. Each scenario runs on a
fresh page and the median of the rounds is reported.

- first render: from mounting the editor with the scene to the end of the
  second frame after the scene is in;
- drag, pan and zoom: Chrome's main-thread task time (`TaskDuration`) per
  input, each input followed by the frame it causes; the drag moves 100
  selected shapes, the pan is Shift and the wheel, the zoom Ctrl and the
  wheel;
- heap: JavaScript heap after the first render and two collections;
- bundle: the page's JavaScript and CSS.

## Results

Apple M-series laptop, Chrome stable, five rounds, with other test suites
running on the machine (so absolute times are high; compare the rows).

| scene | editor     | first render (ms) | drag 100 (ms/frame) | pan (ms/frame) | zoom (ms/frame) | JS heap (MB) |
| ----- | ---------- | ----------------- | ------------------- | -------------- | --------------- | ------------ |
| 1000  | barq       | 51                | 3.1                 | 2.6            | 2.3             | 5.1          |
| 1000  | excalidraw | 100               | 2.9                 | 2.7            | 2.9             | 8.4          |
| 5000  | barq       | 71                | 4.9                 | 3.5            | 3.1             | 12.9         |
| 5000  | excalidraw | 118               | 4.7                 | 3.2            | 3.5             | 16.2         |
| 10000 | barq       | 100               | 7.2                 | 4.3            | 3.9             | 22.4         |
| 10000 | excalidraw | 145               | 7.3                 | 4.0            | 4.3             | 25.7         |

| bundle     | minified (KB) | gzip (KB) |
| ---------- | ------------- | --------- |
| barq       | 1737          | 624       |
| excalidraw | 6448          | 2352      |

barq renders a scene in half the time at 1k and a third less at 10k, zooms
faster, holds less heap, and ships a quarter of the JavaScript. Excalidraw's
bundle carries its whole UI (toolbars, dialogs, the library); the editor's UI
chrome is phase 3, so the bundle row will narrow.

Dragging and panning are level, within a few percent either way. The
profiles (`BENCH_PROFILE`) put both editors' JavaScript at a fraction of the
frame: the rest is Chrome rasterizing and compositing the canvases, which both
do the same way. What was barq's own cost has been removed: a zoom rasterized
every element again at each wheel step (it now draws from the cached bitmaps
until the gesture pauses, as Excalidraw does), each wheel and press forced a
layout to measure the container (it now follows page scrolls instead), and an
empty canvas was cleared and composited every frame (it is now hidden while
nothing is drawn out).
