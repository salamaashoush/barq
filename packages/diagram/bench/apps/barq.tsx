import { DiagramEditor, type DiagramEditorApi } from "../../src/index.ts";
import { render } from "@barqjs/web";

import { dragSelection, makeScene } from "../scene.ts";
import { canvasAtFullSize } from "../drawn.ts";

declare global {
  interface Window {
    __mount(count: number): Promise<number>;
    __select(): void;
    __ready: boolean;
    __noUI?: boolean;
  }
}

let api: DiagramEditorApi | undefined;

function frame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

window.__mount = async (count) => {
  const scene = { elements: makeScene(count), appState: {}, files: {} };
  const start = performance.now();
  render(
    () => (
      <DiagramEditor
        initialData={scene as never}
        height="1024px"
        ui={window.__noUI !== true}
        api={(given) => (api = given)}
      />
    ),
    document.getElementById("app")!,
  );
  // the scene is in once the editor has it, which Excalidraw restores asynchronously
  function loaded() {
    return api !== undefined && api.getSceneElements().length > 0;
  }
  const app = document.getElementById("app")!;
  while (!loaded() || !canvasAtFullSize(app)) await frame();
  // the frame that draws the scene at full size, and the one after it
  await frame();
  await frame();
  return performance.now() - start;
};

window.__select = () => {
  const ids = dragSelection(makeScene(100));
  api!.updateScene({
    appState: { selectedElementIds: Object.fromEntries(ids.map((id) => [id, true])) },
  });
};

window.__ready = true;
