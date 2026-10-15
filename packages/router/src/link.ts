/**
 * What a link DOES, apart from the element it is drawn on.
 *
 * `<Link>` binds this onto an `<a>` it builds; `useLinkProps` hands the same
 * thing to an element the caller owns, and `createLink` to a component of the
 * caller's. One implementation, so the three cannot disagree about what a click
 * commits or what a hover warms.
 */

import { type Incoming, onCleanup, readSlot, toString, untrack } from "@barqjs/core";

import type { ActiveOptions, NavLinkProps, PreloadStrategy } from "./components.ts";
import { isUnder, withoutTrailingSlash } from "./path.ts";
import { publicHref } from "./rewrite.ts";
import type { BuiltLocation, NavigateOptions, RouterState } from "./router.ts";

/** Hover before it counts as intent. TanStack's default, and it is a good one. */
const PRELOAD_DELAY = 50;

type Props = Incoming<NavLinkProps>;
type Attributes = Record<string, string | null | undefined>;

/**
 * The props `<Link>` and `<NavLink>` interpret themselves. Everything else is
 * an attribute of the anchor.
 */
export const LINK_OWN_PROPS: ReadonlySet<string> = new Set([
  "to",
  "preload",
  "preloadDelay",
  "params",
  "search",
  "hash",
  "replace",
  "state",
  "mask",
  "class",
  "from",
  "reloadDocument",
  "ignoreBlocker",
  "hashScrollIntoView",
  "disabled",
  "resetScroll",
  "viewTransition",
  "children",
  "activeClass",
  "end",
  "activeOptions",
  "activeProps",
  "inactiveProps",
]);

/**
 * The DOM event a prop name addresses, or `null` for an ordinary attribute.
 *
 * `onClick` and `onclick` both, because `IntrinsicElements["a"]` declares each
 * spelling and an author may write either.
 */
export function eventNameOf(name: string): string | null {
  if (!name.startsWith("on") || name.length < 3) return null;
  const rest = name.slice(2);
  // `on-` prefixed data attributes are not events; a letter has to follow.
  if (!/^[a-zA-Z]/.test(rest)) return null;
  return rest.toLowerCase();
}

/**
 * A prop that is a value, an accessor for one, or a FUNCTION of the current one.
 *
 * Every prop in barq is a slot, so an updater and an accessor look the same
 * from here. Calling it with the current value serves both: an accessor ignores
 * its argument and an updater gets what it needs. TWICE at most, because the
 * compiler wraps a JSX attribute in an accessor and an updater written in a
 * route file arrives as `() => (prev) => ({...})`.
 */
function updated(slot: unknown, current: unknown): unknown {
  const once = typeof slot === "function" ? (slot as (given: unknown) => unknown)(current) : slot;
  return typeof once === "function" ? (once as (given: unknown) => unknown)(current) : once;
}

const flag = (slot: unknown, name: string): boolean | undefined =>
  slot === undefined ? undefined : Boolean(readSlot(slot, name));

/** A link's props as the navigation they describe. */
export function linkNavigation(state: RouterState, props: Props): NavigateOptions {
  const given = (slot: unknown, name: string): unknown =>
    slot === undefined ? undefined : readSlot(slot, name);
  return {
    to: readSlot(props.to, "Link.to") as string,
    from: given(props.from, "Link.from") as string | undefined,
    params:
      props.params === undefined
        ? undefined
        : (updated(props.params, state.params()) as NavigateOptions["params"]),
    search:
      props.search === undefined
        ? undefined
        : (updated(props.search, state.validSearch()) as NavigateOptions["search"]),
    hash:
      props.hash === undefined
        ? undefined
        : (updated(props.hash, state.location().hash.slice(1)) as NavigateOptions["hash"]),
    state: given(props.state, "Link.state"),
    mask: given(props.mask, "Link.mask") as NavigateOptions["mask"],
    replace: flag(props.replace, "Link.replace"),
    resetScroll: flag(props.resetScroll, "Link.resetScroll"),
    viewTransition: given(
      props.viewTransition,
      "Link.viewTransition",
    ) as NavigateOptions["viewTransition"],
    hashScrollIntoView: given(
      props.hashScrollIntoView,
      "Link.hashScrollIntoView",
    ) as NavigateOptions["hashScrollIntoView"],
    ignoreBlocker: flag(props.ignoreBlocker, "Link.ignoreBlocker"),
    reloadDocument: flag(props.reloadDocument, "Link.reloadDocument"),
  };
}

