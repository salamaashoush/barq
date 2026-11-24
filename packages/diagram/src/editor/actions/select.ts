import { KEYS, arrayToMap, isWritableElement, updateActiveTool } from "@excalidraw/common";
import {
  CaptureUpdateAction,
  getElementsInGroup,
  getNonDeletedElements,
  isLinearElement,
  isSomeElementSelected,
  isTextElement,
  LinearElementEditor,
  makeNextSelectedElementIds,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawLinearElement,
  GroupId,
  NonDeleted,
} from "@excalidraw/element/types";

import { hasSelectedIds } from "../../scene-canvas.ts";
import { selectGroupsForSelectedElements } from "../selection.ts";
import { TOGGLE_TOOLS } from "../tools.ts";

import type { AppState } from "../../types.ts";
import type { DiagramEditor } from "../editor.ts";
import type { Action } from "../types.ts";

/** Selects every unlocked element. Ctrl or Cmd+A. */
export const actionSelectAll: Action = {
  name: "selectAll",
  label: "labels.selectAll",
  // the selection it makes is announced
  announcement: "",
  perform: (elements, appState, _formData, app) => {
    if (appState.selectedLinearElement?.isEditing) {
      return false;
    }

    const selectedElementIds = elements
      .filter(
        (element) =>
          !element.isDeleted && !(isTextElement(element) && element.containerId) && !element.locked,
      )
      .reduce((map: Record<ExcalidrawElement["id"], true>, element) => {
        map[element.id] = true;
        return map;
      }, {});

    const [first] = elements;
    return {
      appState: {
        ...appState,
        ...selectGroupsForSelectedElements(
          { editingGroupId: null, selectedElementIds },
          getNonDeletedElements(elements),
          appState,
          app,
        ),
        selectedLinearElement:
          Object.keys(selectedElementIds).length === 1 && first && isLinearElement(first)
            ? new LinearElementEditor(
                first as NonDeleted<ExcalidrawLinearElement>,
                arrayToMap(elements),
              )
            : null,
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  keyTest: (event) => event[KEYS.CTRL_OR_CMD] && event.key.toLowerCase() === KEYS.A,
};

function getNextActiveTool(
  appState: Readonly<AppState>,
  app: DiagramEditor,
): AppState["activeTool"] {
  if (TOGGLE_TOOLS.includes(appState.activeTool.type)) {
    return updateActiveTool(appState, {
      ...(appState.activeTool.lastActiveTool ?? { type: app.state.preferredSelectionTool.type }),
      lastActiveTool: null,
    });
  }
  return updateActiveTool(appState, { type: app.state.preferredSelectionTool.type });
}

/** The group around the edited one, which Escape steps out to. */
function getParentEditingGroupId(
  appState: Readonly<AppState>,
  app: DiagramEditor,
  selectedElementIds: AppState["selectedElementIds"],
): GroupId | null {
  const { editingGroupId } = appState;
  if (!editingGroupId) {
    return null;
  }
  const nonDeletedElements = app.scene.getNonDeletedElements();
  const selectedElements = app.scene.getSelectedElements({
    selectedElementIds,
    elements: nonDeletedElements,
  });
  const candidateElements = selectedElements.length
    ? selectedElements
    : getElementsInGroup(nonDeletedElements, editingGroupId);

  for (const element of candidateElements) {
    const editingGroupIndex = element.groupIds.indexOf(editingGroupId);
    const parent = element.groupIds[editingGroupIndex + 1];
    if (editingGroupIndex !== -1 && parent) {
      return parent;
    }
  }
  return null;
}

/**
 * Escape: steps out of the edited group, selecting it, or clears the
 * selection, and goes back to the selection tool.
 */
export const actionDeselect: Action = {
  name: "deselect",
  announcement: "",
  perform: (_elements, appState, _formData, app) => {
    const activeTool = getNextActiveTool(appState, app);
    app.cursor.applyForTool(activeTool);

    if (appState.editingGroupId) {
      const nonDeletedElements = app.scene.getNonDeletedElements();
      const selectedElementIds =
        Object.keys(appState.selectedElementIds).length > 0
          ? appState.selectedElementIds
          : getElementsInGroup(nonDeletedElements, appState.editingGroupId).reduce(
              (acc: Record<string, true>, element) => {
                acc[element.id] = true;
                return acc;
              },
              {},
            );

      return {
        appState: {
          ...appState,
          ...selectGroupsForSelectedElements(
            {
              editingGroupId: getParentEditingGroupId(appState, app, selectedElementIds),
              selectedElementIds,
            },
            nonDeletedElements,
            appState,
            app,
          ),
          activeEmbeddable: null,
          activeTool,
          selectedLinearElement: null,
          selectionElement: null,
          showHyperlinkPopup: false,
          suggestedBinding: null,
          frameToHighlight: null,
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      };
    }

    return {
      appState: {
        ...appState,
        activeEmbeddable: null,
        activeTool,
        editingGroupId: null,
        selectedElementIds: makeNextSelectedElementIds({}, appState),
        selectedGroupIds: {},
        selectedLinearElement: null,
        selectionElement: null,
        showHyperlinkPopup: false,
        suggestedBinding: null,
        frameToHighlight: null,
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  keyTest: (event, appState, _elements, app) => {
    if (event.key !== KEYS.ESCAPE || isWritableElement(event.target)) {
      return false;
    }
    return (
      !appState.newElement &&
      appState.multiElement === null &&
      !appState.selectedLinearElement?.isEditing &&
      (appState.activeEmbeddable !== null ||
        appState.activeTool.type !== app.state.preferredSelectionTool.type ||
        !!appState.editingGroupId ||
        !!appState.selectedLinearElement ||
        (hasSelectedIds(appState.selectedElementIds) &&
          isSomeElementSelected(app.scene.getNonDeletedElements(), appState)))
    );
  },
};
