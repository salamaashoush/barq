import { PortalProvider } from "@barqjs/aria/dialog";
import {
  Menu,
  MenuItem,
  MenuRadioGroup,
  MenuSection,
  MenuTrigger,
  SubmenuTrigger,
  useMenuGroupHeading,
  useMenuTrigger,
  type MenuComponentProps,
  type MenuItemComponentProps,
  type MenuRadioGroupComponentProps,
  type MenuSectionComponentProps,
  type MenuSelectEvent,
  type MenuTriggerComponentProps,
  type SubmenuTriggerComponentProps,
} from "@barqjs/aria/menu";
import { placementFor, type Align, type Placement, type Side } from "@barqjs/aria/overlays";
import type { Child, Incoming } from "@barqjs/core";
import { firstThatWorks, layer } from "@barqjs/css";
import { Check } from "@barqjs/lucide/icons/check";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { Circle } from "@barqjs/lucide/icons/circle";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { icon } from "../lib/shared-icon.ts";
import { when } from "../lib/shared-when.ts";
import { text } from "../lib/shared-text.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { TriggerPart, type TriggerPartProps } from "../lib/trigger.tsx";

const ui = layer("barq.ui");

const content = ui(box.shadow, {
  zIndex: "50",
  margin: "0px",
  // `--barq-available-height` and `--barq-trigger-width` are what
  // `@barqjs/aria`'s positioner writes; Radix's names for the same two
  // measurements are in `ALLOWED`. Both are unset when there is no positioner,
  // and both properties take their initial value then, which is what a menu
  // with no trigger should have.
  maxHeight: "var(--barq-available-height)",
  width: "var(--barq-trigger-width)",
  minWidth: "calc(var(--spacing) * 32)",
  // A context menu and a menubar menu open wider, and neither takes its
  // trigger's width: a context menu's trigger is a REGION, so matching it
  // would open a menu the width of the page.
  '[data-slot="context-menu-content"]': {
    width: "auto",
    minWidth: "calc(var(--spacing) * 36)",
  },
  '[data-slot="menubar-content"]': {
    width: "auto",
    minWidth: "calc(var(--spacing) * 36)",
  },
  animation:
    "enter var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
  listStyleType: "none",
  overflowX: "hidden",
  overflowY: "auto",
  borderRadius: "var(--radius)",
  backgroundColor: "var(--popover)",
  padding: "var(--spacing)",
  color: "var(--popover-foreground)",
  "--ui-shadow":
    "0 4px 6px -1px var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 2px 4px -2px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
  "--ui-ring-shadow":
    "var(--ui-ring-inset,) 0 0 0 calc(1px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
  "--ui-ring-color": "var(--foreground)",
  "--ui-duration": "100ms",
  transitionDuration: "100ms",
  "--ui-enter-opacity": firstThatWorks("0", "calc(0/100)"),
  "--ui-enter-scale": firstThatWorks("0.95", "calc(95*1%)"),
  "@supports (color: color-mix(in lab, red, red))": {
    "--ui-ring-color": "color-mix(in oklab, var(--foreground) 10%, transparent)",
  },
  '[data-placement="bottom"] &': {
    transformOrigin: "top",
    "--ui-enter-translate-y": "calc(2*var(--spacing)*-1)",
  },
  '[data-placement="left"] &': {
    "--ui-enter-translate-x": "calc(2*var(--spacing))",
  },
  '[data-placement="right"] &': {
    "--ui-enter-translate-x": "calc(2*var(--spacing)*-1)",
  },
  '[data-placement="top"] &': {
    transformOrigin: "bottom",
    "--ui-enter-translate-y": "calc(2*var(--spacing))",
  },
  // A closing menu stops scrolling: the exit shrinks it, and a scrollbar
  // appearing for the last four frames is the flicker that comes of it.
  "[data-closed] &": {
    overflow: "hidden",
    animation:
      "exit var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
    "--ui-animation-fill-mode": "forwards",
    "--ui-exit-opacity": firstThatWorks("0", "calc(0/100)"),
    "--ui-exit-scale": firstThatWorks("0.95", "calc(95*1%)"),
  },
  '[data-closed][data-placement="bottom"] &': {
    "--ui-exit-translate-y": "calc(2 * var(--spacing) * -1)",
  },
  '[data-closed][data-placement="left"] &': {
    "--ui-exit-translate-x": "calc(2 * var(--spacing))",
  },
  '[data-closed][data-placement="right"] &': {
    "--ui-exit-translate-x": "calc(2 * var(--spacing) * -1)",
  },
  '[data-closed][data-placement="top"] &': {
    "--ui-exit-translate-y": "calc(2 * var(--spacing))",
  },
});

