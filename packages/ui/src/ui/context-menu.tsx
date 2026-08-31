import {
  ContextMenu as AriaContextMenu,
  ContextMenuTrigger as AriaContextMenuTrigger,
  MenuItem,
  type ContextMenuComponentProps,
  type ContextMenuTriggerComponentProps,
  type MenuComponentProps,
  type MenuItemComponentProps,
} from "@barqjs/aria/menu";
import type { Incoming } from "@barqjs/core";
import { atomsIn } from "@barqjs/css";

import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";

import "../theme/layers.ts";
import { ui } from "../lib/atoms.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  type DropdownMenuCheckboxItemProps,
  type DropdownMenuGroupProps,
  type DropdownMenuItemProps,
  type DropdownMenuRadioItemProps,
  type DropdownMenuSubProps,
} from "./dropdown-menu.tsx";

/** shadcn's context menu names its labels in the body colour; a dropdown's inherit. */
const label = atomsIn("barq.ui", {
  paddingInline: "calc(var(--spacing) * 2)",
  paddingBlock: "calc(var(--spacing) * 1.5)",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
  color: "var(--foreground)",
  "[data-inset]": {
    paddingLeft: "calc(var(--spacing) * 8)",
  },
});

/** And its submenu trigger has no gap, so the chevron's own margin is the whole of it. */
const subTrigger = atomsIn("barq.ui", {
  display: "flex",
  cursor: "default",
  alignItems: "center",
  borderRadius: "calc(var(--radius) - 4px)",
  paddingInline: "calc(var(--spacing) * 2)",
  paddingBlock: "calc(var(--spacing) * 1.5)",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  "-webkit-user-select": "none",
  userSelect: "none",
  "[data-inset]": {
    paddingLeft: "calc(var(--spacing) * 8)",
  },
  "[data-focused]": {
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
  },
  "[data-open]": {
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
  },
  "& svg": {
    pointerEvents: "none",
    flexShrink: "0",
  },
  '& svg:not([class*="size-"])': {
    width: "calc(var(--spacing) * 4)",
    height: "calc(var(--spacing) * 4)",
  },
  '& svg:not([class*="text-"])': {
    color: "var(--muted-foreground)",
  },
});

const subChevron = atomsIn("barq.ui", {
  marginLeft: "auto",
  width: "calc(var(--spacing) * 4)",
  height: "calc(var(--spacing) * 4)",
});

export interface ContextMenuProps extends ContextMenuComponentProps {}

/**
 * ```tsx
 * <ContextMenu>
 *   <ContextMenuTrigger>Right-click anywhere in here</ContextMenuTrigger>
 *   <ContextMenuContent items={actions} aria-label="Actions" onAction={run}>
 *     {(action) => <ContextMenuItem>{action.name}</ContextMenuItem>}
 *   </ContextMenuContent>
 * </ContextMenu>
 * ```
 *
 * Everything inside is `<DropdownMenu>`'s: the same collection, the same
 * keyboard, the same CSS. What differs is where the menu goes, which is the
 * point the pointer was at rather than the edge of a button.
 *
 * Give the content an `aria-label`. The trigger is a region rather than a
 * control, so there is no short name to inherit.
 */
export function ContextMenu(props: Incoming<ContextMenuProps>) {
  return <AriaContextMenu {...props} />;
}

export interface ContextMenuTriggerProps extends ContextMenuTriggerComponentProps {}

/** The region the menu opens over. Unlike every other trigger here, it renders an element. */
export function ContextMenuTrigger(props: Incoming<ContextMenuTriggerProps>) {
  return (
    <AriaContextMenuTrigger
      {...props}
      data-slot={props["data-slot"]?.() ?? "context-menu-trigger"}
    />
  );
}

export interface ContextMenuContentProps<T> extends MenuComponentProps<T> {}

export function ContextMenuContent<T>(props: Incoming<ContextMenuContentProps<T>>) {
  return <DropdownMenuContent {...props} data-slot="context-menu-content" />;
}

export interface ContextMenuItemProps extends DropdownMenuItemProps {}

export function ContextMenuItem(props: Incoming<ContextMenuItemProps>) {
  return <DropdownMenuItem {...props} data-slot="context-menu-item" />;
}

export interface ContextMenuCheckboxItemProps extends DropdownMenuCheckboxItemProps {}

export function ContextMenuCheckboxItem(props: Incoming<ContextMenuCheckboxItemProps>) {
  return <DropdownMenuCheckboxItem {...props} data-slot="context-menu-checkbox-item" />;
}

export interface ContextMenuRadioItemProps extends DropdownMenuRadioItemProps {}

export function ContextMenuRadioItem(props: Incoming<ContextMenuRadioItemProps>) {
  return <DropdownMenuRadioItem {...props} data-slot="context-menu-radio-item" />;
}

export interface ContextMenuLabelProps extends UiProps {
  /** Indent past the space a tick would occupy, so a mixed menu lines up. */
  inset?: boolean;
}

export function ContextMenuLabel(props: Incoming<ContextMenuLabelProps>) {
  return (
    <li
      {...uiProps("context-menu-label", label, props)}
      role="presentation"
      data-inset={props.inset?.() === true ? "" : undefined}
    >
      {props.children}
    </li>
  );
}

export function ContextMenuSeparator(props: Incoming<UiProps>) {
  return <DropdownMenuSeparator {...props} data-slot="context-menu-separator" />;
}

export function ContextMenuShortcut(props: Incoming<UiProps>) {
  return <DropdownMenuShortcut {...props} data-slot="context-menu-shortcut" />;
}

export interface ContextMenuGroupProps<T> extends DropdownMenuGroupProps<T> {}

export function ContextMenuGroup<T>(props: Incoming<ContextMenuGroupProps<T>>) {
  return <DropdownMenuGroup {...props} data-slot="context-menu-group" />;
}

export function ContextMenuGroupLabel(props: Incoming<UiProps>) {
  return <DropdownMenuGroupLabel {...props} data-slot="context-menu-group-label" />;
}

export interface ContextMenuSubProps extends DropdownMenuSubProps {}

export function ContextMenuSub(props: Incoming<ContextMenuSubProps>) {
  return <DropdownMenuSub {...props} />;
}

export interface ContextMenuSubTriggerProps extends MenuItemComponentProps {
  inset?: boolean;
}

export function ContextMenuSubTrigger(props: Incoming<ContextMenuSubTriggerProps>) {
  return (
    <MenuItem
      {...props}
      data-slot={props["data-slot"]?.() ?? "context-menu-sub-trigger"}
      data-inset={props.inset?.() === true ? "" : undefined}
      class={ui(subTrigger, props.class?.(), props.className?.())}
    >
      {props.children}
      <ChevronRight data-slot="context-menu-sub-chevron" class={subChevron} />
    </MenuItem>
  );
}

export interface ContextMenuSubContentProps<T> extends MenuComponentProps<T> {}

export function ContextMenuSubContent<T>(props: Incoming<ContextMenuSubContentProps<T>>) {
  return <DropdownMenuSubContent {...props} data-slot="context-menu-sub-content" />;
}
