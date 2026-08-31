import { comboBox, comboBoxState, type ComboBoxState, type FilterFn } from "@barqjs/aria/combobox";
import { layer } from "@barqjs/css";
import {
  listBox,
  listBoxSection,
  ListBoxProvider,
  Option,
  provideItemNode,
  type ListBoxContextValue,
} from "@barqjs/aria/listbox";
import type { ItemAccessors, Key, Node } from "@barqjs/aria/collections";
import { fromProps, mergeProps } from "@barqjs/aria/utils";
import {
  context,
  For,
  getContext,
  getOwner,
  install,
  Show,
  type Child,
  type Incoming,
} from "@barqjs/core";

import { Search } from "@barqjs/lucide/icons/search";
import { ref as makeRef } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import { shared } from "../lib/shared.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./dialog.tsx";
import { srOnly } from "./sr-only.ts";

const ui = layer("barq.ui");

const root = ui({
  display: "flex",
  height: "100%",
  width: "100%",
  flexDirection: "column",
  overflow: "hidden",
  borderRadius: "calc(var(--radius) - 2px)",
  backgroundColor: "var(--popover)",
  color: "var(--popover-foreground)",
});

const inputWrapper = ui({
  display: "flex",
  height: "calc(var(--spacing) * 9)",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
  borderBottomStyle: "var(--ui-border-style)",
  borderBottomWidth: "1px",
  paddingInline: "calc(var(--spacing) * 3)",
});

const inputIcon = ui({
  width: "calc(var(--spacing) * 4)",
  height: "calc(var(--spacing) * 4)",
  flexShrink: "0",
  opacity: "50%",
});

