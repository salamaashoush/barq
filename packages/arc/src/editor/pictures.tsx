import { For, Show, createSignal, createUniqueId, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { FileTrigger } from "@barqjs/aria/file-trigger";
import { useDirection, useLocale } from "@barqjs/aria/i18n";
import { useLexicalEditor } from "@barqjs/lexical";
import { ArrowLeft } from "@barqjs/lucide/icons/arrow-left";
import { ArrowRight } from "@barqjs/lucide/icons/arrow-right";
import { Columns2 } from "@barqjs/lucide/icons/columns-2";
import { ImagePlus } from "@barqjs/lucide/icons/image-plus";
import { Images } from "@barqjs/lucide/icons/images";
import { Pencil } from "@barqjs/lucide/icons/pencil";
import { X } from "@barqjs/lucide/icons/x";
import { Button } from "@barqjs/ui/button";
import { Field, FieldLabel } from "@barqjs/ui/field";
import { Input } from "@barqjs/ui/input";
import { tokens } from "@barqjs/ui/theme/tokens";
import type { JSX } from "@barqjs/web";
import type { LexicalEditor } from "lexical";

import { Gallery, type GalleryImage, galleryStyles } from "../components/gallery.tsx";
import { Image } from "../components/image.tsx";
import { type ArcMessages, useArcMessages } from "../components/messages.ts";
import { ResponsiveOverlay } from "../components/responsive-overlay.tsx";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  edge,
  fg,
  focus,
  gap,
  interaction,
  layout,
  place,
  rounded,
  space,
  type,
} from "../style/index.ts";
import { blockOptions } from "./block-options.ts";
import { type Block, type BlockProps, defineBlock } from "./blocks.tsx";
import { $insertBlock } from "./commands.ts";
import { ownInput } from "./hooks.ts";
import { type EditorExtension, defineEditorExtension } from "./extension.ts";
import { type MediaAddressed, editorUploads, mediaAddress, useEditorMedia } from "./media.tsx";
import { attributesOf } from "./picture.tsx";
import { blockGap } from "./theme.ts";

/** One picture of a gallery, or one side of a before and after. */
export interface SetPicture extends MediaAddressed {
  alt: string;
  caption?: string;
  /** While the file is on its way: the upload queue's id for it. */
  uploadId?: string;
}

/** A gallery's pictures, or a before and after's two, in order. */
export interface PicturesData {
  pictures: SetPicture[];
}

/** Pictures in one gallery. */
export const MAX_GALLERY_PICTURES = 24;

/** A badge over a picture, out of the pointer's way: a side's name, a tile's number. */
const overPicture = arc(place.passive, type.caption, bg.card, rounded.sm);

export const picturesStyles = variants({
  slots: {
    root: arc(layout.column, gap[2], layout.flush, layout.relative, blockGap),
    grid: arc(galleryStyles().root, { "--arc-gallery-min": "9rem" }),
    tile: arc(layout.column, gap[1]),
    warning: arc(type.caption, fg.muted, { textAlign: "center" }),
    caption: arc(type.caption, fg.muted, { textAlign: "center" }),
    actions: arc(layout.row, layout.end, gap[2]),
    empty: arc(layout.centre, edge.all, rounded.lg, place.padded, fg.muted, {
      borderStyle: "dashed",
    }),
    compare: arc(layout.relative, rounded.lg, layout.clip, place.block, {
      "--split": "50%",
      touchAction: "pan-y",
    }),
    after: arc(place.block, layout.fill),
    before: arc(place.cover, {
      clipPath: "inset(0 calc(100% - var(--split)) 0 0)",
    }),
    line: arc(place.passive, {
      insetBlock: "0",
      insetInlineStart: "var(--split)",
      inlineSize: "2px",
      translate: "-1px 0",
      backgroundColor: tokens.background,
    }),
    label: arc(overPicture, {
      top: space.x2,
      paddingInline: space.x1_5,
      "[data-side=before]": { insetInlineStart: space.x2 },
      "[data-side=after]": { insetInlineEnd: space.x2 },
    }),
    range: arc(place.cover, layout.fill, {
      margin: "0px",
      opacity: "0",
      cursor: "ew-resize",
      height: "100%",
    }),
    sides: arc(layout.row, layout.wrap, gap[3], {
      alignItems: "start",
      "& > *": { flex: "1 1 12rem" },
    }),
  },
});

