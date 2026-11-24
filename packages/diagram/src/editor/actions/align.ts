import { CODES, KEYS, arrayToMap } from "@excalidraw/common";
import {
  alignElements,
  CaptureUpdateAction,
  distributeElements,
  getSelectedElementsByGroup,
  isFrameLikeElement,
  updateFrameMembershipOfSelectedElements,
} from "@excalidraw/element";

import type { Alignment, Distribution } from "@excalidraw/element";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import type { TranslationKey } from "../../i18n.ts";
import type { AppState } from "../../types.ts";
import type { DiagramEditor } from "../editor.ts";
import type { Action } from "../types.ts";

/** Two or more units (elements or groups) are selected, none a frame. */
function alignActionsPredicate(appState: AppState, app: DiagramEditor) {
  const selectedElements = app.scene.getSelectedElements(appState);
  return (
    getSelectedElementsByGroup(selectedElements, app.scene.getNonDeletedElementsMap(), appState)
      .length > 1 && !selectedElements.some((el) => isFrameLikeElement(el))
  );
}

/** Three or more units are selected, none a frame. */
function distributeActionsPredicate(appState: AppState, app: DiagramEditor) {
  const selectedElements = app.scene.getSelectedElements(appState);
  return (
    getSelectedElementsByGroup(selectedElements, app.scene.getNonDeletedElementsMap(), appState)
      .length > 2 && !selectedElements.some((el) => isFrameLikeElement(el))
  );
}

function withUpdated(
  elements: readonly ExcalidrawElement[],
  updatedElements: readonly ExcalidrawElement[],
  appState: AppState,
  app: DiagramEditor,
) {
  const updatedElementsMap = arrayToMap(updatedElements);
  return updateFrameMembershipOfSelectedElements(
    elements.map((element) => updatedElementsMap.get(element.id) ?? element),
    appState,
    app.elementApp,
  );
}

function alignAction(
  name: Action["name"],
  label: TranslationKey,
  announcement: string,
  alignment: Alignment,
  keyTest: Action["keyTest"],
): Action {
  return {
    name,
    label,
    announcement,
    predicate: (_elements, appState, app) => alignActionsPredicate(appState, app),
    perform: (elements, appState, _formData, app) => {
      if (!alignActionsPredicate(appState, app)) {
        return false;
      }
      const updated = alignElements(
        app.scene.getSelectedElements(appState),
        alignment,
        app.scene,
        appState,
        app.renderEnvironment,
      );
      return {
        appState,
        elements: withUpdated(elements, updated, appState, app),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      };
    },
    keyTest,
  };
}

function distributeAction(
  name: Action["name"],
  label: TranslationKey,
  announcement: string,
  distribution: Distribution,
  keyTest: Action["keyTest"],
): Action {
  return {
    name,
    label,
    announcement,
    predicate: (_elements, appState, app) => distributeActionsPredicate(appState, app),
    perform: (elements, appState, _formData, app) => {
      if (!distributeActionsPredicate(appState, app)) {
        return false;
      }
      const updated = distributeElements(
        app.scene.getSelectedElements(appState),
        app.scene.getNonDeletedElementsMap(),
        distribution,
        appState,
        app.scene,
        app.renderEnvironment,
      );
      return {
        appState,
        elements: withUpdated(elements, updated, appState, app),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      };
    },
    keyTest,
  };
}

function ctrlShift(event: KeyboardEvent, key: string) {
  return event[KEYS.CTRL_OR_CMD] && event.shiftKey && !event.altKey && event.key === key;
}

/** Ctrl or Cmd+Shift+Up. */
export const actionAlignTop = alignAction(
  "alignTop",
  "labels.alignTop",
  "Aligned top",
  { position: "start", axis: "y" },
  (event) => ctrlShift(event, KEYS.ARROW_UP),
);

/** Ctrl or Cmd+Shift+Down. */
export const actionAlignBottom = alignAction(
  "alignBottom",
  "labels.alignBottom",
  "Aligned bottom",
  { position: "end", axis: "y" },
  (event) => ctrlShift(event, KEYS.ARROW_DOWN),
);

/** Ctrl or Cmd+Shift+Left. */
export const actionAlignLeft = alignAction(
  "alignLeft",
  "labels.alignLeft",
  "Aligned left",
  { position: "start", axis: "x" },
  (event) => ctrlShift(event, KEYS.ARROW_LEFT),
);

/** Ctrl or Cmd+Shift+Right. */
export const actionAlignRight = alignAction(
  "alignRight",
  "labels.alignRight",
  "Aligned right",
  { position: "end", axis: "x" },
  (event) => ctrlShift(event, KEYS.ARROW_RIGHT),
);

/**
 * Centres vertically. Alt+Shift+V, a shortcut Excalidraw leaves the centring
 * actions without; distributing is Alt+V.
 */
export const actionAlignVerticallyCentered = alignAction(
  "alignVerticallyCentered",
  "labels.centerVertically",
  "Centred vertically",
  { position: "center", axis: "y" },
  (event) => !event[KEYS.CTRL_OR_CMD] && event.altKey && event.shiftKey && event.code === CODES.V,
);

/** Centres horizontally. Alt+Shift+H. */
export const actionAlignHorizontallyCentered = alignAction(
  "alignHorizontallyCentered",
  "labels.centerHorizontally",
  "Centred horizontally",
  { position: "center", axis: "x" },
  (event) => !event[KEYS.CTRL_OR_CMD] && event.altKey && event.shiftKey && event.code === CODES.H,
);

/** Spaces the selection evenly across. Alt+H. */
export const actionDistributeHorizontally = distributeAction(
  "distributeHorizontally",
  "labels.distributeHorizontally",
  "Distributed horizontally",
  { space: "between", axis: "x" },
  (event) => !event[KEYS.CTRL_OR_CMD] && event.altKey && !event.shiftKey && event.code === CODES.H,
);

/** Spaces the selection evenly down. Alt+V. */
export const actionDistributeVertically = distributeAction(
  "distributeVertically",
  "labels.distributeVertically",
  "Distributed vertically",
  { space: "between", axis: "y" },
  (event) => !event[KEYS.CTRL_OR_CMD] && event.altKey && !event.shiftKey && event.code === CODES.V,
);
