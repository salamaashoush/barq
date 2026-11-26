import { Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { ExternalLink } from "@barqjs/lucide/icons/external-link";
import { Link2 } from "@barqjs/lucide/icons/link-2";
import { X } from "@barqjs/lucide/icons/x";
import { Skeleton } from "@barqjs/ui/skeleton";
import { srOnly } from "@barqjs/ui/sr-only";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  control,
  fg,
  gap,
  glyph,
  interaction,
  layout,
  motion,
  place,
  rounded,
  space,
  square,
  surface,
  truncate,
  type,
} from "../style/index.ts";
import { IconButton } from "./icon-button.tsx";
import { useArcMessages } from "./messages.ts";

export const linkPreviewStyles = variants({
  slots: {
    root: arc(
      surface.card,
      layout.relative,
      layout.minZero,
      layout.clip,
      motion.colours,
      interaction.hoverEdge,
      layout.row,
      { alignItems: "stretch" },
    ),
    media: arc(bg.muted, layout.noShrink, layout.clip, place.media),
    body: arc(layout.column, layout.minZero, layout.grow, gap[1], { padding: space.x3 }),
    site: arc(layout.row, layout.minZero, gap[1.5], type.meta, glyph.sm),
    favicon: arc(rounded.xs, layout.noShrink, { inlineSize: space.x3_5, blockSize: space.x3_5 }),
    host: arc(truncate),
    title: arc(type.label, layout.flush, layout.clamp2),
    link: control.stretched,
    description: arc(type.sm, fg.muted, layout.flush, layout.clamp2),
    end: arc(layout.relative, { zIndex: "1", padding: space.x1_5 }),
    external: arc(fg.muted, glyph.sm, layout.inlineCentre, square.x8),
    skeletonLine: arc({ blockSize: space.x4, inlineSize: "70%" }),
    skeletonShort: arc({ blockSize: space.x3, inlineSize: "40%" }),
  },
  variants: {
    layout: {
      row: { media: arc({ inlineSize: space.x16, minBlockSize: space.x16 }) },
      stacked: {
        root: arc({ flexDirection: "column" }),
        media: arc({ aspectRatio: "1.91 / 1", inlineSize: "100%" }),
        end: arc({ position: "absolute", insetBlockStart: space.x1, insetInlineEnd: space.x1 }),
      },
    },
  },
  defaults: { layout: "row" },
});

export type LinkPreviewSlots = ReturnType<typeof linkPreviewStyles>;

export interface LinkPreviewProps extends Customisable<LinkPreviewSlots> {
  /** Where it goes. */
  url: string;
  /** The page's title. Left out, the address is the link's words. */
  title?: string;
  description?: string;
  /** A picture of the page, decorative. */
  image?: string;
  /** The site's name, in place of its host. */
  siteName?: string;
  /** The site's icon, decorative. */
  favicon?: string;
  /** A button that takes the preview away, named "Remove preview". */
  onDismiss?: () => void;
  /** Shapes in place of the words while the preview is fetched. */
  loading?: boolean;
  /** The picture at the start, or across the top. @default "row" */
  layout?: "row" | "stacked";
  /** Opens in a new tab, said to a screen reader. @default true */
  newTab?: boolean;
  id?: string;
}

/** The host of `url`, or `url` itself where it does not parse. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * What a link is before it is opened: its site, title, a line about it and
 * a picture. A message's unfurled link, a pasted URL in a document.
 *
 * ```tsx
 * <LinkPreview url="https://example.com/post" title="Shipping arc" description="What changed…"
 *   image={card} siteName="Example" onDismiss={() => removeUnfurl(id)} />
 * ```
 *
 * The title is the link, stretched over the whole card, so a screen reader
 * hears one link named by the title and that it opens a new tab; the
 * picture and the site's icon are decorative, and the remove button is a
 * control of its own above the link.
 */
export function LinkPreview(props: LinkPreviewProps) {
  const messages = useArcMessages();
  function cls(): LinkPreviewSlots {
    return parts(linkPreviewStyles({ layout: props.layout }), props.classes);
  }
  function newTab(): boolean {
    return props.newTab !== false;
  }
  return (
    <article
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="link-preview"
      aria-busy={props.loading === true ? "true" : undefined}
    >
      <Show when={props.image !== undefined && props.loading !== true}>
        <div class={cls().media} data-slot="link-preview-media">
          <img src={props.image} alt="" loading="lazy" />
        </div>
      </Show>
      <div class={cls().body} data-slot="link-preview-body">
        <div class={cls().site} data-slot="link-preview-site">
          <Show when={props.favicon !== undefined} fallback={<Link2 aria-hidden="true" />}>
            <img class={cls().favicon} src={props.favicon} alt="" />
          </Show>
          <span class={cls().host}>{props.siteName ?? hostOf(props.url)}</span>
        </div>
        <Show
          when={props.loading !== true}
          fallback={
            <>
              <Skeleton class={cls().skeletonLine} />
              <Skeleton class={cls().skeletonShort} />
              <a class={srOnly} href={props.url}>
                {props.url}
              </a>
            </>
          }
        >
          <p class={cls().title} data-slot="link-preview-title">
            <a
              class={cls().link}
              data-slot="link-preview-link"
              href={props.url}
              target={newTab() ? "_blank" : undefined}
              rel={newTab() ? "noopener noreferrer" : undefined}
            >
              {props.title ?? props.url}
              <Show when={newTab()}>
                <span class={srOnly}>{` (${messages().opensInNewTab})`}</span>
              </Show>
            </a>
          </p>
          <Show when={props.description !== undefined}>
            <p class={cls().description} data-slot="link-preview-description">
              {props.description}
            </p>
          </Show>
        </Show>
      </div>
      <div class={cls().end} data-slot="link-preview-end">
        <Show when={props.onDismiss !== undefined}>
          <IconButton
            label={messages().removePreview}
            size="sm"
            slot="link-preview-dismiss"
            onPress={() => props.onDismiss?.()}
          >
            <X />
          </IconButton>
        </Show>
        <Show when={props.onDismiss === undefined && newTab()}>
          <span class={cls().external} aria-hidden="true">
            <ExternalLink />
          </span>
        </Show>
      </div>
    </article>
  );
}
