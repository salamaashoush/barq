import { arrayToMap, invariant } from "@excalidraw/common";
import {
  CaptureUpdateAction,
  isElbowArrow,
  isLineElement,
  isLinearElement,
  newElementWith,
  toggleLinePolygonState,
} from "@excalidraw/element";

import type { ExcalidrawLineElement } from "@excalidraw/element/types";

import { patchLinearEditor } from "../linear.ts";

import type { Action } from "../types.ts";

/**
 * Opens or closes the line editor, where a line's or arrow's points are
 * moved, added and deleted. Enter on a line, Ctrl or Cmd+Enter on an arrow, or
 * a double-click.
 */
export const actionToggleLinearEditor: Action = {
  name: "toggleLinearEditor",
  label: (_elements, appState, app) =>
    app.scene.getSelectedElements({ selectedElementIds: appState.selectedElementIds })[0]?.type ===
    "arrow"
      ? "labels.lineEditor.editArrow"
      : "labels.lineEditor.edit",
  keywords: ["line"],
  announcement: "Line editor toggled",
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

/** Closes the selected lines into polygons, or opens them, all as one. */
export const actionTogglePolygon: Action = {
  name: "togglePolygon",
  label: (_elements, appState, editor) =>
    editor.scene
      .getSelectedElements({ selectedElementIds: appState.selectedElementIds })
      .every((element) => isLineElement(element) && element.polygon)
      ? "labels.polygon.breakPolygon"
      : "labels.polygon.convertToPolygon",
  keywords: ["loop"],
  announcement: "Polygon toggled",
  predicate: (_elements, appState, editor) => {
    const selected = editor.scene.getSelectedElements({
      selectedElementIds: appState.selectedElementIds,
    });
    return (
      selected.length > 0 &&
      selected.every((element) => isLineElement(element) && element.points.length >= 4)
    );
  },
  perform(elements, appState, _formData, editor) {
    const selected = editor.scene.getSelectedElements(appState);
    if (selected.some((element) => !isLineElement(element))) {
      return false;
    }
    const lines = selected as ExcalidrawLineElement[];
    // one that is open closes them all
    const nextPolygonState = lines.some((line) => !line.polygon);
    const linesMap = arrayToMap(lines);
    return {
      elements: elements.map((element) =>
        linesMap.has(element.id) && isLineElement(element)
          ? newElementWith(element, {
              backgroundColor: nextPolygonState ? element.backgroundColor : "transparent",
              ...toggleLinePolygonState(element, nextPolygonState),
            })
          : element,
      ),
      appState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
};
