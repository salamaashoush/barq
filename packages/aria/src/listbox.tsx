/**
 * A listbox: a set of options, one Tab stop, arrow keys inside.
 *
 * Everything that makes it a listbox rather than a styled list is in
 * `selection.ts`; what is here is the roles and the relationships. Two are
 * easy to get wrong:
 *
 * - The options must be the listbox's OWN children in the accessibility tree.
 *   A wrapper `<div>` between them without `role="presentation"` breaks the
 *   parent/child relationship, and a screen reader stops reporting "2 of 7".
 * - A section is a `role="group"` with `aria-labelledby` pointing at its own
 *   heading; the heading itself must not be an option, or it becomes a
 *   selectable item that does nothing.
 */

import { type Accessor, type Child, For, getOwner, type Incoming, install } from "@barqjs/core";
import { context, getContext, provide } from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import type {
  ItemAccessors,
  Key,
  LayoutDelegate,
  ListStateOptions,
  Node,
  SelectionMode,
} from "./collections.ts";
import { listState, type ListState } from "./collections.ts";
import { focusRing } from "./focus.ts";
import { hover } from "./interactions/hover.ts";
import type { ElementRef } from "./interactions/press.ts";
import { field, type FieldOptions } from "./label.ts";
import { selectableItem, selectableList, type LinkBehavior } from "./selection.ts";
import {
  contentStyle,
  measureRow,
  rowStyle,
  useVirtualizer,
  type LayoutInfo,
} from "./virtualizer.tsx";
import {
  access,
  filterDOMProps,
  fromProps,
  id,
  mergeProps,
  styleProps,
  type DOMProps,
  type MaybeAccessor,
  type StyleProps,
} from "./utils.ts";

export interface ListBoxOptions extends FieldOptions {
  ref: ElementRef;
  /** @default false */
  shouldFocusWrap?: MaybeAccessor<boolean | undefined>;
  /** @default "vertical" */
  orientation?: MaybeAccessor<"horizontal" | "vertical" | undefined>;
  autoFocus?: MaybeAccessor<boolean | "first" | "last" | undefined>;
  /** Track focus with `aria-activedescendant`, for a combobox. */
  shouldUseVirtualFocus?: MaybeAccessor<boolean | undefined>;
  /** Select on pointer up. A menu-like listbox wants this. */
  shouldSelectOnPressUp?: MaybeAccessor<boolean | undefined>;
  disallowEmptySelection?: MaybeAccessor<boolean | undefined>;
  disallowTypeAhead?: MaybeAccessor<boolean | undefined>;
  linkBehavior?: MaybeAccessor<LinkBehavior | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  /** Only a WINDOW of the collection is rendered. See `virtualizer.tsx`. */
  isVirtualized?: MaybeAccessor<boolean | undefined>;
  /** Where the rows are, when the DOM cannot answer because they are not in it. */
  layoutDelegate?: LayoutDelegate;
  /** Where the option ids come from. Shared with whatever names one. */
  baseId?: MaybeAccessor<string | undefined>;
}

export interface ListBoxResult {
  listBoxProps: DOMProps;
  labelProps: DOMProps;
  descriptionProps: DOMProps;
  errorMessageProps: DOMProps;
  /** The base every option id in this listbox is derived from. */
  baseId: Accessor<string>;
}

export function listBox(options: ListBoxOptions, state: ListState<unknown>): ListBoxResult {
  const baseId = id(options.baseId);
  const { labelProps, fieldProps, descriptionProps, errorMessageProps } = field({
    ...options,
    // A listbox is not a labelable element.
    labelElementType: "span",
  });

  const { listProps } = selectableList({
    ...options,
    selectionManager: state.selectionManager,
    collection: state.collection,
    disabledKeys: state.disabledKeys,
  });

  return {
    baseId,
    labelProps,
    descriptionProps,
    errorMessageProps,
    listBoxProps: mergeProps(filterDOMProps(options, { labelable: true }), listProps, fieldProps, {
      role: "listbox",
      "aria-multiselectable": () =>
        state.selectionManager().selectionMode === "multiple" ? true : undefined,
      "aria-disabled": () => access(options.isDisabled) === true || undefined,
      "aria-orientation": () =>
        access(options.orientation) === "horizontal" ? "horizontal" : undefined,
      // Under virtual focus the listbox never has DOM focus, so the item that
      // does is named here instead.
      "aria-activedescendant": () => {
        if (access(options.shouldUseVirtualFocus) !== true) return undefined;
        const focused = state.selectionManager().focusedKey;
        return focused === null ? undefined : optionIdFor(baseId(), focused);
      },
    }),
  };
}

