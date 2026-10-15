import {
  ContextMenu as AriaContextMenu,
  ContextMenuTrigger as AriaContextMenuTrigger,
  type ContextMenuComponentProps,
  type ContextMenuTriggerComponentProps,
} from "@barqjs/aria/menu";
import type { Incoming } from "@barqjs/core";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  type DropdownMenuCheckboxItemProps,
  type DropdownMenuContentProps,
  type DropdownMenuGroupProps,
  type DropdownMenuItemProps,
  type DropdownMenuLabelProps,
  type DropdownMenuPortalProps,
  type DropdownMenuRadioGroupProps,
  type DropdownMenuRadioItemProps,
  type DropdownMenuSubContentProps,
  type DropdownMenuSubProps,
  type DropdownMenuSubTriggerProps,
} from "./dropdown-menu.tsx";

export interface ContextMenuProps extends ContextMenuComponentProps {
  /** Upstream's name for `isOpen`. */
  open?: boolean;
}

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
 * keyboard, the same CSS, and the same choice between items rendered from data
 * and items written as children. What differs is where the menu goes, which is
 * the point the pointer was at rather than the edge of a button.
 *
 * Give the content an `aria-label`. The trigger is a region rather than a
 * control, so there is no short name to inherit.
 */
export function ContextMenu(props: Incoming<ContextMenuProps>) {
  return <AriaContextMenu {...props} isOpen={props.isOpen?.() ?? props.open?.()} />;
}

export interface ContextMenuPortalProps extends DropdownMenuPortalProps {}

export function ContextMenuPortal(props: Incoming<ContextMenuPortalProps>) {
  return <DropdownMenuPortal {...props} />;
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

export interface ContextMenuContentProps<T> extends DropdownMenuContentProps<T> {}

export function ContextMenuContent<T>(props: Incoming<ContextMenuContentProps<T>>) {
  return <DropdownMenuContent {...props} data-slot="context-menu-content" />;
}

export interface ContextMenuItemProps extends DropdownMenuItemProps {}

export function ContextMenuItem(props: Incoming<ContextMenuItemProps>) {
  return <DropdownMenuItem {...props} data-slot="context-menu-item" />;
}

export interface ContextMenuCheckboxItemProps extends DropdownMenuCheckboxItemProps {}

export function ContextMenuCheckboxItem(props: Incoming<ContextMenuCheckboxItemProps>) {
  return (
    <DropdownMenuCheckboxItem
      {...props}
      data-slot="context-menu-checkbox-item"
      indicatorSlot="context-menu-item-indicator"
    />
  );
}

export interface ContextMenuRadioGroupProps extends DropdownMenuRadioGroupProps {}

export function ContextMenuRadioGroup(props: Incoming<ContextMenuRadioGroupProps>) {
  return <DropdownMenuRadioGroup {...props} data-slot="context-menu-radio-group" />;
}

export interface ContextMenuRadioItemProps extends DropdownMenuRadioItemProps {}

export function ContextMenuRadioItem(props: Incoming<ContextMenuRadioItemProps>) {
  return (
    <DropdownMenuRadioItem
      {...props}
      data-slot="context-menu-radio-item"
      indicatorSlot="context-menu-item-indicator"
    />
  );
}

export interface ContextMenuLabelProps extends DropdownMenuLabelProps {}

export function ContextMenuLabel(props: Incoming<ContextMenuLabelProps>) {
  return <DropdownMenuLabel {...props} data-slot="context-menu-label" />;
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

export interface ContextMenuSubTriggerProps extends DropdownMenuSubTriggerProps {}

/** The same row as a dropdown's now: upstream stopped styling the two apart. */
export function ContextMenuSubTrigger(props: Incoming<ContextMenuSubTriggerProps>) {
  return <DropdownMenuSubTrigger {...props} data-slot="context-menu-sub-trigger" />;
}

export interface ContextMenuSubContentProps<T> extends DropdownMenuSubContentProps<T> {}

export function ContextMenuSubContent<T>(props: Incoming<ContextMenuSubContentProps<T>>) {
  return <DropdownMenuSubContent {...props} data-slot="context-menu-sub-content" />;
}
