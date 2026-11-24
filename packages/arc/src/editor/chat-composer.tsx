import { Show, createEffect, createSignal, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { FileTrigger } from "@barqjs/aria/file-trigger";
import { ContentEditable, LexicalComposer, useLexicalEditor } from "@barqjs/lexical";
import { Paperclip } from "@barqjs/lucide/icons/paperclip";
import { SendHorizontal } from "@barqjs/lucide/icons/send-horizontal";
import { Type } from "@barqjs/lucide/icons/type";
import { Button } from "@barqjs/ui/button";
import { icon } from "@barqjs/ui/shared-icon";
import { tokens } from "@barqjs/ui/theme/tokens";
import type { JSX } from "@barqjs/web";
import { $convertFromMarkdownString, $convertToMarkdownString } from "@lexical/markdown";
import { DRAG_DROP_PASTE } from "@lexical/rich-text";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  CLEAR_HISTORY_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  type LexicalEditor,
  type SerializedEditorState,
  mergeRegister,
} from "lexical";

import { EmojiButton } from "../chat/emoji-button.tsx";
import type { EmojiSource } from "../chat/emoji-data.ts";
import {
  type UploadContext,
  type UploadItem,
  UploadQueue,
  type UploadQueueApi,
  useUploadQueue,
} from "../components/file-upload.tsx";
import { IconButton } from "../components/icon-button.tsx";
import { useArcMessages } from "../components/messages.ts";
import { type SplitAction, SplitButton } from "../components/split-button.tsx";
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
import { $selectionFormat } from "./commands.ts";
import {
  type DocumentValue,
  documentEditorExtensions,
  documentExtensions,
  markdownTransformers,
} from "./document.ts";
import type { EditorExtension } from "./extension.ts";
import { chatPreset } from "./presets.ts";
import { EditorDocument } from "./renderer.tsx";
import { FloatingFormatToolbar, LinkEditor } from "./floating.tsx";
import { useRegistration } from "./hooks.ts";
import { EditorBridge, ExtensionPlugins } from "./rich-text-editor.tsx";
import { useCharacterCount } from "./state.ts";
import { editableText } from "./theme.ts";
import { EditorToolbar } from "./toolbar.tsx";
import {
  EmojiShortcuts,
  type MentionSource,
  MentionTypeahead,
  type SlashCommand,
  SlashCommandMenu,
} from "./typeahead.tsx";

export const chatComposerStyles = variants({
  slots: {
    root: arc(
      layout.column,
      layout.relative,
      layout.minZero,
      edge.input,
      rounded.lg,
      bg.page,
      focus.within,
      interaction.invalid,
      motion.colours,
      {
        overflow: "hidden",
        paddingBlockEnd: "env(safe-area-inset-bottom, 0px)",
      },
    ),
    header: arc(layout.row, gap[2], type.caption, fg.muted, edge.bottom, place.paddedStrip),
    body: arc(layout.relative, layout.minZero, {
      overflowY: "auto",
      // A phone's keyboard takes half the screen: the composer keeps to a
      // third of what is left, so the conversation above stays in view.
      maxBlockSize: "min(var(--composer-max-height, 18rem), 33dvh)",
      scrollPaddingBlockEnd: space.x2,
    }),
    content: arc(editableText, place.padded, { minBlockSize: space.x10 }),
    placeholder: arc(fg.faint, truncate, place.passive, {
      insetBlockStart: space.x2,
      insetInline: space.x3,
    }),
    tray: arc({ paddingInline: space.x2 }),
    footer: arc(layout.row, gap[1], { padding: space.x1 }),
    tools: arc(layout.row, gap[0.5], layout.grow, layout.minZero),
    counter: arc(type.caption, type.numeric, fg.muted, {
      paddingInline: space.x1,
      "&[data-over]": { color: tokens.destructive },
    }),
    send: arc(layout.noShrink),
  },
});

type Slots = ReturnType<typeof chatComposerStyles>;

/** What a composer sends: the document, its markdown and text, and the files that went up with it. */
export interface ComposedMessage {
  value: SerializedEditorState;
  markdown: string;
  text: string;
  /** Each attachment's upload, with what `upload` resolved it to. */
  attachments: readonly UploadItem[];
}