type PicturesSlots = ReturnType<typeof picturesStyles>;

export const picturesFormStyles = variants({
  slots: {
    form: arc(layout.column, gap[4]),
    tiles: arc(galleryStyles().root, { "--arc-gallery-min": "6.5rem" }),
    tile: arc(layout.relative, rounded.md, layout.clip, bg.muted, interaction.draggable, {
      aspectRatio: "1",
      "[data-chosen]": { outline: `2px solid ${tokens.primary}`, outlineOffset: "2px" },
      "[data-over]": { outline: `2px solid ${tokens.ring}`, outlineOffset: "2px" },
      "[data-dragging]": { opacity: "0.5" },
    }),
    tileButton: arc(focus.visible, place.cover, place.unpadded, edge.none, bg.transparent, {
      display: "block",
      cursor: "inherit",
    }),
    number: arc(overPicture, type.numeric, {
      top: space.x1,
      insetInlineStart: space.x1,
      paddingInline: space.x1,
    }),
    side: arc(layout.column, gap[3]),
    preview: arc(rounded.md, bg.muted, { maxHeight: "12rem" }),
    hint: arc(type.caption, fg.muted),
    row: arc(layout.row, layout.wrap, gap[2]),
    sides: arc({
      display: "grid",
      gap: space.x4,
      gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 14rem), 1fr))",
    }),
    fieldset: arc(layout.column, gap[3], edge.none, layout.flush, place.unpadded),
    legend: arc(type.label, { marginBlockEnd: space.x1 }),
  },
});

/** How a gallery or a before and after looks: a class on each, and a class per part. */
export type PicturesOptions = Customisable<PicturesSlots>;

const looks = blockOptions<PicturesOptions>();

function cls(options: PicturesOptions | undefined): PicturesSlots {
  return parts(picturesStyles(), options?.classes);
}

function srcOf(picture: SetPicture, fileUrl: ((id: string) => string) | undefined): string {
  return mediaAddress(picture, fileUrl);
}

/** Every picture of a set that is drawn: those with an address. */
function shownOf(
  pictures: readonly SetPicture[],
  fileUrl: ((id: string) => string) | undefined,
  unnamed: (index: number, total: number) => string,
): GalleryImage[] {
  const drawn = pictures.filter((picture) => srcOf(picture, fileUrl) !== "");
  return drawn.map((picture, index) => ({
    src: srcOf(picture, fileUrl),
    // Each picture opens the viewer from a button its words name.
    alt: picture.alt.trim() || picture.caption?.trim() || unnamed(index, drawn.length),
    caption: picture.caption === "" ? undefined : picture.caption,
  }));
}

function digits(locale: string): Intl.NumberFormat {
  return new Intl.NumberFormat(locale);
}

interface UploadedPictures {
  /** Sends files up the editor's queue and answers the pictures that show them meanwhile. */
  add: (files: readonly File[]) => SetPicture[];
  /** The pictures with the address of each whose upload has finished, as the block keeps them. */
  settled: (pictures: readonly SetPicture[]) => SetPicture[];
  available: boolean;
}

/** The editor's upload queue, for pictures added to a set. */
function usePictureUploads(): UploadedPictures {
  const editor = useLexicalEditor();
  const uploads = editorUploads(editor);
  return {
    available: uploads !== null,
    settled: (pictures) =>
      pictures.map((picture) => {
        const item = uploads?.queue.items().find((one) => one.id === picture.uploadId);
        return item?.status === "done" && typeof item.result === "string"
          ? { ...picture, src: item.result, uploadId: undefined }
          : picture;
      }),
    add: (files) => {
      if (uploads === null) return [];
      const images = files.filter((file) => file.type.startsWith("image/"));
      return uploads.queue.add(images).map((item) => ({
        src: item.preview ?? "",
        alt: "",
        uploadId: item.id,
      }));
    },
  };
}

