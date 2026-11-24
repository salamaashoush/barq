/**
 * `<DiagramEditor>` against `@excalidraw/excalidraw`'s `<Excalidraw>`, the
 * same build of Excalidraw (0.18.0-2c3dcc0) whose element package the editor
 * runs on, in a real Chrome.
 *
 *   CHROME_PATH=... bun run bench [rounds]
 *
 * Both pages are minified production bundles: barq compiled by
 * `@barqjs/compiler`, React by Bun's JSX transform with React 19's production
 * build. Each scenario runs on a fresh page, `rounds` times, and reports the
 * median. Main-thread time comes from Chrome's own counters
 * (`Performance.getMetrics`), so the work React schedules for later is
 * counted with the input that caused it.
 */
import { createRequire } from "node:module";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import type { BunPlugin } from "bun";

import { load, serve, withBenchChrome, type Page } from "../../benchmark/src/tier2/driver.ts";
import { COLUMNS } from "./scene.ts";

const HERE = import.meta.dir;
const ROUNDS = Number(process.argv[2] ?? 3);
const SIZES = (process.env.BENCH_SIZES ?? "1000,5000,10000").split(",").map(Number);

const native = createRequire(import.meta.url)("@barqjs/compiler") as {
  transform(code: string, options: Record<string, unknown>): { code: string; warnings?: string[] };
};

const barqCompiler: BunPlugin = {
  name: "barq-diagram-bench",
  setup(build) {
    // a language other than English is a chunk of its own, fetched when
    // asked for: the bench's English page never loads one
    build.onResolve({ filter: /locales\/(?!en\.json|percentages\.json)[^/]+\.json$/ }, (args) => ({
      path: args.path,
      external: true,
    }));
    // the UI's styles, `@barqjs/ui`'s and arc's, fold to classes as an app build folds them
    build.onLoad(
      {
        filter:
          /\/(packages\/ui\/src\/.*|diagram\/src\/ui\/.*|packages\/arc\/src\/(style\/.*|layer))\.ts$/,
      },
      async (args) => {
        const source = await Bun.file(args.path).text();
        const result = native.transform(source, { filename: args.path });
        return { contents: result.code, loader: "ts" };
      },
    );
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const source = await Bun.file(args.path).text();
      if (source.includes("@jsxImportSource react")) return { contents: source, loader: "tsx" };
      const result = native.transform(source, { filename: args.path });
      if (result.warnings?.length) throw new Error(`${args.path}: ${result.warnings.join("; ")}`);
      return { contents: result.code, loader: "tsx" };
    });
  },
};

interface Bundle {
  js: string;
  css: string;
}

async function bundle(entry: string): Promise<Bundle> {
  const built = await Bun.build({
    entrypoints: [join(HERE, "apps", entry)],
    target: "browser",
    format: "esm",
    minify: !PROFILE,
    conditions: ["bun", "production"],
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [barqCompiler],
  });
  if (!built.success) throw new Error(built.logs.map(String).join("\n"));
  let js = "";
  let css = "";
  for (const output of built.outputs) {
    if (output.path.endsWith(".js")) js += await output.text();
    if (output.path.endsWith(".css")) css += await output.text();
  }
  return { js, css };
}

const page = (name: string, setup = "") =>
  '<!doctype html><meta charset="utf-8"><body style="margin:0">' +
  `<link rel="stylesheet" href="/${name}.css"><div id="app"></div>` +
  // both load their fonts from here, where there are none, so neither waits on a CDN
  `<script>window.EXCALIDRAW_ASSET_PATH = "/assets/";${setup}</script>` +
  `<script type="module" src="/${name}.js"></script>`;

