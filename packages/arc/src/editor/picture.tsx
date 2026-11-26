import { For, Show, createSignal, createUniqueId, untrack } from "@barqjs/core";
import type { Child } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useLexicalEditor } from "@barqjs/lexical";
import { Image as ImageIcon } from "@barqjs/lucide/icons/image";
import { Pencil } from "@barqjs/lucide/icons/pencil";
import { RotateCcw } from "@barqjs/lucide/icons/rotate-ccw";
import { X } from "@barqjs/lucide/icons/x";
import { Button } from "@barqjs/ui/button";
import { Checkbox } from "@barqjs/ui/checkbox";
import { on } from "@barqjs/ui/conditions";
import { Field, FieldDescription, FieldLabel } from "@barqjs/ui/field";
import { Input } from "@barqjs/ui/input";
import { Label } from "@barqjs/ui/label";
import { Progress } from "@barqjs/ui/progress";
import type { RenderPart } from "@barqjs/ui/slot";
import { $dfs } from "@lexical/utils";
import type { ElementFormatType, LexicalEditor, LexicalNode, NodeKey } from "lexical";

import { IconButton } from "../components/icon-button.tsx";
import { Image } from "../components/image.tsx";
import { type ArcMessages, useArcMessages } from "../components/messages.ts";
import { ResponsiveOverlay } from "../components/responsive-overlay.tsx";
import type { UploadItem } from "../components/file-upload.tsx";
import { arcLayer as arc } from "../layer.ts";
import { type Classes, type Customisable, parts, rendered } from "../lib/parts.ts";
import { bg, edge, fg, gap, layout, place, rounded, space, square, type } from "../style/index.ts";
import { blockOptions } from "./block-options.ts";
import {
  $isBlockNode,
  type Block,
  type BlockProps,
  type BlockRead,
  defineBlock,
  updateBlockData,
} from "./blocks.tsx";
import type { BlockMenuChoice, Label as Words } from "./extension.ts";
import {
  LabelledPicture,
  type PictureLabel,
  PictureLabelsEditor,
  spotFrame,
  spotMarker,
  spotPicture,
} from "./picture-labels.tsx";
import { type PictureCredit, mediaAddress, useEditorMedia, useEditorUploads } from "./media.tsx";
import { blockGap } from "./theme.ts";

/** How wide a picture, a recording or an embed is drawn, as a share of the column on a wide screen. */
export const IMAGE_SIZES = ["small", "medium", "large", "full"] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];

/** Where a block narrower than the column sits; the sides follow the reading direction. */
export const BLOCK_ALIGNMENTS = ["start", "center", "end"] as const;
export type BlockAlignment = (typeof BLOCK_ALIGNMENTS)[number];

export type { PictureCredit } from "./media.tsx";

/** Where a picture's subject sits, in percent across and down, so a crop of it keeps it in view. */
export interface PictureFocus {
  x: number;
  y: number;
}

export interface ImageData {
  /** A file the app keeps, by its id, its address from `EditorMedia.fileUrl`. */
  fileId?: string;
  /** The picture's address, for one the app does not keep. */
  src?: string;
  alt: string;
  /** Only decorates, so a screen reader passes it by. */
  decorative?: boolean;
  caption: string;
  size: ImageSize;
  /** Places named on the picture, numbered in order. */
  labels?: PictureLabel[];
  credit?: PictureCredit;
  focus?: PictureFocus;
  width?: number;
  height?: number;
  /** While the file is on its way: the upload queue's id for it. */
  uploadId?: string;
}