interface PictureFieldsProps {
  picture: SetPicture;
  onChange: (picture: SetPicture) => void;
}

/** A picture's alt text and caption, in a set's form. */
function PictureFields(props: PictureFieldsProps) {
  const messages = useArcMessages();
  const altId = createUniqueId();
  const captionId = createUniqueId();
  return (
    <>
      <Field>
        <FieldLabel for={altId}>{messages().altText}</FieldLabel>
        <Input
          id={altId}
          dir="auto"
          maxLength={500}
          value={props.picture.alt}
          onInput={(event: Event) =>
            props.onChange({
              ...props.picture,
              alt: (event.currentTarget as HTMLInputElement).value,
            })
          }
        />
      </Field>
      <Field>
        <FieldLabel for={captionId}>{messages().imageCaption}</FieldLabel>
        <Input
          id={captionId}
          dir="auto"
          maxLength={300}
          value={props.picture.caption ?? ""}
          onInput={(event: Event) => {
            const caption = (event.currentTarget as HTMLInputElement).value;
            props.onChange({ ...props.picture, caption: caption === "" ? undefined : caption });
          }}
        />
      </Field>
    </>
  );
}

function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item === undefined) return next;
  next.splice(Math.min(Math.max(0, to), next.length), 0, item);
  return next;
}

type GalleryFormProps = SetFormProps;

interface Drag {
  from: number;
  over: number;
}

/**
 * A gallery's pictures as they are set up: tiles in their order, each
 * dragged by mouse or finger to a new place, or moved with Alt and an arrow,
 * or by Earlier and Later; the one chosen described and captioned beside
 * them. More are uploaded through the editor's queue, up to twenty-four.
 */
