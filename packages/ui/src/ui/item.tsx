import { Show, type Incoming } from "@barqjs/core";
import { clsx, css, variants } from "@barqjs/css";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { Separator, type SeparatorProps } from "./separator.tsx";

const group = css`
  @layer barq.ui {
    display: flex;
    flex-direction: column;
  }
`;

const separator = css`
  @layer barq.ui {
    margin-block: 0px;
  }
`;

export type ItemVariant = "default" | "outline" | "muted";

export type ItemSize = "default" | "sm";

export const itemVariants = variants({
  base: css`
    @layer barq.ui {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      border-radius: calc(var(--radius) - 2px);
      border-style: var(--ui-border-style);
      border-width: 1px;
      border-color: transparent;
      font-size: var(--text-sm);
      line-height: var(--ui-leading, var(--text-sm--line-height));
      transition-property:
        color, background-color, border-color, outline-color, text-decoration-color, fill, stroke,
        --ui-gradient-from, --ui-gradient-via, --ui-gradient-to;
      transition-timing-function: var(--ui-ease, var(--default-transition-timing-function));
      transition-duration: var(--ui-duration, var(--default-transition-duration));
      --ui-duration: 100ms;
      transition-duration: 100ms;
      --ui-outline-style: none;
      outline-style: none;
      &:focus-visible {
        border-color: var(--ring);
        --ui-ring-shadow: var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width))
          var(--ui-ring-color, currentcolor);
        box-shadow:
          var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
          var(--ui-ring-shadow), var(--ui-shadow);
        --ui-ring-color: var(--ring);
        @supports (color: color-mix(in lab, red, red)) {
          --ui-ring-color: color-mix(in oklab, var(--ring) 50%, transparent);
        }
      }
      a& {
        transition-property:
          color, background-color, border-color, outline-color, text-decoration-color, fill, stroke,
          --ui-gradient-from, --ui-gradient-via, --ui-gradient-to;
        transition-timing-function: var(--ui-ease, var(--default-transition-timing-function));
        transition-duration: var(--ui-duration, var(--default-transition-duration));
      }
      @media (hover: hover) {
        a&:hover {
          background-color: var(--accent);
        }
        @supports (color: color-mix(in lab, red, red)) {
          a&:hover {
            background-color: color-mix(in oklab, var(--accent) 50%, transparent);
          }
        }
      }
    }
  `,
  variants: {
    variant: {
      default: css`
        @layer barq.ui {
          background-color: transparent;
        }
      `,
      outline: css`
        @layer barq.ui {
          border-color: var(--border);
        }
      `,
      muted: css`
        @layer barq.ui {
          background-color: var(--muted);
          @supports (color: color-mix(in lab, red, red)) {
            background-color: color-mix(in oklab, var(--muted) 50%, transparent);
          }
        }
      `,
    },
    size: {
      default: css`
        @layer barq.ui {
          gap: calc(var(--spacing) * 4);
          padding: calc(var(--spacing) * 4);
        }
      `,
      sm: css`
        @layer barq.ui {
          gap: calc(var(--spacing) * 2.5);
          padding-inline: calc(var(--spacing) * 4);
          padding-block: calc(var(--spacing) * 3);
        }
      `,
    },
  },
  defaults: { variant: "default", size: "default" },
});

export type ItemMediaVariant = "default" | "icon" | "image";

export const itemMediaVariants = variants({
  base: css`
    @layer barq.ui {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      gap: calc(var(--spacing) * 2);
      & svg {
        pointer-events: none;
      }
      [data-slot="item"]:has([data-slot="item-description"]) & {
        --ui-translate-y: calc(var(--spacing) * 0.5);
        translate: var(--ui-translate-x) var(--ui-translate-y);
        align-self: flex-start;
      }
    }
  `,
  variants: {
    variant: {
      default: css`
        @layer barq.ui {
          background-color: transparent;
        }
      `,
      icon: css`
        @layer barq.ui {
          width: calc(var(--spacing) * 8);
          height: calc(var(--spacing) * 8);
          border-radius: calc(var(--radius) - 4px);
          border-style: var(--ui-border-style);
          border-width: 1px;
          background-color: var(--muted);
          & svg:not([class*="size-"]) {
            width: calc(var(--spacing) * 4);
            height: calc(var(--spacing) * 4);
          }
        }
      `,
      image: css`
        @layer barq.ui {
          width: calc(var(--spacing) * 10);
          height: calc(var(--spacing) * 10);
          overflow: hidden;
          border-radius: calc(var(--radius) - 4px);
          & img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
        }
      `,
    },
  },
  defaults: { variant: "default" },
});

const content = css`
  @layer barq.ui {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--spacing);
    & + [data-slot="item-content"] {
      flex: none;
    }
  }
`;

const title = css`
  @layer barq.ui {
    display: flex;
    width: fit-content;
    align-items: center;
    gap: calc(var(--spacing) * 2);
    font-size: var(--text-sm);
    line-height: var(--ui-leading, var(--text-sm--line-height));
    --ui-leading: var(--leading-snug);
    line-height: var(--leading-snug);
    --ui-font-weight: var(--font-weight-medium);
    font-weight: var(--font-weight-medium);
  }
`;

const description = css`
  @layer barq.ui {
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    font-size: var(--text-sm);
    line-height: var(--ui-leading, var(--text-sm--line-height));
    --ui-leading: var(--leading-normal);
    line-height: var(--leading-normal);
    --ui-font-weight: var(--font-weight-normal);
    font-weight: var(--font-weight-normal);
    text-wrap: balance;
    color: var(--muted-foreground);
    & > a {
      text-decoration-line: underline;
      text-underline-offset: 4px;
    }
    & > a:hover {
      color: var(--primary);
    }
  }
`;

const actions = css`
  @layer barq.ui {
    display: flex;
    align-items: center;
    gap: calc(var(--spacing) * 2);
  }
`;

const band = css`
  @layer barq.ui {
    display: flex;
    flex-basis: 100%;
    align-items: center;
    justify-content: space-between;
    gap: calc(var(--spacing) * 2);
  }
`;

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
      class={clsx(separator, props.class?.(), props.className?.())}
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
