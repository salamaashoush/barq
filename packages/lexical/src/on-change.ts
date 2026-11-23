import { fromCells, onCleanup } from "@barqjs/core";
import { type EditorState, HISTORY_MERGE_TAG, type LexicalEditor } from "lexical";

import { useLexicalEditor } from "./context.ts";

export interface OnChangePluginProps {
  /** Skip updates tagged as history merges, such as the initial state. @default true */
  ignoreHistoryMergeTagChange?: boolean;
  /** Skip updates that only move the selection. @default false */
  ignoreSelectionChange?: boolean;
  onChange: (editorState: EditorState, editor: LexicalEditor, tags: Set<string>) => void;
}

/**
 * Calls `onChange` with the editor state after each update of the editor in
 * scope. Renders nothing.
 */
export const OnChangePlugin: (props: OnChangePluginProps) => null = fromCells<
  OnChangePluginProps,
  null
>((props) => {
  const editor = useLexicalEditor();
  onCleanup(
    editor.registerUpdateListener(
      ({ editorState, dirtyElements, dirtyLeaves, prevEditorState, tags }) => {
        if (
          (props.ignoreSelectionChange?.() === true &&
            dirtyElements.size === 0 &&
            dirtyLeaves.size === 0) ||
          (props.ignoreHistoryMergeTagChange?.() !== false && tags.has(HISTORY_MERGE_TAG)) ||
          prevEditorState.isEmpty()
        ) {
          return;
        }
        props.onChange()(editorState, editor, tags);
      },
    ),
  );
  return null;
});
