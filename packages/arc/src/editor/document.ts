import { buildEditorFromExtensions } from "@lexical/extension";
import { HistoryExtension } from "@lexical/history";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  type Transformer,
  registerMarkdownShortcuts,
} from "@lexical/markdown";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type AnyLexicalExtensionArgument,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  type EditorThemeClasses,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
  PASTE_COMMAND,
  type SerializedEditorState,
  defineExtension,
  mergeRegister,
} from "lexical";

import type { AnyBlock } from "./blocks.tsx";
import {
  type EditorExtension,
  keysMatch,
  provideEditorExtensions,
  resolveExtensions,
} from "./extension.ts";
import { documentPreset } from "./presets.ts";
import { editorTheme } from "./theme.ts";

export { isSafeUrl } from "./core.tsx";

export interface DocumentOptions {
  /** The extensions it starts from. @default `documentPreset` */
  preset?: readonly EditorExtension[];
  /** Extensions added to the preset; one named as a preset's own takes its place. */
  extensions?: readonly EditorExtension[];
  /** Typed markdown becomes formatting: `# `, `- `, `**bold**`. @default true */
  markdownShortcuts?: boolean;
  /** Undo and redo. Off for a shared document, whose own history takes over. @default true */
  history?: boolean;
  theme?: EditorThemeClasses;
}

/** The extensions a document holds, resolved: the preset's and the ones added. */
export function documentEditorExtensions(options: DocumentOptions = {}): EditorExtension[] {
  return resolveExtensions([...(options.preset ?? documentPreset), ...(options.extensions ?? [])]);
}

/** The blocks a document knows, from every extension it holds. */
export function documentBlocks(options: DocumentOptions = {}): AnyBlock[] {
  return documentEditorExtensions(options).flatMap((extension) => extension.blocks ?? []);
}

/**
 * Every markdown rule a document reads and writes, from each extension it
 * holds, the most particular first.
 */
export function markdownTransformers(options: DocumentOptions = {}): Transformer[] {
  const all: Transformer[] = [];
  const ranked = documentEditorExtensions(options)
    .map((extension, index) => ({ extension, index }))
    .toSorted(
      (a, b) =>
        (b.extension.markdownPriority ?? 0) - (a.extension.markdownPriority ?? 0) ||
        a.index - b.index,
    );
  for (const { extension } of ranked) {
    const rules = extension.markdown;
    all.push(...(typeof rules === "function" ? rules(() => all) : (rules ?? [])));
  }
  return all;
}

function mergeThemes(base: EditorThemeClasses, extensions: readonly EditorExtension[]) {
  const theme: EditorThemeClasses = { ...base };
  for (const extension of extensions) Object.assign(theme, extension.theme);
  return theme;
}

/** Each extension's keys, the first that answers taking the key. */
function registerKeys(editor: LexicalEditor, extensions: readonly EditorExtension[]): () => void {
  const bindings = extensions.flatMap((extension) => extension.keys ?? []);
  if (bindings.length === 0) return () => undefined;
  return editor.registerCommand(
    KEY_DOWN_COMMAND,
    (event) => {
      for (const binding of bindings) {
        if (!keysMatch(event, binding.keys)) continue;
        if (binding.run(editor, event) === false) continue;
        event.preventDefault();
        return true;
      }
      return false;
    },
    COMMAND_PRIORITY_LOW,
  );
}

/** Each extension's paste rules, the highest first; what none takes is Lexical's own paste. */
function registerPaste(editor: LexicalEditor, extensions: readonly EditorExtension[]): () => void {
  const rules = extensions
    .flatMap((extension) => extension.paste ?? [])
    .toSorted((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  if (rules.length === 0) return () => undefined;
  return editor.registerCommand(
    PASTE_COMMAND,
    (event) => {
      const data = "clipboardData" in event ? event.clipboardData : null;
      const selection = $getSelection();
      if (data === null || !$isRangeSelection(selection)) return false;
      for (const rule of rules) {
        if (!rule.$paste(data, selection, editor)) continue;
        event.preventDefault();
        return true;
      }
      return false;
    },
    COMMAND_PRIORITY_HIGH,
  );
}

/**
 * The Lexical extensions a document is built from, in the editor, the
 * renderer and on a server alike, so all three read the same JSON.
 */
export function documentExtensions(options: DocumentOptions = {}): AnyLexicalExtensionArgument[] {
  const resolved = documentEditorExtensions(options);
  const extensions: AnyLexicalExtensionArgument[] = resolved.flatMap(
    (extension) => extension.lexical ?? [],
  );
  extensions.push(
    defineExtension({
      name: "@barqjs/arc/document",
      nodes: () => [
        ...resolved.flatMap((extension) => extension.nodes ?? []),
        ...resolved.flatMap((extension) => (extension.blocks ?? []).map((block) => block.node)),
      ],
      theme: mergeThemes(options.theme ?? editorTheme(), resolved),
      register: (editor) =>
        mergeRegister(
          provideEditorExtensions(editor, resolved),
          ...resolved.map((extension) => extension.register?.(editor) ?? (() => undefined)),
          registerKeys(editor, resolved),
          registerPaste(editor, resolved),
        ),
    }),
  );
  if (options.history !== false) extensions.push(HistoryExtension);
  if (options.markdownShortcuts !== false) {
    const transformers = markdownTransformers(options);
    extensions.push(
      defineExtension({
        name: "@barqjs/arc/markdown-shortcuts",
        register: (editor) => registerMarkdownShortcuts(editor, transformers),
      }),
    );
  }
  return extensions;
}

/**
 * An editor with no screen, for a server or a conversion: the same nodes as
 * `RichTextEditor`, so it reads and writes the same documents. Dispose it
 * when done.
 */
export function createDocumentEditor(
  options: DocumentOptions = {},
): LexicalEditor & { dispose: () => void } {
  return buildEditorFromExtensions(
    ...documentExtensions({ ...options, history: false, markdownShortcuts: false }),
    defineExtension({
      name: "@barqjs/arc/headless",
      $initialEditorState: null,
      onError: (error: Error) => {
        throw error;
      },
    }),
  );
}

/** A stored document: its JSON, as a string or parsed. */
export type DocumentValue = string | SerializedEditorState;

/** Markdown read into a document, with the same rules the editor types and exports with. */
export function markdownToDocument(
  markdown: string,
  options: DocumentOptions = {},
): SerializedEditorState {
  const editor = createDocumentEditor(options);
  try {
    const transformers = markdownTransformers(options);
    editor.update(() => $convertFromMarkdownString(markdown, transformers), { discrete: true });
    return editor.getEditorState().toJSON();
  } finally {
    editor.dispose();
  }
}

/** A document written as markdown. */
export function documentToMarkdown(value: DocumentValue, options: DocumentOptions = {}): string {
  const editor = createDocumentEditor(options);
  try {
    editor.setEditorState(editor.parseEditorState(value));
    const transformers = markdownTransformers(options);
    return editor.read(() => $convertToMarkdownString(transformers));
  } finally {
    editor.dispose();
  }
}

/** A document's text alone, as a search index or a notification wants it. */
export function documentToText(value: DocumentValue, options: DocumentOptions = {}): string {
  const editor = createDocumentEditor(options);
  try {
    editor.setEditorState(editor.parseEditorState(value));
    return editor.read(() => $getRoot().getTextContent());
  } finally {
    editor.dispose();
  }
}
