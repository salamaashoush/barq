import { MIME_TYPES } from "@excalidraw/common";
import { isInitializedImageElement, newElementWith } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawImageElement,
  FileId,
  InitializedExcalidrawImageElement,
} from "@excalidraw/element/types";

import { compressData, decompressData } from "../data/encode.ts";
import { LocalizedError } from "../i18n.ts";

import type { DiagramEditorApi } from "../editor/editor.ts";
import type { BinaryFileData, BinaryFileMetadata, BinaryFiles, DataURL } from "../types.ts";
import type { EncodedFile } from "./transport.ts";

/** The largest file a session uploads, as excalidraw.com's. */
export const FILE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024; // 4 MiB

type FileVersion = Required<BinaryFileData>["version"];

/** A file's load as the session sees it, for a host that shows progress. */
export type FileLoadingStatus = "loading" | "loaded" | "error";

/**
 * Excalidraw's `FileManager`: which files are saved, being saved, being
 * fetched or failed, so each is uploaded once per version and fetched once.
 */
export class FileManager {
  /** files being fetched */
  private fetchingFiles = new Map<ExcalidrawImageElement["fileId"], true>();
  private erroredFiles_fetch = new Map<ExcalidrawImageElement["fileId"], true>();
  /** files being saved */
  private savingFiles = new Map<ExcalidrawImageElement["fileId"], FileVersion>();
  /* files already saved to persistent storage */
  private savedFiles = new Map<ExcalidrawImageElement["fileId"], FileVersion>();
  private erroredFiles_save = new Map<ExcalidrawImageElement["fileId"], FileVersion>();

  private readonly _getFiles;
  private readonly _saveFiles;
  private readonly _onFileStatusChange;

  public constructor({
    getFiles,
    saveFiles,
    onFileStatusChange,
  }: {
    getFiles: (fileIds: FileId[]) => Promise<{
      loadedFiles: BinaryFileData[];
      erroredFiles: Map<FileId, true>;
    }>;
    saveFiles: (data: { addedFiles: Map<FileId, BinaryFileData> }) => Promise<{
      savedFiles: Map<FileId, BinaryFileData>;
      erroredFiles: Map<FileId, BinaryFileData>;
    }>;
    onFileStatusChange?: (updates: Array<[FileId, FileLoadingStatus]>) => void;
  }) {
    this._getFiles = getFiles;
    this._saveFiles = saveFiles;
    this._onFileStatusChange = onFileStatusChange;
  }

  /**
   * returns whether file is saved/errored, or being processed
   */
  public isFileTracked = (id: FileId): boolean => {
    return (
      this.savedFiles.has(id) ||
      this.savingFiles.has(id) ||
      this.fetchingFiles.has(id) ||
      this.erroredFiles_fetch.has(id) ||
      this.erroredFiles_save.has(id)
    );
  };

  public isFileSavedOrBeingSaved = (file: BinaryFileData): boolean => {
    const fileVersion = this.getFileVersion(file);
    return (
      this.savedFiles.get(file.id) === fileVersion || this.savingFiles.get(file.id) === fileVersion
    );
  };

  public getFileVersion = (file: BinaryFileData): FileVersion => {
    return file.version ?? 1;
  };

  public saveFiles = async ({
    elements,
    files,
  }: {
    elements: readonly ExcalidrawElement[];
    files: BinaryFiles;
  }): Promise<{
    savedFiles: Map<FileId, BinaryFileData>;
    erroredFiles: Map<FileId, BinaryFileData>;
  }> => {
    const addedFiles: Map<FileId, BinaryFileData> = new Map();

    for (const element of elements) {
      const fileData = isInitializedImageElement(element) && files[element.fileId];

      if (
        fileData &&
        // NOTE if errored during save, won't retry due to this check
        !this.isFileSavedOrBeingSaved(fileData)
      ) {
        addedFiles.set(element.fileId, fileData);
        this.savingFiles.set(element.fileId, this.getFileVersion(fileData));
      }
    }

    try {
      const { savedFiles, erroredFiles } = await this._saveFiles({
        addedFiles,
      });

      for (const [fileId, fileData] of savedFiles) {
        this.savedFiles.set(fileId, this.getFileVersion(fileData));
      }

      for (const [fileId, fileData] of erroredFiles) {
        this.erroredFiles_save.set(fileId, this.getFileVersion(fileData));
      }

      return {
        savedFiles,
        erroredFiles,
      };
    } finally {
      for (const [fileId] of addedFiles) {
        this.savingFiles.delete(fileId);
      }
    }
  };

