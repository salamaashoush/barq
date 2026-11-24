import {
  KEYS,
  arrayToMap,
  invariant,
  shouldRotateWithDiscreteAngle,
  updateActiveTool,
} from "@excalidraw/common";
import {
  bindOrUnbindBindingElement,
  CaptureUpdateAction,
  isBindingElement,
  isFreeDrawElement,
  isInvisiblySmallElement,
  isLinearElement,
  isLineElement,
  isPathALoop,
  isValidPolygon,
  LinearElementEditor,
  newElementWith,
  removeArrowsWithoutEndInFrame,
} from "@excalidraw/element";
import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";
import type {
  ExcalidrawElement,
  ExcalidrawLinearElement,
  NonDeleted,
  PointsPositionUpdates,
} from "@excalidraw/element/types";

import { TOGGLE_TOOLS } from "../tools.ts";
import { patchLinearEditor } from "../linear.ts";

import type { AppState } from "../../types.ts";
import type { Action } from "../types.ts";

export interface FinalizeData {
  event: PointerEvent;
  sceneCoords: { x: number; y: number };
  hitBoundText?: boolean;
}

/**
 * Ends what is being drawn or edited: a multi-point line or arrow (binding
 * its end), a freedraw stroke, or the line editor; closes a line whose ends
 * meet into a polygon. Escape or Enter while drawing a line.
 */
