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
 * which is what a form of editable rows wants: every key typed into a control
 * in a row is the control's, and only Tab goes on to the list. A grid
 * `layout` always navigates this way, since Left and Right move between rows.
 */

import {
  cells,
  type Accessor,
  type Child,
  For,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  getContext,
  getOwner,
  type Incoming,
  install,
  onCleanup,
  provide,
  Show,
} from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { Checkbox } from "./checkbox.tsx";
import type {
  Collection,
  DisabledBehavior,
  ItemAccessors,
  Key,
  LayoutDelegate,
  ListStateOptions,
  Node,
  SelectionBehavior,
  SelectionManager,
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
import {
  activeElement,
  contains,
  ownerDocument,
  scrollIntoViewport,
  scrollParents,
  targetElement,
} from "./dom.ts";
import {
  type CollectionDragAndDrop,
  collectionDragAndDrop,
  type DragAndDropHooks,
  draggableItemSlotProps,
  type DropIndicatorProps,
  provideDragButton,
  provideDropIndicator,
  useDragAndDropContext,
} from "./drag-and-drop.tsx";
import { afterDropIndicatorTargets, type ItemDropTarget } from "./dnd/index.ts";
import { focusableWalker, focusRing } from "./focus.ts";
import { collator, StringDictionary, stringFormatter, useLocale } from "./i18n.ts";
import { focused } from "./interactions/focus-events.ts";
import { focusSafely } from "./interactions/focusable.ts";
import { hover, type HoverEvent } from "./interactions/hover.ts";
import { isFocusVisible as focusIsVisible } from "./interactions/modality.ts";
import type { ElementRef, PressEvent } from "./interactions/press.ts";
import { idFragment } from "./listbox.tsx";
import { visuallyHidden } from "./live.ts";
import { SelectionIndicatorProvider } from "./selection-indicator.tsx";
import {
  ListKeyboardDelegate,
  selectableItem,
  selectableList,
  type KeyboardDelegate,
  type LinkBehavior,
} from "./selection.ts";
import { SharedElementTransition } from "./shared-element-transition.tsx";
import {
  access,
  callback,
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
  /** The grid's id, which every row id is derived from. */
  id?: MaybeAccessor<string | undefined>;
  shouldFocusWrap?: MaybeAccessor<boolean | undefined>;
  autoFocus?: MaybeAccessor<boolean | "first" | "last" | undefined>;
  disallowTypeAhead?: MaybeAccessor<boolean | undefined>;
  disallowEmptySelection?: MaybeAccessor<boolean | undefined>;
  isVirtualized?: MaybeAccessor<boolean | undefined>;
  /** @default "arrow", and always "tab" in a grid layout */
  keyboardNavigationBehavior?: MaybeAccessor<KeyboardNavigationBehavior | undefined>;
  /** Whether the rows are a stack or a grid the arrows move across. @default "stack" */
  layout?: MaybeAccessor<"stack" | "grid" | undefined>;
  /** @default "vertical" */
  orientation?: MaybeAccessor<"horizontal" | "vertical" | undefined>;
  /** @default "action" */
  linkBehavior?: MaybeAccessor<LinkBehavior | undefined>;
  escapeKeyBehavior?: MaybeAccessor<"clearSelection" | "none" | undefined>;
  /** Select on pointer up rather than down. */
  shouldSelectOnPressUp?: MaybeAccessor<boolean | undefined>;
  /**
   * Whether an empty grid's empty state holds a Tab stop of its own, so the
   * grid need not be one.
   */
  emptyStateIsTabbable?: MaybeAccessor<boolean | undefined>;
  keyboardDelegate?: KeyboardDelegate;
  /** Where the rows are, when the DOM cannot answer because they are not in it. */
  layoutDelegate?: LayoutDelegate;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
  /** Called when a row is acted on, with its key. */
  onAction?: (key: Key) => void;
  /** Whether `onAction` does anything. @default `onAction !== undefined` */
  hasAction?: MaybeAccessor<boolean | undefined>;
}

export interface GridListResult {
  gridProps: DOMProps;
  /** The base every row id is derived from. */
  baseId: Accessor<string>;
}

/** What a grid list tells its rows. */
interface GridListData {
  baseId: Accessor<string>;
  hasAction: Accessor<boolean>;
  onAction: (key: Key) => void;
  linkBehavior: Accessor<LinkBehavior>;
  keyboardNavigationBehavior: Accessor<KeyboardNavigationBehavior>;
  shouldSelectOnPressUp: Accessor<boolean | undefined>;
}

/** Keyed by the state, as the rows are handed it, whoever renders them. */
const gridData = new WeakMap<ListState<unknown>, GridListData>();

export function gridList(options: GridListOptions, state: ListState<unknown>): GridListResult {
  const baseId = id(options.id);
  const locale = useLocale();
  const isEmpty = (): boolean => state.collection().size === 0;
  const linkBehavior = (): LinkBehavior => access(options.linkBehavior) ?? "action";

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
    selectOnFocus: () => state.selectionManager().selectionBehavior === "replace",
    // Empty, there is nothing to move between or select, and Tab must be free
    // to reach whatever the empty state holds.
    allowsTabNavigation: isEmpty,
    disallowSelectAll: isEmpty,
    linkBehavior,
  });

  gridData.set(state, {
    baseId,
    hasAction: () => access(options.hasAction) ?? options.onAction !== undefined,
    onAction: (key) => options.onAction?.(key),
    linkBehavior,
    keyboardNavigationBehavior: () =>
      access(options.layout) === "grid"
        ? "tab"
        : (access(options.keyboardNavigationBehavior) ?? "arrow"),
    shouldSelectOnPressUp: () => access(options.shouldSelectOnPressUp),
  });

  return {
    baseId,
    gridProps: mergeProps(filterDOMProps(options, { labelable: true }), listProps, {
      role: "grid",
      id: baseId,
      "aria-multiselectable": () =>
        state.selectionManager().selectionMode === "multiple" ? true : undefined,
      // An empty grid still has to be reachable, or a keyboard user cannot
      // land on it to be told it is empty, unless its empty state has a stop.
      tabIndex: () => {
        if (!isEmpty()) return access(listProps.tabIndex as MaybeAccessor<number>);
        return access(options.emptyStateIsTabbable) === true ? -1 : 0;
      },
      "aria-rowcount": () =>
        access(options.isVirtualized) === true ? rowCount(state.collection()) : undefined,
      "aria-colcount": () => (access(options.isVirtualized) === true ? 1 : undefined),
    }),
  };
}

