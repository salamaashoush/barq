import {
  type Accessor,
  type Child,
  For,
  Show,
  createSignal,
  onCleanup,
  untrack,
} from "@barqjs/core";
import { variants } from "@barqjs/css";
import { type DropEvent, isFileDropItem } from "@barqjs/aria/dnd";
import { DropZone, DropZoneLabel } from "@barqjs/aria/dropzone";
import { FileTrigger } from "@barqjs/aria/file-trigger";
import { useLocale } from "@barqjs/aria/i18n";
import { announce } from "@barqjs/aria/live";
import { CloudUpload } from "@barqjs/lucide/icons/cloud-upload";
import { File as FileIcon } from "@barqjs/lucide/icons/file";
import { RotateCw } from "@barqjs/lucide/icons/rotate-cw";
import { X } from "@barqjs/lucide/icons/x";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  type AttachmentState,
} from "@barqjs/ui/attachment";
import { Button } from "@barqjs/ui/button";
import { Progress } from "@barqjs/ui/progress";
import { on } from "@barqjs/ui/conditions";
import { when } from "@barqjs/ui/shared-when";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  edge,
  fg,
  focus,
  gap,
  glyph,
  layout,
  motion,
  place,
  plainList,
  rounded,
  space,
  tone,
  type,
} from "../style/index.ts";
import { type ArcMessages, useArcMessages } from "./messages.ts";

/** What a queue does with a file it was given. */
export type UploadStatus = "queued" | "uploading" | "done" | "error" | "cancelled";

export interface UploadItem {
  readonly id: string;
  readonly file: File;
  readonly status: UploadStatus;
  /** 0 to 1. */
  readonly progress: number;
  readonly error?: string;
  /** An object URL for an image, for its thumbnail. */
  readonly preview?: string;
  /** What `upload` resolved with. */
  readonly result?: unknown;
}

export interface UploadContext {
  /** Report how far along it is, 0 to 1. */
  onProgress: (fraction: number) => void;
  /** Aborted when the file is cancelled or the queue goes away. */
  signal: AbortSignal;
}

export interface UploadQueueOptions {
  /** Sends one file: a `fetch` with the signal, an `XMLHttpRequest` reporting progress. */
  upload: (file: File, context: UploadContext) => Promise<unknown>;
  /** Files sent at once. @default 2 */
  concurrency?: number;
  /** Told when a file finishes, with what `upload` resolved. */
  onUploaded?: (item: UploadItem) => void;
}

export interface UploadQueueApi {
  readonly items: Accessor<readonly UploadItem[]>;
  /** Queues `files`, and answers with the items made for them, in order. */
  add: (files: readonly File[]) => readonly UploadItem[];
  retry: (id: string) => void;
  cancel: (id: string) => void;
  remove: (id: string) => void;
  /** Takes out everything that is not on its way. */
  clearFinished: () => void;
}

let uploads = 0;

/**
 * Files sent `concurrency` at a time through the caller's `upload`, each
 * with its progress, and cancelled, retried or removed one by one.
 *
 * ```ts
 * const queue = useUploadQueue({
 *   upload: (file, { onProgress, signal }) => send(file, onProgress, signal),
 * });
 * ```
 *
 * A file that is cancelled has its request aborted; leaving the page aborts
 * everything still on its way and lets go of every thumbnail.
 */
