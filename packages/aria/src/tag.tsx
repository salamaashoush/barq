/**
 * A tag group: removable labels, keywords or filters.
 *
 * A grid, not a list, for the same reason a grid list is: a tag holds a remove
 * button, and an `option` may not contain anything interactive. So each tag is
 * a row with one cell, the arrows move between them HORIZONTALLY, and Delete
 * or Backspace removes.
 *
 * Two things only a tag group needs:
 *
 * - **Removing the last tag focuses the group.** Otherwise focus falls to the
 *   body and a keyboard user is thrown back to the top of the page by an
 *   action they took deliberately.
 * - **The group is a live region while it has focus, and silent otherwise.**
 *   A tag disappearing under your hands is worth announcing; a filter panel
 *   updating five groups on the other side of the page is not, and
 *   `aria-relevant="additions"` keeps the removals from being read twice —
 *   once by the button and once by the region.
 */

import {
  type Accessor,
  type Child,
  For,
  computed,
  context,
  effect,
  getContext,
  getOwner,
  type Incoming,
  install,
  isServer,
  provide,
} from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { button } from "./button.tsx";
import type { ItemAccessors, Key, ListStateOptions, Node, SelectionMode } from "./collections.ts";
import { listState, type ListState } from "./collections.ts";
import { focusRing } from "./focus.ts";
import { useLocale } from "./i18n.ts";
import { focusWithin } from "./interactions/focus-events.ts";
import { hover } from "./interactions/hover.ts";
import type { ElementRef } from "./interactions/press.ts";
import { field, type FieldOptions } from "./label.ts";
import {
  ListKeyboardDelegate,
  selectableItem,
  selectableList,
  type KeyboardDelegate,
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
// The group
// ---------------------------------------------------------------------------

export interface TagGroupOptions extends FieldOptions {
  ref: ElementRef;
  keyboardDelegate?: KeyboardDelegate;
  disallowEmptySelection?: MaybeAccessor<boolean | undefined>;
  escapeKeyBehavior?: MaybeAccessor<"clearSelection" | "none" | undefined>;
  onRemove?: (keys: Set<Key>) => void;
}

export interface TagGroupResult {
  gridProps: DOMProps;
  labelProps: DOMProps;
  descriptionProps: DOMProps;
  errorMessageProps: DOMProps;
  baseId: Accessor<string>;
}

export function tagGroup(options: TagGroupOptions, state: ListState<unknown>): TagGroupResult {
  const baseId = id();
  const locale = useLocale();

  const delegate =
    options.keyboardDelegate ??
    new ListKeyboardDelegate({
      collection: state.collection,
      ref: options.ref,
      // Tags flow across, so the arrows that move between them are the
      // horizontal ones.
      orientation: "horizontal",
      direction: () => locale().direction,
      disabledKeys: state.disabledKeys,
      disabledBehavior: () => state.selectionManager().disabledBehavior,
    });

  const { labelProps, fieldProps, descriptionProps, errorMessageProps } = field({
    ...options,
    labelElementType: "span",
  });

  const { listProps } = selectableList({
    ...options,
    ref: options.ref,
    selectionManager: state.selectionManager,
    collection: state.collection,
    disabledKeys: state.disabledKeys,
    keyboardDelegate: delegate,
    shouldFocusWrap: true,
    linkBehavior: "override",
  });

  const { focusWithinProps, isFocusWithin } = focusWithin({});

  if (!isServer) {
    // Removing the LAST tag leaves nowhere inside to stand.
    let previous = state.collection().size;
    effect(() => {
      const size = state.collection().size;
      const element = access(options.ref) as HTMLElement | null;
      if (previous > 0 && size === 0 && isFocusWithin() && element !== null) element.focus();
      previous = size;
    });
  }

  const isEmpty = (): boolean => state.collection().size === 0;

  return {
    baseId,
    labelProps,
    descriptionProps,
    errorMessageProps,
    gridProps: mergeProps(
      filterDOMProps(options, { labelable: true }),
      listProps,
      fieldProps,
      focusWithinProps,
      {
        // An empty group is a group: `role="grid"` with no rows is a grid a
        // screen reader reports as broken.
        role: () => (isEmpty() ? "group" : "grid"),
        id: baseId,
        "aria-atomic": false,
        "aria-relevant": "additions",
        // Only while the user is IN it. A filter panel rebuilding five groups
        // elsewhere on the page is not something to read out.
        "aria-live": () => (isFocusWithin() ? "polite" : "off"),
      },
    ),
  };
}

/** The id a tag renders under, derived from the key so anything can name it. */
export function tagIdFor(baseId: string, key: Key): string {
  return `${baseId}-tag-${String(key)}`;
}

// ---------------------------------------------------------------------------
// A tag
// ---------------------------------------------------------------------------

export interface TagOptions {
  key: Key;
  ref: ElementRef;
  baseId: MaybeAccessor<string>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  onRemove?: (keys: Set<Key>) => void;
}

export interface TagResult {
  rowProps: DOMProps;
  gridCellProps: DOMProps;
  /** Options for {@link button}, not props for an element. */
  removeButtonProps: DOMProps;
  allowsRemoving: Accessor<boolean>;
  isSelected: Accessor<boolean>;
  isFocused: Accessor<boolean>;
  isPressed: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
}

export function tag(options: TagOptions, state: ListState<unknown>): TagResult {
  const buttonId = id();
  const rowId = (): string => tagIdFor(access(options.baseId), options.key);
  const node = (): Node<unknown> | null => state.collection().getItem(options.key);

  const item = selectableItem({
    key: options.key,
    ref: options.ref,
    id: rowId,
    selectionManager: state.selectionManager,
    isDisabled: options.isDisabled,
    linkBehavior: "override",
  });

  const allowsRemoving = (): boolean => options.onRemove !== undefined;

  const remove = (): void => {
    if (item.isDisabled()) return;
    // Removing one of SEVERAL selected tags removes them all: the selection is
    // what the user pointed at, and taking one out of it would be a surprise.
    const manager = state.selectionManager();
    if (manager.isSelected(options.key)) {
      options.onRemove?.(new Set(manager.selectedKeys));
      return;
    }
    options.onRemove?.(new Set([options.key]));
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!allowsRemoving() || item.isDisabled()) return;
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    event.preventDefault();
    remove();
  };

  return {
    allowsRemoving,
    isSelected: item.isSelected,
    isFocused: item.isFocused,
    isPressed: item.isPressed,
    isDisabled: item.isDisabled,
    gridCellProps: { role: "gridcell" },
    rowProps: mergeProps(item.itemProps, {
      role: "row",
      id: rowId,
      onKeyDown,
      "aria-label": () => node()?.["aria-label"] ?? node()?.textValue ?? undefined,
      "aria-selected": () =>
        state.selectionManager().canSelectItem(options.key) ? item.isSelected() : undefined,
      "aria-disabled": () => item.isDisabled() || undefined,
    }),
    removeButtonProps: {
      id: buttonId,
      // Named by itself AND by the tag, so it is announced as "Remove,
      // Barcelona" rather than as one of a row of identical Remove buttons.
      "aria-label": "Remove",
      "aria-labelledby": () => `${buttonId()} ${rowId()}`,
      isDisabled: item.isDisabled,
      excludeFromTabOrder: true,
      onPress: remove,
    },
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface TagGroupContextValue {
  state: ListState<unknown>;
  baseId: Accessor<string>;
  onRemove: Accessor<((keys: Set<Key>) => void) | undefined>;
}

const TagGroupContext = context<TagGroupContextValue | null>(null);
const TagNodeContext = context<Node<unknown> | null>(null);

export function useTagGroup(): TagGroupContextValue {
  const value = getContext(TagGroupContext);
  if (value === null || value === undefined) {
    throw new Error("A Tag must be rendered inside a TagGroup.");
  }
  return value;
}

/** The collection node the tag being built is for. */
export function useTagNode(): Node<unknown> {
  const node = getContext(TagNodeContext);
  if (node === null || node === undefined) {
    throw new Error("A Tag must be rendered inside a TagGroup's item callback.");
  }
  return node;
}

function TagGroupProvider(props: Incoming<{ value: TagGroupContextValue; children?: Child }>) {
  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;
  return provide(
    owner,
    TagGroupContext,
    () => props.value(),
    () => props.children as unknown,
  ) as never;
}

export interface TagGroupComponentProps<T> extends StyleProps, ItemAccessors<T> {
  /** The tags, in order. */
  items: Iterable<T>;
  /** How one tag renders. Return a `<Tag>`. */
  children: (item: T) => Child;
  label?: Child;
  description?: Child;
  errorMessage?: Child;
  /** @default "none" */
  selectionMode?: SelectionMode;
  selectedKeys?: "all" | Iterable<Key>;
  defaultSelectedKeys?: "all" | Iterable<Key>;
  disabledKeys?: Iterable<Key>;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  ref?: RefTarget<HTMLDivElement>;
  onSelectionChange?: (keys: "all" | Set<Key>) => void;
  /** Without it the tags have no remove button and cannot be deleted. */
  onRemove?: (keys: Set<Key>) => void;
}

/**
 * ```tsx
 * <TagGroup label="Filters" items={filters()} onRemove={(keys) => drop(keys)}>
 *   {(filter) => <Tag>{filter.name}</Tag>}
 * </TagGroup>
 * ```
 */
export function TagGroup<T>(props: Incoming<TagGroupComponentProps<T>>) {
  const domRef = makeRef<HTMLDivElement>();
  const options = fromProps(props as unknown as Incoming<Record<string, unknown>>);

  const state = listState<T>({
    ...(options as ListStateOptions<T>),
    onSelectionChange: (keys) => props.onSelectionChange?.()?.(keys),
  });

  const { gridProps, labelProps, descriptionProps, errorMessageProps, baseId } = tagGroup(
    {
      ...(options as unknown as TagGroupOptions),
      ref: domRef,
      onRemove: props.onRemove?.() === undefined ? undefined : (keys) => props.onRemove?.()?.(keys),
    },
    state,
  );

  const value: TagGroupContextValue = {
    state: state,
    baseId,
    onRemove: () => props.onRemove?.(),
  };

  const elementProps = mergeProps(
    gridProps,
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      "data-empty": () => state.collection().size === 0,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  const render = props.children as unknown as (scope: unknown, item: T) => Child;

  return (
    <TagGroupProvider value={value}>
      <span {...labelProps}>{props.label}</span>
      <div {...elementProps} ref={mergeRefs(domRef.set, props.ref?.())}>
        <For each={() => [...state.collection()]}>
          {(node: Node<T>) => {
            const rowOwner = getOwner();
            if (rowOwner !== null) install(rowOwner, TagNodeContext, () => node as Node<unknown>);
            return render(rowOwner, node.value as T);
          }}
        </For>
      </div>
      <span {...descriptionProps}>{props.description}</span>
      <span {...errorMessageProps}>{props.errorMessage}</span>
    </TagGroupProvider>
  );
}

export interface TagComponentProps extends StyleProps {
  children?: Child;
  "aria-label"?: string;
  ref?: RefTarget<HTMLDivElement>;
}

/**
 * One tag, with a remove button when the group takes removals.
 *
 * The button is out of the Tab order: the tag itself is the stop, and Delete
 * on it does the same thing. A second stop per tag would double the length of
 * every filter bar.
 */
export function Tag(props: Incoming<TagComponentProps>) {
  const domRef = makeRef<HTMLDivElement>();
  const buttonRef = makeRef<HTMLButtonElement>();
  const group = useTagGroup();
  const node = useTagNode();

  const {
    rowProps,
    gridCellProps,
    removeButtonProps,
    allowsRemoving,
    isSelected,
    isFocused,
    isPressed,
    isDisabled,
  } = tag(
    {
      key: node.key,
      ref: domRef,
      baseId: group.baseId,
      isDisabled: () => node.props?.isDisabled === true,
      onRemove: group.onRemove() === undefined ? undefined : (keys) => group.onRemove()?.(keys),
    },
    group.state,
  );

  const { buttonProps } = button(removeButtonProps, buttonRef);
  const { hoverProps, isHovered } = hover({ isDisabled });
  const { focusProps, isFocusVisible } = focusRing();

  const elementProps = mergeProps(
    rowProps,
    hoverProps,
    focusProps,
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      "aria-label": () => props["aria-label"]?.(),
      "data-selected": isSelected,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-disabled": isDisabled,
      "data-removable": allowsRemoving,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  const removeProps = computed(() =>
    mergeProps(buttonProps, { id: removeButtonProps.id, type: "button" }),
  );

  return (
    <div {...elementProps} ref={mergeRefs(domRef.set, props.ref?.())}>
      <div {...gridCellProps}>
        {props.children}
        {() =>
          allowsRemoving() ? (
            <button {...removeProps()} ref={buttonRef.set}>
              <span aria-hidden="true">×</span>
            </button>
          ) : null
        }
      </div>
    </div>
  );
}