/** How many rows a collection holds: its items, without the sections around them. */
function rowCount(collection: Collection<unknown>): number {
  let count = 0;
  for (const key of collection.getKeys()) {
    if (collection.getItem(key)?.type === "item") count++;
  }
  return count;
}

/** Counting from 1, as `aria-rowindex` does, with sections left out. */
function rowIndexOf(collection: Collection<unknown>, key: Key): number {
  let index = 0;
  for (const each of collection.getKeys()) {
    if (collection.getItem(each)?.type !== "item") continue;
    index++;
    if (each === key) return index;
  }
  return 0;
}

/**
 * The id a row renders under, derived from the key so anything can name it.
 * The key is escaped: one holding a space would be two ids to
 * `aria-labelledby`.
 */
export function rowIdFor(baseId: string, key: Key): string {
  return `${baseId}-row-${idFragment(key)}`;
}

// ---------------------------------------------------------------------------
// A row
// ---------------------------------------------------------------------------

const strings = new StringDictionary<"select">({
  "ar-AE": { select: "تحديد" },
  "bg-BG": { select: "Изберете" },
  "cs-CZ": { select: "Vybrat" },
  "da-DK": { select: "Vælg" },
  "de-DE": { select: "Auswählen" },
  "el-GR": { select: "Επιλογή" },
  "en-US": { select: "Select" },
  "es-ES": { select: "Seleccionar" },
  "et-EE": { select: "Vali" },
  "fi-FI": { select: "Valitse" },
  "fr-FR": { select: "Sélectionner" },
  "he-IL": { select: "בחר" },
  "hr-HR": { select: "Odaberite" },
  "hu-HU": { select: "Kijelölés" },
  "it-IT": { select: "Seleziona" },
  "ja-JP": { select: "選択" },
  "ko-KR": { select: "선택" },
  "lt-LT": { select: "Pasirinkti" },
  "lv-LV": { select: "Atlasīt" },
  "nb-NO": { select: "Velg" },
  "nl-NL": { select: "Selecteren" },
  "pl-PL": { select: "Zaznacz" },
  "pt-BR": { select: "Selecionar" },
  "pt-PT": { select: "Selecionar" },
  "ro-RO": { select: "Selectare" },
  "ru-RU": { select: "Выбрать" },
  "sk-SK": { select: "Vybrať" },
  "sl-SI": { select: "Izberite" },
  "sr-SP": { select: "Izaberite" },
  "sv-SE": { select: "Markera" },
  "tr-TR": { select: "Seç" },
  "uk-UA": { select: "Вибрати" },
  "zh-CN": { select: "选择" },
  "zh-TW": { select: "選取" },
});

export type GridListFocusMode = "row" | "child";

