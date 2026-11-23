/**
 * An action group: a row of related buttons that is one control.
 *
 * What the group IS to assistive technology depends on what pressing does,
 * which is why its role is not fixed:
 *
 * - With no selection the items are plain buttons that act, and the group is a
 *   `toolbar`.
 * - With `selectionMode="single"` exactly one item reads as chosen, and the
 *   group is a `radiogroup` of `radio`s.
 * - With `selectionMode="multiple"` each item is on or off: a `toolbar` of
 *   `checkbox`es.
 *
 * Inside a real toolbar a `toolbar` group says `group` instead, and leaves the
 * arrows along the toolbar's axis to the toolbar: those cross from one group to
 * the next. The other two arrows stay the group's, and wrap.
 *
 * The Tab order follows React Spectrum. Until an item has had focus every item
 * is a stop, so Tab enters at the near end from either direction; once one
 * has, it is the only stop, and Tab back into the group returns to it. The
 * arrows move between items in both directions on both axes, Left and Right
 * flipping in a right-to-left locale, skipping disabled items.
 *
 * `overflowMode="collapse"` is behaviour rather than styling, so it is here:
 * the items that do not fit move into a menu behind a "More items" button, and
 * that changes the accessibility tree, the Tab order and how an item is
 * chosen. The space measured is the wrapper element's, which fills its parent;
 * with selection, a group that does not fit collapses entirely, so one choice
 * is never split between buttons and a menu.
 */

import {
  type Accessor,
  cells,
  type Child,
  createContext,
  createEffect,
  createSignal,
  For,
  getContext,
  getOwner,
  install,
  provide,
  Show,
  untrack,
} from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { resizeObserver } from "@barqjs/primitives/observers";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { button } from "./button.tsx";
import {
  type ItemAccessors,
  type Key,
  listState,
  type ListState,
  type Node,
  type SelectionMode,
  type SelectionValue,
} from "./collections.ts";
import { contains, targetElement } from "./dom.ts";
import { createFocusManager, focusRing } from "./focus.ts";
import { StringDictionary, stringFormatter, useLocale } from "./i18n.ts";
import { hover } from "./interactions/hover.ts";
import type { ElementRef, PressEvent } from "./interactions/press.ts";
import { Menu, MenuItem, MenuTrigger, useMenuTrigger } from "./menu.tsx";
import type { Orientation } from "./selection.ts";
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
  triggerSlot,
} from "./utils.ts";

const actionGroupStrings = new StringDictionary<"more">({
  "ar-AE": { more: "المزيد من العناصر" },
  "bg-BG": { more: "Още елементи" },
  "cs-CZ": { more: "Další položky" },
  "da-DK": { more: "Flere elementer" },
  "de-DE": { more: "Weitere Elemente" },
  "el-GR": { more: "Περισσότερα στοιχεία" },
  "en-US": { more: "More items" },
  "es-ES": { more: "Más elementos" },
  "et-EE": { more: "Veel üksusi" },
  "fi-FI": { more: "Lisää kohteita" },
  "fr-FR": { more: "Autres éléments" },
  "he-IL": { more: "פריטים נוספים" },
  "hr-HR": { more: "Više stavki" },
  "hu-HU": { more: "További elemek" },
  "it-IT": { more: "Altri elementi" },
  "ja-JP": { more: "その他の項目" },
  "ko-KR": { more: "기타 항목" },
  "lt-LT": { more: "Daugiau elementų" },
  "lv-LV": { more: "Vairāk vienumu" },
  "nb-NO": { more: "Flere elementer" },
  "nl-NL": { more: "Meer items" },
  "pl-PL": { more: "Więcej elementów" },
  "pt-BR": { more: "Mais itens" },
  "pt-PT": { more: "Mais artigos" },
  "ro-RO": { more: "Mai multe articole" },
  "ru-RU": { more: "Дополнительные элементы" },
  "sk-SK": { more: "Viac položiek" },
  "sl-SI": { more: "Več elementov" },
  "sr-SP": { more: "Više stavki" },
  "sv-SE": { more: "Fler objekt" },
  "tr-TR": { more: "Daha fazla öğe" },
  "uk-UA": { more: "Більше елементів" },
  "zh-CN": { more: "更多项目" },
  "zh-TW": { more: "更多項目" },
});

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

