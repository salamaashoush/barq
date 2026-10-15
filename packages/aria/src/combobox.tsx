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
  createMemo,
  createContext,
  createProjection,
  createEffect,
  getContext,
  getOwner,
  type Incoming,
  install,
  isBlock,
  isServer,
  createSignal,
  onCleanup,
  onSettled,
  Portal,
  provide,
  Show,
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
import { focusRing, focusScope } from "./focus.ts";
import { declaredDirection, filter as makeFilter, useLocale } from "./i18n.ts";
import { hover } from "./interactions/hover.ts";
import type { ElementRef, PressEvent } from "./interactions/press.ts";
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
  alignOf,
  overlay as dismissal,
  overlayPosition,
  overlayTriggerState,
  placementFor,
  portalContainer,
  usePortalTarget,
  type Align,
  type OverlayTriggerState,
  type OverlayTriggerStateOptions,
  type Placement,
  type Side,
} from "./overlays.ts";
import { presence } from "./presence.ts";
import { ListKeyboardDelegate, selectableCollection, type KeyboardDelegate } from "./selection.ts";
import {
  provideStaticSection,
  staticAccessors,
  staticCollection,
  staticItem,
  type StaticCollection,
  type StaticEntry,
} from "./static-collection.ts";
import {
  access,
  callback,
  controllable,
  filterDOMProps,
  fromProps,
  id,
  mergeProps,
  provideTriggerSlot,
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
  const [showAll, setShowAll] = createSignal(false);
  const [isFocused, setIsFocused] = createSignal(false);
  const [strategy, setStrategy] = createSignal<FocusStrategy | null>(null);
  let lastTrigger: MenuTriggerAction | undefined = "focus";

  const match = makeFilter({ sensitivity: "base" });
  const keeps = (): FilterFn => options.filterBy ?? match.contains;

  const [selectedKey, setSelectedKey] = controllable<Key | null>(
    () => access(options.selectedKey),
    () => access(options.defaultSelectedKey) ?? null,
    options.onSelectionChange,
  );

  /** The whole list, before anything typed narrows it. */
  const full = createMemo(() => buildCollection(access(options.items) ?? [], options));

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
    if (all) setShowAll(true);
    lastTrigger = trigger;
    setStrategy(focusStrategy);
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
    setShowAll(false);
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
    setIsFocused(next);
  };

  if (!isServer) {
    // The list is only ever the FOCUSED collection while it is open, and the
    // highlight does not survive a close: reopening starts from the selection.
    createEffect(
      () => [overlay.isOpen(), list.selectionManager()] as const,
      ([isOpen, manager]) => {
        manager.setFocused(isOpen);
        if (!isOpen) manager.setFocusedKey(null);
      },
    );

    // A list that has filtered down to nothing is a dead end.
    createEffect(
      () =>
        !overlay.isOpen() || showAll() || access(options.allowsEmptyCollection) === true
          ? null
          : list.collection(),
      (collection) => {
        if (collection !== null && collection.size === 0) overlay.close();
      },
    );

    // The field follows a selection made from OUTSIDE, and the selected
    // item's text if it arrives late. Never one this component just made, and
    // never while the user is in the field: either would rewrite what they
    // are typing.
    createEffect(
      () =>
        [
          selectedKey(),
          selectedItem(),
          access(options.inputValue),
          isFocused(),
          inputValue(),
        ] as const,
      ([key, item, controlled, focused, text]) => {
        if (controlled !== undefined) return;
        if (key !== syncedKey) {
          syncedKey = key;
          setInputValueRaw(item?.textValue ?? "");
          return;
        }
        if (focused || item === null) return;
        if (text !== item.textValue) setInputValueRaw(item.textValue);
      },
    );
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

const ComboBoxContext = createContext<ComboBoxContextValue | null>(null);

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

  const inputElementProps = mergeProps(
    inputProps,
    focusProps,
    filterDOMProps(options, { global: true }),
    styleProps(props),
    {
      "data-focus-visible": isFocusVisible,
      "data-open": state.isOpen,
      "data-disabled": () => props.isDisabled?.() === true,
      "data-invalid": isInvalid,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  const buttonElementProps = mergeProps(buttonProps, hoverProps, {
    // The button names itself with "Show suggestions" AND the field's label,
    // so the id it points at has to be on the element.
    id: buttonOptions.id,
    "data-hovered": isHovered,
    "data-open": state.isOpen,
  });

  const renderOption = props.children;

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

interface ComboBoxListProps {
  options: DOMProps;
  state: ComboBoxState<unknown>;
  listRef: ReturnType<typeof makeRef<HTMLUListElement>>;
  render: (item: unknown) => Child;
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
            return render(node.value);
          }}
        </For>
      </ul>
    </ListBoxProvider>
  );
}

export { Option };

// ---------------------------------------------------------------------------
// The combobox as parts
// ---------------------------------------------------------------------------

/**
 * The same widget, taken apart: a root that holds the state and an input, a
 * popup, a list and its items that each render their own element and find one
 * another through it. {@link ComboBox} above builds all of it from `items`;
 * this is for a design system that has to put its own markup between the
 * pieces.
 *
 * The decisions that are not the pattern's own:
 *
 * - **The collection is whatever rendered.** An item registers itself, whether
 *   a callback built it from `items` or it was written as a child, so the two
 *   forms share one keyboard model and one selection.
 * - **A value is the item itself, not a key.** `onValueChange` hands back what
 *   `<ComboboxItem value>` was given. Identity is `itemToStringValue`, so two
 *   objects describing the same thing are the same choice.
 * - **The text in the field is a query only once it has been typed.** A field
 *   showing its value's label would otherwise open on a list filtered down to
 *   the one thing already chosen.
 * - **Where the input is decides what the popup is.** An input outside it
 *   keeps focus and the popup takes none; with no input outside, the popup is
 *   where the keyboard goes, so it takes focus, holds it and gives it back.
 */

/** Whether an item survives the typed text. */
export type ComboboxFilter<V> = (
  item: V,
  query: string,
  itemToStringLabel: (item: V) => string,
) => boolean;

/** A run of items under one heading, as `items` may hold them. */
export interface ComboboxItemGroup<V> {
  items: readonly V[];
}

