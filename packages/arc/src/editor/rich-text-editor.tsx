import {
  type Child,
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  untrack,
} from "@barqjs/core";
import { variants } from "@barqjs/css";
import { tokens } from "@barqjs/ui/theme/tokens";
import { announce } from "@barqjs/aria/live";
import { ContentEditable, LexicalComposer, useLexicalEditor } from "@barqjs/lexical";
import type { JSX } from "@barqjs/web";
import {
  type AnyLexicalExtensionArgument,
  type LexicalEditor,
  type SerializedEditorState,
  mergeRegister,
} from "lexical";
import { $convertFromMarkdownString } from "@lexical/markdown";

import { type UploadContext, useUploadQueue } from "../components/file-upload.tsx";
import { useArcMessages } from "../components/messages.ts";
import { proseStyles } from "../components/typography.tsx";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  edge,
  fg,
  focus,
  gap,
  interaction,
  layout,
  motion,
  place,
  rounded,
  space,
  truncate,
  type,
  zIndex,
} from "../style/index.ts";
import { labelOf } from "./blocks.tsx";
import {
  type DocumentOptions,
  type DocumentValue,
  documentEditorExtensions,
  documentExtensions,
  markdownTransformers,
} from "./document.ts";
import {
  type EditorExtension,
  commandsOf,
  editorExtensions,
  provideEditorMessages,
} from "./extension.ts";
import { useRegistration } from "./hooks.ts";
import { EditorDocument } from "./renderer.tsx";
import { editableText } from "./theme.ts";
import {
  type TextDirection,
  languageDirection,
  textDirection,
  useDocumentDirection,
} from "./direction.tsx";
import { FloatingFormatToolbar, LinkEditor } from "./floating.tsx";
import { provideEditorUploads } from "./media.tsx";
import { settleUpload } from "./picture.tsx";
import {
  type AutosaveOptions,
  QUIET_REPLACE_TAG,
  useCharacterCount,
  useEditorAutosave,
} from "./state.ts";
import { DEFAULT_TOOLS, type EditorTool, EditorToolbar, type InsertAction } from "./toolbar.tsx";

export const richTextEditorStyles = variants({
  slots: {
    root: arc(layout.column, layout.relative, layout.minZero, {
      // Focus mode: the editor alone over the page, its text in a readable column.
      "&[data-focus-mode]": {
        position: "fixed",
        inset: "0",
        zIndex: zIndex.overlay,
        backgroundColor: tokens.background,
      },
    }),
    body: arc(layout.relative, layout.growAuto, layout.minZero, {
      overflowY: "auto",
      minBlockSize: "var(--editor-min-height, auto)",
      maxBlockSize: "var(--editor-max-height, none)",
    }),
    content: arc(editableText, {
      minBlockSize: "var(--editor-min-height, auto)",
      padding: space.x3,
      // Footnotes number themselves in reading order from this counter.
      counterReset: "arc-footnote",
      "[data-focus-mode] &": { maxInlineSize: "72ch", marginInline: "auto", width: "100%" },
    }),
    placeholder: arc(fg.faint, truncate, place.passive, {
      insetBlockStart: space.x3,
      insetInline: space.x3,
    }),
    footer: arc(layout.row, layout.between, gap[2], type.caption, fg.muted, place.paddedStrip),
    error: arc(type.caption, fg.danger, place.paddedStrip, layout.flush),
    status: arc({}),
    counter: arc(type.numeric, layout.pushEnd, {
      "&[data-over]": { color: tokens.destructive, fontWeight: "var(--font-weight-medium)" },
    }),
  },
  variants: {
    variant: {
      /** A field's box: an edge, the focus ring and the invalid state. */
      default: {
        root: arc(
          edge.input,
          rounded.md,
          bg.page,
          focus.within,
          interaction.invalid,
          motion.colours,
          {
            overflow: "hidden",
          },
        ),
      },
      /** No box: a document page that is the editor. */
      plain: { content: arc({ paddingInline: "0px" }), placeholder: arc({ insetInline: "0px" }) },
    },
  },
  defaults: { variant: "default" },
});

type Slots = ReturnType<typeof richTextEditorStyles>;

