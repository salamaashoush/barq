import { KEYS, arrayToMap, randomId } from "@excalidraw/common";
import {
  CaptureUpdateAction,
  elementsAreInSameGroup,
  getNonDeletedElements,
  getSelectedElements,
  newElementWith,
  selectGroupsFromGivenElements,
} from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import type { AppState } from "../../types.ts";
import type { Action } from "../types.ts";

const shouldLock = (elements: readonly ExcalidrawElement[]) => elements.every((el) => !el.locked);

/**
 * Locks the selection, or unlocks it when all of it is locked. A selection of
 * several loose elements locks together, as a group of its own. Ctrl or
 * Cmd+Shift+L.
 */
export const actionToggleElementLock: Action = {
  name: "toggleElementLock",
  label: (_elements, appState, app) =>
    shouldLock(
      app.scene.getSelectedElements({
        selectedElementIds: appState.selectedElementIds,
        includeBoundTextElement: false,
      }),
    )
      ? "labels.elementLock.lock"
      : "labels.elementLock.unlock",
  announcement: "Lock toggled",
  predicate: (_elements, appState, app) => {
    const selectedElements = app.scene.getSelectedElements(appState);
    return (
      selectedElements.length > 0 &&
      !selectedElements.some((element) => element.locked && element.frameId)
    );
  },
  perform: (elements, appState, _formData, app) => {
    const selectedElements = app.scene.getSelectedElements({
      selectedElementIds: appState.selectedElementIds,
      includeBoundTextElement: true,
      includeElementsInFrames: true,
    });

    const [first] = selectedElements;
    if (!first) {
      return false;
    }

    const nextLockState = shouldLock(selectedElements);
    const selectedElementsMap = arrayToMap(selectedElements);

    const isAGroup = selectedElements.length > 1 && elementsAreInSameGroup(selectedElements);
    const isASingleUnit = selectedElements.length === 1 || isAGroup;
    const newGroupId = isASingleUnit ? null : randomId();

    let nextLockedMultiSelections = { ...appState.lockedMultiSelections };

    if (nextLockState) {
      nextLockedMultiSelections = {
        ...appState.lockedMultiSelections,
        ...(newGroupId ? { [newGroupId]: true as const } : {}),
      };
    } else if (isAGroup) {
      const groupId = first.groupIds.at(-1);
      if (groupId !== undefined) delete nextLockedMultiSelections[groupId];
    }

    const nextElements = elements.map((element) => {
      if (!selectedElementsMap.has(element.id)) {
        return element;
      }

      let nextGroupIds = element.groupIds;

      // locking several elements together groups them; unlocking ungroups
      if (nextLockState) {
        if (newGroupId) {
          nextGroupIds = [...nextGroupIds, newGroupId];
        }
      } else {
        nextGroupIds = nextGroupIds.filter((groupId) => !appState.lockedMultiSelections[groupId]);
      }

      return newElementWith(element, {
        locked: nextLockState,
        groupIds: nextGroupIds.length !== element.groupIds.length ? nextGroupIds : element.groupIds,
      });
    });

    const nextElementsMap = arrayToMap(nextElements);
    const nextSelectedElementIds: AppState["selectedElementIds"] = nextLockState
      ? {}
      : Object.fromEntries(selectedElements.map((el) => [el.id, true]));
    const unlockedSelectedElements = selectedElements.map((el) => nextElementsMap.get(el.id) ?? el);
    const nextSelectedGroupIds = nextLockState
      ? {}
      : selectGroupsFromGivenElements(getNonDeletedElements(unlockedSelectedElements), appState);

    const activeLockedId = nextLockState
      ? (newGroupId ?? (isAGroup ? (first.groupIds.at(-1) ?? null) : first.id))
      : null;

    return {
      elements: nextElements,
      appState: {
        ...appState,
        selectedElementIds: nextSelectedElementIds,
        selectedGroupIds: nextSelectedGroupIds,
        selectedLinearElement: nextLockState ? null : appState.selectedLinearElement,
        lockedMultiSelections: nextLockedMultiSelections,
        activeLockedId,
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  keyTest: (event, appState, _elements, app) =>
    event.key.toLocaleLowerCase() === KEYS.L &&
    event[KEYS.CTRL_OR_CMD] &&
    event.shiftKey &&
    app.scene.getSelectedElements({
      selectedElementIds: appState.selectedElementIds,
      includeBoundTextElement: false,
    }).length > 0,
};

/** Unlocks every locked element and selects them. Ctrl or Cmd+Shift+L with nothing selected. */
export const actionUnlockAllElements: Action = {
  name: "unlockAllElements",
  label: "labels.elementLock.unlockAll",
  announcement: "Unlocked all",
  predicate: (elements, appState) =>
    getSelectedElements(elements, appState).length === 0 &&
    elements.some((element) => element.locked),
  perform: (elements, appState) => {
    const lockedElements = elements.filter((el) => el.locked);

    const nextElements = elements.map((element) => {
      if (element.locked) {
        const nextGroupIds = element.groupIds.filter((gid) => !appState.lockedMultiSelections[gid]);
        return newElementWith(element, {
          locked: false,
          groupIds:
            element.groupIds.length !== nextGroupIds.length ? nextGroupIds : element.groupIds,
        });
      }
      return element;
    });

    const nextElementsMap = arrayToMap(nextElements);
    const unlockedElements = getNonDeletedElements(
      lockedElements.map((el) => nextElementsMap.get(el.id) ?? el),
    );

    return {
      elements: nextElements,
      appState: {
        ...appState,
        selectedElementIds: Object.fromEntries(unlockedElements.map((el) => [el.id, true])),
        selectedGroupIds: selectGroupsFromGivenElements(unlockedElements, appState),
        lockedMultiSelections: {},
        activeLockedId: null,
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  keyTest: (event, appState, elements) =>
    event.key.toLocaleLowerCase() === KEYS.L &&
    event[KEYS.CTRL_OR_CMD] &&
    event.shiftKey &&
    getSelectedElements(elements, appState).length === 0 &&
    elements.some((element) => element.locked && !element.isDeleted),
};
