import { createContext, getOwner, install, onCleanup, useContext } from "@barqjs/core";
import { useLexicalEditor } from "@barqjs/lexical";
import type { LexicalEditor } from "lexical";

import type { UploadContext, UploadQueueApi } from "../components/file-upload.tsx";

/** The upload queue an editor's pictures and files go through. */
export interface EditorUploads {
  queue: UploadQueueApi;
  /** Sends one file outside the queue and resolves with its address: a recording's captions, written as they are saved. */
  send: (file: File) => Promise<string>;
  /** The largest picture accepted, in bytes. */
  maxSize?: number;
}

/**
 * Each editor's upload queue, by the editor: a picture block is drawn by the
 * composer's decorators, outside the component that made the queue, and the
 * editor is what both can see.
 */
const uploadsByEditor = new WeakMap<LexicalEditor, EditorUploads>();

/** The queue `editor`'s pictures upload through, for as long as the calling component lives. */
export function provideEditorUploads(editor: LexicalEditor, uploads: EditorUploads): void {
  uploadsByEditor.set(editor, uploads);
  onCleanup(() => uploadsByEditor.delete(editor));
}

export function useEditorUploads(): EditorUploads | null {
  return editorUploads(useLexicalEditor());
}

/** The queue `editor`'s pictures upload through, or `null` for an editor that takes none. */
export function editorUploads(editor: LexicalEditor): EditorUploads | null {
  return uploadsByEditor.get(editor) ?? null;
}

/**
 * An upload begun before the page was reloaded, which the app kept so it can
 * be finished: `resume` sends what the server still lacks and resolves with
 * the file's address; `discard` gives it up.
 */
export interface UnfinishedUpload {
  file: File;
  resume: (context: UploadContext) => Promise<string>;
  discard: () => Promise<void>;
}

/** What an app lends the media blocks, in its editors and its renderers alike. */
export interface EditorMedia {
  /** The address of a file the app keeps, by the id a document stores. */
  fileUrl?: (fileId: string) => string;
  /** Words for a refusal the app's service answers with a code of its own (a quota, say); arc's for the rest. */
  uploadRefusal?: (code: string, file: File) => string | undefined;
  /** Uploads begun before the page was reloaded, which an editor finishes and places at the end. */
  unfinished?: () => Promise<UnfinishedUpload[]>;
}

const NO_MEDIA: EditorMedia = {};

const MediaContext = createContext<EditorMedia>(NO_MEDIA, "EditorMedia");

/** The app's media services below the calling component, for every editor and renderer there. */
export function provideEditorMedia(media: EditorMedia): void {
  const owner = getOwner();
  if (owner !== null) install(owner, MediaContext, () => media);
}

/** The app's media services where the caller renders, read as they are used. */
export function useEditorMedia(): () => EditorMedia {
  return useContext(MediaContext);
}

/** Where a block's file is fetched from: its own address, or the app's for the file it keeps. */
export interface MediaAddressed {
  src?: string;
  fileId?: string;
}

/** The address a picture, a file or a recording is drawn from. */
export function mediaAddress(
  data: MediaAddressed,
  fileUrl: ((fileId: string) => string) | undefined,
): string {
  if (data.src !== undefined && data.src !== "") return data.src;
  if (data.fileId === undefined || data.fileId === "") return "";
  return fileUrl === undefined ? data.fileId : fileUrl(data.fileId);
}
