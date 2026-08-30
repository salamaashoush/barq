/**
 * A combo box: a text field that filters a list of options.
 *
 * The hard part is that focus is in two places at once. The caret stays in the
 * input — a user typing must not lose it — while the arrow keys move a
 * highlight through the list. That is VIRTUAL focus: the input keeps DOM
 * focus and names the highlighted option with `aria-activedescendant`, and no
 * option is ever focused itself. Moving real focus into the list would take
 * the caret with it and make typing impossible.
 *
 * Everything else follows from what the input value means at a given moment:
 *
 * - Typing filters, opens the list, and un-highlights whatever was
 *   highlighted, because the old highlight was for a list that no longer
 *   exists.
 * - Enter COMMITS the highlighted option: it becomes the selection, its text
 *   replaces what was typed, and the list closes.
 * - Escape REVERTS to the selected option's text, so a half-typed query never
 *   survives as the value.
 * - Blur commits, for the same reason. Leaving a field showing text that is
 *   not its value is how a form submits something the user never saw.
 *
 * `allowsCustomValue` is the opt-out: with it, text matching nothing is a
 * value in its own right and committing keeps it.
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
  signal,
  untrack,
} from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { button } from "./button.tsx";
import {
  buildCollection,
  listState,
  type FocusStrategy,
  type ItemAccessors,
  type Key,
  type ListState,
  type ListStateOptions,
  type Node,
  type SelectionValue,
} from "./collections.ts";
import { Popover } from "./dialog.tsx";
import { focusRing } from "./focus.ts";
import { filter as makeFilter } from "./i18n.ts";
import { hover } from "./interactions/hover.ts";
import type { ElementRef } from "./interactions/press.ts";
import { field, type FieldOptions } from "./label.ts";
import {
  fieldValidation,
  type FormValidationState,
  type ValidateFunction,
  type ValidationBehavior,
} from "./validation.ts";
import {
  listBox,
  ListBoxProvider,
  Option,
  optionIdFor,
  provideItemNode,
  type ListBoxContextValue,
} from "./listbox.tsx";
import {
  overlayTriggerState,
  type OverlayTriggerState,
  type OverlayTriggerStateOptions,
  type Placement,
} from "./overlays.ts";
import { ListKeyboardDelegate, selectableCollection, type KeyboardDelegate } from "./selection.ts";
import {
  access,
  callback,
  controllable,
  filterDOMProps,
  fromProps,
  id,
  mergeProps,
  styleProps,
  type DOMProps,
  type MaybeAccessor,
  type StyleProps,
} from "./utils.ts";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** What asked for the list. Only a manual open shows everything. */
export type MenuTriggerAction = "focus" | "input" | "manual";

export type FilterFn = (textValue: string, inputValue: string) => boolean;

export interface ComboBoxStateOptions<T> extends Omit<
  ListStateOptions<T>,
  "onSelectionChange" | "filter"
> {
  selectedKey?: MaybeAccessor<Key | null | undefined>;
  defaultSelectedKey?: MaybeAccessor<Key | null | undefined>;
  inputValue?: MaybeAccessor<string | undefined>;
  defaultInputValue?: MaybeAccessor<string | undefined>;
  /**
   * Which options the typed text keeps.
   *
   * Locale-aware `contains` by default, so "resume" finds "résumé". Pass
   * `() => true` when the caller filters `items` itself.
   */
  filterBy?: FilterFn;
  /** Text matching no option is a value of its own. @default false */
  allowsCustomValue?: MaybeAccessor<boolean | undefined>;
  /** @default false */
  allowsEmptyCollection?: MaybeAccessor<boolean | undefined>;
  /** @default true */
  shouldCloseOnBlur?: MaybeAccessor<boolean | undefined>;
  /** What opens the list. @default "input" */
  menuTrigger?: MaybeAccessor<"input" | "focus" | "manual" | undefined>;
  isReadOnly?: MaybeAccessor<boolean | undefined>;
  isOpen?: MaybeAccessor<boolean | undefined>;
  defaultOpen?: MaybeAccessor<boolean | undefined>;
  onOpenChange?: (isOpen: boolean, trigger?: MenuTriggerAction) => void;
  onSelectionChange?: (key: Key | null) => void;
  onInputChange?: (value: string) => void;
}

