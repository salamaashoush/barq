import { arrayToMap, randomInteger, viewportCoordsToSceneCoords } from "@excalidraw/common";
import {
  advanceDuplicatedListMarkers,
  applyListMarkerAdvances,
  deepCopyElement,
  isTextElement,
  duplicateElements,
  isBindableElement,
  newElementWith,
  syncMovedIndices,
  updateBoundElements,
} from "@excalidraw/element";

import { getSelectionStateForElements } from "./selection.ts";

import type { ListMarkerAdvance } from "@excalidraw/element";
import type { ExcalidrawElement, ExcalidrawTextElement } from "@excalidraw/element/types";

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

  // the duplicates' list markers advance from the start of the drag, and are
  // captured on drop (`commitDraggedDuplicates`)
  pointerDownState.hit.advancedListMarkers = advanceDuplicatedListMarkers(
    duplicatedElements,
    editor.scene,
    editor.renderEnvironment,
  );

  // after advancing the markers, which may resize the duplicates
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

/**
 * Runs `update` once what is pending is committed, capturing what it
 * changes (when it returns `true`) as an undo step of its own.
 */
const afterCommit = (editor: DiagramEditor, update: () => boolean): void => {
  editor.afterNextCommit(() => {
    if (update()) {
      editor.store.scheduleCapture();
    }
  });
};

/**
 * Advances the duplicated texts' list markers (`1.` to `2.`) once the
 * duplication is committed, as an undo step of its own, so that undo
 * reverts the markers first.
 */
export const advanceListMarkers = (
  editor: DiagramEditor,
  duplicatedElements: readonly ExcalidrawElement[],
): void => {
  afterCommit(editor, () => {
    const duplicates = duplicatedElements.flatMap(
      (element) => editor.scene.getNonDeletedElement(element.id) ?? [],
    );
    return (
      advanceDuplicatedListMarkers(duplicates, editor.scene, editor.renderEnvironment).length > 0
    );
  });
};

const editDuplicatedText = (
  editor: DiagramEditor,
  elementId: ExcalidrawTextElement["id"],
  listItem: ListMarkerAdvance | null,
): void => {
  const element = editor.scene.getNonDeletedElement(elementId);
  if (
    !element ||
    !isTextElement(element) ||
    (listItem && element.originalText !== listItem.nextOriginalText) ||
    // another interaction has started
    editor.pointerCount > 0
  ) {
    return;
  }
  editor.text.startTextEditing({
    sceneX: element.x,
    sceneY: element.y,
    insertAtParentCenter: false,
    textElement: element,
    initialSelection: { start: listItem?.contentStart ?? 0, end: element.originalText.length },
  });
};

/**
 * On an alt-drag's drop: the list markers advanced with the drag go back,
 * for the drag to be committed as it is, and forth again once it is, as an
 * undo step of their own. A duplicated list item with text after its marker
 * is then edited with that text selected, or else the duplicate of the text
 * whose edit the drag ended.
 */
export const commitDraggedDuplicates = (
  editor: DiagramEditor,
  { hit }: PointerDownState,
  { editText }: { editText: boolean },
): void => {
  const advances = hit.advancedListMarkers;
  const [advance] = advances;
  const listItem =
    advances.length === 1 && advance && advance.contentStart < advance.nextOriginalText.length
      ? advance
      : null;
  const textToEditId = !editText ? null : listItem ? listItem.elementId : hit.editedTextId;
  const editTextOnceCommitted = () => {
    if (textToEditId) {
      afterCommit(editor, () => {
        editDuplicatedText(editor, textToEditId, listItem);
        return false;
      });
    }
  };
  if (!advances.length) {
    editTextOnceCommitted();
    return;
  }
  applyListMarkerAdvances(advances, "prev", editor.scene, editor.renderEnvironment);
  afterCommit(editor, () => {
    applyListMarkerAdvances(advances, "next", editor.scene, editor.renderEnvironment);
    editTextOnceCommitted();
    return true;
  });
};
