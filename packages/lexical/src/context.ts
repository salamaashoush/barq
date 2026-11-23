import { type Context, createContext, getContext, getOwner } from "@barqjs/core";
import type { EditorThemeClasses, LexicalEditor } from "lexical";

export interface LexicalComposerContextType {
  getTheme: () => EditorThemeClasses | null | undefined;
}

export type LexicalComposerContextWithEditor = [LexicalEditor, LexicalComposerContextType];

/**
 * The editor a composer built, with its theme. `LexicalComposer` provides it
 * and every component below reads it, including a decorator mounted into the
 * document: a portal keeps the scope it was written in.
 */
export const LexicalComposerContext: Context<LexicalComposerContextWithEditor | undefined> =
  createContext<LexicalComposerContextWithEditor | undefined>(undefined, "barq-lexical-composer");

/** The `[editor, context]` pair of the composer in scope; throws outside one. */
export function useLexicalComposerContext(): LexicalComposerContextWithEditor {
  const owner = getOwner();
  const value = owner === null ? undefined : getContext(LexicalComposerContext, owner);
  if (value === undefined) {
    throw new Error(
      "[barq] useLexicalComposerContext was called outside a `LexicalComposer`, so there is no editor to read. " +
        "Render the component inside `<LexicalComposer>`.",
    );
  }
  return value;
}

/** The editor of the composer in scope; throws outside one. */
export function useLexicalEditor(): LexicalEditor {
  return useLexicalComposerContext()[0];
}
