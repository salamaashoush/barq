import { For, Show, createEffect, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useLocale } from "@barqjs/aria/i18n";
import type { AnyFieldApi } from "@barqjs/form";
import { File as FileIcon } from "@barqjs/lucide/icons/file";
import { X } from "@barqjs/lucide/icons/x";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@barqjs/ui/attachment";

import { arcLayer as arc } from "../layer.ts";
import {
  type ArcFieldProps,
  type Binding,
  type FieldBinding,
  type FieldSlots,
  type FieldValueProps,
  Frame,
  bindField,
  fieldStyles,
} from "../lib/field.tsx";
import { type Customisable, parts } from "../lib/parts.ts";
import { gap, layout, plainList } from "../style/index.ts";
import {
  FileDropZone,
  type FileLimits,
  type FileRejection,
  type UploadContext,
  type UploadItem,
  UploadQueue,
  formatBytes,
  useUploadQueue,
} from "./file-upload.tsx";
import { useArcMessages } from "./messages.ts";

/** A file the server has, as the form holds it. */
export interface StoredFile {
  /** The server's id for it, which the form submits. */
  id: string;
  name: string;
  /** In bytes. */
  size: number;
  type?: string;
}

type Stored = readonly StoredFile[];

export const fileFieldStyles = variants({
  slots: {
    body: arc(layout.column, gap[3]),
    files: arc(plainList, layout.column, gap[2]),
    file: arc({}),
    zone: arc({}),
  },
});

type Slots = ReturnType<typeof fileFieldStyles> & FieldSlots;

export interface FileFieldProps
  extends
    Omit<ArcFieldProps, "classes">,
    FieldValueProps<readonly StoredFile[]>,
    FileLimits,
    Customisable<Slots> {
  /** Sends one file and answers with what the server keeps of it. */
  upload: (file: File, context: UploadContext) => Promise<StoredFile>;
  /** More than one file. @default true */
  multiple?: boolean;
  /** Take a picture rather than pick a file, on a phone. */
  capture?: "user" | "environment";
  /** Files sent at once. @default 2 */
  concurrency?: number;
  onReject?: (rejections: FileRejection[]) => void;
}

/**
 * Files attached to a form: each sent as it is dropped or picked, counted
 * once the server has it.
 *
 * ```tsx
 * <form.AppField name="attachments">
 *   {(field) => <field.FileField label="Attachments" accept={[".pdf"]} upload={send} />}
 * </form.AppField>
 * ```
 *
 * Held as the files the server stored, by its `StoredFile`; a file still on
 * its way is not in the value yet. While one is, the form cannot submit and
 * the field says why, so nothing half-sent is saved. A failed upload stays
 * listed with Retry.
 */
export function FileField(props: FileFieldProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  const of = bindField<readonly StoredFile[]>(props, []);
  const field = "field" in of ? (of as Binding<Stored> & FieldBinding<Stored>).field : undefined;
  const queue = useUploadQueue({
    upload: (file, context) => props.upload(file, context),
    concurrency: untrack(() => props.concurrency),
    onUploaded: (item: UploadItem) => {
      const stored = item.result as StoredFile;
      of.change([...untrack(files), stored]);
      of.blur();
      queue.remove(item.id);
    },
  });
  function cls(): Slots {
    return parts({ ...fieldStyles(), ...fileFieldStyles() }, props.classes);
  }
  function files(): readonly StoredFile[] {
    return of.value() ?? [];
  }
  function pending(): boolean {
    return queue.items().some((item) => item.status === "queued" || item.status === "uploading");
  }
  function remove(id: string): void {
    of.change(untrack(files).filter((file) => file.id !== id));
    of.blur();
  }

  // On a form, a file on its way is an error the form cannot submit past. It
  // is kept under `onMount`, the one key form-core never recomputes on a
  // change, blur or submit, so it holds until the upload settles.
  if (field !== undefined) {
    createEffect(pending, (busy: boolean) => {
      untrack(() => {
        const api: AnyFieldApi = field();
        const reason = busy ? messages().uploadsPending : undefined;
        if (api.state.meta.errorMap.onMount === reason) return;
        api.setMeta((meta) => ({
          ...meta,
          isTouched: busy ? true : meta.isTouched,
          errorMap: { ...meta.errorMap, onMount: reason },
        }));
      });
    });
  }

  return (
    <Frame
      of={of}
      label={props.label}
      description={props.description}
      field={props}
      labelledById
      slot="file-field"
    >
      <div
        class={cls().body}
        data-slot="file-field-body"
        role="group"
        aria-labelledby={of.ids.label}
        aria-describedby={of.describedBy(props.description !== undefined)}
        aria-busy={pending() ? true : undefined}
      >
        <Show when={files().length > 0}>
          <ul
            class={cls().files}
            data-slot="file-field-files"
            aria-label={messages().attachedFiles}
          >
            <For each={files()}>
              {(file: StoredFile) => (
                <li>
                  <Attachment class={cls().file} data-slot="file-field-file" state="done">
                    <AttachmentMedia variant="icon">
                      <FileIcon aria-hidden="true" />
                    </AttachmentMedia>
                    <AttachmentContent>
                      <AttachmentTitle>{file.name}</AttachmentTitle>
                      <AttachmentDescription>
                        {formatBytes(file.size, locale().locale)}
                      </AttachmentDescription>
                    </AttachmentContent>
                    <AttachmentActions>
                      <AttachmentAction
                        data-slot="file-field-remove"
                        aria-label={messages().removeFile(file.name)}
                        isDisabled={props.isDisabled}
                        onPress={() => remove(file.id)}
                      >
                        <X aria-hidden="true" />
                      </AttachmentAction>
                    </AttachmentActions>
                  </Attachment>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={queue.items().length > 0}>
          <UploadQueue queue={queue} />
        </Show>
        <Show when={props.multiple !== false || files().length === 0}>
          <FileDropZone
            class={cls().zone}
            accept={props.accept}
            maxSize={props.maxSize}
            maxFiles={
              props.maxFiles === undefined
                ? undefined
                : Math.max(0, props.maxFiles - files().length)
            }
            multiple={props.multiple}
            capture={props.capture}
            isDisabled={props.isDisabled}
            onReject={props.onReject}
            onFiles={(dropped: File[]) => queue.add(dropped)}
          />
        </Show>
      </div>
      <For each={of.name() === undefined ? [] : files()}>
        {(file: StoredFile) => <input type="hidden" name={of.name()} value={file.id} />}
      </For>
    </Frame>
  );
}
