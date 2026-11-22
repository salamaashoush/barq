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

import {
  cells,
  type Accessor,
  type Child,
  createMemo,
  createSignal,
  For,
  getOwner,
  type Incoming,
  install,
  onCleanup,
  Show,
} from "@barqjs/core";
import { createContext, getContext, provide } from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { useAutocompleteCollection } from "./autocomplete.tsx";
import type {
  Collection,
  DisabledBehavior,
  ItemAccessors,
  Key,
  LayoutDelegate,
  ListStateOptions,
  Node,
  SelectionBehavior,
  SelectionMode,
} from "./collections.ts";
import { getItemCount, listState, type ListState } from "./collections.ts";
import {
  type CollectionDragAndDrop,
  collectionDragAndDrop,
  type DragAndDropHooks,
  type DropIndicatorProps,
  provideDropIndicator,
  useDragAndDropContext,
} from "./drag-and-drop.tsx";
import { afterDropIndicatorTargets, type ItemDropTarget } from "./dnd/index.ts";
import { focusRing } from "./focus.ts";
import { collator, useLocale } from "./i18n.ts";
import { focused, focusWithin } from "./interactions/focus-events.ts";
import { hover, type HoverEvent } from "./interactions/hover.ts";
import { type BaseEvent, keyboard } from "./interactions/keyboard.ts";
import { focusVisible, isFocusVisible as focusIsVisible } from "./interactions/modality.ts";
import type { ElementRef, PressEvent } from "./interactions/press.ts";
import { field, type FieldOptions } from "./label.ts";
import { SelectionIndicatorProvider } from "./selection-indicator.tsx";
import {
  type KeyboardDelegate,
  ListKeyboardDelegate,
  selectableItem,
  selectableList,
  type LinkBehavior,
} from "./selection.ts";
import { SharedElementTransition } from "./shared-element-transition.tsx";
import {
  provideStaticSection,
  staticAccessors,
  staticCollection,
  staticItem,
  type StaticCollection,
} from "./static-collection.ts";
import {
  contentStyle,
  measureRow,
  rowStyle,
  useVirtualizer,
  type LayoutInfo,
} from "./virtualizer.tsx";
import {
  access,
  callback,
  type DOMProps,
  filterDOMProps,
  fromProps,
  id,
  type MaybeAccessor,
  mergeIds,
  mergeProps,
  type StyleProps,
  styleProps,
} from "./utils.ts";

export interface ListBoxOptions extends FieldOptions {
  ref: ElementRef;
  /** @default false */
  shouldFocusWrap?: MaybeAccessor<boolean | undefined>;
  /** @default "vertical" */
  orientation?: MaybeAccessor<"horizontal" | "vertical" | undefined>;
  /** Whether the options are a stack or a grid the arrows move across. @default "stack" */
  layout?: MaybeAccessor<"stack" | "grid" | undefined>;
  autoFocus?: MaybeAccessor<boolean | "first" | "last" | undefined>;
  /** Track focus with `aria-activedescendant`, for a combobox. */
  shouldUseVirtualFocus?: MaybeAccessor<boolean | undefined>;
  /** Select on pointer up. A menu-like listbox wants this. */
  shouldSelectOnPressUp?: MaybeAccessor<boolean | undefined>;
  /** Move focus to an option the pointer moves over. */
  shouldFocusOnHover?: MaybeAccessor<boolean | undefined>;
  /**
   * The selection behaviour the list was given, which decides how a link
   * behaves. Read from the option rather than the state, which a long press
   * changes. @default "toggle"
   */
  selectionBehavior?: MaybeAccessor<SelectionBehavior | undefined>;
  disallowEmptySelection?: MaybeAccessor<boolean | undefined>;
  disallowTypeAhead?: MaybeAccessor<boolean | undefined>;
  /** @default "action" under replace selection, "override" under toggle */
  linkBehavior?: MaybeAccessor<LinkBehavior | undefined>;
  /** @default "clearSelection" */
  escapeKeyBehavior?: MaybeAccessor<"clearSelection" | "none" | undefined>;
  keyboardDelegate?: KeyboardDelegate;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  /** Only a WINDOW of the collection is rendered. See `virtualizer.tsx`. */
  isVirtualized?: MaybeAccessor<boolean | undefined>;
  /** Where the rows are, when the DOM cannot answer because they are not in it. */
  layoutDelegate?: LayoutDelegate;
  /** Where the option ids come from. Shared with whatever names one. */
  baseId?: MaybeAccessor<string | undefined>;
  /** Called when an option is acted on, with its key. */
  onAction?: (key: Key) => void;
  /** Whether `onAction` does anything. @default `onAction !== undefined` */
  hasAction?: MaybeAccessor<boolean | undefined>;
  /** Focus entering the list from outside it. */
  onFocus?: (event: FocusEvent) => void;
  /** Focus leaving the list altogether. */
  onBlur?: (event: FocusEvent) => void;
  onFocusChange?: (isFocused: boolean) => void;
}

