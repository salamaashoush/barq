/** @jsxImportSource react */
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { createRoot } from "react-dom/client";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { dragSelection, makeScene } from "../scene.ts";

declare global {
  interface Window {
    __mount(count: number): Promise<number>;
    __select(): void;
    __ready: boolean;
  }
}

let api: ExcalidrawImperativeAPI | undefined;
interface BenchWindow {
  __api: () => unknown;
}

(window as never as BenchWindow).__api = () => api;

function frame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

window.__mount = async (count) => {
  const scene = { elements: makeScene(count), appState: {}, files: {} };
  const start = performance.now();
  createRoot(document.getElementById("app")!).render(
    <div style={{ height: 1024 }}>
      <Excalidraw
        initialData={scene as never}
        onExcalidrawAPI={(given) => (api = given ?? undefined)}
      />
    </div>,
  );
  // the scene is in once the editor has it, which Excalidraw restores asynchronously
  function loaded() {
    return api !== undefined && api.getSceneElements().length > 0;
  }
  while (!loaded()) await frame();
  await frame();
  await frame();
  return performance.now() - start;
};

window.__select = () => {
  const ids = dragSelection(makeScene(100));
  api!.updateScene({
    appState: { selectedElementIds: Object.fromEntries(ids.map((id) => [id, true])) } as never,
  });
};

window.__ready = true;
