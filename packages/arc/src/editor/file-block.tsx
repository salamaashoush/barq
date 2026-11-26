import { type Child, Show, createSignal, createUniqueId, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useLocale } from "@barqjs/aria/i18n";
import { useLexicalEditor } from "@barqjs/lexical";
import { Download } from "@barqjs/lucide/icons/download";
import { Eye } from "@barqjs/lucide/icons/eye";
import { File as FileIcon } from "@barqjs/lucide/icons/file";
import { FileArchive } from "@barqjs/lucide/icons/file-archive";
import { FileImage } from "@barqjs/lucide/icons/file-image";
import { FileMusic } from "@barqjs/lucide/icons/file-music";
import { FileSpreadsheet } from "@barqjs/lucide/icons/file-spreadsheet";
import { FileText } from "@barqjs/lucide/icons/file-text";
import { FileUp } from "@barqjs/lucide/icons/file-up";
import { FileVideoCamera } from "@barqjs/lucide/icons/file-video-camera";
import { Paperclip } from "@barqjs/lucide/icons/paperclip";
import { Pencil } from "@barqjs/lucide/icons/pencil";
import { Presentation } from "@barqjs/lucide/icons/presentation";
import { Button } from "@barqjs/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@barqjs/ui/dialog";
import { Field, FieldLabel } from "@barqjs/ui/field";
import { Input } from "@barqjs/ui/input";
import { Progress } from "@barqjs/ui/progress";
import type { JSX } from "@barqjs/web";
import { DRAG_DROP_PASTE } from "@lexical/rich-text";
import { COMMAND_PRIORITY_LOW, type LexicalEditor, type LexicalNode, type NodeKey } from "lexical";

import { CopyButton } from "../components/copy-button.tsx";
import { formatBytes } from "../components/file-upload.tsx";
import { MediaPlayer } from "../components/media-player.tsx";
import { type ArcMessages, useArcMessages } from "../components/messages.ts";
import { ResponsiveOverlay } from "../components/responsive-overlay.tsx";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  control,
  edge,
  fg,
  focus,
  gap,
  interaction,
  layout,
  place,
  rounded,
  space,
  square,
  truncate,
  type,
} from "../style/index.ts";
import { blockOptions } from "./block-options.ts";
import {
  $isBlockNode,
  type Block,
  type BlockProps,
  type BlockRead,
  defineBlock,
  updateBlockData,
} from "./blocks.tsx";
import { $insertBlock } from "./commands.ts";
import { isWordFile } from "./docx-import.tsx";
import { type EditorExtension, defineEditorExtension } from "./extension.ts";
import { useRegistration } from "./hooks.ts";
import {
  type MediaAddressed,
  editorUploads,
  mediaAddress,
  useEditorMedia,
  useEditorUploads,
} from "./media.tsx";
import { attributesOf } from "./picture.tsx";
import { blockGap } from "./theme.ts";

/** What kind of thing a file is, for its icon and how the viewer shows it. */
export type FileFamily =
  | "pdf"
  | "document"
  | "text"
  | "sheet"
  | "slides"
  | "image"
  | "audio"
  | "video"
  | "archive"
  | "other";

const FAMILY_OF_EXTENSION: Readonly<Record<string, FileFamily>> = {
  pdf: "pdf",
  doc: "document",
  docx: "document",
  odt: "document",
  rtf: "document",
  pages: "document",
  txt: "text",
  md: "text",
  csv: "sheet",
  xls: "sheet",
  xlsx: "sheet",
  ods: "sheet",
  numbers: "sheet",
  ppt: "slides",
  pptx: "slides",
  odp: "slides",
  key: "slides",
  zip: "archive",
  rar: "archive",
  "7z": "archive",
  tar: "archive",
  gz: "archive",
};

