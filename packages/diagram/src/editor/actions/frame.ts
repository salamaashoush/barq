import { arrayToMap } from "@excalidraw/common";
import {
  addElementsToFrame,
  boundsContainBounds,
  CaptureUpdateAction,
  doBoundsIntersect,
  fixBindingsAfterDeletion,
  getCommonBounds,
  getElementBounds,
  getElementsInGroup,
  getElementsInNewFrame,
  getFrameChildren,
  getNonDeletedElements,
  getSelectedElements,
  isBoundToContainer,
  isFrameLikeElement,
  isImageElement,
  mutateElement,
  newFrameElement,
  removeAllElementsFromFrame,
  syncMovedIndices,
} from "@excalidraw/element";

import type { Bounds } from "@excalidraw/common";
import type {
  ElementsMap,
  ExcalidrawElement,
  ExcalidrawFrameLikeElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import { getSelectionStateForElements } from "../selection.ts";

import type { AppState } from "../../types.ts";
import type { DiagramEditor } from "../editor.ts";
import type { Action, ActionResult } from "../types.ts";

const isSingleFrameSelected = (appState: AppState, editor: DiagramEditor): boolean => {
  const selectedElements = editor.scene.getSelectedElements(appState);
  return selectedElements.length === 1 && isFrameLikeElement(selectedElements[0] ?? null);
};

/** Selects the selected frame's children instead of it. */
export const actionSelectAllElementsInFrame: Action = {
  name: "selectAllElementsInFrame",
  label: "",
  perform: (elements, appState, _value, editor) => {
    const selectedElement = editor.scene.getSelectedElements(appState).at(0) ?? null;
    if (!isFrameLikeElement(selectedElement)) {
      return { elements, appState, captureUpdate: CaptureUpdateAction.EVENTUALLY };
    }
    const elementsInFrame = getFrameChildren(
      getNonDeletedElements(elements),
      selectedElement.id,
    ).filter((element) => !(element.type === "text" && element.containerId));
    const selectedElementIds: Record<ExcalidrawElement["id"], true> = {};
    for (const element of elementsInFrame) selectedElementIds[element.id] = true;
    return {
      elements,
      appState: { ...appState, selectedElementIds },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  predicate: (_elements, appState, editor) => isSingleFrameSelected(appState, editor),
};

/** Takes every child out of the selected frame, which stays. */
export const actionRemoveAllElementsFromFrame: Action = {
  name: "removeAllElementsFromFrame",
  label: "Frame emptied",
  perform: (elements, appState, _value, editor) => {
    const selectedElement = editor.scene.getSelectedElements(appState).at(0) ?? null;
    if (!isFrameLikeElement(selectedElement)) {
      return { elements, appState, captureUpdate: CaptureUpdateAction.EVENTUALLY };
    }
    return {
      elements: removeAllElementsFromFrame(elements, selectedElement),
      appState: { ...appState, selectedElementIds: { [selectedElement.id]: true } },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  predicate: (_elements, appState, editor) => isSingleFrameSelected(appState, editor),
};

/** Draws frames, their clipping and their names, or not. */
export const actionUpdateFrameRendering: Action = {
  name: "updateFrameRendering",
  label: "Frame rendering toggled",
  viewMode: true,
  perform: (elements, appState) => ({
    elements,
    appState: {
      ...appState,
      frameRendering: { ...appState.frameRendering, enabled: !appState.frameRendering.enabled },
    },
    captureUpdate: CaptureUpdateAction.EVENTUALLY,
  }),
};

const FRAME_PADDING = 16;

/**
 * The frame wrapping the selection removes instead: the one frame the
 * selection holds (with any of its children), or, with no frame selected,
 * the frame whose children are all selected.
 */
export const getFrameToUnwrap = (
  selectedElements: readonly ExcalidrawElement[],
  elementsMap: ElementsMap,
): ExcalidrawFrameLikeElement | null => {
  const elements = selectedElements.filter((element) => !isBoundToContainer(element));
  const frames = elements.filter((element) => isFrameLikeElement(element));
  if (frames.length > 1) {
    return null;
  }
  const frameId = frames[0]?.id ?? elements[0]?.frameId;
  const frame = frameId ? elementsMap.get(frameId) : null;
  if (!frame || frame.isDeleted || !isFrameLikeElement(frame)) {
    return null;
  }
  const selectedChildren = elements.filter((element) => element.frameId === frame.id);
  if (selectedChildren.length + frames.length !== elements.length) {
    return null;
  }
  if (frames.length) {
    return frame;
  }
  // with no frame selected, all of its children have to be
  const children = getFrameChildren(elementsMap, frame.id).filter(
    (element) => !element.isDeleted && !isBoundToContainer(element),
  );
  return children.length === selectedChildren.length ? frame : null;
};

/** Removes the frame, its children selected in its place. */
export const unwrapFrame = (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  frame: ExcalidrawFrameLikeElement,
  editor: DiagramEditor,
): ActionResult => {
  const children = getNonDeletedElements(getFrameChildren(elements, frame.id));
  removeAllElementsFromFrame(elements, frame);
  editor.scene.mutateElement(frame, { isDeleted: true });
  fixBindingsAfterDeletion(elements, [frame]);
  return {
    elements,
    appState: {
      ...appState,
      ...getSelectionStateForElements(children, getNonDeletedElements(elements), {
        ...appState,
        editingGroupId: null,
      }),
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  };
};

const padBounds = ([x1, y1, x2, y2]: Bounds, padding: number) => ({
  x: x1 - padding,
  y: y1 - padding,
  width: x2 - x1 + padding * 2,
  height: y2 - y1 + padding * 2,
});

/** The deselected elements framed with the selection: within its bounds, or out by the padding. */
const getElementsFramedWithSelection = (
  selectedElements: readonly NonDeletedExcalidrawElement[],
  selectionBounds: Bounds,
  editor: DiagramEditor,
): ExcalidrawElement[] => {
  const elementsMap = editor.scene.getNonDeletedElementsMap();
  const selected = new Set<ExcalidrawElement>(selectedElements);
  const overlapsSelection = (element: ExcalidrawElement) =>
    doBoundsIntersect(getElementBounds(element, elementsMap), selectionBounds);
  return getElementsInNewFrame(
    editor.scene.getNonDeletedElements(),
    newFrameElement(padBounds(selectionBounds, FRAME_PADDING)),
    elementsMap,
  ).flatMap((element) => {
    if (selected.has(element)) {
      return [];
    }
    // groups go in whole, as when dragged into a frame
    const groupId = element.groupIds.at(-1);
    const group = groupId ? getElementsInGroup(elementsMap, groupId) : [element];
    return group.some(overlapsSelection) ? group : [];
  });
};

/** Wraps the selection in a new frame, with what lies within it; edge to edge on an image. */
export const wrapInFrame = (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  selectedElements: NonDeletedExcalidrawElement[],
  editor: DiagramEditor,
): ActionResult => {
  const elementsMap = editor.scene.getNonDeletedElementsMap();
  const selectionBounds = getCommonBounds(selectedElements, elementsMap);
  const children = new Set<ExcalidrawElement>([
    ...selectedElements,
    ...getElementsFramedWithSelection(selectedElements, selectionBounds, editor),
  ]);
  // an image framed with what is drawn on it keeps no margin
  const isImageFrame = selectedElements.some(
    (element) =>
      isImageElement(element) &&
      boundsContainBounds(getElementBounds(element, elementsMap), selectionBounds),
  );
  const frame = newFrameElement(
    isImageFrame
      ? padBounds(selectionBounds, 0)
      : padBounds(getCommonBounds([...children], elementsMap), FRAME_PADDING),
  );

  // a part of a group leaves the rest of it
  if (appState.editingGroupId) {
    for (const elementInGroup of getElementsInGroup(selectedElements, appState.editingGroupId)) {
      const index = elementInGroup.groupIds.indexOf(appState.editingGroupId);
      mutateElement(elementInGroup, elementsMap, {
        groupIds: elementInGroup.groupIds.slice(0, index),
      });
    }
  }

  // the frame takes its lowest child's place, below what is on top of it
  const sceneElements = editor.scene.getElementsIncludingDeleted();
  const frameIndex = sceneElements.findIndex((element) => children.has(element));
  const nextElements = addElementsToFrame(
    syncMovedIndices(
      [...sceneElements.slice(0, frameIndex), frame, ...sceneElements.slice(frameIndex)],
      arrayToMap([frame]),
    ),
    sceneElements.filter((element) => children.has(element)),
    frame,
  );
  return {
    elements: nextElements,
    appState: {
      ...appState,
      ...getSelectionStateForElements([frame], getNonDeletedElements(nextElements), appState),
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  };
};

/** Wraps the selection in a frame, or unwraps the frame it is all of. */
export const actionWrapSelectionInFrame: Action = {
  name: "wrapSelectionInFrame",
  label: "Framed",
  predicate: (elements, appState) => {
    const selectedElements = getSelectedElements(elements, appState);
    return (
      selectedElements.length > 0 &&
      !selectedElements.some((element) => isFrameLikeElement(element))
    );
  },
  perform: (elements, appState, _value, editor) => {
    const selectedElements = getSelectedElements(elements, appState);
    const frameToUnwrap = getFrameToUnwrap(
      selectedElements,
      editor.scene.getNonDeletedElementsMap(),
    );
    return frameToUnwrap
      ? unwrapFrame(elements, appState, frameToUnwrap, editor)
      : wrapInFrame(elements, appState, selectedElements, editor);
  },
};
