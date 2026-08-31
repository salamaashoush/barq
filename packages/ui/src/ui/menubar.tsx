import {
  MenuTrigger,
  type MenuComponentProps,
  type MenuTriggerComponentProps,
} from "@barqjs/aria/menu";
import type { Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { Button, type ButtonProps } from "./button.tsx";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuLabel,
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

const bar = ui({
  display: "flex",
  height: "calc(var(--spacing) * 9)",
  alignItems: "center",
  gap: "var(--spacing)",
  borderRadius: "calc(var(--radius) - 2px)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  backgroundColor: "var(--background)",
  padding: "var(--spacing)",
  "--ui-shadow": "0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05))",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
});

const trigger = ui({
  display: "flex",
  height: "auto",
  alignItems: "center",
  borderRadius: "calc(var(--radius) - 4px)",
  paddingInline: "calc(var(--spacing) * 2)",
  paddingBlock: "var(--spacing)",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  "-webkit-user-select": "none",
  userSelect: "none",
  "@media (forced-colors: active)": {
    outline: "2px solid transparent",
    outlineOffset: "2px",
  },
  "[data-focused]": {
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
  },
  "[data-expanded], &[data-open]": {
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
  },
});

/** shadcn's menubar opens wider than a dropdown does. */
const wide = ui({
  minWidth: "12rem",
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
      class={ui(wide, props.class?.(), props.className?.())}
    />
  );
}

export interface MenubarItemProps extends DropdownMenuItemProps {}

export function MenubarItem(props: Incoming<MenubarItemProps>) {
  return <DropdownMenuItem {...props} data-slot="menubar-item" />;
}

export interface MenubarCheckboxItemProps extends DropdownMenuCheckboxItemProps {}

export function MenubarCheckboxItem(props: Incoming<MenubarCheckboxItemProps>) {
  return <DropdownMenuCheckboxItem {...props} data-slot="menubar-checkbox-item" />;
}

export interface MenubarRadioItemProps extends DropdownMenuRadioItemProps {}

export function MenubarRadioItem(props: Incoming<MenubarRadioItemProps>) {
  return <DropdownMenuRadioItem {...props} data-slot="menubar-radio-item" />;
}

export interface MenubarLabelProps extends DropdownMenuLabelProps {}

export function MenubarLabel(props: Incoming<MenubarLabelProps>) {
  return <DropdownMenuLabel {...props} data-slot="menubar-label" />;
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
