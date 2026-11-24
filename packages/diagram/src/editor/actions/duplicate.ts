import { DEFAULT_GRID_SIZE, KEYS, arrayToMap } from "@excalidraw/common";
import {
  CaptureUpdateAction,
  duplicateElements,
  getNonDeletedElements,
  getSelectedElements,
  LinearElementEditor,
  syncMovedIndices,
} from "@excalidraw/element";

import { getSelectionStateForElements } from "../selection.ts";

import { advanceListMarkers } from "../duplicate.ts";

import type { Action } from "../types.ts";

/**
 * Duplicates the selection, offset by half a grid cell, and selects the
 * copies; in the line editor, duplicates the selected points. Ctrl or Cmd+D.
 */
export const actionDuplicateSelection: Action = {
  name: "duplicateSelection",
  label: "labels.duplicateSelection",
  announcement: "Duplicated",
  perform: (elements, appState, _formData, app) => {
    if (appState.selectedElementsAreBeingDragged) {
      return false;
    }

    if (appState.selectedLinearElement?.isEditing) {
      try {
        const newAppState = LinearElementEditor.duplicateSelectedPoints(appState, app.scene);
        return {
          elements,
          appState: newAppState,
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        };
      } catch {
        return false;
      }
    }

    const { duplicatedElements, elementsWithDuplicates } = duplicateElements({
      type: "in-place",
      elements,
      idsOfElementsToDuplicate: arrayToMap(
        getSelectedElements(elements, appState, {
          includeBoundTextElement: true,
          includeElementsInFrames: true,
        }),
      ),
      appState,
      randomizeSeed: true,
      overrides: ({ origElement, origIdToDuplicateId }) => {
        const duplicateFrameId =
          origElement.frameId && origIdToDuplicateId.get(origElement.frameId);
        return {
          x: origElement.x + DEFAULT_GRID_SIZE / 2,
          y: origElement.y + DEFAULT_GRID_SIZE / 2,
          frameId: duplicateFrameId ?? origElement.frameId,
        };
      },
    });

    advanceListMarkers(app, duplicatedElements);

    return {
      elements: syncMovedIndices(elementsWithDuplicates, arrayToMap(duplicatedElements)),
      appState: {
        ...appState,
        ...getSelectionStateForElements(
          duplicatedElements,
          getNonDeletedElements(elementsWithDuplicates),
          appState,
        ),
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  keyTest: (event) => event[KEYS.CTRL_OR_CMD] && event.key.toLowerCase() === KEYS.D,
};
