/**
 * What a drag carries, and what every collection on the page needs to know
 * about the drag under way.
 */

import type { Key } from "../collections.ts";
import type { ElementRef } from "../interactions/press.ts";
import { access } from "../utils.ts";
import type {
  DirectoryDropItem,
  DragItem,
  DragType,
  DragTypes,
  DropItem,
  DropOperation,
  FileDropItem,
  TextDropItem,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export const NONE = 0;
export const MOVE = 1;
export const COPY = 2;
export const LINK = 4;
export const ALL = MOVE | COPY | LINK;

export const OPERATION_BITS: Record<DropOperation, number> = {
  cancel: NONE,
  move: MOVE,
  copy: COPY,
  link: LINK,
};

export type EffectAllowed = DataTransfer["effectAllowed"];
export type DropEffect = DataTransfer["dropEffect"];

export const ALLOWED_BITS: Record<string, number> = {
  none: NONE,
  cancel: NONE,
  move: MOVE,
  copy: COPY,
  link: LINK,
  copyMove: COPY | MOVE,
  copyLink: COPY | LINK,
  linkMove: LINK | MOVE,
  all: ALL,
  uninitialized: ALL,
};

export const EFFECT_ALLOWED: Record<number, EffectAllowed> = {
  [NONE]: "none",
  [MOVE]: "move",
  [COPY]: "copy",
  [COPY | MOVE]: "copyMove",
  [LINK]: "link",
  [LINK | MOVE]: "linkMove",
  [COPY | LINK]: "copyLink",
  [ALL]: "all",
};

export const EFFECT_TO_OPERATION: Record<DropEffect, DropOperation> = {
  none: "cancel",
  link: "link",
  copy: "copy",
  move: "move",
};

export const OPERATION_TO_EFFECT: Record<DropOperation, DropEffect> = {
  cancel: "none",
  link: "link",
  copy: "copy",
  move: "move",
};

const NATIVE_DRAG_TYPES = new Set(["text/plain", "text/uri-list", "text/html"]);

/** Every item of a multi-item drag, as JSON, under one type the platform will carry. */
export const CUSTOM_DRAG_TYPE = "application/vnd.barq.items+json";

/** A file whose type the browser could not name, or a directory. */
export const GENERIC_TYPE = "application/octet-stream";

/** Pass in `acceptedDragTypes` to accept dropped directories. */
export const DIRECTORY_DRAG_TYPE: unique symbol = Symbol("barq.dnd.directory");

export function operationsToArray(bits: number): DropOperation[] {
  const operations: DropOperation[] = [];
  if ((bits & MOVE) !== 0) operations.push("move");
  if ((bits & COPY) !== 0) operations.push("copy");
  if ((bits & LINK) !== 0) operations.push("link");
  return operations;
}

export function allowedOperation(allowed: number, operation: DropOperation): DropOperation {
  return (allowed & OPERATION_BITS[operation]) !== 0 ? operation : "cancel";
}

// ---------------------------------------------------------------------------
// The data transfer
// ---------------------------------------------------------------------------

/** The types of a keyboard drag's items, answering `has` the way a native drag's do. */
class ItemDragTypes implements DragTypes {
  #types: Set<string>;

  constructor(types: Set<string>) {
    this.#types = types;
  }

  has(type: DragType | DragType[]): boolean {
    if (Array.isArray(type)) return type.some((one) => this.has(one));
    if (typeof type !== "string") return false;
    return matchesType(this.#types, type);
  }
}

function matchesType(types: Set<string>, type: string): boolean {
  if (type === "*/*") return true;
  if (type.endsWith("/*")) {
    const family = type.slice(0, -2);
    for (const key of types) if (key.startsWith(family)) return true;
    return false;
  }
  return types.has(type);
}

/** Every type any of `items` is offered as. */
export function getTypes(items: DragItem[]): DragTypes {
  const types = new Set<string>();
  for (const item of items) {
    for (const type of Object.keys(item)) types.add(type);
  }
  return new ItemDragTypes(types);
}

/**
 * Write `items` to a data transfer.
 *
 * A `DataTransfer` holds one entry per type, and only a few types survive the
 * trip to another application. Several items of one type, or one item in
 * several types, therefore also go out as JSON under {@link CUSTOM_DRAG_TYPE},
 * which a drop inside the page prefers.
 */
export function writeToDataTransfer(dataTransfer: DataTransfer, items: DragItem[]): void {
  const byType = new Map<string, string[]>();
  let needsCustomData = false;
  const customData: DragItem[] = [];

  for (const item of items) {
    const types = Object.keys(item);
    if (types.length > 1) needsCustomData = true;

    const dataByType: DragItem = {};
    for (const type of types) {
      let typeItems = byType.get(type);
      if (typeItems === undefined) {
        typeItems = [];
        byType.set(type, typeItems);
      } else {
        needsCustomData = true;
      }
      const data = item[type] as string;
      dataByType[type] = data;
      typeItems.push(data);
    }
    customData.push(dataByType);
  }

  for (const [type, typeItems] of byType) {
    if (NATIVE_DRAG_TYPES.has(type)) {
      dataTransfer.items.add(typeItems.join("\n"), type);
    } else {
      dataTransfer.items.add(typeItems[0] as string, type);
    }
  }

  if (needsCustomData) {
    dataTransfer.items.add(JSON.stringify(customData), CUSTOM_DRAG_TYPE);
  }
}

/** What a native drag carries, read during the drag when only the types are visible. */
export class DataTransferTypes implements DragTypes {
  #types = new Set<string>();
  #includesUnknownTypes: boolean;

  constructor(dataTransfer: DataTransfer) {
    let hasFiles = false;
    for (const item of dataTransfer.items) {
      if (item.type === CUSTOM_DRAG_TYPE) continue;
      if (item.kind === "file") hasFiles = true;
      // A file whose type the browser cannot map reports "", and may be a
      // directory: nothing tells the two apart before the drop.
      this.#types.add(item.type === "" ? GENERIC_TYPE : item.type);
    }

    // Safari exposes no items while files are dragged, only "Files" in
    // `types`, so every type asked about has to be assumed present.
    // https://bugs.webkit.org/show_bug.cgi?id=223517
    this.#includesUnknownTypes = !hasFiles && [...dataTransfer.types].includes("Files");
  }

  has(type: DragType | DragType[]): boolean {
    if (Array.isArray(type)) return type.some((one) => this.has(one));
    if (this.#includesUnknownTypes) return true;
    if (type === DIRECTORY_DRAG_TYPE) return this.#types.has(GENERIC_TYPE);
    if (typeof type !== "string") return false;
    return matchesType(this.#types, type);
  }
}

/** The items of a drop or a paste. */
export function readFromDataTransfer(dataTransfer: DataTransfer | null | undefined): DropItem[] {
  const items: DropItem[] = [];
  if (dataTransfer === null || dataTransfer === undefined) return items;

  let hasCustomType = false;
  if ([...dataTransfer.types].includes(CUSTOM_DRAG_TYPE)) {
    try {
      const parsed = JSON.parse(dataTransfer.getData(CUSTOM_DRAG_TYPE)) as DragItem[];
      for (const item of parsed) {
        items.push({
          kind: "text",
          types: new Set(Object.keys(item)),
          getText: (type) => Promise.resolve(item[type] as string),
        });
      }
      hasCustomType = true;
    } catch {
      // Written by something else under our type; fall back to the native items.
    }
  }

  if (hasCustomType) return items;

  const strings = new Map<string, string>();
  for (const item of dataTransfer.items) {
    if (item.kind === "string") {
      // Read now: the data transfer is emptied once the event handler returns.
      strings.set(item.type === "" ? GENERIC_TYPE : item.type, dataTransfer.getData(item.type));
    } else if (item.kind === "file") {
      if (typeof item.webkitGetAsEntry === "function") {
        const entry = item.webkitGetAsEntry();
        // Firefox lists an image/png item for any pasted file and then answers
        // null for it. https://bugzilla.mozilla.org/show_bug.cgi?id=1699743
        if (entry === null) continue;
        if (entry.isFile) items.push(fileItem(item.getAsFile()));
        else if (entry.isDirectory) items.push(directoryItem(entry as FileSystemDirectoryEntry));
      } else {
        items.push(fileItem(item.getAsFile()));
      }
    }
  }

  // Every string entry is a representation of the same one item: the platform
  // cannot carry two text items at once.
  if (strings.size > 0) {
    items.push({
      kind: "text",
      types: new Set(strings.keys()),
      getText: (type) => Promise.resolve(strings.get(type) as string),
    });
  }

  return items;
}

function blobToString(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result as string));
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error("The file could not be read.")),
    );
    reader.readAsText(blob);
  });
}