const ICONS: Readonly<Record<FileFamily, () => JSX.Element>> = {
  pdf: () => <FileText aria-hidden="true" />,
  document: () => <FileText aria-hidden="true" />,
  text: () => <FileText aria-hidden="true" />,
  sheet: () => <FileSpreadsheet aria-hidden="true" />,
  slides: () => <Presentation aria-hidden="true" />,
  image: () => <FileImage aria-hidden="true" />,
  audio: () => <FileMusic aria-hidden="true" />,
  video: () => <FileVideoCamera aria-hidden="true" />,
  archive: () => <FileArchive aria-hidden="true" />,
  other: () => <FileIcon aria-hidden="true" />,
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** A file's kind from its name, or else its media type. */
export function fileFamily(name: string, mime: string): FileFamily {
  const known = FAMILY_OF_EXTENSION[extensionOf(name)];
  if (known !== undefined) return known;
  const kind = mime.toLowerCase();
  if (kind === "application/pdf") return "pdf";
  if (kind.startsWith("image/")) return "image";
  if (kind.startsWith("audio/")) return "audio";
  if (kind.startsWith("video/")) return "video";
  if (kind.startsWith("text/")) return "text";
  return "other";
}

/** Whether a browser shows a file of this type itself, so the viewer can. */
export function previewable(mime: string): boolean {
  const kind = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  return kind === "application/pdf" || kind === "text/plain" || /^(image|audio|video)\//.test(kind);
}

/** How a file reads in a document: a card, or a PDF's card with its pages under it. */
export const FILE_DISPLAYS = ["card", "preview"] as const;
export type FileDisplay = (typeof FILE_DISPLAYS)[number];

export interface FileData extends MediaAddressed {
  name: string;
  mime: string;
  bytes: number;
  caption?: string;
  /** @default "card" */
  display?: FileDisplay;
  /**
   * The first file the block held, kept once a new version took its place:
   * how a copy someone was given is told from the one they made of it.
   */
  origin?: string;
  /** While the file is on its way: the upload queue's id for it. */
  uploadId?: string;
}

/** "PDF · 1.2 MB": what a reader weighs before opening a file on a slow line. */
export function fileMeta(file: FileData, locale: string): string {
  return [
    extensionOf(file.name).toUpperCase(),
    file.bytes > 0 ? formatBytes(file.bytes, locale) : "",
  ]
    .filter((part) => part !== "")
    .join(" · ");
}

export const fileBlockStyles = variants({
  slots: {
    root: arc(layout.column, layout.flush, edge.all, rounded.lg, bg.card, layout.clip, blockGap),
    bar: arc(layout.row, gap[1], { padding: space.x1 }),
    row: arc(
      control.bare,
      layout.row,
      layout.grow,
      layout.minZero,
      gap[3],
      rounded.md,
      focus.visible,
      {
        minHeight: "2.75rem",
        paddingInline: space.x1,
        textDecorationLine: "none",
      },
    ),
    open: arc(interaction.hover),
    icon: arc(layout.centre, rounded.md, bg.muted, fg.muted, square.x8, {
      flexShrink: "0",
    }),
    text: arc(layout.column, layout.grow, layout.minZero, { textAlign: "start" }),
    name: arc(truncate, type.label),
    meta: arc(type.caption, fg.muted),
    pages: arc(place.block, layout.fill, edge.top, bg.muted, {
      height: "min(70vh, 40rem)",
    }),
    note: arc(type.body, fg.muted, edge.top, place.padded),
    caption: arc(type.body, fg.muted, edge.top, place.padded),
    status: arc(layout.row, gap[2], edge.top, place.padded, type.caption),
    actions: arc(layout.row, layout.wrap, gap[1], edge.top, { padding: space.x1_5 }),
  },
});

type FileSlots = ReturnType<typeof fileBlockStyles>;

export const fileViewerStyles = variants({
  slots: {
    root: arc({ width: "min(64rem, calc(100vw - 2rem))", maxWidth: "none" }),
    head: arc(layout.row, gap[2], layout.minZero),
    title: arc(layout.grow, layout.minZero, truncate, type.heading),
    stage: arc(layout.centre, rounded.md, bg.muted, { minHeight: "12rem", overflow: "auto" }),
    frame: arc(place.block, layout.fill, edge.none, { height: "min(75vh, 48rem)" }),
    picture: arc(place.block, { maxWidth: "100%", maxHeight: "75vh" }),
    note: arc(layout.column, layout.centre, gap[3], place.padded, fg.muted, type.body),
  },
});

/** A file's look: a class on each card and a class per part, in the editor and the renderer. */
export type FileOptions = Customisable<FileSlots>;

const looks = blockOptions<FileOptions>();

export interface FileViewerProps {
  file: FileData;
  url: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * A file over the page, shown as the browser shows its kind: a picture, a
 * PDF's or a text's pages, a recording on `MediaPlayer`; anything else says
 * it cannot be shown here. Its download and a copy of its link are beside
 * its name.
 */
export function FileViewer(props: FileViewerProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  const titleId = createUniqueId();
  const s = fileViewerStyles();
  function family(): FileFamily {
    return fileFamily(props.file.name, props.file.mime);
  }
  function stage(): Child {
    const kind = family();
    if (!previewable(props.file.mime) && kind !== "pdf") {
      return (
        <p class={s.note} data-slot="file-viewer-note">
          {messages().fileNoPreview}
          <a href={props.url} download={props.file.name}>
            {messages().downloadFile(props.file.name)}
          </a>
        </p>
      );
    }
    if (kind === "image") {
      return <img class={s.picture} src={props.url} alt={props.file.caption ?? ""} />;
    }
    if (kind === "audio" || kind === "video") {
      return <MediaPlayer kind={kind} title={props.file.name} src={props.url} />;
    }
    return <iframe class={s.frame} src={props.url} title={props.file.name} />;
  }
  return (
    <Dialog isOpen={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        class={s.root}
        data-slot="file-viewer"
        closeLabel={messages().close}
        aria-labelledby={titleId}
      >
        <div class={s.head}>
          <DialogTitle class={s.title} id={titleId}>
            <bdi>{props.file.name}</bdi>
          </DialogTitle>
          <span class={type.meta}>{fileMeta(props.file, locale().locale)}</span>
          <a
            class={arc(layout.inlineCentre, square.x8, rounded.md, interaction.hover, fg.muted)}
            href={props.url}
            download={props.file.name}
            aria-label={messages().downloadFile(props.file.name)}
          >
            <Download aria-hidden="true" />
          </a>
          <CopyButton value={absolute(props.url)} label={messages().copyFileLink} />
        </div>
        <div class={s.stage} data-slot="file-viewer-stage">
          {stage()}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function absolute(url: string): string {
  try {
    return new URL(url, globalThis.location?.href).href;
  } catch {
    return url;
  }
}

export interface FileCardProps {
  file: FileData;
  options: FileOptions | undefined;
  /** While the document is edited: the card names the file, and the buttons under it work on it. */
  editable: boolean;
  /** Under the card while it is edited. */
  actions?: JSX.Element;
  /** Over the card's foot: an upload's progress. */
  status?: JSX.Element;
}

/**
 * A file as it reads in a document: its kind, name, type and size on one
 * row, and a PDF's pages under it where its author chose to show them. A
 * reader opens it in the viewer, or downloads one a browser cannot show.
 */
export function FileCard(props: FileCardProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  const media = useEditorMedia();
  const [viewing, setViewing] = createSignal(false, { ownedWrite: true });
  function c(): FileSlots {
    return parts(fileBlockStyles(), props.options?.classes);
  }
  function url(): string {
    return mediaAddress(props.file, media().fileUrl);
  }
  function family(): FileFamily {
    return fileFamily(props.file.name, props.file.mime);
  }
  function label(): string {
    return `${props.file.name} (${fileMeta(props.file, locale().locale)})`;
  }
  function row(): JSX.Element {
    return (
      <>
        <span class={c().icon} data-slot="editor-file-icon">
          {ICONS[family()]()}
        </span>
        <span class={c().text}>
          <span class={c().name}>
            <bdi>{props.file.name}</bdi>
          </span>
          <span class={c().meta}>{fileMeta(props.file, locale().locale)}</span>
        </span>
      </>
    );
  }
  function shown(): boolean {
    return previewable(props.file.mime) || family() === "pdf";
  }
  return (
    <div
      class={arc(c().root, props.options?.class, props.options?.className)}
      data-slot="editor-file"
      data-family={family()}
      data-display={props.file.display ?? "card"}
    >
      <div class={c().bar}>
        <Show when={!props.editable && url() !== ""} fallback={<div class={c().row}>{row()}</div>}>
          <Show
            when={shown()}
            fallback={
              <a
                class={arc(c().row, c().open)}
                href={url()}
                download={props.file.name}
                aria-label={messages().downloadFile(label())}
              >
                {row()}
              </a>
            }
          >
            <button
              type="button"
              class={arc(c().row, c().open)}
              aria-label={messages().openFile(label())}
              aria-haspopup="dialog"
              onClick={() => setViewing(true)}
            >
              {row()}
            </button>
          </Show>
        </Show>
        <Show when={url() !== "" && props.file.uploadId === undefined}>
          <a
            class={arc(layout.inlineCentre, square.x8, rounded.md, interaction.hover, fg.muted)}
            href={url()}
            download={props.file.name}
            aria-label={messages().downloadFile(label())}
            data-slot="editor-file-download"
          >
            <Download aria-hidden="true" />
          </a>
        </Show>
      </div>
      <Show when={props.file.display === "preview" && family() === "pdf" && url() !== ""}>
        <object
          class={c().pages}
          data={url()}
          type="application/pdf"
          aria-label={props.file.name}
          data-slot="editor-file-pages"
        >
          <p class={c().note}>{messages().fileNoPreview}</p>
        </object>
      </Show>
      {props.status}
      <Show when={(props.file.caption ?? "") !== ""}>
        <p class={c().caption} dir="auto" data-slot="editor-file-caption">
          {props.file.caption}
        </p>
      </Show>
      {props.actions}
      <Show when={viewing()}>
        <FileViewer file={props.file} url={url()} open={viewing()} onOpenChange={setViewing} />
      </Show>
    </div>
  );
}

/** Files chosen through the browser's own picker, for a command or a block menu with no form of its own. */
export function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.addEventListener("change", () => resolve([...(input.files ?? [])]), { once: true });
    input.addEventListener("cancel", () => resolve([]), { once: true });
    input.click();
  });
}

/** Puts `file` in the block's place, sent up the editor's queue, its first file kept as `origin`. */
export function replaceFile(editor: LexicalEditor, key: NodeKey, file: File): void {
  const uploads = editorUploads(editor);
  if (uploads === null) return;
  const [item] = uploads.queue.add([file]);
  if (item === undefined) return;
  updateBlockData<FileData>(editor, key, (data) => ({
    ...data,
    origin: data.origin ?? data.fileId ?? data.src,
    fileId: undefined,
    src: undefined,
    name: file.name,
    mime: file.type,
    bytes: file.size,
    uploadId: item.id,
  }));
}

interface CaptionPopoverProps {
  caption: string;
  onSave: (caption: string) => void;
}

function CaptionPopover(props: CaptionPopoverProps) {
  const messages = useArcMessages();
  const id = createUniqueId();
  const [open, setOpen] = createSignal(false, { ownedWrite: true });
  const [text, setText] = createSignal("", { ownedWrite: true });
  return (
    <ResponsiveOverlay
      heading={messages().fileCaption}
      desktop="popover"
      open={open()}
      onOpenChange={(next: boolean) => {
        if (next) setText(props.caption);
        setOpen(next);
      }}
      trigger={
        <Button variant="ghost" size="sm">
          <Pencil aria-hidden="true" />
          {messages().fileCaption}
        </Button>
      }
      footer={
        <Button type="submit" size="sm" form={`${id}-form`}>
          {messages().save}
        </Button>
      }
    >
      <form
        id={`${id}-form`}
        onSubmit={(event: SubmitEvent) => {
          event.preventDefault();
          props.onSave(text().trim());
          setOpen(false);
        }}
      >
        <Field>
          <FieldLabel for={id}>{messages().fileCaption}</FieldLabel>
          <Input
            id={id}
            dir="auto"
            autoFocus
            maxLength={1000}
            value={text()}
            onInput={(event: Event) => setText((event.currentTarget as HTMLInputElement).value)}
          />
        </Field>
      </form>
    </ResponsiveOverlay>
  );
}

function FileView(props: BlockProps<FileData>) {
  const messages = useArcMessages();
  const media = useEditorMedia();
  const inEditor = untrack(() => props.nodeKey) !== "";
  const editor = inEditor ? useLexicalEditor() : null;
  const uploads = inEditor ? useEditorUploads() : null;
  const [viewing, setViewing] = createSignal(false, { ownedWrite: true });
  function item() {
    return props.data.uploadId === undefined
      ? undefined
      : uploads?.queue.items().find((one) => one.id === props.data.uploadId);
  }
  function url(): string {
    return mediaAddress(props.data, media().fileUrl);
  }
  return (
    <FileCard
      file={props.data}
      options={editor === null ? undefined : looks.read(editor)}
      editable={props.editable}
      status={
        <Show when={item()}>
          {(upload: () => NonNullable<ReturnType<typeof item>>) => (
            <div class={fileBlockStyles().status} data-slot="editor-file-status">
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
                <span class={arc(layout.grow, fg.danger)} role="alert">
                  {upload().error ?? messages().uploadFailed(upload().file.name)}
                </span>
                <Button variant="ghost" size="sm" onPress={() => uploads?.queue.retry(upload().id)}>
                  {messages().retryUpload(upload().file.name)}
                </Button>
              </Show>
            </div>
          )}
        </Show>
      }
      actions={
        <Show when={props.editable && editor !== null}>
          <div class={fileBlockStyles().actions} data-slot="editor-file-actions">
            <Show when={url() !== "" && props.data.uploadId === undefined}>
              <Button variant="ghost" size="sm" onPress={() => setViewing(true)}>
                <Eye aria-hidden="true" />
                {messages().viewFile}
              </Button>
            </Show>
            <Show when={uploads !== null}>
              <Button
                variant="ghost"
                size="sm"
                onPress={() =>
                  void pickFiles("", false).then(([file]) => {
                    if (file !== undefined && editor !== null) {
                      replaceFile(editor, props.nodeKey, file);
                    }
                  })
                }
              >
                <FileUp aria-hidden="true" />
                {messages().newFileVersion}
              </Button>
            </Show>
            <CaptionPopover
              caption={props.data.caption ?? ""}
              onSave={(caption: string) =>
                props.setData({ caption: caption === "" ? undefined : caption })
              }
            />
            <Show when={viewing()}>
              <FileViewer
                file={props.data}
                url={url()}
                open={viewing()}
                onOpenChange={setViewing}
              />
            </Show>
          </div>
        </Show>
      }
    />
  );
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** A file as one line of HTML: a link to it, every field on the link, as an export writes it and markdown keeps it. */
export function fileHtml(file: FileData): string {
  const attributes = ["data-file", `href="${escapeAttribute(file.src ?? "")}"`];
  function add(name: string, value: string | number | undefined): void {
    if (value !== undefined && value !== "") {
      attributes.push(`${name}="${escapeAttribute(String(value))}"`);
    }
  }
  add("data-file-id", file.fileId);
  add("data-name", file.name);
  add("data-mime", file.mime);
  add("data-bytes", file.bytes > 0 ? file.bytes : undefined);
  add("data-caption", file.caption);
  add("data-display", file.display === "preview" ? "preview" : undefined);
  add("data-origin", file.origin);
  return `<a ${attributes.join(" ")}>${escapeText(file.name)}</a>`;
}

function fileFrom(
  attributes: Readonly<Record<string, string>>,
  text: string,
): BlockRead<FileData> | null {
  const src = attributes.href ?? "";
  const fileId = attributes["data-file-id"];
  if (src === "" && fileId === undefined) return null;
  const bytes = Number(attributes["data-bytes"] ?? 0);
  const display = attributes["data-display"] === "preview" ? "preview" : undefined;
  return {
    ...(src === "" ? {} : { src }),
    ...(fileId === undefined ? {} : { fileId }),
    name: attributes["data-name"] ?? text.trim(),
    mime: attributes["data-mime"] ?? "",
    bytes: Number.isFinite(bytes) ? bytes : 0,
    ...(attributes["data-caption"] === undefined ? {} : { caption: attributes["data-caption"] }),
    ...(display === undefined ? {} : { display }),
    ...(attributes["data-origin"] === undefined ? {} : { origin: attributes["data-origin"] }),
  };
}

const FILE_LINE = /^<a data-file(\s[^>]*)?>(.*?)<\/a>\s?$/;

/** A file in the document: a card to open or download it, with a PDF's pages where chosen. */
export const FileBlock: Block<FileData> = defineBlock<FileData>({
  type: "file",
  label: (messages) => messages.fileBlock,
  group: (messages) => messages.mediaBlocks,
  icon: () => <Paperclip />,
  keywords: ["attachment", "upload", "pdf", "document", "download"],
  defaultData: () => ({ name: "", mime: "", bytes: 0 }),
  component: FileView,
  insertable: false,
  toMarkdown: (data) => (data.uploadId === undefined ? fileHtml(data) : null),
  fromMarkdown: {
    regExp: FILE_LINE,
    data: (match) => fileFrom(attributesOf(match[1] ?? ""), match[2] ?? ""),
  },
  fromHtml: {
    a: (element) => {
      if (!element.hasAttribute("data-file")) return null;
      const attributes: Record<string, string> = {};
      for (const one of element.attributes) attributes[one.name] = one.value;
      return fileFrom(attributes, element.textContent ?? "");
    },
  },
  toHtml: (data) => {
    const template = document.createElement("template");
    template.innerHTML = fileHtml(data);
    return template.content.firstElementChild as HTMLElement;
  },
});

/** Whether a node is a file block. */
export function $isFileNode(node: LexicalNode | null | undefined): boolean {
  return $isBlockNode(node) && node.getType() === "file";
}

/** Files that are neither pictures nor Word documents, each a file block where the caret is, sent up the queue. */
export function insertFiles(editor: LexicalEditor, files: readonly File[]): void {
  const uploads = editorUploads(editor);
  if (uploads === null || files.length === 0) return;
  const items = uploads.queue.add(files);
  editor.update(() => {
    for (const item of items) {
      $insertBlock(
        FileBlock.$create({
          name: item.file.name,
          mime: item.file.type,
          bytes: item.file.size,
          uploadId: item.id,
        }),
      );
    }
  });
}

/** Whether a dropped file is this extension's: one no picture, recording or Word reader takes. */
function isPlainFile(file: File): boolean {
  return !/^(image|audio|video)\//.test(file.type) && !isWordFile(file);
}

function FileDrop() {
  const editor = useLexicalEditor();
  useRegistration(() =>
    editor.registerCommand(
      DRAG_DROP_PASTE,
      (files) => {
        const plain = files.filter(isPlainFile);
        if (plain.length === 0 || editorUploads(editor) === null) return false;
        insertFiles(editor, plain);
        return plain.length === files.length;
      },
      COMMAND_PRIORITY_LOW,
    ),
  );
  return null;
}

function displayWords(display: FileDisplay) {
  return (messages: ArcMessages) =>
    display === "preview" ? messages.fileShowPages : messages.fileShowCard;
}

/**
 * Files: offered, dropped and pasted where the editor uploads, each a card a
 * reader opens in the viewer or downloads; a PDF can show its pages; a new
 * version takes a file's place keeping the first as `origin`. Its look takes
 * `class` and `classes` in the editor and the renderer alike.
 */
export function fileExtension(options: FileOptions = {}): EditorExtension {
  return defineEditorExtension({
    name: "arc/file",
    dependencies: [FileBlock],
    register: (editor) => looks.provide(editor, options),
    commands: [
      {
        id: "file",
        label: (messages) => messages.fileBlock,
        group: (messages) => messages.mediaBlocks,
        icon: () => <Paperclip />,
        keywords: FileBlock.keywords,
        available: (editor) => editorUploads(editor) !== null,
        run: (editor) => void pickFiles("", true).then((files) => insertFiles(editor, files)),
      },
    ],
    blockMenu: [
      {
        id: "file-display",
        label: (messages) => messages.fileDisplay,
        $read: (block) => {
          if (!$isFileNode(block) || !$isBlockNode(block)) return null;
          const data = block.getData() as FileData;
          if (fileFamily(data.name, data.mime) !== "pdf") return null;
          return {
            value: data.display ?? "card",
            options: FILE_DISPLAYS.map((value) => ({ value, label: displayWords(value) })),
          };
        },
        $choose: (block, value) => {
          if (!$isBlockNode(block)) return;
          const data = block.getData() as FileData;
          block.setData({ ...data, display: value === "preview" ? "preview" : undefined });
        },
      },
    ],
    blockActions: [
      {
        id: "file-version",
        $label: (block) =>
          $isFileNode(block) ? (messages: ArcMessages) => messages.newFileVersion : null,
        run: (editor, key) =>
          void pickFiles("", false).then(([file]) => {
            if (file !== undefined) replaceFile(editor, key, file);
          }),
      },
    ],
    render: {
      file: (node, scope) => (
        <FileCard
          file={{
            ...(node as unknown as FileData),
            name: typeof node.name === "string" ? node.name : "",
            mime: typeof node.mime === "string" ? node.mime : "",
            bytes: typeof node.bytes === "number" ? node.bytes : 0,
          }}
          options={options}
          editable={scope.editing}
        />
      ),
    },
    plugins: [FileDrop],
  });
}
