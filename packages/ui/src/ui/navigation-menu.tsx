import {
  context,
  effect,
  getContext,
  getOwner,
  provide,
  Show,
  signal,
  type Child,
  type Incoming,
} from "@barqjs/core";
import type { Key } from "@barqjs/aria/collections";
import { navigationMenuState, type NavigationMenuState } from "@barqjs/aria/navigation";
import { firstThatWorks, layer } from "@barqjs/css";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { ref as makeRef } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import { uiProps } from "../lib/slot.ts";

import type { UiProps } from "../lib/props.ts";

const ui = layer("barq.ui");

const root = ui({
  position: "relative",
  display: "flex",
  maxWidth: "max-content",
  flex: "1",
  alignItems: "center",
  justifyContent: "center",
});

const list = ui({
  display: "flex",
  flex: "1",
  listStyleType: "none",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--spacing)",
});

const item = ui({
  position: "relative",
});

const trigger = ui({
  display: "inline-flex",
  height: "calc(var(--spacing) * 9)",
  width: "max-content",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "calc(var(--radius) - 2px)",
  backgroundColor: "var(--background)",
  paddingInline: "calc(var(--spacing) * 4)",
  paddingBlock: "calc(var(--spacing) * 2)",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
  transitionProperty: "color,box-shadow",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  "@media (hover: hover)": {
    ":hover": {
      backgroundColor: "var(--accent)",
      color: "var(--accent-foreground)",
    },
    '[data-state="open"]:hover': {
      backgroundColor: "var(--accent)",
    },
  },
  ":focus": {
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
  },
  ":focus-visible": {
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
    "--ui-ring-color": "var(--ring)",
    outlineStyle: "var(--ui-outline-style)",
    outlineWidth: "1px",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--ring) 50%, transparent)",
    },
  },
  ":disabled": {
    pointerEvents: "none",
    opacity: "50%",
  },
  '[data-state="open"]': {
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
    "@supports (color: color-mix(in lab, red, red))": {
      backgroundColor: "color-mix(in oklab, var(--accent) 50%, transparent)",
    },
  },
  '[data-state="open"]:focus': {
    backgroundColor: "var(--accent)",
  },
});

const triggerIcon = ui({
  position: "relative",
  top: "1px",
  marginLeft: "var(--spacing)",
  width: "calc(var(--spacing) * 3)",
  height: "calc(var(--spacing) * 3)",
  transitionProperty:
    "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --ui-gradient-from, --ui-gradient-via, --ui-gradient-to, opacity, box-shadow, transform, translate, scale, rotate, filter, -webkit-backdrop-filter, backdrop-filter, display, content-visibility, overlay, pointer-events",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  transitionDuration: firstThatWorks(
    "300ms",
    "var(--ui-duration, var(--default-transition-duration))",
  ),
  "--ui-duration": "300ms",
  ':is(:where(.group)[data-state="open"] *)': {
    rotate: "180deg",
  },
});

const content = ui({
  top: "0px",
  left: "0px",
  width: "100%",
  padding: "calc(var(--spacing) * 2)",
  paddingRight: "calc(var(--spacing) * 2.5)",
  '[data-motion="from-end"]': {
    "--ui-enter-translate-x": "calc(52*var(--spacing))",
  },
  '[data-motion="from-start"]': {
    "--ui-enter-translate-x": "calc(52*var(--spacing)*-1)",
  },
  '[data-motion="to-end"]': {
    "--ui-exit-translate-x": "calc(52*var(--spacing))",
  },
  '[data-motion="to-start"]': {
    "--ui-exit-translate-x": "calc(52*var(--spacing)*-1)",
  },
  '[data-motion^="from-"]': {
    animation:
      "enter var(--ui-animation-duration,var(--ui-duration,.15s))var(--ui-ease,ease)var(--ui-animation-delay,0s)var(--ui-animation-iteration-count,1)var(--ui-animation-direction,normal)var(--ui-animation-fill-mode,none)",
    "--ui-enter-opacity": "0",
  },
  '[data-motion^="to-"]': {
    animation:
      "exit var(--ui-animation-duration,var(--ui-duration,.15s))var(--ui-ease,ease)var(--ui-animation-delay,0s)var(--ui-animation-iteration-count,1)var(--ui-animation-direction,normal)var(--ui-animation-fill-mode,none)",
    "--ui-exit-opacity": "0",
  },
  "@media (width >= 48rem)": {
    "&": {
      position: "absolute",
      width: "auto",
    },
  },
});

const viewportWrapper = ui({
  position: "absolute",
  top: "100%",
  left: "0px",
  isolation: "isolate",
  zIndex: "50",
  display: "flex",
  justifyContent: "center",
});

