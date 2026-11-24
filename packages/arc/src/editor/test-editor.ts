/**
 * What the editor suites repeat: Lexical's commit and barq's flush, and text
 * typed one update a character, as keystrokes arrive.
 */

import { flush } from "@barqjs/core";
import { $getRoot, $getSelection, $isRangeSelection, type LexicalEditor } from "lexical";

export async function settle(ms = 0): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
  await new Promise((resolve) => setTimeout(resolve, ms));
  flush();
}

export async function typeText(editor: LexicalEditor, text: string): Promise<void> {
  for (const character of text) {
    editor.update(() => {
      let selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        $getRoot().selectEnd();
        selection = $getSelection();
      }
      if ($isRangeSelection(selection)) selection.insertText(character);
    });
    await settle();
  }
}

export async function selectAll(editor: LexicalEditor): Promise<void> {
  editor.update(() => {
    $getRoot().select(0, $getRoot().getChildrenSize());
  });
  await settle();
}

export function textOf(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => $getRoot().getTextContent());
}

export function keydown(target: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

/** A captured editor, for `onEditor`. */
export function capture(): { get: () => LexicalEditor; set: (editor: LexicalEditor) => void } {
  let current: LexicalEditor | undefined;
  return {
    get: () => {
      if (current === undefined) throw new Error("The editor has not been built.");
      return current;
    },
    set: (editor) => {
      current = editor;
    },
  };
}
