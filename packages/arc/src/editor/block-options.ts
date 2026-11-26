import type { LexicalEditor } from "lexical";

/**
 * What an extension made with options tells the blocks it draws, by editor: a
 * block's component is drawn by the editor's decorators, which reach the
 * editor and not the extension that holds the options.
 */
export interface BlockOptionsChannel<Options> {
  /** For `register`: the editor's blocks read `options` until the returned function runs. */
  provide: (editor: LexicalEditor, options: Options) => () => void;
  read: (editor: LexicalEditor) => Options | undefined;
}

export function blockOptions<Options>(): BlockOptionsChannel<Options> {
  const byEditor = new WeakMap<LexicalEditor, Options>();
  return {
    provide: (editor, options) => {
      byEditor.set(editor, options);
      return () => {
        if (byEditor.get(editor) === options) byEditor.delete(editor);
      };
    },
    read: (editor) => byEditor.get(editor),
  };
}