export const pictureStyles = variants({
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
    credit: arc(type.caption, fg.muted, layout.flush, {
      textAlign: "center",
      "& a": { color: "inherit", textUnderlineOffset: "2px" },
    }),
    warning: arc(type.caption, fg.tone, {
      textAlign: "center",
      "--arc-tone-foreground": "var(--warning-foreground)",
    }),
    details: arc(layout.row, layout.end),
  },
  variants: {
    size: {
      small: { figure: arc({ width: { default: "100%", [on.sm]: "33.333%" } }) },
      medium: { figure: arc({ width: { default: "100%", [on.sm]: "50%" } }) },
      large: { figure: arc({ width: { default: "100%", [on.sm]: "75%" } }) },
      full: { figure: arc({ width: "100%" }) },
    },
    align: {
      start: { figure: arc({ marginInlineEnd: "auto" }) },
      center: { figure: arc({ marginInline: "auto" }) },
      end: { figure: arc({ marginInlineStart: "auto" }) },
    },
  },
  defaults: { size: "full", align: "center" },
});

type PictureSlots = ReturnType<typeof pictureStyles>;

export const pictureDetailsStyles = variants({
  slots: {
    form: arc(layout.column, gap[3]),
    option: arc(layout.row, gap[2]),
    credit: arc(layout.column, gap[3], edge.none, layout.flush, place.unpadded),
    legend: arc(type.label, { marginBlockEnd: space.x1 }),
    focusStage: arc(spotFrame, edge.all, { cursor: "crosshair" }),
    focusPicture: arc(spotPicture, { maxHeight: "11rem" }),
    focusDot: arc(spotMarker, square.x6, rounded.full, bg.primary),
  },
});

/** A picture's look: a class on each figure, a class per part, its caption drawn by the app. */
export interface PictureOptions extends Customisable<PictureSlots> {
  /** The caption under a picture, read-only. */
  renders?: PictureRenders;
}

export interface PictureRenders {
  caption?: RenderPart<Child>;
}

/** Each editor's picture look, from the extension that holds it. */
export const pictureLooks = blockOptions<PictureOptions>();

/** The address a picture, a file or a recording is drawn from: its own, or the app's for its file. */
export function pictureAddress(data: ImageData, fileUrl: ((id: string) => string) | undefined) {
  return mediaAddress(data, fileUrl);
}

/** Whether a picture shown still lacks the words a reader who cannot see it needs. */
export function pictureNeedsAlt(data: ImageData): boolean {
  return data.decorative !== true && data.alt.trim() === "" && data.uploadId === undefined;
}