/** A submenu is narrower and sits on a heavier shadow. */
const subContent = ui(box.shadow, {
  zIndex: "50",
  margin: "0px",
  minWidth: "96px",
  // The context menu's submenu keeps a border where the dropdown's has the
  // ring, and opens at the width a menubar's does.
  '[data-slot="context-menu-sub-content"]': {
    minWidth: "calc(var(--spacing) * 32)",
    borderStyle: "var(--ui-border-style)",
    borderWidth: "1px",
  },
  '[data-slot="menubar-sub-content"]': {
    minWidth: "calc(var(--spacing) * 32)",
  },
  animation:
    "enter var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
  listStyleType: "none",
  overflow: "hidden",
  borderRadius: "var(--radius)",
  backgroundColor: "var(--popover)",
  padding: "var(--spacing)",
  color: "var(--popover-foreground)",
  "--ui-shadow":
    "0 10px 15px -3px var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 4px 6px -4px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
  "--ui-ring-shadow":
    "var(--ui-ring-inset,) 0 0 0 calc(1px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
  "--ui-ring-color": "var(--foreground)",
  "--ui-duration": "100ms",
  transitionDuration: "100ms",
  "--ui-enter-opacity": firstThatWorks("0", "calc(0/100)"),
  "--ui-enter-scale": firstThatWorks("0.95", "calc(95*1%)"),
  "@supports (color: color-mix(in lab, red, red))": {
    "--ui-ring-color": "color-mix(in oklab, var(--foreground) 10%, transparent)",
  },
  '[data-placement="bottom"] &': {
    transformOrigin: "top",
    "--ui-enter-translate-y": "calc(2*var(--spacing)*-1)",
  },
  '[data-placement="left"] &': {
    "--ui-enter-translate-x": "calc(2*var(--spacing))",
  },
  '[data-placement="right"] &': {
    "--ui-enter-translate-x": "calc(2*var(--spacing)*-1)",
  },
  '[data-placement="top"] &': {
    transformOrigin: "bottom",
    "--ui-enter-translate-y": "calc(2*var(--spacing))",
  },
  "[data-closed] &": {
    animation:
      "exit var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
    "--ui-animation-fill-mode": "forwards",
    "--ui-exit-opacity": firstThatWorks("0", "calc(0/100)"),
    "--ui-exit-scale": firstThatWorks("0.95", "calc(95*1%)"),
  },
  '[data-closed][data-placement="bottom"] &': {
    "--ui-exit-translate-y": "calc(2 * var(--spacing) * -1)",
  },
  '[data-closed][data-placement="left"] &': {
    "--ui-exit-translate-x": "calc(2 * var(--spacing))",
  },
  '[data-closed][data-placement="right"] &': {
    "--ui-exit-translate-x": "calc(2 * var(--spacing) * -1)",
  },
  '[data-closed][data-placement="top"] &': {
    "--ui-exit-translate-y": "calc(2 * var(--spacing))",
  },
});

