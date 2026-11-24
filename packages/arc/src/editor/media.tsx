import { Show, createSignal, createUniqueId, onCleanup } from "@barqjs/core";
import { useLexicalEditor } from "@barqjs/lexical";
import { variants } from "@barqjs/css";
import { Image as ImageIcon } from "@barqjs/lucide/icons/image";
import { Pencil } from "@barqjs/lucide/icons/pencil";
import { RotateCcw } from "@barqjs/lucide/icons/rotate-ccw";
import { SquarePlay } from "@barqjs/lucide/icons/square-play";
import { X } from "@barqjs/lucide/icons/x";
import { Button } from "@barqjs/ui/button";
import { Field, FieldDescription, FieldLabel } from "@barqjs/ui/field";
import { Input } from "@barqjs/ui/input";
import { Progress } from "@barqjs/ui/progress";
import { $dfs } from "@lexical/utils";
import type { LexicalEditor, NodeKey } from "lexical";

import { IconButton } from "../components/icon-button.tsx";
import { Image } from "../components/image.tsx";
import { useArcMessages } from "../components/messages.ts";
import { ResponsiveOverlay } from "../components/responsive-overlay.tsx";
import type { UploadItem, UploadQueueApi } from "../components/file-upload.tsx";
import { arcLayer as arc } from "../layer.ts";
import { bg, fg, gap, layout, rounded, space, type } from "../style/index.ts";
import { type Block, type BlockProps, defineBlock, updateBlockData } from "./blocks.tsx";
import { blockGap } from "./theme.ts";

export const mediaStyles = variants({
  slots: {
    figure: arc(layout.column, gap[2], layout.flush, layout.relative, blockGap),
    frame: arc(layout.relative, rounded.md, { overflow: "hidden" }),
    status: arc(layout.row, gap[2], bg.card, rounded.md, type.caption, {
      position: "absolute",
      insetInline: space.x2,
      insetBlockEnd: space.x2,
      padding: space.x2,
    }),
    error: arc(fg.danger),
    caption: arc(type.caption, fg.muted, { textAlign: "center" }),
    // Below the picture while it is edited, where a finger and the keyboard reach it.
    details: arc(layout.row, layout.end),
    form: arc(layout.column, gap[3]),
    embed: arc(rounded.md, { width: "100%", aspectRatio: "16 / 9", border: "0" }),
  },
});

export interface ImageData {
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
  /** While the file is on its way: the upload queue's id for it. */
  uploadId?: string;
}

/** The upload queue an editor's images go through. */
export interface EditorUploads {
  queue: UploadQueueApi;
  /** The largest picture accepted, in bytes. */
  maxSize?: number;
}

/**
 * Each editor's upload queue, by the editor: an image block is drawn by the
 * composer's decorators, outside the component that made the queue, and the
 * editor is what both can see.
 */
const uploadsByEditor = new WeakMap<LexicalEditor, EditorUploads>();

/** The queue `editor`'s images upload through, for as long as the calling component lives. */
export function provideEditorUploads(editor: LexicalEditor, uploads: EditorUploads): void {
  uploadsByEditor.set(editor, uploads);
  onCleanup(() => uploadsByEditor.delete(editor));
}

export function useEditorUploads(): EditorUploads | null {
  return editorUploads(useLexicalEditor());
}

/** The queue `editor`'s images upload through, or `null` for an editor that takes none. */
export function editorUploads(editor: LexicalEditor): EditorUploads | null {
  return uploadsByEditor.get(editor) ?? null;
}

function ImageView(props: BlockProps<ImageData>) {
  const messages = useArcMessages();
  const uploads = useEditorUploads();
  function cls() {
    return mediaStyles();
  }
  function item(): UploadItem | undefined {
    return props.data.uploadId === undefined
      ? undefined
      : uploads?.queue.items().find((one) => one.id === props.data.uploadId);
  }
  return (
    <figure class={cls().figure} data-slot="editor-image">
      <div class={cls().frame}>
        <Image
          src={props.data.src}
          alt={props.data.alt}
          width={props.data.width}
          height={props.data.height}
          fit="contain"
        />
        <Show when={item()}>
          {(upload: () => UploadItem) => (
            <div class={cls().status} data-slot="editor-image-status">
              <Show
                when={upload().status === "error"}
                fallback={
                  <Progress
                    class={layout.grow}
                    value={upload().progress}
                    maxValue={1}
                    label={messages().uploadingFile(upload().file.name)}
                  />
                }
              >
                <span class={arc(layout.grow, cls().error)} role="alert">
                  {messages().uploadFailed(upload().file.name)}
                </span>
                <IconButton
                  label={messages().retryUpload(upload().file.name)}
                  size="sm"
                  onPress={() => uploads?.queue.retry(upload().id)}
                >
                  <RotateCcw />
                </IconButton>
                <IconButton
                  label={messages().removeFile(upload().file.name)}
                  size="sm"
                  onPress={() => {
                    uploads?.queue.remove(upload().id);
                    props.remove();
                  }}
                >
                  <X />
                </IconButton>
              </Show>
            </div>
          )}
        </Show>
      </div>
      <Show when={props.editable && props.data.uploadId === undefined}>
        <div class={cls().details} data-slot="editor-image-actions">
          <ImageDetails data={props.data} setData={props.setData} />
        </div>
      </Show>
      <Show when={props.data.caption}>
        <figcaption class={cls().caption}>{props.data.caption}</figcaption>
      </Show>
    </figure>
  );
}