export interface GridListItemOptions {
  key: Key;
  ref: ElementRef;
  /** @default the grid's own, from `gridList` */
  baseId?: MaybeAccessor<string>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isVirtualized?: MaybeAccessor<boolean | undefined>;
  /** @default what the grid was given */
  shouldSelectOnPressUp?: MaybeAccessor<boolean | undefined>;
  /** @default what the grid was given */
  keyboardNavigationBehavior?: MaybeAccessor<KeyboardNavigationBehavior | undefined>;
  /** @default what the grid was given */
  linkBehavior?: MaybeAccessor<LinkBehavior | undefined>;
  /**
   * Whether focus arriving on the row moves on to its first tabbable control.
   * @default "row"
   */
  focusMode?: MaybeAccessor<GridListFocusMode | undefined>;
  /**
   * Whether the arrow keys still move between rows while focus is on a
   * control inside the row, under `"tab"` navigation.
   */
  allowsArrowNavigation?: MaybeAccessor<boolean | undefined>;
  /** The row's own action, run before the grid's `onAction`. */
  onAction?: () => void;
  /** Whether `onAction` does anything. @default `onAction !== undefined` */
  hasAction?: MaybeAccessor<boolean | undefined>;
  onPressStart?: (event: PressEvent) => void;
  onPressEnd?: (event: PressEvent) => void;
  onPressUp?: (event: PressEvent) => void;
  onPress?: (event: PressEvent) => void;
  onPressChange?: (isPressed: boolean) => void;
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
  const data = gridData.get(state);
  const key = options.key;
  const manager = (): SelectionManager => state.selectionManager();
  const node = (): Node<unknown> | null => state.collection().getItem(key);
  const baseId = (): string => access(options.baseId) ?? data?.baseId() ?? "";
  const rowId = (): string => rowIdFor(baseId(), key);
  const behavior = (): KeyboardNavigationBehavior =>
    access(options.keyboardNavigationBehavior) ?? data?.keyboardNavigationBehavior() ?? "arrow";
  const focusMode = (): GridListFocusMode => access(options.focusMode) ?? "row";
  const allowsArrows = (): boolean => access(options.allowsArrowNavigation) === true;
  const ownAction = (): unknown => node()?.props?.onAction;

  const item = selectableItem({
    key,
    ref: options.ref,
    id: rowId,
    selectionManager: state.selectionManager,
    isDisabled: options.isDisabled,
    shouldSelectOnPressUp: () =>
      access(options.shouldSelectOnPressUp) === true || data?.shouldSelectOnPressUp() === true,
    linkBehavior: () => access(options.linkBehavior) ?? data?.linkBehavior() ?? "action",
    hasAction: () =>
      (access(options.hasAction) ?? options.onAction !== undefined) ||
      typeof ownAction() === "function" ||
      data?.hasAction() === true,
    onAction: () => {
      options.onAction?.();
      const own = ownAction();
      if (typeof own === "function") (own as () => void)();
      if (data?.hasAction() === true) data.onAction(key);
    },
    onPressStart: options.onPressStart,
    onPressEnd: options.onPressEnd,
    onPressUp: options.onPressUp,
    onPress: options.onPress,
    onPressChange: options.onPressChange,
  });

  const row = (): HTMLElement | null => (access(options.ref) as HTMLElement | null) ?? null;

  const lastFocusable = (element: HTMLElement): HTMLElement | null => {
    const walker = focusableWalker(element);
    walker.currentNode = element;
    return walker.last() as HTMLElement | null;
  };

  // Set when the arrow keys walk off the end of the row back onto it, which
  // is the one way onto a child-focused row that must not move on again.
  let standOnRow = false;

  /**
   * Captured, not bubbled.
   *
   * A control inside the row would otherwise see these first: a menu button
   * takes Down to open, a text field takes Left to move the caret. The row has
   * to decide before they do. Under tab navigation the control keeps them,
   * unless the row allows arrow navigation from its controls.
   */
  const onKeyDownCapture = (event: KeyboardEvent): void => {
    if (behavior() !== "arrow" && !allowsArrows()) return;
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

      const walker = focusableWalker(element);
      walker.currentNode = active;
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
        standOnRow = true;
        focusSafely(element);
        return;
      }
      const last = lastFocusable(element);
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
   * Under tab navigation a key typed into a control in the row is the
   * control's: it must not move rows, select, or start a typeahead. Tab still
   * goes up, so the list can let focus out, unless there is another control
   * in the row for the browser's own Tab to reach.
   *
   * Answers whether it stopped the event, so the row's own press does not see
   * it either: Space in a field would otherwise select the row.
   */
  const onKeyDown = (event: KeyboardEvent): boolean => {
    if (behavior() !== "tab") return false;
    const element = row();
    if (element === null || !contains(element, targetElement(event))) return false;
    const active = activeElement(ownerDocument(element));
    if (active === null) return false;

    if (targetElement(event) !== element && event.key !== "Tab") {
      event.stopPropagation();
      return true;
    }

    if (event.key === "Tab") {
      const walker = focusableWalker(element, { tabbable: true });
      walker.currentNode = active;
      const next = event.shiftKey ? walker.previousNode() : walker.nextNode();
      if (next !== null) {
        event.stopPropagation();
        return true;
      }
    }
    return false;
  };

  const focusFirstChild = (element: HTMLElement): void => {
    const walker = focusableWalker(element, { tabbable: true });
    const first = walker.nextNode() as HTMLElement | null;
    if (first === null) return;
    focusSafely(first);
    scrollIntoViewport(first, { containingElement: scrollParents(element)[0] ?? null });
  };

