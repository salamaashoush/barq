import { arrayToMap, randomInteger, viewportCoordsToSceneCoords } from "@excalidraw/common";
import {
  deepCopyElement,
  duplicateElements,
  isBindableElement,
  newElementWith,
  syncMovedIndices,
  updateBoundElements,
} from "@excalidraw/element";

import { getSelectionStateForElements } from "./selection.ts";

import type { DiagramEditor } from "./editor.ts";
import type { PointerDownState } from "./types.ts";

/**
 * Duplicates the selection being dragged (alt-drag): the originals go back to
 * where the drag started, and the drag continues with the duplicates.
 * Excalidraw's `AppDuplicate.duplicateDraggedSelection`.
 */
export const duplicateDraggedSelection = (
  editor: DiagramEditor,
  pointerDownState: PointerDownState,
  event: PointerEvent,
): void => {
  pointerDownState.hit.hasBeenDuplicated = true;

  const elements = editor.scene.getElementsIncludingDeleted();
  const hitElement = pointerDownState.hit.element;
  const selectedElements = editor.scene.getSelectedElements({
    selectedElementIds: editor.state.selectedElementIds,
    includeBoundTextElement: true,
    includeElementsInFrames: true,
  });
  if (
    hitElement &&
    // the hit element is not selected when alt-dragging the common bounding
    // box over it
    pointerDownState.hit.wasAddedToSelection &&
    !selectedElements.some((element) => element.id === hitElement.id)
  ) {
    selectedElements.push(hitElement);
  }

  const idsOfElementsToDuplicate = new Map(selectedElements.map((el) => [el.id, el]));

  const duplication = duplicateElements({
    type: "in-place",
    elements,
    appState: editor.state,
    randomizeSeed: true,
    idsOfElementsToDuplicate,
    overrides: ({ duplicateElement, origElement }) => ({
      // the original's frame, unless duplicated along with its frame, so that
      // frame membership is worked out again on pointer up
      frameId: duplicateElement.frameId ?? origElement.frameId,
      seed: randomInteger(),
    }),
  });
  const { origIdToDuplicateId, duplicatedElements } = duplication;

  const nextElements = duplication.elementsWithDuplicates.map((element) => {
    if (idsOfElementsToDuplicate.has(element.id)) {
      const original = pointerDownState.originalElements.get(element.id);
      if (original) {
        return newElementWith(element, { x: original.x, y: original.y });
      }
    }
    return element;
  });

  const duplicateElementsMap = arrayToMap(duplicatedElements);
  const elementsWithIndices = syncMovedIndices(nextElements, duplicateElementsMap);

  if (pointerDownState.hit.element) {
    const cloneId = origIdToDuplicateId.get(pointerDownState.hit.element.id);
    pointerDownState.hit.element = (cloneId && duplicateElementsMap.get(cloneId)) || null;
  }
  if (pointerDownState.hit.editedTextId) {
    const cloneId = origIdToDuplicateId.get(pointerDownState.hit.editedTextId);
    pointerDownState.hit.editedTextId = (cloneId && duplicateElementsMap.get(cloneId)?.id) || null;
  }
  pointerDownState.hit.allHitElements = pointerDownState.hit.allHitElements.flatMap((original) => {
    const cloneId = origIdToDuplicateId.get(original.id);
    const clone = cloneId && duplicateElementsMap.get(cloneId);
    return clone ? [clone] : [];
  });

  // the drag goes on from where the duplication happened
  pointerDownState.drag.origin = viewportCoordsToSceneCoords(event, editor.state);

  editor.setState((prevState) => ({
    ...getSelectionStateForElements(
      duplicatedElements,
      editor.scene.getNonDeletedElements(),
      prevState,
    ),
  }));

  editor.scene.replaceAllElements(elementsWithIndices);

  for (const element of duplicatedElements) {
    pointerDownState.originalElements.set(element.id, deepCopyElement(element));
  }

  for (const element of selectedElements) {
    if (
      isBindableElement(element) &&
      element.boundElements?.some((other) => other.type === "arrow")
    ) {
      updateBoundElements(element, editor.scene, {
        renderEnvironment: editor.renderEnvironment,
      });
    }
  }

  editor.maybeCacheVisibleGaps(event, selectedElements, true);
  editor.maybeCacheReferenceSnapPoints(event, selectedElements, true);
};
