/**
 * `@barqjs/diagram/editor`: the editor without barq. `DiagramEditor` takes a
 * focusable container and three canvases and is Excalidraw's editor over
 * them; `<DiagramEditor>` from `@barqjs/diagram` mounts it in a page.
 */

export { DiagramEditor } from "./editor.ts";
export type {
  DiagramChangeListener,
  DiagramEditorApi,
  DiagramEditorOptions,
  SceneData,
  TextEditRequest,
} from "./editor.ts";
export {
  getDefaultEmbeddableSandbox,
  isEmbeddableLink,
  type Embed,
  type EmbedParts,
  type EmbeddableSandbox,
  type ValidateEmbeddable,
} from "./embeds.ts";
export { History, HistoryDelta } from "./history.ts";
export { Library, handleLibrary, parseLibraryTokensFromUrl } from "./library.ts";
export type {
  HandleLibraryOptions,
  LibraryPersistenceAdapter,
  LibraryMigrationAdapter,
  LibraryState,
} from "./library.ts";
export {
  actionChangeFontFamily,
  actionChangeFontSize,
  actionChangeTextAlign,
  actionChangeVerticalAlign,
  actionDecreaseFontSize,
  actionIncreaseFontSize,
  actionTextAutoResize,
} from "./actions/text.ts";
export { actionGoToCollaborator } from "./actions/navigate.ts";
export { textWysiwyg } from "./wysiwyg.ts";
export type { TextWysiwygOptions } from "./wysiwyg.ts";
export type { Action, ActionName, ActionResult, PointerDownState } from "./types.ts";
