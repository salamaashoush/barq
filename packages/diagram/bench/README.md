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
  input, and its script part (`ScriptDuration`), each input followed by the
  frame it causes; the drag moves 100
  selected shapes, the pan is Shift and the wheel, the zoom Ctrl and the
  wheel;
- heap: JavaScript heap after the first render and two collections;
- bundle: the page's JavaScript and CSS.

## Results

Apple M-series laptop, Chrome stable, three rounds. The machine was not
quiet: other agents' Rust builds held the load average between 7 and 27
through the run, so absolute times are high and the totals move a few
tenths of a millisecond from run to run. Each frame column gives the
main-thread time and, in parentheses, the script part of it, which is the
editor's own work and holds still under load; the rest is mostly Chrome
drawing and compositing the canvases. `barq-canvas` is the same editor with
`ui={false}`: the row beside `barq` says what the UI costs.

| scene | editor      | first render (ms) | drag 100 (ms/frame) | pan (ms/frame) | zoom (ms/frame) | JS heap (MB) |
| ----- | ----------- | ----------------- | ------------------- | -------------- | --------------- | ------------ |
| 1000  | barq        | 75                | 3.2 (1.1)           | 2.8 (0.7)      | 2.6 (0.5)       | 8.6          |
| 1000  | barq-canvas | 41                | 3.4 (1.1)           | 3.3 (0.8)      | 2.8 (0.5)       | 7.0          |
| 1000  | excalidraw  | 105               | 3.4 (2.0)           | 2.9 (1.1)      | 4.6 (1.5)       | 8.4          |
| 5000  | barq        | 185               | 6.0 (2.4)           | 4.9 (1.1)      | 4.2 (0.8)       | 17.0         |
| 5000  | barq-canvas | 173               | 6.2 (2.6)           | 4.8 (1.1)      | 4.1 (0.8)       | 15.3         |
| 5000  | excalidraw  | 181               | 7.1 (5.2)           | 5.0 (2.6)      | 6.0 (2.6)       | 16.2         |
| 10000 | barq        | 221               | 7.2 (3.4)           | 5.1 (1.3)      | 4.5 (1.0)       | 27.1         |
| 10000 | barq-canvas | 152               | 7.3 (3.5)           | 4.8 (1.2)      | 4.3 (1.0)       | 25.4         |
| 10000 | excalidraw  | 255               | 11.0 (9.1)          | 6.2 (3.8)      | 6.7 (3.7)       | 26.4         |

| bundle     | minified (KB) | gzip (KB) |
| ---------- | ------------- | --------- |
| barq       | 2486          | 854       |
| excalidraw | 6448          | 2352      |

barq does less script work than Excalidraw on every frame at every size: a
third to a half of it on a drag, two thirds on a pan and a zoom at 1k, and a
third or less at 10k (3.4 ms against 9.1 on a 10k drag). Its frames are
level with Excalidraw's or ahead in total at 1k and ahead at 5k and 10k, and
it renders a scene faster at 1k and 10k (level at 5k in this run).

What took barq's frames from behind Excalidraw to ahead, found with
`BENCH_PROFILE` (a CPU profile through CDP) and Chrome's per-frame counters:

- a drag copied every element of the scene on each move for snapping, and
  walked them all for the selection, with snapping off; it now gathers the
  scene only when the drag snaps (about 1 ms a frame at 5k);
- every frame rebuilt the map of all renderable elements; it is now kept
  while the scene's list is, which a pan, a zoom and a drag (moving elements
  in place) leave alone;
- the viewport test converted the viewport's corners twice per element;
  they are converted once, and a settled scene of 2k elements or more is
  culled through a grid, so a pan or a zoom reads a few cells rather than
  testing every element (half a millisecond a frame at 10k);
- the selection colour was read through `getComputedStyle` every frame; it
  is read once per theme.

Style and layout counts per frame are zero in barq's frames (Excalidraw
recalculates style and lays out once per zoom step), and the UI costs no
script per frame: the `barq` and `barq-canvas` rows are level. The UI's cost
is the first render, the toolbar, panels, menus and dialogs built once, and
its JavaScript: the bundle grew by about 250 KB minified (85 KB gzipped) with
this phase's dialogs, library, search, charts and layouts, still about a
third of Excalidraw's. Excalidraw's English strings are in the bundle; the
other languages are chunks of their own, loaded when asked for.