  public getFiles = async (
    ids: FileId[],
  ): Promise<{
    loadedFiles: BinaryFileData[];
    erroredFiles: Map<FileId, true>;
  }> => {
    if (!ids.length) {
      return {
        loadedFiles: [],
        erroredFiles: new Map(),
      };
    }
    for (const id of ids) {
      this.fetchingFiles.set(id, true);
    }

    this._onFileStatusChange?.(ids.map((id) => [id, "loading"]));

    try {
      const { loadedFiles, erroredFiles } = await this._getFiles(ids);

      for (const file of loadedFiles) {
        this.savedFiles.set(file.id, this.getFileVersion(file));
      }
      for (const [fileId] of erroredFiles) {
        this.erroredFiles_fetch.set(fileId, true);
      }

      this._onFileStatusChange?.([
        ...loadedFiles.map((f) => [f.id, "loaded"] as [FileId, "loaded"]),
        ...[...erroredFiles.keys()].map((id) => [id, "error"] as [FileId, "error"]),
      ]);

      return { loadedFiles, erroredFiles };
    } finally {
      for (const id of ids) {
        this.fetchingFiles.delete(id);
      }
    }
  };

  /** a file element prevents unload only if it's being saved regardless of
   *  its `status`. This ensures that elements who for any reason haven't
   *  beed set to `saved` status don't prevent unload in future sessions.
   *  Technically we should prevent unload when the origin client haven't
   *  yet saved the `status` update to storage, but that should be taken care
   *  of during regular beforeUnload unsaved files check.
   */
  public shouldPreventUnload = (elements: readonly ExcalidrawElement[]): boolean => {
    return elements.some((element) => {
      return (
        isInitializedImageElement(element) &&
        !element.isDeleted &&
        this.savingFiles.has(element.fileId)
      );
    });
  };

  /**
   * helper to determine if image element status needs updating
   */
  public shouldUpdateImageElementStatus = (
    element: ExcalidrawElement,
  ): element is InitializedExcalidrawImageElement => {
    return (
      isInitializedImageElement(element) &&
      this.savedFiles.has(element.fileId) &&
      element.status === "pending"
    );
  };

  public reset(): void {
    if (this._onFileStatusChange && this.fetchingFiles.size) {
      this._onFileStatusChange(
        [...this.fetchingFiles.keys()].map((id) => [id, "error"] as [FileId, "error"]),
      );
    }
    this.fetchingFiles.clear();
    this.savingFiles.clear();
    this.savedFiles.clear();
    this.erroredFiles_fetch.clear();
    this.erroredFiles_save.clear();
  }
}

/** Compresses and encrypts files with the room key, refusing one over `maxBytes`. */
export const encodeFilesForUpload = async ({
  files,
  maxBytes,
  encryptionKey,
}: {
  files: Map<FileId, BinaryFileData>;
  maxBytes: number;
  encryptionKey: string | CryptoKey;
}): Promise<EncodedFile[]> => {
  const processedFiles: EncodedFile[] = [];

  for (const [id, fileData] of files) {
    const buffer = new TextEncoder().encode(fileData.dataURL);

    const encodedFile = await compressData<BinaryFileMetadata>(buffer, {
      encryptionKey,
      metadata: {
        id,
        mimeType: fileData.mimeType,
        created: Date.now(),
        lastRetrieved: Date.now(),
      },
    });

    if (buffer.byteLength > maxBytes) {
      throw new LocalizedError({
        key: "errors.fileTooBig",
        replacement: { maxSize: `${Math.trunc(maxBytes / 1024 / 1024)}MB` },
      });
    }

    processedFiles.push({
      id,
      buffer: encodedFile,
    });
  }

  return processedFiles;
};

/** Decrypts and decompresses a downloaded file, as `loadFilesFromFirebase` does. */
export const decodeFileFromDownload = async (
  file: EncodedFile,
  decryptionKey: string | CryptoKey,
): Promise<BinaryFileData> => {
  const { data, metadata } = await decompressData(file.buffer, {
    decryptionKey,
  });
  const { mimeType, created } = (metadata ?? {}) as Partial<BinaryFileMetadata>;

  const dataURL = new TextDecoder().decode(data) as DataURL;

  return {
    mimeType: mimeType || MIME_TYPES.binary,
    id: file.id,
    dataURL,
    created: created || Date.now(),
    lastRetrieved: created || Date.now(),
  };
};

/** Marks the images whose files failed to load as errored. */
export const updateStaleImageStatuses = (params: {
  api: Pick<DiagramEditorApi, "updateScene" | "getSceneElementsIncludingDeleted">;
  erroredFiles: Map<FileId, true>;
}): void => {
  if (!params.erroredFiles.size) {
    return;
  }
  params.api.updateScene({
    elements: params.api.getSceneElementsIncludingDeleted().map((element) => {
      if (isInitializedImageElement(element) && params.erroredFiles.has(element.fileId)) {
        return newElementWith(element, {
          status: "error",
        });
      }
      return element;
    }),
    captureUpdate: "NEVER",
  });
};
