import { KEYS, arrayToMap, randomId } from "@excalidraw/common";
import {
  addToGroup,
  CaptureUpdateAction,
  frameAndChildrenSelectedTogether,
  getElementsInGroup,
  getElementsInResizingFrame,
  getFrameLikeElements,
  getNonDeletedElements,
  getRootElements,
  getSelectedGroupIds,
  groupByFrameLikes,
  isBoundToContainer,
  isElementInGroup,
  newElementWith,
  removeElementsFromFrame,
  removeFromSelectedGroups,
  replaceAllElementsInFrame,
  selectGroup,
  syncMovedIndices,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";

import { selectGroupsForSelectedElements } from "../selection.ts";

import type { AppState } from "../../types.ts";
import type { DiagramEditor } from "../editor.ts";
import type { Action } from "../types.ts";

const allElementsInSameGroup = (
  elements: readonly ExcalidrawElement[],
  editingGroupId: AppState["editingGroupId"],
) => {
  const [first] = elements;
  if (elements.length >= 2 && first) {
    const editingGroupIndex = editingGroupId ? first.groupIds.indexOf(editingGroupId) : -1;
    const groupIds =
      editingGroupIndex > -1 ? first.groupIds.slice(0, editingGroupIndex) : first.groupIds;
    for (const groupId of groupIds) {
      if (elements.every((element) => isElementInGroup(element, groupId))) {
        return true;
      }
    }
  }
  return false;
};

const enableActionGroup = (appState: AppState, app: DiagramEditor) => {
  const selectedElements = app.scene.getSelectedElements({
    selectedElementIds: appState.selectedElementIds,
    includeBoundTextElement: false,
  });
  return (
    selectedElements.length >= 2 &&
    !allElementsInSameGroup(selectedElements, appState.editingGroupId) &&
    !frameAndChildrenSelectedTogether(selectedElements)
  );
};

/** Groups the selection. Ctrl or Cmd+G. */
export const actionGroup: Action = {
  name: "group",
  label: "Grouped",
  perform: (elements, appState, _formData, app) => {
    if (!enableActionGroup(appState, app)) {
      return false;
    }
    const selectedElements = getRootElements(
      app.scene.getSelectedElements({
        selectedElementIds: appState.selectedElementIds,
        includeBoundTextElement: true,
      }),
    );
    if (selectedElements.length < 2) {
      return { appState, elements, captureUpdate: CaptureUpdateAction.EVENTUALLY };
    }

    // everything already in one group: nothing to do
    const selectedGroupIds = getSelectedGroupIds(appState);
    const [selectedGroupId] = selectedGroupIds;
    if (selectedGroupIds.length === 1 && selectedGroupId !== undefined) {
      const elementIdsInGroup = new Set(
        getElementsInGroup(elements, selectedGroupId).map((element) => element.id),
      );
      const combined = new Set([
        ...elementIdsInGroup,
        ...selectedElements.map((element) => element.id),
      ]);
      if (combined.size === elementIdsInGroup.size) {
        return { appState, elements, captureUpdate: CaptureUpdateAction.EVENTUALLY };
      }
    }

    let nextElements = [...elements];

    // grouping elements from different frames takes them out of their frames
    if (new Set(selectedElements.map((element) => element.frameId)).size > 1) {
      for (const elementsInFrame of groupByFrameLikes(selectedElements).values()) {
        removeElementsFromFrame(elementsInFrame, app.scene.getNonDeletedElementsMap());
      }
    }

    const newGroupId = randomId();
    const selectElementIds = arrayToMap(selectedElements);

    nextElements = nextElements.map((element) =>
      selectElementIds.get(element.id)
        ? newElementWith(element, {
            groupIds: addToGroup(element.groupIds, newGroupId, appState.editingGroupId),
          })
        : element,
    );

    // the group keeps its inner stacking order and moves up to its topmost
    // element's place
    const elementsInGroup = getElementsInGroup(nextElements, newGroupId);
    const lastElementInGroup = elementsInGroup[elementsInGroup.length - 1];
    const lastGroupElementIndex = nextElements.lastIndexOf(
      lastElementInGroup as OrderedExcalidrawElement,
    );
    const elementsAfterGroup = nextElements.slice(lastGroupElementIndex + 1);
    const elementsBeforeGroup = nextElements
      .slice(0, lastGroupElementIndex)
      .filter((updatedElement) => !isElementInGroup(updatedElement, newGroupId));
    const reorderedElements = syncMovedIndices(
      [...elementsBeforeGroup, ...elementsInGroup, ...elementsAfterGroup],
      arrayToMap(elementsInGroup),
    );

    return {
      appState: {
        ...appState,
        ...selectGroup(
          newGroupId,
          { ...appState, selectedGroupIds: {} },
          getNonDeletedElements(nextElements),
        ),
      },
      elements: reorderedElements,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  predicate: (_elements, appState, app) => enableActionGroup(appState, app),
  keyTest: (event) =>
    !event.shiftKey && event[KEYS.CTRL_OR_CMD] && event.key.toLowerCase() === KEYS.G,
};

/** Ungroups the selected groups. Ctrl or Cmd+Shift+G. */
export const actionUngroup: Action = {
  name: "ungroup",
  label: "Ungrouped",
  perform: (elements, appState, _formData, app) => {
    const groupIds = getSelectedGroupIds(appState);
    const elementsMap = arrayToMap(elements);

    if (groupIds.length === 0) {
      return { appState, elements, captureUpdate: CaptureUpdateAction.EVENTUALLY };
    }

    let nextElements = [...elements];

    const boundTextElementIds: ExcalidrawTextElement["id"][] = [];
    nextElements = nextElements.map((element) => {
      if (isBoundToContainer(element)) {
        boundTextElementIds.push(element.id);
      }
      const nextGroupIds = removeFromSelectedGroups(element.groupIds, appState.selectedGroupIds);
      if (nextGroupIds.length === element.groupIds.length) {
        return element;
      }
      return newElementWith(element, { groupIds: nextGroupIds });
    });

    const updateAppState = selectGroupsForSelectedElements(
      appState,
      getNonDeletedElements(nextElements),
      appState,
      null,
    );

    const selectedElements = app.scene.getSelectedElements(appState);
    const selectedElementFrameIds = new Set(
      selectedElements.flatMap((element) => (element.frameId ? [element.frameId] : [])),
    );
    const targetFrames = getFrameLikeElements(elements).filter((frame) =>
      selectedElementFrameIds.has(frame.id),
    );
    for (const frame of targetFrames) {
      nextElements = replaceAllElementsInFrame(
        nextElements,
        getElementsInResizingFrame(nextElements, frame, appState, elementsMap),
        frame,
      );
    }

    // bound text is never selected on its own
    updateAppState.selectedElementIds = Object.entries(updateAppState.selectedElementIds).reduce(
      (acc: { [key: ExcalidrawElement["id"]]: true }, [id, selected]) => {
        if (selected && !boundTextElementIds.includes(id)) {
          acc[id] = true;
        }
        return acc;
      },
      {},
    );

    return {
      appState: { ...appState, ...updateAppState },
      elements: nextElements,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  keyTest: (event) =>
    event.shiftKey && event[KEYS.CTRL_OR_CMD] && event.key.toLowerCase() === KEYS.G,
  predicate: (_elements, appState) => getSelectedGroupIds(appState).length > 0,
};
