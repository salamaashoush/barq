import {
  type Child,
  createEffect,
  createRoot,
  createSignal,
  onCleanup,
  runWithOwner,
  untrack,
} from "@barqjs/core";
import { useLexicalEditor } from "@barqjs/lexical";
import { isServer } from "@barqjs/web";
import { $getRoot, type LexicalEditor, type LexicalNode } from "lexical";

import {
  type UploadContext,
  type UploadItem,
  type UploadQueueApi,
  useUploadQueue,
} from "../components/file-upload.tsx";
import { type ArcMessages, provideArcMessages, useArcMessages } from "../components/messages.ts";
import { FileBlock } from "./file-block.tsx";
import {
  type EditorMedia,
  type UnfinishedUpload,
  provideEditorUploads,
  useEditorMedia,
} from "./media.tsx";
import { ImageBlock, settleUpload } from "./picture.tsx";
import { RecordingBlock } from "./recording.tsx";

/**
 * Why an upload was refused, as a service answers it: the error's message
 * is one of these codes, or the words to show.
 */
export const UPLOAD_REFUSALS = [
  "file.too_large",
  "file.wrong_type",
  "file.empty",
  "file.infected",
  "file.content_mismatch",
  "file.scan_unavailable",
  "file.quota",
] as const;
export type UploadRefusal = (typeof UPLOAD_REFUSALS)[number];

/** The words for a refused upload: the app's own for a code it knows, arc's for the rest. */
export function uploadRefusalWords(
  code: string,
  file: File,
  messages: ArcMessages,
  media: EditorMedia,
): string {
  const own = media.uploadRefusal?.(code, file);
  if (own !== undefined) return own;
  switch (code) {
    case "file.too_large":
      return messages.uploadTooLarge(file.name);
    case "file.wrong_type":
      return messages.uploadWrongType(file.name);
    case "file.empty":
      return messages.uploadEmpty(file.name);
    case "file.infected":
      return messages.uploadInfected(file.name);
    case "file.content_mismatch":
      return messages.uploadMismatch(file.name);
    case "file.scan_unavailable":
      return messages.uploadUnchecked(file.name);
    case "file.quota":
      return messages.uploadNoRoom(file.name);
    default:
      // A message that is not a code is the service's own words for it.
      return code !== "" && !code.startsWith("file.") ? code : messages.uploadFailed(file.name);
  }
}

/** A block for a file on its way, of the kind its type says: a picture, a recording or a file. */
export function $blockForUpload(item: UploadItem): LexicalNode {
  const file = item.file;
  if (file.type.startsWith("image/")) {
    return ImageBlock.$create({
      src: item.preview ?? "",
      alt: file.name.replace(/\.[^.]+$/, ""),
      caption: "",
      size: "full",
      uploadId: item.id,
    });
  }
  if (/^(audio|video)\//.test(file.type)) {
    return RecordingBlock.$create({
      mime: file.type,
      caption: "",
      size: "full",
      uploadId: item.id,
    });
  }
  return FileBlock.$create({
    name: file.name,
    mime: file.type,
    bytes: file.size,
    uploadId: item.id,
  });
}

/** The editor showing each field now, by the field's id. */
const showing = new Map<string, LexicalEditor>();

/** The editor showing a field now, for work that finishes after the editor it began in went away. */
export function editorShowing(fieldId: string): LexicalEditor | null {
  return showing.get(fieldId) ?? null;
}

/** The upload the editor showing a field now sends with. */
interface CurrentUpload {
  current: (file: File, context: UploadContext) => Promise<string>;
}

interface SharedUploads {
  queue: UploadQueueApi;
  upload: CurrentUpload;
  holders: number;
  hold: () => void;
  release: () => void;
}

/** Each field's queue, kept past an editor that is started again while its files are on their way. */
const byField = new Map<string, SharedUploads>();

function busy(queue: UploadQueueApi): boolean {
  return queue.items().some((item) => item.status === "queued" || item.status === "uploading");
}

export interface EditorUploadsProviderProps {
  upload: (file: File, context: UploadContext) => Promise<string>;
  maxSize?: number;
  /**
   * The field the editor shows: an editor started again for it (a new
   * document's, once it is first saved) takes over the files still on their
   * way, and each lands in the editor showing the field when it is up.
   */
  fieldId?: string;
  children: Child;
}

