import { type Child, For, Show, createSignal, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Button as AriaButton } from "@barqjs/aria/button";
import { useDirection, numberFormatter } from "@barqjs/aria/i18n";
import { controllable } from "@barqjs/aria/utils";
import { ChevronLeft } from "@barqjs/lucide/icons/chevron-left";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { ZoomIn } from "@barqjs/lucide/icons/zoom-in";
import { ZoomOut } from "@barqjs/lucide/icons/zoom-out";
import { on } from "@barqjs/ui/conditions";
import { Dialog, DialogContent, DialogTitle } from "@barqjs/ui/dialog";
import { icon } from "@barqjs/ui/shared-icon";
import { srOnly } from "@barqjs/ui/sr-only";

import { arcLayer as arc } from "../layer.ts";
import { place } from "../lib/place.ts";
import { bareButton } from "../lib/bare.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  edge,
  focus,
  gap,
  layout,
  motion,
  plainList,
  rounded,
  space,
  type,
} from "../style/index.ts";
import { IconButton } from "./icon-button.tsx";
import { Image } from "./image.tsx";
import { useArcMessages } from "./messages.ts";

export interface GalleryImage {
  src: string;
  /** What it shows, in words: the thumbnail's name and the large image's. */
  alt: string;
  /** A smaller file for the grid. @default `src` */
  thumbnail?: string;
  /** Under the large image. */
  caption?: Child;
  /** A tiny data URL or a colour, drawn blurred while it loads. */
  placeholder?: string;
}

const ZOOMS = [1, 1.5, 2, 3] as const;
const SWIPE = 48;

export const lightboxStyles = variants({
  slots: {
    root: arc(layout.column, gap[0], edge.none, place.screen, place.unpadded, {
      borderRadius: "0px",
      backgroundColor: "color-mix(in oklab, black 92%, transparent)",
      color: "white",
      [on.sm]: { maxWidth: "100vw" },
    }),
    body: arc(layout.column, layout.grow, layout.minZeroBlock),
    bar: arc(layout.row, gap[2], type.sm, {
      paddingInline: space.x4,
      paddingBlock: space.x3,
      paddingInlineEnd: space.x14,
    }),
    title: arc(srOnly),
    counter: arc(type.numeric, { marginInlineEnd: "auto" }),
    stage: arc(layout.relative, layout.grow, layout.minZeroBlock, layout.clip, layout.centre, {
      touchAction: "none",
      userSelect: "none",
    }),
    image: arc(motion.transform, {
      maxWidth: "100%",
      maxHeight: "100%",
      objectFit: "contain",
      transformOrigin: "center",
      cursor: "zoom-in",
      "[data-zoomed]": { cursor: "grab" },
    }),
    previous: arc(place.middle, { insetInlineStart: space.x2 }),
    next: arc(place.middle, { insetInlineEnd: space.x2 }),
    caption: arc(type.sm, { textAlign: "center", paddingInline: space.x4, paddingBlock: space.x3 }),
    control: arc({ color: "inherit" }),
  },
});

type LightboxSlots = ReturnType<typeof lightboxStyles>;

export interface LightboxProps extends Customisable<LightboxSlots> {
  images: readonly GalleryImage[];
  index?: number;
  defaultIndex?: number;
  onIndexChange?: (index: number) => void;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Names the viewer. @default the provider's `imageViewer`, "Image viewer" */
  label?: string;
}

/**
 * One image at a time over the whole screen, to look at closely.
 *
 * ```tsx
 * <Lightbox images={photos} isOpen={open()} onOpenChange={setOpen} index={at()} onIndexChange={setAt} />
 * ```
 *
 * A modal dialog, so focus stays in it and Escape closes it. The arrows and
 * the buttons at either side step through the images in the reading
 * direction, Home and End go to the ends, and a swipe does the same under a
 * finger. `+` and `-`, the zoom buttons, a double press or a double tap zoom
 * in, and a zoomed image is dragged to pan. "Image 2 of 5" is announced as it
 * changes.
 */
