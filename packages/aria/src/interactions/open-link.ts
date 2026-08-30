/**
 * Following a link the browser would not follow on its own.
 *
 * Two cases need it. A keyboard activation with a key other than Enter on an
 * element whose role was overridden to `link`: the browser only follows on
 * Enter, so anything else has to be dispatched here. And a non-anchor element
 * that carries `data-href`, which is how a pressable row or a menu item
 * behaves as a link without nesting one.
 *
 * The dispatch is a real click on a real anchor, so `target`, `download`,
 * `ping` and `rel` behave exactly as the platform defines them, and a client
 * router that is listening sees the navigation it expects.
 */

import { context, getContext } from "@barqjs/core";
import { focusWithoutScrolling } from "../dom.ts";
import { isFirefox, isIPad, isMac, isWebKit } from "../platform.ts";
import { setOpeningLink } from "./flags.ts";

export interface LinkModifiers {
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

export interface Router {
  /** Whether navigation is the browser's, rather than a client router's. */
  isNative: boolean;
  open: (target: Element, modifiers: LinkModifiers, href: string) => void;
  href: (href: string) => string;
}

const NATIVE_ROUTER: Router = {
  isNative: true,
  open: (target, modifiers) => withSyntheticLink(target, (link) => openLink(link, modifiers)),
  href: (href) => href,
};

/** The router every link in the tree navigates through. */
export const RouterContext = context<Router>(NATIVE_ROUTER);

/** The router in scope, or the browser's own. */
export function router(): Router {
  return getContext(RouterContext) ?? NATIVE_ROUTER;
}

/**
 * Whether the modifiers and the link itself allow a client-side navigation.
 *
 * `getAttribute("target")` rather than `link.target`: Firefox defaults the
 * property to `_parent` inside an iframe, which would refuse every navigation.
 */
export function shouldClientNavigate(link: HTMLAnchorElement, modifiers: LinkModifiers): boolean {
  const target = link.getAttribute("target");
  return (
    (!target || target === "_self") &&
    link.origin === location.origin &&
    !link.hasAttribute("download") &&
    !modifiers.metaKey &&
    !modifiers.ctrlKey &&
    !modifiers.altKey &&
    !modifiers.shiftKey
  );
}

/** Open an anchor as though the user had clicked it with `modifiers` held. */
export function openLink(
  target: HTMLAnchorElement,
  modifiers: LinkModifiers,
  setOpening = true,
): void {
  let { metaKey, ctrlKey } = modifiers;
  const { altKey, shiftKey } = modifiers;

  // Firefox does not count a keyboard event as a user action, so its popup
  // blocker stops `target="_blank"`. It does allow it with Command or Control
  // held, which opens a background tab instead.
  if (
    !isWebKit() &&
    isFirefox() &&
    window.event?.type?.startsWith("key") &&
    target.target === "_blank"
  ) {
    if (isMac()) metaKey = true;
    else ctrlKey = true;
  }

  // WebKit ignores modifier keys on a synthesised click but honours them on a
  // keyboard event.
  const event =
    isWebKit() && isMac() && !isIPad()
      ? new KeyboardEvent("keydown", {
          key: "Enter",
          metaKey,
          ctrlKey,
          altKey,
          shiftKey,
        })
      : new MouseEvent("click", {
          metaKey,
          ctrlKey,
          altKey,
          shiftKey,
          detail: 1,
          bubbles: true,
          cancelable: true,
        });

  setOpeningLink(setOpening);
  focusWithoutScrolling(target);
  target.dispatchEvent(event);
  setOpeningLink(false);
}

const LINK_DATA: [attribute: string, property: keyof HTMLAnchorElement][] = [
  ["data-target", "target"],
  ["data-rel", "rel"],
  ["data-download", "download"],
  ["data-ping", "ping"],
  ["data-referrer-policy", "referrerPolicy"],
];

/**
 * Run `open` with an anchor for `target`: itself when it is one, otherwise a
 * throwaway built from its `data-href` and removed again straight after.
 */
function withSyntheticLink(target: Element, open: (link: HTMLAnchorElement) => void): void {
  if (target instanceof HTMLAnchorElement) {
    open(target);
    return;
  }

  const href = target.getAttribute("data-href");
  if (href === null) return;

  const link = target.ownerDocument.createElement("a");
  link.href = href;
  for (const [attribute, property] of LINK_DATA) {
    const value = target.getAttribute(attribute);
    if (value !== null) (link as unknown as Record<string, string>)[property] = value;
  }

  target.appendChild(link);
  try {
    open(link);
  } finally {
    target.removeChild(link);
  }
}

/** The `data-*` attributes that make a non-anchor element behave as a link. */
export function syntheticLinkProps(props: {
  href?: string;
  target?: string;
  rel?: string;
  download?: boolean | string;
  ping?: string;
  referrerPolicy?: string;
}): Record<string, unknown> {
  return {
    "data-href": props.href === undefined ? undefined : router().href(props.href),
    "data-target": props.target,
    "data-rel": props.rel,
    "data-download": props.download,
    "data-ping": props.ping,
    "data-referrer-policy": props.referrerPolicy,
  };
}

/**
 * Hand a click on a link to the client router, when there is one and the
 * modifiers allow it.
 */
export function handleLinkClick(event: MouseEvent, href: string | undefined): void {
  const active = router();
  const target = event.currentTarget;
  if (
    active.isNative ||
    href === undefined ||
    !(target instanceof HTMLAnchorElement) ||
    !target.href ||
    event.defaultPrevented ||
    !shouldClientNavigate(target, event)
  ) {
    return;
  }

  event.preventDefault();
  active.open(target, event, href);
}
