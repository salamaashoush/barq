import {
  DEFAULT_STICKY_NOTE_SIZE,
  DRAGGING_THRESHOLD,
  KEYS,
  getGridPoint,
  viewportCoordsToSceneCoords,
} from "@excalidraw/common";
import { isStickyNoteElement, newStickyNoteElement } from "@excalidraw/element";

import type { ExcalidrawNonSelectionElement, NonDeleted } from "@excalidraw/element/types";

import type { ToolType } from "../types.ts";
import type { DiagramEditor } from "./editor.ts";
import type { Coords } from "../types.ts";

type DraggedElement = NonDeleted<ExcalidrawNonSelectionElement>;

interface DraggableTool {
  /** The element a drop creates, centred on the pointer. */
  createElement: (editor: DiagramEditor, center: Coords) => DraggedElement;
  /** What the tool does once its element is on the canvas. */
  onDrop?: (editor: DiagramEditor, element: DraggedElement) => void;
}

const DRAGGABLE_TOOLS: Partial<Record<ToolType, DraggableTool>> = {
  stickynote: {
    createElement: (editor, center) => {
      const size = DEFAULT_STICKY_NOTE_SIZE;
      const { state } = editor;
      return newStickyNoteElement({
        type: "stickynote",
        x: center.x - size / 2,
        y: center.y - size / 2,
        width: size,
        height: size,
        baseHeight: size,
        strokeColor: state.currentItemStickynoteStrokeColor,
        backgroundColor: state.currentItemStickynoteBackgroundColor,
        fillStyle: state.currentItemFillStyle,
        strokeWidth: editor.getCurrentItemStrokeWidth("stickynote"),
        strokeStyle: state.currentItemStrokeStyle,
        roughness: state.currentItemRoughness,
        opacity: state.currentItemOpacity,
        roundness: editor.getCurrentItemRoundness("stickynote"),
        locked: false,
        frameId: editor.getTopLayerFrameAtSceneCoords(center)?.id ?? null,
      });
    },
    onDrop: (editor, element) => {
      if (isStickyNoteElement(element)) {
        editor.text.startTextEditing({
          sceneX: element.x + element.width / 2,
          sceneY: element.y + element.height / 2,
          container: element,
        });
      }
    },
  },
};

/** How translucent the preview is while it is dragged. */
export const TOOL_DRAG_PREVIEW_OPACITY = 0.5;

interface ArmedDrag {
  pointerId: number;
  clientX: number;
  clientY: number;
}

/**
 * Dragging a tool out of the toolbar onto the canvas, Excalidraw's
 * `AppToolDrag`. The button arms on pointer down and the drag starts once the
 * pointer has moved past the drag threshold, so a press that stays put is
 * still a click. The preview lives only here until it is dropped: it is not in
 * the scene, the store or the history, and an aborted drag leaves nothing.
 */
export class ToolDrag {
  /** The element under the pointer while dragging. */
  public preview: DraggedElement | null = null;

  private armed: ArmedDrag | null = null;
  private tool: DraggableTool | null = null;
  private readonly listeners: (() => void)[] = [];

  public constructor(private readonly editor: DiagramEditor) {}

  public static isDraggable(type: ToolType): boolean {
    return type in DRAGGABLE_TOOLS;
  }

  public isDragging(): boolean {
    return this.preview !== null;
  }

  /** Arms a drag from a tool button's pointer down; whether the tool can be dragged. */
  public handleButtonPointerDown(type: ToolType, event: PointerEvent): boolean {
    const tool = DRAGGABLE_TOOLS[type];
    if (!tool || event.button !== 0 || this.editor.state.viewModeEnabled) {
      return false;
    }
    this.cancel();
    this.armed = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
    this.tool = tool;
    const window = this.editor.ownerWindow;
    const listen = <K extends keyof WindowEventMap>(
      name: K,
      handler: (event: WindowEventMap[K]) => void,
      capture = false,
    ) => {
      const wrapped = (each: WindowEventMap[K]) => this.editor.batch(() => handler(each));
      window.addEventListener(name, wrapped, capture);
      this.listeners.push(() => window.removeEventListener(name, wrapped, capture));
    };
    listen("pointermove", (each) => this.onPointerMove(each));
    listen("pointerup", (each) => this.onPointerUp(each));
    listen("pointercancel", () => this.cancel());
    listen("blur", () => this.cancel());
    listen(
      "keydown",
      (each) => {
        if (each.key === KEYS.ESCAPE) {
          each.stopPropagation();
          this.cancel();
        }
      },
      true,
    );
    return true;
  }

  /** Drops the gesture without a trace. */
  public cancel(): void {
    const wasDragging = this.preview !== null;
    this.armed = null;
    this.tool = null;
    this.preview = null;
    for (const remove of this.listeners.splice(0)) remove();
    if (wasDragging) {
      this.editor.scheduleRender();
    }
  }

  private onPointerMove(event: PointerEvent): void {
    const { armed, tool } = this;
    if (!armed || !tool || event.pointerId !== armed.pointerId) {
      return;
    }
    if (
      !this.preview &&
      Math.hypot(event.clientX - armed.clientX, event.clientY - armed.clientY) < DRAGGING_THRESHOLD
    ) {
      return;
    }
    const preview = tool.createElement(
      this.editor,
      viewportCoordsToSceneCoords(event, this.editor.state),
    );
    const [x, y] = getGridPoint(
      preview.x,
      preview.y,
      event[KEYS.CTRL_OR_CMD] ? null : this.editor.getEffectiveGridSize(),
    );
    this.preview = { ...preview, x, y };
    this.editor.scheduleRender();
  }

  private onPointerUp(event: PointerEvent): void {
    const { armed, preview, tool } = this;
    if (!armed || event.pointerId !== armed.pointerId) {
      return;
    }
    this.cancel();
    // the button's own press handles a press that never became a drag
    if (!preview || !tool || !this.isOverCanvas(event)) {
      return;
    }
    const { editor } = this;
    editor.insertNewElement(preview);
    editor.store.scheduleCapture();
    editor.setState({ selectedElementIds: { [preview.id]: true }, selectedGroupIds: {} });
    // the drop places one element: the tool before it does not stay armed
    editor.setActiveTool(
      { type: editor.state.preferredSelectionTool.type },
      { keepSelection: true },
    );
    tool.onDrop?.(editor, preview);
  }

  private isOverCanvas(event: PointerEvent): boolean {
    const document = this.editor.ownerDocument;
    const target =
      (typeof document.elementFromPoint === "function"
        ? document.elementFromPoint(event.clientX, event.clientY)
        : null) ?? (event.target as Element | null);
    return target === this.editor.interactiveCanvas || target === this.editor.canvas;
  }
}