/**
 * The editor's upload queue: files go up through `upload`, refusals read as
 * words, uploads a reload cut off are finished and land at the end of the
 * document, and leaving the page while files are on their way asks first.
 */
export function EditorUploadsProvider(props: EditorUploadsProviderProps) {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  const media = useEditorMedia();
  const fieldId = untrack(() => props.fieldId);
  const resuming = new Map<File, UnfinishedUpload>();

  function precheck(file: File): string | null {
    if (file.size === 0) return "file.empty";
    const most = untrack(() => props.maxSize);
    if (most !== undefined && file.type.startsWith("image/") && file.size > most) {
      return "file.too_large";
    }
    return null;
  }

  function send(
    file: File,
    context: UploadContext,
    upload: SharedUploads["upload"],
  ): Promise<string> {
    const early = precheck(file);
    if (early !== null) {
      return Promise.reject(new Error(uploadRefusalWords(early, file, messages(), media())));
    }
    const unfinished = resuming.get(file);
    const sending =
      unfinished === undefined ? upload.current(file, context) : unfinished.resume(context);
    return sending.catch((error: unknown) => {
      if (context.signal.aborted) void unfinished?.discard();
      const code = error instanceof Error ? error.message : "";
      throw new Error(uploadRefusalWords(code, file, messages(), media()));
    });
  }

  function settled(item: UploadItem): void {
    resuming.delete(item.file);
    settleUpload(fieldId === undefined ? editor : (editorShowing(fieldId) ?? editor), item);
  }

  function make(): SharedUploads {
    const upload = { current: untrack(() => props.upload) };
    if (fieldId === undefined) {
      const queue = useUploadQueue({
        upload: (file, context) => send(file, context, upload),
        onUploaded: settled,
      });
      return { queue, upload, holders: 0, hold: () => undefined, release: () => undefined };
    }
    // A root of its own, not the editor's child, so starting the editor again leaves it be.
    return runWithOwner(null, () =>
      createRoot((dispose) => {
        // The queue outlives this editor, so it reads the words where it was made.
        provideArcMessages(() => messages());
        const [orphaned, setOrphaned] = createSignal(false, { ownedWrite: true });
        const queue = useUploadQueue({
          upload: (file, context) => send(file, context, shared.upload),
          onUploaded: settled,
        });
        createEffect(
          () => orphaned() && !busy(queue),
          (done) => {
            if (!done) return;
            byField.delete(fieldId);
            queueMicrotask(dispose);
          },
        );
        const shared: SharedUploads = {
          queue,
          upload,
          holders: 0,
          hold: () => setOrphaned(false),
          release: () => setOrphaned(true),
        };
        byField.set(fieldId, shared);
        return shared;
      }),
    );
  }

  const shared = (fieldId === undefined ? undefined : byField.get(fieldId)) ?? make();
  shared.upload.current = untrack(() => props.upload);
  shared.holders += 1;
  shared.hold();
  if (fieldId !== undefined) {
    showing.set(fieldId, editor);
    onCleanup(() => {
      if (showing.get(fieldId) === editor) showing.delete(fieldId);
      shared.holders -= 1;
      if (shared.holders === 0) shared.release();
    });
  }
  const queue = shared.queue;
  provideEditorUploads(editor, {
    queue,
    send: (file) =>
      send(
        file,
        { onProgress: () => undefined, signal: new AbortController().signal },
        shared.upload,
      ),
    maxSize: untrack(() => props.maxSize),
  });

  if (!isServer) {
    // Uploads a reload cut off are finished, each landing at the end of the document.
    void untrack(media)
      .unfinished?.()
      .then(
        (found) => {
          if (found.length === 0) return;
          for (const one of found) resuming.set(one.file, one);
          const items = queue.add(found.map((one) => one.file));
          editor.update(() => {
            for (const item of items) $getRoot().append($blockForUpload(item));
          });
        },
        () => undefined,
      );
    createEffect(
      () => busy(queue),
      (sending) => {
        if (!sending) return undefined;
        function leave(event: BeforeUnloadEvent): void {
          event.preventDefault();
          // Browsers that predate `preventDefault` here ask when this is set.
          event.returnValue = "";
        }
        globalThis.addEventListener("beforeunload", leave);
        return () => globalThis.removeEventListener("beforeunload", leave);
      },
    );
  }
  return <>{props.children}</>;
}