const viewport = ui({
  position: "relative",
  marginTop: "calc(var(--spacing) * 1.5)",
  width: "100%",
  overflow: "hidden",
  borderRadius: "calc(var(--radius) - 2px)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  backgroundColor: "var(--popover)",
  color: "var(--popover-foreground)",
  "--ui-shadow":
    "0 1px 3px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 1px 2px -1px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  '[data-state="closed"]': {
    animation:
      "exit var(--ui-animation-duration,var(--ui-duration,.15s))var(--ui-ease,ease)var(--ui-animation-delay,0s)var(--ui-animation-iteration-count,1)var(--ui-animation-direction,normal)var(--ui-animation-fill-mode,none)",
    "--ui-exit-scale": firstThatWorks(".95", "calc(95*1%)"),
  },
  '[data-state="open"]': {
    animation:
      "enter var(--ui-animation-duration,var(--ui-duration,.15s))var(--ui-ease,ease)var(--ui-animation-delay,0s)var(--ui-animation-iteration-count,1)var(--ui-animation-direction,normal)var(--ui-animation-fill-mode,none)",
    "--ui-enter-scale": firstThatWorks(".9", "calc(90*1%)"),
  },
});

const link = ui({
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing)",
  borderRadius: "calc(var(--radius) - 4px)",
  padding: "calc(var(--spacing) * 2)",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  transitionProperty: "all",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  "@media (hover: hover)": {
    ":hover": {
      backgroundColor: "var(--accent)",
      color: "var(--accent-foreground)",
    },
    '[data-active="true"]:hover': {
      backgroundColor: "var(--accent)",
    },
  },
  ":focus": {
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
  },
  ":focus-visible": {
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
    "--ui-ring-color": "var(--ring)",
    outlineStyle: "var(--ui-outline-style)",
    outlineWidth: "1px",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--ring) 50%, transparent)",
    },
  },
  '[data-active="true"]': {
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
    "@supports (color: color-mix(in lab, red, red))": {
      backgroundColor: "color-mix(in oklab, var(--accent) 50%, transparent)",
    },
  },
  '[data-active="true"]:focus': {
    backgroundColor: "var(--accent)",
  },
  "& svg:not([class*='size-'])": {
    width: "calc(var(--spacing) * 4)",
    height: "calc(var(--spacing) * 4)",
  },
  "& svg:not([class*='text-'])": {
    color: "var(--muted-foreground)",
  },
});

const indicator = ui({
  top: "100%",
  zIndex: "1",
  display: "flex",
  height: "calc(var(--spacing) * 1.5)",
  alignItems: "flex-end",
  justifyContent: "center",
  overflow: "hidden",
  '[data-state="hidden"]': {
    animation:
      "exit var(--ui-animation-duration,var(--ui-duration,.15s))var(--ui-ease,ease)var(--ui-animation-delay,0s)var(--ui-animation-iteration-count,1)var(--ui-animation-direction,normal)var(--ui-animation-fill-mode,none)",
    "--ui-exit-opacity": "0",
  },
  '[data-state="visible"]': {
    animation:
      "enter var(--ui-animation-duration,var(--ui-duration,.15s))var(--ui-ease,ease)var(--ui-animation-delay,0s)var(--ui-animation-iteration-count,1)var(--ui-animation-direction,normal)var(--ui-animation-fill-mode,none)",
    "--ui-enter-opacity": "0",
  },
});

const indicatorArrow = ui({
  position: "relative",
  top: "60%",
  height: "calc(var(--spacing) * 2)",
  width: "calc(var(--spacing) * 2)",
  rotate: "45deg",
  borderTopLeftRadius: "calc(var(--radius) - 4px)",
  backgroundColor: "var(--border)",
  "--ui-shadow":
    "0 4px 6px -1px var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 2px 4px -2px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
});

interface MenuValue {
  readonly state: NavigationMenuState;
  /** Every item, in the order they were declared: the direction is measured from it. */
  readonly order: () => Key[];
  readonly register: (key: Key) => void;
  readonly hasViewport: () => boolean;
  /** Where the open panel's content is measured to, for the viewport to grow into. */
  readonly measured: () => { width: number; height: number } | null;
  readonly measure: (box: { width: number; height: number } | null) => void;
  /**
   * Whether what is open was opened by the POINTER arriving rather than by a
   * press, which decides what the press that follows means.
   */
  readonly viaHover: () => boolean;
  readonly setViaHover: (value: boolean) => void;
}

const MenuContext = context<MenuValue | null>(null);
const ItemContext = context<Key | null>(null);

