import { createContext, getOwner, install, onCleanup, useContext } from "@barqjs/core";
import { useLexicalEditor } from "@barqjs/lexical";
import { variants } from "@barqjs/css";
import { SquarePlay } from "@barqjs/lucide/icons/square-play";
import type { LexicalEditor } from "lexical";

import type { UploadQueueApi } from "../components/file-upload.tsx";
import { arcLayer as arc } from "../layer.ts";
import { gap, layout, rounded } from "../style/index.ts";
import { type Block, type BlockProps, defineBlock } from "./blocks.tsx";
import { blockGap } from "./theme.ts";

export const mediaStyles = variants({
  slots: {
    figure: arc(layout.column, gap[2], layout.flush, layout.relative, blockGap),
    embed: arc(rounded.md, { width: "100%", aspectRatio: "16 / 9", border: "0" }),
  },
});

/** The upload queue an editor's pictures and files go through. */
export interface EditorUploads {
  queue: UploadQueueApi;
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
 * What an app lends the media blocks, in its editors and its renderers alike:
 * the address of a file it keeps, by the id a document stores.
 */
export interface EditorMedia {
  fileUrl?: (fileId: string) => string;
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

export interface EmbedData {
  /** The address the reader gave. */
  url: string;
  /** What the frame loads, from the provider that recognised `url`. */
  src: string;
  title: string;
}

/** A site an editor embeds: recognises a pasted address and says what to frame. */
export interface EmbedProvider {
  name: string;
  /** The frame's address for `url`, or `null` when it is not this provider's. */
  match: (url: URL) => string | null;
}

/** Video sites whose players are made to be framed, as defaults. */
export const DEFAULT_EMBED_PROVIDERS: readonly EmbedProvider[] = [
  {
    name: "YouTube",
    match: (url) => {
      const host = url.hostname.replace(/^www\./, "");
      const id =
        host === "youtu.be"
          ? url.pathname.slice(1)
          : host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com"
            ? (url.searchParams.get("v") ?? /^\/(?:embed|shorts)\/([\w-]+)/.exec(url.pathname)?.[1])
            : undefined;
      return id !== undefined && id !== null && /^[\w-]{6,}$/.test(id)
        ? `https://www.youtube-nocookie.com/embed/${id}`
        : null;
    },
  },
  {
    name: "Vimeo",
    match: (url) => {
      const id = /^\/(\d+)/.exec(url.pathname)?.[1];
      return url.hostname.replace(/^www\./, "") === "vimeo.com" && id !== undefined
        ? `https://player.vimeo.com/video/${id}`
        : null;
    },
  },
];

/** The embed a pasted or typed address makes, or `null` when no provider takes it. */
export function resolveEmbed(
  address: string,
  providers: readonly EmbedProvider[] = DEFAULT_EMBED_PROVIDERS,
): EmbedData | null {
  let url: URL;
  try {
    url = new URL(address.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  for (const provider of providers) {
    const src = provider.match(url);
    if (src !== null) return { url: url.href, src, title: provider.name };
  }
  return null;
}

function EmbedView(props: BlockProps<EmbedData>) {
  return (
    <figure class={mediaStyles().figure} data-slot="editor-embed">
      <iframe
        class={mediaStyles().embed}
        src={props.data.src}
        title={props.data.title}
        loading="lazy"
        allow="encrypted-media; picture-in-picture; fullscreen"
        sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
        referrerpolicy="strict-origin-when-cross-origin"
        // A frame that takes the pointer while the block is being arranged
        // would swallow the press that selects it.
        style={{ "pointer-events": props.editable && !props.selected ? "none" : undefined }}
      />
    </figure>
  );
}

/** A video or other page framed from a provider that recognised its address. */
export const EmbedBlock: Block<EmbedData> = defineBlock<EmbedData>({
  type: "embed",
  label: (messages) => messages.embed,
  group: (messages) => messages.mediaBlocks,
  icon: () => <SquarePlay />,
  keywords: ["video", "youtube", "vimeo", "iframe"],
  defaultData: () => ({ url: "", src: "", title: "" }),
  component: EmbedView,
  insertable: false,
  toMarkdown: (data) => (data.url === "" ? null : `[${data.title}](${data.url})`),
  fromHtml: {
    iframe: (element) => resolveEmbed(element.getAttribute("src") ?? ""),
  },
  toHtml: (data) => {
    const link = document.createElement("a");
    link.href = data.url;
    link.textContent = data.title;
    return link;
  },
});