export interface ChatComposerProps extends Customisable<Slots> {
  /** What the composer is built from. @default `chatPreset` */
  preset?: readonly EditorExtension[];
  /** Names the text box. @default arc's "Message" */
  label?: string;
  placeholder?: string;
  /**
   * Sends the message. A promise holds the composer while it is on its way;
   * once it settles, or at once without one, the composer is emptied. A
   * promise that rejects keeps what was written.
   */
  onSend: (message: ComposedMessage) => void | Promise<unknown>;
  /** `edit` changes a message already sent: Enter saves, Escape cancels. @default "send" */
  mode?: "send" | "edit";
  /** What it opens with: stored JSON. */
  defaultValue?: DocumentValue;
  /** What it opens with, as markdown. */
  defaultMarkdown?: string;
  /** Adds a Cancel button, and Escape cancels: leaving an edit, a reply. */
  onCancel?: () => void;
  /** Which key sends: Enter, or Mod+Enter with Enter a new paragraph, as a comment wants. @default "enter" */
  sendOn?: "enter" | "mod-enter";
  /** The send button's words, a button of words rather than the arrow: "Comment", "Reply". */
  submitLabel?: string;
  /** Fills the empty document when it opens, as a Lexical `$` function. */
  initialContent?: () => void;
  /** Who `@` offers. */
  mentions?: MentionSource;
  /** What `/` offers. None without it. */
  commands?: readonly SlashCommand[];
  /** `:` offers emoji by name. @default true */
  emojiShortcuts?: boolean;
  /** The emoji button. @default true */
  emojiButton?: boolean;
  /** Where the emoji button's and `:`'s emoji come from. @default English, from emojibase */
  emojiSource?: EmojiSource;
  /** Sends a file and resolves with what the message keeps of it: attachments are offered only with it. */
  upload?: (file: File, context: UploadContext) => Promise<unknown>;
  /** Files the attach button offers: `["image/*", ".pdf"]`. */
  accept?: readonly string[];
  /** A counter against it; past it the message cannot be sent. */
  maxLength?: number;
  /** The send button's alternatives: schedule, send as. A split button then. */
  sendActions?: readonly SplitAction[];
  /** Starts with the formatting toolbar open. @default false */
  defaultToolbarOpen?: boolean;
  isDisabled?: boolean;
  /** Focus the composer as it mounts, as an edit wants. @default true while editing */
  autoFocus?: boolean;
  /** Anything that works inside the editor: another typeahead, collaboration. */
  children?: JSX.Element;
  /** Told the editor once it is built. */
  onEditor?: (editor: LexicalEditor) => void;
}

/** The selection's block: Enter in a list, a quote or a code block makes a new line there, not a message. */
function inBlock(editor: LexicalEditor): boolean {
  return editor.read(() => {
    const block = $selectionFormat().block;
    return block !== null && block !== "paragraph" && !block.startsWith("h");
  });
}

interface SendKeysProps {
  send: () => void;
  cancel?: () => void;
  modEnter: boolean;
}

/**
 * Enter sends (or Mod+Enter, with plain Enter a new paragraph), Shift+Enter
 * breaks the line, Escape cancels; an open typeahead takes them first.
 */