/** Whether a link points at where you are, for either backend. */
export function linkIsActive(
  state: RouterState,
  href: string,
  end: boolean,
  options?: ActiveOptions,
): boolean {
  // Split once: `to` may carry a query and a fragment now that `<Link>` writes
  // both, and comparing the whole string against a pathname never matched.
  const hashAt = href.indexOf("#");
  const withoutHash = hashAt === -1 ? href : href.slice(0, hashAt);
  const linkHash = hashAt === -1 ? "" : href.slice(hashAt + 1);
  const queryAt = withoutHash.indexOf("?");
  const to = queryAt === -1 ? withoutHash : withoutHash.slice(0, queryAt);
  const linkQuery = queryAt === -1 ? "" : withoutHash.slice(queryAt + 1);

  // COMPARED without either trailing slash. The location a browser arrived at
  // is whatever was typed or linked, so `/about/` against a link built as
  // `/about` was inactive — and under `trailingSlash: "always"` the two sides
  // disagree the other way round.
  const here = withoutTrailingSlash(state.location().pathname);
  const target = withoutTrailingSlash(to);
  const exact = options?.exact ?? end;
  if (!(exact ? here === target : isUnder(here, target))) return false;

  if (options?.includeSearch === true) {
    // A SUBSET rather than an equality: a link to `?tab=a` is active on
    // `?tab=a&page=2`, which is what a tab strip beside a paginator needs.
    const current = state.search();
    for (const [key, value] of new URLSearchParams(linkQuery)) {
      if (current.get(key) !== value) return false;
    }
  }
  if (options?.includeHash === true) {
    const currentHash = state.location().hash.replace(/^#/, "");
    if (currentHash !== linkHash) return false;
  }
  return true;
}

/** Where a link points and whether that is here: the half both backends render. */
export interface LinkState {
  readonly target: () => BuiltLocation;
  /** The `href` attribute: base and rewrite applied. */
  readonly href: () => string;
  /** Whether this link is tracking "you are here" at all. A plain `<Link>` is not. */
  readonly tracksActive: boolean;
  readonly isActive: () => boolean;
  readonly isDisabled: () => boolean;
  /** `class`, with the active class appended while active. */
  readonly className: () => string;
  /** `activeProps` while active and `inactiveProps` while not, `class` excluded. */
  readonly stateAttributes: () => Attributes;
  /** Every attribute name either record can set, so a flip removes what the other set. */
  readonly stateAttributeNames: readonly string[];
}

/** Everything a link does, for whatever element it ends up on. */
export interface LinkBehavior extends LinkState {
  readonly strategy: () => PreloadStrategy;
  readonly warm: () => void;
  readonly onClick: (event: MouseEvent) => void;
  readonly onIntent: () => void;
  readonly onLeave: () => void;
  readonly onTouch: () => void;
}

/**
 * `activeClass` is the class a `<NavLink>` adds without being asked, or `null`
 * for a `<Link>`, which marks itself active only when given `activeProps`,
 * `inactiveProps` or `activeOptions`.
 */
export function linkState(state: RouterState, props: Props, activeClass: string | null): LinkState {
  // Read inside the effect, not captured at construction: a surviving `<Link>`
  // under a layout must re-resolve when the location moves, or it points at the
  // path it was built under forever.
  const target = (): BuiltLocation => state.buildLocation(linkNavigation(state, props));
  const tracksActive =
    activeClass !== null ||
    props.activeProps !== undefined ||
    props.inactiveProps !== undefined ||
    props.activeOptions !== undefined;

  const isActive = (): boolean =>
    tracksActive &&
    linkIsActive(
      state,
      target().href,
      flag(props.end, "NavLink.end") ?? false,
      props.activeOptions === undefined
        ? undefined
        : (readSlot(props.activeOptions, "NavLink.activeOptions") as ActiveOptions),
    );
  const isDisabled = (): boolean => flag(props.disabled, "Link.disabled") === true;

  const record = (slot: unknown, name: string): Attributes => {
    if (slot === undefined) return {};
    const read = readSlot(slot, name);
    return ((typeof read === "function" ? (read as () => unknown)() : read) ?? {}) as Attributes;
  };
  const current = (): Attributes =>
    isActive()
      ? record(props.activeProps, "NavLink.activeProps")
      : record(props.inactiveProps, "NavLink.inactiveProps");

  const className = (): string => {
    const own = props.class === undefined ? "" : (readSlot(props.class, "Link.class") as string);
    const named =
      activeClass === null || !isActive()
        ? ""
        : props.activeClass === undefined
          ? activeClass
          : (readSlot(props.activeClass, "NavLink.activeClass") as string);
    return `${own ?? ""} ${named} ${current().class ?? ""}`.replace(/\s+/g, " ").trim();
  };

  const stateAttributes = (): Attributes => {
    const { class: _class, ...rest } = current();
    return rest;
  };
  const stateAttributeNames = untrack(() => [
    ...new Set([
      ...Object.keys(record(props.activeProps, "NavLink.activeProps")),
      ...Object.keys(record(props.inactiveProps, "NavLink.inactiveProps")),
    ]),
  ]).filter((name) => name !== "class");

  return {
    target,
    href: (): string =>
      publicHref(target().href, {
        rewrite: state.config.rewrite,
        origin: state.config.origin,
        base: state.base,
      }),
    tracksActive,
    isActive,
    isDisabled,
    className,
    stateAttributes,
    stateAttributeNames,
  };
}

/** Must run under an owner: the intent timer is cleared when it is disposed. */
export function linkBehavior(
  state: RouterState,
  props: Props,
  activeClass: string | null,
): LinkBehavior {
  const link = linkState(state, props, activeClass);
  const { target, isDisabled } = link;

  // The strategy is read WHEN A LISTENER FIRES, so a link whose prop moves acts
  // on what it now says.
  const strategy = (): PreloadStrategy =>
    props.preload === undefined
      ? // The router's answer when the link does not give one. `false` still,
        // unless a project turned preloading on for every link at once.
        (state.config.defaults?.preload ?? false)
      : ((readSlot(props.preload, "Link.preload") as PreloadStrategy) ?? false);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const warm = (): void => {
    if (target().external) return;
    void state.preloadRoute(linkNavigation(state, props));
  };
  const onLeave = (): void => {
    clearTimeout(timer);
    timer = undefined;
  };
  // Cleared on UNMOUNT as well as on leave. The old router cleared only on
  // `mouseleave`, so unmounting inside the hover window still fired a preload
  // against a disposed scope.
  onCleanup(onLeave);

  const onIntent = (): void => {
    if (strategy() !== "intent" || timer !== undefined) return;
    const delay =
      props.preloadDelay === undefined
        ? (state.config.defaults?.preloadDelay ?? PRELOAD_DELAY)
        : (readSlot(props.preloadDelay, "Link.preloadDelay") as number);
    timer = setTimeout(() => {
      timer = undefined;
      warm();
    }, delay);
  };

  const onTouch = (): void => {
    if (strategy() !== "intent") return;
    onLeave();
    warm();
  };

  const onClick = (event: MouseEvent): void => {
    if (isDisabled()) {
      // Refused entirely: no navigation and no document load either.
      event.preventDefault();
      return;
    }
    const to = target();
    if (to.external) return;
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.currentTarget instanceof Element ? event.currentTarget : null;
    if (anchor?.hasAttribute("download") === true || anchor?.getAttribute("target") === "_blank") {
      return;
    }
    // `reloadDocument` hands the click back to the browser, which is the whole
    // of it: no `preventDefault`, so the anchor navigates the document.
    if (flag(props.reloadDocument, "Link.reloadDocument") === true) return;
    event.preventDefault();
    void state.navigate(linkNavigation(state, props));
  };

  return { ...link, strategy, warm, onClick, onIntent, onLeave, onTouch };
}

/** The link's own handlers, by the DOM event each answers. */
const HANDLED = {
  click: "onClick",
  mouseenter: "onIntent",
  mouseleave: "onLeave",
  focusin: "onIntent",
  blur: "onLeave",
  touchstart: "onTouch",
} as const;

/** A prop a link did not interpret, as the attribute value it becomes. */
export function attributeValue(slot: unknown, name: string): string | null {
  const resolved = readSlot(slot, `Link.${name}`);
  // `false` and `null` REMOVE, so `download={false}` is not the string "false",
  // which is truthy as an attribute and would enable it.
  return resolved === false || resolved === null || resolved === undefined
    ? null
    : toString(resolved);
}

/**
 * A link's behaviour as PROPS for an element: `href`, the handlers, and the
 * attributes that follow its state.
 *
 * The values that move are getters, so spreading the record onto an element
 * keeps them live.
 */
export function linkElementProps(
  state: RouterState,
  props: Props,
  activeClass: string | null,
): Record<string, unknown> {
  const link = linkBehavior(state, props, activeClass);
  const out: Record<string, unknown> = {
    onClick: link.onClick,
    onMouseEnter: link.onIntent,
    onMouseLeave: link.onLeave,
    onFocusIn: link.onIntent,
    onBlur: link.onLeave,
    onTouchStart: link.onTouch,
  };
  const live = (name: string, get: () => unknown): void => {
    Object.defineProperty(out, name, { get, enumerable: true });
  };
  for (const name of Object.keys(props)) {
    if (LINK_OWN_PROPS.has(name)) continue;
    const slot = (props as Record<string, unknown>)[name];
    const event = eventNameOf(name);
    if (event === null) {
      live(name, (): unknown => attributeValue(slot, name));
      continue;
    }
    // The caller's handler runs FIRST, so one that calls `preventDefault` is
    // seen by the link's own, which then leaves the click alone.
    const own = event in HANDLED ? link[HANDLED[event as keyof typeof HANDLED]] : undefined;
    const theirs = slot as (payload: Event) => void;
    for (const key of Object.keys(out)) {
      if (key.toLowerCase() === name.toLowerCase()) delete out[key];
    }
    out[name] =
      own === undefined
        ? theirs
        : (payload: Event): void => {
            theirs(payload);
            (own as (given: Event) => void)(payload);
          };
  }
  live("href", link.href);
  live("class", (): unknown => link.className() || undefined);
  live("aria-disabled", (): unknown => (link.isDisabled() ? "true" : undefined));
  if (link.tracksActive) {
    live("aria-current", (): unknown => (link.isActive() ? "page" : undefined));
    live("data-status", (): unknown => (link.isActive() ? "active" : undefined));
    for (const name of link.stateAttributeNames) {
      live(name, (): unknown => link.stateAttributes()[name] ?? undefined);
    }
  }
  if (untrack(link.strategy) === "render") link.warm();
  return out;
}
