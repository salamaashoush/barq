import {
  createContext,
  getContext,
  onCleanup,
  Portal,
  provide,
  Show,
  createSignal,
  type Child,
  type Incoming,
} from "@barqjs/core";
import type { Key } from "@barqjs/aria/collections";
import {
  navigationMenu,
  navigationMenuState,
  type NavigationMenuItemResult,
  type NavigationMenuResult,
  type NavigationMenuState,
} from "@barqjs/aria/navigation";
import { presence } from "@barqjs/aria/presence";
import { mergeProps } from "@barqjs/aria/utils";
import { firstThatWorks, layer } from "@barqjs/css";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { ref as makeRef } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import { uiProps } from "../lib/slot.ts";

import type { UiProps } from "../lib/props.ts";
import { mergeRefs } from "@barqjs/primitives/refs";

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
  gap: "0px",
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
  borderRadius: "calc(var(--radius) * 0.8)",
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

/**
 * The trigger's classes, without the trigger.
 *
 * For a top-level link that has to sit in the bar looking like the triggers
 * beside it:
 *
 * ```tsx
 * <NavigationMenuLink href="/docs" class={navigationMenuTriggerStyle()}>Docs</NavigationMenuLink>
 * ```
 */
export function navigationMenuTriggerStyle(): string {
  return triggerStyle;
}

// `group` is a marker, not a utility: the chevron turns over through
// `.group[data-state="open"]`, so a link dressed as a trigger carries it too.
const triggerStyle = ui(trigger, "group");

const triggerIcon = ui({
  position: "relative",
  top: "1px",
  marginInlineStart: "var(--spacing)",
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
  insetInlineStart: "0px",
  width: "100%",
  padding: "var(--spacing)",
  // The easing upstream names for the slide, which is a long ease-out: the
  // panel arrives fast and settles rather than gliding the whole way.
  "--ui-ease": "cubic-bezier(.22,1,.36,1)",
  transitionTimingFunction: "cubic-bezier(.22,1,.36,1)",
  // A link inside a content panel draws no ring of its own: the panel is
  // already the focus surface, and two rings inside one popover is noise.
  ':is(& *)[data-slot="navigation-menu-link"]:focus': {
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(0px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    "--ui-outline-style": "none",
    outlineStyle: "none",
  },
  // Without a viewport the panel IS the popover, so it carries the surface the
  // viewport would otherwise draw around it.
  '[data-slot="navigation-menu"][data-viewport="false"] &': {
    top: "100%",
    marginTop: "calc(var(--spacing) * 1.5)",
    overflow: "hidden",
    borderRadius: "var(--radius)",
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    "--ui-shadow":
      "0 1px 3px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 1px 2px -1px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(1px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    "--ui-ring-color": "var(--foreground)",
    "--ui-duration": "300ms",
    transitionDuration: "300ms",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--foreground) 10%, transparent)",
    },
  },
  '[data-slot="navigation-menu"][data-viewport="false"] &[data-state="open"]': {
    animation:
      "enter var(--ui-animation-duration,var(--ui-duration,.15s))var(--ui-ease,ease)var(--ui-animation-delay,0s)var(--ui-animation-iteration-count,1)var(--ui-animation-direction,normal)var(--ui-animation-fill-mode,none)",
    "--ui-enter-opacity": firstThatWorks("0", "calc(0/100)"),
    "--ui-enter-scale": firstThatWorks(".95", "calc(95*1%)"),
  },
  '[data-slot="navigation-menu"][data-viewport="false"] &[data-state="closed"]': {
    animation:
      "exit var(--ui-animation-duration,var(--ui-duration,.15s))var(--ui-ease,ease)var(--ui-animation-delay,0s)var(--ui-animation-iteration-count,1)var(--ui-animation-direction,normal)var(--ui-animation-fill-mode,none)",
    "--ui-animation-fill-mode": "forwards",
    "--ui-exit-opacity": firstThatWorks("0", "calc(0/100)"),
    "--ui-exit-scale": firstThatWorks(".95", "calc(95*1%)"),
  },
  // `data-closed` is written the instant the panel starts to leave, and how
  // long it stays is measured in that same tick, before `data-state` and
  // `data-motion` have caught up. So the exit is declared here as well, or the
  // measurement finds nothing to wait for and the panel is gone at once.
  "[data-closed]": {
    animation:
      "exit var(--ui-animation-duration,var(--ui-duration,.15s))var(--ui-ease,ease)var(--ui-animation-delay,0s)var(--ui-animation-iteration-count,1)var(--ui-animation-direction,normal)var(--ui-animation-fill-mode,none)",
    "--ui-animation-fill-mode": "forwards",
    "--ui-exit-opacity": "0",
  },
  '[data-slot="navigation-menu"][data-viewport="false"] &[data-closed]': {
    "--ui-exit-scale": firstThatWorks(".95", "calc(95*1%)"),
  },
  // `start` and `end` are the bar's own ends, so the distance a panel slides
  // changes sign with the direction of the text.
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
  ':dir(rtl)[data-motion="from-end"]': {
    "--ui-enter-translate-x": "calc(52*var(--spacing)*-1)",
  },
  ':dir(rtl)[data-motion="from-start"]': {
    "--ui-enter-translate-x": "calc(52*var(--spacing))",
  },
  ':dir(rtl)[data-motion="to-end"]': {
    "--ui-exit-translate-x": "calc(52*var(--spacing)*-1)",
  },
  ':dir(rtl)[data-motion="to-start"]': {
    "--ui-exit-translate-x": "calc(52*var(--spacing))",
  },
  '[data-motion^="from-"]': {
    animation:
      "enter var(--ui-animation-duration,var(--ui-duration,.15s))var(--ui-ease,ease)var(--ui-animation-delay,0s)var(--ui-animation-iteration-count,1)var(--ui-animation-direction,normal)var(--ui-animation-fill-mode,none)",
    "--ui-enter-opacity": "0",
  },
  '[data-motion^="to-"]': {
    animation:
      "exit var(--ui-animation-duration,var(--ui-duration,.15s))var(--ui-ease,ease)var(--ui-animation-delay,0s)var(--ui-animation-iteration-count,1)var(--ui-animation-direction,normal)var(--ui-animation-fill-mode,none)",
    "--ui-animation-fill-mode": "forwards",
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
  insetInlineStart: "0px",
  isolation: "isolate",
  zIndex: "50",
  display: "flex",
  justifyContent: "center",
});

