import { type LinkProps, useLinkProps } from "@barqjs/router";

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
    activeOptions: { exact: target.exact === true },
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