const median = (values: number[]): number => {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** Main-thread task time and the script part of it, in milliseconds. */
async function mainThread(chrome: Page): Promise<{ task: number; script: number }> {
  const result = (await chrome.send("Performance.getMetrics", {})) as {
    metrics: { name: string; value: number }[];
  };
  const read = (name: string) =>
    (result.metrics.find((metric) => metric.name === name)?.value ?? 0) * 1000;
  return { task: read("TaskDuration"), script: read("ScriptDuration") };
}

async function heap(chrome: Page): Promise<number> {
  await chrome.send("HeapProfiler.collectGarbage", {});
  await chrome.send("HeapProfiler.collectGarbage", {});
  const usage = (await chrome.send("Runtime.getHeapUsage", {})) as { usedSize: number };
  return usage.usedSize;
}

const afterFrame = (chrome: Page) =>
  chrome.evaluate("new Promise((resolve) => requestAnimationFrame(() => afterFrame(resolve)))");

const mouse = (
  chrome: Page,
  type: string,
  x: number,
  y: number,
  extra: Record<string, unknown> = {},
) =>
  chrome.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, ...extra });

/**
 * Main-thread milliseconds per step, each step an input and the frame after
 * it: all of it, and the script, which is the editor's own work (the rest is
 * mostly the browser drawing the canvases).
 */
async function perStep(
  chrome: Page,
  steps: number,
  step: (index: number) => Promise<unknown>,
): Promise<{ task: number; script: number }> {
  await afterFrame(chrome);
  const before = await mainThread(chrome);
  for (let index = 0; index < steps; index++) {
    await step(index);
    await afterFrame(chrome);
  }
  const after = await mainThread(chrome);
  return {
    task: (after.task - before.task) / steps,
    script: (after.script - before.script) / steps,
  };
}

interface Row {
  mount: number;
  drag: number;
  dragScript: number;
  pan: number;
  panScript: number;
  zoom: number;
  zoomScript: number;
  heap: number;
}

const STEPS = 40;

/** `BENCH_PROFILE=barq` (or `excalidraw`): unminified, one size, and where the time goes. */
const PROFILE = process.env.BENCH_PROFILE;

interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
}

async function profiled<T>(chrome: Page, label: string, body: () => Promise<T>): Promise<T> {
  if (!PROFILE) return body();
  await chrome.send("Profiler.enable", {});
  await chrome.send("Profiler.setSamplingInterval", { interval: 100 });
  await chrome.send("Profiler.start", {});
  const result = await body();
  const { profile } = (await chrome.send("Profiler.stop", {})) as {
    profile: { nodes: ProfileNode[]; samples: number[]; timeDeltas: number[] };
  };
  const self = new Map<string, number>();
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  profile.samples.forEach((id, index) => {
    const frame = byId.get(id)!.callFrame;
    const key = `${frame.functionName || "(anonymous)"} ${frame.url.split("/").pop()}:${frame.lineNumber}`;
    self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[index] ?? 0) / 1000);
  });
  console.log(`-- ${label}`);
  for (const [key, ms] of [...self].toSorted((a, b) => b[1] - a[1]).slice(0, 18)) {
    console.log(`${ms.toFixed(1).padStart(8)} ms  ${key}`);
  }
  return result;
}

async function measure(url: string, count: number): Promise<Row> {
  return withBenchChrome(async (chrome) => {
    const log = (phase: string) => process.env.BENCH_DEBUG && console.log(url, count, phase);
    await load(chrome, url);
    log("loaded");
    await chrome.send("Performance.enable", {});
    const mount = await chrome.call<number>(`window.__mount(${count})`);
    log(`mounted in ${mount}`);
    const heapUsed = await heap(chrome);

    // a drag of 100 selected shapes, from the first one's middle
    await chrome.call("window.__select()");
    const startX = 70;
    const startY = 50;
    await mouse(chrome, "mouseMoved", startX, startY, { buttons: 0 });
    await mouse(chrome, "mousePressed", startX, startY, { buttons: 1 });
    const drag = await profiled(chrome, "drag", () =>
      perStep(chrome, STEPS, (index) =>
        mouse(chrome, "mouseMoved", startX + (index + 1) * 3, startY + (index + 1) * 2, {
          buttons: 1,
        }),
      ),
    );
    await mouse(chrome, "mouseReleased", startX + STEPS * 3, startY + STEPS * 2, { buttons: 0 });

    log(`dragged ${drag}`);
    // pan with the wheel, and zoom with Ctrl and the wheel, in the middle of the scene
    const middle = { x: (COLUMNS * 160) / 2, y: 500 };
    // Shift and the wheel pan sideways in both, whatever the input device is taken for
    const pan = await profiled(chrome, "pan", () =>
      perStep(chrome, STEPS, () =>
        chrome.send("Input.dispatchMouseEvent", {
          type: "mouseWheel",
          ...middle,
          deltaX: 0,
          deltaY: 40,
          modifiers: 8,
        }),
      ),
    );
    const zoom = await profiled(chrome, "zoom", () =>
      perStep(chrome, STEPS, (index) =>
        chrome.send("Input.dispatchMouseEvent", {
          type: "mouseWheel",
          ...middle,
          deltaX: 0,
          deltaY: index % 2 === 0 ? -10 : 10,
          modifiers: 2,
        }),
      ),
    );
    return {
      mount,
      drag: drag.task,
      dragScript: drag.script,
      pan: pan.task,
      panScript: pan.script,
      zoom: zoom.task,
      zoomScript: zoom.script,
      heap: heapUsed,
    };
  });
}

