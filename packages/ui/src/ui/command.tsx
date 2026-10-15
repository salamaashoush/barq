import { comboBox, comboBoxState, type ComboBoxState, type FilterFn } from "@barqjs/aria/combobox";
import {
  Command as WrittenCommand,
  CommandEmpty as WrittenEmpty,
  CommandGroup as WrittenGroup,
  CommandInput as WrittenInput,
  CommandItem as WrittenItem,
  CommandList as WrittenList,
  CommandLoading as WrittenLoading,
  CommandSeparator as WrittenSeparator,
  type CommandFilter,
} from "@barqjs/aria/command";
import { layer } from "@barqjs/css";
import {
  listBox,
  listBoxSection,
  ListBoxProvider,
  Option,
  provideItemNode,
  provideItemRender,
  type ListBoxContextValue,
} from "@barqjs/aria/listbox";
import type { ItemAccessors, Key, Node } from "@barqjs/aria/collections";
import { fromProps, mergeProps } from "@barqjs/aria/utils";
import {
  createContext,
  For,
  getContext,
  getOwner,
  install,
  provide,
  Show,
  type Child,
  type Incoming,
} from "@barqjs/core";

import { Search } from "@barqjs/lucide/icons/search";
import { ref as makeRef } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { icon } from "../lib/shared-icon.ts";
import { when } from "../lib/shared-when.ts";
import { text } from "../lib/shared-text.ts";
import type { UiProps } from "../lib/props.ts";
import { omit, uiProps } from "../lib/slot.ts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./dialog.tsx";
import { srOnly } from "./sr-only.ts";

const ui = layer("barq.ui");

const root = ui({
  display: "flex",
  height: "100%",
  width: "100%",
  flexDirection: "column",
  overflow: "hidden",
  // `!important` upstream, so a dialog wrapping the palette cannot flatten its
  // corners with its own radius.
  borderRadius: "calc(var(--radius) * 1.4) !important",
  backgroundColor: "var(--popover)",
  padding: "var(--spacing)",
  color: "var(--popover-foreground)",
});

const inputWrapper = ui({
  display: "flex",
  height: "calc(var(--spacing) * 9)",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
  borderBottomStyle: "var(--ui-border-style)",
  borderBottomWidth: "1px",
  padding: "var(--spacing)",
  paddingBottom: "0px",
});

const inputIcon = ui({
  width: "calc(var(--spacing) * 4)",
  height: "calc(var(--spacing) * 4)",
  flexShrink: "0",
  opacity: "50%",
});

const input = ui(text.sm, box.outline, box.forcedColors, {
  display: "flex",
  height: "calc(var(--spacing) * 10)",
  width: "100%",
  borderRadius: "calc(var(--radius) * 0.8)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "0px",
  backgroundColor: "transparent",
  paddingBlock: "calc(var(--spacing) * 3)",
  "::placeholder": {
    color: "var(--muted-foreground)",
  },
  ":disabled": {
    cursor: "not-allowed",
    opacity: "50%",
  },
});

const list = ui(box.outline, {
  margin: "0px",
  maxHeight: "calc(var(--spacing) * 72)",
  scrollPaddingBlock: "var(--spacing)",
  listStyleType: "none",
  overflowX: "hidden",
  overflowY: "auto",
  padding: "0px",
  // `no-scrollbar`: the palette scrolls and says so with its own rows moving,
  // and a bar down the side of a floating panel is noise.
  "-ms-overflow-style": "none",
  scrollbarWidth: "none",
  "::-webkit-scrollbar": {
    display: "none",
  },
  // A combobox's list is the same element inside a popover, and it stops short
  // of the height a palette takes: the input above it is part of the panel, so
  // the list gets what is left rather than the whole of it.
  '[data-slot="combobox-list"]': {
    maxHeight:
      "min(calc(calc(var(--spacing) * 72) - calc(var(--spacing) * 9)), calc(var(--barq-available-height) - calc(var(--spacing) * 9)))",
    overscrollBehavior: "contain",
    padding: "var(--spacing)",
  },
  '[data-slot="combobox-list"][data-empty]': {
    padding: "0px",
  },
});