const GROUP_ROLES: Record<SelectionMode, string> = {
  none: "toolbar",
  single: "radiogroup",
  multiple: "toolbar",
};

const ITEM_ROLES: Record<SelectionMode, string | undefined> = {
  none: undefined,
  single: "radio",
  multiple: "checkbox",
};

export interface ActionGroupOptions {
  /** The group's element. */
  ref: ElementRef;
  /** @default "horizontal" */
  orientation?: MaybeAccessor<Orientation | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  id?: MaybeAccessor<string | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
  "aria-describedby"?: MaybeAccessor<string | undefined>;
  "aria-details"?: MaybeAccessor<string | undefined>;
}

export interface ActionGroupResult {
  actionGroupProps: DOMProps;
  /** Disabled as a whole: told so, or with every item disabled. */
  isDisabled: Accessor<boolean>;
}

/**
 * The group's element: its role, its name, and the arrows.
 *
 * ```tsx
 * const state = listState({ items: () => tools, selectionMode: "single" });
 * const { actionGroupProps } = actionGroup({ ref: domRef, "aria-label": "Tools" }, state);
 * <div {...actionGroupProps} ref={domRef.set}>…</div>
 * ```
 */
export function actionGroup(
  options: ActionGroupOptions,
  state: ListState<unknown>,
): ActionGroupResult {
  const locale = useLocale();
  const manager = createFocusManager(options.ref);
  const [toolbarAxis, setToolbarAxis] = createSignal<Orientation | null>(null);

  if (!isServer) {
    createEffect(
      () => access(options.ref),
      (element) => {
        const outer = element?.parentElement?.closest('[role="toolbar"]') ?? null;
        setToolbarAxis(
          outer === null
            ? null
            : outer.getAttribute("aria-orientation") === "vertical"
              ? "vertical"
              : "horizontal",
        );
      },
    );
  }

  const orientation = (): Orientation => access(options.orientation) ?? "horizontal";
  const selectionMode = (): SelectionMode => state.selectionManager().selectionMode;
  const isDisabled = (): boolean => {
    if (access(options.isDisabled) === true) return true;
    const disabled = state.selectionManager();
    for (const key of state.collection().getKeys()) {
      if (!disabled.isDisabled(key)) return false;
    }
    return true;
  };
  const role = (): string => {
    const own = GROUP_ROLES[selectionMode()];
    return own === "toolbar" && toolbarAxis() !== null ? "group" : own;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    // A key from a menu the group opened is not the group's.
    if (!contains(event.currentTarget as Element, targetElement(event))) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    const axis = toolbarAxis();
    const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
    const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
    if (!horizontal && !vertical) return;
    // The toolbar around the group moves between groups along its own axis.
    if ((axis === "horizontal" && horizontal) || (axis === "vertical" && vertical)) return;

    // Left and Right follow the writing direction; Up and Down never do.
    const rtl = locale().direction === "rtl";
    const forward =
      event.key === "ArrowDown" ||
      (event.key === "ArrowRight" && !rtl) ||
      (event.key === "ArrowLeft" && rtl);
    if (forward) manager.focusNext({ wrap: true });
    else manager.focusPrevious({ wrap: true });
    // Held down, the key repeats and focus keeps moving, as upstream allows.
    event.preventDefault();
    event.stopPropagation();
  };

  return {
    isDisabled,
    actionGroupProps: mergeProps(filterDOMProps(options, { labelable: true }), {
      role,
      "aria-orientation": () => (role() === "toolbar" ? orientation() : undefined),
      "aria-disabled": () => isDisabled() || undefined,
      onKeyDown,
    }),
  };
}

