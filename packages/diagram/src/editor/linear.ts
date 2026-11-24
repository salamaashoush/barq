import type { LinearElementEditor } from "@excalidraw/element";

/**
 * The line editor's state with `patch` applied. Excalidraw spreads the
 * editor into a plain object for this; the copy here keeps its prototype.
 */
export const patchLinearEditor = (
  editor: LinearElementEditor,
  patch: Partial<LinearElementEditor>,
): LinearElementEditor =>
  Object.assign(
    Object.create(Object.getPrototypeOf(editor) as object | null) as LinearElementEditor,
    editor,
    patch,
  );
