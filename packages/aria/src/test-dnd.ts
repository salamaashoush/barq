/**
 * A data transfer for tests, after React Aria's own mocks.
 *
 * happy-dom's `DataTransfer` cannot carry several entries, files or a drag
 * image, and its `DragEvent` drops the `dataTransfer` it is given, so a drag
 * in a test is built from these instead.
 */

import { flush } from "@barqjs/core";

export class MockDataTransferItem {
  kind: "string" | "file";
  type: string;
  data: unknown;

  constructor(type: string, data: unknown, kind: "string" | "file" = "string") {
    this.kind = kind;
    this.type = type;
    this.data = data;
  }

  getAsString(callback: (value: string) => void): void {
    if (this.kind === "string") callback(this.data as string);
  }

  getAsFile(): File | null {
    if (this.kind === "file" && this.data instanceof MockFileSystemFileEntry) {
      return this.data.contents;
    }
    return null;
  }

  webkitGetAsEntry(): unknown {
    return this.kind === "file" ? this.data : null;
  }
}

export class MockFileSystemFileEntry {
  isFile = true;
  isDirectory = false;
  name: string;
  contents: File;

  constructor(file: File) {
    this.name = file.name;
    this.contents = file;
  }

  file(resolve: (file: File) => void): void {
    resolve(this.contents);
  }
}

export interface DirectoryReader {
  readEntries(resolve: (entries: unknown[]) => void): void;
}

export class MockFileSystemDirectoryEntry {
  isFile = false;
  isDirectory = true;
  name: string;
  entries: unknown[];

  constructor(name: string, entries: unknown[]) {
    this.name = name;
    this.entries = entries;
  }

  createReader(): DirectoryReader {
    let entries = this.entries;
    return {
      readEntries(resolve) {
        const batch = entries;
        entries = [];
        resolve(batch);
      },
    };
  }
}

export class MockDataTransferItemList {
  items: MockDataTransferItem[] = [];

  add(data: unknown, type?: string): void {
    if (data instanceof File) {
      this.items.push(
        new MockDataTransferItem(data.type, new MockFileSystemFileEntry(data), "file"),
      );
    } else if (data instanceof MockFileSystemDirectoryEntry) {
      this.items.push(new MockDataTransferItem("", data, "file"));
    } else {
      this.items.push(new MockDataTransferItem(type ?? "", data));
    }
  }

  *[Symbol.iterator](): IterableIterator<MockDataTransferItem> {
    yield* this.items;
  }
}

export interface DragImage {
  node: Element;
  x: number;
  y: number;
}

export interface TransferEntry {
  type: string;
  data: unknown;
}

export class MockDataTransfer {
  items = new MockDataTransferItemList();
  dropEffect: DataTransfer["dropEffect"] = "none";
  effectAllowed: DataTransfer["effectAllowed"] = "all";
  dragImage: DragImage | undefined;

  setDragImage(node: Element, x: number, y: number): void {
    this.dragImage = { node, x, y };
  }

  get types(): string[] {
    const types = new Set<string>();
    for (const item of this.items) types.add(item.kind === "file" ? "Files" : item.type);
    return [...types];
  }

  getData(type: string): string {
    const item = this.items.items.find((each) => each.kind === "string" && each.type === type);
    return (item?.data as string | undefined) ?? "";
  }

  clearData(type?: string): void {
    this.items.items =
      type === undefined ? [] : this.items.items.filter((item) => item.type !== type);
  }

  /** The entries, as plain `{ type, data }` pairs, for comparing. */
  entries(): TransferEntry[] {
    return this.items.items.map((item) => ({ type: item.type, data: item.data }));
  }
}

export function asDataTransfer(mock: MockDataTransfer): DataTransfer {
  return mock as unknown as DataTransfer;
}

interface DragInit {
  dataTransfer: MockDataTransfer;
  clientX?: number;
  clientY?: number;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

/** A drag event carrying `dataTransfer`, which happy-dom's own would drop. */
export function dragEvent(type: string, init: DragInit): DragEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
    altKey: init.altKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    shiftKey: init.shiftKey ?? false,
  });
  Object.defineProperty(event, "dataTransfer", { value: init.dataTransfer });
  return event as DragEvent;
}

/** Dispatch a drag event and apply what it wrote. Answers whether it was not cancelled. */
export function fireDrag(target: Element, type: string, init: DragInit): boolean {
  const result = target.dispatchEvent(dragEvent(type, init));
  flush();
  return result;
}

/** A clipboard event carrying `clipboardData`. */
export function fireClipboard(target: Element, type: string, data: MockDataTransfer): boolean {
  const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
  Object.defineProperty(event, "clipboardData", { value: data });
  const result = target.dispatchEvent(event);
  flush();
  return result;
}

/** One animation frame, and whatever it wrote applied. */
export async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  flush();
}

/** What the live region has said, in order. */
export function announcements(): string[] {
  const region = document.querySelector("[data-barq-live-announcer]");
  if (region === null) return [];
  return [...region.querySelectorAll('[role="log"] > div')].map((entry) => entry.textContent ?? "");
}

type RectStub = (this: HTMLElement) => Omit<DOMRect, "toJSON"> | Record<string, number>;

const installedRects = new Set<() => void>();

export interface Restorable {
  mockRestore(): void;
}

/**
 * Stub `getBoundingClientRect` on every HTML element, and undo it exactly.
 *
 * Not `spyOn`: the method is inherited from `Element.prototype`, and a spy's
 * restore leaves an own copy on `HTMLElement.prototype`, which then shadows any
 * stub another test file puts on `Element.prototype` later in the same run.
 */
export function stubRects(stub: RectStub): Restorable {
  const proto = HTMLElement.prototype;
  const own = Object.getOwnPropertyDescriptor(proto, "getBoundingClientRect");
  Object.defineProperty(proto, "getBoundingClientRect", {
    configurable: true,
    writable: true,
    value(this: HTMLElement) {
      const rect = stub.call(this);
      return { ...rect, toJSON: () => rect };
    },
  });
  function restore(): void {
    if (!installedRects.delete(restore)) return;
    if (own === undefined) delete (proto as Partial<HTMLElement>).getBoundingClientRect;
    else Object.defineProperty(proto, "getBoundingClientRect", own);
  }
  installedRects.add(restore);
  return { mockRestore: restore };
}

/** Undo every rect stub still installed, newest first. For an `afterEach`. */
export function restoreRects(): void {
  for (const restore of [...installedRects].toReversed()) restore();
}
