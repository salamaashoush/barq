import {
  type Child,
  For,
  Show,
  createEffect,
  createMemo,
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
} from "../style/index.ts";
import { labelOf } from "./blocks.tsx";
import {
  type DocumentOptions,
  type DocumentValue,
  documentEditorExtensions,
  documentExtensions,
  markdownTransformers,
} from "./document.ts";
import { commandsOf, editorExtensions } from "./extension.ts";
import { useRegistration } from "./hooks.ts";
import { EditorDocument } from "./renderer.tsx";
import { editableText } from "./theme.ts";
import { FloatingFormatToolbar, LinkEditor } from "./floating.tsx";
import { provideEditorUploads, settleUpload } from "./media.tsx";
import { type AutosaveOptions, useCharacterCount, useEditorAutosave } from "./state.ts";
import { DEFAULT_TOOLS, type EditorTool, EditorToolbar, type InsertAction } from "./toolbar.tsx";

export const richTextEditorStyles = variants({
  slots: {
    root: arc(layout.column, layout.relative, layout.minZero),
    body: arc(layout.relative, layout.growAuto, layout.minZero, {
      overflowY: "auto",
      minBlockSize: "var(--editor-min-height, auto)",
      maxBlockSize: "var(--editor-max-height, none)",
    }),
    content: arc(editableText, {
      minBlockSize: "var(--editor-min-height, auto)",
      padding: space.x3,
    }),
    placeholder: arc(fg.faint, truncate, place.passive, {
      insetBlockStart: space.x3,
      insetInline: space.x3,
    }),
    footer: arc(layout.row, layout.between, gap[2], type.caption, fg.muted, place.paddedStrip),
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
    Pick<DocumentOptions, "preset" | "extensions" | "markdownShortcuts" | "history"> {
  /** Names the text box. */
  label?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  /** The document it opens with: stored JSON. Read once. */
  defaultValue?: DocumentValue;
  /** The document it opens with, as markdown. Read once. */
  defaultMarkdown?: string;
  /** Told the document after each change, skipping moves of the selection. */
  onChange?: (value: SerializedEditorState, editor: LexicalEditor) => void;
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

function heights(
  min: string | number | undefined,
  max: string | number | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  const length = (value: string | number): string =>
    typeof value === "number" ? `${String(value)}px` : value;
  if (min !== undefined) out["--editor-min-height"] = length(min);
  if (max !== undefined) out["--editor-max-height"] = length(max);
  return out;
}

/** What every extension the editor holds mounts: its panels, dialogs and listeners. */
export function ExtensionPlugins() {
  const editor = useLexicalEditor();
  const plugins = editorExtensions(editor).flatMap((extension) => extension.plugins ?? []);
  return <For each={plugins}>{(Plugin: () => JSX.Element) => <Plugin />}</For>;
}

/** What the editor's props reach once it is built: read-only, changes, autosave, the counter. */
export function EditorBridge(props: {
  readOnly?: boolean;
  onChange?: RichTextEditorProps["onChange"];
  onEditor?: (editor: LexicalEditor) => void;
}) {
  const editor = useLexicalEditor();
  untrack(() => props.onEditor?.(editor));
  createEffect(
    () => props.readOnly === true,
    (readOnly) => {
      editor.setEditable(!readOnly);
    },
  );
  useRegistration(() =>
    editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves, tags }) => {
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      if (tags.has("history-merge")) return;
      props.onChange?.(editorState.toJSON(), editor);
    }),
  );
  return null;
}

function Footer(props: { cls: Slots; maxLength?: number; autosave?: AutosaveOptions }) {
  const editor = useLexicalEditor();
  const footers = editorExtensions(editor).flatMap((extension) =>
    extension.footer === undefined ? [] : [extension.footer],
  );
  const messages = useArcMessages();
  const counter = useCharacterCount(() => props.maxLength);
  const autosave = props.autosave === undefined ? undefined : useEditorAutosave(props.autosave);
  let wasOver = false;
  createEffect(counter.over, (over) => {
    if (over && !wasOver) announce(messages().charactersOver(-counter.remaining()), "polite");
    wasOver = over;
  });
  const status = (): string => {
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
  };
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

/** The images an editor uploads, through arc's queue. */
function Uploads(props: {
  upload: (file: File, context: UploadContext) => Promise<string>;
  maxSize?: number;
  children: Child;
}) {
  const editor = useLexicalEditor();
  const queue = useUploadQueue({
    upload: (file, context) => props.upload(file, context),
    onUploaded: (item) => settleUpload(editor, item),
  });
  provideEditorUploads(editor, { queue, maxSize: untrack(() => props.maxSize) });
  return <>{props.children}</>;
}

/** The toolbar, with what the editor's extensions offer to insert. */
function EditorTools(props: { tools: readonly EditorTool[] }) {
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
  const cls = (): Slots => parts(richTextEditorStyles({ variant: props.variant }), props.classes);
  const placeholderId = createUniqueId();
  const tools = (): readonly EditorTool[] | null =>
    props.toolbar === false
      ? null
      : props.toolbar === true || props.toolbar === undefined
        ? DEFAULT_TOOLS
        : props.toolbar;

  const options = untrack((): DocumentOptions => ({
    preset: props.preset,
    extensions: props.extensions,
    markdownShortcuts: props.markdownShortcuts,
    history: props.collaborative === true ? false : props.history,
  }));
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

  const body = (): Child => (
    <>
      <Show when={tools()}>
        {(list: () => readonly EditorTool[]) => <EditorTools tools={list()} />}
      </Show>
      <div class={cls().body} data-slot="rich-text-editor-body">
        <ContentEditable
          class={arc(proseStyles({ size: props.size, width: "full" }).root, cls().content)}
          data-slot="rich-text-editor-content"
          aria-label={props.label}
          aria-labelledby={props["aria-labelledby"]}
          aria-describedby={props["aria-describedby"]}
          aria-multiline={true}
          aria-invalid={props.invalid === true ? true : undefined}
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
        <Footer cls={cls()} maxLength={props.maxLength} autosave={props.autosave} />
      </Show>
      <Show when={props.floatingToolbar !== false}>
        <FloatingFormatToolbar />
      </Show>
      <LinkEditor />
      <ExtensionPlugins />
      <EditorBridge readOnly={props.readOnly} onChange={props.onChange} onEditor={props.onEditor} />
      {props.children}
    </>
  );

  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      data-slot="rich-text-editor"
      data-invalid={props.invalid === true ? "" : undefined}
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
