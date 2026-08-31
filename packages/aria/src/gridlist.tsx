/**
 * A grid list: rows that hold their own controls.
 *
 * A listbox's options are values; a grid list's rows are things you act on,
 * and each one may contain a checkbox, a menu button, a link. That is why it
 * is `role="grid"` and not `role="listbox"`: an option may not contain
 * interactive content, and a screen reader in browse mode will not let you
 * reach it if it does.
 *
 * The navigation is two-dimensional even though there is one column:
 *
 * - **Up and down move between ROWS**, and they belong to the list however
 *   deep in a row the focus is. A menu button inside a row must not swallow
 *   Down, so the row takes those keys in the CAPTURE phase and re-dispatches
 *   them from its parent, where the collection's own handler is.
 * - **Left and right move WITHIN a row**, between its focusable children,
 *   flipped in a right-to-left layout. Past the last child, focus returns to
 *   the row, which is what makes the row itself a place to stand.
 *
 * `keyboardNavigationBehavior: "tab"` swaps that second rule for the Tab key,
 * which is what a form of editable rows wants: Left and Right then belong to
 * the caret in whatever field the user is in.
 */

import {
  type Accessor,
  type Child,
  For,
  context,
  getContext,
  getOwner,
  type Incoming,
  install,
  provide,
} from "@barqjs/core";
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
import {
  contentStyle,
  measureRow,
  rowStyle,
  useVirtualizer,
  type LayoutInfo,
} from "./virtualizer.tsx";
import { activeElement, contains, ownerDocument, targetElement } from "./dom.ts";
import { focusableWalker, focusRing } from "./focus.ts";
import { useLocale } from "./i18n.ts";
import { focusSafely } from "./interactions/focusable.ts";
import { hover } from "./interactions/hover.ts";
import type { ElementRef } from "./interactions/press.ts";
import {
  selectableItem,
  selectableList,
  type KeyboardDelegate,
  type LinkBehavior,
} from "./selection.ts";
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

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

export type KeyboardNavigationBehavior = "arrow" | "tab";

export interface GridListOptions {
  ref: ElementRef;
  shouldFocusWrap?: MaybeAccessor<boolean | undefined>;
  autoFocus?: MaybeAccessor<boolean | "first" | "last" | undefined>;
  disallowTypeAhead?: MaybeAccessor<boolean | undefined>;
  disallowEmptySelection?: MaybeAccessor<boolean | undefined>;
  isVirtualized?: MaybeAccessor<boolean | undefined>;
  /** @default "arrow" */
  keyboardNavigationBehavior?: MaybeAccessor<KeyboardNavigationBehavior | undefined>;
  /** @default "action" */
  linkBehavior?: MaybeAccessor<LinkBehavior | undefined>;
  escapeKeyBehavior?: MaybeAccessor<"clearSelection" | "none" | undefined>;
  keyboardDelegate?: KeyboardDelegate;
  /** Where the rows are, when the DOM cannot answer because they are not in it. */
  layoutDelegate?: LayoutDelegate;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
  onAction?: (key: Key) => void;
}

export interface GridListResult {
  gridProps: DOMProps;
  /** The base every row id is derived from. */
  baseId: Accessor<string>;
}

export function gridList(options: GridListOptions, state: ListState<unknown>): GridListResult {
  const baseId = id();

  const { listProps } = selectableList({
    ...options,
    selectionManager: state.selectionManager,
    collection: state.collection,
    disabledKeys: state.disabledKeys,
    selectOnFocus: () => state.selectionManager().selectionBehavior === "replace",
    linkBehavior: () => access(options.linkBehavior) ?? "action",
  });

  const isEmpty = (): boolean => state.collection().size === 0;

  return {
    baseId,
    gridProps: mergeProps(filterDOMProps(options, { labelable: true }), listProps, {
      role: "grid",
      id: baseId,
      "aria-multiselectable": () =>
        state.selectionManager().selectionMode === "multiple" ? true : undefined,
      // An empty grid still has to be reachable, or a keyboard user cannot
      // land on it to be told it is empty.
      tabIndex: () => (isEmpty() ? 0 : access(listProps.tabIndex as MaybeAccessor<number>)),
      "aria-rowcount": () =>
        access(options.isVirtualized) === true ? state.collection().size : undefined,
      "aria-colcount": () => (access(options.isVirtualized) === true ? 1 : undefined),
    }),
  };
}