export interface ComboboxRootProps<V> {
  children?: Child;
  /**
   * Everything that can be chosen, for a list written as a callback. Leave it
   * out and the `<ComboboxItem>`s written as children are the list.
   */
  items?: Iterable<V | ComboboxItemGroup<V>>;
  /** One item, or an array of them with `multiple`. */
  value?: V | readonly V[] | null;
  defaultValue?: V | readonly V[] | null;
  onValueChange?: (value: V | readonly V[] | null) => void;
  inputValue?: string;
  defaultInputValue?: string;
  onInputValueChange?: (value: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Several values rather than one. The list stays open while choosing. */
  multiple?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  /** Puts the value in the enclosing form, one field per chosen item. */
  name?: string;
  form?: string;
  /** Highlight the first match as the text changes. @default false */
  autoHighlight?: boolean;
  /** @default true */
  openOnInputClick?: boolean;
  /** What an item reads as. @default its `label`, or the text it rendered */
  itemToStringLabel?: (item: V) => string;
  /** What identifies an item and is submitted for it. @default its `value` */
  itemToStringValue?: (item: V) => string;
  /** @default a locale-aware `contains` on the label; `null` keeps everything */
  filter?: ComboboxFilter<V> | null;
}

type ItemRender = (item: unknown, index: number) => Child;

/**
 * The callback among a part's children, if that is what they are.
 *
 * Children arrive as a Block either way. One that takes the item has a
 * parameter; children that were simply written have none.
 */
function renderCallback(children: unknown): ItemRender | null {
  if (typeof children !== "function") return null;
  if (children.length > 0) return children as ItemRender;
  if (isBlock(children)) return null;
  const inner: unknown = (children as () => unknown)();
  return typeof inner === "function" && inner.length > 0 ? (inner as ItemRender) : null;
}

/** `text` with everything an id cannot hold escaped, and no two texts made the same. */
function idSafe(text: string): string {
  return text.replace(
    /[^A-Za-z0-9-]/g,
    (character) => `_${(character.codePointAt(0) ?? 0).toString(36)}_`,
  );
}

function isItemGroup(item: unknown): item is ComboboxItemGroup<unknown> {
  return (
    typeof item === "object" && item !== null && Array.isArray((item as { items?: unknown }).items)
  );
}

interface ChipsValue {
  /** The chips that rendered, in order: a chip is the value at its own position. */
  registry: StaticCollection;
  count: () => number;
  focus: (index: number) => void;
}

export interface ComboboxRootValue {
  isOpen: Accessor<boolean>;
  setOpen: (open: boolean) => void;
  /** Open and highlight an end of the list once it has rendered. */
  openWith: (strategy: FocusStrategy | null) => void;
  isMultiple: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
  isReadOnly: Accessor<boolean>;
  /** Every chosen item: one or none of them when the combobox holds one value. */
  values: Accessor<readonly unknown[]>;
  inputValue: Accessor<string>;
  /** What narrows the list, which is not always what the field shows. */
  query: Accessor<string>;
  /** `items`, less what the query rules out. */
  filteredItems: Accessor<unknown[]>;
  matches: (item: unknown) => boolean;
  labelOf: (item: unknown) => string;
  /** The label an item has without having rendered. */
  ownLabelOf: (item: unknown) => string | undefined;
  stringValueOf: (item: unknown) => string;
  keyOf: (item: unknown) => Key;
  list: ListState<StaticEntry>;
  registry: StaticCollection;
  baseId: Accessor<string>;
  listId: Accessor<string>;
  isEmpty: Accessor<boolean>;
  /** Whether an input sits outside the popup, which makes the popup take no focus. */
  hasOuterInput: Accessor<boolean>;
  hasChips: Accessor<boolean>;
  name: Accessor<string | undefined>;
  form: Accessor<string | undefined>;
  clear: () => void;
  removeAt: (index: number) => void;
  focusInput: () => void;
  highlight: (key: Key | null) => void;
  /** What the popup is placed against when it is not told. */
  anchor: () => Element | null;
  /** Whether a press there is a press on the combobox, not outside it. */
  owns: (element: Element) => boolean;
  listRef: ReturnType<typeof makeRef<HTMLUListElement>>;
  inputRef: ReturnType<typeof makeRef<HTMLInputElement>>;
  triggerRef: ReturnType<typeof makeRef<HTMLElement>>;
  clearRef: ReturnType<typeof makeRef<HTMLElement>>;
  chipsRef: ReturnType<typeof makeRef<HTMLElement>>;
  popupRef: ReturnType<typeof makeRef<HTMLDivElement>>;
  /** The list is named after the input, which is the only named part. */
  listName: Accessor<{ label: string | undefined; labelledBy: string | undefined }>;
  attachInput: (input: {
    isInside: boolean;
    isDisabled: Accessor<boolean>;
    label: Accessor<string | undefined>;
    labelledBy: Accessor<string | undefined>;
  }) => void;
  attachChips: () => void;
  attachItem: (key: Key, item: unknown) => void;
  rememberLabel: (key: Key, text: string) => void;
  inputProps: (chips: ChipsValue | null) => DOMProps;
}

const ComboboxRootContext = createContext<ComboboxRootValue | null>(null);
const ComboboxPopupContext = createContext<boolean>(false);
const ComboboxChipsContext = createContext<ChipsValue | null>(null);

/** The enclosing {@link ComboboxRoot}. */
export function useComboboxRoot(): ComboboxRootValue {
  const value = getContext(ComboboxRootContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a ComboboxRoot.");
  }
  return value;
}

/** The enclosing {@link ComboboxRoot}, or `null` outside one. */
export function useOptionalComboboxRoot(): ComboboxRootValue | null {
  return getContext(ComboboxRootContext) ?? null;
}

function createComboboxRoot<V>(props: Incoming<ComboboxRootProps<V>>): ComboboxRootValue {
  const locale = useLocale();
  const match = makeFilter({ sensitivity: "base" });

  const inputRef = makeRef<HTMLInputElement>();
  const listRef = makeRef<HTMLUListElement>();
  const triggerRef = makeRef<HTMLElement>();
  const clearRef = makeRef<HTMLElement>();
  const chipsRef = makeRef<HTMLElement>();
  const popupRef = makeRef<HTMLDivElement>();
  const baseId = id();
  const listId = id();

  const isMultiple = (): boolean => props.multiple?.() === true;
  const isReadOnly = (): boolean => props.readOnly?.() === true;

  // Parts register from component bodies, which is an owned scope.
  const [outerInputs, setOuterInputs] = createSignal(0, { ownedWrite: true });
  const [chipBoxes, setChipBoxes] = createSignal(0, { ownedWrite: true });
  const [inputDisabled, setInputDisabled] = createSignal<Accessor<boolean> | null>(null, {
    ownedWrite: true,
  });
  const [named, setNamed] = createSignal<{
    label: Accessor<string | undefined>;
    labelledBy: Accessor<string | undefined>;
  } | null>(null, { ownedWrite: true });
  const hasOuterInput = (): boolean => outerInputs() > 0;
  const isDisabled = (): boolean => props.disabled?.() === true || inputDisabled()?.() === true;

  const [raw, setRaw] = controllable<V | readonly V[] | null>(
    () => props.value?.(),
    () => props.defaultValue?.() ?? (isMultiple() ? [] : null),
    (next) => props.onValueChange?.()?.(next),
  );

  const values = createMemo((): readonly V[] => {
    const current = raw();
    if (isMultiple()) return Array.isArray(current) ? (current as readonly V[]) : [];
    return current === null || current === undefined ? [] : [current as V];
  });

  const ownLabelOf = (item: unknown): string | undefined => {
    const given = props.itemToStringLabel?.()?.(item as V);
    if (given !== undefined) return given;
    if (typeof item === "object" && item !== null) {
      const record = item as Record<string, unknown>;
      const text = record.label ?? record.name ?? record.title;
      if (typeof text === "string") return text;
    }
    return undefined;
  };

  const stringValueOf = (item: unknown): string => {
    const given = props.itemToStringValue?.()?.(item as V);
    if (given !== undefined) return given;
    if (typeof item === "object" && item !== null) {
      const record = item as Record<string, unknown>;
      const own = record.value ?? record.id ?? record.key;
      if (typeof own === "string" || typeof own === "number") return String(own);
      return ownLabelOf(item) ?? "";
    }
    return String(item);
  };

  // An option's id is derived from its key, and an id cannot hold a space:
  // "New York" as a key would make `aria-activedescendant` name two things,
  // neither of which exists. The key is internal, so it is escaped rather than
  // asking every caller for values that happen to be valid identifiers.
  const keyOf = (item: unknown): Key =>
    typeof item === "number" ? item : idSafe(typeof item === "string" ? item : stringValueOf(item));

  // What an item rendered as, kept after it has gone: the field shows a chosen
  // item's text long after the list that held it has closed.
  const rendered = new Map<Key, string>();
  const [renderedVersion, setRenderedVersion] = createSignal(0, { ownedWrite: true });

  const labelOf = (item: unknown): string => {
    const own = ownLabelOf(item);
    if (own !== undefined) return own;
    renderedVersion();
    return rendered.get(keyOf(item)) ?? stringValueOf(item);
  };

  const [isOpen, setOpenState] = controllable<boolean>(
    () => props.open?.(),
    () => props.defaultOpen?.() ?? false,
    (next) => props.onOpenChange?.()?.(next),
  );

  // `null` is "nothing typed": the field then shows what the value reads as,
  // and goes on following it if the value's label arrives late.
  const [typedText, setTypedText] = createSignal<string | null>(
    props.defaultInputValue?.() ?? null,
  );
  const [isQuery, setIsQuery] = createSignal(false);
  const restingText = (): string => {
    if (isMultiple() || !hasOuterInput()) return "";
    const [chosen] = values();
    return chosen === undefined ? "" : labelOf(chosen);
  };
  const inputValue = (): string => props.inputValue?.() ?? typedText() ?? restingText();

  const writeInput = (next: string | null): void => {
    const before = untrack(inputValue);
    setTypedText(next);
    const after = next ?? untrack(restingText);
    if (after !== before) props.onInputValueChange?.()?.(after);
  };

  const query = (): string => (isQuery() || isMultiple() || !hasOuterInput() ? inputValue() : "");

  const matches = (item: unknown): boolean => {
    const text = query();
    if (text === "") return true;
    const given = props.filter?.();
    if (given === null) return true;
    if (given !== undefined) return given(item as V, text, labelOf);
    return match.contains(labelOf(item), text);
  };

  const filteredItems = createMemo((): unknown[] => {
    const kept: unknown[] = [];
    for (const item of props.items?.() ?? []) {
      if (isItemGroup(item)) {
        const inner = item.items.filter(matches);
        if (inner.length > 0) kept.push({ ...item, items: inner });
      } else if (matches(item)) {
        kept.push(item);
      }
    }
    return kept;
  });

  const registry = staticCollection();
  const itemsByKey = new Map<Key, unknown>();

  const choose = (keys: SelectionValue): void => {
    if (keys === "all") return;
    const held = new Map<Key, V>(values().map((value) => [keyOf(value), value]));
    const itemFor = (key: Key): V | undefined => held.get(key) ?? (itemsByKey.get(key) as V);

    if (isMultiple()) {
      const next: V[] = values().filter((value) => keys.has(keyOf(value)));
      for (const key of keys) {
        const item = itemFor(key);
        if (!held.has(key) && item !== undefined) next.push(item);
      }
      setRaw(next);
      // Chosen, so the query has done its job and the whole list comes back.
      writeInput("");
      return;
    }

    const key: Key | undefined = keys.values().next().value;
    const item = key === undefined ? undefined : itemFor(key);
    if (key === undefined || item === undefined) return;
    if (!held.has(key)) setRaw(item);
    setOpen(false);
  };

  const list = listState<StaticEntry>({
    items: registry.entries,
    ...staticAccessors,
    selectionMode: () => (isMultiple() ? "multiple" : "single"),
    disallowEmptySelection: () => !isMultiple(),
    allowDuplicateSelectionEvents: true,
    selectedKeys: () => values().map(keyOf),
    onSelectionChange: choose,
  });

  const [pending, setPending] = createSignal<FocusStrategy | null>(null);

  const delegate = new ListKeyboardDelegate({
    collection: list.collection,
    ref: listRef,
    disabledKeys: list.disabledKeys,
  });

  // The arrows drive the LIST while the caret stays in the input, so the
  // collection's key handling is bound to the input rather than to the list.
  const { collectionProps } = selectableCollection({
    ref: inputRef,
    selectionManager: list.selectionManager,
    keyboardDelegate: delegate,
    shouldUseVirtualFocus: true,
    disallowTypeAhead: true,
    disallowEmptySelection: true,
    shouldFocusWrap: true,
  });

  /** Back to rest: nothing typed, and the field showing what the value reads as. */
  const settleInput = (): void => {
    setIsQuery(false);
    writeInput(null);
  };

  function setOpen(next: boolean): void {
    if (next === untrack(isOpen)) return;
    if (next && (isDisabled() || isReadOnly())) return;
    setOpenState(next);
  }

  const openWith = (strategy: FocusStrategy | null): void => {
    setPending(strategy);
    setOpen(true);
  };

  const focusInput = (): void => {
    inputRef()?.focus();
  };

  if (!isServer) {
    // The list is only the focused collection while it is open, and neither
    // the highlight nor a half-typed query survives a close.
    let wasOpen = untrack(isOpen);
    createEffect(isOpen, (open) => {
      const manager = list.selectionManager();
      manager.setFocused(open);
      if (!open) {
        manager.setFocusedKey(null);
        setPending(null);
        if (wasOpen) settleInput();
      }
      wasOpen = open;
    });

    // An end of the list is highlighted once there is a list: the items render
    // after the popup opens, so the key that opened it cannot do this itself.
    createEffect(
      () => {
        const strategy = pending();
        if (!isOpen() || strategy === null || list.collection().size === 0) return null;
        return strategy;
      },
      (strategy) => {
        if (strategy === null) return;
        setPending(null);
        const key = strategy === "last" ? delegate.getLastKey() : delegate.getFirstKey();
        list.selectionManager().setFocusedKey(key);
      },
    );

    // A value set from outside is not a query, so the field goes back to
    // following it.
    let shownFor = untrack(() => values().map(keyOf).join("\u0000"));
    createEffect(
      () => values().map(keyOf).join("\u0000"),
      (now) => {
        if (now === shownFor) return;
        shownFor = now;
        if (!isMultiple() && !isOpen()) settleInput();
      },
    );
  }

  const removeAt = (index: number): void => {
    if (isDisabled() || isReadOnly()) return;
    setRaw(values().filter((_, at) => at !== index));
  };

  const clear = (): void => {
    if (isDisabled() || isReadOnly()) return;
    if (values().length > 0) setRaw(isMultiple() ? [] : null);
    setIsQuery(false);
    writeInput(isMultiple() ? "" : null);
    setOpen(false);
    focusInput();
  };

  const onInput = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    const text = input.value;
    setIsQuery(true);
    writeInput(text);
    // The highlight was for a list that no longer exists.
    list.selectionManager().setFocusedKey(null);
    if (props.autoHighlight?.() === true) setPending("first");
    // Emptying the field by hand empties the value: a field showing nothing
    // and holding something is how a form submits what nobody can see.
    if (text === "" && !isMultiple() && hasOuterInput() && values().length > 0) setRaw(null);
    setOpen(true);
    // The field has already changed itself; a controlled owner that declined
    // re-renders nothing, so the DOM has to be put back by hand.
    if (input.value !== inputValue()) input.value = inputValue();
  };

