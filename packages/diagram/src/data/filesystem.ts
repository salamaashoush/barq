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

interface FileSystemWindow {
  showOpenFilePicker?: (options: {
    types?: FilePickerAcceptType[];
    multiple?: boolean;
    excludeAcceptAllOption?: boolean;
  }) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: FilePickerAcceptType[];
    excludeAcceptAllOption?: boolean;
  }) => Promise<FileSystemFileHandle>;
}

interface WritableHandle {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}

const pickerWindow = (): (Window & FileSystemWindow) | null =>
  typeof window === "undefined" ? null : window;

/**
 * Whether the page can open and save through the File System Access API: it
 * has the pickers and is not in a cross-origin frame, where Chrome refuses them.
 */
export const isNativeFileSystemSupported = (): boolean => {
  const view = pickerWindow();
  if (!view || typeof view.showOpenFilePicker !== "function") return false;
  try {
    return view.top === view.self;
  } catch {
    return false;
  }
};

const abortError = (): DOMException =>
  new DOMException("The user aborted a request.", "AbortError");

const dottedExtensions = (extensions: readonly FileExtension[]): string[] =>
  extensions.flatMap((extension) => (extension === "jpg" ? [".jpg", ".jpeg"] : [`.${extension}`]));

const acceptTypes = (
  description: string,
  extensions: readonly FileExtension[] | undefined,
): FilePickerAcceptType[] | undefined => {
  if (!extensions?.length) return undefined;
  const accept: Record<string, string[]> = {};
  for (const extension of extensions) {
    const mime = MIME_TYPES[extension];
    (accept[mime] ??= []).push(...dottedExtensions([extension]));
  }
  return [{ description, accept }];
};

/** Asks for a file with a file input, rejecting with an `AbortError` when the reader cancels. */
const legacyOpen = (opts: {
  extensions?: readonly FileExtension[];
  multiple: boolean;
}): Promise<File[]> =>
  new Promise((resolve, reject) => {
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

/**
 * Asks the reader for a file (several with `multiple`), each with its handle
 * when the API gave one, its type detected where the system left it out.
 */
export async function fileOpen(opts: {
  extensions?: readonly FileExtension[];
  description: string;
  multiple?: false;
}): Promise<File & { handle?: FileSystemFileHandle | null }>;
export async function fileOpen(opts: {
  extensions?: readonly FileExtension[];
  description: string;
  multiple: true;
}): Promise<(File & { handle?: FileSystemFileHandle | null })[]>;
export async function fileOpen(opts: {
  extensions?: readonly FileExtension[];
  description: string;
  multiple?: boolean;
}): Promise<
  | (File & { handle?: FileSystemFileHandle | null })
  | (File & { handle?: FileSystemFileHandle | null })[]
> {
  const multiple = opts.multiple === true;
  let files: (File & { handle?: FileSystemFileHandle | null })[];
  const view = pickerWindow();
  if (view?.showOpenFilePicker && isNativeFileSystemSupported()) {
    const handles = await view.showOpenFilePicker({
      types: acceptTypes(opts.description, opts.extensions),
      multiple,
    });
    files = await Promise.all(
      handles.map(async (handle) => {
        const file: File & { handle?: FileSystemFileHandle | null } = await handle.getFile();
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
      const next: File & { handle?: FileSystemFileHandle | null } = await normalizeFile(file);
      if (handle) next.handle = handle;
      return next;
    }),
  );
  if (multiple) return normalized;
  const [first] = normalized;
  if (!first) throw abortError();
  return first;
}

const download = (blob: Blob, fileName: string): void => {
  const link = document.createElement("a");
  link.download = fileName;
  link.href = URL.createObjectURL(blob);
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 30_000);
};

/**
 * Saves a blob: to `fileHandle` when given, to a file the reader picks when
 * the API is there, as a download otherwise. Resolves with the handle written
 * to, `null` for a download.
 */
export const fileSave = async (
  blob: Blob | Promise<Blob>,
  opts: {
    /** The name, without the extension. */
    name: string;
    extension: FileExtension;
    mimeTypes?: readonly string[];
    description: string;
    fileHandle?: FileSystemFileHandle | null;
  },
): Promise<FileSystemFileHandle | null> => {
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
};

/** Swallows the reader cancelling a picker, as Excalidraw's `muteFSAbortError`. */
export const muteFSAbortError = (error?: unknown): void => {
  if (error instanceof Error && error.name === "AbortError") {
    console.warn(error);
    return;
  }
  throw error;
};