export interface RichTextEditorProps
  extends
    Customisable<Slots>,
    Pick<
      DocumentOptions,
      "preset" | "extensions" | "markdownShortcuts" | "history" | "historyLimit"
    > {
  /** Names the text box. */
  label?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  /** The document it opens with: stored JSON. Read once. */
  defaultValue?: DocumentValue;
  /** The document it opens with, as markdown. Read once. */
  defaultMarkdown?: string;
  /**
   * Told the document after each change, skipping moves of the selection, a
   * quiet `replaceDocument` and a change `validate` refuses.
   */
  onChange?: (value: SerializedEditorState, editor: LexicalEditor) => void;
  /**
   * Checks the document after each change: `true` when it may be saved,
   * `false` or the words that say why not, shown under the editor.
   */
  validate?: (value: SerializedEditorState) => boolean | string;
  /** Told when the document turns valid or invalid by `validate`. */
  onValidityChange?: (valid: boolean) => void;
  /** Takes focus once it is built. */
  autoFocus?: boolean;
  /**
   * The language the document is written in, which sets its direction; without
   * it the direction is its first letter's, and the interface's until it has one.
   */
  language?: string;
  /** Shown faint while the document is empty. */
  placeholder?: string;
  /** Shown and kept to, but not edited. Followed as it changes. */
  readOnly?: boolean;
  /** Marks the box invalid. */
  invalid?: boolean;
  /** The toolbar, or the groups it shows. @default true */
  toolbar?: boolean | readonly EditorTool[];
  /** The marks over selected text. @default true */
  floatingToolbar?: boolean;
  /** A counter of characters against it, red and announced once past it. */
  maxLength?: number;
  /** Sends a picture and resolves with its URL: images are offered, pasted and dropped only with it. */
  upload?: (file: File, context: UploadContext) => Promise<string>;
  /** The largest picture accepted, in bytes. */
  maxImageSize?: number;
  /** Saves as typing pauses, with the status in the footer. */
  autosave?: AutosaveOptions;
  /** Lexical extensions of an app's own, beside the editor extensions. */
  lexical?: readonly AnyLexicalExtensionArgument[];
  /** A shared document: the editor opens empty for the shared state to fill and its history is the shared one. */
  collaborative?: boolean;
  /** `default` is a field's box; `plain` has none, for a page that is the editor. */
  variant?: "default" | "plain";
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  /** A CSS length, or pixels. */
  minHeight?: string | number;
  /** A CSS length, or pixels. Past it the document scrolls. */
  maxHeight?: string | number;
  /** Told the editor once it is built, for anything the props do not reach. */
  onEditor?: (editor: LexicalEditor) => void;
  /** Typeaheads, collaboration and anything else that works inside the editor. */
  children?: JSX.Element;
}

interface StoredText {
  text?: string;
  children?: StoredText[];
}

interface StoredRoot {
  root: StoredText;
}

/** A stored document's words, as far as its first letter that says which way it reads. */
function storedText(value: DocumentValue): string {
  const state = (typeof value === "string" ? JSON.parse(value) : value) as StoredRoot;
  const words: string[] = [];
  function walk(node: StoredText): boolean {
    if (typeof node.text === "string") {
      words.push(node.text);
      if (textDirection(node.text) !== null) return true;
    }
    return (node.children ?? []).some(walk);
  }
  walk(state.root);
  return words.join(" ");
}

function heights(
  min: string | number | undefined,
  max: string | number | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  function length(value: string | number): string {
    return typeof value === "number" ? `${String(value)}px` : value;
  }
  if (min !== undefined) out["--editor-min-height"] = length(min);
  if (max !== undefined) out["--editor-max-height"] = length(max);
  return out;
}

export interface ExtensionPluginsProps {
  extensions: readonly EditorExtension[];
}

/** What every extension the editor holds mounts: its panels, dialogs and listeners. */
export function ExtensionPlugins(props: ExtensionPluginsProps) {
  const plugins = untrack(() => props.extensions.flatMap((extension) => extension.plugins ?? []));
  return <For each={plugins}>{(Plugin: () => JSX.Element) => <Plugin />}</For>;
}

export interface EditorBridgeProps {
  readOnly?: boolean;
  onChange?: RichTextEditorProps["onChange"];
  onEditor?: (editor: LexicalEditor) => void;
  validate?: RichTextEditorProps["validate"];
  onValidityChange?: RichTextEditorProps["onValidityChange"];
  /** Told what `validate` says is wrong, `null` once nothing is. */
  onProblem?: (problem: string | null) => void;
  autoFocus?: boolean;
  language?: string;
}

/** What the editor's props reach once it is built: read-only, changes, validity, focus, direction. */
export function EditorBridge(props: EditorBridgeProps) {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  provideEditorMessages(editor, messages);
  useDocumentDirection(() => props.language);
  untrack(() => props.onEditor?.(editor));
  createEffect(
    () => props.readOnly === true,
    (readOnly) => {
      editor.setEditable(!readOnly);
    },
  );
  let problem: string | null = null;
  function check(value: SerializedEditorState): boolean {
    const validate = props.validate;
    if (validate === undefined) return true;
    const result = validate(value);
    const next = result === true ? null : result === false ? messages().documentInvalid : result;
    if (next !== problem) {
      const wasValid = problem === null;
      problem = next;
      props.onProblem?.(next);
      if (wasValid !== (next === null)) props.onValidityChange?.(next === null);
    }
    return next === null;
  }
  useRegistration(() =>
    mergeRegister(
      editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves, tags }) => {
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
        if (tags.has("history-merge")) return;
        const value = editorState.toJSON();
        if (!check(value) || tags.has(QUIET_REPLACE_TAG)) return;
        props.onChange?.(value, editor);
      }),
      editor.registerRootListener((root) => {
        if (root !== null && untrack(() => props.autoFocus === true)) {
          queueMicrotask(() => editor.focus(() => editor.getRootElement()?.focus()));
        }
      }),
    ),
  );
  return null;
}

