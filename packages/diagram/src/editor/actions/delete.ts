import { KEYS, updateActiveTool } from "@excalidraw/common";
import {
  CaptureUpdateAction,
  fixBindingsAfterDeletion,
  getContainerElement,
  getElementsInGroup,
  getFrameChildren,
  getNonDeletedElements,
  getSelectedElements,
  isBoundToContainer,
  isElbowArrow,
  isFrameLikeElement,
  isSomeElementSelected,
  LinearElementEditor,
  newElementWith,
} from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { selectGroupsForSelectedElements } from "../selection.ts";
import { patchLinearEditor } from "../linear.ts";

import type { AppState } from "../../types.ts";
import type { DiagramEditor } from "../editor.ts";
import type { Action } from "../types.ts";

const deleteSelectedElements = (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  app: DiagramEditor,
  /** a deleted frame takes its children along, rather than leaving them */
  withFrameChildren: boolean,
) => {
  const framesToBeDeleted = new Set(
    getSelectedElements(
      elements.filter((el) => isFrameLikeElement(el)),
      appState,
    ).map((el) => el.id),
  );
  const isChildOfDeletedFrame = (el: ExcalidrawElement) =>
    !!el.frameId && framesToBeDeleted.has(el.frameId);

  const selectedElementIds: Record<ExcalidrawElement["id"], true> = {};
  const elementsMap = app.scene.getNonDeletedElementsMap();
  const processedElements = new Set<ExcalidrawElement["id"]>();

  for (const frameId of withFrameChildren ? [] : framesToBeDeleted) {
    for (const el of getFrameChildren(elements, frameId)) {
      if (processedElements.has(el.id)) continue;
      if (isBoundToContainer(el)) {
        const containerElement = getContainerElement(el, elementsMap);
        if (containerElement) selectedElementIds[containerElement.id] = true;
      } else {
        selectedElementIds[el.id] = true;
      }
      processedElements.add(el.id);
    }
  }

  let shouldSelectEditingGroup = true;

  const nextElements = elements.map((el) => {
    if (appState.selectedElementIds[el.id] || (withFrameChildren && isChildOfDeletedFrame(el))) {
      const boundElement = isBoundToContainer(el) ? getContainerElement(el, elementsMap) : null;

      if (!withFrameChildren && isChildOfDeletedFrame(el)) {
        shouldSelectEditingGroup = false;
        selectedElementIds[el.id] = true;
        return el;
      }

      if (!withFrameChildren && boundElement && isChildOfDeletedFrame(boundElement)) {
        return el;
      }

      if (el.boundElements) {
        for (const candidate of el.boundElements) {
          const bound = app.scene.getNonDeletedElementsMap().get(candidate.id);
          if (bound && isElbowArrow(bound)) {
            app.scene.mutateElement(bound, {
              startBinding: el.id === bound.startBinding?.elementId ? null : bound.startBinding,
              endBinding: el.id === bound.endBinding?.elementId ? null : bound.endBinding,
            });
          }
        }
      }
      return newElementWith(el, { isDeleted: true });
    }

    // a deleted frame's children leave it and are selected
    if (isChildOfDeletedFrame(el)) {
      shouldSelectEditingGroup = false;
      if (!isBoundToContainer(el)) selectedElementIds[el.id] = true;
      return newElementWith(el, { frameId: null });
    }

    if (isBoundToContainer(el) && appState.selectedElementIds[el.containerId]) {
      return newElementWith(el, { isDeleted: true });
    }
    return el;
  });

  let nextEditingGroupId = appState.editingGroupId;

  // select the next element left in the edited group, or its parent group
  if (shouldSelectEditingGroup && appState.editingGroupId) {
    const elems = getElementsInGroup(nextElements, appState.editingGroupId).filter(
      (el) => !el.isDeleted,
    );
    const [first] = elems;
    if (elems.length > 1) {
      if (first) selectedElementIds[first.id] = true;
    } else {
      nextEditingGroupId = null;
      if (first) {
        selectedElementIds[first.id] = true;
        const editingGroupIdx = first.groupIds.findIndex(
          (groupId) => groupId === appState.editingGroupId,
        );
        const superGroupId = first.groupIds[editingGroupIdx + 1];
        if (superGroupId) {
          const superElems = getElementsInGroup(nextElements, superGroupId).filter(
            (el) => !el.isDeleted,
          );
          if (superElems.length > 1) {
            nextEditingGroupId = superGroupId;
            for (const el of superElems) selectedElementIds[el.id] = true;
          }
        }
      }
    }
  }

  return {
    elements: nextElements,
    appState: {
      ...appState,
      ...selectGroupsForSelectedElements(
        { selectedElementIds, editingGroupId: nextEditingGroupId },
        getNonDeletedElements(nextElements),
        appState,
        null,
      ),
    },
  };
};