/** The id a row renders under, derived from the key so anything can name it. */
export function rowIdFor(baseId: string, key: Key): string {
  return `${baseId}-row-${String(key)}`;
}

// ---------------------------------------------------------------------------
// A row
// ---------------------------------------------------------------------------

export interface GridListItemOptions {
  key: Key;
  ref: ElementRef;
  baseId: MaybeAccessor<string>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isVirtualized?: MaybeAccessor<boolean | undefined>;
  shouldSelectOnPressUp?: MaybeAccessor<boolean | undefined>;
  /** @default "arrow" */
  keyboardNavigationBehavior?: MaybeAccessor<KeyboardNavigationBehavior | undefined>;
  linkBehavior?: MaybeAccessor<LinkBehavior | undefined>;
  onAction?: (key: Key) => void;
  /** See `selectableItem`. @default `onAction !== undefined` */
  hasAction?: MaybeAccessor<boolean | undefined>;
}

export interface GridListItemResult {
  rowProps: DOMProps;
  /** For the single cell inside the row. */
  gridCellProps: DOMProps;
  isSelected: Accessor<boolean>;
  isFocused: Accessor<boolean>;
  isPressed: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
  allowsSelection: Accessor<boolean>;
  hasAction: Accessor<boolean>;
}

export function gridListItem(
  options: GridListItemOptions,
  state: ListState<unknown>,
): GridListItemResult {
  const locale = useLocale();
  const node = (): Node<unknown> | null => state.collection().getItem(options.key);
  const rowId = (): string => rowIdFor(access(options.baseId), options.key);
  const behavior = (): KeyboardNavigationBehavior =>
    access(options.keyboardNavigationBehavior) ?? "arrow";

  const item = selectableItem({
    key: options.key,
    ref: options.ref,
    id: rowId,
    selectionManager: state.selectionManager,
    isDisabled: options.isDisabled,
    shouldSelectOnPressUp: options.shouldSelectOnPressUp,
    linkBehavior: options.linkBehavior,
    hasAction: () =>
      access(options.hasAction) ??
      (options.onAction !== undefined || node()?.props?.onAction !== undefined),
    onAction: () => {
      const own = node()?.props?.onAction;
      if (typeof own === "function") (own as () => void)();
      options.onAction?.(options.key);
    },
  });

  const row = (): HTMLElement | null => (access(options.ref) as HTMLElement | null) ?? null;

  /** A walker over the row's own focusable children, standing where focus is. */
  const walkerAt = (element: HTMLElement, from: Element): ReturnType<typeof focusableWalker> => {
    const walker = focusableWalker(element);
    walker.currentNode = from;
    return walker;
  };

  const lastFocusable = (element: HTMLElement): Element | null => {
    const walker = focusableWalker(element);
    walker.currentNode = element;
    return walker.last() as Element | null;
  };

  /**
   * Captured, not bubbled.
   *
   * A control inside the row would otherwise see these first: a menu button
   * takes Down to open, a text field takes Left to move the caret. The row has
   * to decide before they do.
   */
  const onKeyDownCapture = (event: KeyboardEvent): void => {
    const element = row();
    if (element === null) return;
    const target = targetElement(event);
    if (target === null || !contains(element, target)) return;
    const active = activeElement(ownerDocument(element));
    if (active === null) return;

    const rtl = locale().direction === "rtl";
    const inwards = rtl ? "ArrowLeft" : "ArrowRight";
    const outwards = rtl ? "ArrowRight" : "ArrowLeft";

    if (event.key === inwards || event.key === outwards) {
      if (behavior() !== "arrow") return;
      event.preventDefault();
      event.stopPropagation();

      const walker = walkerAt(element, active);
      const next = (
        event.key === inwards ? walker.nextNode() : walker.previousNode()
      ) as HTMLElement | null;

      if (next !== null) {
        focusSafely(next);
        return;
      }

      // Off the end of the row. Forwards lands back on the ROW, which is where
      // the up and down keys work from; backwards past the first control wraps
      // to the last, so the cycle is row, first, …, last, row.
      if (event.key === inwards) {
        focusSafely(element);
        return;
      }
      const last = lastFocusable(element) as HTMLElement | null;
      if (last !== null) focusSafely(last);
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (event.altKey) return;
      // The collection's handler is on the LIST, and the row is about to stop
      // this event before a child sees it — so it is re-dispatched from the
      // row's parent, where the list still hears it.
      event.preventDefault();
      event.stopPropagation();
      element.parentElement?.dispatchEvent(
        new KeyboardEvent(event.type, {
          key: event.key,
          code: event.code,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          bubbles: true,
          cancelable: true,
        }),
      );
    }
  };

  /**
   * Tab within the row, when that is the navigation mode.
   *
   * Stopping propagation is all it takes: the collection's Tab handling is
   * what would otherwise take focus out of the list, and the browser's own
   * Tab then moves to the next control in the row.
   */
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Tab" || behavior() !== "tab") return;
    const element = row();
    if (element === null) return;
    const active = activeElement(ownerDocument(element));
    if (active === null) return;

    const walker = focusableWalker(element, { tabbable: true });
    walker.currentNode = active;
    const next = event.shiftKey ? walker.previousNode() : walker.nextNode();
    if (next !== null) event.stopPropagation();
  };

  const onFocus = (event: FocusEvent): void => {
    // `selectableItem` only claims focus that lands on the row itself; a
    // control inside it is still the row being focused as far as the
    // collection is concerned.
    if (targetElement(event) === row()) return;
    state.selectionManager().setFocusedKey(options.key);
  };

  return {
    isSelected: item.isSelected,
    isFocused: item.isFocused,
    isPressed: item.isPressed,
    isDisabled: item.isDisabled,
    allowsSelection: item.allowsSelection,
    hasAction: item.hasAction,
    gridCellProps: { role: "gridcell", "aria-colindex": 1 },
    rowProps: mergeProps(item.itemProps, {
      role: "row",
      id: rowId,
      onKeyDownCapture,
      onKeyDown,
      onFocus,
      "aria-label": () =>
        access(options["aria-label"]) ?? node()?.["aria-label"] ?? node()?.textValue ?? undefined,
      // Only where selection is possible: on a list that only performs
      // actions the attribute would say every row is unselected rather than
      // that selection is not the point.
      "aria-selected": () =>
        state.selectionManager().canSelectItem(options.key) ? item.isSelected() : undefined,
      "aria-disabled": () => item.isDisabled() || undefined,
      "aria-rowindex": () =>
        access(options.isVirtualized) === true ? (node()?.index ?? 0) + 1 : undefined,
    }),
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface GridListContextValue {
  state: ListState<unknown>;
  baseId: Accessor<string>;
  keyboardNavigationBehavior: Accessor<KeyboardNavigationBehavior>;
  onAction: Accessor<((key: Key) => void) | undefined>;
}

const GridListContext = context<GridListContextValue | null>(null);
const RowNodeContext = context<Node<unknown> | null>(null);

export function useGridList(): GridListContextValue {
  const value = getContext(GridListContext);
  if (value === null || value === undefined) {
    throw new Error("A GridListItem must be rendered inside a GridList.");
  }
  return value;
}

/** The collection node the row being built is for. */
export function useRowNode(): Node<unknown> {
  const node = getContext(RowNodeContext);
  if (node === null || node === undefined) {
    throw new Error("A GridListItem must be rendered inside a GridList's item callback.");
  }
  return node;
}

/** Make `<GridListItem>` usable inside something that is not a `<GridList>`. */
export function GridListProvider(
  props: Incoming<{ value: GridListContextValue; children?: Child }>,
) {
  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;
  return provide(
    owner,
    GridListContext,
    () => props.value(),
    () => props.children as unknown,
  ) as never;
}

/** The collection node the row being built is for. */
export function provideRowNode(node: Node<unknown>): void {
  const owner = getOwner();
  if (owner !== null) install(owner, RowNodeContext, () => node);
}

export interface GridListComponentProps<T> extends StyleProps, ItemAccessors<T> {
  /** The rows, in order. */
  items: Iterable<T>;
  /** How one row renders. Return a `<GridListItem>`. */
  children: (item: T) => Child;
  /** @default "none" */
  selectionMode?: SelectionMode;
  selectionBehavior?: "toggle" | "replace";
  selectedKeys?: "all" | Iterable<Key>;
  defaultSelectedKeys?: "all" | Iterable<Key>;
  disabledKeys?: Iterable<Key>;
  disallowEmptySelection?: boolean;
  shouldFocusWrap?: boolean;
  autoFocus?: boolean | "first" | "last";
  /** @default "arrow" */
  keyboardNavigationBehavior?: KeyboardNavigationBehavior;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  ref?: RefTarget<HTMLDivElement>;
  onSelectionChange?: (keys: "all" | Set<Key>) => void;
  onAction?: (key: Key) => void;
}

/**
 * ```tsx
 * <GridList aria-label="Files" items={files()} selectionMode="multiple">
 *   {(file) => (
 *     <GridListItem>
 *       {file.name}
 *       <Button onPress={() => remove(file.id)}>Delete</Button>
 *     </GridListItem>
 *   )}
 * </GridList>
 * ```
 */
export function GridList<T>(props: Incoming<GridListComponentProps<T>>) {
  const domRef = makeRef<HTMLDivElement>();
  const options = fromProps(props as unknown as Incoming<Record<string, unknown>>);

  const state = listState<T>({
    ...(options as ListStateOptions<T>),
    onSelectionChange: (keys) => props.onSelectionChange?.()?.(keys),
  });

  // Inside a `<Virtualizer>` the list renders a WINDOW of its collection, and
  // the layout — not the DOM — answers what is above, below and a page away.
  const virtual = useVirtualizer();
  virtual?.attach(state.collection, domRef, () => state.selectionManager().focusedKey);

  const { gridProps, baseId } = gridList(
    {
      ...(options as unknown as GridListOptions),
      ref: domRef,
      isVirtualized: () => virtual !== null,
      layoutDelegate: virtual?.layout,
    },
    state,
  );

  const value: GridListContextValue = {
    state: state,
    baseId,
    keyboardNavigationBehavior: () => props.keyboardNavigationBehavior?.() ?? "arrow",
    onAction: () => props.onAction?.(),
  };

  const elementProps = mergeProps(
    gridProps,
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      "data-empty": () => state.collection().size === 0,
      "data-virtualized": () => virtual !== null,
      "data-testid": () => props["data-testid"]?.(),
      style: () => (virtual === null ? props.style?.() : contentStyle(virtual.contentSize())),
    },
  );

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
    <GridListProvider value={value}>
      <div {...elementProps} ref={mergeRefs(domRef.set, props.ref?.())}>
        <For each={rows}>
          {(node: Node<T>) => {
            provideRowNode(node);
            return render(getOwner(), node.value as T);
          }}
        </For>
      </div>
    </GridListProvider>
  );
}

