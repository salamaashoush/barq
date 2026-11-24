import { getDateTime, KEYS } from "@excalidraw/common";
import { CaptureUpdateAction, syncInvalidIndices } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawFrameLikeElement,
  NonDeleted,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import { isImageFileHandle } from "../../data/blob.ts";
import {
  type ExportCanvasType,
  type JSONExportData,
  exportCanvas,
  loadFromJSON,
  resaveAsImageWithScene,
  saveAsJSON,
} from "../../data/files.ts";
import { ImageSceneDataError } from "../../errors.ts";
import { errorMessageOf } from "../../i18n.ts";

import type { AppState, BinaryFiles } from "../../types.ts";
import type { DiagramEditor } from "../editor.ts";
import type { Action, ActionResult } from "../types.ts";

/** The export's scale, 1, 2 or 3 times. */
export const actionChangeExportScale: Action<AppState["exportScale"]> = {
  name: "changeExportScale",
  label: "imageExportDialog.label.scale",
  announcement: "",
  viewMode: true,
  perform: (_elements, appState, value) => ({
    appState: { ...appState, exportScale: value ?? appState.exportScale },
    captureUpdate: CaptureUpdateAction.EVENTUALLY,
  }),
};

/** Whether the export draws the canvas's background. */
export const actionChangeExportBackground: Action<AppState["exportBackground"]> = {
  name: "changeExportBackground",
  label: "imageExportDialog.label.withBackground",
  announcement: "",
  viewMode: true,
  perform: (_elements, appState, value) => ({
    appState: { ...appState, exportBackground: value ?? !appState.exportBackground },
    captureUpdate: CaptureUpdateAction.EVENTUALLY,
  }),
};

/** Whether a PNG or SVG export carries the scene, to open again. */
export const actionChangeExportEmbedScene: Action<AppState["exportEmbedScene"]> = {
  name: "changeExportEmbedScene",
  label: "imageExportDialog.tooltip.embedScene",
  announcement: "",
  viewMode: true,
  perform: (_elements, appState, value) => ({
    appState: { ...appState, exportEmbedScene: value ?? !appState.exportEmbedScene },
    captureUpdate: CaptureUpdateAction.EVENTUALLY,
  }),
};

/** Whether the export is drawn dark. */
export const actionExportWithDarkMode: Action<AppState["exportWithDarkMode"]> = {
  name: "exportWithDarkMode",
  label: "imageExportDialog.label.darkMode",
  announcement: "",
  viewMode: true,
  perform: (_elements, appState, value) => ({
    appState: { ...appState, exportWithDarkMode: value ?? !appState.exportWithDarkMode },
    captureUpdate: CaptureUpdateAction.EVENTUALLY,
  }),
};

/** The file name: the scene's, the host's, or "Untitled" and the date. Excalidraw's `getName`. */
export const getName = (editor: DiagramEditor): string =>
  editor.state.name || editor.host.name || `${editor.host.untitledName ?? "Untitled"}-${getDateTime()}`;

/** The image export dialog, with its preview and settings. Ctrl+Shift+E. */
export const actionToggleImageExport: Action = {
  name: "imageExport",
  label: "buttons.exportImage",
  keywords: ["png", "svg", "image", "export", "clipboard"],
  announcement: "",
  viewMode: true,
  predicate: (_elements, _appState, editor) => editor.host.UIOptions.canvasActions.saveAsImage,
  perform: (_elements, appState) => ({
    appState: {
      ...appState,
      openDialog: appState.openDialog?.name === "imageExport" ? null : { name: "imageExport" },
    },
    captureUpdate: CaptureUpdateAction.NEVER,
  }),
  keyTest: (event, _appState, _elements, editor) =>
    editor.host.UIOptions.canvasActions.saveAsImage &&
    event[KEYS.CTRL_OR_CMD] &&
    event.shiftKey &&
    event.key.toLowerCase() === KEYS.E,
};

