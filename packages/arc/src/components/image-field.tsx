import { type Child, For, Show, createSignal, createUniqueId, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { FileTrigger } from "@barqjs/aria/file-trigger";
import { useLocale } from "@barqjs/aria/i18n";
import { announce } from "@barqjs/aria/live";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { Button } from "@barqjs/ui/button";
import { tokens } from "@barqjs/ui/theme/tokens";
import { Field, FieldDescription, FieldError, FieldLabel } from "@barqjs/ui/field";
import { Progress } from "@barqjs/ui/progress";
import { Slider } from "@barqjs/ui/slider";
import { srOnly } from "@barqjs/ui/sr-only";
import { ToggleGroup, ToggleGroupItem } from "@barqjs/ui/toggle-group";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  edge,
  focus,
  gap,
  interaction,
  layout,
  place,
  rounded,
  space,
  type,
} from "../style/index.ts";
import {
  FileDropZone,
  type FileRejection,
  type UploadContext,
  type UploadItem,
  checkFiles,
  useUploadQueue,
} from "./file-upload.tsx";
import { Image } from "./image.tsx";
import { useArcMessages } from "./messages.ts";
import { ResponsiveOverlay } from "./responsive-overlay.tsx";

/** An aspect ratio a crop can take: width over height. */
export interface AspectPreset {
  label: string;
  ratio: number;
}

/** What part of an image a crop keeps, in the image's own pixels. */
export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where the crop frame is: `zoom` from 1 (the frame covered), `panX` and `panY` from -1 to 1. */
export interface CropView {
  zoom: number;
  panX: number;
  panY: number;
}

const MAX_ZOOM = 4;
const STEP = 0.1;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * The part of a `width` by `height` image a frame of `ratio` keeps at `view`:
 * the frame covers the image at zoom 1, and a pan of 1 is as far as the
 * image reaches on that side.
 */
export function cropArea(width: number, height: number, ratio: number, view: CropView): CropArea {
  const cover =
    width / height > ratio ? { w: height * ratio, h: height } : { w: width, h: width / ratio };
  const w = cover.w / view.zoom;
  const h = cover.h / view.zoom;
  const centreX = width / 2 + clamp(view.panX, -1, 1) * ((width - w) / 2);
  const centreY = height / 2 + clamp(view.panY, -1, 1) * ((height - h) / 2);
  return { x: centreX - w / 2, y: centreY - h / 2, width: w, height: h };
}

export interface CropOptions {
  maxSize?: number;
  type?: string;
  quality?: number;
}

/** Draw `area` of `image` at no more than `maxSize` pixels on its long side, as a blob. */
export function cropImage(
  image: CanvasImageSource,
  area: CropArea,
  options: CropOptions = {},
): Promise<Blob> {
  const max = options.maxSize ?? 2048;
  const scale = Math.min(1, max / Math.max(area.width, area.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(area.width * scale));
  canvas.height = Math.max(1, Math.round(area.height * scale));
  const context = canvas.getContext("2d");
  if (context === null) return Promise.reject(new Error("[arc] no 2D canvas to crop on"));
  context.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob === null ? reject(new Error("[arc] the crop made no image")) : resolve(blob)),
      options.type ?? "image/png",
      options.quality,
    );
  });
}

export const imageFieldStyles = variants({
  slots: {
    root: arc({}),
    label: arc({}),
    description: arc({}),
    error: arc({}),
    body: arc(layout.row, layout.wrap, gap[4], { alignItems: "center" }),
    preview: arc(layout.relative, layout.noShrink, edge.all, bg.muted, { overflow: "hidden" }),
    image: arc(place.fill),
    actions: arc(layout.row, layout.wrap, gap[2]),
    progress: arc(layout.column, gap[1], type.meta, { minWidth: "10rem" }),
    cropper: arc(layout.column, gap[3]),
    stage: arc(layout.relative, rounded.md, bg.muted, focus.visible, interaction.draggable, {
      overflow: "hidden",
      width: "100%",
      maxHeight: "60dvh",
    }),
    stageImage: arc(place.passive, { maxWidth: "none" }),
    frame: arc(place.cover, rounded.inherit, {
      boxShadow: `0 0 0 2px ${tokens.background} inset`,
    }),
    controls: arc(layout.row, layout.wrap, gap[3]),
    zoom: arc(layout.grow, { minWidth: "8rem" }),
    hint: arc(type.meta, layout.flush),
  },
  variants: {
    shape: {
      avatar: { preview: arc(rounded.full, { width: space.x16, height: space.x16 }) },
      image: { preview: arc(rounded.md, { width: "12rem", aspectRatio: "16 / 9" }) },
    },
    round: { true: { frame: rounded.full }, false: {} },
  },
  defaults: { shape: "avatar", round: false },
});

