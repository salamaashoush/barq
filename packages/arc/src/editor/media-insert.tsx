import { Show, createSignal, createUniqueId } from "@barqjs/core";
import { useLexicalEditor } from "@barqjs/lexical";
import { Button } from "@barqjs/ui/button";
import { Field, FieldError, FieldLabel } from "@barqjs/ui/field";
import { Input } from "@barqjs/ui/input";
import { DRAG_DROP_PASTE } from "@lexical/rich-text";
import { COMMAND_PRIORITY_LOW } from "lexical";

import { FileDropZone } from "../components/file-upload.tsx";
import { useArcMessages } from "../components/messages.ts";
import { ResponsiveOverlay } from "../components/responsive-overlay.tsx";
import { $insertBlock } from "./commands.ts";
import { useRegistration } from "./hooks.ts";
import {
  type EmbedProvider,
  EmbedBlock,
  ImageBlock,
  resolveEmbed,
  useEditorUploads,
} from "./media.tsx";

/** Sends each image through the editor's upload queue and puts a block for it where the caret is. */
export function useInsertImages(): (files: readonly File[]) => void {
  const editor = useLexicalEditor();
  const uploads = useEditorUploads();
  return (files) => {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (uploads === null || images.length === 0) return;
    const items = uploads.queue.add(images);
    editor.update(() => {
      for (const item of items) {
        $insertBlock(
          ImageBlock.$create({
            src: item.preview ?? "",
            alt: item.file.name.replace(/\.[^.]+$/, ""),
            uploadId: item.id,
          }),
        );
      }
    });
  };
}

/** Images pasted or dropped into the editor go up the queue and into the document. */
export function ImagePaste() {
  const editor = useLexicalEditor();
  const insert = useInsertImages();
  useRegistration(() =>
    editor.registerCommand(
      DRAG_DROP_PASTE,
      (files) => {
        if (!files.some((file) => file.type.startsWith("image/"))) return false;
        insert(files);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    ),
  );
  return null;
}

export interface MediaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface ImageDialogProps {
  maxSize?: number;
}

/** Images chosen or dropped through `FileDropZone`, a sheet on a phone. */
export function ImageDialog(props: MediaDialogProps & ImageDialogProps) {
  const messages = useArcMessages();
  const insert = useInsertImages();
  return (
    <ResponsiveOverlay
      heading={messages().uploadImage}
      open={props.open}
      onOpenChange={props.onOpenChange}
    >
      <FileDropZone
        accept={["image/*"]}
        maxSize={props.maxSize}
        aria-label={messages().uploadImage}
        onFiles={(files: File[]) => {
          props.onOpenChange(false);
          insert(files);
        }}
      />
    </ResponsiveOverlay>
  );
}

export interface EmbedDialogProps {
  providers: readonly EmbedProvider[];
}

/** An address read into an embed from the providers the editor allows. */
export function EmbedDialog(props: MediaDialogProps & EmbedDialogProps) {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  const inputId = createUniqueId();
  const errorId = createUniqueId();
  const [address, setAddress] = createSignal("", { ownedWrite: true });
  const [refused, setRefused] = createSignal(false, { ownedWrite: true });
  function submit(): void {
    const embed = resolveEmbed(address(), props.providers);
    if (embed === null) {
      setRefused(true);
      return;
    }
    props.onOpenChange(false);
    setAddress("");
    editor.update(() => {
      $insertBlock(EmbedBlock.$create(embed));
    });
  }
  return (
    <ResponsiveOverlay
      heading={messages().embed}
      open={props.open}
      onOpenChange={props.onOpenChange}
      footer={
        <Button type="submit" form={`${inputId}-form`}>
          {messages().insert}
        </Button>
      }
    >
      <form
        id={`${inputId}-form`}
        onSubmit={(event: SubmitEvent) => {
          event.preventDefault();
          submit();
        }}
      >
        <Field isInvalid={refused()}>
          <FieldLabel for={inputId}>{messages().embedAddress}</FieldLabel>
          <Input
            id={inputId}
            type="url"
            dir="ltr"
            inputMode="url"
            value={address()}
            placeholder={messages().linkPlaceholder}
            aria-invalid={refused()}
            aria-errormessage={refused() ? errorId : undefined}
            onInput={(event: Event) => {
              setAddress((event.currentTarget as HTMLInputElement).value);
              setRefused(false);
            }}
          />
          <Show when={refused()}>
            <FieldError id={errorId}>{messages().embedNotSupported}</FieldError>
          </Show>
        </Field>
      </form>
    </ResponsiveOverlay>
  );
}
