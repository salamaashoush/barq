import { Show, type Incoming } from "@barqjs/core";
import { firstThatWorks, layer, variants } from "@barqjs/css";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { icon } from "../lib/shared-icon.ts";
import { ring } from "../lib/shared-ring.ts";
import { text } from "../lib/shared-text.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { Separator, type SeparatorProps } from "./separator.tsx";

const ui = layer("barq.ui");

const group = ui("group/item-group", {
  display: "flex",
  width: "100%",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 4)",
  // The rows tighten with the size they are given, and the GROUP is what sees
  // that: an item carries `data-size` and the group reads it with `:has`.
  ':has([data-size="sm"])': {
    gap: "calc(var(--spacing) * 2.5)",
  },
  ':has([data-size="xs"])': {
    gap: "calc(var(--spacing) * 2)",
  },
});

const separator = ui({
  marginBlock: "calc(var(--spacing) * 2)",
});

export type ItemVariant = "default" | "outline" | "muted";

/**
 * `2xs` is for a LIST that is a control rather than a reading surface: a layers
 * panel, a token list, an outline. Twenty-five rows of `xs` is a scroll for
 * something a person is meant to take in at once.
 */
export type ItemSize = "default" | "sm" | "xs" | "2xs";

export const itemVariants = variants({
  // A marker: the media, the content and the description all read the item's
  // size back through `.group\/item[data-size=…]`.
  base: ui("group/item", box.border, text.sm, box.outline, ring.focus, {
    display: "flex",
    width: "100%",
    flexWrap: "wrap",
    alignItems: "center",
    borderRadius: "var(--radius)",
    borderColor: "transparent",
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --ui-gradient-from, --ui-gradient-via, --ui-gradient-to",
    transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
    transitionDuration: firstThatWorks(
      "100ms",
      "var(--ui-duration, var(--default-transition-duration))",
    ),
    "--ui-duration": "100ms",
    "a&": {
      transitionProperty:
        "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --ui-gradient-from, --ui-gradient-via, --ui-gradient-to",
      transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
      transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
    },
    "@media (hover: hover)": {
      "a&:hover": {
        backgroundColor: "var(--muted)",
      },
    },
  }),
  variants: {
    variant: {
      default: ui({
        backgroundColor: "transparent",
      }),
      outline: ui({
        borderColor: "var(--border)",
      }),
      muted: ui({
        borderColor: "transparent",
        backgroundColor: "var(--muted)",
        "@supports (color: color-mix(in lab, red, red))": {
          backgroundColor: "color-mix(in oklab, var(--muted) 50%, transparent)",
        },
      }),
    },
    size: {
      default: ui({
        gap: "calc(var(--spacing) * 2.5)",
        paddingInline: "calc(var(--spacing) * 3)",
        paddingBlock: "calc(var(--spacing) * 2.5)",
      }),
      // Between `default` and `xs`, and it has to differ from both: this was a
      // copy of `default`, so a caller asking for a smaller row got the same
      // row and reached for a class of their own to shrink it.
      sm: ui({
        gap: "calc(var(--spacing) * 2.5)",
        paddingInline: "calc(var(--spacing) * 3)",
        paddingBlock: "calc(var(--spacing) * 2)",
      }),
      xs: ui({
        gap: "calc(var(--spacing) * 2)",
        paddingInline: "calc(var(--spacing) * 2.5)",
        paddingBlock: "calc(var(--spacing) * 2)",
        // A row in a dropdown is the menu's own padding, not its own.
        '[data-slot="dropdown-menu-content"] &': {
          padding: "0px",
        },
      }),
      "2xs": ui({
        gap: "calc(var(--spacing) * 1.5)",
        paddingInline: "calc(var(--spacing) * 2)",
        paddingBlock: "calc(var(--spacing) * 1)",
        '[data-slot="dropdown-menu-content"] &': {
          padding: "0px",
        },
      }),
    },
  },
  defaults: { variant: "default", size: "default" },
});

export type ItemMediaVariant = "default" | "icon" | "image";

