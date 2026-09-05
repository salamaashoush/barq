import {
  MenuTrigger,
  type MenuComponentProps,
  type MenuTriggerComponentProps,
} from "@barqjs/aria/menu";
import type { Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { when } from "../lib/shared-when.ts";
import { text } from "../lib/shared-text.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { Button, type ButtonProps } from "./button.tsx";
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
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  type DropdownMenuCheckboxItemProps,
  type DropdownMenuGroupProps,
  type DropdownMenuItemProps,
  type DropdownMenuLabelProps,
  type DropdownMenuRadioItemProps,
  type DropdownMenuSubProps,
  type DropdownMenuSubTriggerProps,
} from "./dropdown-menu.tsx";

const ui = layer("barq.ui");

const bar = ui(box.border, {
  display: "flex",
  height: "calc(var(--spacing) * 8)",
  alignItems: "center",
  gap: "calc(var(--spacing) * 0.5)",
  borderRadius: "var(--radius)",
  padding: "3px",
});

const trigger = ui(
  text.sm,
  text.medium,
  box.outline,
  box.noSelect,
  box.forcedColors,
  when.focused,
  {
    display: "flex",
    height: "auto",
    alignItems: "center",
    // The trigger is a `<Button variant="ghost">` here and a bare button
    // upstream, and the button's transparent 1px edge made every trigger 2px
    // taller than theirs: 26 against 24, measured on their menubar page.
    borderStyle: "none",
    borderRadius: "calc(var(--radius) * 0.6)",
    paddingInline: "calc(var(--spacing) * 1.5)",
    paddingBlock: "2px",
    "@media (hover: hover)": {
      ":hover": {
        backgroundColor: "var(--muted)",
      },
    },
    // `aria-expanded` as well as the attribute the menu writes: a trigger keeps
    // its fill while its menu is open, and that is the state a screen reader
    // is told about too.
    "[data-expanded], &[data-open]": {
      backgroundColor: "var(--muted)",
    },
    '[aria-expanded="true"]': {
      backgroundColor: "var(--muted)",
    },
  },
);

/**
 * A menubar's label is the body colour at `text-sm`, not the dropdown's muted
 * `text-xs`, and its ticks sit on the LEFT where a dropdown's are on the right.
 */
const label = ui(text.medium, {
  paddingInline: "calc(var(--spacing) * 1.5)",
  paddingBlock: "var(--spacing)",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  "[data-inset]": {
    paddingLeft: "calc(var(--spacing) * 7)",
  },
});

export interface MenubarProps extends UiProps {}

/**
 * ```tsx
 * <Menubar>
 *   <MenubarMenu>
 *     <MenubarTrigger>File</MenubarTrigger>
 *     <MenubarContent items={fileActions} onAction={run}>
 *       {(action) => <MenubarItem>{action.name}</MenubarItem>}
 *     </MenubarContent>
 *   </MenubarMenu>
 * </Menubar>
 * ```
 *
 * The left and right arrows move between the menus, which is what makes a row
 * of dropdowns a menubar rather than a row of dropdowns. Everything inside one
 * is `<DropdownMenu>`'s: the same collection, the same keyboard, the same CSS.
 */
export function Menubar(props: Incoming<MenubarProps>) {
  const move = (event: KeyboardEvent): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const container = event.currentTarget as HTMLElement;
    const triggers = [...container.querySelectorAll<HTMLElement>('[data-slot="menubar-trigger"]')];
    const at = triggers.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : -1;
    triggers[(at + step + triggers.length) % triggers.length]?.focus();
  };

  return (
    <div {...uiProps("menubar", bar, props)} role={props.role?.() ?? "menubar"} onKeyDown={move}>
      {props.children}
    </div>
  );
}

export interface MenubarMenuProps extends MenuTriggerComponentProps {}

/** One menu in the bar. Holds its own open state, like a `<DropdownMenu>`. */
export function MenubarMenu(props: Incoming<MenubarMenuProps>) {
  return <MenuTrigger {...props} />;
}

export interface MenubarTriggerProps extends Omit<ButtonProps, "variant" | "size"> {}

export function MenubarTrigger(props: Incoming<MenubarTriggerProps>) {
  return (
    <DropdownMenuTrigger>
      <Button
        {...props}
        variant="ghost"
        data-slot="menubar-trigger"
        class={ui(trigger, props.class?.(), props.className?.())}
      >
        {props.children}
      </Button>
    </DropdownMenuTrigger>
  );
}

export interface MenubarContentProps<T> extends MenuComponentProps<T> {}

export function MenubarContent<T>(props: Incoming<MenubarContentProps<T>>) {
  return (
    <DropdownMenuContent
      {...props}
      data-slot="menubar-content"
      class={ui(props.class?.(), props.className?.())}
    />
  );
}

export interface MenubarItemProps extends DropdownMenuItemProps {}

export function MenubarItem(props: Incoming<MenubarItemProps>) {
  return <DropdownMenuItem {...props} data-slot="menubar-item" />;
}

export interface MenubarCheckboxItemProps extends DropdownMenuCheckboxItemProps {}

export function MenubarCheckboxItem(props: Incoming<MenubarCheckboxItemProps>) {
  return (
    <DropdownMenuCheckboxItem
      {...props}
      data-slot="menubar-checkbox-item"
      indicatorSlot="menubar-checkbox-item-indicator"
    />
  );
}

export interface MenubarRadioItemProps extends DropdownMenuRadioItemProps {}

export function MenubarRadioItem(props: Incoming<MenubarRadioItemProps>) {
  return (
    <DropdownMenuRadioItem
      {...props}
      data-slot="menubar-radio-item"
      indicatorSlot="menubar-radio-item-indicator"
    />
  );
}

export interface MenubarLabelProps extends DropdownMenuLabelProps {}

/** Its own element, because a menubar's label is body-coloured `text-sm`. */
export function MenubarLabel(props: Incoming<MenubarLabelProps>) {
  return (
    <li
      {...uiProps("menubar-label", label, props)}
      role="presentation"
      data-inset={props.inset?.() === true ? "" : undefined}
    >
      {props.children}
    </li>
  );
}

export function MenubarSeparator(props: Incoming<UiProps>) {
  return <DropdownMenuSeparator {...props} data-slot="menubar-separator" />;
}

export function MenubarShortcut(props: Incoming<UiProps>) {
  return <DropdownMenuShortcut {...props} data-slot="menubar-shortcut" />;
}

export interface MenubarGroupProps<T> extends DropdownMenuGroupProps<T> {}

export function MenubarGroup<T>(props: Incoming<MenubarGroupProps<T>>) {
  return <DropdownMenuGroup {...props} data-slot="menubar-group" />;
}

export function MenubarGroupLabel(props: Incoming<UiProps>) {
  return <DropdownMenuGroupLabel {...props} data-slot="menubar-group-label" />;
}

export interface MenubarSubProps extends DropdownMenuSubProps {}

export function MenubarSub(props: Incoming<MenubarSubProps>) {
  return <DropdownMenuSub {...props} />;
}

export interface MenubarSubTriggerProps extends DropdownMenuSubTriggerProps {}

export function MenubarSubTrigger(props: Incoming<MenubarSubTriggerProps>) {
  return <DropdownMenuSubTrigger {...props} data-slot="menubar-sub-trigger" />;
}

export interface MenubarSubContentProps<T> extends MenuComponentProps<T> {}

export function MenubarSubContent<T>(props: Incoming<MenubarSubContentProps<T>>) {
  return <DropdownMenuSubContent {...props} data-slot="menubar-sub-content" />;
}