const input = ui(shared.textSm, shared.outlineNone, shared.forcedColors, {
  display: "flex",
  height: "calc(var(--spacing) * 10)",
  width: "100%",
  borderRadius: "calc(var(--radius) - 2px)",
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

const list = ui({
  margin: "0px",
  maxHeight: "300px",
  scrollPaddingBlock: "var(--spacing)",
  listStyleType: "none",
  overflowX: "hidden",
  overflowY: "auto",
  padding: "0px",
});

const empty = ui(shared.textSm, {
  paddingBlock: "calc(var(--spacing) * 6)",
  textAlign: "center",
});

const group = ui({
  margin: "0px",
  listStyleType: "none",
  overflow: "hidden",
  padding: "var(--spacing)",
  color: "var(--foreground)",
});

const groupLabel = ui(shared.fontMedium, {
  paddingInline: "calc(var(--spacing) * 2)",
  paddingBlock: "calc(var(--spacing) * 1.5)",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  color: "var(--muted-foreground)",
});

const separator = ui({
  marginInline: "calc(var(--spacing) * -1)",
  height: "1px",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "0px",
  backgroundColor: "var(--border)",
});

const item = ui(
  shared.textSm,
  shared.outlineNone,
  shared.noSelect,
  shared.forcedColors,
  shared.focused,
  shared.disabled,
  shared.svgStatic,
  shared.svgSize,
  shared.svgMuted,
  {
    position: "relative",
    display: "flex",
    cursor: "default",
    alignItems: "center",
    gap: "calc(var(--spacing) * 2)",
    borderRadius: "calc(var(--radius) - 4px)",
    paddingInline: "calc(var(--spacing) * 2)",
    paddingBlock: "calc(var(--spacing) * 1.5)",
  },
);

const shortcut = ui({
  marginLeft: "auto",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  "--ui-tracking": "var(--tracking-widest)",
  letterSpacing: "var(--tracking-widest)",
  color: "var(--muted-foreground)",
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

const CommandContext = context<CommandValue<unknown> | null>(null);

function use(): CommandValue<unknown> {
  const value = getContext(CommandContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a <Command>.");
  }
  return value;
}

export interface CommandProps<T> extends UiProps, ItemAccessors<T> {
  /** Everything the palette can run, before the typed text narrows it. */
  items: Iterable<T>;
  /** How one entry renders. Return a `<CommandItem>`. */
  children: (item: T) => Child;
  /** Rendered instead of the list when the text matches nothing. */
  empty?: Child;
  placeholder?: string;
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
 */
export function Command<T>(props: Incoming<CommandProps<T>>) {
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

  const render = props.children as unknown as (scope: unknown, item: T | null) => Child;
  const isEmpty = (): boolean => [...state.collection()].length === 0;

  return (
    <div {...uiProps("command", root, props)}>
      <CommandInput placeholder={props.placeholder?.()} />
      <Show
        when={isEmpty()}
        fallback={
          <CommandList aria-label={props["aria-label"]?.()}>
            <For each={() => [...state.collection()]}>
              {(node: Node<T>) => {
                provideItemNode(node);
                return render(getOwner(), node.value);
              }}
            </For>
          </CommandList>
        }
      >
        <div data-slot="command-empty" class={empty}>
          {props.empty?.() ?? "No results found."}
        </div>
      </Show>
    </div>
  );
}

interface InputProps {
  placeholder?: string;
}

/** The search box. Rendered by `<Command>`; it is not placed by hand. */
function CommandInput(props: Incoming<InputProps>) {
  const value = use();
  const elementProps = mergeProps(value.inputProps(), {
    "data-slot": "command-input",
    class: () => input,
    placeholder: () => props.placeholder?.(),
  });

  return (
    <div data-slot="command-input-wrapper" class={inputWrapper}>
      <Search data-slot="command-input-icon" class={inputIcon} aria-hidden="true" />
      <input {...elementProps} ref={value.inputRef.set} />
    </div>
  );
}

interface ListProps {
  "aria-label"?: string;
  children?: Child;
}

/** The listbox. Rendered by `<Command>`; it is not placed by hand. */
function CommandList(props: Incoming<ListProps>) {
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
    "data-slot": "command-list",
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
}

/**
 * A named run of entries.
 *
 * A collection item with `children` is a SECTION, so this is what a spec's
 * grouped entries render into: an `<li role="presentation">` holding a heading
 * and a `role="group"` of its own options.
 */
export function CommandGroup(props: Incoming<CommandGroupProps>) {
  const { itemProps, headingProps, groupProps } = listBoxSection({
    heading: () => props.heading?.(),
    "aria-label": () => props["aria-label"]?.(),
  });

  return (
    <li {...itemProps}>
      <Show when={props.heading?.() !== undefined}>
        <div {...headingProps} data-slot="command-group-label" class={groupLabel}>
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
}

export function CommandItem(props: Incoming<CommandItemProps>) {
  return (
    <Option
      {...props}
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

export function CommandSeparator(props: Incoming<UiProps>) {
  return <hr {...uiProps("command-separator", separator, props)} />;
}

export interface CommandDialogProps<T> extends CommandProps<T> {
  isOpen?: boolean;
  defaultOpen?: boolean;
  /** Named to a screen reader, drawn nowhere. @default "Command palette" */
  title?: string;
  description?: string;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * The palette, in a dialog.
 *
 * The title and description are real and screen-reader only, because a dialog
 * with no accessible name is a dialog a screen reader announces as nothing.
 */
export function CommandDialog<T>(props: Incoming<CommandDialogProps<T>>) {
  return (
    <Dialog
      isOpen={props.isOpen?.()}
      defaultOpen={props.defaultOpen?.()}
      onOpenChange={props.onOpenChange?.()}
    >
      <DialogContent class={dialogContent} showCloseButton={false}>
        <DialogHeader class={srOnly}>
          <DialogTitle>{props.title?.() ?? "Command palette"}</DialogTitle>
          <DialogDescription>
            {props.description?.() ?? "Search for a command to run."}
          </DialogDescription>
        </DialogHeader>
        <Command {...props} />
      </DialogContent>
    </Dialog>
  );
}