export function Lightbox(props: LightboxProps) {
  const messages = useArcMessages();
  const direction = useDirection();
  const format = numberFormatter();
  const titleId = createUniqueId();
  const [index, setIndex] = controllable<number>(
    () => props.index,
    () => props.defaultIndex ?? 0,
    (next) => props.onIndexChange?.(next),
  );
  const [isOpen, setOpen] = controllable<boolean>(
    () => props.isOpen,
    () => props.defaultOpen ?? false,
    (next) => props.onOpenChange?.(next),
  );
  const [zoom, setZoom] = createSignal(0);
  const [pan, setPan] = createSignal({ x: 0, y: 0 });
  const count = (): number => props.images.length;
  const current = (): GalleryImage | undefined => props.images[index()];
  const go = (next: number): void => {
    if (count() === 0) return;
    const bounded = Math.min(Math.max(0, next), count() - 1);
    if (bounded === index()) return;
    setZoom(0);
    setPan({ x: 0, y: 0 });
    setIndex(bounded);
  };
  const zoomTo = (step: number): void => {
    const next = Math.min(Math.max(0, step), ZOOMS.length - 1);
    setZoom(next);
    if (next === 0) setPan({ x: 0, y: 0 });
  };
  const forwardKey = (): string => (direction() === "rtl" ? "ArrowLeft" : "ArrowRight");
  const backKey = (): string => (direction() === "rtl" ? "ArrowRight" : "ArrowLeft");
  const onKeyDown = (event: KeyboardEvent): void => {
    const handled = new Map<string, () => void>([
      [forwardKey(), () => go(index() + 1)],
      [backKey(), () => go(index() - 1)],
      ["Home", () => go(0)],
      ["End", () => go(count() - 1)],
      ["+", () => zoomTo(zoom() + 1)],
      ["=", () => zoomTo(zoom() + 1)],
      ["-", () => zoomTo(zoom() - 1)],
      ["0", () => zoomTo(0)],
    ]).get(event.key);
    if (handled === undefined) return;
    event.preventDefault();
    handled();
  };

  let start: { x: number; y: number; pan: { x: number; y: number } } | null = null;
  const onPointerDown = (event: PointerEvent): void => {
    start = { x: event.clientX, y: event.clientY, pan: pan() };
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (start === null || zoom() === 0) return;
    setPan({ x: start.pan.x + event.clientX - start.x, y: start.pan.y + event.clientY - start.y });
  };
  const onPointerUp = (event: PointerEvent): void => {
    if (start === null) return;
    const dx = event.clientX - start.x;
    start = null;
    if (zoom() !== 0 || Math.abs(dx) < SWIPE) return;
    const towardsStart = direction() === "rtl" ? dx < 0 : dx > 0;
    go(index() + (towardsStart ? -1 : 1));
  };

  const cls = (): LightboxSlots => parts(lightboxStyles(), props.classes);
  return (
    <Dialog isOpen={isOpen()} onOpenChange={setOpen}>
      <DialogContent
        class={arc(cls().root, props.class, props.className)}
        data-slot="lightbox"
        closeLabel={messages().close}
        aria-labelledby={titleId}
      >
        <DialogTitle class={cls().title} id={titleId}>
          {props.label ?? messages().imageViewer}
        </DialogTitle>
        <div class={cls().body} data-slot="lightbox-body" onKeyDown={onKeyDown}>
          <div class={cls().bar} data-slot="lightbox-bar">
            <span class={cls().counter} data-slot="lightbox-counter" aria-live="polite">
              {messages().imageOf(format().format(index() + 1), format().format(count()))}
            </span>
            <IconButton
              class={cls().control}
              label={messages().zoomOut}
              size="sm"
              isDisabled={zoom() === 0}
              onPress={() => zoomTo(zoom() - 1)}
            >
              <ZoomOut />
            </IconButton>
            <IconButton
              class={cls().control}
              label={messages().zoomIn}
              size="sm"
              isDisabled={zoom() === ZOOMS.length - 1}
              onPress={() => zoomTo(zoom() + 1)}
            >
              <ZoomIn />
            </IconButton>
          </div>
          <div
            class={cls().stage}
            data-slot="lightbox-stage"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              start = null;
            }}
            onDblClick={() => zoomTo(zoom() === 0 ? 2 : 0)}
          >
            <Show when={current() !== undefined}>
              <img
                class={cls().image}
                data-slot="lightbox-image"
                data-zoomed={zoom() > 0 ? "" : undefined}
                src={current()?.src}
                alt={current()?.alt ?? ""}
                draggable={false}
                style={{
                  transform: `translate(${String(pan().x)}px, ${String(pan().y)}px) scale(${String(ZOOMS[zoom()])})`,
                }}
              />
            </Show>
            <IconButton
              class={arc(cls().control, cls().previous)}
              label={messages().previousImage}
              variant="secondary"
              isDisabled={index() <= 0}
              onPress={() => go(index() - 1)}
            >
              <ChevronLeft class={icon.directional} />
            </IconButton>
            <IconButton
              class={arc(cls().control, cls().next)}
              label={messages().nextImage}
              variant="secondary"
              isDisabled={index() >= count() - 1}
              onPress={() => go(index() + 1)}
            >
              <ChevronRight class={icon.directional} />
            </IconButton>
          </div>
          <Show when={current()?.caption !== undefined}>
            <p class={cls().caption} data-slot="lightbox-caption">
              {current()?.caption}
            </p>
          </Show>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const galleryStyles = variants({
  slots: {
    root: arc(plainList, {
      display: "grid",
      gap: space.x2,
      gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, var(--arc-gallery-min)), 1fr))",
    }),
    item: arc({}),
    thumb: arc(bareButton, focus.visible, rounded.md, layout.clip, motion.colours, place.block, {
      cursor: "zoom-in",
    }),
  },
});

