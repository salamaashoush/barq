import { type Child, Show, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Button as AriaButton } from "@barqjs/aria/button";
import type { PressEvent } from "@barqjs/aria/interactions";
import { Link as AriaLink } from "@barqjs/aria/link";
import { controllable } from "@barqjs/aria/utils";
import { Checkbox } from "@barqjs/ui/checkbox";
import { contrast } from "@barqjs/ui/shared-contrast";
import type { RenderPart } from "@barqjs/ui/slot";
import { tokens } from "@barqjs/ui/theme/tokens";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts, rendered } from "../lib/parts.ts";
import {
  bg,
  control,
  fg,
  focus,
  gap,
  layout,
  motion,
  place,
  space,
  surface,
  type,
} from "../style/index.ts";

export const tileStyles = variants({
  slots: {
    root: arc(
      surface.card,
      layout.relative,
      layout.minZero,
      layout.clip,
      motion.colours,
      contrast.edge,
      layout.column,
      { "[data-disabled]": { opacity: "0.6" } },
    ),
    media: arc(layout.noShrink, layout.clip, bg.muted, {
      "& > :is(img, video, picture)": {
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "cover",
      },
    }),
    body: arc(layout.column, layout.minZero, layout.grow, gap[1.5], { padding: space.x4 }),
    header: arc(layout.row, gap[2], { alignItems: "flex-start" }),
    heading: arc(layout.column, layout.minZero, layout.grow, gap[1]),
    eyebrow: arc(type.meta),
    title: arc(type.label, layout.flush, fg.default),
    target: arc(control.bare, focus.none, place.afterLayer, {
      textDecorationLine: "none",
      textAlign: "start",
      "::after": { inset: "0", borderRadius: "inherit" },
      "[data-focus-visible]::after": {
        outlineWidth: "2px",
        outlineStyle: "solid",
        outlineColor: tokens.ring,
        outlineOffset: "-2px",
      },
    }),
    description: arc(type.sm, fg.muted, layout.flush),
    footer: arc(layout.row, layout.wrap, gap[2], {
      marginBlockStart: "auto",
      paddingBlockStart: space.x2,
    }),
    actions: arc(layout.row, layout.relative, gap[1], { zIndex: "1" }),
    check: arc(layout.relative, { zIndex: "1", alignSelf: "flex-start" }),
  },
  variants: {
    mediaPosition: {
      top: { media: arc({ aspectRatio: "16 / 9" }) },
      start: {
        root: arc({ flexDirection: "row" }),
        media: arc({ width: "33%", minWidth: space.x16 }),
      },
    },
    interactive: {
      true: {
        root: arc({
          "@media (hover: hover)": {
            ":hover": { borderColor: "var(--border-strong, var(--ring))" },
          },
        }),
      },
      false: {},
    },
    selected: {
      true: {
        root: arc({ borderColor: tokens.primary, boxShadow: `0 0 0 1px ${tokens.primary}` }),
      },
      false: {},
    },
  },
  defaults: { mediaPosition: "top", interactive: false, selected: false },
});

type Slots = ReturnType<typeof tileStyles>;

export interface TileRenders {
  title?: RenderPart<Child>;
}

export interface TileProps extends Customisable<Slots> {
  title: Child;
  description?: Child;
  /** Above the title: a kind, a date, a status. */
  eyebrow?: Child;
  /** An image or a video, full bleed. */
  media?: Child;
  /** @default "top" */
  mediaPosition?: "top" | "start";
  /** Under the description, pushed to the tile's foot. */
  footer?: Child;
  /** At the top end: buttons that stay their own controls on an interactive tile. */
  actions?: Child;
  /** The whole tile is a link here. */
  href?: string;
  /** The whole tile is a button. */
  onPress?: (event: PressEvent) => void;
  /** A checkbox in the corner, the whole tile pressing it: a tile chosen among others. */
  selected?: boolean;
  defaultSelected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  isDisabled?: boolean;
  /** Another element for the title: an `<h3>` in a list under a heading. */
  renders?: TileRenders;
  id?: string;
}

