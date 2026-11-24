/**
 * Scenes and images to and from files: Excalidraw's `saveAsJSON`,
 * `loadFromJSON`, `exportCanvas` and `resaveAsImageWithScene`, over
 * `filesystem.ts`.
 */

import {
  arrayToMap,
  cloneJSON,
  DEFAULT_EXPORT_PADDING,
  DEFAULT_FILENAME,
  IMAGE_MIME_TYPES,
  MIME_TYPES,
  SVG_DOCUMENT_PREAMBLE,
} from "@excalidraw/common";

import {
  getElementsOverlappingFrame,
  getNonDeletedElements,
  getSelectedElements,
  isFrameLikeElement,
  isSomeElementSelected,
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
} from "../clipboard.ts";
import { LocalizedError } from "../i18n.ts";
import {
  type ExportSceneData,
  type ExportToPngConfig,
  type ExportToSvgConfig,
  exportScene,
  getExportConfigFromAppState,
} from "../scene/export.ts";
import { restoreElements } from "./restore.ts";
import {
  getFileHandleType,
  isImageFileHandle,
  isImageFileHandleType,
  loadFromBlob,
} from "./blob.ts";
import { fileOpen, fileSave } from "./filesystem.ts";
import { serializeAsJSON, serializeLibraryAsJSON } from "./json.ts";

import type { AppState, BinaryFiles, LibraryItems } from "../types.ts";

type MaybePromise<T> = T | Promise<T>;

/**
 * What an export or a copy as an image takes: the selection (a single frame as what it
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

export interface JSONExportData {
  elements: readonly ExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
}

/** Saves the scene as an `.excalidraw` file: to `fileHandle` when it is one, to a new file otherwise. */
export const saveAsJSON = async ({
  data,
  filename,
  fileHandle,
}: {
  data: MaybePromise<JSONExportData>;
  filename: string;
  fileHandle: AppState["fileHandle"];
}): Promise<{ fileHandle: FileSystemFileHandle | null }> => {
  const blob = Promise.resolve(data).then(
    ({ elements, appState, files }) =>
      new Blob([serializeAsJSON(elements, appState, files, "local")], {
        type: MIME_TYPES.excalidraw,
      }),
  );
  const savedFileHandle = await fileSave(blob, {
    name: filename,
    extension: "excalidraw",
    description: "Excalidraw file",
    fileHandle: isImageFileHandle(fileHandle) ? null : fileHandle,
  });
  return { fileHandle: savedFileHandle };
};

/** Asks for a scene file (`.excalidraw`, or a PNG or SVG with a scene) and restores it. */
export const loadFromJSON = async (
  localAppState: AppState,
  localElements: readonly ExcalidrawElement[] | null,
) => {
  // any type: iOS offers no `.excalidraw` file to a picker that names its extension
  const file = await fileOpen({ description: "Excalidraw files" });
  return loadFromBlob(file, localAppState, localElements, file.handle);
};

/** Saves the library as an `.excalidrawlib` file. */
export const saveLibraryAsJSON = async (libraryItems: LibraryItems): Promise<void> => {
  await fileSave(
    new Blob([serializeLibraryAsJSON(libraryItems)], { type: MIME_TYPES.excalidrawlib }),
    { name: "library", extension: "excalidrawlib", description: "Excalidraw library file" },
  );
};

export type ExportCanvasType = "png" | "svg" | "clipboard";

/**
 * Exports elements as a PNG or SVG file (the scene embedded with
 * `appState.exportEmbedScene`), or copies them as a PNG. Resolves with the
 * handle written to, if any.
 */
export const exportCanvas = async (
  type: ExportCanvasType,
  elements: readonly NonDeletedExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
  {
    exportPadding = DEFAULT_EXPORT_PADDING,
    name = appState.name || DEFAULT_FILENAME,
    fileHandle = null,
    exportingFrame,
  }: {
    exportPadding?: number;
    name?: string;
    fileHandle?: FileSystemFileHandle | null;
    exportingFrame: NonDeleted<ExcalidrawFrameLikeElement> | null;
  },
): Promise<FileSystemFileHandle | null> => {
  if (elements.length === 0) {
    throw new LocalizedError({ key: "alerts.cannotExportEmptyCanvas" });
  }
  const data = { elements, appState, files };
  const config = {
    ...getExportConfigFromAppState(appState),
    padding: exportPadding,
    exportingFrame,
  };

  if (type === "svg") {
    const svg = exportScene({
      type: "svg",
      data,
      config: { ...config, embedScene: appState.exportEmbedScene },
    });
    return fileSave(
      svg.then(
        (element) =>
          new Blob([SVG_DOCUMENT_PREAMBLE + element.outerHTML], { type: MIME_TYPES.svg }),
      ),
      {
        description: "Export to SVG",
        name,
        extension: appState.exportEmbedScene ? "excalidraw.svg" : "svg",
        mimeTypes: [IMAGE_MIME_TYPES.svg],
        fileHandle,
      },
    );
  }

  if (type === "png") {
    return fileSave(
      exportScene({
        type: "png",
        data,
        config: { ...config, embedScene: appState.exportEmbedScene },
      }),
      {
        description: "Export to PNG",
        name,
        extension: appState.exportEmbedScene ? "excalidraw.png" : "png",
        mimeTypes: [IMAGE_MIME_TYPES.png],
        fileHandle,
      },
    );
  }

  try {
    await copyBlobToClipboardAsPng(exportScene({ type: "png", data, config }));
  } catch (error) {
    console.warn(error);
    if (error instanceof Error && error.name === "CANVAS_POSSIBLY_TOO_BIG") {
      throw new LocalizedError({ key: "canvasError.canvasTooBig" }, { cause: error });
    }
    throw new LocalizedError({ key: "alerts.couldNotCopyToClipboard" }, { cause: error });
  }
  return null;
};

/** Writes the scene back into the PNG or SVG it was opened from, the scene embedded. */
export const resaveAsImageWithScene = async (
  data: MaybePromise<JSONExportData>,
  fileHandle: FileSystemFileHandle,
  filename: string,
): Promise<{ fileHandle: FileSystemFileHandle }> => {
  const type = getFileHandleType(fileHandle);
  if (!isImageFileHandleType(type)) {
    throw new Error("fileHandle should exist and should be of type svg or png when resaving");
  }
  const resolved = await data;
  const appState = { ...resolved.appState, exportEmbedScene: true };
  const { exportedElements, exportingFrame } = prepareElementsForExport(
    resolved.elements,
    appState,
    false,
  );
  await exportCanvas(type, exportedElements, appState, resolved.files, {
    name: filename,
    fileHandle,
    exportingFrame,
  });
  return { fileHandle };
};

/** Copies a scene to the clipboard as a PNG, as SVG markup, or as elements Excalidraw pastes. */
export const exportToClipboard = async (
  opts: { data: ExportSceneData } & (
    | { type: "png"; config?: ExportToPngConfig }
    | { type: "svg"; config?: ExportToSvgConfig }
    | { type: "json"; config?: never }
  ),
): Promise<void> => {
  if (opts.type === "svg") {
    const svg = await exportScene(opts);
    await copyTextToSystemClipboard(svg.outerHTML);
  } else if (opts.type === "png") {
    await copyBlobToClipboardAsPng(exportScene(opts));
  } else {
    await copyToClipboard(
      getNonDeletedElements(restoreElements(opts.data.elements, null)),
      opts.data.files ?? null,
    );
  }
};