export interface ActionGroupItemOptions {
  key: Key;
}

export interface ActionGroupItemResult {
  /** For the item's element: its role, its checked state, and its place in the Tab order. */
  itemProps: DOMProps;
  /** For {@link button}: what pressing the item does to the selection. */
  onPress: (event: PressEvent) => void;
  isSelected: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
}

/**
 * One item's half: what makes a button a member of the group.
 *
 * ```tsx
 * const item = actionGroupItem({ key: "bold" }, state);
 * const { buttonProps } = button({ onPress: item.onPress, isDisabled: item.isDisabled }, domRef);
 * <button {...mergeProps(buttonProps, item.itemProps)} ref={domRef.set}>Bold</button>
 * ```
 */
export function actionGroupItem(
  options: ActionGroupItemOptions,
  state: ListState<unknown>,
): ActionGroupItemResult {
  const { key } = options;
  const mode = (): SelectionMode => state.selectionManager().selectionMode;
  const isSelected = (): boolean => state.selectionManager().isSelected(key);

  return {
    isSelected,
    isDisabled: () => state.selectionManager().isDisabled(key),
    onPress: () => state.selectionManager().select(key),
    itemProps: {
      role: () => ITEM_ROLES[mode()],
      "aria-checked": () => (mode() === "none" ? undefined : String(isSelected())),
      tabIndex: () => {
        const focused = state.selectionManager().focusedKey;
        return focused === null || focused === key ? 0 : -1;
      },
      onFocus: () => state.selectionManager().setFocusedKey(key),
    },
  };
}

// ---------------------------------------------------------------------------
// Overflow
// ---------------------------------------------------------------------------

