import type { Incoming } from "@barqjs/core";
import { clsx, css } from "@barqjs/css";
import { ChevronLeft } from "@barqjs/lucide/icons/chevron-left";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { Ellipsis } from "@barqjs/lucide/icons/ellipsis";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { buttonVariants, type ButtonSize } from "./button.tsx";
import { srOnly } from "./sr-only.ts";

const root = css`
  @layer barq.ui {
    margin-inline: auto;
    display: flex;
    width: 100%;
    justify-content: center;
  }
`;

const content = css`
  @layer barq.ui {
    margin: 0px;
    display: flex;
    list-style-type: none;
    flex-direction: row;
    align-items: center;
    gap: var(--spacing);
    padding: 0px;
  }
`;

const edge = css`
  @layer barq.ui {
    gap: var(--spacing);
    padding-inline: calc(var(--spacing) * 2.5);
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
 * <Pagination>
 *   <PaginationContent>
 *     <PaginationItem><PaginationPrevious href="?page=1" /></PaginationItem>
 *     <PaginationItem><PaginationLink href="?page=1" isActive>1</PaginationLink></PaginationItem>
 *     <PaginationItem><PaginationEllipsis /></PaginationItem>
 *     <PaginationItem><PaginationNext href="?page=3" /></PaginationItem>
 *   </PaginationContent>
 * </Pagination>
 * ```
 *
 * Links, not buttons: a page is an address, and a middle-click on page three
 * should open page three.
 */
export function Pagination(props: Incoming<UiProps>) {
  return (
    <nav
      {...uiProps("pagination", root, props)}
      role="navigation"
      aria-label={props["aria-label"]?.() ?? "pagination"}
    >
      {props.children}
    </nav>
  );
}

export function PaginationContent(props: Incoming<UiProps>) {
  return <ul {...uiProps("pagination-content", content, props)}>{props.children}</ul>;
}

export function PaginationItem(props: Incoming<UiProps>) {
  return <li {...uiProps("pagination-item", "", props)}>{props.children}</li>;
}

export interface PaginationLinkProps extends UiProps {
  href?: string;
  /** The page you are on. Writes `aria-current="page"`. */
  isActive?: boolean;
  /** @default "icon" */
  size?: ButtonSize;
}

export function PaginationLink(props: Incoming<PaginationLinkProps>) {
  const className = (): string =>
    buttonVariants({
      variant: props.isActive?.() === true ? "outline" : "ghost",
      size: props.size?.() ?? "icon",
    });

  return (
    <a
      {...uiProps("pagination-link", className, props)}
      href={props.href?.()}
      aria-current={props.isActive?.() === true ? "page" : undefined}
      data-active={props.isActive?.() === true ? "" : undefined}
    >
      {props.children}
    </a>
  );
}

export interface PaginationEdgeProps extends Omit<PaginationLinkProps, "size"> {
  /** The word beside the chevron. Hidden on a narrow screen. */
  label?: string;
}

export function PaginationPrevious(props: Incoming<PaginationEdgeProps>) {
  return (
    <PaginationLink
      {...props}
      size="default"
      aria-label={props["aria-label"]?.() ?? "Go to previous page"}
      class={clsx(edge, props.class?.())}
    >
      <ChevronLeft />
      <span class={wide}>{() => props.label?.() ?? "Previous"}</span>
    </PaginationLink>
  );
}

export function PaginationNext(props: Incoming<PaginationEdgeProps>) {
  return (
    <PaginationLink
      {...props}
      size="default"
      aria-label={props["aria-label"]?.() ?? "Go to next page"}
      class={clsx(edge, props.class?.())}
    >
      <span class={wide}>{() => props.label?.() ?? "Next"}</span>
      <ChevronRight />
    </PaginationLink>
  );
}

/** The word beside a chevron: gone below `sm`, where the chevron says enough. */
const wide = css`
  @layer barq.ui {
    display: none;

    @media (width >= 40rem) {
      display: block;
    }
  }
`;

export function PaginationEllipsis(props: Incoming<UiProps>) {
  return (
    <span {...uiProps("pagination-ellipsis", ellipsis, props)} aria-hidden="true">
      <Ellipsis />
      <span class={srOnly}>More pages</span>
    </span>
  );
}