  const onFocusIn = (event: FocusEvent): void => {
    const element = row();
    if (element === null) return;
    if (targetElement(event) !== element) {
      // `selectableItem` only claims focus that lands on the row itself. A
      // control inside it focused by pointer makes the row the one the arrows
      // work from; from the keyboard the focused row already is.
      if (!focusIsVisible()) manager().setFocusedKey(key);
      return;
    }
    const stay = standOnRow;
    standOnRow = false;
    if (focusMode() !== "child" || stay) return;
    // A frame later, once the focus has finished arriving at the list.
    requestAnimationFrame(() => {
      if (activeElement(ownerDocument(element)) === element) focusFirstChild(element);
    });
  };

  const rowProps = mergeProps(item.itemProps, {
    role: "row",
    id: rowId,
    onKeyDownCapture,
    onFocusIn,
    "aria-label": () =>
      access(options["aria-label"]) ??
      (node()?.["aria-label"] || undefined) ??
      (node()?.textValue || undefined),
    // Only where selection is possible: on a list that only performs
    // actions the attribute would say every row is unselected rather than
    // that selection is not the point.
    "aria-selected": () => (manager().canSelectItem(key) ? item.isSelected() : undefined),
    "aria-disabled": () => item.isDisabled() || undefined,
    "aria-rowindex": () =>
      access(options.isVirtualized) === true ? rowIndexOf(state.collection(), key) : undefined,
    // Focus that the row hands on to a control must not be taken back.
    tabIndex: () => {
      if (focusMode() === "child" && allowsArrows() && behavior() === "tab") return -1;
      return access(item.itemProps.tabIndex as MaybeAccessor<number | undefined>);
    },
  });

  const pressKeyDown = rowProps.onKeyDown as ((event: KeyboardEvent) => void) | undefined;
  rowProps.onKeyDown = (event: KeyboardEvent): void => {
    if (!onKeyDown(event)) pressKeyDown?.(event);
  };

  return {
    isSelected: item.isSelected,
    isFocused: item.isFocused,
    isPressed: item.isPressed,
    isDisabled: item.isDisabled,
    allowsSelection: item.allowsSelection,
    hasAction: item.hasAction,
    gridCellProps: { role: "gridcell", "aria-colindex": 1 },
    rowProps,
  };
}

export interface GridListSelectionCheckboxOptions {
  key: Key;
}

export interface GridListSelectionCheckboxResult {
  checkboxProps: {
    id: Accessor<string>;
    "aria-label": Accessor<string>;
    "aria-labelledby": Accessor<string>;
    isSelected: Accessor<boolean>;
    isDisabled: Accessor<boolean>;
    onChange: () => void;
  };
}

/**
 * A checkbox that selects one row, named "Select" followed by the row's name.
 * It toggles whatever the selection behaviour, as a checkbox does.
 */