function useMenu(): MenuValue {
  const value = getContext(MenuContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a <NavigationMenu>.");
  }
  return value;
}

function useItem(): Key {
  const value = getContext(ItemContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a <NavigationMenuItem>.");
  }
  return value;
}

export interface NavigationMenuProps extends UiProps {
  value?: Key | null;
  defaultValue?: Key | null;
  /**
   * Draw one shared panel that grows to whatever is open, rather than a panel
   * per item. @default true
   */
  viewport?: boolean;
  onValueChange?: (value: Key | null) => void;
}

/**
 * ```tsx
 * <NavigationMenu>
 *   <NavigationMenuList>
 *     <NavigationMenuItem value="products">
 *       <NavigationMenuTrigger>Products</NavigationMenuTrigger>
 *       <NavigationMenuContent>…</NavigationMenuContent>
 *     </NavigationMenuItem>
 *   </NavigationMenuList>
 * </NavigationMenu>
 * ```
 *
 * Not a menu, and the difference is the whole component. A menu opens from a
 * press and closes on choosing; this opens on HOVER, keeps the panel while the
 * pointer travels to it, and slides sideways when the pointer reaches the next
 * trigger rather than closing and reopening. `@barqjs/aria`'s
 * `navigationMenuState` holds that, including which side a panel arrived from,
 * because the animation is the only thing separating this from a row of
 * popovers.
 */
export function NavigationMenu(props: Incoming<NavigationMenuProps>) {
  const order = signal<Key[]>([]);
  const measured = signal<{ width: number; height: number } | null>(null);
  const hovered = signal(false);

  const state = navigationMenuState({
    value: () => props.value?.(),
    defaultValue: () => props.defaultValue?.(),
    onValueChange: (next) => props.onValueChange?.()?.(next),
  });

  const value: MenuValue = {
    state,
    order,
    register(key) {
      // Declaration order, and it has to be stable: the motion direction is an
      // index comparison, so a list that reorders itself would animate the
      // wrong way. An item registers once and stays where it was.
      if (!order().includes(key)) order.set([...order(), key]);
    },
    hasViewport: () => props.viewport?.() ?? true,
    measured,
    measure: (box) => measured.set(box),
    viaHover: hovered,
    setViaHover: (next) => hovered.set(next),
  };

  return (
    <nav
      {...uiProps("navigation-menu", ui(root, "group/navigation-menu"), props)}
      data-viewport={() => String(value.hasViewport())}
      onMouseLeave={() => state.closeSoon()}
    >
      <MenuProvider value={value}>{props.children}</MenuProvider>
    </nav>
  );
}

/**
 * The context, and nothing else.
 *
 * `provide`'s callback must build no JSX: one that does closes over the scope
 * at the CALL site, so the children go up beside the context rather than under
 * it and every `useMenu` throws.
 */
function MenuProvider(props: Incoming<{ value: MenuValue; children?: Child }>) {
  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;
  return provide(
    owner,
    MenuContext,
    () => props.value(),
    () => props.children,
  ) as never;
}

export function NavigationMenuList(props: Incoming<UiProps>) {
  return <ul {...uiProps("navigation-menu-list", ui(list, "group"), props)}>{props.children}</ul>;
}

export interface NavigationMenuItemProps extends UiProps {
  /** What identifies this item to the shared state. */
  value: Key;
}

export function NavigationMenuItem(props: Incoming<NavigationMenuItemProps>) {
  const menu = useMenu();
  menu.register(props.value());

  return (
    <li
      {...uiProps("navigation-menu-item", item, props)}
      onMouseEnter={() => {
        // Only when entering DID the opening. Entering an item that is already
        // open changes nothing, so marking it hover-opened would make the press
        // that follows a no-op forever.
        if (menu.state.value() !== props.value()) menu.setViaHover(true);
        menu.state.openSoon(props.value());
      }}
    >
      <ItemProvider value={props.value()}>{props.children}</ItemProvider>
    </li>
  );
}

function ItemProvider(props: Incoming<{ value: Key; children?: Child }>) {
  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;
  return provide(
    owner,
    ItemContext,
    () => props.value(),
    () => props.children,
  ) as never;
}