const empty = ui(text.sm, {
  paddingBlock: "calc(var(--spacing) * 6)",
  textAlign: "center",
  // A combobox shows its empty state only when the list really is empty, and
  // in a shorter box: the popover is a picker, not a page.
  '[data-slot="combobox-empty"]': {
    display: "none",
    width: "100%",
    justifyContent: "center",
    paddingBlock: "calc(var(--spacing) * 2)",
    textAlign: "center",
    color: "var(--muted-foreground)",
  },
  ':is(:where(.group\\/combobox-content)[data-empty] *)[data-slot="combobox-empty"]': {
    display: "flex",
  },
});

/**
 * The group and its heading in one class.
 *
 * Upstream styles the heading through `**:[[cmdk-group-heading]]` — a rule the
 * GROUP writes about a descendant — rather than giving it a class of its own,
 * and keeping the two in one call is what lets `verify` see the whole slot.
 */
const group = ui({
  margin: "0px",
  listStyleType: "none",
  overflow: "hidden",
  padding: "var(--spacing)",
  color: "var(--foreground)",
  ':is(& *)[data-slot="command-group-label"]': {
    paddingInline: "calc(var(--spacing) * 2)",
    paddingBlock: "calc(var(--spacing) * 1.5)",
    fontSize: "var(--text-xs)",
    lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
    "--ui-font-weight": "var(--font-weight-medium)",
    fontWeight: "var(--font-weight-medium)",
    color: "var(--muted-foreground)",
  },
});

const separator = ui({
  marginInline: "calc(var(--spacing) * -1)",
  height: "1px",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "0px",
  backgroundColor: "var(--border)",
});

const item = ui(
  text.sm,
  box.outline,
  box.noSelect,
  box.forcedColors,
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
    borderRadius: "calc(var(--radius) * 0.6)",
    paddingInline: "calc(var(--spacing) * 2)",
    paddingBlock: "calc(var(--spacing) * 1.5)",
    // A palette inside a dialog opens its rows out to match the panel.
    '[data-slot="dialog-content"] &': {
      borderRadius: "var(--radius) !important",
    },
    "[data-focused]": {
      backgroundColor: "var(--muted)",
      color: "var(--foreground)",
    },
    ":is(&[data-focused] > *):is(svg)": {
      color: "var(--foreground)",
    },
    // An item the search has ruled out is `hidden`, and `display: flex` above
    // would otherwise draw it anyway.
    "[hidden]": {
      display: "none",
    },
  },
);

const shortcut = ui({
  marginInlineStart: "auto",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  "--ui-tracking": "var(--tracking-widest)",
  letterSpacing: "var(--tracking-widest)",
  color: "var(--muted-foreground)",
  '[data-slot="command-item"][data-focused] &': {
    color: "var(--foreground)",
  },
});

const dialogContent = ui({
  overflow: "hidden",
  padding: "0px",
});

interface CommandValue<T> {
  state: ComboBoxState<T>;
  inputRef: ReturnType<typeof makeRef<HTMLInputElement>>;
  listRef: ReturnType<typeof makeRef<HTMLUListElement>>;
  inputProps: () => Record<string, unknown>;
  listBoxProps: () => Record<string, unknown>;
  /** What every option id is derived from, shared with the input. */
  baseId: () => string;
}

const CommandContext = createContext<CommandValue<unknown> | null>(null);

function use(): CommandValue<unknown> {
  const value = getContext(CommandContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a <Command>.");
  }
  return value;
}

/**
 * Which `<Command>` a part is inside: one given `items`, or one written out.
 *
 * `<CommandItem>` and `<CommandGroup>` serve both, and the nearest palette is
 * the one that decides, so one written inside the other still gets its own.
 */
