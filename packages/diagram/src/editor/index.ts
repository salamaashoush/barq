/**
 * `@barqjs/diagram/editor`: the editor without barq. `DiagramEditor` takes a
 * focusable container and three canvases and is Excalidraw's editor over
 * them; `<DiagramEditor>` from `@barqjs/diagram` mounts it in a page.
 */

export { DiagramEditor } from "./editor.ts";
export type {
  DiagramChangeListener,
  DiagramEditorApi,
  DiagramEditorOptions,
  SceneData,
  TextEditRequest,
} from "./editor.ts";
export { History, HistoryDelta } from "./history.ts";
export type { Action, ActionName, ActionResult, PointerDownState } from "./types.ts";
