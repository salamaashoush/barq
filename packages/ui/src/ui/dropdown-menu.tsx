import {
  Menu,
  MenuItem,
  MenuSection,
  MenuTrigger,
  SubmenuTrigger,
  useMenuTrigger,
  type MenuComponentProps,
  type MenuItemComponentProps,
  type MenuSectionComponentProps,
  type MenuTriggerComponentProps,
  type SubmenuTriggerComponentProps,
} from "@barqjs/aria/menu";
import { provideTriggerSlot } from "@barqjs/aria/utils";
import { context, getOwner, provide, type Child, type Incoming } from "@barqjs/core";
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

const ui = layer("barq.ui");

const content = ui(box.border, box.shadow, {
  zIndex: "50",
  margin: "0px",
  minWidth: "8rem",
  animation:
    "enter var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
  listStyleType: "none",
  overflowX: "hidden",
  overflowY: "auto",
  borderRadius: "calc(var(--radius) - 2px)",
  backgroundColor: "var(--popover)",
  padding: "var(--spacing)",
  color: "var(--popover-foreground)",
  "--ui-shadow":
    "0 4px 6px -1px var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 2px 4px -2px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
  "--ui-enter-opacity": firstThatWorks("0", "calc(0/100)"),
  "--ui-enter-scale": firstThatWorks("0.95", "calc(95*1%)"),
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
  box.noSelect,
  when.focused,
  when.disabled,
  icon.plain,
  icon.sized,
  icon.muted,
  {
    position: "relative",
    display: "flex",
    cursor: "default",
    alignItems: "center",
    gap: "calc(var(--spacing) * 2)",
    borderRadius: "calc(var(--radius) - 4px)",
    paddingInline: "calc(var(--spacing) * 2)",
    paddingBlock: "calc(var(--spacing) * 1.5)",
    "[data-inset]": {
      paddingLeft: "calc(var(--spacing) * 8)",
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
    '[data-variant="destructive"] > svg': {
      color: "var(--destructive)",
    },
  },
);

const checkItem = ui(
  text.sm,
  box.outline,
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
    gap: "calc(var(--spacing) * 2)",
    borderRadius: "calc(var(--radius) - 4px)",
    paddingBlock: "calc(var(--spacing) * 1.5)",
    paddingRight: "calc(var(--spacing) * 2)",
    paddingLeft: "calc(var(--spacing) * 8)",
  },
);

const indicator = ui({
  pointerEvents: "none",
  position: "absolute",
  left: "calc(var(--spacing) * 2)",
  display: "flex",
  width: "calc(var(--spacing) * 3.5)",
  height: "calc(var(--spacing) * 3.5)",
  alignItems: "center",
  justifyContent: "center",
  "& > svg": {
    display: "none",
  },
  "[data-selected] & > svg": {
    display: "block",
  },
});

const radioIndicator = ui({
  pointerEvents: "none",
  position: "absolute",
  left: "calc(var(--spacing) * 2)",
  display: "flex",
  width: "calc(var(--spacing) * 3.5)",
  height: "calc(var(--spacing) * 3.5)",
  alignItems: "center",
  justifyContent: "center",
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

const label = ui(text.sm, text.medium, {
  paddingInline: "calc(var(--spacing) * 2)",
  paddingBlock: "calc(var(--spacing) * 1.5)",
  "[data-inset]": {
    paddingLeft: "calc(var(--spacing) * 8)",
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
  marginLeft: "auto",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  "--ui-tracking": "var(--tracking-widest)",
  letterSpacing: "var(--tracking-widest)",
  color: "var(--muted-foreground)",
});

const subTrigger = ui(
  text.sm,
  box.outline,
  box.noSelect,
  when.focused,
  icon.plain,
  icon.sized,
  icon.muted,
  {
    display: "flex",
    cursor: "default",
    alignItems: "center",
    gap: "calc(var(--spacing) * 2)",
    borderRadius: "calc(var(--radius) - 4px)",
    paddingInline: "calc(var(--spacing) * 2)",
    paddingBlock: "calc(var(--spacing) * 1.5)",
    "[data-inset]": {
      paddingLeft: "calc(var(--spacing) * 8)",
    },
    "[data-open]": {
      backgroundColor: "var(--accent)",
      color: "var(--accent-foreground)",
    },
  },
);

const subChevron = ui({
  marginLeft: "auto",
  width: "calc(var(--spacing) * 4)",
  height: "calc(var(--spacing) * 4)",
});

const group = ui({
  margin: "0px",
  listStyleType: "none",
  padding: "0px",
});

const groupLabel = ui(text.sm, text.medium, {
  paddingInline: "calc(var(--spacing) * 2)",
  paddingBlock: "calc(var(--spacing) * 1.5)",
  color: "var(--muted-foreground)",
});

export interface DropdownMenuProps extends MenuTriggerComponentProps {}

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
 * Typeahead, roving focus, Home/End, the arrow keys and the submenu's own
 * safe-triangle pointer tracking all come from `@barqjs/aria` and are not
 * reimplemented here.
 */
export function DropdownMenu(props: Incoming<DropdownMenuProps>) {
  return <MenuTrigger {...props} />;
}

/**
 * Hands the trigger's props to whatever control is inside it.
 *
 * `@barqjs/aria` has a `<MenuButton>` for this, and it renders a bare
 * `<button>`; the button here has to be YOURS, with its own variant and size.
 * The slot is how `aria-haspopup`, `aria-expanded` and the keyboard handling
 * reach it without an element in between.
 */
export function DropdownMenuTrigger(props: Incoming<{ children?: Child }>) {
  const trigger = useMenuTrigger();
  if (trigger === null) throw new Error("A DropdownMenuTrigger must be inside a DropdownMenu.");

  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;
  return provide(
    owner,
    Slotted,
    () => true,
    () => {
      provideTriggerSlot({
        props: trigger.menuTriggerProps,
        ref: trigger.triggerRef.set,
      });
      return props.children;
    },
  ) as never;
}

/** Nothing reads it. `provide` is what creates the scope the slot is installed in. */
const Slotted = context<boolean>(false);

export interface DropdownMenuContentProps<T> extends MenuComponentProps<T> {}

export function DropdownMenuContent<T>(props: Incoming<DropdownMenuContentProps<T>>) {
  return (
    <Menu
      {...props}
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
}

export function DropdownMenuItem(props: Incoming<DropdownMenuItemProps>) {
  return (
    <MenuItem
      {...props}
      data-slot={props["data-slot"]?.() ?? "dropdown-menu-item"}
      data-variant={props.variant?.() ?? "default"}
      data-inset={props.inset?.() === true ? "" : undefined}
      class={ui(item, props.class?.(), props.className?.())}
    />
  );
}

export interface DropdownMenuCheckboxItemProps extends MenuItemComponentProps {}

/**
 * An item with a tick.
 *
 * Whether it is ticked is the menu's SELECTION, so the content around it needs
 * `selectionMode="multiple"`. The tick is shown by CSS off `data-selected`
 * rather than by a conditional, so toggling one writes one attribute.
 */
export function DropdownMenuCheckboxItem(props: Incoming<DropdownMenuCheckboxItemProps>) {
  return (
    <MenuItem
      {...props}
      data-slot={props["data-slot"]?.() ?? "dropdown-menu-checkbox-item"}
      class={ui(checkItem, props.class?.(), props.className?.())}
    >
      <span data-slot="dropdown-menu-item-indicator" class={indicator}>
        <Check />
      </span>
      {props.children}
    </MenuItem>
  );
}

export interface DropdownMenuRadioItemProps extends MenuItemComponentProps {}

/** As above, with `selectionMode="single"`. */
export function DropdownMenuRadioItem(props: Incoming<DropdownMenuRadioItemProps>) {
  return (
    <MenuItem
      {...props}
      data-slot={props["data-slot"]?.() ?? "dropdown-menu-radio-item"}
      class={ui(checkItem, props.class?.(), props.className?.())}
    >
      <span data-slot="dropdown-menu-item-indicator" class={radioIndicator}>
        <Circle />
      </span>
      {props.children}
    </MenuItem>
  );
}

export interface DropdownMenuLabelProps extends UiProps {
  inset?: boolean;
}

export function DropdownMenuLabel(props: Incoming<DropdownMenuLabelProps>) {
  return (
    <li
      {...uiProps("dropdown-menu-label", label, props)}
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

/** A section of the collection: an item whose own `children` are its items. */
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
  return <SubmenuTrigger {...props} />;
}

export interface DropdownMenuSubTriggerProps extends MenuItemComponentProps {
  inset?: boolean;
}

export function DropdownMenuSubTrigger(props: Incoming<DropdownMenuSubTriggerProps>) {
  return (
    <MenuItem
      {...props}
      data-slot={props["data-slot"]?.() ?? "dropdown-menu-sub-trigger"}
      data-inset={props.inset?.() === true ? "" : undefined}
      class={ui(subTrigger, props.class?.(), props.className?.())}
    >
      {props.children}
      <ChevronRight data-slot="dropdown-menu-sub-chevron" class={subChevron} />
    </MenuItem>
  );
}

export interface DropdownMenuSubContentProps<T> extends MenuComponentProps<T> {}

export function DropdownMenuSubContent<T>(props: Incoming<DropdownMenuSubContentProps<T>>) {
  return (
    <Menu
      {...props}
      data-slot={props["data-slot"]?.() ?? "dropdown-menu-sub-content"}
      class={ui(content, props.class?.(), props.className?.())}
    />
  );
}

/** The label a `<DropdownMenuGroup>` renders as its heading. */
export function DropdownMenuGroupLabel(props: Incoming<UiProps>) {
  return <span {...uiProps("dropdown-menu-group-label", groupLabel, props)}>{props.children}</span>;
}
