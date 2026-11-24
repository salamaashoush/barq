import { CURSOR_TYPE } from "@excalidraw/common";

import { isHandToolActive } from "../app-state.ts";

import type { AppState } from "../types.ts";

/**
 * The interactive canvas' cursor, set imperatively as Excalidraw's
 * `AppCursor` does: the active tool's at rest, the hover affordances
 * (move, resize, a point to grab) over what is under the pointer.
 */
export class EditorCursor {
  private toolCursorMemo: AppState["activeTool"]["type"] | null = null;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly getState: () => AppState,
  ) {}

  public set(cursor: string): void {
    this.toolCursorMemo = null;
    this.canvas.style.cursor = cursor;
  }

  /** The resting cursor: a grab hand in view mode, the active tool's otherwise. */
  public reset(): void {
    if (this.getState().viewModeEnabled) {
      this.set(CURSOR_TYPE.GRAB);
    } else {
      this.applyForTool();
    }
  }

  public applyForTool(activeTool: AppState["activeTool"] = this.getState().activeTool): void {
    if (this.toolCursorMemo === activeTool.type) {
      return;
    }
    if (activeTool.type === "selection") {
      this.set("");
    } else if (isHandToolActive({ activeTool })) {
      this.set(CURSOR_TYPE.GRAB);
    } else if (activeTool.type !== "image" && activeTool.type !== "custom") {
      this.set(CURSOR_TYPE.CROSSHAIR);
    } else {
      this.set(CURSOR_TYPE.AUTO);
    }
    this.toolCursorMemo = activeTool.type;
  }
}
