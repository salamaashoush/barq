import {
  CURSOR_TYPE,
  KEYS,
  TEXT_AUTOWRAP_THRESHOLD,
  updateActiveTool,
  viewportCoordsToSceneCoords,
} from "@excalidraw/common";
import { hasBoundTextElement, isArrowElement, isTextBindableContainer } from "@excalidraw/element";

import type { ArrowEndpoint } from "@excalidraw/element";
import type {
  ExcalidrawElement,
  ExcalidrawTextContainer,
  ExcalidrawTextElement,
  NonDeleted,
} from "@excalidraw/element/types";

import type { AppState } from "../types.ts";
import type { DiagramEditor } from "./editor.ts";
import type { PointerDownState } from "./types.ts";

type ScenePoint = { x: number; y: number };

/** The modifiers a target depends on, off a pointer or keyboard event. */
export type Modifiers = Pick<KeyboardEvent, "ctrlKey" | "metaKey">;

/** What a text-tool click at a position does. */
export type TextToolTarget =
  /** binds a new text to a free arrow endpoint */
  | { type: "endpoint"; endpoint: ArrowEndpoint }
  /** edits this text, a label included */
  | { type: "text"; element: NonDeleted<ExcalidrawTextElement> }
  /** binds a new label to this empty container, an arrow included */
  | { type: "container"; element: NonDeleted<ExcalidrawTextContainer> }
  /** creates free text at the pointer */
  | { type: "free" };

function toHoverState(target: TextToolTarget): AppState["textToolHover"] {
  switch (target.type) {
    case "endpoint":
      return {
        type: "arrow",
        elementId: target.endpoint.arrow.id,
        anchor: target.endpoint.startOrEnd,
      };
    case "text":
      return { type: "text", elementId: target.element.id };
    case "container":
      // a shape is outlined whole; an arrow gets its midpoint pointed at
      return isArrowElement(target.element)
        ? { type: "arrow", elementId: target.element.id, anchor: "label" }
        : { type: "container", elementId: target.element.id };
    case "free":
    default:
      return null;
  }
}

function isSameHover(a: AppState["textToolHover"], b: AppState["textToolHover"]): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b || a.type !== b.type || a.elementId !== b.elementId) {
    return false;
  }
  return a.type !== "arrow" || b.type !== "arrow" || a.anchor === b.anchor;
}

interface PendingText {
  containerId: ExcalidrawElement["id"];
  origin: ScenePoint;
}

/**
 * The text tool's pointer interaction, Excalidraw's `AppTextTool`.
 *
 * Everything hangs off one question, what a click at this position would do
 * (`getTargetAt`), answered once for the hover affordance
 * (`textToolHover`), the cursor and the pointer down itself, so the
 * affordance never promises what the click will not do.
 *
 * A click on an empty container's centre is armed on pointer down and
 * committed on pointer up as a label; dragging past the autowrap threshold
 * first turns it into free fixed-width text at the origin instead.
 */
export class TextTool {
  /** A click on an empty container's centre, decided on the pointer's way out. */
  private pending: PendingText | null = null;

  /** The modifiers the hover was last resolved with. */
  private lastModifiers: Modifiers = { ctrlKey: false, metaKey: false };

  public constructor(private readonly app: DiagramEditor) {}

  /**
   * What a click here would do, in the order the click resolves it: a free
   * arrow endpoint, the text under the pointer, an empty container near its
   * centre (unless Ctrl or Cmd opts out of binding), free text.
   */
  public getTargetAt = (scenePointer: ScenePoint, modifiers: Modifiers): TextToolTarget => {
    const { x, y } = scenePointer;
    const endpoint = this.app.arrowText.getBindableEndpointAtPosition(x, y);
    if (endpoint) {
      return { type: "endpoint", endpoint };
    }
    const text = this.app.text.getTextElementAtPosition(x, y);
    if (text) {
      return { type: "text", element: text };
    }
    if (!modifiers[KEYS.CTRL_OR_CMD]) {
      const container = this.app.text.getTextBindableContainerAtPosition(x, y);
      if (
        container &&
        // an existing label is edited by hitting the text itself
        !hasBoundTextElement(container) &&
        this.app.text.getTextWysiwygSnappedToCenterPosition(x, y, this.app.state, container)
      ) {
        return { type: "container", element: container };
      }
    }
    return { type: "free" };
  };

  /**
   * Keeps `textToolHover` in step with the pointer and returns the target,
   * for the cursor; nothing while something else owns the interaction.
   */
  public updateHover = (
    scenePointer: ScenePoint,
    modifiers: Modifiers,
    isOverScrollBar = false,
  ): TextToolTarget | null => {
    const { state } = this.app;
    if (state.activeTool.type !== "text") {
      return null;
    }
    // a pending centre click keeps the affordance it was armed with
    if (this.pending) {
      return null;
    }
    this.lastModifiers = { ctrlKey: modifiers.ctrlKey, metaKey: modifiers.metaKey };
    const target =
      state.editingTextElement ||
      state.newElement ||
      state.multiElement ||
      state.selectionElement ||
      state.selectedElementsAreBeingDragged ||
      isOverScrollBar
        ? null
        : this.getTargetAt(scenePointer, modifiers);
    this.setHover(target && toHoverState(target));
    return target;
  };