function SendKeys(props: SendKeysProps) {
  const editor = useLexicalEditor();
  function menuOpen(): boolean {
    return editor.getRootElement()?.hasAttribute("aria-controls") === true;
  }
  useRegistration(() =>
    mergeRegister(
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (event === null || event.shiftKey || event.isComposing || menuOpen()) return false;
          if (props.modEnter) {
            if (!(event.metaKey || event.ctrlKey)) return false;
          } else if (inBlock(editor)) {
            return false;
          }
          event.preventDefault();
          props.send();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        (event) => {
          if (props.cancel === undefined || menuOpen()) return false;
          event.preventDefault();
          props.cancel();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    ),
  );
  return null;
}

interface AttachPasteProps {
  queue: UploadQueueApi;
}

/** Files pasted or dropped go to the attachment tray. */
function AttachPaste(props: AttachPasteProps) {
  const editor = useLexicalEditor();
  useRegistration(() =>
    editor.registerCommand(
      DRAG_DROP_PASTE,
      (files) => {
        props.queue.add(files);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    ),
  );
  return null;
}

interface InsertEmojiProps {
  source?: EmojiSource;
}

function InsertEmoji(props: InsertEmojiProps) {
  const editor = useLexicalEditor();
  return (
    <EmojiButton
      source={props.source}
      onSelect={(emoji: string) => {
        editor.update(() => {
          let selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            $getRoot().selectEnd();
            selection = $getSelection();
          }
          if ($isRangeSelection(selection)) selection.insertText(emoji);
        });
        editor.focus();
      }}
    />
  );
}

interface ComposerProps {
  cls: Slots;
  queue?: UploadQueueApi;
}

function Composer(props: ChatComposerProps & ComposerProps) {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  const counter = useCharacterCount(() => props.maxLength);
  const [toolbar, setToolbar] = createSignal(props.defaultToolbarOpen === true, {
    ownedWrite: true,
  });
  const [pending, setPending] = createSignal(false, { ownedWrite: true });
  const [empty, setEmpty] = createSignal(true, { ownedWrite: true });
  function editing(): boolean {
    return props.mode === "edit";
  }

  useRegistration(() => editor.registerTextContentListener((text) => setEmpty(text.trim() === "")));
  setEmpty(editor.read(() => $getRoot().getTextContent().trim() === ""));

  function uploading(): boolean {
    return (
      props.queue
        ?.items()
        .some((item) => item.status === "queued" || item.status === "uploading") ?? false
    );
  }
  function done(): readonly UploadItem[] {
    return props.queue?.items().filter((item) => item.status === "done") ?? [];
  }
  function canSend(): boolean {
    return (
      props.isDisabled !== true &&
      !pending() &&
      !uploading() &&
      !counter.over() &&
      (!empty() || done().length > 0)
    );
  }

  function clear(): void {
    editor.update(() => {
      $getRoot().clear().append($createParagraphNode());
      $getRoot().selectStart();
    });
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
    props.queue?.clearFinished();
  }

  function send(): void {
    if (!untrack(canSend)) return;
    const transformers = markdownTransformers({ preset: props.preset ?? chatPreset });
    const message: ComposedMessage = editor.read(() => ({
      value: editor.getEditorState().toJSON(),
      markdown: $convertToMarkdownString(transformers),
      text: $getRoot().getTextContent(),
      attachments: done(),
    }));
    const result = props.onSend(message);
    if (result instanceof Promise) {
      setPending(true);
      result.then(
        () => {
          setPending(false);
          if (!editing()) clear();
        },
        () => setPending(false),
      );
    } else if (!editing()) {
      clear();
    }
  }

  createEffect(
    () => props.autoFocus ?? editing(),
    (wanted) => {
      if (wanted) editor.focus(undefined, { defaultSelection: "rootEnd" });
    },
  );

  function sendLabel(): string {
    return editing() ? messages().saveChanges : messages().sendMessage;
  }

  return (
    <>
      <Show when={toolbar()}>
        <EditorToolbar tools={["marks", "link", "lists", "blocks"]} />
      </Show>
      <div class={props.cls.body} data-slot="chat-composer-body">
        <ContentEditable
          class={arc(proseStyles({ size: "sm", width: "full" }).root, props.cls.content)}
          data-slot="chat-composer-content"
          aria-label={props.label ?? messages().message}
          aria-multiline={true}
          aria-invalid={counter.over() ? true : undefined}
          aria-placeholder={props.placeholder}
          enterKeyHint={editing() ? "done" : "send"}
          serverContent={
            props.initialContent !== undefined ||
            (props.defaultValue === undefined &&
              props.defaultMarkdown === undefined) ? undefined : (
              <EditorDocument
                value={untrack(() => props.defaultValue)}
                markdown={untrack(() => props.defaultMarkdown)}
              />
            )
          }
          placeholder={
            props.placeholder === undefined ? null : (
              <span class={props.cls.placeholder} data-slot="chat-composer-placeholder">
                {props.placeholder}
              </span>
            )
          }
        />
      </div>
      <Show when={props.queue !== undefined && (props.queue?.items().length ?? 0) > 0}>
        <div class={props.cls.tray} data-slot="chat-composer-attachments">
          <UploadQueue queue={props.queue!} />
        </div>
      </Show>
      <div class={props.cls.footer} data-slot="chat-composer-footer">
        <div class={props.cls.tools} data-slot="chat-composer-tools">
          <IconButton
            label={messages().formatting}
            size="sm"
            isPressed={toolbar()}
            onPress={() => setToolbar(!toolbar())}
          >
            <Type />
          </IconButton>
          <Show when={props.queue !== undefined}>
            <FileTrigger
              allowsMultiple
              acceptedFileTypes={props.accept}
              onSelect={(files: FileList | null) => {
                if (files !== null) props.queue?.add([...files]);
              }}
            >
              <IconButton label={messages().attachFiles} size="sm">
                <Paperclip />
              </IconButton>
            </FileTrigger>
          </Show>
          <Show when={props.emojiButton !== false}>
            <InsertEmoji source={props.emojiSource} />
          </Show>
        </div>
        <Show when={props.maxLength !== undefined && counter.remaining() <= 50}>
          <span
            class={props.cls.counter}
            data-slot="chat-composer-counter"
            data-over={counter.over() ? "" : undefined}
            aria-live="polite"
          >
            {counter.over()
              ? messages().charactersOver(-counter.remaining())
              : messages().charactersLeft(counter.remaining())}
          </span>
        </Show>
        <Show when={props.onCancel !== undefined}>
          <Button variant="ghost" size="sm" onPress={() => props.onCancel?.()}>
            {messages().cancel}
          </Button>
        </Show>
        <Show
          when={!editing() && (props.sendActions?.length ?? 0) > 0}
          fallback={
            <Show
              when={editing() || props.submitLabel !== undefined}
              fallback={
                <IconButton
                  label={sendLabel()}
                  variant="default"
                  size="sm"
                  class={props.cls.send}
                  isDisabled={!canSend()}
                  onPress={send}
                >
                  <SendHorizontal class={icon.directional} />
                </IconButton>
              }
            >
              <Button size="sm" class={props.cls.send} isDisabled={!canSend()} onPress={send}>
                {props.submitLabel ?? messages().save}
              </Button>
            </Show>
          }
        >
          <SplitButton
            size="sm"
            class={props.cls.send}
            icon={<SendHorizontal class={icon.directional} aria-hidden="true" />}
            isDisabled={!canSend()}
            isPending={pending()}
            actions={props.sendActions ?? []}
            onPress={send}
          >
            {messages().send}
          </SplitButton>
        </Show>
      </div>
      <SendKeys send={send} cancel={props.onCancel} modEnter={props.sendOn === "mod-enter"} />
      <ExtensionPlugins
        extensions={documentEditorExtensions({ preset: props.preset ?? chatPreset })}
      />
      <FloatingFormatToolbar />
      <LinkEditor />
      <Show when={props.mentions !== undefined}>
        <MentionTypeahead source={props.mentions!} />
      </Show>
      <Show when={props.commands !== undefined}>
        <SlashCommandMenu commands={props.commands} />
      </Show>
      <Show when={props.emojiShortcuts !== false}>
        <EmojiShortcuts source={props.emojiSource} />
      </Show>
      <Show when={props.queue !== undefined}>
        <AttachPaste queue={props.queue!} />
      </Show>
      <EditorBridge onEditor={props.onEditor} />
      {props.children}
    </>
  );
}

interface WithUploadsProps {
  cls: Slots;
}

function WithUploads(props: ChatComposerProps & WithUploadsProps) {
  const queue = useUploadQueue({ upload: (file, context) => props.upload!(file, context) });
  return <Composer {...props} queue={queue} />;
}

/**
 * Where a message is written: a compact rich text editor that sends on
 * Enter and breaks the line on Shift+Enter (Enter inside a list, a quote or
 * a code block stays a new line there), with `@` mentions, `/` commands and
 * `:` emoji, an emoji button, attachments uploaded through arc's queue as a
 * tray above the actions, a formatting toolbar it opens on request, and a
 * counter near its limit.
 *
 * ```tsx
 * <ChatComposer
 *   placeholder="Message #general"
 *   mentions={(query, { signal }) => api.people(query, signal)}
 *   upload={(file, { onProgress, signal }) => api.upload(file, onProgress, signal)}
 *   sendActions={[{ id: "later", label: "Schedule send", onAction: openSchedule }]}
 *   onSend={(message) => api.send(channel, message.value, message.attachments)}
 * />
 * ```
 *
 * `mode="edit"` changes a message already sent: it opens focused on the
 * message, Enter saves and Escape cancels. On a phone it keeps to a third of
 * the screen the keyboard leaves and clear of the home indicator, and the
 * send key on the keyboard reads Send.
 */
export function ChatComposer(props: ChatComposerProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(chatComposerStyles(), props.classes);
  }
  const extensions = untrack(() => documentExtensions({ preset: props.preset ?? chatPreset }));
  const editorState = untrack(() => {
    if (props.initialContent !== undefined) return props.initialContent;
    if (props.defaultValue !== undefined) {
      return typeof props.defaultValue === "string"
        ? props.defaultValue
        : JSON.stringify(props.defaultValue);
    }
    const markdown = props.defaultMarkdown;
    if (markdown === undefined) return undefined;
    const transformers = markdownTransformers({ preset: props.preset ?? chatPreset });
    return () => $convertFromMarkdownString(markdown, transformers);
  });
  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      data-slot="chat-composer"
      data-mode={props.mode ?? "send"}
    >
      <Show when={props.mode === "edit"}>
        <div class={cls().header} data-slot="chat-composer-header">
          <span>{messages().editingMessage}</span>
          <span class={layout.pushEnd}>{messages().newLineHint}</span>
        </div>
      </Show>
      <LexicalComposer
        extensions={extensions}
        initialConfig={{
          namespace: "arc-chat",
          editable: untrack(() => props.isDisabled !== true),
          editorState,
          onError: (error: Error) => {
            throw error;
          },
        }}
        contentEditable={null}
      >
        <>
          {props.upload === undefined ? (
            <Composer {...props} cls={cls()} />
          ) : (
            <WithUploads {...props} cls={cls()} />
          )}
        </>
      </LexicalComposer>
    </div>
  );
}
