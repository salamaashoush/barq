import { onCleanup, untrack } from "@barqjs/core";
import type { JSX } from "@barqjs/web";
import { LexicalBuilder, getExtensionDependencyFromEditor } from "@lexical/extension";
import {
  type AnyLexicalExtensionArgument,
  type EditorThemeClasses,
  type HTMLConfig,
  type InitialEditorStateType,
  type Klass,
  type LexicalEditor,
  type LexicalNode,
  type LexicalNodeReplacement,
  defineExtension,
} from "lexical";

import { BarqExtension, BarqProviderExtension } from "./barq-extension.tsx";

/**
 * What `@lexical/react`'s `LexicalComposer` took. The composer turns it into
 * the root extension of the editor it builds.
 */
export interface InitialConfig {
  namespace?: string;
  nodes?: readonly (Klass<LexicalNode> | LexicalNodeReplacement)[];
  onError?: (error: Error, editor: LexicalEditor) => void;
  onWarn?: (error: Error, editor: LexicalEditor) => void;
  editable?: boolean;
  theme?: EditorThemeClasses;
  /**
   * The document the editor opens with: a serialized state, an `EditorState`,
   * or a function that fills the root. Omitted, the editor opens with one
   * empty paragraph; `null` leaves the root empty, which a collaborative
   * editor needs so the shared document fills it.
   */
  editorState?: InitialEditorStateType;
  html?: HTMLConfig;
}

export interface LexicalComposerProps {
  /** The editor's extensions: rich or plain text, history, lists, links, your own. */
  extensions?: readonly AnyLexicalExtensionArgument[];
  /** Namespace, nodes, theme, error handler and initial document, as one root extension. */
  initialConfig?: InitialConfig;
  /**
   * The editable root rendered before the children. `<ContentEditable />` by
   * default; `null` when the children render their own.
   */
  contentEditable?: JSX.Element | null;
  children?: JSX.Element;
}

function rootExtension(config: InitialConfig): AnyLexicalExtensionArgument {
  const { editorState, ...rest } = config;
  const defined = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  ) as Omit<InitialConfig, "editorState">;
  return defineExtension({
    ...defined,
    ...(editorState === undefined ? {} : { $initialEditorState: editorState }),
    name: "@barqjs/lexical/InitialConfig",
  });
}

/** The editor a composer renders, built from its extensions and initial config. */
export function buildComposerEditor(
  extensions: readonly AnyLexicalExtensionArgument[] = [],
  initialConfig?: InitialConfig,
): LexicalEditor & { dispose: () => void } {
  const editor = LexicalBuilder.fromExtensions([
    BarqProviderExtension,
    BarqExtension,
    ...extensions,
    ...(initialConfig === undefined ? [] : [rootExtension(initialConfig)]),
  ]).buildEditor();
  // A document filled by a function is an update Lexical commits a microtask
  // later, and until then the editor reads as empty: a server would write
  // the placeholder over it and a browser would flash it. Committed here, the
  // editor is its document from the first read.
  editor.update(() => undefined, { discrete: true });
  return editor;
}

/**
 * Builds one editor from `extensions` and `initialConfig`, provides it to
 * everything inside, renders the editable root and the decorator nodes, and
 * disposes the editor with the component.
 *
 * The editor is built once. Both props are read when the composer is built and
 * never again, as `@lexical/react` reads its `initialConfig`; to edit a
 * different document, build a new composer.
 *
 * ```tsx
 * <LexicalComposer
 *   extensions={[RichTextExtension, HistoryExtension, ListExtension]}
 *   initialConfig={{ namespace: "notes", onError: report }}
 * >
 *   <Toolbar />
 * </LexicalComposer>
 * ```
 */
export function LexicalComposer(props: LexicalComposerProps): JSX.Element {
  const editor = untrack(() => buildComposerEditor(props.extensions, props.initialConfig));
  onCleanup(() => editor.dispose());
  const { Component } = getExtensionDependencyFromEditor(editor, BarqExtension).output;
  return <Component contentEditable={props.contentEditable}>{props.children}</Component>;
}
