/**
 * A select: a button that shows the current choice and opens a listbox.
 *
 * Not a `<select>`. The native one cannot be styled past a point and cannot
 * hold anything but text, which is why every design system reimplements it,
 * and why every reimplementation has to put back what the platform was doing:
 *
 * - **The name.** The button is named by the label AND by the current value,
 *   in that order, so a screen reader announces "Fruit, Banana, button" rather
 *   than just "Banana".
 * - **Form participation.** A visually hidden native `<select>` carries the
 *   value into `FormData`, gets autofilled by the browser, and gives mobile
 *   browsers the form navigation bar their users expect. It is hidden by
 *   CLIPPING rather than by `display: none`, because Safari will not autofill
 *   a control it considers invisible.
 * - **Typing on the closed button.** A native select jumps to the matching
 *   option without opening, and so does this one.
 *
 * The listbox is a listbox, not a menu: the options are values to choose
 * between, and `aria-selected` is what says which one is current.
 */

import {
  type Accessor,
  type Child,
  For,
  Portal,
  Show,
  createContext,
  createTrackedEffect,
  getContext,
  getOwner,
  type Incoming,
  install,
  createSignal,
  onCleanup,
  onSettled,
  provide,
} from "@barqjs/core";
import { resizeObserver } from "@barqjs/primitives/observers";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { button, type ButtonOptions } from "./button.tsx";
import type {
  FocusStrategy,
  ItemAccessors,
  Key,
  ListStateOptions,
  Node,
  SelectionMode,
  SelectionValue,
} from "./collections.ts";
import { listState, type ListState } from "./collections.ts";
import { PREVENT_FOCUS_ATTRIBUTE } from "./dom.ts";
import { Popover, popoverStateProps } from "./dialog.tsx";
import { focusRing } from "./focus.ts";
import { collator, useLocale } from "./i18n.ts";
import { hover } from "./interactions/hover.ts";
import type { ElementRef } from "./interactions/press.ts";
import { field, type FieldOptions } from "./label.ts";
import {
  formValidation,
  fieldValidation,
  type FormValidationState,
  type ValidateFunction,
  type ValidationBehavior,
} from "./validation.ts";
import {
  listBox,
  ListBoxProvider,
  Option,
  provideItemNode,
  provideItemRender,
  type ListBoxContextValue,
} from "./listbox.tsx";
import { visuallyHidden } from "./live.ts";
import { menuTrigger } from "./menu.tsx";
import { overlayTriggerState, type OverlayTriggerState, type Placement } from "./overlays.ts";
import { ListKeyboardDelegate, typeSelect, type KeyboardDelegate } from "./selection.ts";
import {
  staticAccessors,
  staticCollection,
  type StaticCollection,
  type StaticEntry,
} from "./static-collection.ts";
import { formReset } from "./toggle.ts";
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
// State
// ---------------------------------------------------------------------------

export interface SelectStateOptions<T> extends Omit<ListStateOptions<T>, "onSelectionChange"> {
  selectedKey?: MaybeAccessor<Key | null | undefined>;
  defaultSelectedKey?: MaybeAccessor<Key | null | undefined>;
  isOpen?: MaybeAccessor<boolean | undefined>;
  defaultOpen?: MaybeAccessor<boolean | undefined>;
  /** Close when a value is chosen. @default true for single selection */
  shouldCloseOnSelect?: MaybeAccessor<boolean | undefined>;
  /** Let the popup open with nothing in it. @default false */
  allowsEmptyCollection?: MaybeAccessor<boolean | undefined>;
  onOpenChange?: (isOpen: boolean) => void;
  onSelectionChange?: (key: Key | null) => void;
  /** Every selected key, for a multiple-selection select. */
  onSelectionChangeAll?: (keys: SelectionValue) => void;
}

export interface SelectState<T> extends ListState<T>, Omit<OverlayTriggerState, "open" | "toggle"> {
  selectedKey: Accessor<Key | null>;
  setSelectedKey(key: Key | null): void;
  selectedItem: Accessor<Node<T> | null>;
  selectedItems: Accessor<Node<T>[]>;
  /** What the form control submits. */
  value: Accessor<Key | Key[] | null>;
  defaultValue: Accessor<Key | Key[] | null>;
  setValue(value: Key | Key[] | null): void;
  isFocused: Accessor<boolean>;
  setFocused(isFocused: boolean): void;
  focusStrategy: Accessor<FocusStrategy | null>;
  open(focusStrategy?: FocusStrategy | null): void;
  toggle(focusStrategy?: FocusStrategy | null): void;
}

/**
 * The collection, the selection and the popup, kept in step.
 *
 * A select with nothing in it does not open. An empty popup is a dead end the
 * user has to escape from, and it tells them nothing that a disabled button
 * does not.
 */