/**
 * The id an option renders under.
 *
 * `aria-activedescendant` — on the listbox, or on a combobox's input — has to
 * name the option before it exists, so the id is DERIVED from the key rather
 * than generated per element. It is derived from the listbox's own id as well,
 * because two listboxes on one page offering the same key would otherwise
 * write the same id twice.
 */
export function optionIdFor(baseId: string, key: Key): string {
  return `${baseId}-option-${String(key)}`;
}

export interface OptionOptions {
  key: Key;
  ref: ElementRef;
  /** The listbox's own id, which the option's is derived from. */
  baseId: MaybeAccessor<string>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  shouldSelectOnPressUp?: MaybeAccessor<boolean | undefined>;
  shouldUseVirtualFocus?: MaybeAccessor<boolean | undefined>;
  isVirtualized?: MaybeAccessor<boolean | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  onAction?: () => void;
}

export interface OptionResult {
  optionProps: DOMProps;
  labelProps: DOMProps;
  descriptionProps: DOMProps;
  isSelected: Accessor<boolean>;
  isFocused: Accessor<boolean>;
  isPressed: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
  allowsSelection: Accessor<boolean>;
}

export function option(options: OptionOptions, state: ListState<unknown>): OptionResult {
  const labelId = id();
  const descriptionId = id();

  const item = selectableItem({
    ...options,
    id: () => optionIdFor(access(options.baseId), options.key),
    selectionManager: state.selectionManager,
  });

  const node = (): Node<unknown> | null => state.collection().getItem(options.key);

  return {
    isSelected: item.isSelected,
    isFocused: item.isFocused,
    isPressed: item.isPressed,
    isDisabled: item.isDisabled,
    allowsSelection: item.allowsSelection,
    labelProps: { id: labelId },
    descriptionProps: { id: descriptionId },
    optionProps: mergeProps(item.itemProps, {
      role: "option",
      // `aria-selected` only where selection is possible: on a listbox that
      // only performs actions, the attribute would say every item is
      // unselected rather than that selection is not the point.
      "aria-selected": () =>
        state.selectionManager().selectionMode !== "none" ? item.isSelected() : undefined,
      "aria-disabled": () => item.isDisabled() || undefined,
      "aria-label": () => access(options["aria-label"]) ?? node()?.["aria-label"],
      // A virtualised list renders a window, so the position has to be stated.
      "aria-posinset": () =>
        access(options.isVirtualized) === true ? (node()?.index ?? 0) + 1 : undefined,
      "aria-setsize": () =>
        access(options.isVirtualized) === true ? state.collection().size : undefined,
    }),
  };
}

export interface ListBoxSectionOptions {
  heading?: MaybeAccessor<unknown>;
  "aria-label"?: MaybeAccessor<string | undefined>;
}

