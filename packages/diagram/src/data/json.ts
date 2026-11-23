import { EXPORT_DATA_TYPES, getExportSource, VERSIONS } from "@excalidraw/common";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { cleanAppStateForExport, clearAppStateForDatabase } from "../app-state.ts";

import type { AppState, BinaryFiles, LibraryItems } from "../types.ts";
import type {
  ExportedDataState,
  ImportedDataState,
  ExportedLibraryData,
  ImportedLibraryData,
} from "./types.ts";

export type JSONExportData = {
  elements: readonly ExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
};

/**
 * Strips out files which are only referenced by deleted elements
 */
const filterOutDeletedFiles = (elements: readonly ExcalidrawElement[], files: BinaryFiles) => {
  const nextFiles: BinaryFiles = {};
  for (const element of elements) {
    if (!element.isDeleted && "fileId" in element && element.fileId) {
      const file = files[element.fileId];
      if (file) {
        nextFiles[element.fileId] = file;
      }
    }
  }
  return nextFiles;
};

export const serializeAsJSON = (
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles,
  type: "local" | "database",
): string => {
  const data: ExportedDataState = {
    type: EXPORT_DATA_TYPES.excalidraw,
    version: VERSIONS.excalidraw,
    source: getExportSource(),
    elements,
    appState:
      type === "local" ? cleanAppStateForExport(appState) : clearAppStateForDatabase(appState),
    files:
      type === "local"
        ? filterOutDeletedFiles(elements, files)
        : // will be stripped from JSON
          undefined,
  };

  return JSON.stringify(data, null, 2);
};

export const isValidExcalidrawData = (data?: unknown): data is ImportedDataState => {
  const candidate = data as
    | { type?: unknown; elements?: unknown; appState?: unknown }
    | null
    | undefined;
  return (
    candidate?.type === EXPORT_DATA_TYPES.excalidraw &&
    (!candidate.elements ||
      (Array.isArray(candidate.elements) &&
        (!candidate.appState || typeof candidate.appState === "object")))
  );
};

export const isValidLibrary = (json: unknown): json is ImportedLibraryData => {
  return (
    typeof json === "object" &&
    json !== null &&
    "type" in json &&
    json.type === EXPORT_DATA_TYPES.excalidrawLibrary &&
    "version" in json &&
    (json.version === 1 || json.version === 2)
  );
};

export const serializeLibraryAsJSON = (libraryItems: LibraryItems) => {
  const data: ExportedLibraryData = {
    type: EXPORT_DATA_TYPES.excalidrawLibrary,
    version: VERSIONS.excalidrawLibrary,
    source: getExportSource(),
    libraryItems,
  };
  return JSON.stringify(data, null, 2);
};