const item = ui(
  text.sm,
  box.outline,
  box.forcedColors,
  box.noSelect,
  when.focused,
  when.disabled,
  icon.plain,
  icon.sized,
  icon.muted,
  // A marker: the shortcut reads the item's focus through
  // `.group\/dropdown-menu-item:focus`.
  "group/dropdown-menu-item",
  {
    position: "relative",
    display: "flex",
    cursor: "default",
    alignItems: "center",
    gap: "calc(var(--spacing) * 1.5)",
    borderRadius: "calc(var(--radius) * 0.8)",
    paddingInline: "calc(var(--spacing) * 1.5)",
    paddingBlock: "var(--spacing)",
    // Everything inside a focused item takes the accent colour, so an icon
    // that set its own does not stay muted against the highlight.
    ':is(&:not([data-variant="destructive"])[data-focused] *)': {
      color: "var(--accent-foreground)",
    },
    "[data-inset]": {
      paddingInlineStart: "calc(var(--spacing) * 7)",
    },
    '[data-variant="destructive"]': {
      color: "var(--destructive)",
    },
    '[data-variant="destructive"][data-focused]': {
      backgroundColor: "var(--destructive)",
      color: "var(--destructive)",
      "@supports (color: color-mix(in lab, red, red))": {
        backgroundColor: "color-mix(in oklab, var(--destructive) 10%, transparent)",
      },
    },
    ':is(.dark *)[data-variant="destructive"][data-focused]': {
      backgroundColor: "var(--destructive)",
      "@supports (color: color-mix(in lab, red, red))": {
        backgroundColor: "color-mix(in oklab, var(--destructive) 20%, transparent)",
      },
    },
    ':is(&[data-variant="destructive"] > *):is(svg)': {
      color: "var(--destructive)",
    },
    // The menubar wins the tie outright: its rows sit on a lighter fill and a
    // destructive glyph that lost to the row's own colour read as ordinary.
    ':is([data-slot="menubar-item"][data-variant="destructive"] > *):is(svg)': {
      color: "var(--destructive) !important",
    },
  },
);

/** A checkbox or radio row: the mark is at the END, so the text starts flush. */
const checkItem = ui(
  text.sm,
  box.outline,
  box.forcedColors,
  box.noSelect,
  when.focused,
  when.disabled,
  icon.plain,
  icon.sized,
  {
    position: "relative",
    display: "flex",
    cursor: "default",
    alignItems: "center",
    gap: "calc(var(--spacing) * 1.5)",
    borderRadius: "calc(var(--radius) * 0.8)",
    paddingBlock: "var(--spacing)",
    paddingInlineEnd: "calc(var(--spacing) * 8)",
    paddingInlineStart: "calc(var(--spacing) * 1.5)",
    ":is(&[data-focused] *)": {
      color: "var(--accent-foreground)",
    },
    "[data-inset]": {
      paddingInlineStart: "calc(var(--spacing) * 7)",
    },
    // A menubar keeps its ticks at the START, which is where a desktop menu
    // has always put them and what upstream still writes for this one menu.
    '[data-slot="menubar-checkbox-item"]': {
      paddingInlineEnd: "calc(var(--spacing) * 1.5)",
      paddingInlineStart: "calc(var(--spacing) * 7)",
    },
    '[data-slot="menubar-radio-item"]': {
      paddingInlineEnd: "calc(var(--spacing) * 1.5)",
      paddingInlineStart: "calc(var(--spacing) * 7)",
    },
  },
);

const indicator = ui({
  pointerEvents: "none",
  position: "absolute",
  insetInlineEnd: "calc(var(--spacing) * 2)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  // With the menubar's rows, which put the tick at the start.
  '[data-slot="menubar-checkbox-item-indicator"], &[data-slot="menubar-radio-item-indicator"]': {
    insetInlineEnd: "auto",
    insetInlineStart: "calc(var(--spacing) * 2)",
  },
  "& > svg": {
    display: "none",
    width: "calc(var(--spacing) * 4)",
    height: "calc(var(--spacing) * 4)",
  },
  "[data-selected] & > svg": {
    display: "block",
  },
});

const radioIndicator = ui({
  pointerEvents: "none",
  position: "absolute",
  insetInlineEnd: "calc(var(--spacing) * 2)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  // With the menubar's rows, which put the tick at the start.
  '[data-slot="menubar-checkbox-item-indicator"], &[data-slot="menubar-radio-item-indicator"]': {
    insetInlineEnd: "auto",
    insetInlineStart: "calc(var(--spacing) * 2)",
  },
  "& > svg": {
    display: "none",
    width: "calc(var(--spacing) * 2)",
    height: "calc(var(--spacing) * 2)",
    fill: "currentcolor",
  },
  "[data-selected] & > svg": {
    display: "block",
  },
});