const WrittenContext = createContext<boolean>(false);

function Mode(props: Incoming<{ isWritten: boolean; children?: Child }>) {
  return provide(
    WrittenContext,
    () => props.isWritten(),
    () => props.children as unknown,
  );
}

function isWritten(): boolean {
  return getContext(WrittenContext);
}

export interface CommandProps<T> extends Omit<UiProps, "children">, ItemAccessors<T> {
  /**
   * Everything the palette can run, before the typed text narrows it.
   *
   * Leave it out and the palette is WRITTEN: a `<CommandInput>` and a
   * `<CommandList>` of `<CommandItem>`s as children, which is shadcn's form.
   */
  items?: Iterable<T>;
  /** With `items`, how one entry renders. Without, the palette's parts. */
  children?: ((item: T) => Child) | Child;
  /** Names the input and the list of a written palette, visually hidden. */
  label?: string;
  /** For a written palette: how well an item matches, 0 hiding it. */
  filter?: CommandFilter;
  /** For a written palette: turn off to filter the items yourself. @default true */
  shouldFilter?: boolean;
  /** For a written palette: wrap from the last item to the first. @default false */
  loop?: boolean;
  /** For a written palette: leave the highlight to the keyboard. @default false */
  disablePointerSelection?: boolean;
  /** For a written palette: Ctrl+J/N and Ctrl+K/P move the highlight. @default true */
  vimBindings?: boolean;
  /** Rendered instead of the list when the text matches nothing. */
  empty?: Child;
  /**
   * The empty state's own slot.
   *
   * A combobox is a command in a popover, and a style names that command's
   * empty state after the combobox. Without this the rule would have to select
   * every `command-empty` on the page.
   */
  emptySlot?: string;
  /** The list's own slot, for the same reason. */
  listSlot?: string;
  placeholder?: string;
  /**
   * With `items`, the typed text. Written, the highlighted item's value, which
   * is what `cmdk` means by it; the text is `<CommandInput>`'s own `value`.
   */
  value?: string;
  defaultValue?: string;
  disabledKeys?: Iterable<Key>;
  /** @default a locale-aware `contains` */
  filterBy?: FilterFn;
  "aria-label"?: string;
  onAction?: (key: Key) => void;
  onValueChange?: (value: string) => void;
}

/**
 * ```tsx
 * <Command items={COMMANDS} placeholder="Type a command" onAction={run}>
 *   {(entry) => (
 *     <CommandItem>
 *       {entry.name}
 *       <CommandShortcut>{entry.keys}</CommandShortcut>
 *     </CommandItem>
 *   )}
 * </Command>
 * ```
 *
 * shadcn builds this on `cmdk`, which discovers its items by rendering them and
 * reading the DOM back. The items are DATA here, like every other collection in
 * this package, so the filter is a predicate over values rather than a walk of
 * rendered nodes.
 *
 * The input keeps the focus and the list is driven by `aria-activedescendant`,
 * which is what lets you type and arrow at the same time.
 *
 * Without `items` it is shadcn's own form, with `cmdk`'s ranking:
 *
 * ```tsx
 * <Command label="Commands">
 *   <CommandInput placeholder="Type a command or search..." />
 *   <CommandList>
 *     <CommandEmpty>No results found.</CommandEmpty>
 *     <CommandGroup heading="Settings">
 *       <CommandItem onSelect={openProfile}>Profile</CommandItem>
 *     </CommandGroup>
 *   </CommandList>
 * </Command>
 * ```
 */