type GallerySlots = ReturnType<typeof galleryStyles>;

export interface GalleryProps extends Customisable<GallerySlots> {
  images: readonly GalleryImage[];
  /** Names the list. */
  "aria-label"?: string;
  /** The narrowest a thumbnail gets before the grid drops a column. @default "10rem" */
  minItemWidth?: string;
  /** Each thumbnail's shape. @default 1 */
  aspectRatio?: number | string;
  /** The `Lightbox`'s parts. */
  lightboxClasses?: LightboxProps["classes"];
}

/**
 * Pictures in a grid, each opening the `Lightbox` at itself.
 *
 * ```tsx
 * <Gallery aria-label="Site photos" images={photos} minItemWidth="8rem" />
 * ```
 *
 * A list of thumbnails as many across as fit, each a button named by its
 * image; the lightbox it opens returns focus to it on close.
 */
export function Gallery(props: GalleryProps) {
  const [open, setOpen] = createSignal(false);
  const [at, setAt] = createSignal(0);
  const cls = (): GallerySlots => parts(galleryStyles(), props.classes);
  return (
    <>
      <ul
        class={arc(cls().root, props.class, props.className)}
        data-slot="gallery"
        aria-label={props["aria-label"]}
        style={{ "--arc-gallery-min": props.minItemWidth ?? "10rem" }}
      >
        <For each={() => props.images.map((image, index) => ({ image, index }))}>
          {(entry: { image: GalleryImage; index: number }) => (
            <li class={cls().item} data-slot="gallery-item">
              <AriaButton
                class={cls().thumb}
                data-slot="gallery-thumb"
                onPress={() => {
                  setAt(entry.index);
                  setOpen(true);
                }}
              >
                <Image
                  src={entry.image.thumbnail ?? entry.image.src}
                  alt={entry.image.alt}
                  aspectRatio={props.aspectRatio ?? 1}
                  placeholder={entry.image.placeholder}
                />
              </AriaButton>
            </li>
          )}
        </For>
      </ul>
      <Lightbox
        images={props.images}
        index={at()}
        onIndexChange={setAt}
        isOpen={open()}
        onOpenChange={setOpen}
        classes={props.lightboxClasses}
      />
    </>
  );
}