export function listBoxSection(options: ListBoxSectionOptions): {
  itemProps: DOMProps;
  headingProps: DOMProps;
  groupProps: DOMProps;
} {
  const headingId = id();
  const hasHeading = (): boolean => {
    const heading = access(options.heading);
    return heading !== undefined && heading !== null && heading !== "";
  };

  return {
    // The `<li>` wrapping the section is not itself an option.
    itemProps: { role: "presentation" },
    headingProps: {
      id: () => (hasHeading() ? headingId() : undefined),
      // The heading is not a child of the group; it names it.
      "aria-hidden": true,
    },
    groupProps: {
      role: "group",
      "aria-label": () => access(options["aria-label"]),
      "aria-labelledby": () => (hasHeading() ? headingId() : undefined),
    },
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export interface ListBoxContextValue {
  state: ListState<unknown>;
  baseId: Accessor<string>;
  shouldSelectOnPressUp: Accessor<boolean | undefined>;
  shouldUseVirtualFocus: Accessor<boolean | undefined>;
}

const ListBoxContext = context<ListBoxContextValue | null>(null);
const ItemNodeContext = context<Node<unknown> | null>(null);

/**
 * Make `<Option>` usable inside something that is not a `<ListBox>`.
 *
 * A select and a combobox both END in a list of options, and each owns the
 * collection for its own reasons — a select closes on choosing, a combobox
 * filters. Rather than three near-identical option components, they lend
 * `<Option>` the state it reads.
 *
 * A component, not a function taking a callback: the children have to be a
 * BLOCK for the binding to reach them. JSX written inside an ordinary arrow
 * carries the enclosing component's scope, which is outside the one the
 * binding was installed on, so every `<Option>` would look past it.
 */
export function ListBoxProvider(props: Incoming<{ value: ListBoxContextValue; children?: Child }>) {
  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;
  return provide(
    owner,
    ListBoxContext,
    () => props.value(),
    () => props.children as unknown,
  ) as never;
}

/** The collection node the row being built is for. */
export function provideItemNode(node: Node<unknown>): void {
  const owner = getOwner();
  if (owner !== null) install(owner, ItemNodeContext, () => node);
}

export function useListBox(): ListBoxContextValue {
  const value = getContext(ListBoxContext);
  if (value === null || value === undefined) {
    throw new Error("An Option must be rendered inside a ListBox.");
  }
  return value;
}

/** The collection node the enclosing row is for. */
export function useItemNode(): Node<unknown> {
  const node = getContext(ItemNodeContext);
  if (node === null || node === undefined) {
    throw new Error("An Option must be rendered inside its ListBox's item callback.");
  }
  return node;
}

export interface ListBoxComponentProps<T> extends StyleProps, ItemAccessors<T> {
  /** The values to render, in order. */
  items: Iterable<T>;
  /** How one value renders. Return an `<Option>`. */
  children: (item: T) => Child;
  label?: Child;
  description?: Child;
  errorMessage?: Child;
  /** @default "none" */
  selectionMode?: SelectionMode;
  selectedKeys?: "all" | Iterable<Key>;
  defaultSelectedKeys?: "all" | Iterable<Key>;
  disabledKeys?: Iterable<Key>;
  disallowEmptySelection?: boolean;
  shouldFocusWrap?: boolean;
  orientation?: "horizontal" | "vertical";
  autoFocus?: boolean | "first" | "last";
  isDisabled?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  ref?: RefTarget<HTMLUListElement>;
  onSelectionChange?: (keys: "all" | Set<Key>) => void;
  onAction?: (key: Key) => void;
}

/**
 * ```tsx
 * <ListBox
 *   label="Fruit"
 *   items={fruits()}
 *   selectionMode="multiple"
 *   onSelectionChange={(keys) => picked.set(keys)}
 * >
 *   {(fruit) => <Option>{fruit.name}</Option>}
 * </ListBox>
 * ```
 *
 * The items are DATA. A component whose children are lazy and whose body runs
 * once has no reason to render the options twice — once to discover them and
 * once to show them — so the collection is derived from the values directly.
 */
export function ListBox<T>(props: Incoming<ListBoxComponentProps<T>>) {
  const domRef = makeRef<HTMLUListElement>();
  const options = fromProps(props as unknown as Incoming<Record<string, unknown>>);

  const state = listState<T>({
    ...(options as ListStateOptions<T>),
    onSelectionChange: (keys) => props.onSelectionChange?.()?.(keys),
  });

  // Inside a `<Virtualizer>` the list renders a WINDOW of its collection, and
  // the layout — not the DOM — answers what is above, below and a page away.
  const virtual = useVirtualizer();
  virtual?.attach(state.collection, domRef, () => state.selectionManager().focusedKey);

  const { listBoxProps, labelProps, descriptionProps, errorMessageProps, baseId } = listBox(
    {
      ...(options as unknown as ListBoxOptions),
      ref: domRef,
      isVirtualized: () => virtual !== null,
      layoutDelegate: virtual?.layout,
    },
    state,
  );

  const owner = getOwner();
  if (owner !== null) {
    const value: ListBoxContextValue = {
      state: state,
      baseId,
      shouldSelectOnPressUp: () => undefined,
      shouldUseVirtualFocus: () => undefined,
    };
    install(owner, ListBoxContext, () => value);
  }

  const elementProps = mergeProps(listBoxProps, styleProps(props), {
    "data-testid": () => props["data-testid"]?.(),
    "data-empty": () => state.collection().size === 0,
    "data-virtualized": () => virtual !== null,
    style: () => (virtual === null ? props.style?.() : contentStyle(virtual.contentSize())),
  });

  const render = props.children as unknown as (scope: unknown, item: T) => Child;

  /** The whole collection, or the window of it the virtualiser says is on screen. */
  const rows = (): Node<T>[] => {
    if (virtual === null) return [...state.collection()];
    const collection = state.collection();
    return virtual
      .visible()
      .map((info: LayoutInfo) => collection.getItem(info.key))
      .filter((node: Node<T> | null): node is Node<T> => node !== null);
  };

  return (
    <>
      <span {...labelProps}>{props.label}</span>
      <ul {...elementProps} ref={mergeRefs(domRef.set, props.ref?.())}>
        <For each={rows}>
          {(node: Node<T>) => {
            provideItemNode(node);
            return render(getOwner(), node.value as T);
          }}
        </For>
      </ul>
      <span {...descriptionProps}>{props.description}</span>
      <span {...errorMessageProps}>{props.errorMessage}</span>
    </>
  );
}

export interface OptionComponentProps extends StyleProps {
  children?: Child;
  "aria-label"?: string;
  ref?: RefTarget<HTMLLIElement>;
}

/**
 * One option. Its key, value and disabled state come from the collection node
 * the enclosing {@link ListBox} is rendering, so nothing is repeated here.
 */
export function Option(props: Incoming<OptionComponentProps>) {
  const domRef = makeRef<HTMLLIElement>();
  const list = useListBox();
  const node = useItemNode();
  const virtual = useVirtualizer();

  measureRow(virtual, node.key, domRef);

  const { optionProps, isSelected, isFocused, isPressed, isDisabled } = option(
    {
      key: node.key,
      ref: domRef,
      baseId: list.baseId,
      "aria-label": () => props["aria-label"]?.(),
      isDisabled: () => node.props?.isDisabled === true,
      shouldSelectOnPressUp: list.shouldSelectOnPressUp,
      shouldUseVirtualFocus: list.shouldUseVirtualFocus,
      isVirtualized: () => virtual !== null,
    },
    list.state,
  );

  const { hoverProps, isHovered } = hover({ isDisabled });
  const { focusProps, isFocusVisible } = focusRing();

  const elementProps = mergeProps(optionProps, hoverProps, focusProps, styleProps(props), {
    "data-selected": isSelected,
    "data-focused": isFocused,
    "data-focus-visible": isFocusVisible,
    "data-pressed": isPressed,
    "data-hovered": isHovered,
    "data-disabled": isDisabled,
    "data-testid": () => props["data-testid"]?.(),
    // Positioned by the LAYOUT: the rows above it are not rendered, so
    // document flow has nothing to place it against.
    style: () => {
      if (virtual === null) return props.style?.();
      const info = virtual.layout.getLayoutInfo(node.key);
      return info === null ? props.style?.() : rowStyle(info);
    },
  });

  return (
    <li {...elementProps} ref={mergeRefs(domRef.set, props.ref?.())}>
      {props.children}
    </li>
  );
}