export const itemMediaVariants = variants({
  base: ui({
    display: "flex",
    flexShrink: "0",
    alignItems: "center",
    justifyContent: "center",
    gap: "calc(var(--spacing) * 2)",
    "& svg": {
      pointerEvents: "none",
    },
    '[data-slot="item"]:has([data-slot="item-description"]) &': {
      "--ui-translate-y": "calc(var(--spacing) * 0.5)",
      translate: "var(--ui-translate-x) var(--ui-translate-y)",
      alignSelf: "flex-start",
    },
  }),
  variants: {
    variant: {
      default: ui({
        backgroundColor: "transparent",
      }),
      // The box follows the ROW's density, the way `image` already does. It
      // did not, so a dense list came out with 32 px icons in 24 px rows and
      // the row was the icon's height whatever size it asked for.
      icon: ui(box.border, icon.sized, {
        width: "calc(var(--spacing) * 8)",
        height: "calc(var(--spacing) * 8)",
        borderRadius: "calc(var(--radius) * 0.6)",
        backgroundColor: "var(--muted)",
        ':is(:where(.group\\/item)[data-size="sm"] *)': {
          width: "calc(var(--spacing) * 7)",
          height: "calc(var(--spacing) * 7)",
        },
        ':is(:where(.group\\/item)[data-size="xs"] *)': {
          width: "calc(var(--spacing) * 6)",
          height: "calc(var(--spacing) * 6)",
        },
        ':is(:where(.group\\/item)[data-size="2xs"] *)': {
          width: "calc(var(--spacing) * 5)",
          height: "calc(var(--spacing) * 5)",
        },
      }),
      image: ui({
        width: "calc(var(--spacing) * 10)",
        height: "calc(var(--spacing) * 10)",
        overflow: "hidden",
        borderRadius: "calc(var(--radius) * 0.6)",
        ':is(:where(.group\\/item)[data-size="sm"] *)': {
          width: "calc(var(--spacing) * 8)",
          height: "calc(var(--spacing) * 8)",
        },
        ':is(:where(.group\\/item)[data-size="xs"] *)': {
          width: "calc(var(--spacing) * 6)",
          height: "calc(var(--spacing) * 6)",
        },
        "& img": {
          width: "100%",
          height: "100%",
          objectFit: "cover",
        },
      }),
    },
  },
  defaults: { variant: "default" },
});

const content = ui({
  display: "flex",
  flex: "1",
  flexDirection: "column",
  gap: "var(--spacing)",
  ':is(:where(.group\\/item)[data-size="xs"] *)': {
    gap: "0px",
  },
  ':is(:where(.group\\/item)[data-size="2xs"] *)': {
    gap: "0px",
  },
  '& + [data-slot="item-content"]': {
    flex: "none",
  },
});

const title = ui(text.medium, {
  overflow: "hidden",
  // `line-clamp-1 flex`: upstream writes both and the later class wins, so the
  // clamp's other three properties are there and the clamp itself does not
  // apply. Both declarations ship, in that order, so the computed value is
  // upstream's and a reader can see where it came from.
  display: firstThatWorks("flex", "-webkit-box"),
  "-webkit-box-orient": "vertical",
  "-webkit-line-clamp": "1",
  width: "fit-content",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
  textUnderlineOffset: "4px",
  fontSize: "var(--text-sm)",
  ':is(:where(.group\\/item)[data-size="2xs"] *)': {
    fontSize: "var(--text-xs)",
    lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  },
  lineHeight: firstThatWorks(
    "var(--leading-snug)",
    "var(--ui-leading, var(--text-sm--line-height))",
  ),
  "--ui-leading": "var(--leading-snug)",
});

const description = ui({
  overflow: "hidden",
  display: "-webkit-box",
  "-webkit-box-orient": "vertical",
  "-webkit-line-clamp": "2",
  textAlign: "start",
  fontSize: "var(--text-sm)",
  lineHeight: firstThatWorks(
    "var(--leading-normal)",
    "var(--ui-leading, var(--text-sm--line-height))",
  ),
  "--ui-leading": "var(--leading-normal)",
  "--ui-font-weight": "var(--font-weight-normal)",
  fontWeight: "var(--font-weight-normal)",
  textWrap: "balance",
  color: "var(--muted-foreground)",
  "& > a": {
    textDecorationLine: "underline",
    textUnderlineOffset: "4px",
  },
  "& > a:hover": {
    color: "var(--primary)",
  },
  ':is(:where(.group\\/item)[data-size="xs"] *)': {
    fontSize: "var(--text-xs)",
    lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  },
});

