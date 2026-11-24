import { type Accessor, createRenderEffect, onCleanup } from "@barqjs/core";
import { isServer } from "@barqjs/web";

import { type HandleLibraryOptions, handleLibrary } from "../editor/library.ts";

import type { DiagramEditorApi } from "../editor/editor.ts";

/**
 * Excalidraw's `useHandleLibrary`: once the editor's API is there, installs
 * the library an `#addLibrary=` URL names and keeps the library in
 * `adapter`, until the component goes or the API changes.
 *
 * ```tsx
 * const [api, setApi] = createSignal<DiagramEditorApi | null>(null);
 * useHandleLibrary({ excalidrawAPI: api, adapter: libraryStore });
 * <DiagramEditor api={setApi} />;
 * ```
 */
export const useHandleLibrary = (
  opts: Omit<HandleLibraryOptions, "excalidrawAPI"> & {
    excalidrawAPI: Accessor<DiagramEditorApi | null | undefined>;
  },
): void => {
  if (isServer) return;
  let stop: (() => void) | null = null;
  createRenderEffect(opts.excalidrawAPI, (api) => {
    stop?.();
    stop = api ? handleLibrary({ ...opts, excalidrawAPI: api }) : null;
  });
  onCleanup(() => {
    stop?.();
    stop = null;
  });
};