  const onKeyDown = (event: KeyboardEvent, chips: ChipsValue | null): void => {
    if (isDisabled() || isReadOnly()) return;
    const input = event.currentTarget as HTMLInputElement;
    const manager = list.selectionManager();

    if (chips !== null && chips.count() > 0) {
      const towardsChips = locale().direction === "rtl" ? "ArrowRight" : "ArrowLeft";
      if (event.key === "Backspace" && input.value === "") {
        event.preventDefault();
        removeAt(chips.count() - 1);
        return;
      }
      if (event.key === towardsChips && input.selectionStart === 0 && input.selectionEnd === 0) {
        event.preventDefault();
        chips.focus(chips.count() - 1);
        return;
      }
    }

    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        if (isOpen()) break;
        event.preventDefault();
        openWith(event.key === "ArrowDown" ? "first" : "last");
        return;
      }
      case "Enter": {
        // Only swallowed while something is highlighted: a combobox inside a
        // form must still submit on Enter otherwise.
        if (!isOpen() || manager.focusedKey === null) return;
        event.preventDefault();
        manager.select(manager.focusedKey);
        return;
      }
      case "Tab": {
        setOpen(false);
        return;
      }
      case "Escape": {
        if (isOpen()) {
          // The list's Escape, not the dialog's the combobox may be in.
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          return;
        }
        if (inputValue() === "" && values().length === 0) return;
        event.preventDefault();
        if (!isMultiple() && values().length > 0) setRaw(null);
        setIsQuery(false);
        writeInput(isMultiple() ? "" : null);
        return;
      }
      default:
        break;
    }

    if (isOpen()) (collectionProps.onKeyDown as (event: KeyboardEvent) => void)(event);
  };

  const owns = (element: Element): boolean =>
    [inputRef(), triggerRef(), clearRef(), chipsRef()].some(
      (part) => part !== null && part.contains(element),
    );

  const onBlur = (event: FocusEvent): void => {
    const related = event.relatedTarget as Element | null;
    // Focus moving to the toggle or into the popup is still focus on the
    // combobox.
    if (related !== null && (owns(related) || popupRef()?.contains(related) === true)) return;
    if (isOpen()) setOpen(false);
    else if (hasOuterInput()) settleInput();
  };

  return {
    isOpen,
    setOpen,
    openWith,
    isMultiple,
    isDisabled,
    isReadOnly,
    values,
    inputValue,
    query,
    filteredItems,
    matches,
    labelOf,
    ownLabelOf,
    stringValueOf,
    keyOf,
    list,
    registry,
    baseId,
    listId,
    isEmpty: () => list.collection().size === 0,
    hasOuterInput,
    hasChips: () => chipBoxes() > 0,
    name: () => props.name?.(),
    form: () => props.form?.(),
    clear,
    removeAt,
    focusInput,
    highlight: (key) => list.selectionManager().setFocusedKey(key),
    anchor: () => chipsRef() ?? (hasOuterInput() ? inputRef() : triggerRef()),
    owns,
    listRef,
    inputRef,
    triggerRef,
    clearRef,
    chipsRef,
    popupRef,
    listName: () => ({ label: named()?.label(), labelledBy: named()?.labelledBy() }),
    attachInput: (input) => {
      setNamed({ label: input.label, labelledBy: input.labelledBy });
      setInputDisabled(() => input.isDisabled);
      if (input.isInside) return;
      setOuterInputs((count) => count + 1);
      onCleanup(() => setOuterInputs((count) => count - 1));
    },
    attachChips: () => {
      setChipBoxes((count) => count + 1);
      onCleanup(() => setChipBoxes((count) => count - 1));
    },
    attachItem: (key, item) => {
      itemsByKey.set(key, item);
      onCleanup(() => {
        if (itemsByKey.get(key) === item) itemsByKey.delete(key);
      });
    },
    rememberLabel: (key, text) => {
      if (text === "" || rendered.get(key) === text) return;
      rendered.set(key, text);
      setRenderedVersion((version) => version + 1);
    },
    inputProps: (chips) => ({
      role: "combobox",
      type: "text",
      value: inputValue,
      readOnly: isReadOnly,
      "aria-haspopup": "listbox",
      "aria-expanded": isOpen,
      "aria-controls": () => (isOpen() ? listId() : undefined),
      "aria-autocomplete": "list",
      // Virtual focus: the input keeps DOM focus and NAMES the highlighted
      // option, so the caret never moves and the highlight still travels.
      "aria-activedescendant": () => {
        if (!isOpen()) return undefined;
        const key = list.selectionManager().focusedKey;
        return key === null ? undefined : optionIdFor(baseId(), key);
      },
      // The combobox has its own suggestions; the browser's would cover them,
      // and iOS autocorrect would rewrite the query as it is typed.
      autocomplete: "off",
      autocorrect: "off",
      spellcheck: "false",
      onInput,
      onKeyDown: (event: KeyboardEvent) => onKeyDown(event, chips),
      onClick: () => {
        if (props.openOnInputClick?.() !== false) setOpen(true);
      },
      onBlur,
    }),
  };
}