export function gridListSelectionCheckbox(
  options: GridListSelectionCheckboxOptions,
  state: ListState<unknown>,
): GridListSelectionCheckboxResult {
  const message = stringFormatter(strings);
  const checkboxId = id();
  const baseId = gridData.get(state)?.baseId;
  return {
    checkboxProps: {
      id: checkboxId,
      "aria-label": () => message().format("select"),
      "aria-labelledby": () => `${checkboxId()} ${rowIdFor(baseId?.() ?? "", options.key)}`,
      isSelected: () => state.selectionManager().isSelected(options.key),
      isDisabled: () => !state.selectionManager().canSelectItem(options.key),
      onChange: () => state.selectionManager().toggleSelection(options.key),
    },
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface GridListContextValue {
  state: ListState<unknown>;
  baseId: Accessor<string>;
  /** The list's item callback, which a section renders its rows with. */
  render?: ((item: unknown) => Child) | undefined;
  /** The list's drag and drop, when it was given `dragAndDropHooks`. */
  dragAndDrop?: CollectionDragAndDrop | undefined;
}

const GridListContext = createContext<GridListContextValue | null>(null);
const RowNodeContext = createContext<Node<unknown> | null>(null);

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
export function GridListProvider(props: { value: GridListContextValue; children?: Child }) {
  return provide(
    GridListContext,
    () => props.value,
    () => props.children as unknown,
  );
}

/** The collection node the row being built is for. */
export function provideRowNode(node: Node<unknown>): void {
  const owner = getOwner();
  if (owner !== null) install(owner, RowNodeContext, () => node);
}

/** What a grid list hands to its empty state. Every field follows the list. */
export interface GridListRenderState {
  isEmpty: Accessor<boolean>;
  isFocused: Accessor<boolean>;
  isFocusVisible: Accessor<boolean>;
  isDropTarget: Accessor<boolean>;
  layout: Accessor<"stack" | "grid">;
  orientation: Accessor<"horizontal" | "vertical">;
  state: ListState<unknown>;
}

export interface GridListComponentProps<T> extends StyleProps, ItemAccessors<T> {
  /** The rows, in order. An item with children is a section of rows. */
  items: Iterable<T>;
  /** How one row renders. Return a `<GridListItem>`, or a `<GridListSection>`. */
  children: (item: T) => Child;
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
  disallowTypeAhead?: boolean;
  shouldFocusWrap?: boolean;
  autoFocus?: boolean | "first" | "last";
  /** @default "arrow", and always "tab" in a grid layout */
  keyboardNavigationBehavior?: KeyboardNavigationBehavior;
  /** Whether the rows are a stack or a grid the arrows move across. @default "stack" */
  layout?: "stack" | "grid";
  /** @default "vertical" */
  orientation?: "horizontal" | "vertical";
  /** @default "clearSelection" */
  escapeKeyBehavior?: "clearSelection" | "none";
  /** Select on pointer up rather than down. */
  shouldSelectOnPressUp?: boolean;
  /** What to show when there are no rows. */
  renderEmptyState?: (grid: GridListRenderState) => Child;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  ref?: RefTarget<HTMLDivElement>;
  onSelectionChange?: (keys: "all" | Set<Key>) => void;
  onAction?: (key: Key) => void;
  /**
   * Drag and drop, from `dragAndDrop()`. A draggable row needs a
   * `<DragButton>` for keyboard and screen reader users to drag it with.
   */
  dragAndDropHooks?: DragAndDropHooks;
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
export function GridList<T>(props: GridListComponentProps<T>) {
  const domRef = makeRef<HTMLDivElement>();
  const options = fromProps(cells(props) as unknown as Incoming<Record<string, unknown>>);

  const state = listState<T>({
    ...(options as ListStateOptions<T>),
    onSelectionChange: (keys) => props.onSelectionChange?.(keys),
  });
  const anyState = state as unknown as ListState<unknown>;

  // Inside a `<Virtualizer>` the list renders a WINDOW of its collection, and
  // the layout — not the DOM — answers what is above, below and a page away.
  const virtual = useVirtualizer();
  virtual?.attach(state.collection, domRef, () => state.selectionManager().focusedKey);

  const isEmpty = (): boolean => state.collection().size === 0;
  // Whether the empty state holds a Tab stop, so the grid need not be one.
  const [emptyStateIsTabbable, setEmptyStateIsTabbable] = createSignal(false);
  if (!isServer) {
    createEffect(
      () => [isEmpty(), domRef()] as const,
      ([empty, element]) => {
        setEmptyStateIsTabbable(
          empty &&
            element !== null &&
            focusableWalker(element, { tabbable: true }).nextNode() !== null,
        );
      },
    );
  }

  const { gridProps, baseId } = gridList(
    {
      ...(options as unknown as GridListOptions),
      ref: domRef,
      onAction: (key) => props.onAction?.(key),
      hasAction: () => props.onAction !== undefined,
      emptyStateIsTabbable,
      isVirtualized: () => virtual !== null,
      layoutDelegate: virtual?.layout,
    },
    anyState,
  );

  const dragAndDrop = gridListDragAndDrop(
    props.dragAndDropHooks,
    anyState,
    domRef,
    virtual?.layout,
  );
  const render = props.children as unknown as (item: unknown) => Child;

  const value: GridListContextValue = {
    state: anyState,
    baseId,
    render,
    dragAndDrop,
  };

  const { focusProps, isFocused, isFocusVisible } = focusRing();
  const layout = (): "stack" | "grid" => props.layout ?? "stack";
  const orientation = (): "horizontal" | "vertical" => props.orientation ?? "vertical";
  const isDropTarget = (): boolean => dragAndDrop?.isRootDropTarget() === true;

  const elementProps = mergeProps(
    gridProps,
    focusProps,
    dragAndDrop?.collectionProps,
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    {
      "data-empty": isEmpty,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-layout": layout,
      "data-orientation": orientation,
      "data-virtualized": () => virtual !== null,
      "data-testid": () => props["data-testid"],
      "data-drop-target": isDropTarget,
      style: () => (virtual === null ? props.style : contentStyle(virtual.contentSize())),
    },
  );

  /** The whole collection, or the window of it the virtualiser says is on screen. */
  const rows = (): Node<T>[] => {
    if (virtual === null) return [...state.collection()];
    const collection = state.collection();
    return virtual
      .visible()
      .map((info: LayoutInfo) => collection.getItem(info.key))
      .filter((node: Node<T> | null): node is Node<T> => node !== null);
  };

  const renderState: GridListRenderState = {
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
      <div role="row" aria-rowindex={1} style={{ display: "contents" }}>
        <div role="gridcell" style={{ display: "contents" }}>
          {renderEmpty(renderState)}
        </div>
      </div>
    );
  };

  return (
    <GridListProvider value={value}>
      <div {...elementProps} ref={mergeRefs(domRef.set, props.ref)}>
        {dragAndDrop?.dropState === undefined ? null : <GridListRootDropIndicator />}
        <SharedElementTransition>
          <For each={rows}>
            {(node: Node<T>) => {
              provideRowNode(node);
              return render(node.value);
            }}
          </For>
        </SharedElementTransition>
        {emptyState}
      </div>
      {dragAndDrop?.preview}
    </GridListProvider>
  );
}

function gridListDragAndDrop(
  hooks: DragAndDropHooks | undefined,
  state: ListState<unknown>,
  domRef: Accessor<HTMLDivElement | null>,
  layoutDelegate: LayoutDelegate | undefined,
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
    // A position next to a disabled row is still a place to drop.
    keyboardDelegate: new ListKeyboardDelegate({
      collection,
      ref: domRef,
      disabledBehavior: () => "selection",
      direction,
      layoutDelegate,
    }),
    direction,
  });

  if (dragAndDrop.dropState !== undefined) {
    provideDropIndicator({ render: (props) => <GridListDropIndicator of={props} /> });
  }
  return dragAndDrop;
}