const handleGroupEditingState = (
  appState: AppState,
  elements: readonly ExcalidrawElement[],
): AppState => {
  if (appState.editingGroupId) {
    const [sibling] = getElementsInGroup(getNonDeletedElements(elements), appState.editingGroupId);
    if (sibling) {
      return { ...appState, selectedElementIds: { [sibling.id]: true } };
    }
  }
  return appState;
};

/**
 * Deletes the selection, or the line editor's selected points. Delete or
 * Backspace.
 */
export const actionDeleteSelected: Action<{ withFrameChildren?: boolean }> = {
  name: "deleteSelectedElements",
  label: "Deleted",
  perform: (elements, appState, formData, app) => {
    if (appState.selectedLinearElement?.isEditing) {
      const { elementId, selectedPointsIndices } = appState.selectedLinearElement;
      const elementsMap = app.scene.getNonDeletedElementsMap();
      const linearElement = LinearElementEditor.getElement(elementId, elementsMap);
      if (!linearElement) return false;

      // with no point selected, deleting the whole line is more likely a
      // mistake than what was meant
      if (selectedPointsIndices === null) return false;

      if (selectedPointsIndices.length >= linearElement.points.length) {
        const nextElements = elements.map((el) =>
          el.id === linearElement.id ? newElementWith(el, { isDeleted: true }) : el,
        );
        const nextAppState = handleGroupEditingState(appState, nextElements);
        return {
          elements: nextElements,
          appState: { ...nextAppState, selectedLinearElement: null },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        };
      }

      LinearElementEditor.deletePoints(linearElement, app.elementApp, selectedPointsIndices);

      const [firstIndex = 0] = selectedPointsIndices;
      return {
        elements,
        appState: {
          ...appState,
          selectedLinearElement: patchLinearEditor(appState.selectedLinearElement, {
            selectedPointsIndices: firstIndex > 0 ? [firstIndex - 1] : [0],
          }),
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      };
    }

    const deleted = deleteSelectedElements(elements, appState, app, !!formData?.withFrameChildren);
    const nextElements = deleted.elements;
    fixBindingsAfterDeletion(
      nextElements,
      nextElements.filter((el) => el.isDeleted),
    );
    const nextAppState = handleGroupEditingState(deleted.appState, nextElements);

    return {
      elements: nextElements,
      appState: {
        ...nextAppState,
        activeTool: updateActiveTool(appState, { type: app.state.preferredSelectionTool.type }),
        multiElement: null,
        newElement: null,
        activeEmbeddable: null,
        selectedLinearElement: null,
      },
      captureUpdate: isSomeElementSelected(getNonDeletedElements(elements), appState)
        ? CaptureUpdateAction.IMMEDIATELY
        : CaptureUpdateAction.EVENTUALLY,
    };
  },
  keyTest: (event) =>
    (event.key === KEYS.BACKSPACE || event.key === KEYS.DELETE) && !event[KEYS.CTRL_OR_CMD],
};
