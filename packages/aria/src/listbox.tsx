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
  type Accessor,
  type Child,
  createSignal,
  For,
  getOwner,
  type Incoming,
  install,
  onCleanup,
} from "@barqjs/core";
import { createContext, getContext, provide } from "@barqjs/core";
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
  type DOMProps,
  filterDOMProps,
  fromProps,
  id,
  type MaybeAccessor,
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
  shouldSelectOnPressUp?: MaybeAccessor<boolean | undefined>;
  shouldUseVirtualFocus?: MaybeAccessor<boolean | undefined>;
  isVirtualized?: MaybeAccessor<boolean | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  onAction?: () => void;
  /** Whether `onAction` does anything. @default `onAction !== undefined` */
  hasAction?: MaybeAccessor<boolean | undefined>;
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
  /**
   * Where an `<Option>` written as a child registers itself.
   *
   * Present when the list was given no `items`: the options that render ARE the
   * collection, and each one says what it is rather than reading a node.
   */
  staticItems?: StaticCollection | undefined;
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
export function Section(props: Incoming<SectionComponentProps>) {
  const registry = getContext(ListBoxContext)?.staticItems;
  if (registry !== undefined) return <StaticSection of={props} registry={registry} />;

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
    heading: () => (props.title?.() === undefined ? undefined : "titled"),
    "aria-label": () => props["aria-label"]?.(),
  });

  return (
    <li {...itemProps} {...styleProps(props)} data-slot={props["data-slot"]?.() ?? "section"}>
      <span
        {...headingProps}
        data-slot={props.titleSlot?.() ?? "section-title"}
        class={props.titleClass?.()}
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

function StaticSection(
  sectionProps: Incoming<{ of: Incoming<SectionComponentProps>; registry: StaticCollection }>,
) {
  const props = sectionProps.of();
  const list = useListBox();
  const section = staticItem(sectionProps.registry(), { type: "section", textValue: "" });
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
  const rendered = props.items === undefined ? staticCollection() : null;

  const state = listState<T>({
    ...(options as ListStateOptions<T>),
    ...(rendered === null
      ? {}
      : ({ items: rendered.entries, ...staticAccessors } as unknown as ListStateOptions<T>)),
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
      staticItems: rendered ?? undefined,
    };
    install(owner, ListBoxContext, () => value);
  }

  const elementProps = mergeProps(
    listBoxProps,
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      "data-testid": () => props["data-testid"]?.(),
      "data-empty": () => state.collection().size === 0,
      "data-virtualized": () => virtual !== null,
      style: () => (virtual === null ? props.style?.() : contentStyle(virtual.contentSize())),
    },
  );

  const render = props.children;

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

  if (rendered !== null) {
    return (
      <>
        <span {...labelProps}>{props.label}</span>
        <ul {...elementProps} ref={mergeRefs(domRef.set, props.ref?.())}>
          {props.children}
        </ul>
        <span {...descriptionProps}>{props.description}</span>
        <span {...errorMessageProps}>{props.errorMessage}</span>
      </>
    );
  }

  return (
    <>
      <span {...labelProps}>{props.label}</span>
      <ul {...elementProps} ref={mergeRefs(domRef.set, props.ref?.())}>
        <For each={rows}>
          {(node: Node<T>) => {
            provideItemNode(node);
            return render(node.value as T);
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
   * Called when the option is acted on: a press where nothing is selectable,
   * and Enter where something is, which is the split every list here makes
   * between choosing a row and opening it.
   */
  onAction?: () => void;
}

/**
 * One option. Its key, value and disabled state come from the collection node
 * the enclosing {@link ListBox} is rendering, so nothing is repeated here.
 */
export function Option(props: Incoming<OptionComponentProps>) {
  const domRef = makeRef<HTMLLIElement>();
  const list = useListBox();
  const written =
    list.staticItems === undefined
      ? null
      : staticItem(list.staticItems, {
          key: props.value?.(),
          textValue: () => props.textValue?.(),
          props: () => ({ isDisabled: props.isDisabled?.() === true }),
          isHidden: () => props.isHidden?.(),
        });
  const node: Pick<Node<unknown>, "key" | "props"> = written === null
    ? useItemNode()
    : { key: written.key, props: {} };
  const virtual = useVirtualizer();

  measureRow(virtual, node.key, domRef);

  const { optionProps, isSelected, isFocused, isPressed, isDisabled } = option(
    {
      key: node.key,
      ref: domRef,
      baseId: list.baseId,
      "aria-label": () => props["aria-label"]?.(),
      isDisabled: () => props.isDisabled?.() === true || node.props?.isDisabled === true,
      shouldSelectOnPressUp: list.shouldSelectOnPressUp,
      shouldUseVirtualFocus: list.shouldUseVirtualFocus,
      isVirtualized: () => virtual !== null,
      onAction: () => props.onAction?.()?.(),
      hasAction: () => props.onAction?.() !== undefined,
    },
    list.state,
  );

  const { hoverProps, isHovered } = hover({ isDisabled });
  const { focusProps, isFocusVisible } = focusRing();

  const elementProps = mergeProps(
    optionProps,
    hoverProps,
    focusProps,
    filterDOMProps(fromProps(props), { global: true, labelable: true }),
    styleProps(props),
    {
      "data-selected": isSelected,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-disabled": isDisabled,
      hidden: () => props.isHidden?.() === true || undefined,
      "data-testid": () => props["data-testid"]?.(),
      // Positioned by the LAYOUT: the rows above it are not rendered, so
      // document flow has nothing to place it against.
      style: () => {
        if (virtual === null) return props.style?.();
        const info = virtual.layout.getLayoutInfo(node.key);
        return info === null ? props.style?.() : rowStyle(info);
      },
    },
  );

  return (
    <li {...elementProps} ref={mergeRefs(domRef.set, written?.ref, props.ref?.())}>
      {props.children}
    </li>
  );
}