interface ImageDetailsProps {
  data: ImageData;
  setData: BlockProps<ImageData>["setData"];
}

/** A picture's alt text and caption, edited in a popover from a button over it. */
function ImageDetails(props: ImageDetailsProps) {
  const messages = useArcMessages();
  const formId = createUniqueId();
  const altId = createUniqueId();
  const captionId = createUniqueId();
  const [open, setOpen] = createSignal(false, { ownedWrite: true });
  const [alt, setAlt] = createSignal("", { ownedWrite: true });
  const [caption, setCaption] = createSignal("", { ownedWrite: true });
  function change(next: boolean): void {
    if (next) {
      setAlt(props.data.alt);
      setCaption(props.data.caption ?? "");
    }
    setOpen(next);
  }
  return (
    <ResponsiveOverlay
      heading={messages().imageDetails}
      desktop="popover"
      open={open()}
      onOpenChange={change}
      trigger={
        <IconButton
          slot="editor-image-details"
          label={messages().imageDetails}
          size="sm"
          tooltip={false}
        >
          <Pencil aria-hidden="true" />
        </IconButton>
      }
      footer={
        <Button type="submit" size="sm" form={formId}>
          {messages().save}
        </Button>
      }
    >
      <form
        id={formId}
        class={mediaStyles().form}
        onSubmit={(event: SubmitEvent) => {
          event.preventDefault();
          const text = caption().trim();
          props.setData({ alt: alt().trim(), caption: text === "" ? undefined : text });
          setOpen(false);
        }}
      >
        <Field>
          <FieldLabel for={altId}>{messages().altText}</FieldLabel>
          <Input
            id={altId}
            autoFocus
            value={alt()}
            aria-describedby={`${altId}-hint`}
            onInput={(event: Event) => setAlt((event.currentTarget as HTMLInputElement).value)}
          />
          <FieldDescription id={`${altId}-hint`}>{messages().altTextHint}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel for={captionId}>{messages().imageCaption}</FieldLabel>
          <Input
            id={captionId}
            value={caption()}
            onInput={(event: Event) => setCaption((event.currentTarget as HTMLInputElement).value)}
          />
        </Field>
      </form>
    </ResponsiveOverlay>
  );
}

const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s?$/;

function escapeAlt(text: string): string {
  return text.replace(/[[\]]/g, "\\$&");
}

/** A picture in the document: uploaded, pasted, dropped or linked. */
export const ImageBlock: Block<ImageData> = defineBlock<ImageData>({
  type: "image",
  label: (messages) => messages.image,
  group: (messages) => messages.mediaBlocks,
  icon: () => <ImageIcon />,
  keywords: ["picture", "photo", "upload"],
  defaultData: () => ({ src: "", alt: "" }),
  component: ImageView,
  insertable: false,
  toMarkdown: (data) =>
    data.uploadId !== undefined || data.src === ""
      ? null
      : `![${escapeAlt(data.alt)}](${data.src}${data.caption ? ` "${data.caption}"` : ""})`,
  fromMarkdown: {
    regExp: IMAGE_LINE,
    data: (match) => ({ alt: match[1] ?? "", src: match[2] ?? "", caption: match[3] }),
  },
  fromHtml: {
    img: (element) => {
      const src = element.getAttribute("src") ?? "";
      const uploadId = element.dataset.uploadId;
      if (src === "" && uploadId === undefined) return null;
      const width = Number(element.getAttribute("width"));
      const height = Number(element.getAttribute("height"));
      return {
        src,
        alt: element.getAttribute("alt") ?? "",
        ...(width > 0 ? { width } : {}),
        ...(height > 0 ? { height } : {}),
        ...(uploadId === undefined ? {} : { uploadId }),
      };
    },
  },
  toHtml: (data) => {
    const image = document.createElement("img");
    image.src = data.src;
    image.alt = data.alt;
    if (data.width !== undefined) image.width = data.width;
    if (data.height !== undefined) image.height = data.height;
    return image;
  },
});

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

/** Every image still on its way whose upload finished: its URL replaces the preview. */
export function settleUpload(editor: LexicalEditor, item: UploadItem): void {
  const keys: NodeKey[] = editor.read(() =>
    $dfs()
      .map((entry) => entry.node)
      .filter((node) => ImageBlock.$is(node) && node.getData().uploadId === item.id)
      .map((node) => node.getKey()),
  );
  for (const key of keys) {
    updateBlockData<ImageData>(editor, key, (data) => ({
      ...data,
      src: typeof item.result === "string" ? item.result : data.src,
      uploadId: undefined,
    }));
  }
}