export function useUploadQueue(options: UploadQueueOptions): UploadQueueApi {
  const messages = useArcMessages();
  const [items, setItems] = createSignal<readonly UploadItem[]>([]);
  const running = new Map<string, AbortController>();
  let current: readonly UploadItem[] = [];

  const write = (next: readonly UploadItem[]): void => {
    current = next;
    setItems(next);
  };
  const update = (id: string, change: Partial<UploadItem>): void =>
    write(current.map((item) => (item.id === id ? { ...item, ...change } : item)));

  const pump = (): void => {
    const limit = Math.max(1, options.concurrency ?? 2);
    for (const item of current) {
      if (running.size >= limit) return;
      if (item.status === "queued" && !running.has(item.id)) start(item);
    }
  };

  const start = (item: UploadItem): void => {
    const controller = new AbortController();
    running.set(item.id, controller);
    update(item.id, { status: "uploading", progress: 0, error: undefined });
    options
      .upload(item.file, {
        signal: controller.signal,
        onProgress: (fraction) => {
          if (!controller.signal.aborted) {
            update(item.id, { progress: Math.min(1, Math.max(0, fraction)) });
          }
        },
      })
      .then(
        (result) => {
          if (controller.signal.aborted) return;
          update(item.id, { status: "done", progress: 1, result });
          announce(untrack(messages).uploaded(item.file.name), "polite");
          const finished = current.find((one) => one.id === item.id);
          if (finished !== undefined) options.onUploaded?.(finished);
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          const reason = error instanceof Error && error.message !== "" ? error.message : undefined;
          update(item.id, {
            status: "error",
            error: reason ?? untrack(messages).uploadFailed(item.file.name),
          });
          announce(untrack(messages).uploadFailed(item.file.name), "polite");
        },
      )
      .finally(() => {
        if (running.get(item.id) === controller) running.delete(item.id);
        pump();
      });
  };

  const stop = (id: string): void => {
    running.get(id)?.abort();
    running.delete(id);
  };

  onCleanup(() => {
    for (const controller of running.values()) controller.abort();
    running.clear();
    for (const item of current) if (item.preview !== undefined) URL.revokeObjectURL(item.preview);
  });

  return {
    items,
    add: (files) => {
      const added = files.map((file): UploadItem => ({
        id: `upload-${String(++uploads)}`,
        file,
        status: "queued",
        progress: 0,
        preview:
          file.type.startsWith("image/") && typeof URL.createObjectURL === "function"
            ? URL.createObjectURL(file)
            : undefined,
      }));
      write([...current, ...added]);
      pump();
      return added;
    },
    retry: (id) => {
      update(id, { status: "queued", progress: 0, error: undefined });
      pump();
    },
    cancel: (id) => {
      stop(id);
      update(id, { status: "cancelled" });
      pump();
    },
    remove: (id) => {
      stop(id);
      const gone = current.find((item) => item.id === id);
      if (gone?.preview !== undefined) URL.revokeObjectURL(gone.preview);
      write(current.filter((item) => item.id !== id));
      pump();
    },
    clearFinished: () => {
      for (const item of current) {
        if (item.status !== "queued" && item.status !== "uploading" && item.preview !== undefined) {
          URL.revokeObjectURL(item.preview);
        }
      }
      write(current.filter((item) => item.status === "queued" || item.status === "uploading"));
    },
  };
}

/** The limits a drop is held to. */
export interface FileLimits {
  /** MIME types, `image/*` families or extensions: `["image/*", ".pdf"]`. */
  accept?: readonly string[];
  /** In bytes. */
  maxSize?: number;
  /** Files at most in one drop or pick. */
  maxFiles?: number;
}

export interface FileRejection {
  file: File;
  reason: string;
}

function accepts(file: File, accept: readonly string[]): boolean {
  const name = file.name.toLowerCase();
  const kind = file.type.toLowerCase();
  return accept.some((rule) => {
    const one = rule.trim().toLowerCase();
    if (one.startsWith(".")) return name.endsWith(one);
    if (one.endsWith("/*")) return kind.startsWith(one.slice(0, -1));
    return kind === one;
  });
}

/** A size as a person reads it, in the locale: `2.4 MB`. */
export function formatBytes(bytes: number, locale: string): string {
  const units = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: units[unit],
    unitDisplay: "short",
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
}