function ComboboxRootProvider(props: Incoming<{ value: ComboboxRootValue; children?: Child }>) {
  return provide(
    ComboboxRootContext,
    () => props.value(),
    () => props.children as unknown,
  );
}

/** The fields that put the value in a form: a combobox's own input holds a query. */
function ComboboxFormValue() {
  const root = useComboboxRoot();
  return (
    <Show when={root.name() !== undefined}>
      <For each={root.values()}>
        {(value: unknown) => (
          <input
            type="hidden"
            name={root.name()}
            form={root.form()}
            value={root.stringValueOf(value)}
            disabled={root.isDisabled()}
          />
        )}
      </For>
    </Show>
  );
}

/**
 * ```tsx
 * <ComboboxRoot items={frameworks} onValueChange={(value) => pick(value)}>
 *   <ComboboxInput aria-label="Framework" />
 *   <ComboboxPopup>
 *     <ComboboxEmpty>No frameworks found.</ComboboxEmpty>
 *     <ComboboxList>
 *       {(item) => <ComboboxItem value={item}>{item}</ComboboxItem>}
 *     </ComboboxList>
 *   </ComboboxPopup>
 * </ComboboxRoot>
 * ```
 *
 * Renders no element of its own: the parts are placed by whoever writes them.
 */
export function ComboboxRoot<V>(props: Incoming<ComboboxRootProps<V>>) {
  const root = createComboboxRoot(props);
  return (
    <ComboboxRootProvider value={root}>
      {props.children}
      <ComboboxFormValue />
    </ComboboxRootProvider>
  );
}