export interface ComboBoxState<T>
  extends ListState<T>, Omit<OverlayTriggerState, "open" | "toggle"> {
  selectedKey: Accessor<Key | null>;
  setSelectedKey(key: Key | null): void;
  selectedItem: Accessor<Node<T> | null>;
  inputValue: Accessor<string>;
  setInputValue(value: string): void;
  defaultInputValue: Accessor<string>;
  isFocused: Accessor<boolean>;
  setFocused(isFocused: boolean): void;
  focusStrategy: Accessor<FocusStrategy | null>;
  open(focusStrategy?: FocusStrategy | null, trigger?: MenuTriggerAction): void;
  toggle(focusStrategy?: FocusStrategy | null, trigger?: MenuTriggerAction): void;
  /** Take the highlighted option, or the typed text, as the value. */
  commit(): void;
  /** Put the selected option's text back and close. */
  revert(): void;
}

export function comboBoxState<T>(options: ComboBoxStateOptions<T>): ComboBoxState<T> {
  const overlay = overlayTriggerState({
    ...(options as OverlayTriggerStateOptions),
    onOpenChange: (open) => options.onOpenChange?.(open, open ? lastTrigger : undefined),
  });
  const showAll = signal(false);
  const isFocused = signal(false);
  const strategy = signal<FocusStrategy | null>(null);
  let lastTrigger: MenuTriggerAction | undefined = "focus";

  const match = makeFilter({ sensitivity: "base" });
  const keeps = (): FilterFn => options.filterBy ?? match.contains;

  const [selectedKey, setSelectedKey] = controllable<Key | null>(
    () => access(options.selectedKey),
    () => access(options.defaultSelectedKey) ?? null,
    options.onSelectionChange,
  );

  /** The whole list, before anything typed narrows it. */
  const full = computed(() => buildCollection(access(options.items) ?? [], options));

  const initialInput = (): string => {
    const declared = access(options.defaultInputValue);
    if (declared !== undefined) return declared;
    const key = access(options.selectedKey) ?? access(options.defaultSelectedKey) ?? null;
    return key === null ? "" : (full().getItem(key)?.textValue ?? "");
  };

  const [inputValue, setInputValueRaw] = controllable<string>(
    () => access(options.inputValue),
    initialInput,
    options.onInputChange,
  );

  const list = listState<T>({
    ...options,
    selectionMode: "single",
    disallowEmptySelection: true,
    allowDuplicateSelectionEvents: true,
    selectedKeys: () => {
      const key = selectedKey();
      return key === null ? [] : [key];
    },
    filter: (nodes) => {
      if (showAll()) return nodes;
      const query = inputValue();
      const keep = keeps();
      const kept: Node<T>[] = [];
      for (const node of nodes) {
        if (node.type !== "item" || keep(node.textValue, query)) kept.push(node);
      }
      return kept;
    },
    onSelectionChange: (keys: SelectionValue) => {
      const key = keys === "all" ? null : (keys.values().next().value ?? null);
      setSelectedKey(key);
      // Choosing puts the option's own text in the field: what the field shows
      // and what the field IS have to agree the moment the list closes.
      syncedKey = key;
      setInputValueRaw(key === null ? "" : (list.collection().getItem(key)?.textValue ?? ""));
      overlay.close();
    },
  });

  const selectedItem = (): Node<T> | null => {
    const key = selectedKey();
    return key === null ? null : (full().getItem(key) ?? null);
  };

  const selectedText = (): string => selectedItem()?.textValue ?? "";

  const canShow = (displayAll: boolean): boolean => {
    if (access(options.allowsEmptyCollection) === true) return true;
    if (displayAll) return full().size > 0;
    return list.collection().size > 0;
  };

  const displaysAll = (trigger?: MenuTriggerAction): boolean =>
    trigger === "manual" || (trigger === "focus" && access(options.menuTrigger) === "focus");

  const open = (focusStrategy: FocusStrategy | null = null, trigger?: MenuTriggerAction): void => {
    const all = displaysAll(trigger);
    if (!canShow(all)) return;
    if (all) showAll.set(true);
    lastTrigger = trigger;
    strategy.set(focusStrategy);
    overlay.open();
  };

  const toggle = (
    focusStrategy: FocusStrategy | null = null,
    trigger?: MenuTriggerAction,
  ): void => {
    if (overlay.isOpen()) {
      overlay.close();
      return;
    }
    open(focusStrategy, trigger);
  };

  /**
   * The key the field's text was last written FOR.
   *
   * Without it, following an outside change to `selectedKey` cannot be told
   * from following one this component just made — and a custom value, which
   * deliberately clears the key while keeping the text, looks like the second.
   */
  let syncedKey: Key | null = untrack(selectedKey);

  const resetInput = (): void => {
    syncedKey = selectedKey();
    setInputValueRaw(selectedText());
  };

  const commitValue = (): void => {
    if (access(options.allowsCustomValue) === true && inputValue() !== selectedText()) {
      // Text matching nothing IS the value, so the selection goes away rather
      // than the text.
      syncedKey = null;
      setSelectedKey(null);
      overlay.close();
      return;
    }
    resetInput();
    overlay.close();
  };

  const commit = (): void => {
    const manager = list.selectionManager();
    if (overlay.isOpen() && manager.focusedKey !== null) {
      // Committing the option that is already selected changes nothing to
      // report, so the close and the text reset happen here instead.
      if (manager.isSelected(manager.focusedKey)) {
        resetInput();
        overlay.close();
        return;
      }
      manager.select(manager.focusedKey);
      return;
    }
    commitValue();
  };

  const revert = (): void => {
    if (access(options.allowsCustomValue) === true && selectedKey() === null) {
      overlay.close();
      return;
    }
    resetInput();
    overlay.close();
  };

  const setInputValue = (value: string): void => {
    const changed = value !== inputValue();
    setInputValueRaw(value);
    if (!changed) return;

    // The highlight was for a list that no longer exists.
    showAll.set(false);
    list.selectionManager().setFocusedKey(null);

    // Clearing the field clears the value. Not when the caller controls it:
    // then the value is theirs to decide.
    if (value === "" && access(options.selectedKey) === undefined) {
      syncedKey = null;
      setSelectedKey(null);
    }

    if (access(options.menuTrigger) !== "manual" && isFocused() && !overlay.isOpen()) {
      open(null, "input");
    }
  };

  const setFocused = (next: boolean): void => {
    if (next) {
      if (access(options.menuTrigger) === "focus" && access(options.isReadOnly) !== true) {
        open(null, "focus");
      }
    } else if (access(options.shouldCloseOnBlur) !== false) {
      commitValue();
    }
    isFocused.set(next);
  };

  if (!isServer) {
    // The list is only ever the FOCUSED collection while it is open, and the
    // highlight does not survive a close: reopening starts from the selection.
    effect(() => {
      const isOpen = overlay.isOpen();
      const manager = list.selectionManager();
      manager.setFocused(isOpen);
      if (!isOpen) manager.setFocusedKey(null);
    });

    // A list that has filtered down to nothing is a dead end.
    effect(() => {
      if (!overlay.isOpen() || showAll()) return;
      if (access(options.allowsEmptyCollection) === true) return;
      if (list.collection().size === 0) overlay.close();
    });

    // The field follows a selection made from OUTSIDE, and the selected
    // item's text if it arrives late. Never one this component just made, and
    // never while the user is in the field: either would rewrite what they
    // are typing.
    effect(() => {
      const key = selectedKey();
      const item = selectedItem();
      if (access(options.inputValue) !== undefined) return;
      if (key !== syncedKey) {
        syncedKey = key;
        setInputValueRaw(item?.textValue ?? "");
        return;
      }
      if (isFocused() || item === null) return;
      if (inputValue() !== item.textValue) setInputValueRaw(item.textValue);
    });
  }

  return {
    ...list,
    isOpen: overlay.isOpen,
    setOpen: overlay.setOpen,
    close: overlay.close,
    selectedKey,
    setSelectedKey: (key) => {
      syncedKey = key;
      setSelectedKey(key);
      setInputValueRaw(key === null ? "" : (full().getItem(key)?.textValue ?? ""));
    },
    selectedItem,
    inputValue,
    setInputValue,
    defaultInputValue: () => initialInput(),
    isFocused,
    setFocused,
    focusStrategy: strategy,
    open,
    toggle,
    commit,
    revert,
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface ComboBoxOptions extends FieldOptions {
  inputRef: ElementRef<HTMLInputElement>;
  listBoxRef: ElementRef;
  popoverRef?: ElementRef;
  buttonRef?: ElementRef;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isReadOnly?: MaybeAccessor<boolean | undefined>;
  isRequired?: MaybeAccessor<boolean | undefined>;
  shouldFocusWrap?: MaybeAccessor<boolean | undefined>;
  name?: MaybeAccessor<string | undefined>;
  form?: MaybeAccessor<string | undefined>;
  placeholder?: MaybeAccessor<string | undefined>;
  keyboardDelegate?: KeyboardDelegate;
  /** What the page thinks of the choice, checked as it changes. */
  validate?: ValidateFunction<Key | null>;
  /** @default "aria" */
  validationBehavior?: MaybeAccessor<ValidationBehavior | undefined>;
}

export interface ComboBoxResult {
  labelProps: DOMProps;
  inputProps: DOMProps;
  /** Options for {@link button}, not props for an element. */
  buttonProps: DOMProps;
  listBoxProps: DOMProps;
  descriptionProps: DOMProps;
  errorMessageProps: DOMProps;
  /** The base every option id is derived from, shared with the listbox. */
  baseId: Accessor<string>;
  /** What is wrong with the choice, and whether the user is being told. */
  validation: FormValidationState;
  errors: Accessor<string[]>;
  isInvalid: Accessor<boolean>;
}

export function comboBox(options: ComboBoxOptions, state: ComboBoxState<unknown>): ComboBoxResult {
  const baseId = id();
  const listBoxId = id();

  const {
    state: validation,
    isInvalid,
    errors,
    errorMessage,
  } = fieldValidation<Key | null>({
    value: state.selectedKey,
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
  });

  const delegate =
    options.keyboardDelegate ??
    new ListKeyboardDelegate({
      collection: state.collection,
      ref: options.listBoxRef,
      disabledKeys: state.disabledKeys,
    });

  // The arrows drive the LIST while the caret stays in the input, so the
  // collection's key handling is bound to the input rather than to the list.
  const { collectionProps } = selectableCollection({
    ref: options.inputRef,
    selectionManager: state.selectionManager,
    keyboardDelegate: delegate,
    shouldUseVirtualFocus: true,
    disallowTypeAhead: true,
    disallowEmptySelection: true,
    shouldFocusWrap: options.shouldFocusWrap,
  });

  const focusedItem = (): Node<unknown> | null => {
    if (!state.isOpen()) return null;
    const key = state.selectionManager().focusedKey;
    return key === null ? null : state.collection().getItem(key);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (access(options.isReadOnly) === true) return;

    switch (event.key) {
      case "Enter": {
        // Only swallow it while the list is open: a closed combo box inside a
        // form must still submit on Enter.
        if (state.isOpen()) event.preventDefault();
        state.commit();
        return;
      }
      case "Tab": {
        if (state.isOpen()) state.commit();
        return;
      }
      case "Escape": {
        state.revert();
        return;
      }
      case "ArrowDown": {
        if (!state.isOpen()) {
          event.preventDefault();
          state.open("first", "manual");
        }
        return;
      }
      case "ArrowUp": {
        if (!state.isOpen()) {
          event.preventDefault();
          state.open("last", "manual");
        }
        return;
      }
      // The caret is the point of these: moving it un-highlights, so the next
      // Down starts from the top rather than from where the user left off.
      case "ArrowLeft":
      case "ArrowRight": {
        state.selectionManager().setFocusedKey(null);
        return;
      }
      default:
        return;
    }
  };

  const onInput = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    state.setInputValue(input.value);
    // The field has already changed itself; a controlled owner that declined
    // re-renders nothing, so the DOM has to be put back by hand.
    if (input.value !== state.inputValue()) input.value = state.inputValue();
  };

  return {
    baseId,
    descriptionProps,
    errorMessageProps,
    validation,
    errors,
    isInvalid,
    labelProps: mergeProps(labelProps, {
      onClick: () => {
        if (access(options.isDisabled) === true) return;
        (access(options.inputRef) as HTMLInputElement | null)?.focus();
      },
    }),
    inputProps: mergeProps(
      filterDOMProps(options, { labelable: true }),
      fieldProps,
      // Only while the list is open: the arrows belong to the caret otherwise.
      {
        onKeyDown: (event: KeyboardEvent) => {
          if (state.isOpen()) (collectionProps.onKeyDown as (e: KeyboardEvent) => void)?.(event);
        },
      },
      { onKeyDown },
      {
        role: "combobox",
        type: "text",
        value: state.inputValue,
        disabled: () => access(options.isDisabled) === true,
        readOnly: () => access(options.isReadOnly) === true,
        required: () => access(options.isRequired) === true,
        name: () => access(options.name),
        form: () => access(options.form),
        placeholder: () => access(options.placeholder),
        "aria-expanded": () => state.isOpen(),
        "aria-controls": () => (state.isOpen() ? listBoxId() : undefined),
        "aria-autocomplete": "list",
        "aria-invalid": () => isInvalid() || undefined,
        "aria-required": () => access(options.isRequired) === true || undefined,
        // Virtual focus: the input keeps DOM focus and NAMES the highlighted
        // option, so the caret never moves and the highlight still travels.
        "aria-activedescendant": () => {
          const item = focusedItem();
          return item === null ? undefined : optionIdFor(baseId(), item.key);
        },
        // The combo box has its own suggestions; the browser's would cover
        // them, and iOS autocorrect would rewrite the query as it is typed.
        autocomplete: "off",
        autocorrect: "off",
        spellcheck: "false",
        onInput,
        onFocus: () => state.setFocused(true),
        onBlur: (event: FocusEvent) => {
          // Focus moving to the toggle button or into the popover is still
          // focus on the combo box.
          const related = event.relatedTarget as Element | null;
          if (related !== null) {
            const toggle = access(options.buttonRef ?? options.inputRef) as Element | null;
            const popover = access(options.popoverRef ?? options.listBoxRef) as Element | null;
            if (toggle?.contains(related) === true || popover?.contains(related) === true) return;
          }
          state.setFocused(false);
          validation.commitValidation();
        },
      },
    ),
    buttonProps: {
      id: () => `${baseId()}-button`,
      // The input is the control; the button is a shortcut to the same list,
      // and a second Tab stop for it would be a stop that does nothing new.
      excludeFromTabOrder: true,
      preventFocusOnPress: true,
      isDisabled: () => access(options.isDisabled) === true || access(options.isReadOnly) === true,
      "aria-haspopup": true,
      "aria-expanded": () => state.isOpen(),
      "aria-controls": () => (state.isOpen() ? listBoxId() : undefined),
      "aria-labelledby": () =>
        [
          access(fieldProps["aria-labelledby"] as MaybeAccessor<string | undefined>),
          `${baseId()}-button`,
        ]
          .filter(Boolean)
          .join(" "),
      "aria-label": "Show suggestions",
      onPressStart: (event: { pointerType: string }) => {
        if (event.pointerType === "touch") return;
        (access(options.inputRef) as HTMLInputElement | null)?.focus();
        state.toggle(
          event.pointerType === "keyboard" || event.pointerType === "virtual" ? "first" : null,
          "manual",
        );
      },
      onPress: (event: { pointerType: string }) => {
        if (event.pointerType !== "touch") return;
        (access(options.inputRef) as HTMLInputElement | null)?.focus();
        state.toggle(null, "manual");
      },
    },
    listBoxProps: {
      id: listBoxId,
      baseId,
      "aria-labelledby": fieldProps["aria-labelledby"],
      autoFocus: () => state.focusStrategy() ?? true,
      shouldUseVirtualFocus: true,
      shouldSelectOnPressUp: true,
      disallowEmptySelection: true,
      linkBehavior: "selection",
    },
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface ComboBoxContextValue {
  state: ComboBoxState<unknown>;
}

const ComboBoxContext = context<ComboBoxContextValue | null>(null);

export function useComboBox(): ComboBoxContextValue {
  const value = getContext(ComboBoxContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a ComboBox.");
  }
  return value;
}

export interface ComboBoxComponentProps<T> extends StyleProps, ItemAccessors<T> {
  /** Everything that can be chosen, before the typed text narrows it. */
  items: Iterable<T>;
  /** How one value renders. Return an `<Option>`. */
  children: (item: T) => Child;
  label?: Child;
  description?: Child;
  errorMessage?: Child;
  placeholder?: string;
  selectedKey?: Key | null;
  defaultSelectedKey?: Key | null;
  inputValue?: string;
  defaultInputValue?: string;
  disabledKeys?: Iterable<Key>;
  /** @default a locale-aware `contains` */
  filterBy?: FilterFn;
  allowsCustomValue?: boolean;
  allowsEmptyCollection?: boolean;
  shouldFocusWrap?: boolean;
  /** @default "input" */
  menuTrigger?: "input" | "focus" | "manual";
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  isInvalid?: boolean;
  /** What the page thinks of the choice, checked as it changes. */
  validate?: ValidateFunction<Key | null>;
  /** @default "aria" */
  validationBehavior?: ValidationBehavior;
  name?: string;
  form?: string;
  /** @default "bottom start" */
  placement?: Placement;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  ref?: RefTarget<HTMLInputElement>;
  onSelectionChange?: (key: Key | null) => void;
  onInputChange?: (value: string) => void;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * ```tsx
 * <ComboBox label="Fruit" items={fruits()} onSelectionChange={(key) => picked.set(key)}>
 *   {(fruit) => <Option>{fruit.name}</Option>}
 * </ComboBox>
 * ```
 */
export function ComboBox<T>(props: Incoming<ComboBoxComponentProps<T>>) {
  const inputRef = makeRef<HTMLInputElement>();
  const listRef = makeRef<HTMLUListElement>();
  const buttonRef = makeRef<HTMLButtonElement>();
  const options = fromProps(props as unknown as Incoming<Record<string, unknown>>);

  const state = comboBoxState<T>({
    ...(options as ComboBoxStateOptions<T>),
    filterBy: callback<[string, string], boolean>(props.filterBy),
    onSelectionChange: (key) => props.onSelectionChange?.()?.(key),
    onInputChange: (value) => props.onInputChange?.()?.(value),
    onOpenChange: (isOpen) => props.onOpenChange?.()?.(isOpen),
  });

  const {
    labelProps,
    inputProps,
    buttonProps: buttonOptions,
    listBoxProps,
    descriptionProps,
    errorMessageProps,
    errors,
    isInvalid,
  } = comboBox(
    {
      ...(options as unknown as ComboBoxOptions),
      inputRef,
      listBoxRef: listRef,
      buttonRef,
      validate: callback(props.validate),
      validationBehavior: () => props.validationBehavior?.(),
    },
    state,
  );

  const { buttonProps } = button(buttonOptions, buttonRef);
  const { hoverProps, isHovered } = hover({ isDisabled: () => props.isDisabled?.() });
  const { focusProps, isFocusVisible } = focusRing();

  const inputElementProps = mergeProps(inputProps, focusProps, styleProps(props), {
    "data-focus-visible": isFocusVisible,
    "data-open": state.isOpen,
    "data-disabled": () => props.isDisabled?.() === true,
    "data-invalid": isInvalid,
    "data-testid": () => props["data-testid"]?.(),
  });

  const buttonElementProps = mergeProps(buttonProps, hoverProps, {
    // The button names itself with "Show suggestions" AND the field's label,
    // so the id it points at has to be on the element.
    id: buttonOptions.id,
    "data-hovered": isHovered,
    "data-open": state.isOpen,
  });

  const renderOption = props.children as unknown as (scope: unknown, item: T) => Child;

  const owner = getOwner();
  if (owner !== null) {
    install(owner, ComboBoxContext, () => ({
      state: state as unknown as ComboBoxState<unknown>,
    }));
  }

  return (
    <>
      <span {...labelProps}>{props.label}</span>
      <input {...inputElementProps} ref={mergeRefs(inputRef.set, props.ref?.())} />
      <button {...buttonElementProps} type="button" ref={buttonRef.set}>
        <span aria-hidden="true">▾</span>
      </button>
      <Popover
        triggerRef={inputRef}
        isOpen={state.isOpen()}
        onOpenChange={state.setOpen}
        placement={props.placement?.() ?? "bottom start"}
        isDismissable
      >
        <ComboBoxList
          options={listBoxProps}
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

interface ComboBoxListProps {
  options: DOMProps;
  state: ComboBoxState<unknown>;
  listRef: ReturnType<typeof makeRef<HTMLUListElement>>;
  render: (scope: unknown, item: unknown) => Child;
}

/**
 * The listbox inside the popover.
 *
 * Built only once the list is open, so its autofocus reads the focus strategy
 * the opening keypress set rather than the one from before it.
 */
function ComboBoxList(props: Incoming<ComboBoxListProps>) {
  const state = props.state();
  const listRef = props.listRef();
  const render = props.render();
  const options = props.options();

  const { listBoxProps, baseId } = listBox(
    { ...(options as unknown as Record<string, MaybeAccessor<never>>), ref: listRef },
    state,
  );

  const elementProps = mergeProps(listBoxProps, {
    id: options.id,
    "aria-labelledby": options["aria-labelledby"],
  });

  const value: ListBoxContextValue = {
    state: state,
    baseId,
    shouldSelectOnPressUp: () => true,
    shouldUseVirtualFocus: () => true,
  };

  return (
    <ListBoxProvider value={value}>
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