const label = ui(text.medium, {
  paddingInline: "calc(var(--spacing) * 1.5)",
  paddingBlock: "var(--spacing)",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  color: "var(--muted-foreground)",
  "[data-inset]": {
    paddingInlineStart: "calc(var(--spacing) * 7)",
  },
});

const separator = ui({
  marginInline: "calc(var(--spacing) * -1)",
  marginBlock: "var(--spacing)",
  height: "1px",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "0px",
  backgroundColor: "var(--border)",
});

const shortcut = ui({
  marginInlineStart: "auto",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  "--ui-tracking": "var(--tracking-widest)",
  letterSpacing: "var(--tracking-widest)",
  color: "var(--muted-foreground)",
  ":is(:where(.group\\/dropdown-menu-item)[data-focused] *)": {
    color: "var(--accent-foreground)",
  },
});

const subTrigger = ui(
  text.sm,
  box.outline,
  box.forcedColors,
  box.noSelect,
  when.focused,
  icon.plain,
  icon.sized,
  icon.muted,
  {
    display: "flex",
    cursor: "default",
    alignItems: "center",
    gap: "calc(var(--spacing) * 1.5)",
    borderRadius: "calc(var(--radius) * 0.8)",
    paddingInline: "calc(var(--spacing) * 1.5)",
    paddingBlock: "var(--spacing)",
    ':is(&:not([data-variant="destructive"])[data-focused] *)': {
      color: "var(--accent-foreground)",
    },
    "[data-inset]": {
      paddingInlineStart: "calc(var(--spacing) * 7)",
    },
    '[data-state="open"]': {
      backgroundColor: "var(--accent)",
      color: "var(--accent-foreground)",
    },
  },
);

const subChevron = ui({
  marginInlineStart: "auto",
  width: "calc(var(--spacing) * 4)",
  height: "calc(var(--spacing) * 4)",
  // The submenu opens towards the end of the line, and so the arrow points
  // there too.
  ":dir(rtl)": {
    rotate: "180deg",
  },
});

const group = ui({
  margin: "0px",
  listStyleType: "none",
  padding: "0px",
});

const groupLabel = ui(text.medium, {
  paddingInline: "calc(var(--spacing) * 1.5)",
  paddingBlock: "var(--spacing)",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  color: "var(--muted-foreground)",
});

export interface DropdownMenuProps extends MenuTriggerComponentProps {
  /** Upstream's name for `isOpen`. */
  open?: boolean;
}

/**
 * ```tsx
 * <DropdownMenu>
 *   <DropdownMenuTrigger><Button variant="outline">Actions</Button></DropdownMenuTrigger>
 *   <DropdownMenuContent items={actions} onAction={(key) => run(key)}>
 *     {(action) => <DropdownMenuItem>{action.name}</DropdownMenuItem>}
 *   </DropdownMenuContent>
 * </DropdownMenu>
 * ```
 *
 * The items are DATA plus a render function, which is `@barqjs/aria`'s
 * collection model. An item with `children` is a SECTION, so a submenu's items
 * go under a different key — `submenu`, by convention.
 *
 * Or they are written, the way shadcn writes them, and every part sits where
 * it is put:
 *
 * ```tsx
 * <DropdownMenuContent align="end">
 *   <DropdownMenuLabel>My account</DropdownMenuLabel>
 *   <DropdownMenuSeparator />
 *   <DropdownMenuGroup>
 *     <DropdownMenuItem onSelect={() => open("profile")}>Profile</DropdownMenuItem>
 *     <DropdownMenuItem href="/billing">Billing</DropdownMenuItem>
 *   </DropdownMenuGroup>
 *   <DropdownMenuCheckboxItem checked={bar()} onCheckedChange={setBar}>
 *     Status bar
 *   </DropdownMenuCheckboxItem>
 * </DropdownMenuContent>
 * ```
 *
 * Typeahead, roving focus, Home/End, the arrow keys and the submenu's own
 * safe-triangle pointer tracking all come from `@barqjs/aria` and are not
 * reimplemented here.
 */
