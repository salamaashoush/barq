import { isArrowKey, KEYS } from "@excalidraw/common";
import {
  CaptureUpdateAction,
  FlowChartCreator,
  FlowChartNavigator,
  getCommonBounds,
  getSelectedElements,
  isElementCompletelyInViewport,
  isFlowchartNodeElement,
  makeNextSelectedElementIds,
} from "@excalidraw/element";

import type { LinkDirection } from "@excalidraw/element";
import type { ExcalidrawElement, NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { zoomToFitBounds } from "../viewport.ts";

import type { PendingExcalidrawElements } from "../types.ts";
import type { DiagramEditor } from "./editor.ts";

type FlowchartOperation =
  | { type: "none" }
  | { type: "canceled" }
  | { type: "creating"; pending: PendingExcalidrawElements }
  | { type: "navigating"; nodeId: ExcalidrawElement["id"] | null }
  | { type: "committed"; nodes: PendingExcalidrawElements }
  | { type: "navigationEnded" };

const getLinkDirectionFromKey = (key: string): LinkDirection => {
  switch (key) {
    case KEYS.ARROW_UP:
      return "up";
    case KEYS.ARROW_DOWN:
      return "down";
    case KEYS.ARROW_LEFT:
      return "left";
    default:
      return "right";
  }
};

/**
 * Flowcharts from the keyboard, Excalidraw's `AppFlowchart`: Ctrl with an
 * arrow key previews new nodes linked from the selected one (more with each
 * press), committed when Ctrl is let go and cancelled with Escape; Alt with
 * an arrow key moves the selection along the links, an undo step when Alt
 * is let go.
 */
export class EditorFlowchart {
  private readonly creator = new FlowChartCreator();
  private readonly navigator = new FlowChartNavigator();

  public constructor(private readonly app: DiagramEditor) {}

  /** The nodes a key press would add, drawn as a preview. */
  public get pendingNodes(): PendingExcalidrawElements | null {
    return this.creator.pendingNodes;
  }

  public get isCreatingChart(): boolean {
    return this.creator.isCreatingChart;
  }

  public clear = (): void => {
    this.creator.clear();
    this.navigator.clear();
  };

  /** Handles a key event; whether it was the flowchart's. */
  public handleKeyEvent = (event: KeyboardEvent): boolean => {
    const operation = this.resolveKeyboardEventToOperation(event);
    switch (operation.type) {
      case "none":
        return false;
      case "canceled":
        this.app.scheduleRender(true);
        return true;
      case "creating":
        event.preventDefault();
        if (operation.pending.length) {
          this.revealIfHidden(operation.pending);
        }
        this.app.scheduleRender(true);
        return true;
      case "navigating": {
        event.preventDefault();
        const node =
          operation.nodeId && this.app.scene.getNonDeletedElementsMap().get(operation.nodeId);
        if (node) {
          this.selectAndReveal(node);
        }
        return true;
      }
      case "committed": {
        if (operation.nodes.length) {
          this.app.insertNewElements(operation.nodes);
        }
        const [firstNode] = operation.nodes;
        if (firstNode) {
          this.selectAndReveal(firstNode);
        }
        this.captureUpdate();
        this.app.scheduleRender(true);
        return true;
      }
      case "navigationEnded":
        this.captureUpdate();
        return true;
    }
    return false;
  };

  private resolveKeyboardEventToOperation(event: KeyboardEvent): FlowchartOperation {
    const { creator, navigator, app } = this;
    if (event.type === "keydown") {
      if (event.key === KEYS.ESCAPE && creator.isCreatingChart) {
        creator.clear();
        return { type: "canceled" };
      }
      if (!isArrowKey(event.key)) {
        return { type: "none" };
      }
      if (event[KEYS.CTRL_OR_CMD] && !event.shiftKey) {
        const selectedElements = getSelectedElements(
          app.scene.getNonDeletedElementsMap(),
          app.state,
        );
        const [only] = selectedElements;
        if (selectedElements.length === 1 && only && isFlowchartNodeElement(only)) {
          creator.createNodes(only, app.state, getLinkDirectionFromKey(event.key), app.scene);
        }
        return { type: "creating", pending: creator.pendingNodes ?? [] };
      }
      if (event.altKey) {
        const elementsMap = app.scene.getNonDeletedElementsMap();
        const selectedElements = getSelectedElements(elementsMap, app.state);
        const [only] = selectedElements;
        if (selectedElements.length === 1 && only) {
          return {
            type: "navigating",
            nodeId: navigator.exploreByDirection(
              only,
              elementsMap,
              getLinkDirectionFromKey(event.key),
            ),
          };
        }
      }
      return { type: "none" };
    }
    // a key up: letting go of a modifier ends what it drove
    const navigationEnded = !event.altKey && navigator.isExploring;
    if (navigationEnded) {
      navigator.clear();
    }
    if (!event[KEYS.CTRL_OR_CMD] && creator.isCreatingChart) {
      const nodes = creator.pendingNodes ?? [];
      creator.clear();
      return { type: "committed", nodes };
    }
    return navigationEnded ? { type: "navigationEnded" } : { type: "none" };
  }

  private selectAndReveal(node: NonDeletedExcalidrawElement): void {
    this.app.setState((prevState) => ({
      selectedElementIds: makeNextSelectedElementIds({ [node.id]: true }, prevState),
    }));
    this.revealIfHidden([node]);
  }

  /** Fits the elements in view when they are not all in it already. */
  private revealIfHidden(elements: readonly NonDeletedExcalidrawElement[]): void {
    const { state } = this.app;
    if (
      !elements.length ||
      isElementCompletelyInViewport(
        [...elements],
        state.width,
        state.height,
        {
          offsetLeft: state.offsetLeft,
          offsetTop: state.offsetTop,
          scrollX: state.scrollX,
          scrollY: state.scrollY,
          zoom: state.zoom,
        },
        this.app.scene.getNonDeletedElementsMap(),
      )
    ) {
      return;
    }
    const { appState } = zoomToFitBounds({
      bounds: getCommonBounds(elements),
      appState: state,
      fit: "scale-down",
    });
    this.app.translateViewport({
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
      zoom: appState.zoom,
    });
  }

  private captureUpdate(): void {
    this.app.syncActionResult({ captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }
}
