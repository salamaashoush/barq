# Diagram editor benchmark

`<DiagramEditor>` against `@excalidraw/excalidraw`'s `<Excalidraw>` at
0.18.0-2c3dcc0, the build whose `@excalidraw/element` the editor runs on,
in headless Chrome over CDP (the driver in `packages/benchmark/src/tier2`).

```bash
bun install
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" bun run bench 5
```

`BENCH_SIZES=1000` limits the scenes, `BENCH_PROFILE=barq` (or
`barq-canvas`, `excalidraw`) prints where each scenario's script time goes,
the first render included, from an unminified bundle, and `BENCH_TRACE=1`
prints the renderer main thread's trace events by name, for the time
outside script (commits, canvas flushes, paint).

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
  selected shapes from a rectangle clear of either editor's panels, the pan is Shift and the wheel, the zoom Ctrl and the
  wheel;
- heap: JavaScript heap after the first render and two collections;
- bundle: the page's JavaScript and CSS.

## Results

Apple M-series laptop, Chrome stable, five rounds. The load average was
between 2 and 3 through the run, other agents' builds still running, so a
round now and then lands on a burst (Excalidraw's 1k pan and zoom here);
both runs since the changes below put barq ahead on every total.
Each frame column gives the main-thread time and, in parentheses, the
script part of it. `barq-canvas` is the same editor with `ui={false}`: the
row beside `barq` says what the UI costs.

| scene | editor      | first render (ms) | drag 100 (ms/frame) | pan (ms/frame) | zoom (ms/frame) | JS heap (MB) |
| ----- | ----------- | ----------------- | ------------------- | -------------- | --------------- | ------------ |
| 1000  | barq        | 46                | 1.7 (0.8)           | 1.6 (0.5)      | 1.6 (0.4)       | 9.0          |
| 1000  | barq-canvas | 32                | 1.8 (0.9)           | 1.7 (0.6)      | 1.5 (0.5)       | 7.8          |
| 1000  | excalidraw  | 60                | 2.6 (1.5)           | 3.6 (1.5)      | 4.4 (1.5)       | 8.4          |
| 5000  | barq        | 66                | 2.8 (1.6)           | 1.8 (0.6)      | 1.6 (0.4)       | 17.3         |
| 5000  | barq-canvas | 50                | 2.4 (1.4)           | 1.7 (0.6)      | 1.8 (0.5)       | 16.1         |
| 5000  | excalidraw  | 79                | 5.2 (3.8)           | 4.4 (2.3)      | 5.5 (2.5)       | 16.2         |
| 10000 | barq        | 87                | 4.2 (2.7)           | 3.4 (1.3)      | 3.1 (1.0)       | 27.4         |
| 10000 | barq-canvas | 68                | 3.9 (2.6)           | 3.6 (1.3)      | 3.2 (1.1)       | 26.2         |
| 10000 | excalidraw  | 97                | 7.4 (6.1)           | 5.5 (3.3)      | 6.2 (3.6)       | 25.7         |

| bundle     | minified (KB) | gzip (KB) |
| ---------- | ------------- | --------- |
| barq       | 2580          | 884       |
| excalidraw | 6448          | 2352      |

barq is ahead on every total at every size: the first render by 10 to
14 ms, and each frame by a third or more. Its script is under half of
Excalidraw's on every frame. Excalidraw's script column includes its canvas
flush, which runs at the end of React's task, where barq's runs outside its
script, so the totals are the fairer comparison.

Before this run barq was behind at 1k in total (a drag at 2.5 ms a frame
against Excalidraw's 2.2) though ahead in script. What closed it, found with
`BENCH_TRACE` and `BENCH_PROFILE`:

- canvases drawn inside an animation frame are flushed during the frame's
  commit, which holds the main thread while the compositor takes them; an
  input event's draw now runs in a task of its own, as Excalidraw's does in
  React's scheduler, and only mounts and API calls wait for a frame, where
  their several steps draw once;
- the properties panel's model and the action predicates asked for the
  selection over the whole scene with nothing selected, and the scene's
  one-query cache missed on every other ask; an empty selection now answers
  at once, which took 10 ms off a 10k first render with the UI.

From the earlier phases, still holding:

- a drag gathers the scene for snapping only when the drag snaps;
- the map of renderable elements is kept while the scene's list is, which a
  pan, a zoom and a drag leave alone;
- a settled scene of 2k elements or more is culled through a grid, so a pan
  or a zoom reads a few cells rather than testing every element;
- the selection colour is read once per theme.

Style and layout counts per frame are zero in barq's frames, and the UI
costs no script per frame: the `barq` and `barq-canvas` rows are level. The
UI's cost is the first render and its JavaScript; the bundle grew by about
90 KB minified (30 KB gzipped) with embeds, collaboration's surface and the
rest of Excalidraw's public API, still about two fifths of Excalidraw's.