export function Command<T>(props: Incoming<CommandProps<T>>) {
  if (props.items === undefined) {
    return (
      <WrittenCommand
        {...props}
        data-slot={props["data-slot"]?.() ?? "command"}
        class={ui(root, props.class?.(), props.className?.())}
      >
        <Mode isWritten>{props.children}</Mode>
      </WrittenCommand>
    );
  }

  const inputRef = makeRef<HTMLInputElement>();
  const listRef = makeRef<HTMLUListElement>();
  const options = fromProps(props as unknown as Incoming<Record<string, unknown>>);

  const state = comboBoxState<T>({
    ...(options as unknown as Record<string, never>),
    inputValue: () => props.value?.(),
    defaultInputValue: () => props.defaultValue?.() ?? "",
    // Always open and never closing: the list is part of the palette rather
    // than a popover it puts up, so there is no closed state to be in.
    isOpen: () => true,
    allowsEmptyCollection: () => true,
    menuTrigger: () => "focus",
    filterBy: props.filterBy?.(),
    onInputChange: (value) => props.onValueChange?.()?.(value),
    onSelectionChange: (key) => {
      if (key === null) return;
      props.onAction?.()?.(key);
      // A palette runs the thing and forgets it. Leaving the key selected would
      // make choosing it twice in a row do nothing the second time.
      state.setSelectedKey(null);
    },
  });

  const result = comboBox(
    { ...(options as unknown as Record<string, never>), inputRef, listBoxRef: listRef },
    state,
  );

  const value: CommandValue<unknown> = {
    state,
    inputRef,
    listRef,
    inputProps: () => result.inputProps,
    listBoxProps: () => result.listBoxProps,
    baseId: result.baseId,
  };

  const owner = getOwner();
  if (owner !== null) install(owner, CommandContext, () => value);

  const render = props.children as unknown as (item: T | null) => Child;
  // So a `<Section>` in that callback builds its own options with it, rather
  // than the caller passing the callback down by hand at every use.
  provideItemRender(render as unknown as (item: unknown) => Child);
  const isEmpty = (): boolean => [...state.collection()].length === 0;

  return (
    <div {...uiProps("command", root, props)}>
      <Mode isWritten={false}>
        <ItemsInput placeholder={props.placeholder?.()} />
        <Show
          when={isEmpty()}
          fallback={
            <ItemsList aria-label={props["aria-label"]?.()} listSlot={props.listSlot?.()}>
              <For each={() => [...state.collection()]}>
                {(node: Node<T>) => {
                  provideItemNode(node);
                  return render(node.value);
                }}
              </For>
            </ItemsList>
          }
        >
          <div data-slot={props.emptySlot?.() ?? "command-empty"} class={empty}>
            {props.empty?.() ?? "No results found."}
          </div>
        </Show>
      </Mode>
    </div>
  );
}

interface InputProps {
  placeholder?: string;
}

/** The search box of a palette given `items`, which renders it itself. */
function ItemsInput(props: Incoming<InputProps>) {
  const value = use();
  const elementProps = mergeProps(value.inputProps(), {
    "data-slot": "command-input",
    class: () => input,
    placeholder: () => props.placeholder?.(),
  });

  return (
    <div data-slot="command-input-wrapper" cmdk-input-wrapper="" class={inputWrapper}>
      <Search data-slot="command-input-icon" class={inputIcon} aria-hidden="true" />
      <input {...elementProps} ref={value.inputRef.set} />
    </div>
  );
}

export interface CommandInputProps extends UiProps {
  placeholder?: string;
  /** The search text, when you own it. */
  value?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onValueChange?: (search: string) => void;
}

/** The search box of a written palette. One given `items` renders its own. */
export function CommandInput(props: Incoming<CommandInputProps>) {
  return (
    <div data-slot="command-input-wrapper" cmdk-input-wrapper="" class={inputWrapper}>
      <Search data-slot="command-input-icon" class={inputIcon} aria-hidden="true" />
      <WrittenInput
        {...props}
        data-slot={props["data-slot"]?.() ?? "command-input"}
        class={ui(input, props.class?.(), props.className?.())}
      />
    </div>
  );
}

/** The listbox of a written palette, holding its groups and items. */
export function CommandList(props: Incoming<UiProps>) {
  return (
    <WrittenList
      {...props}
      data-slot={props["data-slot"]?.() ?? "command-list"}
      class={ui(list, props.class?.(), props.className?.())}
    >
      {props.children}
    </WrittenList>
  );
}