export function GalleryForm(props: GalleryFormProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  const media = useEditorMedia();
  const uploads = usePictureUploads();
  const direction = useDirection();
  const [chosen, setChosen] = createSignal(0, { ownedWrite: true });
  const [drag, setDrag] = createSignal<Drag | null>(null, { ownedWrite: true });
  // Read in the next pointer event, before a staged signal would show it.
  let dragging: Drag | null = null;
  function dragTo(next: Drag | null): void {
    dragging = next;
    setDrag(next);
  }
  let tiles: HTMLOListElement | undefined;
  function at(): number {
    return Math.min(chosen(), Math.max(0, props.pictures.length - 1));
  }
  function count(index: number): string {
    const format = digits(locale().locale);
    return messages().pictureOf(format.format(index + 1), format.format(props.pictures.length));
  }
  function move(from: number, to: number): void {
    if (to < 0 || to >= props.pictures.length || from === to) return;
    props.onChange(moved(props.pictures, from, to));
    setChosen(to);
  }
  function tileAt(event: PointerEvent): number | null {
    const items = [...(tiles?.querySelectorAll<HTMLElement>("[data-tile]") ?? [])];
    const index = items.findIndex((item) => {
      const box = item.getBoundingClientRect();
      return (
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom
      );
    });
    return index < 0 ? null : index;
  }
  const s = picturesFormStyles();
  return (
    <div class={s.form} data-slot="gallery-form">
      <Show
        when={props.pictures.length > 0}
        fallback={<p class={s.hint}>{messages().galleryEmpty}</p>}
      >
        <ol
          ref={(element: HTMLOListElement) => {
            tiles = element;
          }}
          class={s.tiles}
          aria-label={messages().gallery}
          data-slot="gallery-form-tiles"
        >
          <For each={props.pictures}>
            {(picture: SetPicture, index: () => number) => (
              <li
                class={s.tile}
                data-tile=""
                data-chosen={index() === at() ? "" : undefined}
                data-over={drag() !== null && drag()?.over === index() ? "" : undefined}
                data-dragging={drag()?.from === index() ? "" : undefined}
              >
                <Image src={srcOf(picture, media().fileUrl)} alt="" aspectRatio={1} />
                <button
                  type="button"
                  class={s.tileButton}
                  aria-pressed={index() === at()}
                  aria-label={count(index())}
                  data-slot="gallery-form-tile"
                  onClick={() => setChosen(index())}
                  onKeyDown={(event: KeyboardEvent) => {
                    if (!event.altKey) return;
                    const rtl = direction() === "rtl";
                    const step =
                      event.key === "ArrowUp" || (event.key === "ArrowLeft") !== rtl ? -1 : 1;
                    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
                      return;
                    }
                    event.preventDefault();
                    move(index(), index() + step);
                  }}
                  onPointerDown={(event: PointerEvent) => {
                    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
                    dragTo({ from: index(), over: index() });
                  }}
                  onPointerMove={(event: PointerEvent) => {
                    const current = dragging;
                    if (current === null) return;
                    const over = tileAt(event);
                    if (over !== null && over !== current.over)
                      dragTo({ from: current.from, over });
                  }}
                  onPointerUp={() => {
                    const current = dragging;
                    dragTo(null);
                    if (current !== null) move(current.from, current.over);
                  }}
                  onPointerCancel={() => dragTo(null)}
                />
                <span class={s.number} aria-hidden="true">
                  {digits(locale().locale).format(index() + 1)}
                </span>
              </li>
            )}
          </For>
        </ol>
        <p class={s.hint}>{messages().galleryOrderHint}</p>
      </Show>
      <div class={s.row}>
        <Show when={uploads.available && props.pictures.length < MAX_GALLERY_PICTURES}>
          <FileTrigger
            acceptedFileTypes={["image/*"]}
            allowsMultiple
            onSelect={(files: FileList | null) => {
              const added = uploads.add([...(files ?? [])]);
              props.onChange([...props.pictures, ...added].slice(0, MAX_GALLERY_PICTURES));
            }}
          >
            <Button variant="outline" size="sm">
              <ImagePlus aria-hidden="true" />
              {messages().galleryAdd}
            </Button>
          </FileTrigger>
        </Show>
      </div>
      <Show when={props.pictures[at()]}>
        {(picture: () => SetPicture) => (
          <section class={s.side} aria-label={count(at())} data-slot="gallery-form-chosen">
            <PictureFields
              picture={picture()}
              onChange={(next: SetPicture) =>
                props.onChange(props.pictures.map((one, index) => (index === at() ? next : one)))
              }
            />
            <div class={s.row}>
              <Button
                variant="outline"
                size="sm"
                isDisabled={at() === 0}
                onPress={() => move(at(), at() - 1)}
              >
                <ArrowLeft aria-hidden="true" class={arc({ ":dir(rtl)": { rotate: "180deg" } })} />
                {messages().pictureEarlier}
              </Button>
              <Button
                variant="outline"
                size="sm"
                isDisabled={at() === props.pictures.length - 1}
                onPress={() => move(at(), at() + 1)}
              >
                {messages().pictureLater}
                <ArrowRight aria-hidden="true" class={arc({ ":dir(rtl)": { rotate: "180deg" } })} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onPress={() => {
                  const index = at();
                  props.onChange(props.pictures.filter((_, other) => other !== index));
                  setChosen(Math.max(0, index - 1));
                }}
              >
                <X aria-hidden="true" />
                {messages().removePicture}
              </Button>
            </div>
          </section>
        )}
      </Show>
    </div>
  );
}

interface SetDialogProps {
  heading: string;
  trigger: string;
  pictures: readonly SetPicture[];
  setData: BlockProps<PicturesData>["setData"];
  /** The form, drawn once while the dialog is open and handed the draft as it changes. */
  form: (props: SetFormProps) => JSX.Element;
}

