import { Show, type Incoming } from "@barqjs/core";
import { firstThatWorks } from "@barqjs/css";

import "../theme/layers.ts";
import { ui, uiVariants } from "../lib/atoms.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { Separator, type SeparatorProps } from "./separator.tsx";

const group = ui({
  display: "flex",
  flexDirection: "column",
});

const separator = ui({
  marginBlock: "0px",
});

export type ItemVariant = "default" | "outline" | "muted";

export type ItemSize = "default" | "sm";

export const itemVariants = uiVariants({
  base: ui({
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    borderRadius: "calc(var(--radius) - 2px)",
    borderStyle: "var(--ui-border-style)",
    borderWidth: "1px",
    borderColor: "transparent",
    fontSize: "var(--text-sm)",
    lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --ui-gradient-from, --ui-gradient-via, --ui-gradient-to",
    transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
    transitionDuration: firstThatWorks(
      "100ms",
      "var(--ui-duration, var(--default-transition-duration))",
    ),
    "--ui-duration": "100ms",
    "--ui-outline-style": "none",
    outlineStyle: "none",
    ":focus-visible": {
      borderColor: "var(--ring)",
      "--ui-ring-shadow":
        "var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
      boxShadow:
        "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
      "--ui-ring-color": "var(--ring)",
      "@supports (color: color-mix(in lab, red, red))": {
        "--ui-ring-color": "color-mix(in oklab, var(--ring) 50%, transparent)",
      },
    },
    "a&": {
      transitionProperty:
        "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --ui-gradient-from, --ui-gradient-via, --ui-gradient-to",
      transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
      transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
    },
    "@media (hover: hover)": {
      "a&:hover": {
        backgroundColor: "var(--accent)",
      },
      "@supports (color: color-mix(in lab, red, red))": {
        "a&:hover": {
          backgroundColor: "color-mix(in oklab, var(--accent) 50%, transparent)",
        },
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
        backgroundColor: "var(--muted)",
        "@supports (color: color-mix(in lab, red, red))": {
          backgroundColor: "color-mix(in oklab, var(--muted) 50%, transparent)",
        },
      }),
    },
    size: {
      default: ui({
        gap: "calc(var(--spacing) * 4)",
        padding: "calc(var(--spacing) * 4)",
      }),
      sm: ui({
        gap: "calc(var(--spacing) * 2.5)",
        paddingInline: "calc(var(--spacing) * 4)",
        paddingBlock: "calc(var(--spacing) * 3)",
      }),
    },
  },
  defaults: { variant: "default", size: "default" },
});

export type ItemMediaVariant = "default" | "icon" | "image";

export const itemMediaVariants = uiVariants({
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
      icon: ui({
        width: "calc(var(--spacing) * 8)",
        height: "calc(var(--spacing) * 8)",
        borderRadius: "calc(var(--radius) - 4px)",
        borderStyle: "var(--ui-border-style)",
        borderWidth: "1px",
        backgroundColor: "var(--muted)",
        '& svg:not([class*="size-"])': {
          width: "calc(var(--spacing) * 4)",
          height: "calc(var(--spacing) * 4)",
        },
      }),
      image: ui({
        width: "calc(var(--spacing) * 10)",
        height: "calc(var(--spacing) * 10)",
        overflow: "hidden",
        borderRadius: "calc(var(--radius) - 4px)",
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
  '& + [data-slot="item-content"]': {
    flex: "none",
  },
});

const title = ui({
  display: "flex",
  width: "fit-content",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
  fontSize: "var(--text-sm)",
  lineHeight: firstThatWorks(
    "var(--leading-snug)",
    "var(--ui-leading, var(--text-sm--line-height))",
  ),
  "--ui-leading": "var(--leading-snug)",
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
});

const description = ui({
  overflow: "hidden",
  display: "-webkit-box",
  "-webkit-box-orient": "vertical",
  "-webkit-line-clamp": "2",
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
  const shared = (): Record<string, unknown> => ({
    ...uiProps("item", className, props),
    "data-variant": props.variant?.() ?? "default",
    "data-size": props.size?.() ?? "default",
  });

  return (
    <Show when={props.href?.() !== undefined} fallback={<div {...shared()}>{props.children}</div>}>
      <a {...shared()} href={props.href?.()}>
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