/**
 * A drop indicator in a grid list: a row, so the grid's structure holds, with
 * the focusable target a visually hidden button inside its cell.
 */
function GridListDropIndicator(indicator: { of: Incoming<DropIndicatorProps> }) {
  const props = indicator.of;
  const { dragAndDropHooks, dropState } = useDragAndDropContext();
  if (dragAndDropHooks?.dropIndicator === undefined || dropState === undefined) {
    throw new Error("A DropIndicator must be rendered inside a droppable GridList.");
  }

  const buttonRef = makeRef<HTMLDivElement>();
  const { visuallyHiddenProps } = visuallyHidden();
  const { dropIndicatorProps, isDropTarget, isHidden } = dragAndDropHooks.dropIndicator(
    { target: props.target() },
    dropState,
    buttonRef,
  );

  return (
    <Show when={!isHidden()}>
      <div
        {...styleProps(props)}
        role="row"
        data-slot={props["data-slot"]?.() ?? "drop-indicator"}
        data-drop-target={isDropTarget()}
      >
        <div role="gridcell">
          <div {...visuallyHiddenProps} role="button" {...dropIndicatorProps} ref={buttonRef.set} />
          {props.children?.()}
        </div>
      </div>
    </Show>
  );
}

/** The target for a drop on the whole list, there for keyboard and screen reader drags. */
function GridListRootDropIndicator() {
  const { dragAndDropHooks, dropState } = useDragAndDropContext();
  if (dragAndDropHooks?.dropIndicator === undefined || dropState === undefined) return null;

  const buttonRef = makeRef<HTMLDivElement>();
  const { visuallyHiddenProps } = visuallyHidden();
  const { dropIndicatorProps, isDropTarget } = dragAndDropHooks.dropIndicator(
    { target: { type: "root" } },
    dropState,
    buttonRef,
  );
  const ariaHidden = dropIndicatorProps["aria-hidden"] as Accessor<string | undefined>;

  return (
    <Show when={isDropTarget() || ariaHidden() === undefined}>
      <div
        role="row"
        aria-hidden={ariaHidden() === "true" ? true : undefined}
        style={{ position: "absolute" }}
      >
        <div role="gridcell">
          <div {...visuallyHiddenProps} role="button" {...dropIndicatorProps} ref={buttonRef.set} />
        </div>
      </div>
    </Show>
  );
}

export interface GridListItemComponentProps extends StyleProps {
  children?: Child;
  "aria-label"?: string;
  ref?: RefTarget<HTMLDivElement>;
  /** @default "row" */
  focusMode?: GridListFocusMode;
  /** Let the arrow keys move between rows from a control in the row under `"tab"` navigation. */
  allowsArrowNavigation?: boolean;
  /** Performed on this row, before the list's own `onAction`. */
  onAction?: () => void;
  onPress?: (event: PressEvent) => void;
  onPressStart?: (event: PressEvent) => void;
  onPressEnd?: (event: PressEvent) => void;
  onPressUp?: (event: PressEvent) => void;
  onPressChange?: (isPressed: boolean) => void;
  onHoverStart?: (event: HoverEvent) => void;
  onHoverEnd?: (event: HoverEvent) => void;
  onHoverChange?: (isHovered: boolean) => void;
  onFocusChange?: (isFocused: boolean) => void;
}

interface GridListRowValue {
  key: Key;
  state: ListState<unknown>;
}

const GridListRowContext = createContext<GridListRowValue | null>(null);

/**
 * One row, holding one cell.
 *
 * The cell is what the row's content goes in: a row may not contain content
 * directly, and a screen reader reports "row 2 of 7" from the pair.
 */