export const actionFinalize: Action<FinalizeData> = {
  name: "finalize",
  label: "",
  perform: (elements, appState, data, app) => {
    let shouldCommit = true;
    let newElements = elements;
    const { scene } = app;
    const elementsMap = scene.getNonDeletedElementsMap();

    if (data && appState.selectedLinearElement) {
      const { event, sceneCoords } = data;
      const element = LinearElementEditor.getElement(
        appState.selectedLinearElement.elementId,
        elementsMap,
      );

      invariant(element, "Arrow element should exist if selectedLinearElement is set");

      const linearElementEditor = LinearElementEditor.handlePointerUp(
        event,
        appState.selectedLinearElement,
        appState,
        app.scene,
      );

      if (
        isBindingElement(element) &&
        !appState.selectedLinearElement.segmentMidPointHoveredCoords &&
        // a label drag along the arrow moves no endpoint, so it must not
        // rebind either of them
        !data.hitBoundText
      ) {
        const newArrow = !!appState.newElement;

        const selectedPointsIndices =
          newArrow || !appState.selectedLinearElement.selectedPointsIndices
            ? [element.points.length - 1]
            : appState.selectedLinearElement.selectedPointsIndices;

        const angleLocked = shouldRotateWithDiscreteAngle(event);
        const effectiveGridSize = event[KEYS.CTRL_OR_CMD] ? null : app.getEffectiveGridSize();

        const draggedPoints: PointsPositionUpdates = selectedPointsIndices.reduce(
          (map: PointsPositionUpdates, index) => {
            const point = element.points[index];
            map.set(index, {
              point:
                angleLocked && point
                  ? point
                  : LinearElementEditor.createPointAt(
                      element,
                      elementsMap,
                      sceneCoords.x - linearElementEditor.pointerOffset.x,
                      sceneCoords.y - linearElementEditor.pointerOffset.y,
                      effectiveGridSize,
                    ),
            });
            return map;
          },
          new Map(),
        );

        bindOrUnbindBindingElement(
          element,
          draggedPoints,
          sceneCoords.x,
          sceneCoords.y,
          scene,
          appState,
          {
            newArrow,
            altKey: event.altKey,
            angleLocked,
            gridSize: app.getEffectiveGridSize(),
          },
        );
      } else if (isLineElement(element)) {
        if (
          appState.selectedLinearElement?.isEditing &&
          !appState.newElement &&
          !isValidPolygon(element.points)
        ) {
          scene.mutateElement(element, { polygon: false });
        }
      }
      removeArrowsWithoutEndInFrame([element], elementsMap);

      if (linearElementEditor !== appState.selectedLinearElement) {
        if (isInvisiblySmallElement(element)) {
          newElements = newElements.map((el) =>
            el.id === element.id ? newElementWith(el, { isDeleted: true }) : el,
          );
        }

        const activeToolLocked = appState.activeTool?.locked;

        return {
          elements:
            element.points.length < 2 || isInvisiblySmallElement(element)
              ? elements.map((el) =>
                  el.id === element.id ? newElementWith(el, { isDeleted: true }) : el,
                )
              : newElements,
          appState: {
            ...appState,
            cursorButton: "up",
            selectedLinearElement: activeToolLocked
              ? null
              : patchLinearEditor(linearElementEditor, {
                  selectedPointsIndices: null,
                  isEditing: false,
                  initialState: {
                    ...linearElementEditor.initialState,
                    lastClickedPoint: -1,
                  },
                  pointerOffset: { x: 0, y: 0 },
                }),
            selectionElement: null,
            suggestedBinding: null,
            newElement: null,
            multiElement: null,
          },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        };
      }
    }

    app.focusContainer();

    let element: NonDeleted<ExcalidrawElement> | null = null;
    if (appState.multiElement) {
      element = appState.multiElement;
    } else if (appState.newElement?.type === "freedraw" || isBindingElement(appState.newElement)) {
      element = appState.newElement;
    } else {
      const selectedIds = Object.keys(appState.selectedElementIds);
      const candidate =
        selectedIds.length === 1 && selectedIds[0] !== undefined
          ? (elementsMap.get(selectedIds[0]) as NonDeleted<ExcalidrawLinearElement> | undefined)
          : undefined;
      if (candidate) element = candidate;
    }

    if (element) {
      // pen and mouse have hover
      if (
        appState.selectedLinearElement &&
        appState.multiElement &&
        isLinearElement(element) &&
        appState.lastPointerDownWith !== "touch"
      ) {
        const { points } = element;
        const { lastCommittedPoint } = appState.selectedLinearElement;
        if (!lastCommittedPoint || points[points.length - 1] !== lastCommittedPoint) {
          shouldCommit = false;
          scene.mutateElement(element, { points: element.points.slice(0, -1) });
          if (
            isBindingElement(element) &&
            element.endBinding &&
            // slicing the trailing point may leave an arrow of one point
            element.points.length > 1
          ) {
            const lastPoint = element.points[element.points.length - 1];
            if (lastPoint) {
              const draggedPoints: PointsPositionUpdates = new Map([
                [element.points.length - 1, { point: lastPoint, isDragging: false }],
              ]);
              const globalPoint = LinearElementEditor.getPointAtIndexGlobalCoordinates(
                element,
                -1,
                elementsMap,
              );
              bindOrUnbindBindingElement(
                element,
                draggedPoints,
                globalPoint[0],
                globalPoint[1],
                scene,
                appState,
                { newArrow: !!appState.newElement },
              );
            }
          }
        }
      }

      if (isInvisiblySmallElement(element)) {
        const invisible = element;
        newElements = newElements.map((el) =>
          el.id === invisible.id ? newElementWith(el, { isDeleted: true }) : el,
        );
      }

      if (isLinearElement(element) || isFreeDrawElement(element)) {
        // a line whose ends meet closes, its last point set onto its first so
        // that it stays closed at every scale
        const isLoop = isPathALoop(element.points, appState.zoom.value);
        const firstPoint = element.points[0];

        if (isLoop && firstPoint && (isLineElement(element) || isFreeDrawElement(element))) {
          const linePoints = element.points;
          const points: LocalPoint[] = linePoints.map((point, index) =>
            index === linePoints.length - 1 ? pointFrom(firstPoint[0], firstPoint[1]) : point,
          );
          if (isLineElement(element)) {
            scene.mutateElement(element, { points, polygon: true });
          } else {
            scene.mutateElement(element, { points });
          }
        }

        if (isLineElement(element) && !isValidPolygon(element.points)) {
          scene.mutateElement(element, { polygon: false });
        }
      }
    }

    let activeTool: AppState["activeTool"];
    if (TOGGLE_TOOLS.includes(appState.activeTool.type)) {
      activeTool = updateActiveTool(appState, {
        ...(appState.activeTool.lastActiveTool ?? { type: app.state.preferredSelectionTool.type }),
        lastActiveTool: null,
      });
    } else {
      activeTool = updateActiveTool(appState, { type: app.state.preferredSelectionTool.type });
    }

    const isToolLocked = app.isToolLocked();
    const keepActiveTool = (isToolLocked || appState.activeTool.type === "freedraw") && !!element;

    if (!keepActiveTool) {
      app.cursor.applyForTool(activeTool);
    }

    let selectedLinearElement =
      element && isLinearElement(element)
        ? new LinearElementEditor(element, arrayToMap(newElements))
        : appState.selectedLinearElement;

    selectedLinearElement = selectedLinearElement
      ? patchLinearEditor(selectedLinearElement, {
          isEditing: appState.newElement ? false : selectedLinearElement.isEditing,
          initialState: {
            ...selectedLinearElement.initialState,
            lastClickedPoint: -1,
            origin: null,
          },
        })
      : selectedLinearElement;

    return {
      elements: newElements,
      appState: {
        ...appState,
        cursorButton: "up",
        activeTool: keepActiveTool ? appState.activeTool : activeTool,
        activeEmbeddable: null,
        newElement: null,
        selectionElement: null,
        multiElement: null,
        editingTextElement: null,
        suggestedBinding: null,
        frameToHighlight: null,
        selectedElementIds:
          element && !isToolLocked && appState.activeTool.type !== "freedraw"
            ? { ...appState.selectedElementIds, [element.id]: true }
            : appState.selectedElementIds,
        selectedLinearElement,
      },
      captureUpdate: shouldCommit ? CaptureUpdateAction.IMMEDIATELY : CaptureUpdateAction.NEVER,
    };
  },
  keyTest: (event, appState) =>
    (event.key === KEYS.ESCAPE && appState.selectedLinearElement?.isEditing === true) ||
    ((event.key === KEYS.ESCAPE || event.key === KEYS.ENTER) && appState.multiElement !== null),
};