export function selectState<T>(options: SelectStateOptions<T>): SelectState<T> {
  const overlay = overlayTriggerState(options);
  const [strategy, setStrategy] = createSignal<FocusStrategy | null>(null);
  const [isFocused, setIsFocused] = createSignal(false);

  const mode = (): SelectionMode => access(options.selectionMode) ?? "single";
  const closesOnSelect = (): boolean => access(options.shouldCloseOnSelect) ?? mode() === "single";

  const list = listState<T>({
    ...options,
    selectionMode: mode,
    disallowEmptySelection: () => mode() === "single",
    allowDuplicateSelectionEvents: true,
    selectedKeys: () => {
      const key = access(options.selectedKey);
      if (key === undefined) return access(options.selectedKeys);
      return key === null ? [] : [key];
    },
    defaultSelectedKeys: () => {
      const key = access(options.defaultSelectedKey);
      if (key === undefined) return access(options.defaultSelectedKeys);
      return key === null ? [] : [key];
    },
    onSelectionChange: (keys: SelectionValue) => {
      if (keys !== "all") {
        const first = keys.values().next().value ?? null;
        options.onSelectionChange?.(mode() === "single" ? first : null);
      }
      options.onSelectionChangeAll?.(keys);
      if (closesOnSelect()) overlay.close();
    },
  });

  const selectedKey = (): Key | null => list.selectionManager().firstSelectedKey;

  const selectedItems = (): Node<T>[] => {
    const collection = list.collection();
    const keys = list.selectionManager().selectedKeys;
    const items: Node<T>[] = [];
    for (const key of keys) {
      const item = collection.getItem(key);
      if (item !== null) items.push(item);
    }
    return items;
  };

  const setValue = (value: Key | Key[] | null): void => {
    const keys = value === null ? [] : Array.isArray(value) ? value : [value];
    list.selectionManager().setSelectedKeys(new Set(keys));
  };

  const value = (): Key | Key[] | null =>
    mode() === "single" ? selectedKey() : [...list.selectionManager().selectedKeys];

  // Read once: what a form reset goes back to is where it STARTED, not
  // wherever the caller's default happens to point by then.
  const initial = value();

  const hasItems = (): boolean =>
    list.collection().size !== 0 || access(options.allowsEmptyCollection) === true;

  return {
    ...list,
    isOpen: overlay.isOpen,
    setOpen: overlay.setOpen,
    close: overlay.close,
    selectedKey,
    setSelectedKey: (key) => setValue(key),
    selectedItem: () => selectedItems()[0] ?? null,
    selectedItems,
    value,
    defaultValue: () => initial,
    setValue,
    isFocused,
    setFocused: (next) => setIsFocused(next),
    focusStrategy: strategy,
    open(focusStrategy: FocusStrategy | null = null) {
      if (!hasItems()) return;
      setStrategy(focusStrategy);
      overlay.open();
    },
    toggle(focusStrategy: FocusStrategy | null = null) {
      if (!hasItems()) return;
      setStrategy(focusStrategy);
      overlay.toggle();
    },
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface SelectOptions extends FieldOptions {
  ref: ElementRef;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isRequired?: MaybeAccessor<boolean | undefined>;
  name?: MaybeAccessor<string | undefined>;
  form?: MaybeAccessor<string | undefined>;
  autoComplete?: MaybeAccessor<string | undefined>;
  keyboardDelegate?: KeyboardDelegate;
  /** What the page thinks of the choice, checked as it changes. */
  validate?: ValidateFunction<Key | Key[] | null>;
  /** @default "aria" */
  validationBehavior?: MaybeAccessor<ValidationBehavior | undefined>;
}

export interface SelectResult {
  labelProps: DOMProps;
  triggerProps: DOMProps;
  /** For the element showing what is currently chosen. */
  valueProps: DOMProps;
  listBoxProps: DOMProps;
  descriptionProps: DOMProps;
  errorMessageProps: DOMProps;
  /** What is wrong with the choice, and whether the user is being told. */
  validation: FormValidationState;
  errors: Accessor<string[]>;
  isInvalid: Accessor<boolean>;
}

export function select(options: SelectOptions, state: SelectState<unknown>): SelectResult {
  const valueId = id();
  const triggerId = id();

  const search = collator({ usage: "search", sensitivity: "base" });
  const delegate =
    options.keyboardDelegate ??
    new ListKeyboardDelegate({
      collection: state.collection,
      ref: options.ref,
      disabledKeys: state.disabledKeys,
      collator: search,
    });

  // A select's trigger IS a menu trigger: it opens on pointer down, closes on
  // the press that follows over an option, and ArrowDown/ArrowUp open it with
  // an end focused. `SelectState` already has the shape that needs.
  const { menuTriggerProps, menuProps } = menuTrigger(
    { type: "listbox", isDisabled: options.isDisabled },
    state,
  );

  const {
    state: validation,
    isInvalid,
    errors,
    errorMessage,
  } = fieldValidation<Key | Key[] | null>({
    value: state.value,
    validate: options.validate,
    validationBehavior: options.validationBehavior,
    isInvalid: options.isInvalid,
    errorMessage: options.errorMessage,
    name: options.name,
  });

  const { labelProps, fieldProps, descriptionProps, errorMessageProps } = field({
    ...options,
    isInvalid,
    errorMessage,
    // A `<button>` is not a labelable element, so the label is a `<span>` that
    // points at it rather than a `<label>` that wraps it.
    labelElementType: "span",
  });

  // Typing on the CLOSED button moves the selection, as a native select does.
  const { typeSelectProps } = typeSelect({
    keyboardDelegate: delegate,
    selectionManager: state.selectionManager,
    onTypeSelect: (key) => state.setSelectedKey(key),
  });

  /**
   * Left and right step through the values WITHOUT opening.
   *
   * A native select does this, and it is the only way to change one from the
   * keyboard without looking at the list.
   */
  const onKeyDown = (event: KeyboardEvent): void => {
    if (access(options.isDisabled) === true) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (state.selectionManager().selectionMode === "multiple") return;

    event.preventDefault();
    const current = state.selectedKey();
    const next =
      current === null
        ? (delegate.getFirstKey?.() ?? null)
        : event.key === "ArrowLeft"
          ? (delegate.getKeyAbove?.(current) ?? null)
          : (delegate.getKeyBelow?.(current) ?? null);
    if (next !== null) state.setSelectedKey(next);
  };

  return {
    descriptionProps,
    errorMessageProps,
    validation,
    errors,
    isInvalid,
    valueProps: { id: valueId },
    labelProps: mergeProps(labelProps, {
      // Clicking the label focuses the button, as it would a native control.
      onClick: () => {
        if (access(options.isDisabled) === true) return;
        (access(options.ref) as HTMLElement | null)?.focus();
      },
    }),
    triggerProps: mergeProps(
      filterDOMProps(options, { labelable: true }),
      menuTriggerProps,
      fieldProps,
      typeSelectProps,
      {
        id: triggerId,
        onKeyDown,
        "aria-invalid": () => isInvalid() || undefined,
        "aria-required": () => access(options.isRequired) === true || undefined,
        // The label FIRST and the value second: "Fruit, Banana", not "Banana".
        "aria-labelledby": () =>
          [access(fieldProps["aria-labelledby"] as MaybeAccessor<string | undefined>), valueId()]
            .filter(Boolean)
            .join(" "),
        onFocus: () => state.setFocused(true),
        onBlur: () => {
          // Focus inside the open popup is still focus on the select.
          if (state.isOpen()) return;
          state.setFocused(false);
          validation.commitValidation();
        },
      },
    ),
    listBoxProps: {
      id: menuProps.id,
      "aria-labelledby": () =>
        [access(fieldProps["aria-labelledby"] as MaybeAccessor<string | undefined>), valueId()]
          .filter(Boolean)
          .join(" "),
      autoFocus: () => state.focusStrategy() ?? true,
      // A select's popup closes on choosing, so choosing on pointer DOWN would
      // consume the press that opened it.
      shouldSelectOnPressUp: true,
      disallowEmptySelection: true,
      linkBehavior: "selection",
    },
  };
}

export interface HiddenSelectOptions {
  selectRef: ElementRef<HTMLSelectElement>;
  /**
   * The visible button, which is where focus goes when the browser refuses a
   * submit. The `<select>` this validates is clipped out of sight, so focusing
   * it would move focus somewhere the user cannot see.
   */
  triggerRef: ElementRef;
  name?: MaybeAccessor<string | undefined>;
  form?: MaybeAccessor<string | undefined>;
  autoComplete?: MaybeAccessor<string | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isRequired?: MaybeAccessor<boolean | undefined>;
  /** @default "aria" */
  validationBehavior?: MaybeAccessor<ValidationBehavior | undefined>;
  /** The select's validation state, so the browser and the page agree. */
  validation?: FormValidationState;
}

export interface HiddenSelectResult {
  containerProps: DOMProps;
  selectProps: DOMProps;
}

/**
 * A real `<select>`, clipped out of sight, so the form works.
 *
 * Hidden by clipping rather than by `display: none` or `hidden`: Safari will
 * not autofill a control it considers invisible, and Firefox needs a `<label>`
 * to identify one. `aria-hidden` on the container keeps it out of the
 * accessibility tree, where the real button already stands for it, and
 * `tabIndex={-1}` keeps it out of the Tab order.
 */
export function hiddenSelect(
  options: HiddenSelectOptions,
  state: SelectState<unknown>,
): HiddenSelectResult {
  const { visuallyHiddenProps } = visuallyHidden();

  formReset(
    options.selectRef as unknown as ElementRef<HTMLInputElement>,
    state.defaultValue,
    (value) => state.setValue(value),
  );

  // The NATIVE half of validation, which only this element can carry: the
  // `<select>` is the thing in the form, so it is the thing
  // `setCustomValidity` has to be written onto and the thing the browser
  // refuses the submit over. Focus goes to the visible button instead of to
  // it, because a submit that focuses a clipped element looks like nothing
  // happened.
  if (options.validation !== undefined) {
    formValidation(
      {
        validationBehavior: options.validationBehavior,
        focus: () => (access(options.triggerRef) as HTMLElement | null)?.focus(),
      },
      options.validation,
      options.selectRef,
    );
  }

  // A `<select>` cannot hold a value its options do not offer, and the options
  // are inserted after the element. Written again once they exist, and again
  // whenever the collection changes.
  createTrackedEffect(() => {
    const element = access(options.selectRef) as HTMLSelectElement | null;
    if (element === null) return;
    state.collection();
    const value = state.value();
    const wanted =
      value === null ? "" : Array.isArray(value) ? String(value[0] ?? "") : String(value);
    if (element.multiple) {
      const keys = new Set((Array.isArray(value) ? value : []).map(String));
      for (const option of element.options) option.selected = keys.has(option.value);
      return;
    }
    if (element.value !== wanted) element.value = wanted;
  });

  const onChange = (event: Event): void => {
    const element = event.currentTarget as HTMLSelectElement;
    if (element.multiple) {
      state.setValue([...element.selectedOptions].map((option) => option.value));
    } else {
      state.setValue(element.value === "" ? null : element.value);
    }
  };

  return {
    containerProps: {
      ...visuallyHiddenProps,
      style: { ...(visuallyHiddenProps.style as object), position: "fixed", top: 0, left: 0 },
      "aria-hidden": true,
      [PREVENT_FOCUS_ATTRIBUTE]: true,
    },
    selectProps: {
      tabIndex: -1,
      autocomplete: () => access(options.autoComplete),
      disabled: () => access(options.isDisabled) === true,
      required: () => access(options.isRequired) === true,
      multiple: () => state.selectionManager().selectionMode === "multiple",
      name: () => access(options.name),
      form: () => access(options.form),
      value: () => {
        const value = state.value();
        if (value === null) return "";
        return Array.isArray(value) ? value.map(String) : String(value);
      },
      onChange,
      onInput: onChange,
    },
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface SelectContextValue {
  state: SelectState<unknown>;
  valueProps: DOMProps;
  placeholder: Accessor<string | undefined>;
  /** Present when the select is written as parts rather than built from `items`. */
  parts?: SelectParts | undefined;
}

const SelectContext = createContext<SelectContextValue | null>(null);

export function useSelect(): SelectContextValue {
  const value = getContext(SelectContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a Select.");
  }
  return value;
}

export interface SelectValueComponentProps extends StyleProps {
  /** Shown in place of the chosen option's own content, once something is chosen. */
  children?: Child;
  /** Shown when nothing is chosen. @default the select's own `placeholder` */
  placeholder?: string;
}

/** Marks the part of an option that the trigger shows when it is chosen. */
const ITEM_TEXT_ATTRIBUTE = "data-barq-item-text";

/**
 * What is currently chosen, or the placeholder.
 *
 * The element it renders is what `aria-labelledby` on the trigger points at,
 * so a select whose value is an icon still announces something.
 *
 * An option written as a child may hold more than text, and what it holds is
 * shown here as it is drawn there: a COPY of its {@link SelectItemText}, since
 * one node cannot be in the list and in the trigger at once.
 */
export function SelectValue(props: Incoming<SelectValueComponentProps>) {
  const picker = useSelect();
  const placeholder = (): string => props.placeholder?.() ?? picker.placeholder() ?? "";

  const elementProps = mergeProps(
    picker.valueProps,
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      "data-placeholder": () => picker.state.selectedItem() === null,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  const chosen = (): Child => {
    const selected = picker.state.selectedItem();
    if (selected === null) return placeholder();
    const drawn = picker.parts?.registry
      .elementOf(selected.key)
      ?.querySelector(`[${ITEM_TEXT_ATTRIBUTE}]`);
    if (drawn === null || drawn === undefined || drawn.children.length === 0) {
      return selected.textValue;
    }
    return [...drawn.childNodes].map((node) => node.cloneNode(true));
  };

  if (props.children === undefined) {
    return (
      <span {...elementProps} ref={picker.parts?.valueRef.set}>
        {chosen}
      </span>
    );
  }

  return (
    <span {...elementProps} ref={picker.parts?.valueRef.set}>
      <Show when={picker.state.selectedItem() !== null} fallback={<>{placeholder()}</>}>
        {props.children}
      </Show>
    </span>
  );
}

export interface SelectComponentProps<T> extends StyleProps, ItemAccessors<T> {
  /** The values to choose between, in order. */
  items: Iterable<T>;
  /** How one value renders. Return an `<Option>`. */
  children: (item: T) => Child;
  label?: Child;
  description?: Child;
  errorMessage?: Child;
  /** Shown when nothing is chosen. */
  placeholder?: string;
  selectedKey?: Key | null;
  defaultSelectedKey?: Key | null;
  disabledKeys?: Iterable<Key>;
  isOpen?: boolean;
  defaultOpen?: boolean;
  isDisabled?: boolean;
  isRequired?: boolean;
  isInvalid?: boolean;
  /** What the page thinks of the choice, checked as it changes. */
  validate?: ValidateFunction<Key | Key[] | null>;
  /** @default "aria" */
  validationBehavior?: ValidationBehavior;
  /** Submitted with the form. Without it, no hidden control is rendered. */
  name?: string;
  form?: string;
  autoComplete?: string;
  /** @default "bottom start" */
  placement?: Placement;
  /**
   * The class for the LIST, inside the popover.
   *
   * `class` styles the trigger, which is the element a caller can see. The list
   * is built inside a popover this component owns, so without this it could
   * only be reached by a global rule — and a design system has to be able to
   * draw the box the options sit in.
   */
  listClass?: string;
  /**
   * The `data-slot` for that same list.
   *
   * `select-list` is what it says by default, and a design system naming the
   * element after its own vocabulary — shadcn calls it the select CONTENT —
   * could otherwise only reach it through a global rule that every select on
   * the page would share.
   */
  listSlot?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  ref?: RefTarget<HTMLButtonElement>;
  onSelectionChange?: (key: Key | null) => void;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * ```tsx
 * <Select label="Fruit" items={fruits()} placeholder="Pick one"
 *         onSelectionChange={(key) => chosen.set(key)}>
 *   {(fruit) => <Option>{fruit.name}</Option>}
 * </Select>
 * ```
 */
export function Select<T>(props: Incoming<SelectComponentProps<T>>) {
  const triggerRef = makeRef<HTMLButtonElement>();
  const listRef = makeRef<HTMLUListElement>();
  const selectRef = makeRef<HTMLSelectElement>();
  const options = fromProps(props as unknown as Incoming<Record<string, unknown>>);

  const state = selectState<T>({
    ...(options as SelectStateOptions<T>),
    onSelectionChange: (key) => props.onSelectionChange?.()?.(key),
  });

  const {
    labelProps,
    triggerProps,
    valueProps,
    listBoxProps: listBoxOptions,
    descriptionProps,
    errorMessageProps,
    errors,
    isInvalid,
    validation,
  } = select(
    {
      ...(options as unknown as SelectOptions),
      ref: triggerRef,
      validate: callback(props.validate),
      validationBehavior: () => props.validationBehavior?.(),
    },
    state,
  );

  const { buttonProps, isPressed } = button(
    { ...(options as ButtonOptions), ...triggerProps },
    triggerRef,
  );
  const { hoverProps, isHovered } = hover({ isDisabled: () => props.isDisabled?.() });
  const { focusProps, isFocusVisible } = focusRing();

  const buttonElementProps = mergeProps(
    buttonProps,
    // `id` only: every handler in `triggerProps` is already a `button` option,
    // and binding them here as well would run each one twice — two toggles
    // for one ArrowDown, which is no toggle at all.
    { id: triggerProps.id },
    hoverProps,
    focusProps,
    filterDOMProps(options, { global: true }),
    styleProps(props),
    {
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-focus-visible": isFocusVisible,
      "data-open": state.isOpen,
      "data-state": () => (state.isOpen() ? "open" : "closed"),
      "data-disabled": () => props.isDisabled?.() === true,
      "data-placeholder": () => state.selectedItem() === null,
      "data-invalid": isInvalid,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  const { containerProps, selectProps } = hiddenSelect(
    {
      selectRef,
      triggerRef,
      name: () => props.name?.(),
      form: () => props.form?.(),
      autoComplete: () => props.autoComplete?.(),
      isDisabled: () => props.isDisabled?.(),
      isRequired: () => props.isRequired?.(),
      validationBehavior: () => props.validationBehavior?.(),
      validation,
    },
    state,
  );

  const renderOption = props.children;

  const owner = getOwner();
  if (owner !== null) {
    install(owner, SelectContext, () => ({
      state: state as unknown as SelectState<unknown>,
      valueProps,
      placeholder: () => props.placeholder?.(),
    }));
  }

  return (
    <>
      <span {...labelProps}>{props.label}</span>
      <button {...buttonElementProps} ref={mergeRefs(triggerRef.set, props.ref?.())}>
        <SelectValue />
      </button>
      {() =>
        props.name?.() === undefined ? null : (
          <div {...containerProps}>
            <label>
              {props.label}
              <select {...selectProps} ref={selectRef.set}>
                <option value="" label="&nbsp;" />
                <For each={() => [...state.collection()].filter((node) => node.type === "item")}>
                  {(node: Node<T>) => <option value={String(node.key)}>{node.textValue}</option>}
                </For>
              </select>
            </label>
          </div>
        )
      }
      <Popover
        triggerRef={triggerRef}
        isOpen={state.isOpen()}
        onOpenChange={state.setOpen}
        placement={props.placement?.() ?? "bottom start"}
      >
        <SelectList
          options={listBoxOptions}
          ariaLabel={props["aria-label"]?.()}
          listClass={props.listClass?.()}
          listSlot={props.listSlot?.()}
          state={state}
          listRef={listRef}
          render={renderOption as unknown as (item: unknown) => Child}
        />
      </Popover>
      <span {...descriptionProps}>{props.description}</span>
      <span {...errorMessageProps}>
        {() => {
          const given = props.errorMessage?.();
          if (given !== undefined && given !== null && given !== "") return given;
          const found = errors();
          return found.length === 0 ? null : found.join(" ");
        }}
      </span>
    </>
  );
}

interface SelectListProps {
  options: DOMProps;
  ariaLabel?: string;
  listClass?: string;
  listSlot?: string;
  state: SelectState<unknown>;
  listRef: ReturnType<typeof makeRef<HTMLUListElement>>;
  render: (item: unknown) => Child;
}

/**
 * The listbox inside the popover.
 *
 * Its own component so it is a Block, and the `listBox` hook is called HERE
 * rather than in `Select`: the autofocus is read once, at construction, so
 * reading it before the popover opened would always find the strategy unset
 * and land focus on the list instead of on an option.
 */
function SelectList(props: Incoming<SelectListProps>) {
  const state = props.state();
  const listRef = props.listRef();
  const render = props.render();
  const options = props.options();

  const { listBoxProps, baseId } = listBox(
    {
      ...(options as unknown as Record<string, MaybeAccessor<never>>),
      ref: listRef,
      "aria-label": props.ariaLabel,
    },
    state,
  );

  const elementProps = mergeProps(listBoxProps, popoverStateProps(), {
    id: options.id,
    "aria-labelledby": options["aria-labelledby"],
    class: props.listClass,
    "data-slot": () => props.listSlot?.() ?? "select-list",
  });

  provideItemRender(render);

  return (
    <ListBoxProvider
      value={{
        state: state as unknown as ListState<unknown>,
        baseId,
        shouldSelectOnPressUp: () => true,
        shouldUseVirtualFocus: () => undefined,
      }}
    >
      <ul {...elementProps} ref={listRef.set}>
        <For each={() => [...state.collection()]}>
          {(node: Node<unknown>) => {
            provideItemNode(node);
            return render(node.value);
          }}
        </For>
      </ul>
    </ListBoxProvider>
  );
}

// ---------------------------------------------------------------------------
// Written as parts
// ---------------------------------------------------------------------------

/**
 * The same select, written out: a root that holds the state, a trigger, and a
 * content whose `<Option>` children are the collection.
 *
 * ```tsx
 * <SelectRoot defaultSelectedKey="apple" name="fruit">
 *   <SelectTrigger><SelectValue placeholder="Pick one" /></SelectTrigger>
 *   <SelectContent>
 *     <SelectViewport>
 *       <Option value="apple"><SelectItemText>Apple</SelectItemText></Option>
 *       <Option value="banana"><SelectItemText>Banana</SelectItemText></Option>
 *     </SelectViewport>
 *   </SelectContent>
 * </SelectRoot>
 * ```
 *
 * Three decisions differ from {@link Select}, and each follows from the
 * options being written rather than given:
 *
 * - **The options exist before the list opens.** A written option registers
 *   when it renders, and a closed list renders nothing, so the trigger would
 *   have no text for its value and a typed letter nothing to match. While the
 *   list is closed its content is therefore built into an element that is
 *   never put in the document: the options register from there, nothing is
 *   exposed to a screen reader or a selector, and the copy is dropped once the
 *   real list has taken its place.
 * - **The trigger is a combobox.** It is named by its label alone, and what is
 *   chosen is its value rather than part of its name, which is the select-only
 *   combobox pattern and what a `<label for>` expects of the control it names.
 * - **The form control follows the form.** The hidden `<select>` is rendered
 *   whenever there is a `name` or a form around the trigger, so `isRequired`
 *   holds a submit back with or without a name.
 */

interface SelectParts {
  registry: StaticCollection;
  triggerRef: ReturnType<typeof makeRef<HTMLButtonElement>>;
  valueRef: ReturnType<typeof makeRef<HTMLSpanElement>>;
  /** Options for {@link button}. */
  triggerProps: DOMProps;
  /** What the trigger's element carries beyond what `button` writes. */
  comboboxProps: DOMProps;
  /** Options for the content's {@link listBox}. */
  listBoxProps: DOMProps;
  baseId: Accessor<string>;
  isDisabled: Accessor<boolean>;
  isInvalid: Accessor<boolean>;
  dir: Accessor<"ltr" | "rtl" | undefined>;
  /** The trigger is in the document, so what is around it can be read. */
  placed: () => void;
}

function useSelectParts(part: string): SelectContextValue & { parts: SelectParts } {
  const picker = useSelect();
  if (picker.parts === undefined) {
    throw new Error(`A ${part} must be rendered inside a SelectRoot.`);
  }
  return picker as SelectContextValue & { parts: SelectParts };
}

export interface SelectTriggerOptions {
  ref: ElementRef;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isRequired?: MaybeAccessor<boolean | undefined>;
  keyboardDelegate?: KeyboardDelegate;
}

export interface SelectTriggerResult {
  /** Options for {@link button}, not props for an element. */
  triggerProps: DOMProps;
  /** What the element carries on top of what `button` writes. */
  comboboxProps: DOMProps;
  /** Options for the {@link listBox} the trigger opens. */
  listBoxProps: DOMProps;
}

/**
 * A select's trigger as a select-only combobox.
 *
 * {@link select} names its button by the label AND the value, which suits a
 * `<span>` label it wires up itself. This one leaves the name to whatever
 * labels the element: a `<label for>` or an `aria-label` names a combobox, and
 * an `aria-labelledby` written here would override both.
 *
 * Space, Enter and the vertical arrows open the list, and a typed letter
 * changes the value without opening, as a native select does.
 */
export function selectTrigger(
  options: SelectTriggerOptions,
  state: SelectState<unknown>,
): SelectTriggerResult {
  const search = collator({ usage: "search", sensitivity: "base" });
  const delegate =
    options.keyboardDelegate ??
    new ListKeyboardDelegate({
      collection: state.collection,
      ref: options.ref,
      disabledKeys: state.disabledKeys,
      collator: search,
    });

  const { menuTriggerProps, menuProps } = menuTrigger(
    { type: "listbox", isDisabled: options.isDisabled },
    state,
  );

  const { typeSelectProps } = typeSelect({
    keyboardDelegate: delegate,
    selectionManager: state.selectionManager,
    onTypeSelect: (key) => state.setSelectedKey(key),
  });

  return {
    triggerProps: mergeProps(
      menuTriggerProps,
      { onKeyDown: typeSelectProps.onKeyDown },
      {
        "aria-required": () => access(options.isRequired) === true || undefined,
        onFocus: () => state.setFocused(true),
        onBlur: () => {
          // Focus inside the open popup is still focus on the select.
          if (!state.isOpen()) state.setFocused(false);
        },
      },
    ),
    comboboxProps: {
      id: menuTriggerProps.id,
      role: "combobox",
      "aria-autocomplete": "none",
      onKeyDownCapture: typeSelectProps.onKeyDownCapture,
    },
    listBoxProps: {
      id: menuProps.id,
      "aria-labelledby": menuTriggerProps.id,
      autoFocus: () => state.focusStrategy() ?? true,
      // A select's popup closes on choosing, so choosing on pointer DOWN would
      // consume the press that opened it.
      shouldSelectOnPressUp: true,
      disallowEmptySelection: true,
      linkBehavior: "selection",
    },
  };
}

export interface SelectRootComponentProps {
  /** A `<SelectTrigger>` and a `<SelectContent>`, and anything around them. */
  children?: Child;
  selectedKey?: Key | null;
  defaultSelectedKey?: Key | null;
  isOpen?: boolean;
  defaultOpen?: boolean;
  isDisabled?: boolean;
  isRequired?: boolean;
  /** Submitted with the form. */
  name?: string;
  form?: string;
  autoComplete?: string;
  /** The reading direction of the trigger and the list, when it is not the page's. */
  dir?: "ltr" | "rtl";
  onSelectionChange?: (key: Key | null) => void;
  onOpenChange?: (isOpen: boolean) => void;
}

/** The state of a select written as parts. Renders no element of its own. */
export function SelectRoot(props: Incoming<SelectRootComponentProps>) {
  const triggerRef = makeRef<HTMLButtonElement>();
  const valueRef = makeRef<HTMLSpanElement>();
  const selectRef = makeRef<HTMLSelectElement>();
  const registry = staticCollection();
  const baseId = id();
  const isDisabled = (): boolean => props.isDisabled?.() === true;

  const state = selectState<StaticEntry>({
    items: registry.entries,
    ...staticAccessors,
    selectedKey: () => props.selectedKey?.(),
    defaultSelectedKey: () => props.defaultSelectedKey?.(),
    isOpen: () => props.isOpen?.(),
    defaultOpen: () => props.defaultOpen?.(),
    onOpenChange: (isOpen) => props.onOpenChange?.()?.(isOpen),
    onSelectionChange: (key) => props.onSelectionChange?.()?.(key),
  }) as unknown as SelectState<unknown>;

  const { triggerProps, comboboxProps, listBoxProps } = selectTrigger(
    { ref: triggerRef, isDisabled, isRequired: () => props.isRequired?.() },
    state,
  );

  // The browser's own verdict on the hidden control, shown on the trigger: a
  // required select with nothing chosen refuses the submit, and the refusal
  // has to land on something the user can see.
  const { state: validation, isInvalid } = fieldValidation<Key | Key[] | null>({
    value: state.value,
    validationBehavior: "native",
    name: () => props.name?.(),
  });

  // The hidden control's options, written onto it rather than rendered into
  // it. They exist on the client only, where the written options register, so
  // a list rendered here would be one the server's markup does not have and a
  // hydrating page would report every row of it. Before `hiddenSelect`, whose
  // own effect writes the value and needs the option it names to be there.
  createTrackedEffect(() => {
    const element = selectRef();
    if (element === null) return;
    const collection = state.collection();
    while (element.options.length > 1) element.remove(1);
    // By key rather than by walking the top level, which holds the GROUPS: a
    // native `<select>` wants every option, whichever group it was written in.
    for (const key of collection.getKeys()) {
      const node = collection.getItem(key);
      if (node === null || node.type !== "item") continue;
      const option = element.ownerDocument.createElement("option");
      option.value = String(node.key);
      option.textContent = node.textValue;
      element.append(option);
    }
  });

  const { containerProps, selectProps } = hiddenSelect(
    {
      selectRef,
      triggerRef,
      name: () => props.name?.(),
      form: () => props.form?.(),
      autoComplete: () => props.autoComplete?.(),
      isDisabled,
      isRequired: () => props.isRequired?.(),
      validationBehavior: "native",
      validation,
    },
    state,
  );

  // Asked once the trigger is attached: at the moment its ref resolves it has
  // no ancestors yet, and no form to find.
  const [isInsideForm, setInsideForm] = createSignal(false);
  const inForm = (): boolean =>
    props.name?.() !== undefined || props.form?.() !== undefined || isInsideForm();

  const value: SelectContextValue = {
    state,
    valueProps: {},
    placeholder: () => undefined,
    parts: {
      registry,
      triggerRef,
      valueRef,
      triggerProps,
      comboboxProps,
      listBoxProps,
      baseId,
      isDisabled,
      isInvalid,
      dir: () => props.dir?.(),
      placed: () => {
        setInsideForm((triggerRef()?.closest("form") ?? null) !== null);
      },
    },
  };

  return (
    <>
      {
        provide(
          SelectContext,
          () => value,
          () => props.children as unknown,
        ) as Child
      }
      <Show when={inForm()}>
        <div {...containerProps}>
          <select {...selectProps} ref={selectRef.set}>
            <option value="" label="&nbsp;" />
          </select>
        </div>
      </Show>
    </>
  );
}

export interface SelectTriggerComponentProps extends StyleProps {
  /** A `<SelectValue>`, and whatever sits beside it. */
  children?: Child;
  id?: string;
  isDisabled?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  ref?: RefTarget<HTMLButtonElement>;
}

/** The control that shows the value and opens the list. */
export function SelectTrigger(props: Incoming<SelectTriggerComponentProps>) {
  const picker = useSelectParts("SelectTrigger");
  const { parts, state } = picker;
  const isDisabled = (): boolean => parts.isDisabled() || props.isDisabled?.() === true;
  const isInvalid = (): boolean => {
    const given = props["aria-invalid"]?.();
    return given === undefined ? parts.isInvalid() : given === true || given === "true";
  };

  const options = fromProps(props);
  const { buttonProps, isPressed } = button(
    {
      ...(parts.triggerProps as ButtonOptions),
      isDisabled,
      "aria-label": () => props["aria-label"]?.(),
      "aria-labelledby": () => props["aria-labelledby"]?.(),
      "aria-describedby": () => props["aria-describedby"]?.(),
      "aria-invalid": isInvalid,
    },
    parts.triggerRef,
  );
  const { hoverProps, isHovered } = hover({ isDisabled });
  const { focusProps, isFocusVisible } = focusRing();

  onSettled(parts.placed);

  const elementProps = mergeProps(
    buttonProps,
    parts.comboboxProps,
    hoverProps,
    focusProps,
    filterDOMProps(options, { global: true }),
    styleProps(props),
    {
      // A caller's `id` is what a `<label for>` points at, and it wins.
      id: () => props.id?.() ?? access(parts.comboboxProps.id as MaybeAccessor<string>),
      dir: () => parts.dir(),
      "data-state": () => (state.isOpen() ? "open" : "closed"),
      "data-open": state.isOpen,
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-focus-visible": isFocusVisible,
      "data-disabled": isDisabled,
      "data-placeholder": () => state.selectedItem() === null,
      "data-invalid": isInvalid,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <button {...elementProps} ref={mergeRefs(parts.triggerRef.set, props.ref?.())}>
      {props.children}
    </button>
  );
}

/** A box in client coordinates. */
interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface ItemAlignmentBoxes {
  trigger: Box;
  /** The trigger's value element, whose text the option's is laid over. */
  value: Box | null;
  /** The list's own box, wherever it currently is. */
  content: Box;
  /** The chosen option, in the same coordinates as `content`. */
  item: Box;
  /** The part of the option that holds its text. */
  itemText: Box | null;
  /** The viewport the list has to stay inside. */
  boundary: { width: number; height: number };
  /** How far from the viewport's edges it must stay. @default 12 */
  padding?: number;
  /** @default "ltr" */
  direction?: "ltr" | "rtl";
}

/**
 * Where a list goes so that its chosen option lies over the trigger.
 *
 * The answer is in the terms {@link Popover} takes for a `"bottom start"`
 * placement: `offset` from the trigger's bottom edge and `crossOffset` from
 * its inline-start edge. `null` means the list would leave the viewport, and
 * the caller places it as an ordinary popover instead.
 *
 * Vertically the option is CENTRED on the trigger, so the two need not be the
 * same height. Horizontally the option's text starts where the value's does,
 * which is what makes the list read as the trigger unfolding.
 */
export function itemAlignedPosition(
  boxes: ItemAlignmentBoxes,
): { offset: number; crossOffset: number } | null {
  const { trigger, content, item, boundary } = boxes;
  const padding = boxes.padding ?? 12;
  const value = boxes.value ?? trigger;
  const text = boxes.itemText ?? item;

  const itemCentre = item.top - content.top + item.height / 2;
  const top = trigger.top + trigger.height / 2 - itemCentre;
  if (top < padding || top + content.height > boundary.height - padding) return null;

  const left =
    boxes.direction === "rtl"
      ? value.left + value.width - (text.left + text.width - content.left)
      : value.left - (text.left - content.left);
  if (left < padding || left + content.width > boundary.width - padding) return null;

  const start =
    boxes.direction === "rtl" ? trigger.left + trigger.width - content.width : trigger.left;
  return { offset: top - (trigger.top + trigger.height), crossOffset: left - start };
}

interface SelectContentValue {
  /**
   * Built off the page so the options register, with nothing to place, scroll
   * or focus.
   */
  isRegistering: boolean;
  viewportRef: ReturnType<typeof makeRef<HTMLUListElement>>;
  canScrollUp: Accessor<boolean>;
  canScrollDown: Accessor<boolean>;
  /** Re-read how far the viewport can scroll. */
  measure: () => void;
  /** The real list is in place, or has gone. */
  mounted: (isMounted: boolean) => void;
  ariaLabel: Accessor<string | undefined>;
  ariaLabelledBy: Accessor<string | undefined>;
}

const SelectContentContext = createContext<SelectContentValue | null>(null);

function useSelectContent(part: string): SelectContentValue {
  const value = getContext(SelectContentContext);
  if (value === null || value === undefined) {
    throw new Error(`A ${part} must be rendered inside a SelectContent.`);
  }
  return value;
}

function SelectContentProvider(props: Incoming<{ value: SelectContentValue; children?: Child }>) {
  return provide(
    SelectContentContext,
    () => props.value(),
    () => props.children as unknown,
  );
}

export type SelectPosition = "item-aligned" | "popper";

export interface SelectContentComponentProps extends StyleProps {
  /** A `<SelectViewport>`, and the scroll buttons either side of it. */
  children?: Child;
  /** The box the list is drawn in, which `class` and `style` land on. */
  ref?: RefTarget<HTMLDivElement>;
  /**
   * `"item-aligned"` lays the list over the trigger with the chosen option on
   * top of it, where that fits; `"popper"` hangs it off the trigger's edge.
   *
   * @default "popper"
   */
  position?: SelectPosition;
  /** Where a popper list goes, and an item-aligned one that does not fit. @default "bottom start" */
  placement?: Placement;
  /** @default 8 */
  offset?: number;
  crossOffset?: number;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

function clientBox(element: Element): Box {
  const rect = element.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

/** The box of an element that has one: a `display: contents` wrapper does not. */
function laidOutBox(element: Element | null): Box | null {
  if (element === null) return null;
  const box = clientBox(element);
  return box.width === 0 && box.height === 0 ? null : box;
}

/**
 * The popover the list opens in, and the box a design system draws.
 *
 * The listbox itself is the {@link SelectViewport} inside, so the scroll
 * buttons beside it are not children of a `role="listbox"`.
 */
export function SelectContent(props: Incoming<SelectContentComponentProps>) {
  const { parts, state } = useSelectParts("SelectContent");
  const locale = useLocale();
  const viewportRef = makeRef<HTMLUListElement>();
  const contentRef = makeRef<HTMLDivElement>();

  // Nothing is in the holder's document, so nothing in it is exposed, matched
  // by a selector or reachable by focus. A server has no document to make it
  // from and builds no portal either, so the same markup is written with or
  // without one and the client claims it unchanged.
  const holder = typeof document === "undefined" ? undefined : document.createElement("div");

  const [isMounted, setMounted] = createSignal(false, { ownedWrite: true });
  const [edges, setEdges] = createSignal({ up: false, down: false });
  const [aligned, setAligned] = createSignal<{ offset: number; crossOffset: number } | null>(null);

  const measure = (): void => {
    const viewport = viewportRef();
    if (viewport === null) return;
    const up = viewport.scrollTop > 0;
    const down = Math.ceil(viewport.scrollTop) < viewport.scrollHeight - viewport.clientHeight;
    const current = edges();
    if (current.up !== up || current.down !== down) setEdges({ up, down });
  };

  const align = (): void => {
    if (props.position?.() !== "item-aligned") return;
    const trigger = parts.triggerRef();
    const content = contentRef();
    const key = state.selectedKey();
    const item = key === null ? null : parts.registry.elementOf(key);
    if (trigger === null || content === null || item === null) return;

    const view = trigger.ownerDocument.defaultView;
    setAligned(
      itemAlignedPosition({
        trigger: clientBox(trigger),
        value: laidOutBox(parts.valueRef()),
        content: clientBox(content),
        item: clientBox(item),
        itemText: laidOutBox(item.querySelector(`[${ITEM_TEXT_ATTRIBUTE}]`)),
        boundary: { width: view?.innerWidth ?? 0, height: view?.innerHeight ?? 0 },
        direction: parts.dir() ?? locale().direction,
      }),
    );
  };

  const registering: SelectContentValue = {
    isRegistering: true,
    viewportRef,
    canScrollUp: () => false,
    canScrollDown: () => false,
    measure: () => {},
    mounted: () => {},
    ariaLabel: () => undefined,
    ariaLabelledBy: () => undefined,
  };

  const showing: SelectContentValue = {
    isRegistering: false,
    viewportRef,
    canScrollUp: () => edges().up,
    canScrollDown: () => edges().down,
    measure,
    mounted: (isIn) => {
      setMounted(isIn);
      if (!isIn) {
        setAligned(null);
        return;
      }
      align();
      measure();
    },
    ariaLabel: () => props["aria-label"]?.(),
    ariaLabelledBy: () => props["aria-labelledby"]?.(),
  };

  const options = fromProps(props);
  const elementProps = mergeProps(
    filterDOMProps(options, { global: true, labelable: true }),
    styleProps(props),
    {
      role: "presentation",
      dir: () => parts.dir(),
      "data-position": () => props.position?.() ?? "popper",
      // Said of what was ASKED for, so a design system can drop its entrance
      // animation before the first frame: the list is measured as it is drawn,
      // and a scale on it would be measured too.
      "data-align-trigger": () => String(props.position?.() === "item-aligned"),
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <>
      {/* The options stay registered across the swap: this copy is built before
          the real list leaves and dropped only after the real one is in, and a
          key registered twice keeps whichever copy is still there. */}
      <Show when={!state.isOpen() || !isMounted()}>
        <Portal mount={holder}>
          <SelectContentProvider value={registering}>{props.children}</SelectContentProvider>
        </Portal>
      </Show>
      <Popover
        triggerRef={parts.triggerRef}
        isOpen={state.isOpen()}
        onOpenChange={state.setOpen}
        placement={aligned() === null ? (props.placement?.() ?? "bottom start") : "bottom start"}
        offset={aligned()?.offset ?? props.offset?.() ?? 8}
        crossOffset={aligned()?.crossOffset ?? props.crossOffset?.()}
        shouldFlip={aligned() === null}
      >
        <SelectContentBox
          elementProps={elementProps}
          contentRef={contentRef}
          forwardedRef={props.ref?.()}
          value={showing}
        >
          {props.children}
        </SelectContentBox>
      </Popover>
    </>
  );
}

interface SelectContentBoxProps {
  elementProps: DOMProps;
  contentRef: ReturnType<typeof makeRef<HTMLDivElement>>;
  forwardedRef?: RefTarget<HTMLDivElement>;
  value: SelectContentValue;
  children?: Child;
}

/** Inside the popover, which is the only place its side and state can be read. */
function SelectContentBox(props: Incoming<SelectContentBoxProps>) {
  return (
    <div
      {...props.elementProps()}
      {...popoverStateProps()}
      ref={mergeRefs(props.contentRef().set, props.forwardedRef?.())}
    >
      <SelectContentProvider value={props.value()}>{props.children}</SelectContentProvider>
    </div>
  );
}

export interface SelectViewportComponentProps extends StyleProps {
  /** The `<Option>`s, and the groups and separators between them. */
  children?: Child;
}

/** The listbox: the scroller the options are in. */
export function SelectViewport(props: Incoming<SelectViewportComponentProps>) {
  const { parts, state } = useSelectParts("SelectViewport");
  const content = useSelectContent("SelectViewport");

  const lent: ListBoxContextValue = {
    state,
    baseId: parts.baseId,
    shouldSelectOnPressUp: () => true,
    shouldUseVirtualFocus: () => undefined,
    staticItems: parts.registry,
  };

  if (content.isRegistering) {
    return (
      <ListBoxProvider value={lent}>
        <ul>{props.children}</ul>
      </ListBoxProvider>
    );
  }

  const listRef = content.viewportRef;
  const options = parts.listBoxProps;

  // Called here rather than in the root: the autofocus is read once, at
  // construction, and the strategy the opening key set exists only once the
  // list is being built.
  const { listBoxProps } = listBox(
    {
      ...(options as unknown as Record<string, MaybeAccessor<never>>),
      ref: listRef,
      baseId: parts.baseId,
      "aria-label": content.ariaLabel,
    },
    state,
  );

  const elementProps = mergeProps(
    listBoxProps,
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      id: options.id,
      "aria-labelledby": () =>
        content.ariaLabelledBy() ??
        (content.ariaLabel() === undefined
          ? access(options["aria-labelledby"] as MaybeAccessor<string>)
          : undefined),
      onScroll: content.measure,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  resizeObserver(listRef, content.measure);
  onSettled(() => {
    content.mounted(true);
  });
  onCleanup(() => {
    content.mounted(false);
  });

  return (
    <ListBoxProvider value={lent}>
      <ul {...elementProps} ref={listRef.set}>
        {props.children}
      </ul>
    </ListBoxProvider>
  );
}

export interface SelectItemTextComponentProps extends StyleProps {
  children?: Child;
}

/**
 * The part of an option the trigger shows when the option is chosen.
 *
 * Everything else in the row, a tick or a shortcut, stays in the row.
 */
export function SelectItemText(props: Incoming<SelectItemTextComponentProps>) {
  const elementProps = mergeProps(
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    { [ITEM_TEXT_ATTRIBUTE]: "", "data-testid": () => props["data-testid"]?.() },
  );
  return <span {...elementProps}>{props.children}</span>;
}

export interface SelectScrollButtonComponentProps extends StyleProps {
  direction: "up" | "down";
  children?: Child;
}

/** How often a held scroll button moves the list, in milliseconds. */
const SCROLL_INTERVAL = 50;

/**
 * An arrow at one end of the list, there only while the list can scroll that
 * way.
 *
 * It scrolls for as long as the pointer is over it, a row at a time, and it is
 * hidden from assistive technology: the keyboard already scrolls the list by
 * moving through it, so the arrow is a pointer's convenience and nothing a
 * screen reader user needs to find.
 */
export function SelectScrollButton(props: Incoming<SelectScrollButtonComponentProps>) {
  useSelectParts("SelectScrollButton");
  const content = useSelectContent("SelectScrollButton");
  if (content.isRegistering) return null;

  const isUp = props.direction() === "up";
  let timer: ReturnType<typeof setInterval> | undefined;

  const stop = (): void => {
    clearInterval(timer);
    timer = undefined;
  };

  const step = (): void => {
    const viewport = content.viewportRef();
    if (viewport === null) return;
    const row = viewport.querySelector<HTMLElement>('[role="option"]')?.offsetHeight ?? 0;
    const distance = row > 0 ? row : 32;
    viewport.scrollTop += isUp ? -distance : distance;
    content.measure();
  };

  const start = (): void => {
    if (timer === undefined) timer = setInterval(step, SCROLL_INTERVAL);
  };

  onCleanup(stop);

  const elementProps = mergeProps(
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      "aria-hidden": "true",
      onPointerDown: start,
      onPointerMove: start,
      onPointerLeave: stop,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <Show when={isUp ? content.canScrollUp() : content.canScrollDown()}>
      <ScrollButton elementProps={elementProps} onLeave={stop}>
        {props.children}
      </ScrollButton>
    </Show>
  );
}

/**
 * Its own component so that leaving the document stops the timer: the button
 * goes the moment the list reaches its end, with the pointer still over it and
 * no `pointerleave` to say so.
 */
function ScrollButton(
  props: Incoming<{ elementProps: DOMProps; onLeave: () => void; children?: Child }>,
) {
  onCleanup(() => props.onLeave()());
  return <div {...props.elementProps()}>{props.children}</div>;
}

export { Option };