/** What a written palette shows while the search matches nothing. */
export function CommandEmpty(props: Incoming<UiProps>) {
  return (
    <WrittenEmpty
      {...props}
      data-slot={props["data-slot"]?.() ?? "command-empty"}
      class={ui(empty, props.class?.(), props.className?.())}
    >
      {props.children}
    </WrittenEmpty>
  );
}

export interface CommandLoadingProps extends UiProps {
  /** How far along, from 0 to 100. */
  progress?: number;
  /** @default "Loading..." */
  label?: string;
}

/** A row to show, by your own condition, while a written palette's items load. */
export function CommandLoading(props: Incoming<CommandLoadingProps>) {
  return (
    <WrittenLoading
      {...props}
      data-slot={props["data-slot"]?.() ?? "command-loading"}
      class={ui(empty, props.class?.(), props.className?.())}
    >
      {props.children}
    </WrittenLoading>
  );
}

interface ListProps {
  "aria-label"?: string;
  listSlot?: string;
  children?: Child;
}

/** The listbox of a palette given `items`, which renders it itself. */
function ItemsList(props: Incoming<ListProps>) {
  const value = use();
  const options = value.listBoxProps();

  const { listBoxProps } = listBox(
    { ...(options as unknown as Record<string, never>), ref: value.listRef },
    value.state,
  );

  const elementProps = mergeProps(listBoxProps, {
    id: options["id"],
    "aria-labelledby": options["aria-labelledby"],
    "aria-label": () => props["aria-label"]?.(),
    "data-slot": props.listSlot?.() ?? "command-list",
    class: () => list,
  });

  const held: ListBoxContextValue = {
    state: value.state,
    // `comboBox`'s own, not the id off `listBoxProps`: that one is an ACCESSOR,
    // and stringifying it named every option `() => current()-option-new` while
    // the input pointed `aria-activedescendant` at the real one.
    baseId: value.baseId,
    shouldSelectOnPressUp: () => true,
    shouldUseVirtualFocus: () => true,
  };

  return (
    <ListBoxProvider value={held}>
      <ul {...elementProps} ref={value.listRef.set}>
        {props.children}
      </ul>
    </ListBoxProvider>
  );
}

export interface CommandGroupProps extends UiProps {
  /** Names the group to a reader and draws the heading. */
  heading?: string;
  /** In a written palette: draw the group whatever the search says. */
  forceMount?: boolean;
}

/**
 * A named run of entries.
 *
 * A collection item with `children` is a SECTION, so this is what a spec's
 * grouped entries render into: an `<li role="presentation">` holding a heading
 * and a `role="group"` of its own options.
 */
export function CommandGroup(props: Incoming<CommandGroupProps>) {
  if (isWritten()) {
    return (
      <WrittenGroup
        {...props}
        headingSlot="command-group-label"
        data-slot={props["data-slot"]?.() ?? "command-group"}
        class={ui(group, props.class?.(), props.className?.())}
      >
        {props.children}
      </WrittenGroup>
    );
  }

  const { itemProps, headingProps, groupProps } = listBoxSection({
    heading: () => props.heading?.(),
    "aria-label": () => props["aria-label"]?.(),
  });

  return (
    <li {...itemProps}>
      <Show when={props.heading?.() !== undefined}>
        <div {...headingProps} data-slot="command-group-label">
          {props.heading}
        </div>
      </Show>
      <ul
        {...groupProps}
        data-slot={props["data-slot"]?.() ?? "command-group"}
        class={ui(group, props.class?.(), props.className?.())}
      >
        {props.children}
      </ul>
    </li>
  );
}

