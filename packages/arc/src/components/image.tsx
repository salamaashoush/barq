import { type Child, Show, createEffect, createSignal } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { ImageOff } from "@barqjs/lucide/icons/image-off";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { isServer } from "@barqjs/web";

import { arcLayer as arc } from "../layer.ts";
import { place } from "../lib/place.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bg, fg, gap, glyph, layout, motion, rounded, type } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

export type ImageStatus = "loading" | "loaded" | "error";

export const imageStyles = variants({
  slots: {
    root: arc(layout.relative, layout.clip, bg.muted, { display: "block", isolation: "isolate" }),
    placeholder: arc(place.cover, {
      backgroundSize: "cover",
      backgroundPosition: "center",
      filter: "blur(16px)",
      scale: "1.1",
    }),
    image: arc(motion.enter, layout.relative, place.block, place.fill, {
      transitionProperty: "opacity",
      "[data-status=loading]": { opacity: "0" },
    }),
    fallback: arc(
      layout.column,
      layout.centre,
      gap[2],
      fg.muted,
      type.meta,
      glyph.md,
      place.cover,
      {
        textAlign: "center",
      },
    ),
  },
  variants: {
    fit: {
      cover: { image: arc({ objectFit: "cover" }) },
      contain: { image: arc({ objectFit: "contain" }) },
    },
    rounded: {
      none: {},
      md: { root: rounded.md },
      lg: { root: rounded.lg },
      full: { root: rounded.full },
    },
  },
  defaults: { fit: "cover", rounded: "none" },
});

type Slots = ReturnType<typeof imageStyles>;

export interface ImageProps extends Customisable<Slots> {
  src: string;
  /** What the image shows, in words. `""` for one that only decorates. */
  alt: string;
  srcSet?: string;
  sizes?: string;
  width?: number;
  height?: number;
  /** The box's shape before the image arrives, so nothing moves when it does: `16 / 9`, `1`. */
  aspectRatio?: number | string;
  /** @default "cover" */
  fit?: "cover" | "contain";
  /** @default "none" */
  rounded?: "none" | "md" | "lg" | "full";
  /** Above the fold: loaded at once and early, rather than as it nears the screen. */
  priority?: boolean;
  /**
   * Drawn blurred under the image until it loads: a tiny data URL of it, or
   * any CSS colour.
   */
  placeholder?: string;
  /** In its place when it cannot load. @default an icon and "Image unavailable" */
  fallback?: Child;
  onStatusChange?: (status: ImageStatus) => void;
  id?: string;
}

/**
 * A picture that holds its place, loads when it is near, and fails visibly.
 *
 * ```tsx
 * <Image src={cover} alt="The harbour at dawn" aspectRatio={16 / 9} placeholder={blur} />
 * <Image src={avatar} alt="" aspectRatio={1} rounded="full" />
 * ```
 *
 * The box takes `aspectRatio` from the start, so the page does not jump when
 * the image arrives. It loads lazily unless `priority`, fades in over the
 * `placeholder` (instantly under reduced motion), and if it cannot load shows
 * `fallback`, which says so in arc's words. An image the browser already had
 * when the page hydrated is shown at once.
 */
export function Image(props: ImageProps) {
  const messages = useArcMessages();
  const node = makeRef<HTMLImageElement>();
  const [status, setStatus] = createSignal<ImageStatus>("loading", { ownedWrite: true });
  const settle = (next: ImageStatus): void => {
    if (status() === next) return;
    setStatus(next);
    props.onStatusChange?.(next);
  };
  if (!isServer) {
    createEffect(
      () => [node(), props.src] as const,
      ([element]) => {
        if (element === null) return;
        if (element.complete && element.naturalWidth > 0) settle("loaded");
        else if (element.complete && element.currentSrc !== "") settle("error");
        else settle("loading");
      },
    );
  }
  const cls = (): Slots =>
    parts(imageStyles({ fit: props.fit, rounded: props.rounded }), props.classes);
  const ratio = (): string | undefined =>
    props.aspectRatio === undefined ? undefined : String(props.aspectRatio);
  const blur = (): Record<string, string> => {
    const given = props.placeholder ?? "";
    return given.startsWith("data:") || given.startsWith("url(")
      ? { "background-image": given.startsWith("url(") ? given : `url("${given}")` }
      : { "background-color": given };
  };
  return (
    <span
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="image"
      data-status={status()}
      style={{ "aspect-ratio": ratio() }}
    >
      <Show when={props.placeholder !== undefined && status() !== "loaded"}>
        <span
          class={cls().placeholder}
          data-slot="image-placeholder"
          style={blur()}
          aria-hidden="true"
        />
      </Show>
      <img
        ref={node.set}
        class={cls().image}
        data-slot="image-img"
        data-status={status()}
        hidden={status() === "error"}
        src={props.src}
        srcset={props.srcSet}
        sizes={props.sizes}
        width={props.width}
        height={props.height}
        alt={props.alt}
        loading={props.priority === true ? "eager" : "lazy"}
        fetchpriority={props.priority === true ? "high" : undefined}
        decoding="async"
        onLoad={() => settle("loaded")}
        onError={() => settle("error")}
      />
      <Show when={status() === "error"}>
        <span
          class={cls().fallback}
          data-slot="image-fallback"
          role={props.alt === "" ? undefined : "img"}
          aria-label={props.alt === "" ? undefined : props.alt}
          aria-hidden={props.alt === "" ? "true" : undefined}
        >
          {props.fallback ?? (
            <>
              <ImageOff aria-hidden="true" />
              <span>{messages().imageUnavailable}</span>
            </>
          )}
        </span>
      </Show>
    </span>
  );
}
