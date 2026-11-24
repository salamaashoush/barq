import type { Router } from "@barqjs/aria/interactions";
import { type LinkProps, type RouterState, useLinkProps, useRouter } from "@barqjs/router";

/** Where a piece of navigation data points, in the router's terms. */
export interface LinkTarget {
  /** A route path, with `$params` filled from `params`. */
  to: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
  hash?: string;
  /** Active on this exact path only, rather than on it and everything under it. */
  exact?: boolean;
}

/** A link's behaviour for a part that draws its own anchor. */
export interface RouterLink {
  readonly href: () => string;
  readonly isActive: () => boolean;
  readonly onClick: (event: MouseEvent) => void;
  readonly onMouseEnter: (event: MouseEvent) => void;
  readonly onMouseLeave: (event: MouseEvent) => void;
}

/**
 * `useLinkProps`, read back as the three things a ui part takes by name.
 *
 * Its record's values are getters, so each is read through a function here
 * and stays live where a part binds it.
 */
export function routerLink(target: LinkTarget): RouterLink {
  const options: Record<string, unknown> = {
    to: target.to,
    // A target that names a search is a place of its own on that path, a
    // section or a tab, so it is current only while that search holds.
    activeOptions: { exact: target.exact === true, includeSearch: target.search !== undefined },
  };
  if (target.params !== undefined) options.params = target.params;
  if (target.search !== undefined) options.search = target.search;
  if (target.hash !== undefined) options.hash = target.hash;
  const link = useLinkProps(options as unknown as LinkProps);
  return {
    href: () => link.href as string,
    isActive: () => link["aria-current"] === "page",
    onClick: link.onClick as (event: MouseEvent) => void,
    onMouseEnter: link.onMouseEnter as (event: MouseEvent) => void,
    onMouseLeave: link.onMouseLeave as (event: MouseEvent) => void,
  };
}

/** The router this component renders under, or none outside one. */
export function maybeRouter(): RouterState | undefined {
  try {
    return useRouter();
  } catch {
    return undefined;
  }
}

/**
 * A router for `@barqjs/aria`'s links, over the app's own: an `href` they
 * follow goes through `@barqjs/router` rather than reloading the page.
 * Undefined outside a router, where the browser follows them.
 */
export function linkRouter(state: RouterState | undefined): Router | undefined {
  if (state === undefined) return undefined;
  return {
    isNative: false,
    open: (_target, modifiers, href) => {
      if (modifiers.metaKey || modifiers.ctrlKey || modifiers.shiftKey) {
        window.open(href, "_blank", "noopener");
        return;
      }
      void state.navigate(href);
    },
    href: (href) => href,
  };
}