export function GridListItem(props: GridListItemComponentProps) {
  const domRef = makeRef<HTMLDivElement>();
  const virtual = useVirtualizer();
  const list = useGridList();
  const node = useRowNode();
  const options = fromProps(cells(props));
  const dnd = rowDragAndDrop(list, node.key);

  measureRow(virtual, node.key, domRef);

  const {
    rowProps,
    gridCellProps,
    isSelected,
    isFocused,
    isPressed,
    isDisabled,
    allowsSelection,
    hasAction,
  } = gridListItem(
    {
      key: node.key,
      ref: domRef,
      baseId: list.baseId,
      isVirtualized: () => virtual !== null,
      "aria-label": () => props["aria-label"],
      isDisabled: () => node.props?.isDisabled === true,
      focusMode: () => props.focusMode,
      allowsArrowNavigation: () => props.allowsArrowNavigation,
      onAction: () => props.onAction?.(),
      hasAction: () => props.onAction !== undefined,
      // Selecting on release lets a press that becomes a drag leave the
      // selection alone, unless only the drag button starts a drag.
      shouldSelectOnPressUp: () =>
        dnd?.collection.dragState !== undefined &&
        dnd.collection.hooks?.pointerDragSource !== "handle",
      onPress: options.onPress,
      onPressStart: options.onPressStart,
      onPressEnd: options.onPressEnd,
      onPressUp: options.onPressUp,
      onPressChange: options.onPressChange,
    },
    list.state,
  );

  const isDraggable = (): boolean =>
    dnd?.collection.dragState !== undefined && !list.state.selectionManager().isDisabled(node.key);
  const { hoverProps, isHovered } = hover({
    isDisabled: () => !allowsSelection() && !hasAction() && !isDraggable(),
    onHoverStart: options.onHoverStart,
    onHoverEnd: options.onHoverEnd,
    onHoverChange: options.onHoverChange,
  });
  const { focusProps: focusEventProps } = focused({ onFocusChange: options.onFocusChange });
  const { focusProps, isFocusVisible } = focusRing();
  const { focusProps: withinProps, isFocusVisible: isFocusVisibleWithin } = focusRing({
    within: true,
  });
  const selectionMode = (): SelectionMode => list.state.selectionManager().selectionMode;

  const elementProps = mergeProps(
    rowProps,
    hoverProps,
    focusEventProps,
    focusProps,
    withinProps,
    // The id is the one the key gives it, which a selection checkbox names.
    filterDOMProps(options, { global: true, id: false }),
    styleProps(cells(props)),
    {
      "data-selected": isSelected,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-focus-visible-within": isFocusVisibleWithin,
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-disabled": isDisabled,
      "data-selection-mode": () => (selectionMode() === "none" ? undefined : selectionMode()),
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

  const rowValue: GridListRowValue = { key: node.key, state: list.state };

  const row = (
    <div {...elementProps} ref={mergeRefs(domRef.set, props.ref)}>
      <div {...gridCellProps}>
        <SelectionIndicatorProvider isSelected={isSelected()}>
          {provide(
            GridListRowContext,
            () => rowValue,
            () => props.children as unknown,
          )}
        </SelectionIndicatorProvider>
      </div>
    </div>
  );
  if (dnd === null) return row;

  const { visuallyHiddenProps } = visuallyHidden();
  const on = dnd.on;

  return (
    <>
      <Show when={dnd.collection.shouldRenderIndicator(dnd.before)}>
        {dnd.collection.renderDropIndicator(dnd.before)}
      </Show>
      {on === null ? null : (
        <Show when={!on.indicator.isHidden()}>
          <div role="row" style={{ position: "absolute" }}>
            <div role="gridcell">
              <div
                role="button"
                {...visuallyHiddenProps}
                {...on.indicator.dropIndicatorProps}
                ref={on.ref.set}
              />
            </div>
          </div>
        </Show>
      )}
      {row}
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

export interface GridListSelectionCheckboxProps extends StyleProps {
  /** What is drawn inside the checkbox. */
  children?: Child;
}

/**
 * A checkbox that selects its row, named "Select" followed by the row's name.
 *
 * A press on it is the checkbox's, not the row's, so under `"replace"`
 * selection it adds to the selection rather than replacing it.
 */
export function GridListSelectionCheckbox(props: GridListSelectionCheckboxProps) {
  const row = getContext(GridListRowContext);
  if (row === null || row === undefined) {
    throw new Error("A GridListSelectionCheckbox must be rendered inside a GridListItem.");
  }
  const { checkboxProps: box } = gridListSelectionCheckbox({ key: row.key }, row.state);
  return (
    <Checkbox
      id={box.id()}
      aria-label={box["aria-label"]()}
      aria-labelledby={box["aria-labelledby"]()}
      isSelected={box.isSelected()}
      isDisabled={box.isDisabled()}
      onChange={() => box.onChange()}
      class={props.class}
      style={props.style}
    >
      {props.children}
    </Checkbox>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

interface GridListSectionValue {
  headingId: Accessor<string>;
  registerHeader(): () => void;
}

const GridListSectionContext = createContext<GridListSectionValue | null>(null);

export interface GridListSectionProps extends StyleProps {
  /** A `<GridListHeader>`. The section's rows are rendered after it. */
  children?: Child;
  "aria-label"?: string;
  ref?: RefTarget<HTMLDivElement>;
}

/**
 * A group of rows, named by its `<GridListHeader>` or its `aria-label`.
 *
 * Rendered from the list's item callback for an item with children, like any
 * other row; its rows are built by the same callback. The keyboard moves
 * across sections as though they were one list and never stops on a header.
 */
export function GridListSection(props: GridListSectionProps) {
  const list = useGridList();
  const node = useRowNode();
  const render = list.render;
  if (render === undefined) {
    throw new Error("A GridListSection must be rendered inside a GridList's item callback.");
  }
  const headingId = id();
  // Written by a header from its own component body, when it mounts.
  const [headers, setHeaders] = createSignal(0, { ownedWrite: true });
  const section: GridListSectionValue = {
    headingId,
    registerHeader: () => {
      setHeaders((count) => count + 1);
      return () => setHeaders((count) => count - 1);
    },
  };
  const children = createMemo(() => list.state.collection().getItem(node.key)?.childNodes ?? []);

  const elementProps = mergeProps(
    filterDOMProps(fromProps(cells(props)), { global: true, id: false }),
    styleProps(cells(props)),
    {
      role: "rowgroup",
      "aria-label": () => props["aria-label"],
      "aria-labelledby": () =>
        props["aria-label"] === undefined && headers() > 0 ? headingId() : undefined,
    },
  );

  return (
    <div {...elementProps} ref={mergeRefs(props.ref)}>
      {provide(
        GridListSectionContext,
        () => section,
        () => (
          <>
            {props.children}
            <For each={children}>
              {(child: Node<unknown>) => {
                provideRowNode(child);
                return render(child.value);
              }}
            </For>
          </>
        ),
      )}
    </div>
  );
}

export interface GridListHeaderProps extends StyleProps {
  children?: Child;
  ref?: RefTarget<HTMLDivElement>;
}

/** The header row of a {@link GridListSection}. Not focusable: it names the group. */
export function GridListHeader(props: GridListHeaderProps) {
  const section = getContext(GridListSectionContext);
  if (section === null || section === undefined) {
    throw new Error("A GridListHeader must be rendered inside a GridListSection.");
  }
  onCleanup(section.registerHeader());
  const elementProps = mergeProps(
    filterDOMProps(fromProps(cells(props)), { global: true, id: false }),
    styleProps(cells(props)),
    { role: "row" },
  );
  return (
    <div {...elementProps} ref={mergeRefs(props.ref)}>
      <div role="rowheader" id={section.headingId()}>
        {props.children}
      </div>
    </div>
  );
}

interface RowDragAndDrop {
  collection: CollectionDragAndDrop;
  itemProps: DOMProps;
  before: ItemDropTarget;
  after: Accessor<ItemDropTarget[]>;
  /** The target for a drop ON the row, focusable apart from the row's own controls. */
  on: {
    indicator: ReturnType<NonNullable<DragAndDropHooks["dropIndicator"]>>;
    ref: ReturnType<typeof makeRef<HTMLDivElement>>;
  } | null;
}

/**
 * A row's part in its list's drag and drop. A row holds controls, so Enter on
 * it is not free to start a drag: a `<DragButton>` inside it does that.
 */
function rowDragAndDrop(list: GridListContextValue, key: Key): RowDragAndDrop | null {
  const collection = list.dragAndDrop;
  if (collection === undefined) return null;
  const { hooks, dragState, dropState } = collection;

  const draggable =
    dragState === undefined || hooks?.draggableItem === undefined
      ? null
      : hooks.draggableItem({ key, hasDragButton: true }, dragState);
  const dragButtonRef = makeRef<Element>();
  const slot = draggableItemSlotProps(draggable, hooks, dragButtonRef, dragButtonRef.set);
  if (draggable !== null) provideDragButton(slot.dragButton);

  let on: RowDragAndDrop["on"] = null;
  if (dropState !== undefined && hooks?.dropIndicator !== undefined) {
    const ref = makeRef<HTMLDivElement>();
    on = {
      ref,
      indicator: hooks.dropIndicator(
        { target: { type: "item", key, dropPosition: "on" } },
        dropState,
        ref,
      ),
    };
  }
  const onTarget = on;

  const after = createMemo(() => {
    const items = list.state.collection();
    const node = items.getItem(key);
    return node === null ? [] : afterDropIndicatorTargets(items, node);
  });

  return {
    collection,
    on,
    before: { type: "item", key, dropPosition: "before" },
    after,
    itemProps: mergeProps(slot.itemProps, {
      "data-allows-dragging": () => dragState !== undefined,
      "data-dragging": () => dragState?.isDragging(key) === true,
      "data-drop-target": () => onTarget?.indicator.isDropTarget() === true,
    }),
  };
}
