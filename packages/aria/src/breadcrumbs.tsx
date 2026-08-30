/**
 * Breadcrumbs: where you are, and every step back to the top.
 *
 * A `<nav>` with a name, holding an ordered list of links. Three details are
 * what separate it from a row of links:
 *
 * - **The current page is still a LINK, marked `aria-current="page"`.** That
 *   is what the authoring practices have, and the alternative is worse: an
 *   `<a>` with no `href` has no role at all, so it is announced as text while
 *   looking like something to press.
 * - **The separator is not content.** A "/" between the items belongs to the
 *   stylesheet, or to an element marked `aria-hidden`; announced, it is read
 *   as "slash" between every pair.
 * - **The list is ordered.** `<ol>` says the sequence matters, which is the
 *   whole point of a trail.
 */

import {
  type Child,
  For,
  context,
  getContext,
  getOwner,
  type Incoming,
  install,
} from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import type { ItemAccessors, Key, Node } from "./collections.ts";
import { buildCollection, type ListCollection } from "./collections.ts";
import { focusRing } from "./focus.ts";
import { hover } from "./interactions/hover.ts";
import type { ElementRef, PressEvent } from "./interactions/press.ts";
import { link, type LinkOptions } from "./link.tsx";
import {
  access,
  filterDOMProps,
  fromProps,
  mergeProps,
  styleProps,
  type DOMProps,
  type MaybeAccessor,
  type StyleProps,
} from "./utils.ts";

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface BreadcrumbsOptions {
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
}

export interface BreadcrumbsResult {
  navProps: DOMProps;
}

export function breadcrumbs(options: BreadcrumbsOptions = {}): BreadcrumbsResult {
  return {
    navProps: mergeProps(filterDOMProps(options, { labelable: true }), {
      // Named, because a page with more than one landmark of a kind needs
      // telling apart, and "Breadcrumbs" is what a user of one calls it.
      "aria-label": () => access(options["aria-label"]) ?? "Breadcrumbs",
    }),
  };
}

export interface BreadcrumbItemOptions extends Omit<LinkOptions, "elementType"> {
  /** Where you are now. Still a link, and says so with `aria-current`. */
  isCurrent?: MaybeAccessor<boolean | undefined>;
  /** What kind of current. @default "page" */
  "aria-current"?: MaybeAccessor<
    "page" | "step" | "location" | "date" | "time" | boolean | undefined
  >;
  /** @default "a" */
  elementType?: MaybeAccessor<string | undefined>;
}

export interface BreadcrumbItemResult {
  itemProps: DOMProps;
  isPressed: ReturnType<typeof link>["isPressed"];
}

