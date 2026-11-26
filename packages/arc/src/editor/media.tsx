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
  /** The app's media library, which Insert opens and a picture's menu keeps it in. */
  library?: MediaLibrary;
  /** Open pictures the app searches, which Insert offers. */
  pictures?: PictureSearch;
}

const NO_MEDIA: EditorMedia = {};

const MediaContext = createContext<EditorMedia>(NO_MEDIA, "EditorMedia");

/** The app's media services below the calling component, for every editor and renderer there. */
export function provideEditorMedia(media: EditorMedia): void {
  const owner = getOwner();
  if (owner !== null) install(owner, MediaContext, () => media);
}

/** Each editor's media services, for a command or a paste rule that has no component to read them from. */
const mediaByEditor = new WeakMap<LexicalEditor, () => EditorMedia>();

/** Gives the editor it renders in the app's media services, before anything that offers commands draws. */
export function EditorMediaHost() {
  mediaByEditor.set(useLexicalEditor(), useEditorMedia());
  return null;
}

/** The app's media services an editor was given, none until its UI has mounted. */
export function editorMedia(editor: LexicalEditor): EditorMedia {
  return mediaByEditor.get(editor)?.() ?? NO_MEDIA;
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

/**
 * A picture's credit, as an open licence asks it be kept with the picture:
 * who made it, under which licence, and the page it came from.
 */
export interface PictureCredit {
  author: string;
  licence: string;
  licenceUrl?: string;
  /** The page the picture was taken from. */
  source?: string;
}

/** A picture a document shows, as the library keeps it with its words. */
export interface KeptPicture extends MediaAddressed {
  alt: string;
  credit?: PictureCredit;
}

/** An item of an app's media library, as a document takes it in. */
export interface MediaChoice extends MediaAddressed {
  name: string;
  mime: string;
  bytes?: number;
  /** What a picture shows, as the library describes it. */
  alt?: string;
  credit?: PictureCredit;
  /** What a picture's caption starts from. */
  caption?: string;
}

/** What a choice may be: pictures, sound and video, or any file. */
export type MediaChoiceKind = "image" | "media" | "file";

/**
 * An app's media library: `choose` opens it on items of a kind and resolves
 * to those chosen, or `null` when nothing was; `keep` keeps a picture shown
 * in a document in the library too, with its words.
 */
export interface MediaLibrary {
  choose: (kind: MediaChoiceKind, multiple: boolean) => Promise<readonly MediaChoice[] | null>;
  keep?: (picture: KeptPicture) => Promise<void>;
}

/** A picture from an open collection, found by what it shows. */
export interface OpenPicture {
  id: string;
  /** What it is called where it was found. */
  label: string;
  thumb: string;
  full: string;
  alt?: string;
  credit?: PictureCredit;
}

/**
 * Pictures from open collections an app searches, with the credit their
 * makers ask for; `take` copies one into the app's own files first, where
 * a document must not depend on the collection.
 */
export interface PictureSearch {
  search: (query: string) => Promise<readonly OpenPicture[]>;
  take?: (picture: OpenPicture) => Promise<MediaAddressed>;
}