export function DropdownMenu(props: Incoming<DropdownMenuProps>) {
  return <MenuTrigger {...props} isOpen={props.isOpen?.() ?? props.open?.()} />;
}

export interface DropdownMenuPortalProps {
  /** Where the menu is rendered instead of the body. */
  container?: Element | null;
  children?: Child;
}

/**
 * The menu is portalled already, so this is only for naming somewhere other
 * than the body to portal it to.
 */
export function DropdownMenuPortal(props: Incoming<DropdownMenuPortalProps>) {
  if (props.container === undefined) return <>{props.children}</>;
  return (
    <PortalProvider getContainer={() => props.container?.() ?? null}>
      {props.children}
    </PortalProvider>
  );
}

export interface DropdownMenuTriggerProps extends TriggerPartProps {}

/**
 * Hands the trigger's props to whatever control is inside it.
 *
 * `@barqjs/aria` has a `<MenuButton>` for this, and it renders a bare
 * `<button>`; the button here has to be YOURS, with its own variant and size.
 * The slot is how `aria-haspopup`, `aria-expanded` and the keyboard handling
 * reach it without an element in between. Any other element takes them through
 * `render`, and a component of your own through `useTrigger()`.
 */
export function DropdownMenuTrigger(props: Incoming<DropdownMenuTriggerProps>) {
  const trigger = useMenuTrigger();
  if (trigger === null) throw new Error("A DropdownMenuTrigger must be inside a DropdownMenu.");

  return (
    <TriggerPart
      slot={{ props: trigger.menuTriggerProps, ref: trigger.triggerRef.set }}
      render={props.render?.()}
      name="dropdown-menu-trigger"
    >
      {props.children}
    </TriggerPart>
  );
}

/** Where a menu sits against its trigger, in upstream's words. */
export interface MenuPositionProps {
  /** Which edge of the trigger the menu hangs off. Reads `placement` first. */
  side?: Side;
  /** Where along that edge it sits. @default "center", once `side` or `align` is given */
  align?: Align;
  /** Distance from the trigger. Reads `offset` first. */
  sideOffset?: number;
  /** Distance along the trigger's edge. Reads `crossOffset` first. */
  alignOffset?: number;
}

/** The `placement` a menu was asked for in either vocabulary, or nothing if it was not asked. */
export function menuPlacement(
  props: Incoming<MenuPositionProps & { placement?: Placement }>,
  side: Side = "bottom",
): Placement | undefined {
  const given = props.placement?.();
  if (given !== undefined) return given;
  if (props.side?.() === undefined && props.align?.() === undefined) return undefined;
  return placementFor(props.side?.() ?? side, props.align?.() ?? "center");
}

export interface DropdownMenuContentProps<T> extends MenuComponentProps<T>, MenuPositionProps {
  /** Upstream's name for `shouldFocusWrap`, which here is on unless turned off. */
  loop?: boolean;
}

export function DropdownMenuContent<T>(props: Incoming<DropdownMenuContentProps<T>>) {
  return (
    <Menu
      {...props}
      shouldFocusWrap={props.shouldFocusWrap?.() ?? props.loop?.()}
      placement={menuPlacement(props)}
      offset={props.offset?.() ?? props.sideOffset?.()}
      crossOffset={props.crossOffset?.() ?? props.alignOffset?.()}
      data-slot={props["data-slot"]?.() ?? "dropdown-menu-content"}
      class={ui(content, props.class?.(), props.className?.())}
    />
  );
}

export type DropdownMenuItemVariant = "default" | "destructive";

export interface DropdownMenuItemProps extends MenuItemComponentProps {
  variant?: DropdownMenuItemVariant;
  /** Indent past the space a tick would occupy, so a mixed menu lines up. */
  inset?: boolean;
  /** Upstream's name for `isDisabled`. */
  disabled?: boolean;
}

/**
 * Written as a child it takes `onSelect`, `disabled` and `href`; rendered from
 * data it reads its item. With an `href` it is a real link that is still a
 * menu item, which is what upstream reaches with `asChild` around an `<a>`.
 */