type Slots = ReturnType<typeof imageFieldStyles>;

export interface ImageCropperProps extends Customisable<Slots> {
  /** The picture to crop: an object URL, usually. */
  src: string;
  /** @default the first of `aspects`, or 1 */
  aspect?: number;
  /** Ratios to choose from; one or none draws no choice. */
  aspects?: readonly AspectPreset[];
  /** A round frame, for an avatar. The image kept is still square. */
  round?: boolean;
  view?: CropView;
  onViewChange?: (view: CropView, area: CropArea) => void;
  onAspectChange?: (ratio: number) => void;
  /** Hands over the `<img>` once it has loaded, for `cropImage`. */
  onImage?: (image: HTMLImageElement) => void;
}

interface Reach {
  x: number;
  y: number;
}

interface DragStart {
  x: number;
  y: number;
  view: CropView;
}

/**
 * A picture moved and zoomed under a frame of a chosen aspect ratio. A
 * finger or a mouse drags it, the arrow keys move it, `+` and `-` or the
 * slider zoom, and the frame always stays covered.
 */
export function ImageCropper(props: ImageCropperProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(imageFieldStyles({ round: props.round === true }), props.classes);
  }
  const help = createUniqueId();
  const stage = makeRef<HTMLDivElement>();
  const [own, setOwn] = createSignal<CropView>({ zoom: 1, panX: 0, panY: 0 }, { ownedWrite: true });
  const [ownAspect, setOwnAspect] = createSignal<number | undefined>(undefined, {
    ownedWrite: true,
  });
  const [size, setSize] = createSignal({ width: 0, height: 0 }, { ownedWrite: true });
  function view(): CropView {
    return props.view ?? own();
  }
  function aspect(): number {
    return ownAspect() ?? props.aspect ?? props.aspects?.[0]?.ratio ?? 1;
  }

  function set(next: CropView, dims = size(), ratio = aspect()): void {
    const clamped = {
      zoom: clamp(next.zoom, 1, MAX_ZOOM),
      panX: clamp(next.panX, -1, 1),
      panY: clamp(next.panY, -1, 1),
    };
    setOwn(clamped);
    props.onViewChange?.(clamped, cropArea(dims.width, dims.height, ratio, clamped));
  }

  /** Where the image sits in the stage, in percent of the stage, from the crop it shows. */
  function placement(): Record<string, string> {
    const { width, height } = size();
    if (width === 0) return {};
    const area = cropArea(width, height, aspect(), view());
    return {
      width: `${String((width / area.width) * 100)}%`,
      height: `${String((height / area.height) * 100)}%`,
      left: `${String((-area.x / area.width) * 100)}%`,
      top: `${String((-area.y / area.height) * 100)}%`,
    };
  }

  /** How far a pan of 1 is, in stage pixels, so a drag follows the pointer. */
  function reach(): Reach {
    const { width, height } = size();
    const box = stage()?.getBoundingClientRect();
    if (width === 0 || box === undefined || box.width === 0) return { x: 0, y: 0 };
    const area = cropArea(width, height, aspect(), view());
    const scale = box.width / area.width;
    return { x: ((width - area.width) / 2) * scale, y: ((height - area.height) / 2) * scale };
  }

  let dragFrom: DragStart | null = null;

  function onKeyDown(event: KeyboardEvent): void {
    const now = view();
    const moves: Record<string, Partial<CropView>> = {
      ArrowLeft: { panX: now.panX + STEP },
      ArrowRight: { panX: now.panX - STEP },
      ArrowUp: { panY: now.panY + STEP },
      ArrowDown: { panY: now.panY - STEP },
      "+": { zoom: now.zoom + STEP * 2 },
      "=": { zoom: now.zoom + STEP * 2 },
      "-": { zoom: now.zoom - STEP * 2 },
    };
    const move = moves[event.key];
    if (move === undefined) return;
    event.preventDefault();
    set({ ...now, ...move });
  }

  return (
    <div class={arc(cls().cropper, props.class, props.className)} data-slot="image-cropper">
      <div
        ref={stage.set}
        class={cls().stage}
        data-slot="image-cropper-stage"
        style={{ "aspect-ratio": String(aspect()) }}
        tabIndex={0}
        role="group"
        aria-roledescription={messages().cropArea}
        aria-label={messages().cropArea}
        aria-describedby={help}
        dir="ltr"
        onKeyDown={onKeyDown}
        onPointerDown={(event: PointerEvent) => {
          dragFrom = { x: event.clientX, y: event.clientY, view: view() };
          (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event: PointerEvent) => {
          if (dragFrom === null) return;
          const { x, y } = reach();
          set({
            ...dragFrom.view,
            panX:
              x === 0 ? dragFrom.view.panX : dragFrom.view.panX - (event.clientX - dragFrom.x) / x,
            panY:
              y === 0 ? dragFrom.view.panY : dragFrom.view.panY - (event.clientY - dragFrom.y) / y,
          });
        }}
        onPointerUp={() => {
          dragFrom = null;
        }}
        onWheel={(event: WheelEvent) => {
          event.preventDefault();
          set({ ...view(), zoom: view().zoom - Math.sign(event.deltaY) * STEP });
        }}
      >
        <img
          src={props.src}
          alt=""
          class={cls().stageImage}
          data-slot="image-cropper-image"
          style={placement()}
          draggable={false}
          onLoad={(event: Event) => {
            const image = event.currentTarget as HTMLImageElement;
            const dims = { width: image.naturalWidth, height: image.naturalHeight };
            setSize(dims);
            props.onImage?.(image);
            set(view(), dims);
          }}
        />
        <span class={cls().frame} data-slot="image-cropper-frame" aria-hidden="true" />
      </div>
      <p id={help} class={cls().hint}>
        {messages().cropHelp}
      </p>
      <div class={cls().controls} data-slot="image-cropper-controls">
        <Slider
          class={cls().zoom}
          aria-label={messages().zoom}
          minValue={1}
          maxValue={MAX_ZOOM}
          step={STEP}
          value={[view().zoom]}
          formatOptions={{ style: "percent", maximumFractionDigits: 0 }}
          onChange={(value: number[]) => set({ ...view(), zoom: value[0] ?? 1 })}
        />
        <Show when={(props.aspects?.length ?? 0) > 1}>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            aria-label={messages().aspectRatio}
            value={String(aspect())}
            onValueChange={(value: string | string[]) => {
              if (typeof value !== "string" || value === "") return;
              setOwnAspect(Number(value));
              props.onAspectChange?.(Number(value));
              set(view(), size(), Number(value));
            }}
          >
            <For each={props.aspects ?? []}>
              {(preset: AspectPreset) => (
                <ToggleGroupItem value={String(preset.ratio)}>{preset.label}</ToggleGroupItem>
              )}
            </For>
          </ToggleGroup>
        </Show>
      </div>
    </div>
  );
}