export interface GridListItemComponentProps extends StyleProps {
  children?: Child;
  "aria-label"?: string;
  ref?: RefTarget<HTMLDivElement>;
}

/**
 * One row, holding one cell.
 *
 * The cell is what the row's content goes in: a row may not contain content
 * directly, and a screen reader reports "row 2 of 7" from the pair.
 */
export function GridListItem(props: Incoming<GridListItemComponentProps>) {
  const domRef = makeRef<HTMLDivElement>();
  const virtual = useVirtualizer();
  const list = useGridList();
  const node = useRowNode();

  measureRow(virtual, node.key, domRef);

  const { rowProps, gridCellProps, isSelected, isFocused, isPressed, isDisabled } = gridListItem(
    {
      key: node.key,
      ref: domRef,
      baseId: list.baseId,
      isVirtualized: () => virtual !== null,
      "aria-label": () => props["aria-label"]?.(),
      isDisabled: () => node.props?.isDisabled === true,
      keyboardNavigationBehavior: list.keyboardNavigationBehavior,
      hasAction: () => list.onAction() !== undefined || node.props?.onAction !== undefined,
      onAction: (key) => list.onAction()?.(key),
    },
    list.state,
  );

  const { hoverProps, isHovered } = hover({ isDisabled });
  const { focusProps, isFocusVisible } = focusRing();

  const elementProps = mergeProps(
    rowProps,
    hoverProps,
    focusProps,
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
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
    },
  );

  return (
    <div {...elementProps} ref={mergeRefs(domRef.set, props.ref?.())}>
      <div {...gridCellProps}>{props.children}</div>
    </div>
  );
}