const actions = ui({
  display: "flex",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
});

const band = ui({
  display: "flex",
  flexBasis: "100%",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "calc(var(--spacing) * 2)",
});

/** A list of `<Item>`s. `role="list"`, so a reader counts them. */
export function ItemGroup(props: Incoming<UiProps>) {
  return (
    <div {...uiProps("item-group", group, props)} role={props.role?.() ?? "list"}>
      {props.children}
    </div>
  );
}

export interface ItemSeparatorProps extends SeparatorProps {}

export function ItemSeparator(props: Incoming<ItemSeparatorProps>) {
  return (
    <Separator
      {...props}
      data-slot={props["data-slot"]?.() ?? "item-separator"}
      orientation="horizontal"
      class={ui(separator, props.class?.(), props.className?.())}
    />
  );
}

export interface ItemProps extends UiProps {
  /** @default "default" */
  variant?: ItemVariant;
  /** @default "default" */
  size?: ItemSize;
  /** Turns the row into a link. The hover tint only applies to an `<a>`. */
  href?: string;
  target?: string;
  rel?: string;
}

/**
 * A row: media, a title and description, and whatever acts on it.
 *
 * ```tsx
 * <ItemGroup>
 *   <Item variant="outline">
 *     <ItemMedia variant="icon"><FileText /></ItemMedia>
 *     <ItemContent>
 *       <ItemTitle>Q3 report</ItemTitle>
 *       <ItemDescription>Uploaded two days ago.</ItemDescription>
 *     </ItemContent>
 *     <ItemActions><Button size="sm">Open</Button></ItemActions>
 *   </Item>
 * </ItemGroup>
 * ```
 *
 * Give it an `href` and it renders an `<a>` rather than being wrapped in one,
 * which is what shadcn's `asChild` is for and what barq has no element to clone
 * for.
 */
export function Item(props: Incoming<ItemProps>) {
  const className = (): string =>
    itemVariants({ variant: props.variant?.(), size: props.size?.() });
  const common = (): Record<string, unknown> => ({
    ...uiProps("item", className, props),
    "data-variant": props.variant?.() ?? "default",
    "data-size": props.size?.() ?? "default",
  });

  return (
    <Show when={props.href?.() !== undefined} fallback={<div {...common()}>{props.children}</div>}>
      <a {...common()} href={props.href?.()} target={props.target?.()} rel={props.rel?.()}>
        {props.children}
      </a>
    </Show>
  );
}

export interface ItemMediaProps extends UiProps {
  /** `icon` is a bordered square, `image` a rounded thumbnail. @default "default" */
  variant?: ItemMediaVariant;
}

export function ItemMedia(props: Incoming<ItemMediaProps>) {
  const className = (): string => itemMediaVariants({ variant: props.variant?.() });
  return (
    <div {...uiProps("item-media", className, props)} data-variant={props.variant?.() ?? "default"}>
      {props.children}
    </div>
  );
}

/** The growing column. A second one beside it does not grow, which is how a value column stays put. */
export function ItemContent(props: Incoming<UiProps>) {
  return <div {...uiProps("item-content", content, props)}>{props.children}</div>;
}

export function ItemTitle(props: Incoming<UiProps>) {
  return <div {...uiProps("item-title", title, props)}>{props.children}</div>;
}

export function ItemDescription(props: Incoming<UiProps>) {
  return <p {...uiProps("item-description", description, props)}>{props.children}</p>;
}

export function ItemActions(props: Incoming<UiProps>) {
  return <div {...uiProps("item-actions", actions, props)}>{props.children}</div>;
}

/** A full-width band above the row's columns. */
export function ItemHeader(props: Incoming<UiProps>) {
  return <div {...uiProps("item-header", band, props)}>{props.children}</div>;
}

/** A full-width band below them. */
export function ItemFooter(props: Incoming<UiProps>) {
  return <div {...uiProps("item-footer", band, props)}>{props.children}</div>;
}
