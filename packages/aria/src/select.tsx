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
  context,
  effect,
  getContext,
  getOwner,
  type Incoming,
  install,
  signal,
} from "@barqjs/core";
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
import { Popover } from "./dialog.tsx";
import { focusRing } from "./focus.ts";
import { collator } from "./i18n.ts";
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
import { listBox, ListBoxProvider, Option, provideItemNode } from "./listbox.tsx";
import { visuallyHidden } from "./live.ts";
import { menuTrigger } from "./menu.tsx";
import { overlayTriggerState, type OverlayTriggerState, type Placement } from "./overlays.ts";
import { ListKeyboardDelegate, typeSelect, type KeyboardDelegate } from "./selection.ts";
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
  const strategy = signal<FocusStrategy | null>(null);
  const isFocused = signal(false);

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
    setFocused: (next) => isFocused.set(next),
    focusStrategy: strategy,
    open(focusStrategy: FocusStrategy | null = null) {
      if (!hasItems()) return;
      strategy.set(focusStrategy);
      overlay.open();
    },
    toggle(focusStrategy: FocusStrategy | null = null) {
      if (!hasItems()) return;
      strategy.set(focusStrategy);
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
  effect(() => {
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
}

const SelectContext = context<SelectContextValue | null>(null);

export function useSelect(): SelectContextValue {
  const value = getContext(SelectContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a Select.");
  }
  return value;
}

export interface SelectValueComponentProps extends StyleProps {
  children?: Child;
}

/**
 * What is currently chosen, or the placeholder.
 *
 * The element it renders is what `aria-labelledby` on the trigger points at,
 * so a select whose value is an icon still announces something.
 */
export function SelectValue(props: Incoming<SelectValueComponentProps>) {
  const picker = useSelect();

  const elementProps = mergeProps(
    picker.valueProps,
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      "data-placeholder": () => picker.state.selectedItem() === null,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <span {...elementProps}>
      {() => {
        const selected = picker.state.selectedItem();
        if (selected !== null) return selected.textValue;
        return picker.placeholder() ?? "";
      }}
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

  const renderOption = props.children as unknown as (scope: unknown, item: T) => Child;

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
          state={state}
          listRef={listRef}
          render={renderOption as unknown as (scope: unknown, item: unknown) => Child}
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
  state: SelectState<unknown>;
  listRef: ReturnType<typeof makeRef<HTMLUListElement>>;
  render: (scope: unknown, item: unknown) => Child;
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

  const elementProps = mergeProps(listBoxProps, {
    id: options.id,
    "aria-labelledby": options["aria-labelledby"],
    class: props.listClass,
    "data-slot": "select-list",
  });

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
            return render(getOwner(), node.value);
          }}
        </For>
      </ul>
    </ListBoxProvider>
  );
}

export { Option };
