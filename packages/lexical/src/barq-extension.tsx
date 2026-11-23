import { For } from "@barqjs/core";
import type { JSX } from "@barqjs/web";
import { declarePeerDependency, defineExtension, shallowMergeConfig } from "lexical";

import { ContentEditable } from "./content-editable.tsx";
import { LexicalComposerContext, type LexicalComposerContextWithEditor } from "./context.ts";
import { NodeDecorators } from "./decorators.tsx";
import { type ErrorBoundaryType, LexicalErrorBoundary } from "./error-boundary.tsx";

export interface DecoratorComponentProps {
  context: LexicalComposerContextWithEditor;
}

/** UI an extension adds to every editor it is part of, rendered inside the composer. */
export type DecoratorComponentType = (props: DecoratorComponentProps) => JSX.Element;

/** A component rendered with no props, such as the default `<ContentEditable />`. */
export type RootComponentType = () => JSX.Element;

export interface BarqConfig {
  /**
   * The editable root, rendered first. `ContentEditable` by default; `null`
   * when the application renders its own `ContentEditable` elsewhere.
   */
  contentEditable: RootComponentType | null;
  /** What each decorator renders inside, so one that throws stays contained. */
  ErrorBoundary: ErrorBoundaryType;
  /** Components every editor with this extension renders. Merged by concatenation. */
  decorators: readonly DecoratorComponentType[];
}

export interface EditorComponentProps {
  /**
   * Replaces the configured editable root: JSX to render in its place, or
   * `null` for none.
   */
  contentEditable?: JSX.Element | null;
  children?: JSX.Element;
}

export type EditorComponentType = (props: EditorComponentProps) => JSX.Element;

export interface BarqOutputs {
  /** The editor's UI: its context, its editable root, its children and its decorators. */
  Component: EditorComponentType;
  /** What `useLexicalComposerContext()` returns under `Component`. */
  context: LexicalComposerContextWithEditor;
}

/**
 * Declares that a barq host renders this editor, so an extension that needs
 * barq UI can say so and fail early under a host that has none.
 */
export const BarqProviderExtension = defineExtension({
  name: "@barqjs/lexical/BarqProvider",
});

function buildEditorComponent(
  config: BarqConfig,
  context: LexicalComposerContextWithEditor,
): EditorComponentType {
  const [editor] = context;
  const Root = config.contentEditable;
  const Boundary = config.ErrorBoundary;
  const decorators = config.decorators;
  const onError = (error: Error): void => editor._onError(error);

  return function EditorComponent(props: EditorComponentProps): JSX.Element {
    const replaced = props.contentEditable;
    return (
      <LexicalComposerContext value={context}>
        {replaced !== undefined ? replaced : Root === null ? null : <Root />}
        {props.children}
        <For each={decorators}>
          {(Decorator: DecoratorComponentType) => (
            <Boundary onError={onError}>
              <Decorator context={context} />
            </Boundary>
          )}
        </For>
        <NodeDecorators editor={editor} ErrorBoundary={Boundary} />
      </LexicalComposerContext>
    );
  };
}

function DefaultContentEditable(): JSX.Element {
  return <ContentEditable />;
}

const initialConfig: BarqConfig = {
  contentEditable: DefaultContentEditable,
  ErrorBoundary: LexicalErrorBoundary,
  decorators: [],
};

/**
 * Barq's part of an editor: it builds the `Component` that renders the editor
 * and its decorators, from the configured editable root, error boundary and
 * extension UI. `LexicalComposer` and `BarqPluginHostExtension` both host it.
 */
export const BarqExtension = defineExtension({
  build(editor, config, state): BarqOutputs {
    if (state.getPeer<typeof BarqProviderExtension>(BarqProviderExtension.name) === undefined) {
      throw new Error(
        "[barq] No BarqProviderExtension: render the editor with `LexicalComposer` or host it with " +
          `\`BarqPluginHostExtension\`. These extensions depend on BarqExtension: ${[
            ...state.getDirectDependentNames(),
          ].join(" ")}`,
      );
    }
    const context: LexicalComposerContextWithEditor = [
      editor,
      { getTheme: () => editor._config.theme },
    ];
    return { Component: buildEditorComponent(config, context), context };
  },
  config: initialConfig,
  mergeConfig(a, b) {
    const config = shallowMergeConfig(a, b);
    if (b.decorators) {
      config.decorators =
        b.decorators.length > 0 ? [...a.decorators, ...b.decorators] : a.decorators;
    }
    return config;
  },
  name: "@barqjs/lexical/Barq",
  peerDependencies: [
    declarePeerDependency<typeof BarqProviderExtension>("@barqjs/lexical/BarqProvider"),
  ],
});