/**
 * A card for one thing in a collection: a project, a template, a product.
 *
 * ```tsx
 * <Tile title="Northwind" description="12 checks" href="/projects/northwind" />
 * <Tile title="Starter" media={<img src={cover} alt="" />} selected={picked()} onSelectedChange={pick} />
 * ```
 *
 * With `href` or `onPress` the tile is one target: its title is the link or
 * the button, stretched over the whole card, so a screen reader hears one
 * name and the `actions` inside stay controls of their own. With `selected`
 * a checkbox named by the title holds the choice, and a press anywhere on
 * the tile toggles it. `media` sits on top or at the start, full bleed.
 */
export function Tile(props: TileProps) {
  const titleId = createUniqueId();
  function selectable(): boolean {
    return (
      props.selected !== undefined ||
      props.defaultSelected !== undefined ||
      props.onSelectedChange !== undefined
    );
  }
  const [selected, setSelected] = controllable<boolean>(
    () => props.selected,
    () => props.defaultSelected ?? false,
    (next) => props.onSelectedChange?.(next),
  );
  function interactive(): boolean {
    return props.href !== undefined || props.onPress !== undefined || selectable();
  }
  function cls(): Slots {
    return parts(
      tileStyles({
        mediaPosition: props.mediaPosition,
        interactive: interactive() && props.isDisabled !== true,
        selected: selectable() && selected(),
      }),
      props.classes,
    );
  }

  function titleContent(): Child {
    if (props.href !== undefined) {
      return (
        <AriaLink
          class={cls().target}
          data-slot="tile-target"
          href={props.href}
          isDisabled={props.isDisabled}
        >
          {props.title}
        </AriaLink>
      );
    }
    if (props.onPress !== undefined) {
      return (
        <AriaButton
          class={cls().target}
          data-slot="tile-target"
          isDisabled={props.isDisabled}
          onPress={(event: PressEvent) => props.onPress?.(event)}
        >
          {props.title}
        </AriaButton>
      );
    }
    return props.title;
  }

  return (
    <article
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="tile"
      data-selected={selectable() && selected() ? "" : undefined}
      data-disabled={props.isDisabled === true ? "" : undefined}
      aria-labelledby={titleId}
      onClick={(event: MouseEvent) => {
        if (!selectable() || props.isDisabled === true) return;
        const target = event.target as Element | null;
        if (target?.closest("button, a, input, label, [role=checkbox]") !== null) return;
        setSelected(!selected());
      }}
    >
      <Show when={props.media !== undefined}>
        <div class={cls().media} data-slot="tile-media">
          {props.media}
        </div>
      </Show>
      <div class={cls().body} data-slot="tile-body">
        <div class={cls().header} data-slot="tile-header">
          <div class={cls().heading} data-slot="tile-heading">
            <Show when={props.eyebrow !== undefined}>
              <span class={cls().eyebrow} data-slot="tile-eyebrow">
                {props.eyebrow}
              </span>
            </Show>
            {props.renders?.title === undefined ? (
              <p class={cls().title} id={titleId} data-slot="tile-title">
                {titleContent()}
              </p>
            ) : (
              rendered(
                props.renders.title,
                { class: cls().title, id: titleId, "data-slot": "tile-title" },
                titleContent(),
              )
            )}
          </div>
          <Show when={props.actions !== undefined}>
            <div class={cls().actions} data-slot="tile-actions">
              {props.actions}
            </div>
          </Show>
          <Show when={selectable()}>
            <span class={cls().check} data-slot="tile-check">
              <Checkbox
                isSelected={selected()}
                isDisabled={props.isDisabled}
                aria-labelledby={titleId}
                onChange={(next: boolean) => setSelected(next)}
              />
            </span>
          </Show>
        </div>
        <Show when={props.description !== undefined}>
          <p class={cls().description} data-slot="tile-description">
            {props.description}
          </p>
        </Show>
        <Show when={props.footer !== undefined}>
          <div class={cls().footer} data-slot="tile-footer">
            {props.footer}
          </div>
        </Show>
      </div>
    </article>
  );
}
