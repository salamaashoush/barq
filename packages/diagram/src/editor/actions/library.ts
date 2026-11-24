import { LIBRARY_DISABLED_TYPES, randomId } from "@excalidraw/common";
import { CaptureUpdateAction, deepCopyElement } from "@excalidraw/element";

import type { Action } from "../types.ts";

/** Adds the selection, its labels and its frames' children, to the library as one item. */
export const actionAddToLibrary: Action = {
  name: "addToLibrary",
  label: "labels.addToLibrary",
  keywords: ["library", "save", "reuse"],
  announcement: "Added to library",
  perform: async (_elements, appState, _formData, editor) => {
    const selectedElements = editor.scene.getSelectedElements({
      selectedElementIds: appState.selectedElementIds,
      includeBoundTextElement: true,
      includeElementsInFrames: true,
    });
    for (const type of LIBRARY_DISABLED_TYPES) {
      if (selectedElements.some((element) => element.type === type)) {
        return {
          captureUpdate: CaptureUpdateAction.EVENTUALLY,
          appState: {
            ...appState,
            errorMessage: { key: `errors.libraryElementTypeError.${type}` },
          },
        };
      }
    }
    try {
      const items = await editor.library.getLatestLibrary();
      await editor.library.setLibrary([
        {
          id: randomId(),
          status: "unpublished",
          elements: selectedElements.map((element) => deepCopyElement(element)),
          created: Date.now(),
        },
        ...items,
      ]);
      return {
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
        appState: { toast: { message: { key: "toast.addedToLibrary" } } },
      };
    } catch (error) {
      return {
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
        appState: {
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      };
    }
  },
  predicate: (_elements, appState, editor) => editor.scene.getSelectedElements(appState).length > 0,
};
