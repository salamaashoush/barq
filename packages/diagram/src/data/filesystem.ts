/**
 * Opening and saving files: the File System Access API where the page has it
 * (a file opened keeps its handle, which a later save writes back to), a file
 * input and a download otherwise. Excalidraw's `data/filesystem.ts` over
 * `browser-fs-access`, which this does without.
 */

import { MIME_TYPES } from "@excalidraw/common";

import { normalizeFile } from "./blob.ts";

export type FileExtension = Exclude<keyof typeof MIME_TYPES, "binary">;

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface ShowOpenFilePickerOptions {
  types?: FilePickerAcceptType[];
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
}

interface ShowSaveFilePickerOptions {
  suggestedName?: string;
  types?: FilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
}

interface FileSystemWindow {
  showOpenFilePicker?: (options: ShowOpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options: ShowSaveFilePickerOptions) => Promise<FileSystemFileHandle>;
}

interface WritableFile {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
}

interface WritableHandle {
  createWritable: () => Promise<WritableFile>;
}

function pickerWindow(): (Window & FileSystemWindow) | null {
  return typeof window === "undefined" ? null : window;
}

/**
 * Whether the page can open and save through the File System Access API: it
 * has the pickers and is not in a cross-origin frame, where Chrome refuses them.
 */
export function isNativeFileSystemSupported(): boolean {
  const view = pickerWindow();
  if (!view || typeof view.showOpenFilePicker !== "function") return false;
  try {
    return view.top === view.self;
  } catch {
    return false;
  }
}

function abortError(): DOMException {
  return new DOMException("The user aborted a request.", "AbortError");
}

function dottedExtensions(extensions: readonly FileExtension[]): string[] {
  return extensions.flatMap((extension) =>
    extension === "jpg" ? [".jpg", ".jpeg"] : [`.${extension}`],
  );
}

function acceptTypes(
  description: string,
  extensions: readonly FileExtension[] | undefined,
): FilePickerAcceptType[] | undefined {
  if (!extensions?.length) return undefined;
  const accept: Record<string, string[]> = {};
  for (const extension of extensions) {
    const mime = MIME_TYPES[extension];
    (accept[mime] ??= []).push(...dottedExtensions([extension]));
  }
  return [{ description, accept }];
}

interface LegacyOpenOptions {
  extensions?: readonly FileExtension[];
  multiple: boolean;
}

/** Asks for a file with a file input, rejecting with an `AbortError` when the reader cancels. */
function legacyOpen(opts: LegacyOpenOptions): Promise<File[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = opts.multiple;
    if (opts.extensions?.length) {
      input.accept = [
        ...opts.extensions.map((extension) => MIME_TYPES[extension]),
        ...dottedExtensions(opts.extensions),
      ].join(",");
    }
    input.addEventListener("change", () => resolve(input.files ? [...input.files] : []), {
      once: true,
    });
    input.addEventListener("cancel", () => reject(abortError()), { once: true });
    input.click();
  });
}

export interface SingleFileOpen {
  extensions?: readonly FileExtension[];
  description: string;
  multiple?: false;
}

export interface FileHandleRef {
  handle?: FileSystemFileHandle | null;
}

export interface MultipleFileOpen {
  extensions?: readonly FileExtension[];
  description: string;
  multiple: true;
}

export interface FileOpenOptions {
  extensions?: readonly FileExtension[];
  description: string;
  multiple?: boolean;
}

/**
 * Asks the reader for a file (several with `multiple`), each with its handle
 * when the API gave one, its type detected where the system left it out.
 */
export async function fileOpen(opts: SingleFileOpen): Promise<File & FileHandleRef>;
export async function fileOpen(opts: MultipleFileOpen): Promise<(File & FileHandleRef)[]>;
export async function fileOpen(
  opts: FileOpenOptions,
): Promise<(File & FileHandleRef) | (File & FileHandleRef)[]> {
  const multiple = opts.multiple === true;
  let files: (File & FileHandleRef)[];
  const view = pickerWindow();
  if (view?.showOpenFilePicker && isNativeFileSystemSupported()) {
    const handles = await view.showOpenFilePicker({
      types: acceptTypes(opts.description, opts.extensions),
      multiple,
    });
    files = await Promise.all(
      handles.map(async (handle) => {
        const file: File & FileHandleRef = await handle.getFile();
        file.handle = handle;
        return file;
      }),
    );
  } else {
    files = await legacyOpen({ extensions: opts.extensions, multiple });
  }
  const normalized = await Promise.all(
    files.map(async (file) => {
      const handle = file.handle;
      const next: File & FileHandleRef = await normalizeFile(file);
      if (handle) next.handle = handle;
      return next;
    }),
  );
  if (multiple) return normalized;
  const [first] = normalized;
  if (!first) throw abortError();
  return first;
}

function download(blob: Blob, fileName: string): void {
  const link = document.createElement("a");
  link.download = fileName;
  link.href = URL.createObjectURL(blob);
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 30_000);
}

export interface FileSaveOptions {
  /** The name, without the extension. */
  name: string;
  extension: FileExtension;
  mimeTypes?: readonly string[];
  description: string;
  fileHandle?: FileSystemFileHandle | null;
}

/**
 * Saves a blob: to `fileHandle` when given, to a file the reader picks when
 * the API is there, as a download otherwise. Resolves with the handle written
 * to, `null` for a download.
 */
export async function fileSave(
  blob: Blob | Promise<Blob>,
  opts: FileSaveOptions,
): Promise<FileSystemFileHandle | null> {
  const fileName = `${opts.name}.${opts.extension}`;
  const view = pickerWindow();
  if (view?.showSaveFilePicker && isNativeFileSystemSupported()) {
    const mime = opts.mimeTypes?.[0] ?? MIME_TYPES[opts.extension];
    const handle =
      opts.fileHandle ??
      (await view.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: opts.description, accept: { [mime]: [`.${opts.extension}`] } }],
      }));
    const writable = await (handle as FileSystemFileHandle & WritableHandle).createWritable();
    await writable.write(await blob);
    await writable.close();
    return handle;
  }
  download(await blob, fileName);
  return null;
}

/** Swallows the reader cancelling a picker, as Excalidraw's `muteFSAbortError`. */
export function muteFSAbortError(error?: unknown): void {
  if (error instanceof Error && error.name === "AbortError") {
    console.warn(error);
    return;
  }
  throw error;
}
