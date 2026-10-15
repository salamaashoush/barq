import { useMenuGroupHeading } from "@barqjs/aria/menu";
import {
  Menubar as AriaMenubar,
  MenubarMenu as AriaMenubarMenu,
  menubarTrigger,
  type MenubarComponentProps,
  type MenubarMenuComponentProps,
} from "@barqjs/aria/menubar";
import { filterDOMProps, fromProps, mergeProps } from "@barqjs/aria/utils";
import type { Child, Incoming, JSXElement } from "@barqjs/core";
import { layer } from "@barqjs/css";
import { mergeRefs, type RefTarget } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { when } from "../lib/shared-when.ts";
import { text } from "../lib/shared-text.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import type { TriggerRender } from "../lib/trigger.tsx";
import { buttonVariants, type ButtonProps } from "./button.tsx";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
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
    // `aria-expanded` as well as the attributes the menu writes: a trigger
    // keeps its fill while its menu is open, and that is the state a screen
    // reader is told about too.
    '[data-expanded], &[data-open], &[data-state="open"]': {
      backgroundColor: "var(--muted)",
    },
    '[aria-expanded="true"]': {
      backgroundColor: "var(--muted)",
    },
  },
);

/**
 * A menubar's label is the body colour at `text-sm`, not the dropdown's muted
 * `text-xs`, and its ticks sit at the START where a dropdown's are at the end.
 */
const label = ui(text.medium, {
  paddingInline: "calc(var(--spacing) * 1.5)",
  paddingBlock: "var(--spacing)",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  "[data-inset]": {
    paddingInlineStart: "calc(var(--spacing) * 7)",
  },
});

export interface MenubarProps extends MenubarComponentProps {}

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
 * The row is ONE widget, which is what makes it a menubar rather than a row
 * of dropdowns: a single Tab stop, the horizontal arrows and a typed letter
 * moving between the triggers, and, once a menu is open, the arrows and the
 * pointer carrying it from one menu to the next. That is `@barqjs/aria`'s
 * `Menubar`. Everything inside a menu is `<DropdownMenu>`'s: the same
 * collection, the same keyboard, the same CSS, and the same choice between
 * items rendered from data and items written as children.
 *
 * `value` is the open menu's `value`, and `""` when none is.
 */
export function Menubar(props: Incoming<MenubarProps>) {
  return (
    <AriaMenubar
      {...props}
      data-slot={props["data-slot"]?.() ?? "menubar"}
      class={ui(bar, props.class?.(), props.className?.())}
    />
  );
}

export interface MenubarMenuProps extends MenubarMenuComponentProps {}

/**
 * One menu in the bar. Which menu is open is the bar's `value`; `isOpen`,
 * `defaultOpen` and `onOpenChange` are for a caller that cares about this one.
 */
export function MenubarMenu(props: Incoming<MenubarMenuProps>) {
  return <AriaMenubarMenu {...props} />;
}

export interface MenubarPortalProps extends DropdownMenuPortalProps {}

export function MenubarPortal(props: Incoming<MenubarPortalProps>) {
  return <DropdownMenuPortal {...props} />;
}

export interface MenubarTriggerProps extends Omit<
  ButtonProps,
  "variant" | "size" | "href" | "target" | "rel"
> {
  role?: string;
  ref?: RefTarget<HTMLButtonElement>;
  /** Any other element as the trigger, built from the props and the ref it is handed. */
  render?: (trigger: TriggerRender) => Child;
}

/**
 * The button in the bar. It IS the button, as upstream's is, and takes
 * `render` for the caller who wants another element in its place.
 *
 * Its role is `menuitem`, the ARIA menubar pattern's and Radix's: the bar is a
 * `menubar`, and what sits in one is an item that happens to open a menu. A
 * `role` given by the caller wins.
 */
export function MenubarTrigger(props: Incoming<MenubarTriggerProps>) {
  const options = fromProps(props);
  const { triggerProps, ref } = menubarTrigger({
    ...options,
    isDisabled: () => props.isDisabled?.() ?? props.disabled?.(),
  });
  const { role: patternRole, ...behaviour } = triggerProps;

  const elementProps = mergeProps(behaviour, filterDOMProps(options, { global: true }), {
    role: () => props.role?.() ?? patternRole,
    "aria-label": () => props["aria-label"]?.(),
    "data-slot": () => props["data-slot"]?.() ?? "menubar-trigger",
    "data-variant": "ghost",
    "data-size": "default",
    class: () =>
      ui(buttonVariants({ variant: "ghost" }), trigger, props.class?.(), props.className?.()),
    style: () => props.style?.(),
  });

  const render = props.render?.();
  if (render !== undefined) return render({ props: elementProps, ref }) as JSXElement;

  return (
    <button {...elementProps} ref={mergeRefs(ref, props.ref?.())}>
      {props.children}
    </button>
  );
}

export interface MenubarContentProps<T> extends DropdownMenuContentProps<T> {}

/** Aligned to the start of its trigger and pulled 4px back past it, as upstream's is. */
export function MenubarContent<T>(props: Incoming<MenubarContentProps<T>>) {
  return (
    <DropdownMenuContent
      {...props}
      alignOffset={props.alignOffset?.() ?? -4}
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

export interface MenubarRadioGroupProps extends DropdownMenuRadioGroupProps {}

export function MenubarRadioGroup(props: Incoming<MenubarRadioGroupProps>) {
  return <DropdownMenuRadioGroup {...props} data-slot="menubar-radio-group" />;
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
  const heading = useMenuGroupHeading();
  return (
    <li
      {...uiProps("menubar-label", label, props)}
      id={props.id?.() ?? heading?.()}
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

export interface MenubarSubContentProps<T> extends DropdownMenuSubContentProps<T> {}

export function MenubarSubContent<T>(props: Incoming<MenubarSubContentProps<T>>) {
  return <DropdownMenuSubContent {...props} data-slot="menubar-sub-content" />;
}