const viewport = ui({
  position: "relative",
  marginTop: "calc(var(--spacing) * 1.5)",
  height: "var(--barq-viewport-height)",
  width: "100%",
  overflow: "hidden",
  transformOrigin: "top center",
  borderRadius: "var(--radius)",
  backgroundColor: "var(--popover)",
  color: "var(--popover-foreground)",
  "--ui-shadow":
    "0 1px 3px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 1px 2px -1px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  "--ui-ring-shadow":
    "var(--ui-ring-inset,) 0 0 0 calc(1px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
  "--ui-ring-color": "var(--foreground)",
  "--ui-duration": "100ms",
  transitionDuration: "100ms",
  "@supports (color: color-mix(in lab, red, red))": {
    "--ui-ring-color": "color-mix(in oklab, var(--foreground) 10%, transparent)",
  },
  "@media (width >= 48rem)": {
    "&": {
      width: "var(--barq-viewport-width)",
    },
  },
  '[data-state="closed"]': {
    animation:
      "exit var(--ui-animation-duration,var(--ui-duration,.15s))var(--ui-ease,ease)var(--ui-animation-delay,0s)var(--ui-animation-iteration-count,1)var(--ui-animation-direction,normal)var(--ui-animation-fill-mode,none)",
    "--ui-animation-fill-mode": "forwards",
    "--ui-exit-scale": firstThatWorks(".9", "calc(90*1%)"),
  },
  // What the exit is measured by: `data-closed` lands a tick before
  // `data-state` does, and the viewport is hidden once this has played.
  "[data-closed]": {
    animation:
      "exit var(--ui-animation-duration,var(--ui-duration,.15s))var(--ui-ease,ease)var(--ui-animation-delay,0s)var(--ui-animation-iteration-count,1)var(--ui-animation-direction,normal)var(--ui-animation-fill-mode,none)",
    "--ui-animation-fill-mode": "forwards",
    "--ui-exit-scale": firstThatWorks(".9", "calc(90*1%)"),
  },
  '[data-state="open"]': {
    animation:
      "enter var(--ui-animation-duration,var(--ui-duration,.15s))var(--ui-ease,ease)var(--ui-animation-delay,0s)var(--ui-animation-iteration-count,1)var(--ui-animation-direction,normal)var(--ui-animation-fill-mode,none)",
    "--ui-enter-scale": firstThatWorks(".9", "calc(90*1%)"),
  },
});