const INPUT_PROPS = new Set([
  "onKeyDown",
  "onKeyUp",
  "onChange",
  "aria-invalid",
  "aria-required",
  "inputMode",
  "enterKeyHint",
  "autoFocus",
  "maxLength",
  "required",
]);

export interface ComboboxInputProps extends StyleProps {
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  ref?: RefTarget<HTMLInputElement>;
  onKeyDown?: (event: KeyboardEvent) => void;
}

/**
 * The text field. Outside the popup it is the combobox; inside one it is the
 * search over a list a button opened, and inside {@link ComboboxChips} it also
 * walks the chips beside it.
 */
export function ComboboxInput(props: Incoming<ComboboxInputProps>) {
  const root = useComboboxRoot();
  const chips = getContext(ComboboxChipsContext) ?? null;
  const isInside = getContext(ComboboxPopupContext);
  const isDisabled = (): boolean => props.disabled?.() === true;

  root.attachInput({
    isInside,
    isDisabled,
    label: () => props["aria-label"]?.(),
    labelledBy: () => props["aria-labelledby"]?.(),
  });

  const { focusProps, isFocusVisible } = focusRing();

  const elementProps = mergeProps(
    root.inputProps(chips),
    focusProps,
    filterDOMProps(fromProps(props), { global: true, labelable: true, propNames: INPUT_PROPS }),
    styleProps(props),
    {
      placeholder: () => props.placeholder?.(),
      disabled: root.isDisabled,
      "data-focus-visible": isFocusVisible,
      "data-open": root.isOpen,
      "data-state": () => (root.isOpen() ? "open" : "closed"),
      "data-disabled": root.isDisabled,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return <input {...elementProps} ref={mergeRefs(root.inputRef.set, props.ref?.())} />;
}

/** Nothing reads it. `provide` is what creates the scope a slot is installed in. */
const SlotScope = createContext<boolean>(false);

/**
 * Hands the toggle's props to the button inside it.
 *
 * Beside an input it is a shortcut to the same list, so it is out of the Tab
 * order and a press on it leaves focus in the field. With no input outside the
 * popup it IS the control, and takes the keyboard like any button that opens
 * something.
 */
export function ComboboxTrigger(props: Incoming<{ children?: Child }>) {
  const root = useComboboxRoot();

  const toggle = (event: PressEvent): void => {
    if (root.isOpen()) {
      root.setOpen(false);
      return;
    }
    if (root.hasOuterInput()) root.focusInput();
    root.openWith(
      event.pointerType === "keyboard" || event.pointerType === "virtual" ? "first" : null,
    );
  };

  return provide(
    SlotScope,
    () => true,
    () => {
      provideTriggerSlot({
        props: {
          "aria-haspopup": "listbox",
          "aria-expanded": root.isOpen,
          "aria-controls": () => (root.isOpen() ? root.listId() : undefined),
          "data-state": () => (root.isOpen() ? "open" : "closed"),
          "data-popup-open": () => root.isOpen() || undefined,
          excludeFromTabOrder: root.hasOuterInput,
          preventFocusOnPress: root.hasOuterInput,
          isDisabled: () => root.isDisabled() || root.isReadOnly(),
          onPressStart: (event: PressEvent) => {
            if (event.pointerType !== "touch") toggle(event);
          },
          onPress: (event: PressEvent) => {
            if (event.pointerType === "touch") toggle(event);
          },
          onKeyDown: (event: KeyboardEvent) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            root.openWith(event.key === "ArrowDown" ? "first" : "last");
          },
        },
        ref: root.triggerRef.set,
      });
      return props.children;
    },
  );
}

function ComboboxClearSlot(props: Incoming<{ children?: Child }>) {
  const root = useComboboxRoot();
  return provide(
    SlotScope,
    () => true,
    () => {
      provideTriggerSlot({
        props: {
          excludeFromTabOrder: true,
          preventFocusOnPress: true,
          isDisabled: () => root.isDisabled() || root.isReadOnly(),
          onPress: () => root.clear(),
        },
        ref: root.clearRef.set,
      });
      return props.children;
    },
  );
}

/**
 * Hands the clearing press to the button inside it, and renders that button
 * only while there is something to clear.
 */
export function ComboboxClear(props: Incoming<{ children?: Child }>) {
  const root = useComboboxRoot();
  return (
    <Show when={root.values().length > 0 || root.inputValue() !== ""}>
      <ComboboxClearSlot>{props.children}</ComboboxClearSlot>
    </Show>
  );
}

export interface ComboboxValueProps {
  /** Called with the value, or with every value when there are several. */
  children?: Child | ((value: never) => Child);
  /** What to show while nothing is chosen. */
  placeholder?: string;
}

/**
 * What is chosen, as text or through a callback.
 *
 * With `multiple` the callback runs ONCE and is handed a list that changes in
 * place, so a `<For>` over it adds and removes chips without rebuilding the
 * input written beside them, which would take the caret with it.
 */
export function ComboboxValue(props: Incoming<ComboboxValueProps>) {
  const root = useComboboxRoot();
  const render = renderCallback(props.children);

  if (render === null) {
    const text = (): string => {
      const chosen = root.values();
      if (chosen.length === 0) return props.placeholder?.() ?? "";
      return chosen.map(root.labelOf).join(", ");
    };
    return <>{props.children === undefined ? text() : (props.children as () => Child)()}</>;
  }

  if (root.isMultiple()) {
    const chosen = createProjection<unknown[]>((draft) => {
      const next = root.values();
      draft.length = 0;
      draft.push(...next);
    }, []);
    return <>{render(chosen, 0)}</>;
  }

  const one = (): Child => render(root.values()[0] ?? null, 0);
  return <>{one()}</>;
}

export type ComboboxAnchor =
  | Element
  | { current: Element | null }
  | (() => Element | null | undefined)
  | null;

function anchorElement(anchor: ComboboxAnchor | undefined): Element | null {
  if (anchor === null || anchor === undefined) return null;
  if (typeof anchor === "function") return anchor() ?? null;
  if (anchor instanceof Element) return anchor;
  return anchor.current;
}

export interface ComboboxPopupProps extends StyleProps {
  children?: Child;
  /** The panel the list is drawn in, which `class` and `style` land on. */
  ref?: RefTarget<HTMLDivElement>;
  /** @default "bottom" */
  side?: Side;
  /** @default "start" */
  align?: Align;
  /** @default 6 */
  sideOffset?: number;
  /** @default 0 */
  alignOffset?: number;
  /** What to place against. @default the chips box, the input, or the trigger */
  anchor?: ComboboxAnchor;
  role?: string;
  "aria-label"?: string;
}

/**
 * The popup, portalled and placed against the input.
 *
 * Two elements: the outer one is positioned and nothing else, and the inner
 * one is the caller's to style. Animating the positioned element would move
 * the thing being measured.
 */
export function ComboboxPopup(props: Incoming<ComboboxPopupProps>) {
  const root = useComboboxRoot();
  const locale = useLocale();
  const positionerRef = makeRef<HTMLDivElement>();
  const popupRef = root.popupRef;
  const close = (): void => root.setOpen(false);

  const placement = (): Placement =>
    placementFor(props.side?.() ?? "bottom", props.align?.() ?? "start");

  const position = overlayPosition({
    targetRef: () => anchorElement(props.anchor?.()) ?? root.anchor(),
    overlayRef: positionerRef,
    placement,
    offset: () => props.sideOffset?.() ?? 6,
    crossOffset: () => props.alignOffset?.() ?? 0,
    isOpen: root.isOpen,
    onClose: close,
    direction: () => locale().direction,
  });

  const { overlayProps } = dismissal(
    {
      isOpen: root.isOpen,
      onClose: close,
      isDismissable: true,
      // The input, the toggle and the chips are outside the popup and are not
      // outside the combobox.
      shouldCloseOnInteractOutside: (element) => !root.owns(element),
    },
    positionerRef,
  );

  const gate = presence({ isOpen: root.isOpen, ref: popupRef });
  const target = usePortalTarget();

  const popupDirection = declaredDirection();
  const popupProps = mergeProps(
    filterDOMProps(fromProps(props), { global: true, labelable: true }),
    // Portalled out from under the element that carries `dir`.
    { dir: () => props.dir?.() ?? popupDirection() },
    styleProps(props),
    {
      role: () => props.role?.() ?? "presentation",
      "data-open": () => !gate.isExiting(),
      "data-closed": gate.isExiting,
      "data-state": () => (gate.isExiting() ? "closed" : "open"),
      "data-side": position.placement,
      "data-align": () => alignOf(placement()),
      "data-placement": position.placement,
      "data-empty": root.isEmpty,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <Show when={gate.isPresent()}>
      <Portal mount={portalContainer(target)}>
        <ComboboxPopupBody
          positionerProps={mergeProps(overlayProps, position.overlayProps)}
          positionerRef={positionerRef}
          popupProps={popupProps}
          popupRef={popupRef}
          forwardedRef={props.ref?.()}
        >
          {props.children}
        </ComboboxPopupBody>
      </Portal>
    </Show>
  );
}

interface ComboboxPopupBodyProps {
  positionerProps: DOMProps;
  positionerRef: ReturnType<typeof makeRef<HTMLDivElement>>;
  popupProps: DOMProps;
  popupRef: ReturnType<typeof makeRef<HTMLDivElement>>;
  forwardedRef?: RefTarget<HTMLDivElement>;
  children?: Child;
}

/**
 * Inside the `<Show>`, so a focus scope is created WITH the content it holds
 * and disposed with it, which is what gives focus back to the trigger.
 *
 * Only when there is no input outside: a list under a field the user is typing
 * in must not take the caret, and a scope would.
 */
function ComboboxPopupBody(props: Incoming<ComboboxPopupBodyProps>) {
  const root = useComboboxRoot();
  const scope = untrack(root.hasOuterInput)
    ? null
    : focusScope({ contain: true, restoreFocus: true, autoFocus: true });
  const positionerRef = props.positionerRef();
  const setPopup = mergeRefs(props.popupRef().set, props.forwardedRef?.());

  return (
    <>
      <span hidden ref={scope?.startRef} />
      <ComboboxPopupScope>
        <div {...props.positionerProps()} ref={positionerRef.set}>
          <div {...props.popupProps()} ref={setPopup}>
            {props.children}
          </div>
        </div>
      </ComboboxPopupScope>
      <span hidden ref={scope?.endRef} />
    </>
  );
}

function ComboboxPopupScope(props: Incoming<{ children?: Child }>) {
  return provide(
    ComboboxPopupContext,
    () => true,
    () => props.children as unknown,
  );
}

export interface ComboboxListProps extends StyleProps {
  /** A callback building an item from each of `items`, or the items themselves. */
  children?: Child | ((item: never, index: number) => Child);
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

/** The listbox. Its options are whatever its children render. */
export function ComboboxList(props: Incoming<ComboboxListProps>) {
  const root = useComboboxRoot();
  const { children: _children, ...own } = props;

  const { listBoxProps, baseId } = listBox(
    {
      ref: root.listRef,
      baseId: root.baseId,
      shouldUseVirtualFocus: true,
      shouldSelectOnPressUp: true,
      disallowEmptySelection: () => !root.isMultiple(),
      linkBehavior: "selection",
    },
    root.list,
  );

  const elementProps = mergeProps(
    listBoxProps,
    filterDOMProps(fromProps(own), { global: true }),
    styleProps(props),
    {
      id: root.listId,
      "aria-label": () =>
        props["aria-label"]?.() ??
        root.listName().label ??
        (root.listName().labelledBy === undefined && props["aria-labelledby"]?.() === undefined
          ? "Suggestions"
          : undefined),
      "aria-labelledby": () => props["aria-labelledby"]?.() ?? root.listName().labelledBy,
      "data-empty": root.isEmpty,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  const value: ListBoxContextValue = {
    state: root.list,
    baseId,
    shouldSelectOnPressUp: () => true,
    shouldUseVirtualFocus: () => true,
    staticItems: root.registry,
  };

  const render = renderCallback(props.children);

  if (render === null) {
    return (
      <ListBoxProvider value={value}>
        <ul {...elementProps} ref={root.listRef.set}>
          {props.children}
        </ul>
      </ListBoxProvider>
    );
  }

  return (
    <ListBoxProvider value={value}>
      <ul {...elementProps} ref={root.listRef.set}>
        <For each={root.filteredItems()}>
          {(item: unknown, index: Accessor<number>) => render(item, index())}
        </For>
      </ul>
    </ListBoxProvider>
  );
}

export interface ComboboxItemValue {
  isSelected: Accessor<boolean>;
  isHighlighted: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
}

const ComboboxItemContext = createContext<ComboboxItemValue | null>(null);

/** The enclosing {@link ComboboxItem}'s state, for a tick or anything else inside it. */
export function useComboboxItem(): ComboboxItemValue {
  const value = getContext(ComboboxItemContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a ComboboxItem.");
  }
  return value;
}

function ComboboxItemProvider(props: Incoming<{ value: ComboboxItemValue; children?: Child }>) {
  return provide(
    ComboboxItemContext,
    () => props.value(),
    () => props.children as unknown,
  );
}

export interface ComboboxItemProps extends StyleProps {
  /** The item this option stands for, handed back by `onValueChange`. */
  value: unknown;
  disabled?: boolean;
  /** What the filter and the field read. @default the item's label, or this option's text */
  textValue?: string;
  children?: Child;
  "aria-label"?: string;
  ref?: RefTarget<HTMLLIElement>;
}

/** One option. It joins the list by rendering and leaves it by going away. */
export function ComboboxItem(props: Incoming<ComboboxItemProps>) {
  const root = useComboboxRoot();
  // Read once: an option does not turn into a different one.
  const item = untrack(props.value);
  const key = root.keyOf(item);
  root.attachItem(key, item);

  const manager = () => root.list.selectionManager();
  const isDisabled = (): boolean => props.disabled?.() === true;
  const state: ComboboxItemValue = {
    isSelected: () => manager().isSelected(key),
    isHighlighted: () => root.isOpen() && manager().focusedKey === key,
    isDisabled,
  };

  onSettled(() => {
    untrack(() => {
      root.rememberLabel(
        key,
        props.textValue?.() ??
          root.ownLabelOf(item) ??
          root.registry.elementOf(key)?.textContent?.trim() ??
          "",
      );
    });
  });

  const { value: _value, ...rest } = props;

  return (
    <ComboboxItemProvider value={state}>
      <Option
        {...rest}
        value={key}
        textValue={props.textValue?.() ?? root.ownLabelOf(item)}
        isDisabled={isDisabled()}
        isHidden={!root.matches(item)}
        data-highlighted={state.isHighlighted() ? "" : undefined}
        data-state={state.isSelected() ? "checked" : "unchecked"}
        // A pointer over an option highlights it, so the keyboard carries on
        // from where the pointer was.
        onPointerMove={() => {
          if (!isDisabled() && manager().focusedKey !== key) root.highlight(key);
        }}
      >
        {props.children}
      </Option>
    </ComboboxItemProvider>
  );
}

interface GroupValue {
  /** The group's own items, for a {@link ComboboxCollection} inside it. */
  items: Accessor<readonly unknown[]>;
  headingId: Accessor<string>;
  readonly name: (has: boolean) => void;
}

const ComboboxGroupContext = createContext<GroupValue | null>(null);

function ComboboxGroupProvider(
  props: Incoming<{ value: GroupValue; section: Key; children?: Child }>,
) {
  return provideStaticSection(props.section(), () =>
    provide(
      ComboboxGroupContext,
      () => props.value(),
      () => props.children as unknown,
    ),
  ) as never;
}

export interface ComboboxGroupProps extends StyleProps {
  /** The items a {@link ComboboxCollection} inside renders. */
  items?: readonly unknown[];
  children?: Child;
  "aria-label"?: string;
}

/**
 * A run of options, named by the {@link ComboboxGroupLabel} inside it.
 *
 * Two elements, because the options have to be the group's own children in the
 * accessibility tree and a `<li>` cannot hold another `<li>`: the outer one is
 * presentational and takes the caller's class, the inner one is the group.
 */
export function ComboboxGroup(props: Incoming<ComboboxGroupProps>) {
  const root = useComboboxRoot();
  const section = staticItem(root.registry, { type: "section", textValue: "" });
  const headingId = id();
  const [isNamed, setNamed] = createSignal(false, { ownedWrite: true });

  const group: GroupValue = {
    items: () => props.items?.() ?? [],
    headingId,
    name: setNamed,
  };

  const elementProps = mergeProps(
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      role: "presentation",
      // A group the query has emptied still holds its label, and a design
      // system hides the whole thing off this.
      "data-empty": () =>
        (root.list.collection().getItem(section.key)?.childNodes.length ?? 0) === 0,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <ComboboxGroupProvider value={group} section={section.key}>
      <li {...elementProps} ref={section.ref}>
        <ul
          role="group"
          aria-label={props["aria-label"]?.()}
          aria-labelledby={isNamed() ? headingId() : undefined}
        >
          {props.children}
        </ul>
      </li>
    </ComboboxGroupProvider>
  );
}

export interface ComboboxGroupLabelProps extends StyleProps {
  children?: Child;
}

/**
 * The heading of the group it is written in.
 *
 * Rendering it is what makes the group point here, and leaving undoes that, so
 * a group never names an element that is not there.
 */
export function ComboboxGroupLabel(props: Incoming<ComboboxGroupLabelProps>) {
  const group = getContext(ComboboxGroupContext) ?? null;
  group?.name(true);
  onCleanup(() => group?.name(false));

  const elementProps = mergeProps(
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      // Inside the group and not one of its options.
      role: "presentation",
      id: () => group?.headingId(),
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return <li {...elementProps}>{props.children}</li>;
}

export interface ComboboxCollectionProps {
  /** How one of the enclosing group's items renders. */
  children: (item: never, index: number) => Child;
}

/** The enclosing {@link ComboboxGroup}'s items, less what the query rules out. */
export function ComboboxCollection(props: Incoming<ComboboxCollectionProps>) {
  const root = useComboboxRoot();
  const group = getContext(ComboboxGroupContext) ?? null;
  const render = renderCallback(props.children);
  if (render === null) {
    throw new Error("A ComboboxCollection takes a callback that renders one item.");
  }

  return (
    <For each={(group?.items() ?? []).filter(root.matches)}>
      {(item: unknown, index: Accessor<number>) => render(item, index())}
    </For>
  );
}

export interface ComboboxEmptyProps extends StyleProps {
  children?: Child;
}

/**
 * What the popup says when nothing matches.
 *
 * The element is always there and only its content comes and goes: a live
 * region announces a change to what it holds, and one that arrives already
 * full announces nothing.
 */
export function ComboboxEmpty(props: Incoming<ComboboxEmptyProps>) {
  const root = useComboboxRoot();

  const elementProps = mergeProps(
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      role: "status",
      "aria-live": "polite",
      "aria-atomic": "true",
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <div {...elementProps}>
      <Show when={root.isEmpty()}>{props.children}</Show>
    </div>
  );
}

function ComboboxChipsProvider(props: Incoming<{ value: ChipsValue; children?: Child }>) {
  return provide(
    ComboboxChipsContext,
    () => props.value(),
    () => props.children as unknown,
  );
}

export interface ComboboxChipsProps extends StyleProps {
  children?: Child;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  ref?: RefTarget<HTMLDivElement>;
}

/**
 * The box a multiple combobox's chips and input sit in, and what its popup is
 * placed against.
 *
 * A `<div>` that looks like a field: the chips inside carry remove buttons,
 * and a button inside an input is markup nothing can render.
 */
export function ComboboxChips(props: Incoming<ComboboxChipsProps>) {
  const root = useComboboxRoot();
  const registry = staticCollection();
  root.attachChips();

  const chips: ChipsValue = {
    registry,
    count: () => registry.keys().length,
    focus: (index) => {
      const key = registry.keys()[index];
      const element = key === undefined ? null : registry.elementOf(key);
      if (element instanceof HTMLElement) element.focus();
    },
  };

  const elementProps = mergeProps(
    filterDOMProps(fromProps(props), { global: true, labelable: true }),
    styleProps(props),
    {
      // A toolbar only while there are chips to move between: an input alone
      // in a toolbar is a toolbar of one.
      role: () => (chips.count() > 0 ? "toolbar" : undefined),
      "data-disabled": root.isDisabled,
      "data-testid": () => props["data-testid"]?.(),
      onMouseDown: (event: MouseEvent) => {
        // The box is the field, so a press on its own padding is a press on
        // the input.
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        root.focusInput();
      },
    },
  );

  return (
    <ComboboxChipsProvider value={chips}>
      <div {...elementProps} ref={mergeRefs(root.chipsRef.set, props.ref?.())}>
        {props.children}
      </div>
    </ComboboxChipsProvider>
  );
}

export interface ComboboxChipValue {
  remove: () => void;
  /** What the chip's value reads as, for naming the button that removes it. */
  label: Accessor<string>;
}

const ComboboxChipContext = createContext<ComboboxChipValue | null>(null);

/** The enclosing {@link ComboboxChip}. */
export function useComboboxChip(): ComboboxChipValue {
  const value = getContext(ComboboxChipContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a ComboboxChip.");
  }
  return value;
}

function ComboboxChipProvider(props: Incoming<{ value: ComboboxChipValue; children?: Child }>) {
  return provide(
    ComboboxChipContext,
    () => props.value(),
    () => props.children as unknown,
  );
}

export interface ComboboxChipProps extends StyleProps {
  children?: Child;
  "aria-label"?: string;
  ref?: RefTarget<HTMLDivElement>;
}

/**
 * One chosen value. Which one is its position among the chips, so it needs
 * telling nothing.
 *
 * Reached with the arrows from the input rather than with Tab: a field holding
 * eight values would otherwise be eight stops before the next field.
 */
export function ComboboxChip(props: Incoming<ComboboxChipProps>) {
  const root = useComboboxRoot();
  const locale = useLocale();
  const chips = getContext(ComboboxChipsContext);
  if (chips === null || chips === undefined) {
    throw new Error("A ComboboxChip must be rendered inside a ComboboxChips.");
  }

  const chip = staticItem(chips.registry, { textValue: "" });
  const [isFocused, setFocused] = createSignal(false);
  const index = (): number => chips.registry.keys().indexOf(chip.key);

  const remove = (): void => {
    const at = index();
    if (at >= 0) root.removeAt(at);
  };
  const label = (): string => {
    const value = root.values()[index()];
    return value === undefined ? "" : root.labelOf(value);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.target !== event.currentTarget) return;
    const at = index();
    const isRtl = locale().direction === "rtl";
    const back = isRtl ? "ArrowRight" : "ArrowLeft";
    const forward = isRtl ? "ArrowLeft" : "ArrowRight";

    if (event.key === back) {
      event.preventDefault();
      chips.focus(Math.max(0, at - 1));
    } else if (event.key === forward) {
      event.preventDefault();
      if (at + 1 < chips.count()) chips.focus(at + 1);
      else root.focusInput();
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      // Focus moves BEFORE the chip goes: once it is removed there is nothing
      // focused to move from, and the keyboard is back at the top of the page.
      if (at + 1 < chips.count()) chips.focus(at + 1);
      else if (at > 0) chips.focus(at - 1);
      else root.focusInput();
      remove();
    }
  };

  const elementProps = mergeProps(
    filterDOMProps(fromProps(props), { global: true, labelable: true }),
    styleProps(props),
    {
      tabIndex: -1,
      "data-highlighted": isFocused,
      "data-disabled": root.isDisabled,
      "data-testid": () => props["data-testid"]?.(),
      onKeyDown,
      onFocus: (event: FocusEvent) => {
        if (event.target === event.currentTarget) setFocused(true);
      },
      onBlur: () => setFocused(false),
    },
  );

  // The provider is OUTSIDE the element, as it is for every part here: handed
  // a label and a button as two children it would build the button first, and
  // a hydrating page would claim the server's label as the button.
  return (
    <ComboboxChipProvider value={{ remove, label }}>
      <div {...elementProps} ref={mergeRefs(chip.ref, props.ref?.())}>
        {props.children}
      </div>
    </ComboboxChipProvider>
  );
}

/**
 * Hands the removing press to the button inside it.
 *
 * Out of the Tab order, like the chip it is in: Backspace on the chip does the
 * same thing from the keyboard.
 */
export function ComboboxChipRemove(props: Incoming<{ children?: Child }>) {
  const root = useComboboxRoot();
  const chip = useComboboxChip();

  return provide(
    SlotScope,
    () => true,
    () => {
      provideTriggerSlot({
        props: {
          excludeFromTabOrder: true,
          isDisabled: () => root.isDisabled() || root.isReadOnly(),
          onPress: () => {
            chip.remove();
            root.focusInput();
          },
        },
      });
      return props.children;
    },
  );
}