export function DropdownMenuItem(props: Incoming<DropdownMenuItemProps>) {
  return (
    <MenuItem
      {...props}
      isDisabled={disabled(props)}
      data-slot={props["data-slot"]?.() ?? "dropdown-menu-item"}
      data-variant={props.variant?.() ?? "default"}
      data-inset={props.inset?.() === true ? "" : undefined}
      class={ui(item, props.class?.(), props.className?.())}
    />
  );
}

/** `isDisabled` under either of its names, and absent when neither was written. */
function disabled(
  props: Incoming<{ isDisabled?: boolean; disabled?: boolean }>,
): boolean | undefined {
  return props.isDisabled?.() ?? props.disabled?.();
}

export interface DropdownMenuCheckboxItemProps extends MenuItemComponentProps {
  /** Whether a written item is ticked. Leave it out and the item keeps its own tick. */
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  /**
   * The tick's own slot.
   *
   * A context menu and a menubar reuse this item and rename it, and a style
   * names the tick after the menu it is in — `cn-context-menu-item-indicator`,
   * `cn-menubar-checkbox-item-indicator` — so the child has to be renameable
   * with the parent or it keeps a name that style never mentions.
   */
  indicatorSlot?: string;
}

/**
 * An item with a tick.
 *
 * Rendered from data, whether it is ticked is the menu's SELECTION, so the
 * content around it needs `selectionMode="multiple"`. Written as a child it
 * holds its own tick, or shows the `checked` it is given. The tick is shown by
 * CSS off `data-selected` rather than by a conditional, so toggling one writes
 * one attribute.
 */
export function DropdownMenuCheckboxItem(props: Incoming<DropdownMenuCheckboxItemProps>) {
  return (
    <MenuItem
      {...props}
      type="checkbox"
      isSelected={props.isSelected?.() ?? props.checked?.()}
      defaultSelected={props.defaultSelected?.() ?? props.defaultChecked?.()}
      onChange={(checked: boolean) => {
        props.onChange?.()?.(checked);
        props.onCheckedChange?.()?.(checked);
      }}
      isDisabled={disabled(props)}
      data-slot={props["data-slot"]?.() ?? "dropdown-menu-checkbox-item"}
      class={ui(checkItem, props.class?.(), props.className?.())}
    >
      <span data-slot={props.indicatorSlot?.() ?? "dropdown-menu-item-indicator"} class={indicator}>
        <Check />
      </span>
      {props.children}
    </MenuItem>
  );
}

export interface DropdownMenuRadioGroupProps extends MenuRadioGroupComponentProps {}

/**
 * The radio items written inside it, of which the one whose `value` is the
 * group's is on.
 */
export function DropdownMenuRadioGroup(props: Incoming<DropdownMenuRadioGroupProps>) {
  return (
    <MenuRadioGroup
      {...props}
      data-slot={props["data-slot"]?.() ?? "dropdown-menu-radio-group"}
      class={ui(group, props.class?.(), props.className?.())}
    />
  );
}

export interface DropdownMenuRadioItemProps extends MenuItemComponentProps {
  disabled?: boolean;
  /** See {@link DropdownMenuCheckboxItemProps.indicatorSlot}. */
  indicatorSlot?: string;
}

/**
 * Rendered from data, as above with `selectionMode="single"`. Written as a
 * child, it goes inside a {@link DropdownMenuRadioGroup} and carries a `value`.
 */
export function DropdownMenuRadioItem(props: Incoming<DropdownMenuRadioItemProps>) {
  return (
    <MenuItem
      {...props}
      isDisabled={disabled(props)}
      data-slot={props["data-slot"]?.() ?? "dropdown-menu-radio-item"}
      class={ui(checkItem, props.class?.(), props.className?.())}
    >
      <span
        data-slot={props.indicatorSlot?.() ?? "dropdown-menu-item-indicator"}
        class={radioIndicator}
      >
        <Circle />
      </span>
      {props.children}
    </MenuItem>
  );
}

export interface DropdownMenuLabelProps extends UiProps {
  inset?: boolean;
}

