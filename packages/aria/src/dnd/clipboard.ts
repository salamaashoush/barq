/** Copy, cut and paste, through the system clipboard. */

import { createEffect } from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { focused } from "../interactions/focus-events.ts";
import { access, type DOMProps, type MaybeAccessor } from "../utils.ts";
import { readFromDataTransfer, writeToDataTransfer } from "./data.ts";
import type { DragItem, DropItem } from "./types.ts";

export interface ClipboardOptions {
  /** What a copy or a cut writes. Without it, nothing can be copied. */
  getItems?: (details: { action: "cut" | "copy" }) => DragItem[];
  onCopy?: () => void;
  /** Without it, nothing can be cut. */
  onCut?: () => void;
  /** Without it, nothing can be pasted. */
  onPaste?: (items: DropItem[]) => void;
  isDisabled?: MaybeAccessor<boolean | undefined>;
}

export interface ClipboardResult {
  clipboardProps: DOMProps;
}

type ClipboardListener = (event: ClipboardEvent) => void;

const clipboardHandlers = new Map<
  string,
  { listener: (event: Event) => void; handlers: Set<ClipboardListener> }
>();

/** One document listener per event, shared by every element that wants it. */
function addClipboardListener(type: string, handler: ClipboardListener): () => void {
  let entry = clipboardHandlers.get(type);
  if (entry === undefined) {
    const handlers = new Set<ClipboardListener>();
    const listener = (event: Event): void => {
      for (const each of handlers) each(event as ClipboardEvent);
    };
    entry = { listener, handlers };
    clipboardHandlers.set(type, entry);
    document.addEventListener(type, listener);
  }
  const registered = entry;
  registered.handlers.add(handler);
  return () => {
    registered.handlers.delete(handler);
    if (registered.handlers.size === 0) {
      document.removeEventListener(type, registered.listener);
      clipboardHandlers.delete(type);
    }
  };
}

/**
 * Copy, cut and paste for a focusable element, through the system clipboard.
 *
 * The clipboard events fire on the document whatever is focused, so they are
 * heard there and acted on only while this element has focus.
 */
export function clipboard(options: ClipboardOptions): ClipboardResult {
  let isFocused = false;
  const { focusProps } = focused({
    onFocusChange: (value) => {
      isFocused = value;
    },
  });

  // Each `before*` event enables the menu item in Safari.
  const onBeforeCopy = (event: ClipboardEvent): void => {
    if (isFocused && options.getItems !== undefined) event.preventDefault();
  };
  const onCopy = (event: ClipboardEvent): void => {
    if (!isFocused || options.getItems === undefined) return;
    event.preventDefault();
    if (event.clipboardData === null) return;
    writeToDataTransfer(event.clipboardData, options.getItems({ action: "copy" }));
    options.onCopy?.();
  };
  const onBeforeCut = (event: ClipboardEvent): void => {
    if (isFocused && options.onCut !== undefined && options.getItems !== undefined) {
      event.preventDefault();
    }
  };
  const onCut = (event: ClipboardEvent): void => {
    if (!isFocused || options.onCut === undefined || options.getItems === undefined) return;
    event.preventDefault();
    if (event.clipboardData === null) return;
    writeToDataTransfer(event.clipboardData, options.getItems({ action: "cut" }));
    options.onCut();
  };
  // The types are not readable here, so Paste is enabled whatever is on the
  // clipboard.
  const onBeforePaste = (event: ClipboardEvent): void => {
    if (isFocused && options.onPaste !== undefined) event.preventDefault();
  };
  const onPaste = (event: ClipboardEvent): void => {
    if (!isFocused || options.onPaste === undefined) return;
    event.preventDefault();
    if (event.clipboardData === null) return;
    options.onPaste(readFromDataTransfer(event.clipboardData));
  };

  if (!isServer) {
    createEffect(
      () => access(options.isDisabled) === true,
      (disabled) => {
        if (disabled) return undefined;
        const undo = [
          addClipboardListener("beforecopy", onBeforeCopy),
          addClipboardListener("copy", onCopy),
          addClipboardListener("beforecut", onBeforeCut),
          addClipboardListener("cut", onCut),
          addClipboardListener("beforepaste", onBeforePaste),
          addClipboardListener("paste", onPaste),
        ];
        return () => {
          for (const fn of undo) fn();
        };
      },
    );
  }

  return { clipboardProps: focusProps };
}
