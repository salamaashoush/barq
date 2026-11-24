import { CODES, KEYS, isDarwin } from "@excalidraw/common";
import {
  CaptureUpdateAction,
  moveAllLeft,
  moveAllRight,
  moveOneLeft,
  moveOneRight,
} from "@excalidraw/element";

import type { Action } from "../types.ts";

/** One step back in the stacking order. Ctrl or Cmd+[. */
export const actionSendBackward: Action = {
  name: "sendBackward",
  label: "Sent backward",
  perform: (elements, appState, _formData, app) => ({
    elements: moveOneLeft(elements, appState, app.scene),
    appState,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  }),
  keyPriority: 40,
  keyTest: (event) =>
    event[KEYS.CTRL_OR_CMD] && !event.shiftKey && event.code === CODES.BRACKET_LEFT,
};

/** One step forward in the stacking order. Ctrl or Cmd+]. */
export const actionBringForward: Action = {
  name: "bringForward",
  label: "Brought forward",
  perform: (elements, appState, _formData, app) => ({
    elements: moveOneRight(elements, appState, app.scene),
    appState,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  }),
  keyPriority: 40,
  keyTest: (event) =>
    event[KEYS.CTRL_OR_CMD] && !event.shiftKey && event.code === CODES.BRACKET_RIGHT,
};

/** To the back. Ctrl+Shift+[, or Cmd+Alt+[ on macOS. */
export const actionSendToBack: Action = {
  name: "sendToBack",
  label: "Sent to back",
  perform: (elements, appState) => ({
    elements: moveAllLeft(elements, appState),
    appState,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  }),
  keyTest: (event) =>
    isDarwin
      ? event[KEYS.CTRL_OR_CMD] && event.altKey && event.code === CODES.BRACKET_LEFT
      : event[KEYS.CTRL_OR_CMD] && event.shiftKey && event.code === CODES.BRACKET_LEFT,
};

/** To the front. Ctrl+Shift+], or Cmd+Alt+] on macOS. */
export const actionBringToFront: Action = {
  name: "bringToFront",
  label: "Brought to front",
  perform: (elements, appState) => ({
    elements: moveAllRight(elements, appState),
    appState,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  }),
  keyTest: (event) =>
    isDarwin
      ? event[KEYS.CTRL_OR_CMD] && event.altKey && event.code === CODES.BRACKET_RIGHT
      : event[KEYS.CTRL_OR_CMD] && event.shiftKey && event.code === CODES.BRACKET_RIGHT,
};