/** Inside a group it is what names the group to a screen reader. */
export function DropdownMenuLabel(props: Incoming<DropdownMenuLabelProps>) {
  const heading = useMenuGroupHeading();
  return (
    <li
      {...uiProps("dropdown-menu-label", label, props)}
      id={props.id?.() ?? heading?.()}
      role="presentation"
      data-inset={props.inset?.() === true ? "" : undefined}
    >
      {props.children}
    </li>
  );
}

export function DropdownMenuSeparator(props: Incoming<UiProps>) {
  return <li {...uiProps("dropdown-menu-separator", separator, props)} role="separator" />;
}

/** The key combination on the right of an item. Decoration: the shortcut itself is yours to bind. */
export function DropdownMenuShortcut(props: Incoming<UiProps>) {
  return <span {...uiProps("dropdown-menu-shortcut", shortcut, props)}>{props.children}</span>;
}

export interface DropdownMenuGroupProps<T> extends MenuSectionComponentProps<T> {}

/**
 * A section of the collection: an item whose own `children` are its items. In
 * a written menu, a `role="group"` around the items written inside it.
 */
export function DropdownMenuGroup<T>(props: Incoming<DropdownMenuGroupProps<T>>) {
  return (
    <MenuSection
      {...props}
      data-slot={props["data-slot"]?.() ?? "dropdown-menu-group"}
      class={ui(group, props.class?.(), props.className?.())}
    />
  );
}

export interface DropdownMenuSubProps extends SubmenuTriggerComponentProps {}

/**
 * ```tsx
 * <DropdownMenuSub>
 *   <DropdownMenuSubTrigger>More</DropdownMenuSubTrigger>
 *   <DropdownMenuSubContent items={item.submenu}>
 *     {(entry) => <DropdownMenuItem>{entry.name}</DropdownMenuItem>}
 *   </DropdownMenuSubContent>
 * </DropdownMenuSub>
 * ```
 */
export function DropdownMenuSub(props: Incoming<DropdownMenuSubProps>) {
  return (
    <SubmenuTrigger {...props} shouldCloseAllOnEscape={props.shouldCloseAllOnEscape?.() ?? true} />
  );
}

export interface DropdownMenuSubTriggerProps extends MenuItemComponentProps {
  inset?: boolean;
  disabled?: boolean;
  "data-slot"?: string;
}

export function DropdownMenuSubTrigger(props: Incoming<DropdownMenuSubTriggerProps>) {
  return (
    <MenuItem
      {...props}
      isDisabled={disabled(props)}
      data-slot={props["data-slot"]?.() ?? "dropdown-menu-sub-trigger"}
      data-inset={props.inset?.() === true ? "" : undefined}
      class={ui(subTrigger, props.class?.(), props.className?.())}
    >
      {props.children}
      <ChevronRight
        // Named after the row it is in, so a menu that renames the row does not
        // leave a dropdown's name on the arrow inside it.
        data-slot={(props["data-slot"]?.() ?? "dropdown-menu-sub-trigger").replace(
          /-trigger$/,
          "-chevron",
        )}
        class={subChevron}
      />
    </MenuItem>
  );
}

export interface DropdownMenuSubContentProps<T> extends MenuComponentProps<T>, MenuPositionProps {
  /** See {@link DropdownMenuContentProps.loop}. */
  loop?: boolean;
}

export function DropdownMenuSubContent<T>(props: Incoming<DropdownMenuSubContentProps<T>>) {
  return (
    <Menu
      {...props}
      shouldFocusWrap={props.shouldFocusWrap?.() ?? props.loop?.()}
      placement={menuPlacement(props, "inline-end")}
      offset={props.offset?.() ?? props.sideOffset?.()}
      crossOffset={props.crossOffset?.() ?? props.alignOffset?.()}
      data-slot={props["data-slot"]?.() ?? "dropdown-menu-sub-content"}
      class={ui(subContent, props.class?.(), props.className?.())}
    />
  );
}

/** The label a `<DropdownMenuGroup>` renders as its heading. */
export function DropdownMenuGroupLabel(props: Incoming<UiProps>) {
  return <span {...uiProps("dropdown-menu-group-label", groupLabel, props)}>{props.children}</span>;
}

export type DropdownMenuSelectEvent = MenuSelectEvent;
