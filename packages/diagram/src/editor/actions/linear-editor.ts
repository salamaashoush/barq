import { invariant } from "@excalidraw/common";
import { CaptureUpdateAction, isElbowArrow, isLinearElement } from "@excalidraw/element";

import { patchLinearEditor } from "../linear.ts";

import type { Action } from "../types.ts";

/**
 * Opens or closes the line editor, where a line's or arrow's points are
 * moved, added and deleted. Enter on a line, Ctrl or Cmd+Enter on an arrow, or
 * a double-click.
 */
export const actionToggleLinearEditor: Action = {
  name: "toggleLinearEditor",
  label: "Line editor toggled",
  predicate: (_elements, appState, app) => {
    const selectedElements = app.scene.getSelectedElements(appState);
    const [selected] = selectedElements;
    return (
      !appState.selectedLinearElement?.isEditing &&
      selectedElements.length === 1 &&
      selected !== undefined &&
      isLinearElement(selected) &&
      !isElbowArrow(selected)
    );
  },
  perform(_elements, appState, _formData, app) {
    invariant(appState.selectedLinearElement, "No selected linear element found");
    const selectedElement = app.scene.getElement(appState.selectedLinearElement.elementId);
    invariant(selectedElement, "No selected element found");
    return {
      appState: {
        ...appState,
        selectedLinearElement: patchLinearEditor(appState.selectedLinearElement, {
          isEditing: !appState.selectedLinearElement.isEditing,
        }),
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
};