export interface CommandItemProps extends UiProps {
  isDisabled?: boolean;
  /** shadcn's name for `isDisabled`. */
  disabled?: boolean;
  /**
   * In a written palette, what the item is searched and reported by.
   * @default its own text
   */
  value?: string;
  /** In a written palette, more words to find it by, which are not shown. */
  keywords?: string[];
  /** In a written palette: draw it whether or not it matches. */
  forceMount?: boolean;
  /**
   * In a written palette, what choosing the item does. One given `items`
   * reports the key to the palette's own `onAction` instead.
   */
  onSelect?: (value: string) => void;
}

export function CommandItem(props: Incoming<CommandItemProps>) {
  const isDisabled = (): boolean | undefined => props.isDisabled?.() ?? props.disabled?.();

  if (isWritten()) {
    return (
      <WrittenItem
        {...props}
        disabled={isDisabled()}
        data-slot={props["data-slot"]?.() ?? "command-item"}
        class={ui(item, props.class?.(), props.className?.())}
      >
        {props.children}
      </WrittenItem>
    );
  }

  return (
    <Option
      {...props}
      isDisabled={isDisabled()}
      data-slot={props["data-slot"]?.() ?? "command-item"}
      class={ui(item, props.class?.(), props.className?.())}
    >
      {props.children}
    </Option>
  );
}

export function CommandShortcut(props: Incoming<UiProps>) {
  return <span {...uiProps("command-shortcut", shortcut, props)}>{props.children}</span>;
}

export interface CommandSeparatorProps extends UiProps {
  /** In a written palette: stay through a search, where it divides nothing. */
  alwaysRender?: boolean;
}

export function CommandSeparator(props: Incoming<CommandSeparatorProps>) {
  if (isWritten()) {
    return (
      <WrittenSeparator
        {...props}
        data-slot={props["data-slot"]?.() ?? "command-separator"}
        class={ui(separator, props.class?.(), props.className?.())}
      />
    );
  }
  return <hr {...uiProps("command-separator", separator, props)} />;
}

export interface CommandDialogProps<T> extends CommandProps<T> {
  isOpen?: boolean;
  /** shadcn's name for `isOpen`. */
  open?: boolean;
  defaultOpen?: boolean;
  /** Named to a screen reader, drawn nowhere. @default "Command palette" */
  title?: string;
  description?: string;
  /** The ✕ in the dialog's corner. @default false */
  showCloseButton?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/** What `<CommandDialog>` reads itself, and so does not hand to the palette. */
const DIALOG_PROPS = [
  "isOpen",
  "open",
  "defaultOpen",
  "title",
  "description",
  "showCloseButton",
  "onOpenChange",
  "class",
  "className",
];

/**
 * The palette, in a dialog.
 *
 * ```tsx
 * <CommandDialog isOpen={open()} onOpenChange={setOpen} title="Search">
 *   <CommandInput placeholder="Type a command or search..." />
 *   <CommandList>
 *     <CommandItem onSelect={openProfile}>Profile</CommandItem>
 *   </CommandList>
 * </CommandDialog>
 * ```
 *
 * The title and description are real and screen-reader only, because a dialog
 * with no accessible name is a dialog a screen reader announces as nothing.
 * `class` styles the dialog's content, as upstream's does; everything else is
 * the palette's own.
 */
export function CommandDialog<T>(props: Incoming<CommandDialogProps<T>>) {
  return (
    <Dialog
      isOpen={props.isOpen?.() ?? props.open?.()}
      defaultOpen={props.defaultOpen?.()}
      onOpenChange={props.onOpenChange?.()}
    >
      <DialogContent
        class={ui(dialogContent, props.class?.(), props.className?.())}
        showCloseButton={props.showCloseButton?.() === true}
      >
        <DialogHeader class={srOnly}>
          <DialogTitle>{props.title?.() ?? "Command palette"}</DialogTitle>
          <DialogDescription>
            {props.description?.() ?? "Search for a command to run."}
          </DialogDescription>
        </DialogHeader>
        <Command {...omit(props, DIALOG_PROPS)} />
      </DialogContent>
    </Dialog>
  );
}