/** The export dialog: saving to disk, and the host's own ways out. */
export const actionToggleJSONExport: Action = {
  name: "jsonExport",
  label: "buttons.export",
  keywords: ["save", "file", "json", "excalidraw"],
  announcement: "",
  viewMode: true,
  predicate: (_elements, _appState, editor) => editor.host.UIOptions.canvasActions.export !== false,
  perform: (_elements, appState) => ({
    appState: {
      ...appState,
      openDialog: appState.openDialog?.name === "jsonExport" ? null : { name: "jsonExport" },
    },
    captureUpdate: CaptureUpdateAction.NEVER,
  }),
};

/** One save at a time: a second Ctrl+S while the picker is open does nothing. */
let exportInProgress = false;

const isAbort = (error: unknown): boolean => error instanceof Error && error.name === "AbortError";

/**
 * The scene a save writes, once the host's `onExport` has had its say: it may
 * hold the save while it finishes something (images loading), showing a
 * progress toast; the files are read after it, as they may have changed.
 */
const prepareDataForJSONExport = (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  editor: DiagramEditor,
): { abortController: AbortController; data: Promise<JSONExportData> } => {
  const abortController = new AbortController();
  const { signal } = abortController;
  const progress = (value: number | null | undefined, message?: string): void => {
    editor.batch(() =>
      editor.setState({
        toast: {
          message: message ?? { key: "progressDialog.defaultMessage" },
          progress: value ?? null,
          duration: Infinity,
        },
      }),
    );
  };
  const data = (async (): Promise<JSONExportData> => {
    const onExport = editor.host.onExport;
    if (onExport) {
      try {
        const result = onExport("json", { elements, appState, files: editor.getFiles() }, { signal });
        if (result && typeof result === "object" && Symbol.asyncIterator in result) {
          for await (const update of result) {
            if (signal.aborted) break;
            if (update.type === "done") break;
            progress(update.progress, update.message);
          }
        } else if (result instanceof Promise) {
          progress(null);
          await result;
        }
      } catch (error) {
        if (isAbort(error)) {
          console.warn(`onExport() aborted by the host (signal aborted: ${signal.aborted})`);
        } else {
          console.error("onExport() failed", error);
        }
      }
    }
    return { elements, appState, files: editor.getFiles() };
  })();
  return { abortController, data };
};

const saveFailed = (error: unknown, abortController: AbortController): ActionResult => {
  abortController.abort();
  if (isAbort(error)) {
    console.warn(error);
  } else {
    console.error(error);
  }
  return { captureUpdate: CaptureUpdateAction.NEVER, appState: { toast: null } };
};

/**
 * Saves to the file the scene came from (an image file too, its scene embedded
 * again), or asks for one. Ctrl+S.
 */
export const actionSaveToActiveFile: Action = {
  name: "saveToActiveFile",
  label: "buttons.save",
  announcement: "Saved",
  predicate: (_elements, appState, editor) =>
    editor.host.UIOptions.canvasActions.saveToActiveFile &&
    appState.fileHandle !== null &&
    !appState.viewModeEnabled,
  perform: async (elements, appState, _value, editor) => {
    if (exportInProgress) return false;
    exportInProgress = true;
    const previousFileHandle = appState.fileHandle;
    const filename = getName(editor);
    const { abortController, data } = prepareDataForJSONExport(elements, appState, editor);
    try {
      const { fileHandle } =
        previousFileHandle && isImageFileHandle(previousFileHandle)
          ? await resaveAsImageWithScene(data, previousFileHandle, filename)
          : await saveAsJSON({ data, filename, fileHandle: previousFileHandle });
      return {
        captureUpdate: CaptureUpdateAction.NEVER,
        appState: {
          fileHandle,
          toast: {
            message:
              previousFileHandle && fileHandle?.name
                ? { key: "toast.fileSavedToFilename", replacement: { filename: `"${fileHandle.name}"` } }
                : { key: "toast.fileSaved" },
            duration: 1500,
          },
        },
      };
    } catch (error) {
      return saveFailed(error, abortController);
    } finally {
      exportInProgress = false;
    }
  },
  keyTest: (event) => event.key === KEYS.S && event[KEYS.CTRL_OR_CMD] && !event.shiftKey,
};