interface FooterProps {
  cls: Slots;
  maxLength?: number;
  autosave?: AutosaveOptions;
  extensions: readonly EditorExtension[];
}

function Footer(props: FooterProps) {
  const footers = untrack(() =>
    props.extensions.flatMap((extension) =>
      extension.footer === undefined ? [] : [extension.footer],
    ),
  );
  const messages = useArcMessages();
  const counter = useCharacterCount(() => props.maxLength);
  const autosave = props.autosave === undefined ? undefined : useEditorAutosave(props.autosave);
  let wasOver = false;
  createEffect(
    () => (counter.over() ? messages().charactersOver(-counter.remaining()) : null),
    (over) => {
      if (over !== null && !wasOver) announce(over, "polite");
      wasOver = over !== null;
    },
  );
  function status(): string {
    switch (autosave?.status()) {
      case "pending":
      case "saving":
        return messages().saving;
      case "saved":
        return messages().saved;
      case "error":
        return messages().saveFailed;
      default:
        return "";
    }
  }
  return (
    <div class={props.cls.footer} data-slot="rich-text-editor-footer">
      <For each={footers}>{(Part: () => JSX.Element) => <Part />}</For>
      <span class={props.cls.status} data-slot="rich-text-editor-status" role="status">
        {status()}
      </span>
      <Show when={props.maxLength !== undefined}>
        <span
          class={props.cls.counter}
          data-slot="rich-text-editor-counter"
          data-over={counter.over() ? "" : undefined}
          aria-label={
            counter.over()
              ? messages().charactersOver(-counter.remaining())
              : messages().charactersLeft(counter.remaining())
          }
        >
          {`${String(counter.count())}/${String(props.maxLength)}`}
        </span>
      </Show>
    </div>
  );
}

interface UploadsProps {
  upload: (file: File, context: UploadContext) => Promise<string>;
  maxSize?: number;
  children: Child;
}

/** The images an editor uploads, through arc's queue. */
function Uploads(props: UploadsProps) {
  const editor = useLexicalEditor();
  const queue = useUploadQueue({
    upload: (file, context) => props.upload(file, context),
    onUploaded: (item) => settleUpload(editor, item),
  });
  provideEditorUploads(editor, {
    queue,
    send: (file) =>
      props.upload(file, { onProgress: () => undefined, signal: new AbortController().signal }),
    maxSize: untrack(() => props.maxSize),
  });
  return <>{props.children}</>;
}

interface EditorToolsProps {
  tools: readonly EditorTool[];
}

/** The toolbar, with what the editor's extensions offer to insert. */
function EditorTools(props: EditorToolsProps) {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  const insert = createMemo((): InsertAction[] =>
    commandsOf(editorExtensions(editor), editor, "insert").map((command) => ({
      id: command.id,
      label: labelOf(command.label, messages()),
      icon: command.icon,
      onInsert: () => command.run(editor),
    })),
  );
  return <EditorToolbar tools={props.tools} insert={insert()} />;
}

/**
 * A rich text editor on Lexical: a toolbar that follows the selection and
 * folds into a More menu as it narrows, the marks over selected text, links
 * edited in a popover, markdown typed and read and written, code blocks
 * highlighted as `CodeBlock` highlights them, tables, images uploaded through
 * arc's queue or pasted, embeds, a character counter and autosave.
 *
 * ```tsx
 * <RichTextEditor
 *   label="Description"
 *   defaultMarkdown={task.description}
 *   onChange={(value) => setDraft(value)}
 *   upload={(file, { onProgress, signal }) => api.upload(file, onProgress, signal)}
 *   maxLength={5000}
 * />
 * ```
 *
 * The document is Lexical's JSON, which `RichTextRenderer` draws without an
 * editor; `documentToMarkdown` and `markdownToDocument` convert it. Each
 * block takes its direction from its own text, so Arabic and English sit in
 * one document each the right way round. The heavy code lives in
 * `@barqjs/arc/editor`, which an app that never edits rich text never loads.
 */