/** Licences a picture is often shared under, linked to their terms. */
export const PICTURE_LICENCES: readonly PictureLicence[] = [
  { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
  { name: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" },
  { name: "CC BY-NC 4.0", url: "https://creativecommons.org/licenses/by-nc/4.0/" },
  { name: "CC BY-NC-SA 4.0", url: "https://creativecommons.org/licenses/by-nc-sa/4.0/" },
  { name: "CC0 1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/" },
];

export interface PictureLicence {
  name: string;
  url: string;
}

function isHttps(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * A picture's credit as it is written: none until it names someone or a
 * licence; a licence it knows linked to its terms, and a licence that came
 * with its own terms link, as a picture from an open collection does, keeps
 * it until its name changes; a source only once it is an https address.
 */
export function creditOf(
  before: PictureCredit | null | undefined,
  author: string,
  licence: string,
  source: string,
): PictureCredit | undefined {
  if (author.trim() === "" && licence.trim() === "") return undefined;
  const terms =
    before?.licence === licence
      ? before.licenceUrl
      : PICTURE_LICENCES.find((item) => item.name === licence.trim())?.url;
  return {
    author,
    licence,
    ...(terms === undefined ? {} : { licenceUrl: terms }),
    ...(isHttps(source.trim()) ? { source: source.trim() } : {}),
  };
}

/** The site a credited picture came from, named as it names itself. */
export function creditSource(credit: PictureCredit): string {
  if (credit.source === undefined || credit.source === "") return "";
  let host: string;
  try {
    host = new URL(credit.source).hostname;
  } catch {
    return "";
  }
  if (host.endsWith("commons.wikimedia.org")) return "Wikimedia Commons";
  if (host.endsWith(".wikipedia.org")) return "Wikipedia";
  return host.replace(/^www\./, "");
}

export interface CreditLineProps {
  credit: PictureCredit;
  class?: string;
}

/** A picture's credit under it, as its licence asks: who made it, the licence linked to its terms, and where it came from. */
export function CreditLine(props: CreditLineProps) {
  function pieces(): readonly CreditPiece[] {
    const credit = props.credit;
    const out: CreditPiece[] = [];
    if (credit.author.trim() !== "") out.push({ kind: "author", text: credit.author });
    if (credit.licence.trim() !== "") {
      out.push({ kind: "licence", text: credit.licence, href: credit.licenceUrl });
    }
    const site = creditSource(credit);
    if (site !== "") out.push({ kind: "source", text: site, href: credit.source });
    return out;
  }
  return (
    <p class={props.class} data-slot="editor-image-credit">
      <For each={pieces()}>
        {(piece: CreditPiece, index: () => number) => (
          <>
            {index() > 0 ? " · " : null}
            <Show when={piece.href} fallback={<bdi>{piece.text}</bdi>}>
              {(href: () => string) => (
                <a
                  href={href()}
                  target="_blank"
                  rel={
                    piece.kind === "licence" ? "license noopener noreferrer" : "noopener noreferrer"
                  }
                >
                  {piece.text}
                </a>
              )}
            </Show>
          </>
        )}
      </For>
    </p>
  );
}

interface CreditPiece {
  kind: "author" | "licence" | "source";
  text: string;
  href?: string;
}

function percent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

const NUDGE: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export interface FocusPickerProps {
  src: string;
  value: PictureFocus | undefined;
  onChange: (focus: PictureFocus) => void;
  /** Names the dot, which says where it is. */
  label: (focus: PictureFocus) => string;
  hint?: string;
  classes?: Classes<ReturnType<typeof pictureDetailsStyles>>;
}

/**
 * The spot every crop of a picture keeps in view, set by pressing or dragging
 * on the picture, or by moving the dot with the arrow keys, five points a
 * press and one with Shift. Left and right are the picture's, whatever the
 * page's direction, since the picture does not turn round.
 */
export function FocusPicker(props: FocusPickerProps) {
  const hintId = createUniqueId();
  function cls() {
    return parts(pictureDetailsStyles(), props.classes);
  }
  function value(): PictureFocus {
    return props.value ?? { x: 50, y: 50 };
  }
  function placeAt(event: PointerEvent): void {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    props.onChange({
      x: percent(((event.clientX - box.left) / box.width) * 100),
      y: percent(((event.clientY - box.top) / box.height) * 100),
    });
  }
  return (
    <div class={arc(layout.column, gap[1])} data-slot="focus-picker">
      <div
        class={cls().focusStage}
        dir="ltr"
        data-slot="focus-picker-stage"
        onPointerDown={(event: PointerEvent) => {
          (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
          placeAt(event);
        }}
        onPointerMove={(event: PointerEvent) => {
          if ((event.currentTarget as HTMLElement).hasPointerCapture?.(event.pointerId) ?? false) {
            placeAt(event);
          }
        }}
      >
        <img class={cls().focusPicture} src={props.src} alt="" draggable={false} />
        <button
          type="button"
          class={cls().focusDot}
          data-slot="focus-picker-dot"
          aria-label={props.label(value())}
          aria-describedby={props.hint === undefined ? undefined : hintId}
          style={{ left: `${String(value().x)}%`, top: `${String(value().y)}%` }}
          onKeyDown={(event: KeyboardEvent) => {
            const step = NUDGE[event.key];
            if (step === undefined) return;
            event.preventDefault();
            const by = event.shiftKey ? 1 : 5;
            props.onChange({
              x: percent(value().x + step[0] * by),
              y: percent(value().y + step[1] * by),
            });
          }}
        />
      </div>
      <Show when={props.hint}>
        <FieldDescription id={hintId}>{props.hint}</FieldDescription>
      </Show>
    </div>
  );
}

interface PictureDetailsProps {
  data: ImageData;
  src: string;
  setData: BlockProps<ImageData>["setData"];
}

/** A picture's words and where it came from: alt text or decorative, caption, credit, focus point and labels. */
function PictureDetails(props: PictureDetailsProps) {
  const messages = useArcMessages();
  const formId = createUniqueId();
  const ids = {
    alt: createUniqueId(),
    decorative: createUniqueId(),
    caption: createUniqueId(),
    author: createUniqueId(),
    licence: createUniqueId(),
    licences: createUniqueId(),
    source: createUniqueId(),
  };
  const [open, setOpen] = createSignal(false, { ownedWrite: true });
  const [alt, setAlt] = createSignal("", { ownedWrite: true });
  const [decorative, setDecorative] = createSignal(false, { ownedWrite: true });
  const [caption, setCaption] = createSignal("", { ownedWrite: true });
  const [author, setAuthor] = createSignal("", { ownedWrite: true });
  const [licence, setLicence] = createSignal("", { ownedWrite: true });
  const [source, setSource] = createSignal("", { ownedWrite: true });
  const [spot, setSpot] = createSignal<PictureFocus | undefined>(undefined, { ownedWrite: true });
  const [labels, setLabels] = createSignal<readonly PictureLabel[]>([], { ownedWrite: true });
  function change(next: boolean): void {
    if (next) {
      const data = props.data;
      setAlt(data.alt);
      setDecorative(data.decorative === true);
      setCaption(data.caption);
      setAuthor(data.credit?.author ?? "");
      setLicence(data.credit?.licence ?? "");
      setSource(data.credit?.source ?? "");
      setSpot(data.focus);
      setLabels(data.labels ?? []);
    }
    setOpen(next);
  }
  function value(event: Event): string {
    return (event.currentTarget as HTMLInputElement).value;
  }
  return (
    <ResponsiveOverlay
      heading={messages().imageDetails}
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
        class={pictureDetailsStyles().form}
        onSubmit={(event: SubmitEvent) => {
          event.preventDefault();
          const credit = creditOf(props.data.credit, author(), licence(), source());
          const decor = decorative();
          const marked = labels();
          props.setData((data) => ({
            ...data,
            alt: alt().trim(),
            caption: caption().trim(),
            decorative: decor ? true : undefined,
            credit,
            focus: spot(),
            labels: marked.length > 0 ? [...marked] : undefined,
          }));
          setOpen(false);
        }}
      >
        <Show when={!decorative()}>
          <Field>
            <FieldLabel for={ids.alt}>{messages().altText}</FieldLabel>
            <Input
              id={ids.alt}
              autoFocus
              dir="auto"
              value={alt()}
              maxLength={500}
              aria-describedby={`${ids.alt}-hint`}
              onInput={(event: Event) => setAlt(value(event))}
            />
            <FieldDescription id={`${ids.alt}-hint`}>{messages().altTextHint}</FieldDescription>
          </Field>
        </Show>
        <span class={pictureDetailsStyles().option}>
          <Checkbox id={ids.decorative} checked={decorative()} onCheckedChange={setDecorative} />
          <Label for={ids.decorative}>{messages().imageDecorative}</Label>
        </span>
        <Field>
          <FieldLabel for={ids.caption}>{messages().imageCaption}</FieldLabel>
          <Input
            id={ids.caption}
            dir="auto"
            value={caption()}
            maxLength={1000}
            onInput={(event: Event) => setCaption(value(event))}
          />
        </Field>
        <fieldset class={pictureDetailsStyles().credit}>
          <legend class={pictureDetailsStyles().legend}>{messages().imageCredit}</legend>
          <Field>
            <FieldLabel for={ids.author}>{messages().imageCreditAuthor}</FieldLabel>
            <Input
              id={ids.author}
              dir="auto"
              value={author()}
              maxLength={300}
              onInput={(event: Event) => setAuthor(value(event))}
            />
          </Field>
          <Field>
            <FieldLabel for={ids.licence}>{messages().imageCreditLicence}</FieldLabel>
            <Input
              id={ids.licence}
              dir="auto"
              value={licence()}
              maxLength={120}
              list={ids.licences}
              onInput={(event: Event) => setLicence(value(event))}
            />
            <datalist id={ids.licences}>
              <option value={messages().imageCreditAllRights} />
              <For each={PICTURE_LICENCES}>
                {(item: PictureLicence) => <option value={item.name} />}
              </For>
              <option value={messages().imageCreditPublicDomain} />
            </datalist>
          </Field>
          <Field>
            <FieldLabel for={ids.source}>{messages().imageCreditSource}</FieldLabel>
            <Input
              id={ids.source}
              type="url"
              dir="ltr"
              inputMode="url"
              value={source()}
              maxLength={500}
              onInput={(event: Event) => setSource(value(event))}
            />
          </Field>
        </fieldset>
        <Show when={props.src !== ""}>
          <Field>
            <FieldLabel>{messages().imageFocus}</FieldLabel>
            <FocusPicker
              src={props.src}
              value={spot()}
              onChange={setSpot}
              label={(at: PictureFocus) => messages().imageFocusAt(at.x, at.y)}
              hint={messages().imageFocusHint}
            />
          </Field>
          <PictureLabelsEditor
            src={props.src}
            alt={decorative() ? "" : alt()}
            labels={labels()}
            onChange={setLabels}
          />
        </Show>
      </form>
    </ResponsiveOverlay>
  );
}

export interface PictureFigureProps {
  data: ImageData;
  format: ElementFormatType;
  options: PictureOptions | undefined;
  editable: boolean;
  /** Drawn inside the frame, over the picture: an upload's progress. */
  status?: Child;
  /** Under the picture while it is edited. */
  details?: Child;
}

export function alignmentOf(format: ElementFormatType): BlockAlignment {
  if (format === "start" || format === "left") return "start";
  if (format === "end" || format === "right") return "end";
  return "center";
}

/** A picture drawn as a document shows it: at its size and place, its labels, caption and credit. */
export function PictureFigure(props: PictureFigureProps) {
  const messages = useArcMessages();
  const media = useEditorMedia();
  function cls(): PictureSlots {
    return parts(
      pictureStyles({ size: props.data.size, align: alignmentOf(props.format) }),
      props.options?.classes,
    );
  }
  function src(): string {
    return pictureAddress(props.data, media().fileUrl);
  }
  function alt(): string {
    return props.data.decorative === true ? "" : props.data.alt;
  }
  function caption(): Child {
    const render = props.options?.renders?.caption;
    return render === undefined ? (
      <figcaption class={cls().caption} data-slot="editor-image-caption" dir="auto">
        {props.data.caption}
      </figcaption>
    ) : (
      rendered(
        render,
        { class: cls().caption, "data-slot": "editor-image-caption", dir: "auto" },
        props.data.caption,
      )
    );
  }
  return (
    <figure
      class={arc(cls().figure, props.options?.class, props.options?.className)}
      data-slot="editor-image"
      data-size={props.data.size}
      data-align={alignmentOf(props.format)}
    >
      <LabelledPicture
        labels={props.data.labels ?? []}
        interactive={!props.editable}
        frameClass={cls().frame}
        overlay={props.status}
      >
        <Image
          src={src()}
          alt={alt()}
          width={props.data.width}
          height={props.data.height}
          fit="contain"
        />
      </LabelledPicture>
      {props.details}
      <Show when={props.editable && pictureNeedsAlt(props.data)}>
        <p class={cls().warning} data-slot="editor-image-alt-missing">
          {messages().imageAltMissing}
        </p>
      </Show>
      <Show when={props.data.caption !== ""}>{caption()}</Show>
      <Show when={props.data.credit}>
        {(credit: () => PictureCredit) => <CreditLine credit={credit()} class={cls().credit} />}
      </Show>
    </figure>
  );
}

function PictureView(props: BlockProps<ImageData>) {
  const messages = useArcMessages();
  const media = useEditorMedia();
  // The renderer draws a picture with no editor, and so no queue, around it.
  const inEditor = untrack(() => props.nodeKey) !== "";
  const editor = inEditor ? useLexicalEditor() : null;
  const uploads = inEditor ? useEditorUploads() : null;
  function item(): UploadItem | undefined {
    return props.data.uploadId === undefined
      ? undefined
      : uploads?.queue.items().find((one) => one.id === props.data.uploadId);
  }
  function cls(): PictureSlots {
    return pictureStyles();
  }
  return (
    <PictureFigure
      data={props.data}
      format={props.format}
      options={editor === null ? undefined : pictureLooks.read(editor)}
      editable={props.editable}
      status={
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
                  {upload().error ?? messages().uploadFailed(upload().file.name)}
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
      }
      details={
        <Show when={props.editable && props.data.uploadId === undefined}>
          <div class={cls().details} data-slot="editor-image-actions">
            <PictureDetails
              data={props.data}
              src={pictureAddress(props.data, media().fileUrl)}
              setData={props.setData}
            />
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

function unescapeAttribute(value: string): string {
  return value
    .replaceAll("&#10;", "\n")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** An element's attributes as written in a line of markup, unescaped. */
export function attributesOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)(?:\s*=\s*"([^"]*)")?/g)) {
    const name = match[1];
    if (name !== undefined) out[name.toLowerCase()] = unescapeAttribute(match[2] ?? "");
  }
  return out;
}

function json(text: string | undefined): unknown {
  if (text === undefined || text === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function sizeOf(value: string | undefined): ImageSize {
  return IMAGE_SIZES.find((size) => size === value) ?? "full";
}

function focusOf(value: string | undefined): PictureFocus | undefined {
  const [x, y] = (value ?? "").split(/[\s,]+/).map(Number);
  return x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)
    ? undefined
    : { x: percent(x), y: percent(y) };
}

/** Whether a picture keeps more than markdown's `![alt](src "caption")` says. */
function needsFigure(data: ImageData): boolean {
  return (
    data.size !== "full" ||
    data.fileId !== undefined ||
    data.decorative === true ||
    data.credit !== undefined ||
    data.focus !== undefined ||
    (data.labels?.length ?? 0) > 0
  );
}

/**
 * A picture as one line of HTML: a figure holding its image and caption,
 * every other field on the figure, as an HTML export writes it and markdown
 * keeps what it has no syntax for.
 */
export function pictureHtml(data: ImageData, align: BlockAlignment = "center"): string {
  const figure: string[] = ["figure", "data-image"];
  if (data.size !== "full") figure.push(`data-size="${data.size}"`);
  if (align !== "center") figure.push(`data-align="${align}"`);
  if (data.credit !== undefined) {
    figure.push(`data-credit="${escapeAttribute(JSON.stringify(data.credit))}"`);
  }
  if (data.focus !== undefined) {
    figure.push(`data-focus="${String(data.focus.x)} ${String(data.focus.y)}"`);
  }
  if ((data.labels?.length ?? 0) > 0) {
    figure.push(`data-labels="${escapeAttribute(JSON.stringify(data.labels))}"`);
  }
  const image: string[] = ["img", `src="${escapeAttribute(data.src ?? "")}"`];
  image.push(`alt="${escapeAttribute(data.decorative === true ? "" : data.alt)}"`);
  if (data.fileId !== undefined) image.push(`data-file-id="${escapeAttribute(data.fileId)}"`);
  if (data.decorative === true) image.push("data-decorative");
  if (data.width !== undefined) image.push(`width="${String(data.width)}"`);
  if (data.height !== undefined) image.push(`height="${String(data.height)}"`);
  const caption = data.caption === "" ? "" : `<figcaption>${escapeText(data.caption)}</figcaption>`;
  return `<${figure.join(" ")}><${image.join(" ")}>${caption}</figure>`;
}

/** A picture's data from its figure's and its image's attributes and its caption. */
function pictureFrom(
  figure: Readonly<Record<string, string>>,
  image: Readonly<Record<string, string>>,
  caption: string,
): BlockRead<ImageData> | null {
  const src = image.src ?? "";
  const fileId = image["data-file-id"];
  const uploadId = image["data-upload-id"];
  if (src === "" && fileId === undefined && uploadId === undefined) return null;
  const width = Number(image.width);
  const height = Number(image.height);
  const credit = json(figure["data-credit"]) as PictureCredit | undefined;
  const labels = json(figure["data-labels"]) as PictureLabel[] | undefined;
  const spot = focusOf(figure["data-focus"]);
  const align = BLOCK_ALIGNMENTS.find((one) => one === figure["data-align"]);
  return {
    ...(align === undefined || align === "center" ? {} : { format: align }),
    ...(src === "" ? {} : { src }),
    ...(fileId === undefined ? {} : { fileId }),
    alt: image.alt ?? "",
    ...("data-decorative" in image ? { decorative: true } : {}),
    caption: caption.trim(),
    size: sizeOf(figure["data-size"] ?? image["data-size"]),
    ...(Array.isArray(labels) && labels.length > 0 ? { labels } : {}),
    ...(credit === undefined ? {} : { credit }),
    ...(spot === undefined ? {} : { focus: spot }),
    ...(width > 0 ? { width } : {}),
    ...(height > 0 ? { height } : {}),
    ...(uploadId === undefined ? {} : { uploadId }),
  };
}

function attributesOfElement(element: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const attribute of element.attributes) out[attribute.name] = attribute.value;
  return out;
}

const FIGURE_LINE =
  /^<figure data-image(\s[^>]*)?>\s*<img(\s[^>]*)?>(?:<figcaption>(.*?)<\/figcaption>)?<\/figure>\s*$/;
const IMAGE_LINE = /^!\[((?:\\.|[^\]\\])*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s?$/;

function escapeAlt(text: string): string {
  return text.replace(/[[\]\\]/g, "\\$&");
}

/** A picture in the document: uploaded, pasted, dropped, linked or kept by the app. */
export const ImageBlock: Block<ImageData> = defineBlock<ImageData>({
  type: "image",
  label: (messages) => messages.image,
  group: (messages) => messages.mediaBlocks,
  icon: () => <ImageIcon />,
  keywords: ["picture", "photo", "upload"],
  defaultData: () => ({ alt: "", caption: "", size: "full" }),
  component: PictureView,
  insertable: false,
  toMarkdown: (data, format) => {
    if (data.uploadId !== undefined) return null;
    const align = alignmentOf(format);
    if (needsFigure(data) || align !== "center") return pictureHtml(data, align);
    if ((data.src ?? "") === "") return null;
    return `![${escapeAlt(data.alt)}](${data.src ?? ""}${data.caption === "" ? "" : ` "${data.caption.replaceAll('"', "'")}"`})`;
  },
  fromMarkdown: {
    regExp:
      /^(?:!\[(?:\\.|[^\]\\])*\]\([^)\s]+(?:\s+"[^"]*")?\)|<figure data-image(?:\s[^>]*)?>.*<\/figure>)\s?$/,
    data: (match) => {
      const line = match[0] ?? "";
      const figure = FIGURE_LINE.exec(line);
      if (figure !== null) {
        return pictureFrom(
          attributesOf(figure[1] ?? ""),
          attributesOf(figure[2] ?? ""),
          unescapeAttribute(figure[3] ?? ""),
        );
      }
      const image = IMAGE_LINE.exec(line);
      if (image === null) return null;
      return {
        alt: (image[1] ?? "").replace(/\\(.)/g, "$1"),
        src: image[2] ?? "",
        caption: image[3] ?? "",
        size: "full",
      };
    },
  },
  fromHtml: {
    figure: (element) => {
      const image = element.querySelector("img");
      if (image === null) return null;
      return pictureFrom(
        attributesOfElement(element),
        attributesOfElement(image),
        element.querySelector("figcaption")?.textContent ?? "",
      );
    },
    img: (element) => {
      // A picture of a figure is read with it.
      if (element.closest("figure") !== null) return null;
      return pictureFrom({}, attributesOfElement(element), "");
    },
  },
  toHtml: (data, format) => {
    const template = document.createElement("template");
    template.innerHTML = pictureHtml(data, alignmentOf(format));
    return template.content.firstElementChild as HTMLElement;
  },
});

/** Whether a node is a picture. */
export function $isImageNode(node: LexicalNode | null | undefined): boolean {
  return $isBlockNode(node) && node.getType() === "image";
}

/** A block, or a picture of a set, whose file is on its way, with the address it will have. */
interface Uploading {
  uploadId?: string;
  src?: string;
  pictures?: Uploading[];
}

function waitsFor(data: Uploading | null, id: string): boolean {
  return data?.uploadId === id || (data?.pictures?.some((one) => one.uploadId === id) ?? false);
}

function landed<Data extends Uploading>(data: Data, item: UploadItem): Data {
  if (data.uploadId !== item.id) return data;
  return {
    ...data,
    src: typeof item.result === "string" ? item.result : data.src,
    uploadId: undefined,
  };
}

/**
 * Every block still waiting on an upload that finished, a set's pictures
 * among them: its address replaces the preview it showed meanwhile.
 */
export function settleUpload(editor: LexicalEditor, item: UploadItem): void {
  const keys: NodeKey[] = editor.read(() =>
    $dfs()
      .map((entry) => entry.node)
      .filter((node) => $isBlockNode(node) && waitsFor(node.getData() as Uploading | null, item.id))
      .map((node) => node.getKey()),
  );
  for (const key of keys) {
    updateBlockData<Uploading>(editor, key, (data) => {
      const own = landed(data, item);
      return own.pictures === undefined
        ? own
        : { ...own, pictures: own.pictures.map((one) => landed(one, item)) };
    });
  }
}

function sizeWords(size: ImageSize): Words {
  return (messages: ArcMessages) => messages.imageSizeName(size);
}

function alignWords(align: BlockAlignment): Words {
  return (messages: ArcMessages) =>
    align === "start"
      ? messages.alignStart
      : align === "end"
        ? messages.alignEnd
        : messages.alignCenter;
}

/** A media block's data, read for its size. */
interface Sized {
  size?: ImageSize;
}

/** The size and alignment choices of a block menu, for the media blocks that have them. */
export function sizeAndAlignment(is: (block: LexicalNode) => boolean): BlockMenuChoice[] {
  return [
    {
      id: "media-size",
      label: (messages: ArcMessages) => messages.imageSize,
      $read: (block: LexicalNode) => {
        if (!is(block) || !$isBlockNode(block)) return null;
        const data = block.getData() as Sized;
        return {
          value: data.size ?? "full",
          options: IMAGE_SIZES.map((value) => ({ value, label: sizeWords(value) })),
        };
      },
      $choose: (block: LexicalNode, value: string) => {
        if (!$isBlockNode(block)) return;
        block.setData({ ...(block.getData() as object), size: sizeOf(value) });
      },
    },
    {
      id: "media-alignment",
      label: (messages: ArcMessages) => messages.alignment,
      $read: (block: LexicalNode) => {
        if (!is(block) || !$isBlockNode(block)) return null;
        // A block as wide as the column has nowhere to go.
        if ((block.getData() as Sized).size === "full") return null;
        return {
          value: alignmentOf(block.getFormat()),
          options: BLOCK_ALIGNMENTS.map((value) => ({ value, label: alignWords(value) })),
        };
      },
      $choose: (block: LexicalNode, value: string) => {
        if ($isBlockNode(block)) {
          block.setFormat(value === "center" ? "" : (value as ElementFormatType));
        }
      },
    },
  ];
}