export interface ListBoxResult {
  listBoxProps: DOMProps;
  labelProps: DOMProps;
  descriptionProps: DOMProps;
  errorMessageProps: DOMProps;
  /** The base every option id in this listbox is derived from. */
  baseId: Accessor<string>;
}

/** What a list tells its options, whichever component renders them. */
interface ListData {
  hasAction: Accessor<boolean>;
  onAction: (key: Key) => void;
  linkBehavior: Accessor<LinkBehavior>;
  shouldSelectOnPressUp: Accessor<boolean | undefined>;
  shouldFocusOnHover: Accessor<boolean | undefined>;
  shouldUseVirtualFocus: Accessor<boolean | undefined>;
  isVirtualized: Accessor<boolean | undefined>;
  focusVisible: Accessor<boolean>;
}

/**
 * Keyed by the state rather than handed through context, so an option built
 * by a select or a combobox, which supply their own context, still hears what
 * the list it is in was told.
 */
const listData = new WeakMap<ListState<unknown>, ListData>();

export function listBox(options: ListBoxOptions, state: ListState<unknown>): ListBoxResult {
  const baseId = id(options.baseId);
  const locale = useLocale();
  const { labelProps, fieldProps, descriptionProps, errorMessageProps } = field({
    ...options,
    // A listbox is not a labelable element.
    labelElementType: "span",
  });

  // Nothing inside a listbox can select a link under toggle selection, since
  // checkboxes are not allowed in one, so there a link always overrides.
  const linkBehavior = (): LinkBehavior => {
    const behavior = access(options.selectionBehavior) ?? "toggle";
    const given = access(options.linkBehavior) ?? (behavior === "replace" ? "action" : "override");
    return behavior === "toggle" && given === "action" ? "override" : given;
  };

  const search = collator({ usage: "search", sensitivity: "base" });
  const keyboardDelegate =
    options.keyboardDelegate ??
    new ListKeyboardDelegate({
      collection: state.collection,
      ref: options.ref,
      disabledKeys: state.disabledKeys,
      disabledBehavior: () => state.selectionManager().disabledBehavior,
      collator: search,
      layout: access(options.layout) === "grid" ? "grid" : "stack",
      orientation: options.orientation,
      direction: () => locale().direction,
      layoutDelegate: options.layoutDelegate,
    });

  const { listProps } = selectableList({
    ...options,
    keyboardDelegate,
    selectionManager: state.selectionManager,
    collection: state.collection,
    disabledKeys: state.disabledKeys,
    linkBehavior,
  });

  const { focusWithinProps } = focusWithin({
    onFocusWithin: options.onFocus,
    onBlurWithin: options.onBlur,
    onFocusWithinChange: options.onFocusChange,
  });

  listData.set(state, {
    hasAction: () => access(options.hasAction) ?? options.onAction !== undefined,
    onAction: (key) => options.onAction?.(key),
    linkBehavior,
    shouldSelectOnPressUp: () => access(options.shouldSelectOnPressUp),
    shouldFocusOnHover: () => access(options.shouldFocusOnHover),
    shouldUseVirtualFocus: () => access(options.shouldUseVirtualFocus),
    isVirtualized: () => access(options.isVirtualized),
    focusVisible: focusVisible(),
  });

  return {
    baseId,
    labelProps,
    descriptionProps,
    errorMessageProps,
    listBoxProps: mergeProps(
      filterDOMProps(options, { labelable: true }),
      focusWithinProps,
      listProps,
      fieldProps,
      {
        role: "listbox",
        "aria-multiselectable": () =>
          state.selectionManager().selectionMode === "multiple" ? true : undefined,
        "aria-disabled": () => access(options.isDisabled) === true || undefined,
        "aria-orientation": () => access(options.orientation) ?? "vertical",
        // Under virtual focus the listbox never has DOM focus, so the item that
        // does is named here instead.
        "aria-activedescendant": () => {
          if (access(options.shouldUseVirtualFocus) !== true) return undefined;
          const focusedKey = state.selectionManager().focusedKey;
          return focusedKey === null ? undefined : optionIdFor(baseId(), focusedKey);
        },
      },
    ),
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
  return `${baseId}-option-${idFragment(key)}`;
}

/**
 * A key as part of an id.
 *
 * A key is whatever the caller's data uses, and "New York" is a reasonable one;
 * an id holding a space is read by `aria-activedescendant` and
 * `aria-labelledby` as two ids, neither of which exists. Letters, digits and
 * hyphens pass through, so an ordinary key reads the same in the markup, and
 * everything else is written as its code point so that no two keys collide.
 */
export function idFragment(key: Key): string {
  return String(key).replace(
    /[^A-Za-z0-9-]/g,
    (character) => `_${(character.codePointAt(0) ?? 0).toString(36)}_`,
  );
}

export interface OptionOptions {
  key: Key;
  ref: ElementRef;
  /** The listbox's own id, which the option's is derived from. */
  baseId: MaybeAccessor<string>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  /** @default what the list was given */
  shouldSelectOnPressUp?: MaybeAccessor<boolean | undefined>;
  /** @default what the list was given */
  shouldFocusOnHover?: MaybeAccessor<boolean | undefined>;
  /** @default what the list was given */
  shouldUseVirtualFocus?: MaybeAccessor<boolean | undefined>;
  /** @default what the list was given */
  isVirtualized?: MaybeAccessor<boolean | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  /** The option's own action, run before the list's `onAction`. */
  onAction?: () => void;
  /** Whether `onAction` does anything. @default `onAction !== undefined` */
  hasAction?: MaybeAccessor<boolean | undefined>;
  onPressStart?: (event: PressEvent) => void;
  onPressEnd?: (event: PressEvent) => void;
  onPressUp?: (event: PressEvent) => void;
  onPress?: (event: PressEvent) => void;
  onPressChange?: (isPressed: boolean) => void;
}

export interface OptionResult {
  optionProps: DOMProps;
  labelProps: DOMProps;
  descriptionProps: DOMProps;
  isSelected: Accessor<boolean>;
  isFocused: Accessor<boolean>;
  /** Focused, and reached by keyboard: virtual focus included, which no DOM focus ring sees. */
  isFocusVisible: Accessor<boolean>;
  isPressed: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
  allowsSelection: Accessor<boolean>;
  /** Whether pressing it does something other than select it. */
  hasAction: Accessor<boolean>;
}

export function option(options: OptionOptions, state: ListState<unknown>): OptionResult {
  const labelId = id();
  const descriptionId = id();
  const data = listData.get(state);

  const node = (): Node<unknown> | null => state.collection().getItem(options.key);
  const ownAction = (): unknown => node()?.props?.onAction;
  const shouldSelectOnPressUp = (): boolean | undefined =>
    access(options.shouldSelectOnPressUp) ?? data?.shouldSelectOnPressUp();
  const shouldFocusOnHover = (): boolean | undefined =>
    access(options.shouldFocusOnHover) ?? data?.shouldFocusOnHover();
  const shouldUseVirtualFocus = (): boolean | undefined =>
    access(options.shouldUseVirtualFocus) ?? data?.shouldUseVirtualFocus();
  const isVirtualized = (): boolean | undefined =>
    access(options.isVirtualized) ?? data?.isVirtualized();

  const item = selectableItem({
    key: options.key,
    ref: options.ref,
    id: () => optionIdFor(access(options.baseId), options.key),
    selectionManager: state.selectionManager,
    isDisabled: options.isDisabled,
    shouldSelectOnPressUp,
    allowsDifferentPressOrigin: () =>
      shouldSelectOnPressUp() === true && shouldFocusOnHover() === true,
    shouldUseVirtualFocus,
    linkBehavior: data?.linkBehavior,
    hasAction: () =>
      (access(options.hasAction) ?? options.onAction !== undefined) ||
      typeof ownAction() === "function" ||
      data?.hasAction() === true,
    onAction: () => {
      options.onAction?.();
      const own = ownAction();
      if (typeof own === "function") (own as () => void)();
      if (data?.hasAction() === true) data.onAction(options.key);
    },
    onPressStart: options.onPressStart,
    onPressEnd: options.onPressEnd,
    onPressUp: options.onPressUp,
    onPress: options.onPress,
    onPressChange: options.onPressChange,
  });

  const visible = data?.focusVisible ?? focusVisible();
  const { hoverProps } = hover({
    isDisabled: () => item.isDisabled() || shouldFocusOnHover() !== true,
    onHoverStart: () => {
      // Read now rather than from the signal: a pointer moving changes the
      // modality without announcing it.
      if (focusIsVisible()) return;
      state.selectionManager().setFocused(true);
      state.selectionManager().setFocusedKey(options.key);
    },
  });

  return {
    isSelected: item.isSelected,
    isFocused: item.isFocused,
    isFocusVisible: () => item.isFocused() && visible(),
    isPressed: item.isPressed,
    isDisabled: item.isDisabled,
    allowsSelection: item.allowsSelection,
    hasAction: item.hasAction,
    labelProps: { id: labelId },
    descriptionProps: { id: descriptionId },
    optionProps: mergeProps(item.itemProps, hoverProps, {
      role: "option",
      // `aria-selected` only where selection is possible: on a listbox that
      // only performs actions, the attribute would say every item is
      // unselected rather than that selection is not the point.
      "aria-selected": () =>
        state.selectionManager().selectionMode !== "none" ? item.isSelected() : undefined,
      "aria-disabled": () => item.isDisabled() || undefined,
      "aria-label": () => access(options["aria-label"]) ?? node()?.["aria-label"],
      // A virtualised list renders a window, so the position has to be stated.
      "aria-posinset": () => (isVirtualized() === true ? (node()?.index ?? 0) + 1 : undefined),
      "aria-setsize": () =>
        isVirtualized() === true ? getItemCount(state.collection()) : undefined,
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
  /**
   * Where an `<Option>` written as a child registers itself.
   *
   * Present when the list was given no `items`: the options that render ARE the
   * collection, and each one says what it is rather than reading a node.
   */
  staticItems?: StaticCollection | undefined;
  /** The list's drag and drop, when it was given `dragAndDropHooks`. */
  dragAndDrop?: CollectionDragAndDrop | undefined;
}

const ListBoxContext = createContext<ListBoxContextValue | null>(null);
const ItemNodeContext = createContext<Node<unknown> | null>(null);

type ItemRender = (item: unknown) => Child;

/**
 * The list's own item callback, so a SECTION can render its children with it.
 *
 * A section's options are built by the same callback as every other option;
 * without this a caller would have to pass the callback to `<Section>` by hand
 * at every use, and the two could disagree.
 */
const ItemRenderContext = createContext<ItemRender | null>(null);

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
  return provide(
    ListBoxContext,
    () => props.value(),
    () => props.children as unknown,
  );
}

/** The collection node the row being built is for. */
export function provideItemNode(node: Node<unknown>): void {
  const owner = getOwner();
  if (owner !== null) install(owner, ItemNodeContext, () => node);
}

/** The item callback the enclosing list builds its rows with. */
export function provideItemRender(render: ItemRender): void {
  const owner = getOwner();
  if (owner !== null) install(owner, ItemRenderContext, () => render);
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

export interface SectionComponentProps extends Omit<StyleProps, "title"> {
  /** The heading. A section without one is a box a screen reader cannot name. */
  title?: Child;
  "aria-label"?: string;
  /** The heading element's own slot, for a design system naming it. */
  titleSlot?: string;
  /** And its class, since `class` styles the section rather than the heading. */
  titleClass?: string;
  "data-slot"?: string;
  children?: Child;
}

/**
 * A run of options under a heading.
 *
 * Rendered from the item callback like any other row: a section arrives there
 * as its own node, and this reads the node it was given rather than being told
 * what is in it.
 *
 * `role="group"` on a nested `<ul>` with `aria-labelledby` pointing at the
 * heading, which is what lets a screen reader say "Fruit, group, 3 items". The
 * heading is `role="presentation"` because a `<li>` inside a listbox that is
 * not an option is one the list would otherwise count.
 *
 * Keyboard traversal needs nothing here: the collection links keys in document
 * order ACROSS section boundaries, so Down from the last option of one section
 * already reaches the first of the next.
 */
export function Section(props: SectionComponentProps) {
  const registry = getContext(ListBoxContext)?.staticItems;
  if (registry !== undefined) return <StaticSection of={cells(props)} registry={registry} />;

  const node = useItemNode();
  const render = getContext(ItemRenderContext);
  if (render === null || render === undefined) {
    throw new Error("A Section must be rendered inside its list's item callback.");
  }

  // The hook, not a second copy of it: `listBoxSection` already decides that
  // the wrapper is presentational, that the heading names the group rather
  // than joining it, and that a section with no heading gets no dangling
  // `aria-labelledby`.
  const { itemProps, headingProps, groupProps } = listBoxSection({
    heading: () => (props.title === undefined ? undefined : "titled"),
    "aria-label": () => props["aria-label"],
  });

  return (
    <li {...itemProps} {...styleProps(cells(props))} data-slot={props["data-slot"] ?? "section"}>
      <span
        {...headingProps}
        data-slot={props.titleSlot ?? "section-title"}
        class={props.titleClass}
      >
        {props.title}
      </span>
      <ul {...groupProps}>
        <For each={() => [...node.childNodes]}>
          {(child: Node<unknown>) => {
            provideItemNode(child);
            return render(child.value);
          }}
        </For>
      </ul>
      {props.children}
    </li>
  );
}

interface SectionHeading {
  id: Accessor<string>;
  readonly name: (has: boolean) => void;
}

const SectionHeadingContext = createContext<SectionHeading | null>(null);

/**
 * The id the enclosing section's heading must carry, for a heading written as
 * one of the section's children rather than as its `title`.
 *
 * Calling it is what makes the group point at the heading, and leaving undoes
 * that, so a section never names an element that is not there.
 */
export function useSectionHeading(): Accessor<string> | null {
  const heading = getContext(SectionHeadingContext);
  if (heading === null || heading === undefined) return null;
  heading.name(true);
  onCleanup(() => heading.name(false));
  return heading.id;
}

function StaticSection(sectionProps: {
  of: Incoming<SectionComponentProps>;
  registry: StaticCollection;
}) {
  const props = sectionProps.of;
  const list = useListBox();
  const section = staticItem(sectionProps.registry, { type: "section", textValue: "" });
  const headingId = id();
  const [isNamed, setNamed] = createSignal(false, { ownedWrite: true });
  const hasTitle = (): boolean => props.title?.() !== undefined;
  const heading: SectionHeading = { id: headingId, name: setNamed };

  return (
    <li
      role="presentation"
      {...styleProps(props)}
      data-slot={props["data-slot"]?.() ?? "section"}
      // A section a filter has emptied still renders its heading, and a design
      // system hides the whole thing off this.
      data-empty={(list.state.collection().getItem(section.key)?.childNodes.length ?? 0) === 0}
      ref={section.ref}
    >
      <span
        id={hasTitle() ? headingId() : undefined}
        aria-hidden="true"
        data-slot={props.titleSlot?.() ?? "section-title"}
        class={props.titleClass?.()}
      >
        {props.title}
      </span>
      <ul
        role="group"
        aria-label={props["aria-label"]?.()}
        aria-labelledby={hasTitle() || isNamed() ? headingId() : undefined}
      >
        {
          provideStaticSection(section.key, () =>
            provide(
              SectionHeadingContext,
              () => heading,
              () => props.children as unknown,
            ),
          ) as Child
        }
      </ul>
    </li>
  );
}

/** What a list hands to its empty state. Every field follows the list. */
export interface ListBoxRenderState {
  isEmpty: Accessor<boolean>;
  isFocused: Accessor<boolean>;
  isFocusVisible: Accessor<boolean>;
  isDropTarget: Accessor<boolean>;
  layout: Accessor<"stack" | "grid">;
  orientation: Accessor<"horizontal" | "vertical">;
  state: ListState<unknown>;
}

export interface ListBoxComponentProps<T> extends StyleProps, ItemAccessors<T> {
  /**
   * The values to render, in order.
   *
   * Leave it out and the `<Option>`s written as children are the collection:
   * each one carries its own `value`, and nothing is rendered from data.
   */
  items?: Iterable<T>;
  /** How one value renders, returning an `<Option>`; or the options themselves. */
  children: ((item: T) => Child) | Child;
  label?: Child;
  description?: Child;
  errorMessage?: Child;
  /** @default "none" */
  selectionMode?: SelectionMode;
  /** @default "toggle" */
  selectionBehavior?: SelectionBehavior;
  selectedKeys?: "all" | Iterable<Key>;
  defaultSelectedKeys?: "all" | Iterable<Key>;
  disabledKeys?: Iterable<Key>;
  /** Whether `disabledKeys` stops everything, or only selection. @default "all" */
  disabledBehavior?: DisabledBehavior;
  disallowEmptySelection?: boolean;
  shouldFocusWrap?: boolean;
  /** @default "vertical" */
  orientation?: "horizontal" | "vertical";
  /** Whether the options are a stack or a grid the arrows move across. @default "stack" */
  layout?: "stack" | "grid";
  autoFocus?: boolean | "first" | "last";
  isDisabled?: boolean;
  /** Select on pointer up rather than down. */
  shouldSelectOnPressUp?: boolean;
  /** Move focus to an option the pointer moves over. */
  shouldFocusOnHover?: boolean;
  /** @default "clearSelection" */
  escapeKeyBehavior?: "clearSelection" | "none";
  /** What to show when there are no options. */
  renderEmptyState?: (list: ListBoxRenderState) => Child;
  /** Which option each key moves to. @default list navigation for `layout` and `orientation` */
  keyboardDelegate?: KeyboardDelegate;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  ref?: RefTarget<HTMLUListElement>;
  onSelectionChange?: (keys: "all" | Set<Key>) => void;
  onAction?: (key: Key) => void;
  /** Focus entering the list from outside it. */
  onFocus?: (event: FocusEvent) => void;
  /** Focus leaving the list altogether. */
  onBlur?: (event: FocusEvent) => void;
  onFocusChange?: (isFocused: boolean) => void;
  /** Drag and drop, from `dragAndDrop()`. */
  dragAndDropHooks?: DragAndDropHooks;
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
 *
 * Inside an `<Autocomplete>` the list is filtered by what is typed, and
 * highlighted from the field.
 */
export function ListBox<T>(props: ListBoxComponentProps<T>) {
  const domRef = makeRef<HTMLUListElement>();
  const options = fromProps(cells(props) as unknown as Incoming<Record<string, unknown>>);
  const rendered = props.items === undefined ? staticCollection() : null;
  const auto = useAutocompleteCollection();

  const state = listState<T>({
    ...(options as ListStateOptions<T>),
    ...(rendered === null
      ? {}
      : ({ items: rendered.entries, ...staticAccessors } as unknown as ListStateOptions<T>)),
    filter: auto?.filterNodes as ListStateOptions<T>["filter"],
    onSelectionChange: (keys) => props.onSelectionChange?.(keys),
  });
  const anyState = state as unknown as ListState<unknown>;

  // Inside a `<Virtualizer>` the list renders a WINDOW of its collection, and
  // the layout — not the DOM — answers what is above, below and a page away.
  const virtual = useVirtualizer();
  virtual?.attach(state.collection, domRef, () => state.selectionManager().focusedKey);

  // A press selects on release in a draggable list, so that pressing one of
  // several selected items to drag them all does not first select only it.
  const shouldSelectOnPressUp = (): boolean | undefined =>
    dragAndDrop?.dragState !== undefined ? true : props.shouldSelectOnPressUp;

  const { listBoxProps, labelProps, descriptionProps, errorMessageProps, baseId } = listBox(
    {
      ...(options as unknown as ListBoxOptions),
      ...autocompleteOptions(auto, options as unknown as ListBoxOptions),
      ref: domRef,
      keyboardDelegate: props.keyboardDelegate,
      shouldSelectOnPressUp,
      onAction: (key) => props.onAction?.(key),
      hasAction: () => props.onAction !== undefined,
      isVirtualized: () => virtual !== null,
      layoutDelegate: virtual?.layout,
    },
    anyState,
  );

  const dragAndDrop = listBoxDragAndDrop(props.dragAndDropHooks, anyState, domRef, {
    orientation: () => props.orientation,
    layoutDelegate: virtual?.layout,
  });

  if (auto !== null) {
    onCleanup(
      auto.connect({
        ref: domRef,
        state: anyState,
        idFor: (key) => optionIdFor(baseId(), key),
      }),
    );
  }

  const owner = getOwner();
  if (owner !== null) {
    const value: ListBoxContextValue = {
      state: anyState,
      baseId,
      shouldSelectOnPressUp,
      shouldUseVirtualFocus: () => auto?.collectionProps.shouldUseVirtualFocus(),
      staticItems: rendered ?? undefined,
      dragAndDrop,
    };
    install(owner, ListBoxContext, () => value);
  }

  const { focusProps, isFocused, isFocusVisible } = focusRing();
  const isEmpty = (): boolean => state.collection().size === 0;
  const layout = (): "stack" | "grid" => props.layout ?? "stack";
  const orientation = (): "horizontal" | "vertical" => props.orientation ?? "vertical";
  const isDropTarget = (): boolean => dragAndDrop?.isRootDropTarget() === true;

  // Focus entering and leaving is the list's, heard through `listBox`, rather
  // than each element's own focus and blur.
  const {
    onFocus: _onFocus,
    onBlur: _onBlur,
    ...forwarded
  } = filterDOMProps(fromProps(cells(props)), { global: true });

  const elementProps = mergeProps(
    listBoxProps,
    focusProps,
    dragAndDrop?.collectionProps,
    forwarded,
    styleProps(cells(props)),
    {
      "data-testid": () => props["data-testid"],
      "data-empty": isEmpty,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-layout": layout,
      "data-orientation": orientation,
      "data-virtualized": () => virtual !== null,
      "data-drop-target": isDropTarget,
      style: () => (virtual === null ? props.style : contentStyle(virtual.contentSize())),
    },
  );

  const render = cells(props).children;

  /** The whole collection, or the window of it the virtualiser says is on screen. */
  const rows = (): Node<T>[] => {
    if (virtual === null) return [...state.collection()];
    const collection = state.collection();
    return virtual
      .visible()
      .map((info: LayoutInfo) => collection.getItem(info.key))
      .filter((node: Node<T> | null): node is Node<T> => node !== null);
  };

  provideItemRender(render as unknown as (item: unknown) => Child);

  const renderState: ListBoxRenderState = {
    isEmpty,
    isFocused,
    isFocusVisible,
    isDropTarget,
    layout,
    orientation,
    state: anyState,
  };
  const renderEmpty = callback(cells(props).renderEmptyState);
  const emptyState = (): Child => {
    if (!isEmpty() || renderEmpty === undefined) return null;
    return (
      <li role="option" style={{ display: "contents" }}>
        {renderEmpty(renderState)}
      </li>
    );
  };

  return (
    <>
      <span {...labelProps}>{props.label}</span>
      <ul {...elementProps} ref={mergeRefs(domRef.set, props.ref)}>
        <SharedElementTransition>
          {rendered !== null ? (
            props.children
          ) : (
            <For each={rows}>
              {(node: Node<T>) => {
                provideItemNode(node);
                return render(node.value as T);
              }}
            </For>
          )}
        </SharedElementTransition>
        {emptyState}
      </ul>
      {dragAndDrop?.preview}
      <span {...descriptionProps}>{props.description}</span>
      <span {...errorMessageProps}>{props.errorMessage}</span>
    </>
  );
}

/**
 * What an enclosing autocomplete asks of the list: its id, a name, virtual
 * focus, no typeahead of its own. The caller's own name and id come first.
 */
function autocompleteOptions(
  auto: ReturnType<typeof useAutocompleteCollection>,
  options: ListBoxOptions & { id?: MaybeAccessor<string | undefined> },
): Partial<ListBoxOptions> & { id?: MaybeAccessor<string> } {
  if (auto === null) return {};
  const given = auto.collectionProps;
  const own = options.id;
  return {
    // Merged rather than replaced, so the field's `aria-controls` follows the
    // caller's id.
    id: own === undefined ? given.id : mergeIds(own as MaybeAccessor<string>, given.id),
    "aria-label": () => access(options["aria-label"]) ?? given["aria-label"],
    shouldUseVirtualFocus: () =>
      access(options.shouldUseVirtualFocus) ?? given.shouldUseVirtualFocus(),
    disallowTypeAhead: () => access(options.disallowTypeAhead) ?? given.disallowTypeAhead(),
    autoFocus: () => access(options.autoFocus) ?? given.autoFocus(),
  };
}

export interface OptionComponentProps extends StyleProps {
  children?: Child;
  "aria-label"?: string;
  ref?: RefTarget<HTMLLIElement>;
  /**
   * What the option is, when it is written as a child of a list with no
   * `items`: its key in the selection. Generated when left out.
   */
  value?: Key;
  /** What a typeahead matches, for a written option. @default its own text */
  textValue?: string;
  /** For a written option; one rendered from data reads its item's. */
  isDisabled?: boolean;
  /** Keep a written option mounted and take it out of the collection. */
  isHidden?: boolean;
  /**
   * Where a written option leads. One rendered from data reads its item's
   * `href` and the rest.
   */
  href?: string;
  target?: string;
  rel?: string;
  download?: boolean | string;
  ping?: string;
  referrerPolicy?: string;
  /**
   * Called when the option is acted on: a press where nothing is selectable,
   * and Enter where something is, which is the split every list here makes
   * between choosing a row and opening it. The list's own `onAction` runs
   * after it.
   */
  onAction?: () => void;
  onPress?: (event: PressEvent) => void;
  onPressStart?: (event: PressEvent) => void;
  onPressEnd?: (event: PressEvent) => void;
  onPressUp?: (event: PressEvent) => void;
  onPressChange?: (isPressed: boolean) => void;
  onHoverStart?: (event: HoverEvent) => void;
  onHoverEnd?: (event: HoverEvent) => void;
  onHoverChange?: (isHovered: boolean) => void;
  /** Call `event.continuePropagation()` to let the list handle the key too. */
  onKeyDown?: (event: BaseEvent<KeyboardEvent>) => void;
  onKeyUp?: (event: BaseEvent<KeyboardEvent>) => void;
  onFocusChange?: (isFocused: boolean) => void;
}

const LINK_PROPS = ["href", "target", "rel", "download", "ping", "referrerPolicy"] as const;

/**
 * One option. Its key, value and disabled state come from the collection node
 * the enclosing {@link ListBox} is rendering, so nothing is repeated here.
 */
export function Option(props: OptionComponentProps) {
  const domRef = makeRef<HTMLLIElement>();
  const list = useListBox();
  const options = fromProps(cells(props));
  const written =
    list.staticItems === undefined
      ? null
      : staticItem(list.staticItems, {
          key: props.value,
          textValue: () => props.textValue,
          props: () => {
            const own: Record<string, unknown> = { isDisabled: props.isDisabled === true };
            for (const name of LINK_PROPS) {
              if (props[name] !== undefined) own[name] = props[name];
            }
            return own;
          },
          isHidden: () => props.isHidden,
        });
  const node: Pick<Node<unknown>, "key" | "props"> = written === null
    ? useItemNode()
    : { key: written.key, props: {} };
  const virtual = useVirtualizer();

  measureRow(virtual, node.key, domRef);

  const {
    optionProps,
    isSelected,
    isFocused,
    isFocusVisible,
    isPressed,
    isDisabled,
    allowsSelection,
    hasAction,
  } = option(
    {
      key: node.key,
      ref: domRef,
      baseId: list.baseId,
      "aria-label": () => props["aria-label"],
      isDisabled: () => props.isDisabled === true || node.props?.isDisabled === true,
      shouldSelectOnPressUp: list.shouldSelectOnPressUp,
      shouldUseVirtualFocus: list.shouldUseVirtualFocus,
      isVirtualized: () => virtual !== null,
      onAction: () => props.onAction?.(),
      hasAction: () => props.onAction !== undefined,
      onPress: options.onPress,
      onPressStart: options.onPressStart,
      onPressEnd: options.onPressEnd,
      onPressUp: options.onPressUp,
      onPressChange: options.onPressChange,
    },
    list.state,
  );

  const dnd = optionDragAndDrop(list, node.key, domRef, hasAction);
  const isDraggable = (): boolean =>
    dnd?.collection.dragState !== undefined && !list.state.selectionManager().isDisabled(node.key);
  const { hoverProps, isHovered } = hover({
    isDisabled: () => !allowsSelection() && !hasAction() && !isDraggable(),
    onHoverStart: options.onHoverStart,
    onHoverEnd: options.onHoverEnd,
    onHoverChange: options.onHoverChange,
  });
  const { keyboardProps } = keyboard({ onKeyDown: options.onKeyDown, onKeyUp: options.onKeyUp });
  const { focusProps } = focused({ onFocusChange: options.onFocusChange });
  const selectionMode = (): SelectionMode => list.state.selectionManager().selectionMode;

  const elementProps = mergeProps(
    optionProps,
    hoverProps,
    keyboardProps,
    focusProps,
    filterDOMProps(options, { global: true, labelable: true }),
    styleProps(cells(props)),
    {
      "data-selected": isSelected,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-disabled": isDisabled,
      "data-selection-mode": () => (selectionMode() === "none" ? undefined : selectionMode()),
      hidden: () => props.isHidden === true || undefined,
      "data-testid": () => props["data-testid"],
      // Positioned by the LAYOUT: the rows above it are not rendered, so
      // document flow has nothing to place it against.
      style: () => {
        if (virtual === null) return props.style;
        const info = virtual.layout.getLayoutInfo(node.key);
        return info === null ? props.style : rowStyle(info);
      },
    },
    dnd?.itemProps,
  );

  const element = (
    <li {...elementProps} ref={mergeRefs(domRef.set, written?.ref, props.ref)}>
      <SelectionIndicatorProvider isSelected={isSelected()}>
        {props.children}
      </SelectionIndicatorProvider>
    </li>
  );
  if (dnd === null) return element;

  return (
    <>
      <Show when={dnd.collection.shouldRenderIndicator(dnd.before)}>
        {dnd.collection.renderDropIndicator(dnd.before)}
      </Show>
      {element}
      <For each={dnd.after()}>
        {(target: ItemDropTarget) => (
          <Show when={dnd.collection.shouldRenderIndicator(target)}>
            {dnd.collection.renderDropIndicator(target)}
          </Show>
        )}
      </For>
    </>
  );
}

interface OptionDragAndDrop {
  collection: CollectionDragAndDrop;
  itemProps: DOMProps;
  before: ItemDropTarget;
  after: Accessor<ItemDropTarget[]>;
}

/**
 * An option's part in its list's drag and drop: dragging it, dropping on it,
 * and the indicators for the positions before and after it.
 */
function optionDragAndDrop(
  list: ListBoxContextValue,
  key: Key,
  domRef: Accessor<HTMLLIElement | null>,
  hasAction: Accessor<boolean>,
): OptionDragAndDrop | null {
  const collection = list.dragAndDrop;
  if (collection === undefined) return null;
  const { hooks, dragState, dropState } = collection;

  const draggable =
    dragState === undefined || hooks?.draggableItem === undefined
      ? null
      : hooks.draggableItem({ key, hasAction }, dragState);
  const droppable =
    dropState === undefined || hooks?.droppableItem === undefined
      ? null
      : hooks.droppableItem(
          { target: { type: "item", key, dropPosition: "on" } },
          dropState,
          domRef,
        );

  const after = createMemo(() => {
    const items = list.state.collection();
    const node = items.getItem(key);
    return node === null ? [] : afterDropIndicatorTargets(items, node);
  });

  return {
    collection,
    before: { type: "item", key, dropPosition: "before" },
    after,
    itemProps: mergeProps(draggable?.dragProps, droppable?.dropProps, {
      "data-allows-dragging": () => dragState !== undefined,
      "data-dragging": () => dragState?.isDragging(key) === true,
      "data-drop-target": () => droppable?.isDropTarget() === true,
    }),
  };
}

function listBoxDragAndDrop(
  hooks: DragAndDropHooks | undefined,
  state: ListState<unknown>,
  domRef: Accessor<HTMLUListElement | null>,
  layout: {
    orientation: Accessor<"horizontal" | "vertical" | undefined>;
    layoutDelegate: LayoutDelegate | undefined;
  },
): CollectionDragAndDrop | undefined {
  if (hooks === undefined) return undefined;
  const locale = useLocale();
  const direction = (): "ltr" | "rtl" => locale().direction;
  const collection = state.collection as Accessor<Collection<unknown>>;

  const dragAndDrop = collectionDragAndDrop({
    hooks,
    collection,
    selectionManager: state.selectionManager,
    ref: domRef,
    // A position next to a disabled option is still a place to drop.
    keyboardDelegate: new ListKeyboardDelegate({
      collection,
      ref: domRef,
      disabledBehavior: () => "selection",
      orientation: layout.orientation,
      direction,
      layoutDelegate: layout.layoutDelegate,
    }),
    orientation: layout.orientation,
    direction,
  });

  if (dragAndDrop.dropState !== undefined) {
    provideDropIndicator({ render: (props) => <ListBoxDropIndicator of={props} /> });
  }
  return dragAndDrop;
}

/** A drop indicator in a listbox: an option, so it is in the listbox's own children. */
function ListBoxDropIndicator(indicator: { of: Incoming<DropIndicatorProps> }) {
  const props = indicator.of;
  const { dragAndDropHooks, dropState } = useDragAndDropContext();
  if (dragAndDropHooks?.dropIndicator === undefined || dropState === undefined) {
    throw new Error("A DropIndicator must be rendered inside a droppable ListBox.");
  }

  const domRef = makeRef<HTMLLIElement>();
  const { dropIndicatorProps, isDropTarget, isHidden } = dragAndDropHooks.dropIndicator(
    { target: props.target() },
    dropState,
    domRef,
  );

  return (
    <Show when={!isHidden()}>
      <li
        {...dropIndicatorProps}
        {...styleProps(props)}
        role="option"
        data-slot={props["data-slot"]?.() ?? "drop-indicator"}
        data-drop-target={isDropTarget()}
        ref={domRef.set}
      >
        {props.children?.()}
      </li>
    </Show>
  );
}
