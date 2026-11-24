import { CODES, KEYS, arrayToMap } from "@excalidraw/common";
import {
  CaptureUpdateAction,
  bindOrUnbindBindingElements,
  deepCopyElement,
  getCommonBoundingBox,
  getNonDeletedElements,
  getSelectedElements,
  isArrowElement,
  isElbowArrow,
  newElementWith,
  resizeMultipleElements,
  updateElbowArrowRoute,
  updateFrameMembershipOfSelectedElements,
} from "@excalidraw/element";

import type {
  ExcalidrawArrowElement,
  ExcalidrawElement,
  NonDeleted,
  NonDeletedSceneElementsMap,
} from "@excalidraw/element/types";

import type { AppState } from "../../types.ts";
import type { DiagramEditor } from "../editor.ts";
import type { Action } from "../types.ts";

type FlipDirection = "horizontal" | "vertical";

const flipElements = (
  selectedElements: NonDeleted<ExcalidrawElement>[],
  elementsMap: NonDeletedSceneElementsMap,
  direction: FlipDirection,
  editor: DiagramEditor,
): ExcalidrawElement[] => {
  // arrows bound at an end only swap their heads: moving them would unbind them
  if (
    selectedElements.every(
      (element) => isArrowElement(element) && (element.startBinding || element.endBinding),
    )
  ) {
    return selectedElements.map((element) => {
      const arrow = element as ExcalidrawArrowElement;
      const flipped = newElementWith(arrow, {
        startArrowhead: arrow.endArrowhead,
        endArrowhead: arrow.startArrowhead,
      });
      return isElbowArrow(flipped)
        ? newElementWith(flipped, updateElbowArrowRoute(flipped, elementsMap))
        : flipped;
    });
  }

  const { midX, midY } = getCommonBoundingBox(selectedElements);
  resizeMultipleElements(
    selectedElements,
    elementsMap,
    "nw",
    editor.scene,
    new Map([...elementsMap.values()].map((element) => [element.id, deepCopyElement(element)])),
    {
      flipByX: direction === "horizontal",
      flipByY: direction === "vertical",
      shouldResizeFromCenter: true,
      shouldMaintainAspectRatio: true,
      renderEnvironment: editor.renderEnvironment,
    },
  );
  bindOrUnbindBindingElements(selectedElements.filter(isArrowElement), editor.scene, editor.state);

  // arrows bumping against the box's edge move the box: centre it again, so
  // that flips do not walk across the canvas
  const { midX: nextMidX, midY: nextMidY } = getCommonBoundingBox(selectedElements);
  const [dx, dy] = [midX - nextMidX, midY - nextMidY];
  for (const element of selectedElements) {
    editor.scene.mutateElement(element, { x: element.x + dx, y: element.y + dy });
  }
  return selectedElements;
};

const flipSelectedElements = (
  elements: readonly ExcalidrawElement[],
  appState: Readonly<AppState>,
  direction: FlipDirection,
  editor: DiagramEditor,
): ExcalidrawElement[] => {
  const selectedElements = getSelectedElements(getNonDeletedElements(elements), appState, {
    includeBoundTextElement: true,
    includeElementsInFrames: true,
  });
  const updated = arrayToMap(
    flipElements(selectedElements, editor.scene.getNonDeletedElementsMap(), direction, editor),
  );
  return elements.map((element) => updated.get(element.id) ?? element);
};

const flipAction = (
  name: "flipHorizontal" | "flipVertical",
  direction: FlipDirection,
  keyTest: Action["keyTest"],
): Action => ({
  name,
  label: direction === "horizontal" ? "labels.flipHorizontal" : "labels.flipVertical",
  announcement: direction === "horizontal" ? "Flipped horizontally" : "Flipped vertically",
  predicate: (_elements, appState, editor) => editor.scene.getSelectedElements(appState).length > 0,
  perform: (elements, appState, _formData, editor) => ({
    elements: updateFrameMembershipOfSelectedElements(
      flipSelectedElements(elements, appState, direction, editor),
      appState,
      editor.elementApp,
    ),
    appState,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  }),
  keyTest,
});

/** Shift+H. */
export const actionFlipHorizontal = flipAction(
  "flipHorizontal",
  "horizontal",
  (event) => event.shiftKey && !event[KEYS.CTRL_OR_CMD] && !event.altKey && event.code === CODES.H,
);

/** Shift+V. */
export const actionFlipVertical = flipAction(
  "flipVertical",
  "vertical",
  (event) => event.shiftKey && !event[KEYS.CTRL_OR_CMD] && !event.altKey && event.code === CODES.V,
);