/** The files a drop or a pick may keep, and why each of the rest may not. */
export function checkFiles(
  files: readonly File[],
  limits: FileLimits,
  messages: ArcMessages,
  locale: string,
): { accepted: File[]; rejected: FileRejection[] } {
  const accepted: File[] = [];
  const rejected: FileRejection[] = [];
  for (const file of files) {
    if (limits.accept !== undefined && limits.accept.length > 0 && !accepts(file, limits.accept)) {
      rejected.push({ file, reason: messages.fileTypeNotAllowed(file.name) });
    } else if (limits.maxSize !== undefined && file.size > limits.maxSize) {
      rejected.push({
        file,
        reason: messages.fileTooLarge(file.name, formatBytes(limits.maxSize, locale)),
      });
    } else if (limits.maxFiles !== undefined && accepted.length >= limits.maxFiles) {
      rejected.push({ file, reason: messages.tooManyFiles(limits.maxFiles) });
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}

export const fileDropZoneStyles = variants({
  slots: {
    root: arc(layout.column, gap[2], { width: "100%" }),
    zone: arc(
      layout.column,
      layout.centre,
      gap[2],
      rounded.lg,
      bg.transparent,
      focus.slot,
      motion.colours,
      type.sm,
      when.disabledCursor,
      {
        borderWidth: "2px",
        borderStyle: "dashed",
        borderColor: "var(--input)",
        padding: space.x6,
        textAlign: "center",
      },
    ),
    over: arc(tone.info, bg.tone, edge.tone),
    icon: arc(fg.muted, glyph.md, { "& > svg": { width: space.x8, height: space.x8 } }),
    title: arc(type.label, { [on.coarse]: { display: "none" } }),
    hint: arc(type.meta),
    browse: arc({}),
    errors: arc(plainList, layout.column, gap[1], type.meta, fg.danger),
  },
});

type ZoneSlots = ReturnType<typeof fileDropZoneStyles>;

export interface FileDropZoneProps extends FileLimits, Customisable<ZoneSlots> {
  /** The files that passed the limits. */
  onFiles: (files: File[]) => void;
  /** The files that did not, each with why. Shown under the zone as well. */
  onReject?: (rejections: FileRejection[]) => void;
  /** More than one at a time. @default true */
  multiple?: boolean;
  /** Take a picture rather than pick a file, on a phone. */
  capture?: "user" | "environment";
  isDisabled?: boolean;
  /** What the zone says. @default the provider's `dropFiles`, "Drop files here" */
  title?: Child;
  /** Under it. @default the limits, in arc's words */
  hint?: Child;
  /** @default the provider's `chooseFiles`, "Choose files" */
  browseLabel?: string;
  /** Names the zone for a screen reader. @default the provider's `dropZone`, "Upload files" */
  "aria-label"?: string;
}

/**
 * Files dropped, pasted or picked: a dashed area with a button that opens
 * the file picker, which is the only way in on a touch screen.
 *
 * ```tsx
 * <FileDropZone accept={["image/*", ".pdf"]} maxSize={10_000_000} onFiles={(files) => queue.add(files)} />
 * ```
 *
 * Each file is held to `accept`, `maxSize` and `maxFiles` before it is
 * handed on; the rest are listed under the zone with why, and announced.
 */
export function FileDropZone(props: FileDropZoneProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  const [rejections, setRejections] = createSignal<FileRejection[]>([]);
  const [over, setOver] = createSignal(false);
  const cls = () => parts(fileDropZoneStyles(), props.classes);

  const take = (files: File[]): void => {
    const limits: FileLimits = {
      accept: props.accept,
      maxSize: props.maxSize,
      maxFiles: props.multiple === false ? 1 : props.maxFiles,
    };
    const { accepted, rejected } = checkFiles(
      files,
      limits,
      untrack(messages),
      untrack(locale).locale,
    );
    setRejections(rejected);
    if (rejected.length > 0) {
      props.onReject?.(rejected);
      announce(rejected.map((one) => one.reason).join(" "), "polite");
    }
    if (accepted.length > 0) props.onFiles(accepted);
  };

  const dropped = (event: DropEvent): void => {
    const files = event.items.filter(isFileDropItem).map((item) => item.getFile());
    void Promise.all(files).then(take);
  };

  const hint = (): Child => {
    if (props.hint !== undefined) return props.hint;
    const pieces: string[] = [];
    if (props.accept !== undefined && props.accept.length > 0) {
      pieces.push(messages().acceptedTypes(props.accept.join(", ")));
    }
    if (props.maxSize !== undefined) {
      pieces.push(messages().maxFileSize(formatBytes(props.maxSize, locale().locale)));
    }
    return pieces.join(" · ");
  };

  return (
    <div class={arc(cls().root, props.class, props.className)} data-slot="file-drop-zone">
      <DropZone
        class={arc(cls().zone, over() ? cls().over : undefined)}
        data-slot="file-drop-zone-area"
        isDisabled={props.isDisabled}
        aria-label={props["aria-label"] ?? messages().dropZone}
        onDropEnter={() => setOver(true)}
        onDropExit={() => setOver(false)}
        onDrop={(event: DropEvent) => {
          setOver(false);
          dropped(event);
        }}
      >
        <span class={cls().icon} data-slot="file-drop-zone-icon" aria-hidden="true">
          <CloudUpload />
        </span>
        <DropZoneLabel class={cls().title} data-slot="file-drop-zone-title">
          {props.title ?? messages().dropFiles}
        </DropZoneLabel>
        <FileTrigger
          acceptedFileTypes={props.accept}
          allowsMultiple={props.multiple !== false}
          defaultCamera={props.capture}
          onSelect={(list: FileList | null) => take(list === null ? [] : [...list])}
        >
          <Button
            class={cls().browse}
            data-slot="file-drop-zone-browse"
            variant="outline"
            size="sm"
            isDisabled={props.isDisabled}
          >
            {props.browseLabel ?? messages().chooseFiles}
          </Button>
        </FileTrigger>
        <Show when={hint() !== ""}>
          <span class={cls().hint} data-slot="file-drop-zone-hint">
            {hint()}
          </span>
        </Show>
      </DropZone>
      <Show when={rejections().length > 0}>
        <ul class={cls().errors} data-slot="file-drop-zone-errors">
          <For each={rejections()}>{(one: FileRejection) => <li>{one.reason}</li>}</For>
        </ul>
      </Show>
    </div>
  );
}

export const uploadQueueStyles = variants({
  slots: {
    root: arc(plainList, layout.column, gap[2]),
    item: arc(layout.fill),
    preview: arc(place.fill, { objectFit: "cover" }),
    name: arc({}),
    meta: arc(type.numeric),
    progress: arc(layout.fill),
    action: arc({}),
  },
});

type QueueSlots = ReturnType<typeof uploadQueueStyles>;

export interface UploadQueueProps extends Customisable<QueueSlots> {
  queue: UploadQueueApi;
}

const STATE: Record<UploadStatus, AttachmentState> = {
  queued: "idle",
  uploading: "uploading",
  done: "done",
  error: "error",
  cancelled: "idle",
};

/**
 * The files of a `useUploadQueue`, each as an attachment: a thumbnail for an
 * image, its name and size, a bar while it uploads, and cancel, retry and
 * remove, each named after the file.
 */
export function UploadQueue(props: UploadQueueProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  const cls = () => parts(uploadQueueStyles(), props.classes);
  const status = (item: UploadItem): string => {
    const words = messages();
    switch (item.status) {
      case "queued":
        return words.queued;
      case "uploading":
        return words.uploading;
      case "done":
        return words.uploadDone;
      case "cancelled":
        return words.cancelled;
      default:
        return item.error ?? words.uploadFailed(item.file.name);
    }
  };
  return (
    <ul
      class={arc(cls().root, props.class, props.className)}
      data-slot="upload-queue"
      aria-label={messages().uploads}
    >
      <For each={props.queue.items()}>
        {(item: UploadItem) => (
          <li data-slot="upload-queue-item-row">
            <Attachment
              class={cls().item}
              data-slot="upload-queue-item"
              data-status={item.status}
              state={STATE[item.status]}
            >
              <AttachmentMedia variant={item.preview === undefined ? "icon" : "image"}>
                <Show when={item.preview !== undefined} fallback={<FileIcon aria-hidden="true" />}>
                  <img
                    class={cls().preview}
                    data-slot="upload-queue-preview"
                    src={item.preview}
                    alt=""
                  />
                </Show>
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle class={cls().name} data-slot="upload-queue-name">
                  {item.file.name}
                </AttachmentTitle>
                <AttachmentDescription class={cls().meta} data-slot="upload-queue-meta">
                  {`${formatBytes(item.file.size, locale().locale)} · ${status(item)}`}
                </AttachmentDescription>
                <Show when={item.status === "uploading"}>
                  <Progress
                    class={cls().progress}
                    data-slot="upload-queue-progress"
                    value={Math.round(item.progress * 100)}
                    label={messages().uploadingFile(item.file.name)}
                  />
                </Show>
              </AttachmentContent>
              <AttachmentActions>
                <Show when={item.status === "error" || item.status === "cancelled"}>
                  <AttachmentAction
                    class={cls().action}
                    data-slot="upload-queue-retry"
                    aria-label={messages().retryUpload(item.file.name)}
                    onPress={() => props.queue.retry(item.id)}
                  >
                    <RotateCw aria-hidden="true" />
                  </AttachmentAction>
                </Show>
                <AttachmentAction
                  class={cls().action}
                  data-slot={
                    item.status === "queued" || item.status === "uploading"
                      ? "upload-queue-cancel"
                      : "upload-queue-remove"
                  }
                  aria-label={
                    item.status === "queued" || item.status === "uploading"
                      ? messages().cancelUpload(item.file.name)
                      : messages().removeFile(item.file.name)
                  }
                  onPress={() =>
                    item.status === "queued" || item.status === "uploading"
                      ? props.queue.cancel(item.id)
                      : props.queue.remove(item.id)
                  }
                >
                  <X aria-hidden="true" />
                </AttachmentAction>
              </AttachmentActions>
            </Attachment>
          </li>
        )}
      </For>
    </ul>
  );
}

export interface FileUploadProps
  extends FileLimits, Omit<UploadQueueOptions, "upload">, Customisable<ZoneSlots> {
  upload: UploadQueueOptions["upload"];
  /** A queue made outside, to read its files elsewhere. @default one of its own */
  queue?: UploadQueueApi;
  multiple?: boolean;
  capture?: "user" | "environment";
  isDisabled?: boolean;
  title?: Child;
  hint?: Child;
  onReject?: (rejections: FileRejection[]) => void;
}

/**
 * A drop zone and the queue under it, sending what is dropped through
 * `upload`.
 *
 * ```tsx
 * <FileUpload accept={["image/*"]} maxSize={5_000_000} upload={send} />
 * ```
 */
export function FileUpload(props: FileUploadProps) {
  const queue =
    untrack(() => props.queue) ??
    useUploadQueue({
      upload: (file, context) => props.upload(file, context),
      concurrency: untrack(() => props.concurrency),
      onUploaded: (item) => props.onUploaded?.(item),
    });
  return (
    <div class={arc(layout.column, gap[3], props.class, props.className)} data-slot="file-upload">
      <FileDropZone
        accept={props.accept}
        maxSize={props.maxSize}
        maxFiles={props.maxFiles}
        multiple={props.multiple}
        capture={props.capture}
        isDisabled={props.isDisabled}
        title={props.title}
        hint={props.hint}
        classes={props.classes}
        onReject={props.onReject}
        onFiles={(files) => queue.add(files)}
      />
      <UploadQueue queue={queue} />
    </div>
  );
}