  /**
   * Resolves the hover again where the pointer last was, for what changes a
   * click's outcome without the pointer moving: Ctrl or Cmd, or the viewport
   * moving under it. A finger never hovers.
   */
  public refresh = (modifiers: Modifiers = this.lastModifiers): void => {
    const pointer = this.app.lastPointerMoveEvent;
    if (this.app.state.activeTool.type !== "text" || !pointer || pointer.pointerType === "touch") {
      return;
    }
    const target = this.updateHover(
      viewportCoordsToSceneCoords(pointer, this.app.state),
      modifiers,
    );
    if (!this.app.isNavigating()) {
      this.app.cursor.set(this.cursorFor(target));
    }
  };

  /** Drops a pending centre click without acting on it. */
  public cancel = (): void => {
    if (this.pending) {
      this.pending = null;
      this.clearHover();
    }
  };

  public clearHover = (): void => {
    if (this.app.state.textToolHover) {
      this.app.setState({ textToolHover: null });
    }
  };

  private setHover = (next: AppState["textToolHover"]): void => {
    if (!isSameHover(this.app.state.textToolHover, next)) {
      this.app.setState({ textToolHover: next });
    }
  };

  /** A pointer over the arrow anchors text would attach to, a text cursor over text, a crosshair otherwise. */
  public cursorFor = (target: TextToolTarget | null): string => {
    if (
      target?.type === "endpoint" ||
      (target?.type === "container" && isArrowElement(target.element))
    ) {
      return CURSOR_TYPE.POINTER;
    }
    if (target?.type === "text") {
      return CURSOR_TYPE.TEXT;
    }
    return CURSOR_TYPE.CROSSHAIR;
  };

  public handlePointerDown = (event: PointerEvent, pointerDownState: PointerDownState): void => {
    // while editing, a click outside only ends the edit
    if (this.app.state.editingTextElement) {
      return;
    }
    const sceneX = pointerDownState.origin.x;
    const sceneY = pointerDownState.origin.y;
    const target = this.getTargetAt({ x: sceneX, y: sceneY }, event);

    switch (target.type) {
      case "endpoint":
        this.app.text.startTextEditing({
          sceneX,
          sceneY,
          // the binding places it; its width is still the user's to drag
          autoEdit: false,
          arrowEndpoint: target.endpoint,
          textElement: null,
        });
        break;
      case "text":
        this.app.text.startTextEditing({
          sceneX,
          sceneY,
          textElement: target.element,
          autoEdit: false,
          initialCaretSceneCoords: { x: sceneX, y: sceneY },
        });
        break;
      case "container":
        // decided on the way out; the affordance stays meanwhile, as a tap
        // has no hover before it
        this.pending = { containerId: target.element.id, origin: { x: sceneX, y: sceneY } };
        this.setHover(toHoverState(target));
        return;
      case "free":
        this.app.text.startTextEditing({
          sceneX,
          sceneY,
          container: null,
          textElement: null,
          insertAtParentCenter: false,
          autoEdit: false,
        });
        break;
    }
    this.finish();
  };

  /**
   * A pending centre click moved past the autowrap threshold (horizontally,
   * on screen) is a drag: free text at the origin, sized by the drag from
   * here. Returns whether a pending click owned the move.
   */
  public handlePointerMove = (event: PointerEvent, pointerDownState: PointerDownState): boolean => {
    if (!this.pending) {
      return false;
    }
    if (this.app.state.activeTool.type !== "text") {
      this.cancel();
      return true;
    }
    const pointerCoords = viewportCoordsToSceneCoords(event, this.app.state);
    if (this.isDrag(pointerCoords)) {
      this.resolvePending(true, pointerCoords, pointerDownState, event);
    }
    return true;
  };

  /** A genuine pointer up binds the label; a replayed or orphaned one drops it. */
  public handlePointerUp = (event: PointerEvent, pointerDownState: PointerDownState): void => {
    if (!this.pending) {
      return;
    }
    if (event.type !== "pointerup" || this.app.state.activeTool.type !== "text") {
      this.cancel();
      return;
    }
    const pointerCoords = viewportCoordsToSceneCoords(event, this.app.state);
    this.resolvePending(this.isDrag(pointerCoords), pointerCoords, pointerDownState, event);
  };

  private isDrag = (pointerCoords: ScenePoint): boolean =>
    !!this.pending &&
    Math.abs(pointerCoords.x - this.pending.origin.x) * this.app.state.zoom.value >
      TEXT_AUTOWRAP_THRESHOLD;

  private resolvePending = (
    isDrag: boolean,
    pointerCoords: ScenePoint,
    pointerDownState: PointerDownState,
    event: PointerEvent,
  ): void => {
    if (!this.pending) {
      return;
    }
    const { containerId, origin } = this.pending;
    this.pending = null;
    // gone mid-press: nothing to create, but the click still ends the tool's turn
    const container = this.app.scene.getNonDeletedElement(containerId);
    const created = isTextBindableContainer(container, false);
    if (created) {
      this.app.text.startTextEditing({
        sceneX: origin.x,
        sceneY: origin.y,
        container: isDrag ? null : container,
        textElement: null,
        insertAtParentCenter: !isDrag,
        autoEdit: !isDrag,
      });
    }
    this.finish();
    if (created && isDrag) {
      pointerDownState.lastCoords.x = pointerCoords.x;
      pointerDownState.lastCoords.y = pointerCoords.y;
      this.app.maybeDragNewGenericElement(pointerDownState, event);
    }
  };

  /** The click is acted on: the affordance goes, the tool reverts unless locked. */
  private finish = (): void => {
    this.clearHover();
    if (!this.app.isToolLocked()) {
      this.app.setState(
        {
          activeTool: updateActiveTool(this.app.state, {
            type: this.app.state.preferredSelectionTool.type,
          }),
        },
        () => this.app.cursor.reset(),
      );
    } else {
      this.app.cursor.reset();
    }
  };
}