export interface SetFormProps {
  pictures: readonly SetPicture[];
  onChange: (pictures: SetPicture[]) => void;
}

/** A set's pictures changed in a dialog and kept on Save, as one step of the document's history. */
function SetDialog(props: SetDialogProps) {
  const messages = useArcMessages();
  const uploads = usePictureUploads();
  const Form = untrack(() => props.form);
  const [open, setOpen] = createSignal(false, { ownedWrite: true });
  const [draft, setDraft] = createSignal<readonly SetPicture[]>([], { ownedWrite: true });
  return (
    <ResponsiveOverlay
      heading={props.heading}
      open={open()}
      onOpenChange={(next: boolean) => {
        if (next) setDraft(props.pictures);
        setOpen(next);
      }}
      trigger={
        <Button variant="outline" size="sm">
          <Pencil aria-hidden="true" />
          {props.trigger}
        </Button>
      }
      footer={
        <Button
          size="sm"
          onPress={() => {
            // An upload that finished while the dialog was open has its address already.
            props.setData({ pictures: uploads.settled(draft()) });
            setOpen(false);
          }}
        >
          {messages().save}
        </Button>
      }
    >
      <Form pictures={draft()} onChange={setDraft} />
    </ResponsiveOverlay>
  );
}

function GalleryView(props: BlockProps<PicturesData>) {
  const messages = useArcMessages();
  const inEditor = untrack(() => props.nodeKey) !== "";
  const editor = inEditor ? useLexicalEditor() : null;
  function options(): PicturesOptions | undefined {
    return editor === null ? undefined : looks.read(editor);
  }
  return (
    <GalleryFigure
      pictures={props.data.pictures}
      options={options()}
      editable={props.editable}
      actions={
        <Show when={props.editable}>
          <div class={cls(options()).actions}>
            <SetDialog
              heading={messages().gallery}
              trigger={
                props.data.pictures.length === 0 ? messages().galleryAdd : messages().editGallery
              }
              pictures={props.data.pictures}
              setData={props.setData}
              form={GalleryForm}
            />
          </div>
        </Show>
      }
    />
  );
}

export interface GalleryFigureProps {
  pictures: readonly SetPicture[];
  options: PicturesOptions | undefined;
  editable: boolean;
  /** After the pictures: the editor's button that sets them up. */
  actions?: JSX.Element;
}

/**
 * A gallery as a document shows it: a grid of pictures, each opening the
 * `Lightbox` at itself, to step through them with their captions. While it
 * is edited, the grid shows each picture with what it still lacks.
 */