function fileItem(file: File | null): FileDropItem {
  if (file === null) throw new Error("No file provided");
  return {
    kind: "file",
    type: file.type === "" ? GENERIC_TYPE : file.type,
    name: file.name,
    getText: () => blobToString(file),
    getFile: () => Promise.resolve(file),
  };
}

function directoryItem(entry: FileSystemDirectoryEntry): DirectoryDropItem {
  return {
    kind: "directory",
    name: entry.name,
    getEntries: () => directoryEntries(entry),
  };
}

async function* directoryEntries(
  entry: FileSystemDirectoryEntry,
): AsyncIterable<FileDropItem | DirectoryDropItem> {
  const reader = entry.createReader();
  // A reader returns entries in batches, so it is read until a batch is empty.
  let entries: FileSystemEntry[];
  do {
    entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    for (const child of entries) {
      if (child.isFile) {
        const file = await new Promise<File>((resolve, reject) => {
          (child as FileSystemFileEntry).file(resolve, reject);
        });
        yield fileItem(file);
      } else if (child.isDirectory) {
        yield directoryItem(child as FileSystemDirectoryEntry);
      }
    }
  } while (entries.length > 0);
}

export function isTextDropItem(item: DropItem): item is TextDropItem {
  return item.kind === "text";
}

export function isFileDropItem(item: DropItem): item is FileDropItem {
  return item.kind === "file";
}