function outerSize(element: HTMLElement, horizontal: boolean, first: boolean, last: boolean) {
  const style = window.getComputedStyle(element);
  const box = element.getBoundingClientRect();
  const margin = (value: string): number => {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  if (horizontal) {
    return (
      box.width + (first ? 0 : margin(style.marginLeft)) + (last ? 0 : margin(style.marginRight))
    );
  }
  return (
    box.height + (first ? 0 : margin(style.marginTop)) + (last ? 0 : margin(style.marginBottom))
  );
}

interface OverflowOptions {
  wrapperRef: ElementRef;
  groupRef: ElementRef;
  isCollapsing: Accessor<boolean>;
  orientation: Accessor<Orientation>;
  state: ListState<unknown>;
}

/**
 * How many items fit, measured the way React Spectrum measures them: show
 * everything, count what fits in the wrapper, and if that leaves a menu, count
 * again with the menu button in place, since it takes room of its own.
 */
function overflow(options: OverflowOptions): {
  visible: Accessor<number>;
  isMeasuring: Accessor<boolean>;
} {
  const [visible, setVisible] = createSignal(Number.POSITIVE_INFINITY);
  const [phase, setPhase] = createSignal<"idle" | "measure" | "verify">("idle");
  const size = (): number => options.state.collection().size;
  const mode = (): SelectionMode => options.state.selectionManager().selectionMode;

  const fits = (showing: number): number => {
    const group = access(options.groupRef) as HTMLElement | null | undefined;
    const wrapper = access(options.wrapperRef) as HTMLElement | null | undefined;
    if (group === null || group === undefined || wrapper === null || wrapper === undefined) {
      return showing;
    }
    const horizontal = options.orientation() === "horizontal";
    const room = horizontal
      ? wrapper.getBoundingClientRect().width
      : wrapper.getBoundingClientRect().height;
    const children = [...group.children] as HTMLElement[];
    let used = 0;
    let count = 0;
    if (showing < size()) {
      const menu = children.pop();
      if (menu !== undefined) used += outerSize(menu, horizontal, false, true);
    }
    for (const [index, child] of children.entries()) {
      used += outerSize(child, horizontal, index === 0, index === children.length - 1);
      if (Math.round(used) > Math.round(room)) break;
      count++;
    }
    // A choice split between buttons and a menu is two controls for one value.
    if (mode() !== "none" && count < size()) return 0;
    return count;
  };

  const measure = (): void => {
    // Spectrum does not collapse a vertical group with selection, and neither
    // does this: a column of choices collapsing to one button loses its shape.
    if (!options.isCollapsing() || (options.orientation() === "vertical" && mode() !== "none")) {
      setPhase("idle");
      setVisible(Number.POSITIVE_INFINITY);
      return;
    }
    setVisible(Number.POSITIVE_INFINITY);
    setPhase("measure");
  };

  if (!isServer) {
    createEffect(
      () => [options.state.collection(), options.isCollapsing(), options.orientation(), mode()],
      () => untrack(measure),
    );

    // The parent, not the group: a group squeezed by its siblings does not
    // shrink by itself when the space around it does.
    resizeObserver(
      () => (access(options.wrapperRef) as HTMLElement | null | undefined)?.parentElement,
      () => measure(),
    );

    // After the render each phase asked for, so the DOM measured is the one
    // that phase described.
    createEffect(
      () => [phase(), visible()] as const,
      ([current, showing]) => {
        if (current === "measure") {
          const count = untrack(() => fits(size()));
          const again = count < untrack(size) && count > 0;
          setVisible(count);
          setPhase(again ? "verify" : "idle");
        } else if (current === "verify") {
          setVisible(untrack(() => fits(showing)));
          setPhase("idle");
        }
      },
    );
  }

  return { visible, isMeasuring: () => phase() !== "idle" };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface ActionGroupContextValue {
  state: ListState<unknown>;
  isDisabled: Accessor<boolean>;
  onAction: (key: Key, value: unknown) => void;
}

const ActionGroupContext = createContext<ActionGroupContextValue | null>(null);
const ActionGroupNodeContext = createContext<Node<unknown> | null>(null);
/** Set inside the overflow menu, where an item is a menu item. */
const OverflowMenuContext = createContext<boolean>(false);

/** The enclosing {@link ActionGroup}'s state, for an item of the caller's own. */
export function useActionGroup(): ListState<unknown> | null {
  return getContext(ActionGroupContext)?.state ?? null;
}

export interface ActionGroupComponentProps<T> extends StyleProps, ItemAccessors<T> {
  /** The actions, in order. */
  items: Iterable<T>;
  /** How one renders. Return an `<ActionGroupItem>`. */
  children: (item: T) => Child;
  /** @default "none" */
  selectionMode?: SelectionMode;
  selectedKeys?: "all" | Iterable<Key>;
  defaultSelectedKeys?: "all" | Iterable<Key>;
  disallowEmptySelection?: boolean;
  disabledKeys?: Iterable<Key>;
  isDisabled?: boolean;
  /** @default "horizontal" */
  orientation?: Orientation;
  /**
   * What happens to items that do not fit: they wrap, as the stylesheet lays
   * them out, or they move into a menu. @default "wrap"
   */
  overflowMode?: "wrap" | "collapse";
  /** Shown in the menu button of a collapsed group with selection. */
  summaryIcon?: Child;
  /** The menu button's own content. @default an ellipsis */
  moreIcon?: Child;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-details"?: string;
  ref?: RefTarget<HTMLDivElement>;
  /** Called with the pressed item's key, and the value it was built from. */
  onAction?: (key: Key, value: T) => void;
  onSelectionChange?: (keys: SelectionValue) => void;
}

/**
 * ```tsx
 * <ActionGroup aria-label="Text" items={tools} onAction={(key) => run(key)}>
 *   {(tool) => <ActionGroupItem>{tool.name}</ActionGroupItem>}
 * </ActionGroup>
 * ```
 *
 * Renders a wrapper `<div>` around the group's own: the wrapper fills the
 * space a collapsing group has to fit in, and is what gets measured. `class`,
 * `style` and everything else written on the component go on the group.
 */
export function ActionGroup<T>(props: ActionGroupComponentProps<T>) {
  const wrapperRef = makeRef<HTMLDivElement>();
  const groupRef = makeRef<HTMLDivElement>();
  const options = fromProps(cells(props));

  const state = listState<T>({
    // The item accessors arrive as Cells around the callbacks, which is what
    // `buildCollection` unwraps.
    ...(options as unknown as ItemAccessors<T>),
    items: () => props.items,
    selectionMode: () => props.selectionMode,
    selectedKeys: () => props.selectedKeys,
    defaultSelectedKeys: () => props.defaultSelectedKeys,
    disallowEmptySelection: () => props.disallowEmptySelection,
    disabledKeys: () => props.disabledKeys,
    onSelectionChange: (keys) => props.onSelectionChange?.(keys),
  }) as unknown as ListState<unknown>;

  const orientation = (): Orientation => props.orientation ?? "horizontal";
  const { actionGroupProps, isDisabled } = actionGroup(
    {
      ref: groupRef,
      orientation,
      isDisabled: () => props.isDisabled,
      "aria-label": () => props["aria-label"],
      "aria-labelledby": () => props["aria-labelledby"],
      "aria-describedby": () => props["aria-describedby"],
      "aria-details": () => props["aria-details"],
    },
    state,
  );

  const { visible, isMeasuring } = overflow({
    wrapperRef,
    groupRef,
    isCollapsing: () => props.overflowMode === "collapse",
    orientation,
    state,
  });

  const nodes = (): Node<unknown>[] => [...state.collection()];
  const shown = (): Node<unknown>[] => nodes().slice(0, visible());
  const hidden = (): Node<unknown>[] => nodes().slice(visible());
  // Everything in the menu: the group itself has nothing left to name.
  const onlyMenu = (): boolean => hidden().length > 0 && shown().length === 0;

  const value: ActionGroupContextValue = {
    state,
    isDisabled: () => props.isDisabled === true,
    onAction: (key, item) => props.onAction?.(key, item as T),
  };

  const groupProps = mergeProps(
    filterDOMProps(options, { global: true }),
    styleProps(cells(props)),
    {
      "data-orientation": orientation,
      "data-disabled": isDisabled,
      "data-selection-mode": () => props.selectionMode ?? "none",
      "data-testid": () => props["data-testid"],
    },
  );
  // A group that has collapsed entirely is no group: its role and its name go
  // to the menu button, which is all that is left of it.
  const ownProps: DOMProps = {};
  for (const [key, given] of Object.entries(actionGroupProps)) {
    ownProps[key] =
      typeof given === "function" && !key.startsWith("on")
        ? () => (onlyMenu() ? undefined : (given as () => unknown)())
        : given;
  }

  const render = props.children as (item: unknown) => Child;

  return (
    <div
      ref={wrapperRef.set}
      data-overflow-mode={props.overflowMode ?? "wrap"}
      data-measuring={isMeasuring()}
      style={{ "flex-basis": isMeasuring() ? "100%" : undefined }}
    >
      <div {...mergeProps(groupProps, ownProps)} ref={mergeRefs(groupRef.set, props.ref)}>
        <GroupProvider value={value}>
          <For each={shown}>
            {(node: Node<unknown>) => {
              const owner = getOwner();
              if (owner !== null) install(owner, ActionGroupNodeContext, () => node);
              return render(node.value);
            }}
          </For>
          <Show when={hidden().length > 0}>
            <OverflowMenu
              hidden={hidden()}
              state={state}
              render={render}
              isDisabled={isDisabled()}
              isOnlyItem={onlyMenu()}
              summaryIcon={props.summaryIcon}
              moreIcon={props.moreIcon}
              aria-label={props["aria-label"]}
              aria-labelledby={props["aria-labelledby"]}
              onAction={(key: Key, item: unknown) => value.onAction(key, item)}
            />
          </Show>
        </GroupProvider>
      </div>
    </div>
  );
}

function GroupProvider(props: { value: ActionGroupContextValue; children?: Child }) {
  return provide(
    ActionGroupContext,
    () => props.value,
    () => props.children as unknown,
  );
}

interface OverflowMenuProps {
  hidden: Node<unknown>[];
  state: ListState<unknown>;
  render: (item: unknown) => Child;
  isDisabled: boolean;
  isOnlyItem: boolean;
  summaryIcon?: Child;
  moreIcon?: Child;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  onAction: (key: Key, item: unknown) => void;
}

function OverflowMenu(props: OverflowMenuProps) {
  const state = props.state;
  const keyOf = (item: unknown): Key => {
    for (const node of props.hidden) if (node.value === item) return node.key;
    return String(item);
  };
  const nodeOf = (item: unknown): Node<unknown> | undefined =>
    props.hidden.find((node) => node.value === item);

  return (
    <MenuTrigger isDisabled={props.isDisabled}>
      <OverflowButton {...props} />
      <Menu
        items={props.hidden.map((node) => node.value)}
        getKey={(item: unknown) => keyOf(item)}
        getTextValue={(item: unknown) => nodeOf(item)?.textValue ?? ""}
        getProps={(item: unknown) => nodeOf(item)?.props ?? {}}
        placement={props.isOnlyItem ? "bottom start" : "bottom end"}
        disabledKeys={state.selectionManager().disabledKeys}
        selectionMode={state.selectionManager().selectionMode}
        selectedKeys={state.selectionManager().selectedKeys}
        disallowEmptySelection={state.selectionManager().disallowEmptySelection}
        onSelectionChange={(keys: "all" | Set<Key>) => {
          if (keys === "all") state.selectionManager().selectAll();
          else state.selectionManager().setSelectedKeys(keys);
        }}
        onAction={(key: Key, item: unknown) => props.onAction(key, item)}
      >
        {(item: unknown) => <InOverflowMenu>{props.render(item)}</InOverflowMenu>}
      </Menu>
    </MenuTrigger>
  );
}

function InOverflowMenu(props: { children?: Child }) {
  return provide(
    OverflowMenuContext,
    () => true,
    () => props.children as unknown,
  );
}

function OverflowButton(props: OverflowMenuProps) {
  const trigger = useMenuTrigger();
  if (trigger === null) throw new Error("The overflow button must be inside its MenuTrigger.");
  const state = props.state;
  const message = stringFormatter(actionGroupStrings);
  const textId = id();

  // The key of the first item in the menu: the button stands in for it in the
  // group's roving focus, so the Tab stop survives the items collapsing.
  const standIn = (): Key | undefined => props.hidden[0]?.key;
  const isSelected = (): boolean => {
    const manager = state.selectionManager();
    return manager.selectionMode !== "none" && !manager.isEmpty;
  };
  // Single selection that cannot be emptied reads like a picker: the button
  // shows the chosen item, and says so.
  const picked = (): Node<unknown> | null => {
    const manager = state.selectionManager();
    if (props.summaryIcon !== undefined) return null;
    if (manager.selectionMode !== "single" || !manager.disallowEmptySelection) return null;
    const key = manager.firstSelectedKey;
    return key === null ? null : state.collection().getItem(key);
  };

  const buttonId = trigger.menuTriggerProps.id as Accessor<string>;
  const { buttonProps, isPressed } = button(
    {
      ...(trigger.menuTriggerProps as Record<string, never>),
      isDisabled: () => props.isDisabled,
    },
    trigger.triggerRef,
  );
  const { hoverProps, isHovered } = hover({ isDisabled: () => props.isDisabled });
  const { focusProps, isFocusVisible } = focusRing();

  const elementProps = mergeProps(buttonProps, hoverProps, focusProps, {
    id: buttonId,
    "aria-label": () =>
      props["aria-label"] ??
      (props["aria-labelledby"] === undefined ? message().format("more") : undefined),
    "aria-labelledby": () => {
      const by = props["aria-labelledby"];
      if (picked() === null) return by;
      return `${by ?? buttonId()} ${textId()}`;
    },
    // The stop while any collapsed item holds the roving focus, not only the
    // one it stands in for: otherwise the group has no stop at all.
    tabIndex: () => {
      const focused = state.selectionManager().focusedKey;
      return focused === null || props.hidden.some((node) => node.key === focused) ? 0 : -1;
    },
    onFocus: () => {
      const key = standIn();
      if (key !== undefined) state.selectionManager().setFocusedKey(key);
    },
    "data-selected": isSelected,
    "data-pressed": isPressed,
    "data-hovered": isHovered,
    "data-focus-visible": isFocusVisible,
    "data-disabled": () => props.isDisabled,
    "data-state": () => (trigger.state.isOpen() ? "open" : "closed"),
    "data-overflow": "",
  });

  return (
    <button {...elementProps} ref={trigger.triggerRef.set}>
      {() => {
        const chosen = picked();
        if (chosen !== null) return <span id={textId()}>{chosen.textValue}</span>;
        if (props.summaryIcon !== undefined && state.selectionManager().selectionMode !== "none") {
          return props.summaryIcon;
        }
        return <span aria-hidden="true">{props.moreIcon ?? "…"}</span>;
      }}
    </button>
  );
}

export interface ActionGroupItemComponentProps extends StyleProps {
  children?: Child;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  ref?: RefTarget<HTMLButtonElement>;
  onPress?: (event: PressEvent) => void;
  onPressStart?: (event: PressEvent) => void;
  onPressEnd?: (event: PressEvent) => void;
  onPressChange?: (isPressed: boolean) => void;
}

/**
 * One action. A button in the group, or a menu item once the group has
 * collapsed it into its overflow menu.
 *
 * A `<TooltipTrigger>` or `<DialogTrigger>` written around it reaches the
 * button, as it would a `<Button>`.
 */
export function ActionGroupItem(props: ActionGroupItemComponentProps) {
  if (getContext(OverflowMenuContext)) {
    return <MenuItem {...(props as Record<string, never>)}>{props.children}</MenuItem>;
  }
  return <GroupButton {...props} />;
}

function GroupButton(props: ActionGroupItemComponentProps) {
  const group = getContext(ActionGroupContext);
  const node = getContext(ActionGroupNodeContext);
  if (group === null || group === undefined || node === null || node === undefined) {
    throw new Error("An ActionGroupItem must be rendered by its ActionGroup's item callback.");
  }
  const domRef = makeRef<HTMLButtonElement>();
  const options = fromProps(cells(props));
  const slot = triggerSlot();
  const item = actionGroupItem({ key: node.key }, group.state);
  const isDisabled = (): boolean => group.isDisabled() || item.isDisabled();

  const { buttonProps, isPressed } = button(
    mergeProps(slot.props, options, {
      isDisabled,
      onPress: (event: PressEvent) => {
        item.onPress(event);
        if (!isDisabled()) group.onAction(node.key, node.value);
      },
    }),
    domRef,
  );
  const { hoverProps, isHovered } = hover({ isDisabled });
  const { focusProps, isFocused, isFocusVisible } = focusRing();

  const elementProps = mergeProps(
    buttonProps,
    item.itemProps,
    hoverProps,
    focusProps,
    filterDOMProps(options, { global: true }),
    styleProps(cells(props)),
    {
      "aria-label": () => props["aria-label"] ?? node["aria-label"],
      "data-selected": item.isSelected,
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-disabled": isDisabled,
      "data-testid": () => props["data-testid"],
    },
  );

  return (
    <button {...elementProps} ref={mergeRefs(domRef.set, slot.ref, props.ref)}>
      {props.children}
    </button>
  );
}
