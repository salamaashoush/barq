import type { Child, Incoming } from "@barqjs/core";
import { css } from "@barqjs/css";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { Ellipsis } from "@barqjs/lucide/icons/ellipsis";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { srOnly } from "./sr-only.ts";

const list = css`
  @layer barq.ui {
    margin: 0px;
    display: flex;
    list-style-type: none;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(var(--spacing) * 1.5);
    padding: 0px;
    font-size: var(--text-sm);
    line-height: var(--ui-leading, var(--text-sm--line-height));
    overflow-wrap: break-word;
    color: var(--muted-foreground);
    @media (width >= 40rem) {
      & {
        gap: calc(var(--spacing) * 2.5);
      }
    }
  }
`;

const item = css`
  @layer barq.ui {
    display: inline-flex;
    align-items: center;
    gap: calc(var(--spacing) * 1.5);
  }
`;

const link = css`
  @layer barq.ui {
    transition-property:
      color, background-color, border-color, outline-color, text-decoration-color, fill, stroke,
      --ui-gradient-from, --ui-gradient-via, --ui-gradient-to;
    transition-timing-function: var(--ui-ease, var(--default-transition-timing-function));
    transition-duration: var(--ui-duration, var(--default-transition-duration));
    @media (hover: hover) {
      &:hover {
        color: var(--foreground);
      }
    }
  }
`;

const page = css`
  @layer barq.ui {
    --ui-font-weight: var(--font-weight-normal);
    font-weight: var(--font-weight-normal);
    color: var(--foreground);
  }
`;

const separator = css`
  @layer barq.ui {
    display: inline-flex;
    align-items: center;
    & > svg {
      width: calc(var(--spacing) * 3.5);
      height: calc(var(--spacing) * 3.5);
    }
  }
`;

const ellipsis = css`
  @layer barq.ui {
    display: flex;
    width: calc(var(--spacing) * 9);
    height: calc(var(--spacing) * 9);
    align-items: center;
    justify-content: center;
  }
`;

/**
 * ```tsx
 * <Breadcrumb>
 *   <BreadcrumbList>
 *     <BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem>
 *     <BreadcrumbSeparator />
 *     <BreadcrumbItem><BreadcrumbPage>Invoices</BreadcrumbPage></BreadcrumbItem>
 *   </BreadcrumbList>
 * </Breadcrumb>
 * ```
 *
 * Written out rather than taken from `items`, which is the opposite of what
 * this package does for a collection — and right here, because a breadcrumb is
 * a handful of links with no keyboard behaviour, no selection and no roving
 * focus. `@barqjs/aria`'s `<Breadcrumbs>` is the collection-driven one, with
 * all of that.
 */
export function Breadcrumb(props: Incoming<UiProps>) {
  return (
    <nav {...uiProps("breadcrumb", "", props)} aria-label={props["aria-label"]?.() ?? "breadcrumb"}>
      {props.children}
    </nav>
  );
}

export function BreadcrumbList(props: Incoming<UiProps>) {
  return <ol {...uiProps("breadcrumb-list", list, props)}>{props.children}</ol>;
}

export function BreadcrumbItem(props: Incoming<UiProps>) {
  return <li {...uiProps("breadcrumb-item", item, props)}>{props.children}</li>;
}

export interface BreadcrumbLinkProps extends UiProps {
  href?: string;
  target?: string;
  rel?: string;
}

export function BreadcrumbLink(props: Incoming<BreadcrumbLinkProps>) {
  return (
    <a
      {...uiProps("breadcrumb-link", link, props)}
      href={props.href?.()}
      target={props.target?.()}
      rel={props.rel?.()}
    >
      {props.children}
    </a>
  );
}

/**
 * Where you are. Not a link, and `aria-current="page"` is what says so — the
 * last crumb being unclickable is a visual convention a screen reader cannot
 * see.
 */
export function BreadcrumbPage(props: Incoming<UiProps>) {
  return (
    <span
      {...uiProps("breadcrumb-page", page, props)}
      role="link"
      aria-disabled="true"
      aria-current="page"
    >
      {props.children}
    </span>
  );
}

export interface BreadcrumbSeparatorProps extends UiProps {
  children?: Child;
}

export function BreadcrumbSeparator(props: Incoming<BreadcrumbSeparatorProps>) {
  return (
    <li
      {...uiProps("breadcrumb-separator", separator, props)}
      role="presentation"
      aria-hidden="true"
    >
      {() => props.children?.() ?? <ChevronRight />}
    </li>
  );
}

/** The gap in a shortened trail. */
export function BreadcrumbEllipsis(props: Incoming<UiProps>) {
  return (
    <span
      {...uiProps("breadcrumb-ellipsis", ellipsis, props)}
      role="presentation"
      aria-hidden="true"
    >
      <Ellipsis />
      <span class={srOnly}>More</span>
    </span>
  );
}