export interface ImageFieldProps extends Customisable<Slots> {
  label: string;
  description?: Child;
  errorMessage?: string;
  /** The picture's URL now, or `null` for none. */
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string | null) => void;
  /**
   * Sends the cropped picture and resolves with its URL. Through arc's upload
   * queue: its progress shown, and cancelled or retried by the reader.
   */
  upload: (file: File, context: UploadContext) => Promise<string>;
  /** `avatar` is round and square; `image` takes `aspects`. @default "avatar" */
  shape?: "avatar" | "image";
  /** @default 1:1 for an avatar; 16:9, 4:3, 1:1 and 3:4 for an image */
  aspects?: readonly AspectPreset[];
  /** Crop before uploading. @default true */
  crop?: boolean;
  /** @default ["image/*"] */
  accept?: readonly string[];
  /** @default 5 MB */
  maxSize?: number;
  /** The long side of the cropped picture, in pixels. @default 512 for an avatar, 2048 otherwise */
  outputSize?: number;
  /** Adds Choose from library: resolves with a URL already uploaded, or `null` for none. */
  onChooseFromLibrary?: () => Promise<string | null>;
  isDisabled?: boolean;
  /** The picture's alternative text where it is shown. @default the label */
  alt?: string;
  /** Submits the URL under this name in a plain form. */
  name?: string;
}

const IMAGE_ASPECTS: readonly AspectPreset[] = [
  { label: "16:9", ratio: 16 / 9 },
  { label: "4:3", ratio: 4 / 3 },
  { label: "1:1", ratio: 1 },
  { label: "3:4", ratio: 3 / 4 },
];
const AVATAR_ASPECTS: readonly AspectPreset[] = [{ label: "1:1", ratio: 1 }];