const link = ui({
  display: "flex",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
  borderRadius: "var(--radius)",
  padding: "calc(var(--spacing) * 2)",
  // Inside a content panel the rows are tighter, so their corners are too.
  '[data-slot="navigation-menu-content"] &': {
    borderRadius: "calc(var(--radius) * 0.8)",
  },
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  transitionProperty: "all",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  "@media (hover: hover)": {
    ":hover": {
      backgroundColor: "var(--muted)",
    },
    '[data-active="true"]:hover': {
      backgroundColor: "var(--muted)",
    },
  },
  ":focus": {
    backgroundColor: "var(--muted)",
  },
  '[data-active="true"]': {
    backgroundColor: "var(--muted)",
    "@supports (color: color-mix(in lab, red, red))": {
      backgroundColor: "color-mix(in oklab, var(--muted) 50%, transparent)",
    },
  },
  '[data-active="true"]:focus': {
    backgroundColor: "var(--muted)",
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
    "--ui-animation-fill-mode": "forwards",
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
  borderStartStartRadius: "calc(var(--radius) * 0.6)",
  backgroundColor: "var(--border)",
  "--ui-shadow":
    "0 4px 6px -1px var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 2px 4px -2px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
});

interface MenuValue {
  readonly state: NavigationMenuState;
  readonly menu: NavigationMenuResult;
  readonly hasViewport: () => boolean;
  /** Whether a `<NavigationMenuViewport>` was written out, so the root adds none. */
  readonly isViewportWritten: () => boolean;
  readonly writeViewport: (written: boolean) => void;
}

const MenuContext = createContext<MenuValue | null>(null);
const ItemContext = createContext<NavigationMenuItemResult | null>(null);

function useMenu(): MenuValue {
  const value = getContext(MenuContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a <NavigationMenu>.");
  }
  return value;
}

function useItem(): NavigationMenuItemResult {
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
   * per item. The root renders the `<NavigationMenuViewport>` itself unless
   * one is written out. @default true
   */
  viewport?: boolean;
  /** How long the pointer rests on a trigger before the first panel opens. @default 200 */
  delayDuration?: number;
  /** How long after closing the next panel opens with no wait. @default 300 */
  skipDelayDuration?: number;
  /** @default "horizontal" */
  orientation?: "horizontal" | "vertical";
  onValueChange?: (value: Key | null) => void;
}

/**
 * ```tsx
 * <NavigationMenu>
 *   <NavigationMenuList>
 *     <NavigationMenuItem>
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
 * popovers; `navigationMenu` beside it is the keyboard and the pointer.
 */
export function NavigationMenu(props: Incoming<NavigationMenuProps>) {
  const navRef = makeRef<HTMLElement>();
  // `ownedWrite`: a viewport says it was written from its own component body.
  const [written, setWritten] = createSignal(false, { ownedWrite: true });

  const state = navigationMenuState({
    value: () => props.value?.(),
    defaultValue: () => props.defaultValue?.(),
    delay: () => props.delayDuration?.(),
    skipDelay: () => props.skipDelayDuration?.(),
    onValueChange: (next) => props.onValueChange?.()?.(next),
  });

  const menu = navigationMenu(
    {
      ref: navRef,
      orientation: () => props.orientation?.(),
      direction: () => {
        const dir = props.dir?.();
        return dir === "ltr" || dir === "rtl" ? dir : undefined;
      },
      "aria-label": () => props["aria-label"]?.(),
      "aria-labelledby": () => props["aria-labelledby"]?.(),
    },
    state,
  );

  const value: MenuValue = {
    state,
    menu,
    hasViewport: () => props.viewport?.() ?? true,
    isViewportWritten: written,
    writeViewport: setWritten,
  };

  return (
    <nav
      {...mergeProps(
        uiProps("navigation-menu", ui(root, "group/navigation-menu"), props),
        menu.rootProps,
      )}
      ref={mergeRefs(navRef.set, props.ref?.())}
      data-viewport={() => String(value.hasViewport())}
    >
      <MenuProvider value={value}>
        <MenuBody>{props.children}</MenuBody>
      </MenuProvider>
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
  return provide(
    MenuContext,
    () => props.value(),
    () => props.children,
  );
}

/** The children, and the viewport shadcn's root adds after them. */
function MenuBody(props: Incoming<{ children?: Child }>) {
  const value = useMenu();
  return (
    <>
      {props.children}
      <Show when={value.hasViewport() && !value.isViewportWritten()}>
        <Viewport />
      </Show>
    </>
  );
}

export function NavigationMenuList(props: Incoming<UiProps>) {
  const { menu } = useMenu();
  return (
    <ul {...mergeProps(uiProps("navigation-menu-list", ui(list, "group"), props), menu.listProps)}>
      {props.children}
    </ul>
  );
}

export interface NavigationMenuItemProps extends UiProps {
  /** What identifies this item to the shared state. Generated when left out. */
  value?: Key;
}

export function NavigationMenuItem(props: Incoming<NavigationMenuItemProps>) {
  const { menu } = useMenu();
  const entry = menu.item({ key: props.value?.() });

  return (
    <li {...uiProps("navigation-menu-item", item, props)}>
      <ItemProvider value={entry}>{props.children}</ItemProvider>
    </li>
  );
}

function ItemProvider(props: Incoming<{ value: NavigationMenuItemResult; children?: Child }>) {
  return provide(
    ItemContext,
    () => props.value(),
    () => props.children,
  );
}

export interface NavigationMenuTriggerProps extends UiProps {
  disabled?: boolean;
}

/**
 * The button that opens an item's panel.
 *
 * A press does not simply TOGGLE, and a browser is what said so. Reaching a
 * trigger with a mouse means entering it first, which opens the panel on hover,
 * so a toggle found it already open and shut it again: the panel flashed and
 * the trigger appeared dead. `@barqjs/aria` therefore closes on a press only
 * what a press opened.
 */
export function NavigationMenuTrigger(props: Incoming<NavigationMenuTriggerProps>) {
  const value = useMenu();
  const entry = useItem();

  return (
    <>
      <button
        {...mergeProps(
          uiProps("navigation-menu-trigger", navigationMenuTriggerStyle(), props),
          entry.triggerProps({ isDisabled: () => props.disabled?.() }),
        )}
        type="button"
        ref={mergeRefs(entry.triggerRef, props.ref?.())}
      >
        {props.children}
        <ChevronDown class={triggerIcon} aria-hidden="true" />
      </button>
      {/* The panel is drawn in the viewport, after the whole list. This puts
          it back after its trigger for a screen reader's reading order. */}
      <Show when={entry.isOpen() && value.hasViewport()}>
        <span aria-owns={entry.contentId()} />
      </Show>
    </>
  );
}

/**
 * One item's panel.
 *
 * In the document only while it is the open one or on its way out, so the DOM
 * holds one panel rather than one per item. `data-motion` says which side it
 * arrived from or is leaving towards, which is what the slide animation reads;
 * with nothing to compare against the attribute is absent rather than invented.
 *
 * With a viewport it is drawn INSIDE the viewport, which is what sizes to it
 * and clips its slide; without one it stays under its own item.
 */
export function NavigationMenuContent(props: Incoming<UiProps>) {
  const value = useMenu();
  const entry = useItem();
  const gate = presence({ isOpen: entry.isOpen, ref: entry.content });

  // `<Show>`, not a bare ternary. A conditional at a component's ROOT is
  // evaluated once and returned as an array of one, so the panel would render
  // whatever `open()` said at mount and never move: `aria-expanded` on the
  // trigger flipped and no panel ever appeared. `<Show>` is the primitive for a
  // reactive conditional and lowers to a branch the runtime re-runs.
  return (
    <Show when={gate.isPresent()}>
      <Show
        when={value.hasViewport()}
        fallback={<Panel of={props} entry={entry} isExiting={gate.isExiting()} />}
      >
        <Show when={value.menu.viewport() !== null}>
          <Portal mount={value.menu.viewport()}>
            <Panel of={props} entry={entry} isExiting={gate.isExiting()} />
          </Portal>
        </Show>
      </Show>
    </Show>
  );
}

function Panel(
  props: Incoming<{ of: Incoming<UiProps>; entry: NavigationMenuItemResult; isExiting: boolean }>,
) {
  const own = props.of();
  const entry = props.entry();

  return (
    <div
      {...mergeProps(uiProps("navigation-menu-content", content, own), entry.contentProps)}
      ref={mergeRefs(entry.contentRef, own.ref?.())}
      data-closed={props.isExiting() ? "" : undefined}
    >
      {own.children}
    </div>
  );
}

/**
 * The shared panel every item's content is drawn into.
 *
 * shadcn's grows to the open content's box, and that is the reason it exists:
 * one panel that resizes reads as a single surface moving, where a panel per
 * item reads as popovers appearing. The size arrives as two custom properties,
 * so the animation is the stylesheet's decision rather than this component's.
 *
 * `<NavigationMenu>` renders one itself. Write it out only to give it a class
 * or to put it somewhere else in the bar.
 */
export function NavigationMenuViewport(props: Incoming<UiProps>) {
  const value = useMenu();
  value.writeViewport(true);
  onCleanup(() => value.writeViewport(false));

  return <Viewport {...props} />;
}

function Viewport(props: Incoming<UiProps>) {
  const { menu } = useMenu();

  return (
    <div class={viewportWrapper} data-slot="navigation-menu-viewport-wrapper">
      <div
        {...mergeProps(uiProps("navigation-menu-viewport", viewport, props), menu.viewportProps)}
        ref={mergeRefs(menu.viewportRef, props.ref?.())}
      >
        {props.children}
      </div>
    </div>
  );
}

export interface NavigationMenuLinkProps extends UiProps {
  href?: string;
  target?: string;
  rel?: string;
  /** The link is the current page. */
  active?: boolean;
  /** The same as {@link NavigationMenuLinkProps.active}; either name works. */
  isActive?: boolean;
  /**
   * Called when the link is chosen, before the menu closes. Call
   * `preventDefault()` on the event to keep the menu open.
   */
  onSelect?: (event: Event) => void;
}

/**
 * A link in the bar or in a panel. It IS the `<a>`: shadcn's examples write
 * `<NavigationMenuLink asChild><Link href="…" /></NavigationMenuLink>` to get
 * one, and here `href` does that with no element to clone.
 */
export function NavigationMenuLink(props: Incoming<NavigationMenuLinkProps>) {
  const value = getContext(MenuContext) ?? null;
  const isActive = (): boolean => (props.active?.() ?? props.isActive?.()) === true;
  const behaviour =
    value === null
      ? {
          "data-active": () => (isActive() ? "true" : undefined),
          "aria-current": () => (isActive() ? "page" : undefined),
        }
      : value.menu.linkProps({
          isActive,
          onSelect: (event) => props.onSelect?.()?.(event),
        });

  return (
    <a
      {...mergeProps(uiProps("navigation-menu-link", link, props), behaviour)}
      href={props.href?.()}
      target={props.target?.()}
      rel={props.rel?.()}
    >
      {props.children}
    </a>
  );
}

/** The little arrow that points at whichever trigger is open. */
export function NavigationMenuIndicator(props: Incoming<UiProps>) {
  const { menu } = useMenu();
  return (
    <div
      {...mergeProps(uiProps("navigation-menu-indicator", indicator, props), menu.indicatorProps)}
    >
      <div class={indicatorArrow} data-slot="navigation-menu-indicator-arrow" />
    </div>
  );
}
