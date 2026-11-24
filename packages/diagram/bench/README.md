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
`barq-canvas` is the same editor with `ui={false}`: the row beside `barq`
says what the UI costs.

| scene | editor      | first render (ms) | drag 100 (ms/frame) | pan (ms/frame) | zoom (ms/frame) | JS heap (MB) |
| ----- | ----------- | ----------------- | ------------------- | -------------- | --------------- | ------------ |
| 1000  | barq        | 71                | 3.8                 | 3.4            | 3.0             | 7.7          |
| 1000  | barq-canvas | 50                | 4.1                 | 3.5            | 3.1             | 6.3          |
| 1000  | excalidraw  | 101               | 2.9                 | 2.7            | 3.1             | 8.4          |
| 5000  | barq        | 119               | 5.9                 | 4.6            | 3.9             | 15.4         |
| 5000  | barq-canvas | 89                | 5.8                 | 3.9            | 3.7             | 14.1         |
| 5000  | excalidraw  | 141               | 5.1                 | 3.7            | 3.7             | 16.2         |
| 10000 | barq        | 147               | 7.5                 | 4.6            | 4.2             | 25.0         |
| 10000 | barq-canvas | 107               | 7.6                 | 4.5            | 4.0             | 23.6         |
| 10000 | excalidraw  | 162               | 7.7                 | 4.1            | 4.4             | 25.7         |

| bundle     | minified (KB) | gzip (KB) |
| ---------- | ------------- | --------- |
| barq       | 2229          | 771       |
| excalidraw | 6448          | 2352      |

barq renders a scene in 70% of Excalidraw's time at 1k and 90% at 10k, holds
less heap, and ships about a third of the JavaScript.

The UI costs nothing per frame. Dragging, panning and zooming with it are
level with the canvas alone, within the run's noise: the UI reads the editor
once per change and not during a gesture, and the zoom level follows a wheel
zoom once it pauses. Its cost is the first render, about 20 ms at 1k and
40 ms at 10k, the toolbar, the panels and the menus built once, and about
490 KB of JavaScript (150 KB gzipped), the UI and the components it is
built on. Excalidraw's English strings are in the bundle; the other
languages are chunks of their own, loaded when asked for.

Against Excalidraw, zooming is level or ahead at every size and dragging is
level at 10k; at 1k and 5k this run puts barq's drag and pan up to a
millisecond behind, with or without the UI, which the previous run on a
quieter machine had level. Both editors' frames are mostly Chrome
rasterizing and compositing the canvases (`BENCH_PROFILE` shows each
editor's JavaScript at a fraction of the frame), so the gap needs a quiet
machine to settle.