export function breadcrumbItem(
  options: BreadcrumbItemOptions,
  ref?: ElementRef,
): BreadcrumbItemResult {
  const isCurrent = (): boolean => access(options.isCurrent) === true;
  const elementType = (): string => access(options.elementType) ?? "a";
  const isHeading = (): boolean => /^h[1-6]$/.test(elementType());

  const { linkProps, isPressed } = link({ ...options, elementType }, ref);

  return {
    isPressed,
    itemProps: mergeProps(
      // A heading is not a link at all, so it takes none of the link's
      // behaviour: `<h1>Current page</h1>` is a perfectly good last crumb.
      isHeading() ? {} : linkProps,
      {
        "aria-disabled": () => access(options.isDisabled) === true || undefined,
        // The current crumb stays a LINK, as the authoring practices have it:
        // `aria-current="page"` is what says you are already there, and a link
        // with no `href` has no role at all — it is a span that looks like one.
        "aria-current": () =>
          isCurrent() ? (access(options["aria-current"]) ?? "page") : undefined,
      },
    ),
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface BreadcrumbsContextValue {
  isDisabled: () => boolean;
  onAction: () => ((key: Key) => void) | undefined;
}

const BreadcrumbsContext = context<BreadcrumbsContextValue | null>(null);
const CrumbNodeContext = context<{ node: Node<unknown>; isLast: boolean } | null>(null);

export function useBreadcrumbs(): BreadcrumbsContextValue {
  const value = getContext(BreadcrumbsContext);
  if (value === null || value === undefined) {
    throw new Error("A Breadcrumb must be rendered inside Breadcrumbs.");
  }
  return value;
}

/** The collection node the crumb being built is for, and whether it is last. */
export function useCrumb(): { node: Node<unknown>; isLast: boolean } {
  const value = getContext(CrumbNodeContext);
  if (value === null || value === undefined) {
    throw new Error("A Breadcrumb must be rendered inside Breadcrumbs' item callback.");
  }
  return value;
}

export interface BreadcrumbsComponentProps<T> extends StyleProps, ItemAccessors<T> {
  /** The trail, from the top down. The last one is where you are. */
  items: Iterable<T>;
  /** How one crumb renders. Return a `<Breadcrumb>`. */
  children: (item: T) => Child;
  isDisabled?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  ref?: RefTarget<HTMLElement>;
  onAction?: (key: Key) => void;
}

/**
 * ```tsx
 * <Breadcrumbs items={trail()} onAction={(key) => go(key)}>
 *   {(crumb) => <Breadcrumb>{crumb.name}</Breadcrumb>}
 * </Breadcrumbs>
 * ```
 */
export function Breadcrumbs<T>(props: Incoming<BreadcrumbsComponentProps<T>>) {
  const options = fromProps(props as unknown as Incoming<Record<string, unknown>>);
  const { navProps } = breadcrumbs(options);

  const collection = (): ListCollection<T> =>
    buildCollection(props.items(), props as unknown as ItemAccessors<T>);

  const owner = getOwner();
  if (owner !== null) {
    install(owner, BreadcrumbsContext, () => ({
      isDisabled: () => props.isDisabled?.() === true,
      onAction: () => props.onAction?.(),
    }));
  }

  const elementProps = mergeProps(navProps, styleProps(props), {
    "data-testid": () => props["data-testid"]?.(),
  });

  const render = props.children as unknown as (scope: unknown, item: T) => Child;

  return (
    <nav {...elementProps} ref={mergeRefs(props.ref?.())}>
      <ol>
        <For each={() => [...collection()]}>
          {(node: Node<T>) => {
            const rowOwner = getOwner();
            if (rowOwner !== null) {
              install(rowOwner, CrumbNodeContext, () => ({
                node: node as Node<unknown>,
                isLast: node.nextKey === undefined,
              }));
            }
            return render(rowOwner, node.value as T);
          }}
        </For>
      </ol>
    </nav>
  );
}

export interface BreadcrumbComponentProps extends StyleProps {
  children?: Child;
  href?: string;
  target?: string;
  rel?: string;
  isDisabled?: boolean;
  /** Override which crumb is the current one. @default the last */
  isCurrent?: boolean;
  ref?: RefTarget<HTMLAnchorElement>;
  onPress?: (event: PressEvent) => void;
}

/**
 * One crumb.
 *
 * The last is the current page, marked `aria-current="page"`. A crumb with no
 * `href` renders as a `<span>`: an anchor without one is not a link, and
 * dressing it as one is a promise the markup does not keep.
 */
export function Breadcrumb(props: Incoming<BreadcrumbComponentProps>) {
  const domRef = makeRef<HTMLAnchorElement>();
  const trail = useBreadcrumbs();
  const { node, isLast } = useCrumb();

  const isCurrent = (): boolean => props.isCurrent?.() ?? isLast;
  const href = (): string | undefined => props.href?.() ?? (node.props?.href as string | undefined);

  const isDisabled = (): boolean => props.isDisabled?.() === true || trail.isDisabled();

  /**
   * Whether this crumb is a link at all.
   *
   * A disabled one is not: `link` takes the `href` off it, and an `<a>` with
   * no `href` has no role — so it would be announced as text while still
   * looking like something to press.
   */
  const isLink = (): boolean => href() !== undefined && !isDisabled();

  const { itemProps, isPressed } = breadcrumbItem(
    {
      isCurrent,
      isDisabled,
      href,
      target: () => props.target?.(),
      rel: () => props.rel?.(),
      onPress: (event) => {
        props.onPress?.()?.(event);
        trail.onAction()?.(node.key);
      },
    },
    domRef,
  );

  const { hoverProps, isHovered } = hover({ isDisabled });
  const { focusProps, isFocusVisible } = focusRing();

  const elementProps = mergeProps(itemProps, hoverProps, focusProps, styleProps(props), {
    "data-current": isCurrent,
    "data-pressed": isPressed,
    "data-hovered": isHovered,
    "data-focus-visible": isFocusVisible,
    "data-disabled": isDisabled,
    "data-testid": () => props["data-testid"]?.(),
  });

  return (
    <li>
      {() =>
        !isLink() ? (
          <span
            {...elementProps}
            ref={mergeRefs(domRef.set as unknown as RefTarget<HTMLSpanElement>)}
          >
            {props.children}
          </span>
        ) : (
          <a {...elementProps} ref={mergeRefs(domRef.set, props.ref?.())}>
            {props.children}
          </a>
        )
      }
    </li>
  );
}
