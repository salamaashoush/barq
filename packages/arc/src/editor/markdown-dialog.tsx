import { createSignal, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useLexicalEditor } from "@barqjs/lexical";
import { FileText } from "@barqjs/lucide/icons/file-text";
import { Button } from "@barqjs/ui/button";
import { Textarea } from "@barqjs/ui/textarea";
import { $convertFromMarkdownString, $convertToMarkdownString } from "@lexical/markdown";
import {
  COMMAND_PRIORITY_LOW,
  type LexicalCommand,
  type LexicalEditor,
  createCommand,
} from "lexical";

import { useArcMessages } from "../components/messages.ts";
import { ResponsiveOverlay } from "../components/responsive-overlay.tsx";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { type } from "../style/index.ts";
import { defineEditorExtension, editorExtensions, transformersOf } from "./extension.ts";
import { useRegistration } from "./hooks.ts";

/** Opens the document as markdown: the toolbar's Markdown. */
export const OPEN_MARKDOWN_DIALOG_COMMAND: LexicalCommand<void> =
  createCommand("OPEN_MARKDOWN_DIALOG");

export const markdownDialogStyles = variants({
  slots: {
    source: arc(type.mono, { minBlockSize: "16rem" }),
  },
});

type Slots = ReturnType<typeof markdownDialogStyles>;

/** The editor's document as markdown, with every rule its extensions write. */
export function editorMarkdown(editor: LexicalEditor): string {
  const rules = transformersOf(editorExtensions(editor));
  return editor.read(() => $convertToMarkdownString(rules));
}

/** Puts markdown in place of the editor's document as one edit, one step to undo. */
export function replaceFromMarkdown(editor: LexicalEditor, markdown: string): void {
  const rules = transformersOf(editorExtensions(editor));
  editor.update(() => $convertFromMarkdownString(markdown, rules));
}

export interface MarkdownDialogProps extends Customisable<Slots> {}

/**
 * The document as markdown in a dialog, a sheet on a phone: to copy out, or
 * to change and put back in place of the document. Opened from the
 * toolbar's Markdown.
 */
export function MarkdownDialog(props: MarkdownDialogProps) {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  const id = createUniqueId();
  const [open, setOpen] = createSignal(false, { ownedWrite: true });
  const [source, setSource] = createSignal("", { ownedWrite: true });
  function cls(): Slots {
    return parts(markdownDialogStyles(), props.classes);
  }
  useRegistration(() =>
    editor.registerCommand(
      OPEN_MARKDOWN_DIALOG_COMMAND,
      () => {
        setSource(editorMarkdown(editor));
        setOpen(true);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    ),
  );
  function replace(): void {
    setOpen(false);
    replaceFromMarkdown(editor, source());
    editor.focus();
  }
  return (
    <ResponsiveOverlay
      heading={messages().markdown}
      description={messages().markdownHint}
      open={open()}
      onOpenChange={setOpen}
      class={arc(props.class, props.className)}
      footer={
        <Button
          type="button"
          isDisabled={!editor.isEditable()}
          data-slot="markdown-replace"
          onPress={replace}
        >
          {messages().replaceFromMarkdown}
        </Button>
      }
    >
      <Textarea
        id={id}
        class={cls().source}
        data-slot="markdown-source"
        aria-label={messages().markdown}
        dir="auto"
        value={source()}
        onInput={(event: Event) => {
          setSource((event.currentTarget as HTMLTextAreaElement).value);
        }}
      />
    </ResponsiveOverlay>
  );
}

/**
 * The document as markdown, from the toolbar's Markdown (in its More menu
 * once the toolbar narrows): copied out, or changed and put back in place of
 * the document as one edit.
 */
export const markdownDialogExtension = defineEditorExtension({
  name: "arc/markdown-dialog",
  toolbar: [
    {
      id: "markdown",
      label: (messages) => messages.markdown,
      icon: () => <FileText />,
      priority: 0,
      run: (editor) => editor.dispatchCommand(OPEN_MARKDOWN_DIALOG_COMMAND, undefined),
    },
  ],
  plugins: [() => <MarkdownDialog />],
});