export function isDirectoryDropItem(item: DropItem): item is DirectoryDropItem {
  return item.kind === "directory";
}

// ---------------------------------------------------------------------------
// What every collection on the page needs to know about the current drag
// ---------------------------------------------------------------------------

export interface DnDState {
  draggingCollectionRef?: ElementRef | undefined;
  draggingKeys: Set<Key>;
  dropCollectionRef?: ElementRef | undefined;
}

let globalDndState: DnDState = { draggingKeys: new Set() };
let dropEffect: DropEffect | undefined;
let allowedDropOperations = NONE;

export function dndState(): DnDState {
  return globalDndState;
}

export function setGlobalDndState(state: DnDState): void {
  globalDndState = state;
}

/** The effect the last drop target settled on, for Chrome on Android's `dragend`. */
export function globalDropEffect(): DropEffect | undefined {
  return dropEffect;
}

export function setGlobalDropEffect(effect: DropEffect | undefined): void {
  dropEffect = effect;
}

/** What a drag started on this page really allows, which WebKit misreports. */
export function globalAllowedDropOperations(): number {
  return allowedDropOperations;
}

export function setGlobalAllowedDropOperations(operations: number): void {
  allowedDropOperations = operations;
}

export function refElement(ref: ElementRef | undefined): Element | null {
  return access(ref) ?? null;
}

export function setDraggingCollectionRef(ref: ElementRef | undefined): void {
  globalDndState.draggingCollectionRef = ref;
}

export function setDraggingKeys(keys: Set<Key>): void {
  globalDndState.draggingKeys = keys;
}

export function setDropCollectionRef(ref: ElementRef | undefined): void {
  globalDndState.dropCollectionRef = ref;
}

export function clearGlobalDnDState(): void {
  globalDndState = { draggingKeys: new Set() };
}

/**
 * Whether the drag came from the collection it is being dropped on.
 *
 * A reorder and an insert look the same at the drop; only where the drag
 * started tells them apart.
 */
export function isInternalDropOperation(ref?: ElementRef): boolean {
  const dragging = refElement(globalDndState.draggingCollectionRef);
  return (
    dragging !== null &&
    dragging === (refElement(ref) ?? refElement(globalDndState.dropCollectionRef))
  );
}