export function GalleryFigure(props: GalleryFigureProps) {
  const messages = useArcMessages();
  const media = useEditorMedia();
  const locale = useLocale();
  function c(): PicturesSlots {
    return cls(props.options);
  }
  return (
    <div
      class={arc(c().root, props.options?.class, props.options?.className)}
      data-slot="editor-gallery"
      data-count={props.pictures.length}
    >
      <Show
        when={props.editable}
        fallback={
          <Gallery
            images={shownOf(props.pictures, media().fileUrl, (index, total) =>
              messages().pictureOf(
                digits(locale().locale).format(index + 1),
                digits(locale().locale).format(total),
              ),
            )}
            aria-label={messages().gallery}
            minItemWidth="9rem"
            classes={{ root: c().grid }}
          />
        }
      >
        <Show
          when={props.pictures.length > 0}
          fallback={<p class={c().empty}>{messages().galleryEmpty}</p>}
        >
          <ul class={c().grid} aria-label={messages().gallery}>
            <For each={props.pictures}>
              {(picture: SetPicture) => (
                <li class={c().tile}>
                  <Image src={srcOf(picture, media().fileUrl)} alt={picture.alt} aspectRatio={1} />
                  <Show
                    when={picture.alt.trim() === ""}
                    fallback={
                      <Show when={picture.caption}>
                        <p class={c().caption} dir="auto">
                          {picture.caption}
                        </p>
                      </Show>
                    }
                  >
                    <p class={c().warning} data-slot="editor-gallery-alt-missing">
                      {messages().pictureAltMissing}
                    </p>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
      {props.actions}
    </div>
  );
}

type CompareFormProps = SetFormProps;

const EMPTY_SIDE: SetPicture = { alt: "" };

/** A before and an after as they are set: each side's picture uploaded, described and captioned. */
export function CompareForm(props: CompareFormProps) {
  const messages = useArcMessages();
  const media = useEditorMedia();
  const uploads = usePictureUploads();
  const s = picturesFormStyles();
  function set(index: number, picture: SetPicture): void {
    const next: (SetPicture | undefined)[] = [props.pictures[0], props.pictures[1]];
    next[index] = picture;
    const [before, after] = next;
    // An after with no before yet keeps its place, an empty side before it.
    props.onChange(after === undefined ? [before ?? EMPTY_SIDE] : [before ?? EMPTY_SIDE, after]);
  }
  function side(index: number): SetPicture | undefined {
    const picture = props.pictures[index];
    return picture === undefined || srcOf(picture, media().fileUrl) === "" ? undefined : picture;
  }
  return (
    <div class={s.sides} data-slot="compare-form">
      <For each={[0, 1]}>
        {(index: number) => (
          <fieldset class={s.fieldset}>
            <legend class={s.legend}>
              {index === 0 ? messages().compareBefore : messages().compareAfter}
            </legend>
            <Show when={side(index)}>
              {(picture: () => SetPicture) => (
                <>
                  <Image
                    class={s.preview}
                    src={srcOf(picture(), media().fileUrl)}
                    alt={picture().alt}
                    fit="contain"
                  />
                  <PictureFields
                    picture={picture()}
                    onChange={(next: SetPicture) => set(index, next)}
                  />
                </>
              )}
            </Show>
            <Show when={uploads.available}>
              <FileTrigger
                acceptedFileTypes={["image/*"]}
                onSelect={(files: FileList | null) => {
                  const [added] = uploads.add([...(files ?? [])].slice(0, 1));
                  if (added !== undefined) set(index, { ...added, alt: side(index)?.alt ?? "" });
                }}
              >
                <Button variant="outline" size="sm">
                  <ImagePlus aria-hidden="true" />
                  {messages().compareChoose(
                    index === 0 ? messages().compareBefore : messages().compareAfter,
                  )}
                </Button>
              </FileTrigger>
            </Show>
          </fieldset>
        )}
      </For>
    </div>
  );
}

export interface CompareFigureProps {
  pictures: readonly SetPicture[];
  options: PicturesOptions | undefined;
  actions?: JSX.Element;
}

/**
 * Two pictures of one thing laid over each other, the reader sliding the
 * line between them with a range control, which a keyboard, a screen reader
 * and a finger move alike. It reads left to right in either language, as
 * the pictures do. With one side missing, the other stands alone.
 */
export function CompareFigure(props: CompareFigureProps) {
  const messages = useArcMessages();
  const media = useEditorMedia();
  const [split, setSplit] = createSignal(50, { ownedWrite: true });
  function c(): PicturesSlots {
    return cls(props.options);
  }
  function side(index: number): SetPicture | undefined {
    const picture = props.pictures[index];
    return picture === undefined || srcOf(picture, media().fileUrl) === "" ? undefined : picture;
  }
  function label(index: number): string {
    const caption = side(index)?.caption;
    if (caption !== undefined && caption !== "") return caption;
    return index === 0 ? messages().compareBefore : messages().compareAfter;
  }
  return (
    <div
      class={arc(c().root, props.options?.class, props.options?.className)}
      data-slot="editor-compare"
    >
      <Show
        when={side(0) !== undefined && side(1) !== undefined}
        fallback={
          <div class={c().sides}>
            <For each={[0, 1].filter((index) => side(index) !== undefined)}>
              {(index: number) => (
                <figure class={arc(layout.column, gap[1], layout.flush)}>
                  <Image
                    src={srcOf(side(index)!, media().fileUrl)}
                    alt={side(index)?.alt ?? ""}
                    fit="contain"
                  />
                  <figcaption class={c().caption} dir="auto">
                    {label(index)}
                  </figcaption>
                </figure>
              )}
            </For>
          </div>
        }
      >
        <figure
          class={c().compare}
          dir="ltr"
          data-slot="editor-compare-stage"
          style={{ "--split": `${String(split())}%` }}
        >
          <img
            class={c().after}
            src={srcOf(side(1)!, media().fileUrl)}
            alt={side(1)?.alt ?? ""}
            draggable={false}
          />
          <img
            class={c().before}
            src={srcOf(side(0)!, media().fileUrl)}
            alt={side(0)?.alt ?? ""}
            draggable={false}
          />
          <span class={c().line} aria-hidden="true" />
          <span class={c().label} data-side="before" dir="auto" aria-hidden="true">
            {label(0)}
          </span>
          <span class={c().label} data-side="after" dir="auto" aria-hidden="true">
            {label(1)}
          </span>
          <input
            class={c().range}
            type="range"
            min="0"
            max="100"
            value={split()}
            data-slot="editor-compare-slider"
            aria-label={messages().compareSlider}
            aria-valuetext={messages().compareShown(label(0), split())}
            ref={ownInput((slider) => setSplit(Number(slider.value)))}
          />
        </figure>
      </Show>
      {props.actions}
    </div>
  );
}

function CompareView(props: BlockProps<PicturesData>) {
  const messages = useArcMessages();
  const inEditor = untrack(() => props.nodeKey) !== "";
  const editor = inEditor ? useLexicalEditor() : null;
  function options(): PicturesOptions | undefined {
    return editor === null ? undefined : looks.read(editor);
  }
  return (
    <CompareFigure
      pictures={props.data.pictures}
      options={options()}
      actions={
        <Show when={props.editable}>
          <div class={cls(options()).actions}>
            <SetDialog
              heading={messages().compare}
              trigger={messages().editComparison}
              pictures={props.data.pictures}
              setData={props.setData}
              form={CompareForm}
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

/** A set as one line of HTML: a figure of images, each with its address or file id and its caption. */
/** The two kinds of set: a gallery, and a before and after. */
export type SetKind = "gallery" | "compare";

export function picturesHtml(kind: SetKind, data: PicturesData): string {
  const images = data.pictures.map((picture) => {
    const attributes = [
      `src="${escapeAttribute(picture.src ?? "")}"`,
      `alt="${escapeAttribute(picture.alt)}"`,
    ];
    if (picture.fileId !== undefined) {
      attributes.push(`data-file-id="${escapeAttribute(picture.fileId)}"`);
    }
    if (picture.caption !== undefined && picture.caption !== "") {
      attributes.push(`title="${escapeAttribute(picture.caption)}"`);
    }
    return `<img ${attributes.join(" ")}>`;
  });
  return `<figure data-${kind}>${images.join("")}</figure>`;
}

function pictureOfAttributes(attributes: Readonly<Record<string, string>>): SetPicture | null {
  const src = attributes.src ?? "";
  const fileId = attributes["data-file-id"];
  if (src === "" && fileId === undefined) return null;
  const caption = attributes.title ?? "";
  return {
    ...(src === "" ? {} : { src }),
    ...(fileId === undefined ? {} : { fileId }),
    alt: attributes.alt ?? "",
    ...(caption === "" ? {} : { caption }),
  };
}

function picturesOfLine(line: string): SetPicture[] {
  return [...line.matchAll(/<img(\s[^>]*)?>/g)].flatMap((match) => {
    const picture = pictureOfAttributes(attributesOf(match[1] ?? ""));
    return picture === null ? [] : [picture];
  });
}

function picturesOfElement(element: HTMLElement): SetPicture[] {
  return [...element.querySelectorAll("img")].flatMap((image) => {
    const attributes: Record<string, string> = {};
    for (const one of image.attributes) attributes[one.name] = one.value;
    const picture = pictureOfAttributes(attributes);
    return picture === null ? [] : [picture];
  });
}

interface SetDetails {
  label: (messages: ArcMessages) => string;
  icon: () => JSX.Element;
  keywords: readonly string[];
  component: (props: BlockProps<PicturesData>) => JSX.Element;
  max: number;
}

function setBlock(kind: SetKind, details: SetDetails): Block<PicturesData> {
  const line = new RegExp(`^<figure data-${kind}>(?:<img(?:\\s[^>]*)?>)*</figure>\\s?$`);
  return defineBlock<PicturesData>({
    type: kind,
    label: details.label,
    group: (messages) => messages.mediaBlocks,
    icon: details.icon,
    keywords: details.keywords,
    defaultData: () => ({ pictures: [] }),
    component: details.component,
    insertable: false,
    toMarkdown: (data) =>
      data.pictures.some((one) => one.uploadId !== undefined) ? null : picturesHtml(kind, data),
    fromMarkdown: {
      regExp: line,
      data: (match) => ({ pictures: picturesOfLine(match[0] ?? "").slice(0, details.max) }),
    },
    fromHtml: {
      figure: (element) =>
        element.hasAttribute(`data-${kind}`)
          ? { pictures: picturesOfElement(element).slice(0, details.max) }
          : null,
    },
    toHtml: (data) => {
      const template = document.createElement("template");
      template.innerHTML = picturesHtml(kind, data);
      return template.content.firstElementChild as HTMLElement;
    },
  });
}

/** A gallery: up to twenty-four pictures in a grid, each opening a viewer that steps through them. */
export const GalleryBlock: Block<PicturesData> = setBlock("gallery", {
  label: (messages) => messages.gallery,
  icon: () => <Images />,
  keywords: ["pictures", "photos", "album", "grid"],
  component: GalleryView,
  max: MAX_GALLERY_PICTURES,
});

/** A before and after: two pictures over each other, a slider between them. */
export const CompareBlock: Block<PicturesData> = setBlock("compare", {
  label: (messages) => messages.compare,
  icon: () => <Columns2 />,
  keywords: ["before", "after", "comparison", "slider"],
  component: CompareView,
  max: 2,
});

function insertSet(block: Block<PicturesData>): (editor: LexicalEditor) => void {
  return (editor) => editor.update(() => void $insertBlock(block.$create()));
}

/**
 * Galleries and before-and-after comparisons, offered where the editor
 * uploads pictures; their look takes `class` and `classes` in the editor and
 * the renderer alike.
 */
export function picturesExtension(options: PicturesOptions = {}): EditorExtension {
  return defineEditorExtension({
    name: "arc/pictures",
    dependencies: [GalleryBlock, CompareBlock],
    register: (editor) => looks.provide(editor, options),
    commands: [
      {
        id: "gallery",
        label: (messages) => messages.gallery,
        group: (messages) => messages.mediaBlocks,
        icon: () => <Images />,
        keywords: GalleryBlock.keywords,
        available: (editor) => editorUploads(editor) !== null,
        run: insertSet(GalleryBlock),
      },
      {
        id: "compare",
        label: (messages) => messages.compare,
        group: (messages) => messages.mediaBlocks,
        icon: () => <Columns2 />,
        keywords: CompareBlock.keywords,
        available: (editor) => editorUploads(editor) !== null,
        run: insertSet(CompareBlock),
      },
    ],
    render: {
      gallery: (node, scope) => (
        <GalleryFigure
          pictures={(node.pictures as SetPicture[] | undefined) ?? []}
          options={options}
          editable={scope.editing}
        />
      ),
      compare: (node) => (
        <CompareFigure
          pictures={(node.pictures as SetPicture[] | undefined) ?? []}
          options={options}
        />
      ),
    },
  });
}