/** Saves to a new file the reader picks. Ctrl+Shift+S. */
export const actionSaveFileToDisk: Action = {
  name: "saveFileToDisk",
  label: "exportDialog.disk_title",
  announcement: "Saved",
  viewMode: true,
  perform: async (elements, appState, _value, editor) => {
    if (exportInProgress) return false;
    exportInProgress = true;
    const { abortController, data } = prepareDataForJSONExport(elements, appState, editor);
    try {
      const { fileHandle } = await saveAsJSON({ data, filename: getName(editor), fileHandle: null });
      return {
        captureUpdate: CaptureUpdateAction.NEVER,
        appState: {
          openDialog: null,
          fileHandle,
          toast: { message: { key: "toast.fileSaved" }, duration: 3000 },
        },
      };
    } catch (error) {
      return saveFailed(error, abortController);
    } finally {
      exportInProgress = false;
    }
  },
  keyTest: (event) =>
    event.key.toLowerCase() === KEYS.S && event.shiftKey && event[KEYS.CTRL_OR_CMD],
};

/** Opens a scene file (or a PNG or SVG with a scene) in place of the scene. Ctrl+O. */
export const actionLoadScene: Action = {
  name: "loadScene",
  label: "buttons.load",
  announcement: "Scene loaded",
  predicate: (_elements, appState, editor) =>
    editor.host.UIOptions.canvasActions.loadScene && !appState.viewModeEnabled,
  perform: async (elements, appState, _value, editor) => {
    try {
      const scene = await loadFromJSON(appState, elements);
      // the old elements keep their indices, for undo not to duplicate them
      syncInvalidIndices(elements.concat(scene.elements));
      editor.store.scheduleMicroAction({
        action: CaptureUpdateAction.NEVER,
        elements,
        appState: undefined,
      });
      editor.afterNextCommit(() => void editor.addNewImagesToImageCache());
      return {
        elements: scene.elements,
        appState: { ...scene.appState, isLoading: false },
        files: scene.files,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      };
    } catch (error) {
      if (isAbort(error)) {
        console.warn(error);
        return false;
      }
      return {
        appState: {
          ...appState,
          errorMessage:
            error instanceof ImageSceneDataError
              ? { key: "alerts.cannotRestoreFromImage" }
              : errorMessageOf(error, { key: "alerts.couldNotLoadInvalidFile" }),
        },
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }
  },
  keyTest: (event) => event[KEYS.CTRL_OR_CMD] && event.key === KEYS.O,
};

/** What `onExport` is told and may answer: Excalidraw's `ExcalidrawProps["onExport"]`. */
export type OnExportProgress = {
  type: "progress" | "done";
  message?: string;
  /** From 0 to 1. */
  progress?: number;
};

export type OnExport = (
  type: "json",
  data: { elements: readonly ExcalidrawElement[]; appState: AppState; files: BinaryFiles },
  options: { signal: AbortSignal },
) => void | Promise<void> | AsyncGenerator<OnExportProgress, void>;

/**
 * Exports elements as a PNG or SVG file, or copies them as a PNG, from the
 * image export dialog; a failure goes to `errorMessage`. A PNG or SVG with the
 * scene embedded becomes the file Ctrl+S saves to. Excalidraw's `onExportImage`.
 */
export const exportImage = async (
  editor: DiagramEditor,
  type: ExportCanvasType,
  elements: readonly NonDeletedExcalidrawElement[],
  exportingFrame: NonDeleted<ExcalidrawFrameLikeElement> | null,
): Promise<boolean> => {
  let fileHandle: FileSystemFileHandle | null = null;
  try {
    fileHandle = await exportCanvas(type, elements, editor.state, editor.getFiles(), {
      name: getName(editor),
      exportingFrame,
    });
  } catch (error) {
    if (isAbort(error)) {
      console.warn(error);
      return false;
    }
    console.error(error);
    editor.batch(() =>
      editor.setState({
        errorMessage: errorMessageOf(error, { key: "canvasError.canvasTooBig" }),
      }),
    );
    return false;
  }
  if (editor.state.exportEmbedScene && fileHandle && isImageFileHandle(fileHandle)) {
    const handle = fileHandle;
    editor.batch(() => editor.setState({ fileHandle: handle }));
  }
  return true;
};