export function NavigationMenuTrigger(props: Incoming<UiProps>) {
  const menu = useMenu();
  const key = useItem();
  const open = (): boolean => menu.state.value() === key;

  return (
    <button
      {...uiProps("navigation-menu-trigger", ui(trigger, "group"), props)}
      type="button"
      aria-expanded={() => (open() ? "true" : "false")}
      data-state={() => (open() ? "open" : "closed")}
      // A press does not TOGGLE, and a browser is what said so. Reaching a
      // trigger with a mouse means entering it first, which opens the panel on
      // hover — so a toggle found it already open and shut it again: the panel
      // flashed and the trigger appeared dead. Focusing it had the same effect
      // for the same reason, which is why nothing opens on focus either.
      //
      // So a press closes only what a press opened. `viaHover` is that
      // distinction, and it is cleared here so the SECOND press does close it.
      onClick={() => {
        if (open() && !menu.viaHover()) {
          menu.state.close();
          return;
        }
        menu.setViaHover(false);
        menu.state.open(key);
      }}
    >
      {props.children}
      <ChevronDown class={triggerIcon} aria-hidden="true" />
    </button>
  );
}

/**
 * One item's panel.
 *
 * Rendered only while it is the open one, so the DOM holds one panel rather
 * than one per item. `data-motion` says which side it arrived from or is
 * leaving towards, which is what the slide animation reads; with nothing to
 * compare against the attribute is absent rather than invented.
 */
export function NavigationMenuContent(props: Incoming<UiProps>) {
  const menu = useMenu();
  const key = useItem();
  const box = makeRef<HTMLDivElement>();
  const open = (): boolean => menu.state.value() === key;

  // The viewport grows to whatever is open, so the panel has to say how big it
  // is. `offsetWidth`, not `getBoundingClientRect`: every panel enters with a
  // scale animation, and a transformed box reports what it is PAINTED at.
  effect(() => {
    if (!open() || !menu.hasViewport()) return undefined;
    const element = box();
    if (element === null || element === undefined) return undefined;
    const report = (): void =>
      menu.measure({ width: element.offsetWidth, height: element.offsetHeight });
    report();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  });

  // `<Show>`, not a bare ternary. A conditional at a component's ROOT is
  // evaluated once and returned as an array of one, so the panel would render
  // whatever `open()` said at mount and never move: `aria-expanded` on the
  // trigger flipped and no panel ever appeared. `<Show>` is the primitive for a
  // reactive conditional and lowers to a branch the runtime re-runs.
  return (
    <Show when={open()}>
      <div
        {...uiProps("navigation-menu-content", content, props)}
        ref={box.set}
        data-state="open"
        data-motion={() => menu.state.motion(key, menu.order()) ?? undefined}
        onMouseEnter={() => menu.state.keep()}
      >
        {props.children}
      </div>
    </Show>
  );
}

/**
 * The shared panel every item's content is drawn into.
 *
 * shadcn's grows to the open content's box, and that is the reason it exists:
 * one panel that resizes reads as a single surface moving, where a panel per
 * item reads as popovers appearing. The size arrives as two custom properties,
 * so the animation is the stylesheet's decision rather than this component's.
 */
export function NavigationMenuViewport(props: Incoming<UiProps>) {
  const menu = useMenu();
  const open = (): boolean => menu.state.value() !== null;

  return (
    <div class={viewportWrapper} data-slot="navigation-menu-viewport-wrapper">
      <div
        {...uiProps("navigation-menu-viewport", viewport, props)}
        data-state={() => (open() ? "open" : "closed")}
        // The measured box arrives as custom properties, so how the viewport
        // grows into it is the stylesheet's decision rather than this
        // component's. `Object.fromEntries` because a `--*` key and a plain one
        // in the same literal do not share a type.
        style={() => {
          const box = menu.measured();
          const entries: [string, string][] =
            box === null
              ? []
              : [
                  ["--barq-viewport-width", `${String(box.width)}px`],
                  ["--barq-viewport-height", `${String(box.height)}px`],
                  ["height", "var(--barq-viewport-height)"],
                ];
          return Object.fromEntries(entries);
        }}
      >
        {props.children}
      </div>
    </div>
  );
}

export interface NavigationMenuLinkProps extends UiProps {
  href?: string;
  isActive?: boolean;
}

export function NavigationMenuLink(props: Incoming<NavigationMenuLinkProps>) {
  return (
    <a
      {...uiProps("navigation-menu-link", link, props)}
      href={props.href?.()}
      data-active={() => (props.isActive?.() === true ? "true" : undefined)}
    >
      {props.children}
    </a>
  );
}

/** The little arrow that points at whichever trigger is open. */
export function NavigationMenuIndicator(props: Incoming<UiProps>) {
  const menu = useMenu();
  return (
    <div
      {...uiProps("navigation-menu-indicator", indicator, props)}
      data-state={() => (menu.state.value() === null ? "hidden" : "visible")}
    >
      <div class={indicatorArrow} data-slot="navigation-menu-indicator-arrow" />
    </div>
  );
}