const barq = await bundle("barq.tsx");
const excalidraw = await bundle("excalidraw.tsx");
const files = new Map([
  ["/barq.html", page("barq")],
  // the same editor without its UI, which shows what the UI costs
  ["/barq-canvas.html", page("barq", "window.__noUI = true;")],
  ["/barq.js", barq.js],
  ["/barq.css", barq.css],
  ["/excalidraw.html", page("excalidraw")],
  ["/excalidraw.js", excalidraw.js],
  ["/excalidraw.css", excalidraw.css],
]);
const server = serve(files);

const size = (bundled: Bundle) => ({
  kb: (bundled.js.length + bundled.css.length) / 1024,
  gzipKb: (gzipSync(bundled.js).length + gzipSync(bundled.css).length) / 1024,
});

const EDITORS = ["barq", "barq-canvas", "excalidraw"] as const;
const results: Record<string, Record<string, Row>> = {
  barq: {},
  "barq-canvas": {},
  excalidraw: {},
};
try {
  for (const count of SIZES) {
    for (const name of EDITORS) {
      if (PROFILE && PROFILE !== name) continue;
      const rows: Row[] = [];
      for (let round = 0; round < ROUNDS; round++) {
        rows.push(await measure(server.url(`/${name}.html`), count));
      }
      results[name][count] = {
        mount: median(rows.map((row) => row.mount)),
        drag: median(rows.map((row) => row.drag)),
        dragScript: median(rows.map((row) => row.dragScript)),
        pan: median(rows.map((row) => row.pan)),
        panScript: median(rows.map((row) => row.panScript)),
        zoom: median(rows.map((row) => row.zoom)),
        zoomScript: median(rows.map((row) => row.zoomScript)),
        heap: median(rows.map((row) => row.heap)),
      };
      console.log(name, count, JSON.stringify(results[name][count]));
    }
  }
} finally {
  server.stop();
}

if (PROFILE) process.exit(0);

const fixed = (value: number, digits = 1) => value.toFixed(digits);
const lines = [
  "| scene | editor | first render (ms) | drag 100 (ms/frame) | pan (ms/frame) | zoom (ms/frame) | JS heap (MB) |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  // each frame's main-thread time, with the script part of it in parentheses
];
for (const count of SIZES) {
  for (const name of EDITORS) {
    const row = results[name][count];
    lines.push(
      `| ${count} | ${name} | ${fixed(row.mount, 0)} | ${fixed(row.drag)} (${fixed(row.dragScript)}) | ${fixed(row.pan)} (${fixed(row.panScript)}) | ${fixed(row.zoom)} (${fixed(row.zoomScript)}) | ${fixed(row.heap / 1024 / 1024)} |`,
    );
  }
}
const barqSize = size(barq);
const excalidrawSize = size(excalidraw);
lines.push(
  "",
  "| bundle | minified (KB) | gzip (KB) |",
  "| --- | --- | --- |",
  `| barq | ${fixed(barqSize.kb, 0)} | ${fixed(barqSize.gzipKb, 0)} |`,
  `| excalidraw | ${fixed(excalidrawSize.kb, 0)} | ${fixed(excalidrawSize.gzipKb, 0)} |`,
);
console.log(lines.join("\n"));
await Bun.write(
  join(HERE, "results.json"),
  JSON.stringify({ results, barqSize, excalidrawSize }, null, 2),
);