interface PickedImage {
  file: File;
  url: string;
}

/**
 * A picture chosen, cropped and uploaded: an avatar, a logo, a cover.
 *
 * ```tsx
 * <ImageField
 *   label="Profile photo"
 *   value={user.photo}
 *   upload={(file, { onProgress, signal }) => api.upload(file, { onProgress, signal })}
 *   onChange={(url) => save({ photo: url })}
 * />
 * ```
 *
 * Empty, it is arc's drop zone, a button that opens the picker being the way
 * in on a touch screen; the type and size are checked before anything is
 * sent. A picture then opens in a crop dialog (a sheet on a phone), pans and
 * zooms under a frame of a chosen ratio, and is uploaded through arc's upload
 * queue, its progress shown and cancellable. Once set, Change and Remove sit
 * beside it.
 */
export function ImageField(props: ImageFieldProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  function shape(): "avatar" | "image" {
    return props.shape ?? "avatar";
  }
  function cls(): Slots {
    return parts(imageFieldStyles({ shape: shape(), round: shape() === "avatar" }), props.classes);
  }
  const inputId = createUniqueId();
  const [own, setOwn] = createSignal<string | null>(props.defaultValue ?? null, {
    ownedWrite: true,
  });
  const [picked, setPicked] = createSignal<PickedImage | null>(null);
  const [area, setArea] = createSignal<CropArea | null>(null);
  const [rejected, setRejected] = createSignal<string | null>(null);
  const [cropping, setCropping] = createSignal(false);
  let image: HTMLImageElement | null = null;

  function value(): string | null {
    return props.value === undefined ? own() : props.value;
  }
  function commit(next: string | null): void {
    if (props.value === undefined) setOwn(next);
    props.onChange?.(next);
  }
  function aspects(): readonly AspectPreset[] {
    return props.aspects ?? (shape() === "avatar" ? AVATAR_ASPECTS : IMAGE_ASPECTS);
  }
  function limits() {
    return {
      accept: props.accept ?? ["image/*"],
      maxSize: props.maxSize ?? 5_000_000,
      maxFiles: 1,
    };
  }

  const queue = useUploadQueue({
    upload: (file, context) => props.upload(file, context),
    concurrency: 1,
    onUploaded: (item: UploadItem) => {
      commit(String(item.result));
      announce(messages().uploaded(item.file.name), "polite");
      queue.remove(item.id);
    },
  });
  function current(): UploadItem | undefined {
    return queue.items()[0];
  }
  function busy(): boolean {
    return (
      current() !== undefined &&
      (current()?.status === "uploading" || current()?.status === "queued")
    );
  }

  function letGo(): void {
    const held = picked();
    if (held !== null) URL.revokeObjectURL(held.url);
    setPicked(null);
    setCropping(false);
  }

  function send(file: File): void {
    for (const item of queue.items()) queue.remove(item.id);
    queue.add([file]);
  }

  function take(files: readonly File[]): void {
    const { accepted, rejected: refused } = checkFiles(
      files,
      limits(),
      untrack(messages),
      untrack(locale).locale,
    );
    setRejected(refused.map((one: FileRejection) => one.reason).join(" ") || null);
    const file = accepted[0];
    if (file === undefined) return;
    if (props.crop === false) {
      send(file);
      return;
    }
    setPicked({ file, url: URL.createObjectURL(file) });
    setArea(null);
    setCropping(true);
  }

  async function save(): Promise<void> {
    const held = picked();
    const kept = area();
    if (held === null) return;
    if (image === null || kept === null) {
      send(held.file);
      letGo();
      return;
    }
    const format = held.file.type === "image/jpeg" ? "image/jpeg" : "image/png";
    const blob = await cropImage(image, kept, {
      maxSize: props.outputSize ?? (shape() === "avatar" ? 512 : 2048),
      type: format,
      quality: 0.9,
    });
    send(new File([blob], held.file.name, { type: format }));
    letGo();
  }

  async function library(): Promise<void> {
    const chosen = await props.onChooseFromLibrary?.();
    if (chosen !== null && chosen !== undefined) commit(chosen);
  }

  function pickButton(label: string) {
    return (
      <FileTrigger
        acceptedFileTypes={limits().accept}
        allowsMultiple={false}
        onSelect={(list: FileList | null) => take(list === null ? [] : [...list])}
      >
        <Button
          variant="outline"
          size="sm"
          isDisabled={props.isDisabled === true || busy()}
          data-slot="image-field-pick"
        >
          {label}
        </Button>
      </FileTrigger>
    );
  }

  return (
    <Field
      class={arc(cls().root, props.class, props.className)}
      data-slot="image-field"
      isInvalid={props.errorMessage !== undefined || rejected() !== null}
      isDisabled={props.isDisabled}
    >
      <FieldLabel class={cls().label} id={inputId}>
        {props.label}
      </FieldLabel>
      <div class={cls().body} data-slot="image-field-body" role="group" aria-labelledby={inputId}>
        <Show
          when={value() !== null}
          fallback={
            <Show when={!busy()}>
              <FileDropZone
                accept={limits().accept}
                maxSize={limits().maxSize}
                multiple={false}
                isDisabled={props.isDisabled}
                browseLabel={messages().chooseImage}
                aria-label={props.label}
                onFiles={take}
              />
            </Show>
          }
        >
          <span class={cls().preview} data-slot="image-field-preview">
            <Image
              class={cls().image}
              src={value() ?? ""}
              alt={props.alt ?? props.label}
              fit="cover"
              priority
            />
          </span>
          <div class={cls().actions} data-slot="image-field-actions">
            {pickButton(messages().changeImage)}
            <Button
              variant="ghost"
              size="sm"
              isDisabled={props.isDisabled === true || busy()}
              data-slot="image-field-remove"
              onPress={() => commit(null)}
            >
              {messages().removeImage}
            </Button>
          </div>
        </Show>
        <Show when={props.onChooseFromLibrary !== undefined}>
          <Button
            variant="outline"
            size="sm"
            isDisabled={props.isDisabled === true || busy()}
            data-slot="image-field-library"
            onPress={() => void library()}
          >
            {messages().chooseFromLibrary}
          </Button>
        </Show>
        <Show when={current() !== undefined}>
          <div class={cls().progress} data-slot="image-field-progress">
            <span>
              {current()?.status === "error"
                ? messages().uploadFailed(current()?.file.name ?? "")
                : messages().uploadingFile(current()?.file.name ?? "")}
            </span>
            <Show when={current()?.status !== "error"}>
              <Progress
                value={Math.round((current()?.progress ?? 0) * 100)}
                aria-label={messages().uploadingFile(current()?.file.name ?? "")}
              />
            </Show>
            <div class={cls().actions}>
              <Show
                when={current()?.status === "error"}
                fallback={
                  <Button
                    variant="ghost"
                    size="xs"
                    onPress={() => queue.cancel(current()?.id ?? "")}
                  >
                    {messages().cancel}
                  </Button>
                }
              >
                <Button
                  variant="outline"
                  size="xs"
                  onPress={() => queue.retry(current()?.id ?? "")}
                >
                  {messages().retry}
                </Button>
                <Button variant="ghost" size="xs" onPress={() => queue.remove(current()?.id ?? "")}>
                  {messages().dismiss}
                </Button>
              </Show>
            </div>
          </div>
        </Show>
      </div>
      <Show when={props.name !== undefined}>
        <input type="hidden" name={props.name} value={value() ?? ""} />
      </Show>
      <Show when={props.description !== undefined}>
        <FieldDescription class={cls().description}>{props.description}</FieldDescription>
      </Show>
      <Show when={props.errorMessage !== undefined || rejected() !== null}>
        <FieldError class={cls().error}>{props.errorMessage ?? rejected()}</FieldError>
      </Show>
      <span class={srOnly} data-slot="image-field-status" role="status">
        {busy() ? messages().uploadingFile(current()?.file.name ?? "") : ""}
      </span>
      <ResponsiveOverlay
        heading={messages().cropImage}
        open={cropping()}
        onOpenChange={(open: boolean) => {
          if (!open) letGo();
        }}
        footer={
          <>
            <Button variant="outline" onPress={letGo}>
              {messages().cancel}
            </Button>
            <Button data-slot="image-field-save" onPress={() => void save()}>
              {messages().save}
            </Button>
          </>
        }
      >
        <Show when={picked() !== null}>
          <ImageCropper
            src={picked()?.url ?? ""}
            aspects={aspects()}
            round={shape() === "avatar"}
            classes={props.classes}
            onImage={(loaded: HTMLImageElement) => {
              image = loaded;
            }}
            onViewChange={(_view: CropView, next: CropArea) => setArea(next)}
          />
        </Show>
      </ResponsiveOverlay>
    </Field>
  );
}