export function RichTextEditor(props: RichTextEditorProps) {
  function cls(): Slots {
    return parts(richTextEditorStyles({ variant: props.variant }), props.classes);
  }
  const placeholderId = createUniqueId();
  function tools(): readonly EditorTool[] | null {
    return props.toolbar === false
      ? null
      : props.toolbar === true || props.toolbar === undefined
        ? DEFAULT_TOOLS
        : props.toolbar;
  }

  const errorId = createUniqueId();
  const [problem, setProblem] = createSignal<string | null>(null, { ownedWrite: true });
  function invalid(): boolean {
    return props.invalid === true || problem() !== null;
  }
  function describedBy(): string | undefined {
    const ids = [props["aria-describedby"], problem() === null ? undefined : errorId].filter(
      (one) => one !== undefined,
    );
    return ids.length === 0 ? undefined : ids.join(" ");
  }
  const options = untrack((): DocumentOptions => ({
    preset: props.preset,
    extensions: props.extensions,
    markdownShortcuts: props.markdownShortcuts,
    history: props.collaborative === true ? false : props.history,
    historyLimit: props.historyLimit,
  }));
  // The direction the server writes, from the opening document's words, so
  // the page is the right way round before the editor takes it over.
  const opening = untrack((): TextDirection | undefined => {
    if (props.language !== undefined) return languageDirection(props.language);
    const text =
      props.defaultMarkdown ??
      (props.defaultValue === undefined ? "" : storedText(props.defaultValue));
    return textDirection(text) ?? undefined;
  });
  const resolved = documentEditorExtensions(options);
  const extensions = untrack(() => [...documentExtensions(options), ...(props.lexical ?? [])]);
  const editorState = untrack(() => {
    if (props.collaborative === true) return null;
    if (props.defaultValue !== undefined) {
      return typeof props.defaultValue === "string"
        ? props.defaultValue
        : JSON.stringify(props.defaultValue);
    }
    const markdown = props.defaultMarkdown;
    if (markdown === undefined) return undefined;
    const transformers = markdownTransformers(options);
    return () => $convertFromMarkdownString(markdown, transformers);
  });

  function body(): Child {
    return (
      <>
        <Show when={tools()}>
          {(list: () => readonly EditorTool[]) => <EditorTools tools={list()} />}
        </Show>
        <div class={cls().body} data-slot="rich-text-editor-body" dir={opening}>
          <ContentEditable
            class={arc(proseStyles({ size: props.size, width: "full" }).root, cls().content)}
            data-slot="rich-text-editor-content"
            aria-label={props.label}
            aria-labelledby={props["aria-labelledby"]}
            aria-describedby={describedBy()}
            aria-multiline={true}
            aria-invalid={invalid() ? true : undefined}
            lang={props.language}
            aria-placeholder={props.placeholder}
            serverContent={
              editorState === null || editorState === undefined ? undefined : (
                <EditorDocument
                  value={untrack(() => props.defaultValue)}
                  markdown={untrack(() => props.defaultMarkdown)}
                  preset={options.preset}
                  extensions={options.extensions}
                />
              )
            }
            placeholder={
              props.placeholder === undefined ? null : (
                <span
                  id={placeholderId}
                  class={cls().placeholder}
                  data-slot="rich-text-editor-placeholder"
                >
                  {props.placeholder}
                </span>
              )
            }
          />
        </div>
        <Show
          when={
            props.maxLength !== undefined ||
            props.autosave !== undefined ||
            resolved.some((extension) => extension.footer !== undefined)
          }
        >
          <Footer
            cls={cls()}
            maxLength={props.maxLength}
            autosave={props.autosave}
            extensions={resolved}
          />
        </Show>
        <Show when={problem()}>
          {(words: () => string) => (
            <p id={errorId} role="alert" class={cls().error} data-slot="rich-text-editor-error">
              {words()}
            </p>
          )}
        </Show>
        <Show when={props.floatingToolbar !== false}>
          <FloatingFormatToolbar />
        </Show>
        <LinkEditor />
        <ExtensionPlugins extensions={resolved} />
        <EditorBridge
          readOnly={props.readOnly}
          onChange={props.onChange}
          onEditor={props.onEditor}
          validate={props.validate}
          onValidityChange={props.onValidityChange}
          onProblem={setProblem}
          autoFocus={props.autoFocus}
          language={props.language}
        />
        {props.children}
      </>
    );
  }

  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      data-slot="rich-text-editor"
      data-invalid={invalid() ? "" : undefined}
      data-readonly={props.readOnly === true ? "" : undefined}
      style={heights(props.minHeight, props.maxHeight)}
    >
      <LexicalComposer
        extensions={extensions}
        initialConfig={{
          namespace: "arc",
          editable: untrack(() => props.readOnly !== true),
          editorState,
          onError: (error: Error) => {
            throw error;
          },
        }}
        contentEditable={null}
      >
        <>
          {props.upload === undefined ? (
            body()
          ) : (
            <Uploads upload={props.upload} maxSize={props.maxImageSize}>
              {body()}
            </Uploads>
          )}
        </>
      </LexicalComposer>
    </div>
  );
}
