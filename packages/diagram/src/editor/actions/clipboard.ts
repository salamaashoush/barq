import { arrayToMap, cloneJSON, CODES, DEFAULT_EXPORT_PADDING, KEYS } from "@excalidraw/common";
import {
  CaptureUpdateAction,
  getElementsOverlappingFrame,
  getNonDeletedElements,
  getSelectedElements,
  getTextFromElements,
  isFrameLikeElement,
  isImageElement,
  isSomeElementSelected,
  isTextElement,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawFrameLikeElement,
  NonDeleted,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import {
  copyBlobToClipboardAsPng,
  copyTextToSystemClipboard,
  copyToClipboard,
  createPasteEvent,
  probablySupportsClipboardBlob,
  probablySupportsClipboardWriteText,
  readSystemClipboard,
} from "../../clipboard.ts";
import { canvasToBlob } from "../../data/blob.ts";
import { errorMessageOf } from "../../i18n.ts";
import { exportScene, getExportConfigFromAppState } from "../../scene/export.ts";
import { actionDeleteSelected } from "./delete.ts";

import type { AppState } from "../../types.ts";
import type { DiagramEditor } from "../editor.ts";
import type { Action, ActionResult } from "../types.ts";

const selectionForClipboard = (appState: AppState, editor: DiagramEditor) =>
  editor.scene.getSelectedElements({
    selectedElementIds: appState.selectedElementIds,
    includeBoundTextElement: true,
    includeElementsInFrames: true,
  });

/** Copies the selection, its frames' children and labels with it, in Excalidraw's clipboard format. */
export const actionCopy: Action<ClipboardEvent> = {
  name: "copy",
  label: "labels.copy",
  announcement: "Copied",
  viewMode: true,
  perform: async (_elements, appState, event, editor) => {
    try {
      await copyToClipboard(selectionForClipboard(appState, editor), editor.getFiles(), event);
    } catch (error) {
      return {
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
        appState: {
          ...appState,
          errorMessage: errorMessageOf(error, { key: "errors.copyToSystemClipboardFailed" }),
        },
      };
    }
    return { captureUpdate: CaptureUpdateAction.EVENTUALLY };
  },
};

/** Reads the system clipboard and pastes it, as a paste event would. */
export const actionPaste: Action = {
  name: "paste",
  label: "labels.paste",
  announcement: "",
  perform: async (_elements, appState, _value, editor) => {
    let types;
    try {
      types = await readSystemClipboard();
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      // the user probably declined
      if (name === "AbortError" || name === "NotAllowedError") {
        return false;
      }
      return {
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
        appState: { ...appState, errorMessage: { key: "errors.asyncPasteFailedOnRead" } },
      };
    }
    try {
      await editor.clipboard.pasteFromClipboard(createPasteEvent({ types }));
    } catch (error) {
      console.error(error);
      return {
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
        appState: { ...appState, errorMessage: { key: "errors.asyncPasteFailedOnParse" } },
      };
    }
    return { captureUpdate: CaptureUpdateAction.EVENTUALLY };
  },
};

/** Copies the selection and deletes it, a frame's children going with it. */
export const actionCut: Action<ClipboardEvent> = {
  name: "cut",
  label: "labels.cut",
  announcement: "Cut",
  perform: (elements, appState, event, editor) => {
    void actionCopy.perform(elements, appState, event, editor);
    return actionDeleteSelected.perform(elements, appState, { withFrameChildren: true }, editor);
  },
  keyTest: (event) => event[KEYS.CTRL_OR_CMD] && event.key === KEYS.X,
};

/**
 * What a copy as an image exports: the selection (a single frame as what it
 * holds), or everything without one. Excalidraw's `prepareElementsForExport`.
 */
export const prepareElementsForExport = (
  allElements: readonly ExcalidrawElement[],
  { selectedElementIds }: Pick<AppState, "selectedElementIds">,
  exportSelectionOnly: boolean,
): {
  exportingFrame: NonDeleted<ExcalidrawFrameLikeElement> | null;
  exportedElements: readonly NonDeletedExcalidrawElement[];
} => {
  const elements = getNonDeletedElements(allElements);
  const elementsMap = arrayToMap(elements);
  const isExportingSelection =
    exportSelectionOnly && isSomeElementSelected(elements, { selectedElementIds });
  let exportingFrame: NonDeleted<ExcalidrawFrameLikeElement> | null = null;
  let exportedElements: readonly NonDeletedExcalidrawElement[] = isExportingSelection
    ? getSelectedElements(elements, { selectedElementIds }, { includeBoundTextElement: true })
    : elements;
  if (isExportingSelection) {
    const [firstElement] = exportedElements;
    if (exportedElements.length === 1 && firstElement && isFrameLikeElement(firstElement)) {
      exportingFrame = firstElement;
      exportedElements = getElementsOverlappingFrame(elements, firstElement, elementsMap);
    } else if (exportedElements.length > 1) {
      exportedElements = getSelectedElements(
        elements,
        { selectedElementIds },
        { includeBoundTextElement: true, includeElementsInFrames: true },
      );
    }
  }
  return { exportingFrame, exportedElements: cloneJSON(exportedElements) };
};

const copyAsImage = async (
  type: "png" | "svg",
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  editor: DiagramEditor,
): Promise<ActionResult> => {
  const { exportedElements, exportingFrame } = prepareElementsForExport(elements, appState, true);
  if (exportedElements.length === 0) {
    return {
      appState: { ...appState, errorMessage: "Cannot export an empty canvas." },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  }
  const data = { elements: exportedElements, appState, files: editor.getFiles() };
  const config = {
    ...getExportConfigFromAppState(appState),
    padding: DEFAULT_EXPORT_PADDING,
    exportingFrame,
  };
  try {
    if (type === "svg") {
      const svg = await exportScene({
        type: "svg",
        data,
        config: { ...config, embedScene: false },
      });
      await copyTextToSystemClipboard(svg.outerHTML);
    } else {
      const canvas = exportScene({ type: "canvas", data, config });
      await copyBlobToClipboardAsPng(canvasToBlob(canvas));
    }
  } catch (error) {
    console.error(error);
    return {
      appState: {
        ...appState,
        errorMessage:
          error instanceof Error && error.name === "CANVAS_POSSIBLY_TOO_BIG"
            ? { key: "canvasError.canvasTooBig" }
            : { key: "errors.copyToSystemClipboardFailed" },
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  }
  return { appState, captureUpdate: CaptureUpdateAction.EVENTUALLY };
};

/** Copies the selection (or everything) to the clipboard as SVG markup, through the export. */
export const actionCopyAsSvg: Action = {
  name: "copyAsSvg",
  label: "labels.copyAsSvg",
  announcement: "Copied as SVG",
  perform: (elements, appState, _value, editor) => copyAsImage("svg", elements, appState, editor),
  predicate: (elements) => probablySupportsClipboardWriteText && elements.length > 0,
};

/** Copies the selection (or everything) to the clipboard as a PNG. Shift+Alt+C. */
export const actionCopyAsPng: Action = {
  name: "copyAsPng",
  label: "labels.copyAsPng",
  announcement: "Copied as PNG",
  perform: (elements, appState, _value, editor) => copyAsImage("png", elements, appState, editor),
  predicate: (elements) => probablySupportsClipboardBlob && elements.length > 0,
  keyTest: (event) => event.code === CODES.C && event.altKey && event.shiftKey,
};

/** Copies the selection's text, as plain text. */
export const actionCopyText: Action = {
  name: "copyText",
  label: "labels.copyText",
  announcement: "Text copied",
  perform: (_elements, appState, _value, editor) => {
    const selectedElements = editor.scene.getSelectedElements({
      selectedElementIds: appState.selectedElementIds,
      includeBoundTextElement: true,
    });
    void copyTextToSystemClipboard(getTextFromElements(selectedElements));
    return { captureUpdate: CaptureUpdateAction.EVENTUALLY };
  },
  predicate: (_elements, appState, editor) =>
    probablySupportsClipboardWriteText &&
    editor.scene
      .getSelectedElements({
        selectedElementIds: appState.selectedElementIds,
        includeBoundTextElement: true,
      })
      .some(isTextElement),
};

/** Opens the crop editor on the selected image. */
export const actionToggleCropEditor: Action = {
  name: "cropEditor",
  label: "helpDialog.cropStart",
  keywords: ["image", "crop"],
  announcement: "Cropping",
  viewMode: true,
  perform: (_elements, appState, _value, editor) => {
    const [selectedElement] = editor.scene.getSelectedElements({
      selectedElementIds: appState.selectedElementIds,
      includeBoundTextElement: true,
    });
    if (!selectedElement || !isImageElement(selectedElement)) {
      return false;
    }
    return {
      appState: { ...appState, isCropping: false, croppingElementId: selectedElement.id },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  predicate: (_elements, appState, editor) => {
    const selectedElements = editor.scene.getSelectedElements(appState);
    const [only] = selectedElements;
    return (
      !appState.croppingElementId && selectedElements.length === 1 && isImageElement(only ?? null)
    );
  },
};
