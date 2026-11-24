/**
 * An autocomplete: a text field that filters, and drives, a collection beside
 * it.
 *
 * Unlike a combo box it owns neither the field nor the list. A search field, a
 * text field or a token field writes the query; a listbox or a menu shows
 * what matches and does what it does with a choice. The autocomplete sits
 * between them and adds three things:
 *
 * - **The query filters the collection.** The collection reads `filter` and
 *   narrows its own nodes, so its keyboard, selection and typeahead all see
 *   only what is shown.
 * - **Focus stays in the field.** The highlighted item is named with
 *   `aria-activedescendant`; the arrows, Home, End and Page keys are passed
 *   on to the collection as if they had been pressed there, and Enter to the
 *   highlighted item, so typing and choosing are one gesture. A mobile screen
 *   reader is the exception: it has no keyboard and cannot follow a virtual
 *   highlight, so there the collection is focused for real.
 * - **Typing forward highlights the first match**, and does it half a second
 *   later on the field: a screen reader reading the letter just typed must not
 *   be interrupted by the item it brought up. Deleting, pasting or undoing
 *   clears the highlight instead, because the list under it changed for a
 *   reason other than narrowing.
 *
 * The parts connect through context, as upstream's do: an input reads
 * {@link useAutocompleteInput}, a collection reads
 * {@link useAutocompleteCollection} and calls `connect` with its state. The
 * hook {@link autocomplete} is the same thing for markup of one's own.
 */

import {
  cells,
  type Accessor,
  type Child,
  createContext,
  createEffect,
  createSignal,
  getContext,
  onCleanup,
  provide,
  untrack,
} from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { ref as makeRef } from "@barqjs/primitives/refs";
import {
  ListCollection,
  type Key,
  type ListState,
  type Node,
  type SelectionManager,
} from "./collections.ts";
import { ownerDocument, targetElement } from "./dom.ts";
import { getInteractionModality } from "./interactions/modality.ts";
import type { ElementRef } from "./interactions/press.ts";
import { isAndroid, isIOS } from "./platform.ts";
import { isCtrlKeyPressed, ListKeyboardDelegate } from "./selection.ts";
import {
  access,
  callback,
  controllable,
  type DOMProps,
  id,
  type MaybeAccessor,
  type ProviderProps,
} from "./utils.ts";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface AutocompleteStateOptions {
  inputValue?: MaybeAccessor<string | undefined>;
  defaultInputValue?: MaybeAccessor<string | undefined>;
  onInputChange?: (value: string) => void;
}

export interface AutocompleteState {
  /** What is typed in the field. */
  inputValue: Accessor<string>;
  setInputValue(value: string): void;
  /** The id the field names with `aria-activedescendant`, if any. */
  focusedNodeId: Accessor<string | null>;
  setFocusedNodeId(value: string | null): void;
}

export function autocompleteState(options: AutocompleteStateOptions = {}): AutocompleteState {
  const [inputValue, setInputValue] = controllable<string>(
    () => access(options.inputValue),
    () => access(options.defaultInputValue) ?? "",
    options.onInputChange,
  );
  const [focusedNodeId, setFocusedNodeId] = createSignal<string | null>(null);
  return { inputValue, setInputValue, focusedNodeId, setFocusedNodeId };
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

/** Whether a node stays, given what it reads as and what is typed. */
export type AutocompleteFilter = (
  textValue: string,
  inputValue: string,
  node: Node<unknown>,
) => boolean;

/** What a collection hands the autocomplete when it connects. */
export interface AutocompleteCollection {
  /** The collection's element, which the field's keys are passed on to. */
  ref: ElementRef;
  state: ListState<unknown>;
  /** The id the item with this key renders under. */
  idFor(key: Key): string;
}

export interface AutocompleteOptions {
  /** The field the query is typed in. */
  inputRef: ElementRef;
  filter?: AutocompleteFilter;
  /** Typing forward leaves the highlight where it is. @default false */
  disableAutoFocusFirst?: MaybeAccessor<boolean | undefined>;
  /** The collection is focused for real, and is a Tab stop of its own. @default false */
  disableVirtualFocus?: MaybeAccessor<boolean | undefined>;
}

/** Options for a `textField` or `searchField`: the field's value is the query. */
export interface AutocompleteInputOptions {
  value: Accessor<string>;
  onChange(value: string): void;
}

/** Options for a `listBox` or `menu`. */
export interface AutocompleteCollectionProps {
  id: Accessor<string>;
  "aria-label": string;
  shouldUseVirtualFocus: Accessor<boolean>;
  disallowTypeAhead: Accessor<boolean>;
  autoFocus: Accessor<"first" | false>;
}

export interface AutocompleteResult {
  /** For the field's element, after the field's own props. */
  inputProps: DOMProps;
  /** For the field's hook. */
  inputOptions: AutocompleteInputOptions;
  /** For the collection's hook. */
  collectionProps: AutocompleteCollectionProps;
  /** Whether a node is shown. Absent when no `filter` was given: everything is. */
  filter: ((textValue: string, node: Node<unknown>) => boolean) | undefined;
  /** `filter` in the shape `listState({ filter })` takes. */
  filterNodes: ((nodes: Iterable<Node<unknown>>) => Iterable<Node<unknown>>) | undefined;
  /** Called by the collection with its state; returns what disconnects it. */
  connect(collection: AutocompleteCollection): () => void;
}

/** How long the field waits before naming the item typing brought up. */
const ANNOUNCE_DELAY = 500;

/** The keys that move the highlight rather than the caret. */
const NAVIGATION = new Set([
  "Home",
  "End",
  "PageDown",
  "PageUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowRight",
  "ArrowLeft",
]);

function copyKeyboardEvent(event: KeyboardEvent): KeyboardEvent {
  return new KeyboardEvent(event.type, {
    key: event.key,
    code: event.code,
    location: event.location,
    repeat: event.repeat,
    isComposing: event.isComposing,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
}

export function autocomplete(
  options: AutocompleteOptions,
  state: AutocompleteState,
): AutocompleteResult {
  const collectionId = id();
  function input(): HTMLElement | null {
    return (access(options.inputRef) as HTMLElement | null) ?? null;
  }

  // A mobile screen reader cannot follow a virtual highlight, so it gets the
  // collection itself.
  const isMobileScreenReader = getInteractionModality() === "virtual" && (isIOS() || isAndroid());
  const [connected, setConnected] = createSignal<AutocompleteCollection | null>(null, {
    ownedWrite: true,
  });
  const [autoFocusOnMount, setAutoFocusOnMount] = createSignal(false, { ownedWrite: true });

  function shouldUseVirtualFocus(): boolean {
    if (isMobileScreenReader || access(options.disableVirtualFocus) === true) return false;
    // A collection that put itself in the Tab order anyway cannot be driven
    // virtually, and the field must not pretend otherwise.
    const element = connected()?.ref;
    const node = element === undefined ? null : (access(element) as Element | null);
    return node === null || !node.hasAttribute("tabindex");
  }
  function hasCollection(): boolean {
    return connected() !== null;
  }

  function manager(): SelectionManager | null {
    return untrack(() => connected()?.state.selectionManager() ?? null);
  }
  function itemElement(key: Key): HTMLElement | null {
    const collection = untrack(connected);
    const field = input();
    if (collection === null || field === null) return null;
    return ownerDocument(field).getElementById(collection.idFor(key));
  }

  let focusFirstPending = false;
  let delayNext = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  function clearTimer(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }
  onCleanup(clearTimer);

  function focusFirstItem(): void {
    if (untrack(connected) === null) {
      setAutoFocusOnMount(true);
      return;
    }
    delayNext = true;
    focusFirstPending = true;
    manager()?.setFocused(true);
  }

  function clearVirtualFocus(clearFocusKey = false): void {
    setAutoFocusOnMount(false);
    clearTimer();
    delayNext = false;
    focusFirstPending = false;
    state.setFocusedNodeId(null);
    const active = manager();
    active?.setFocused(false);
    if (clearFocusKey) active?.setFocusedKey(null);
  }

  if (!isServer) {
    // The first item, once the narrowed collection has one: an effect, because
    // the collection narrows on the flush after the keystroke.
    createEffect(
      () => {
        const collection = connected();
        if (collection === null) return null;
        const delegate = new ListKeyboardDelegate({
          collection: collection.state.collection,
          ref: collection.ref,
          disabledKeys: collection.state.disabledKeys,
        });
        return { first: delegate.getFirstKey(), size: collection.state.collection().size };
      },
      (now) => {
        if (now === null || !focusFirstPending) return;
        if (now.first === null) {
          state.setFocusedNodeId(null);
          // Every item disabled, rather than a collection still loading: stop waiting.
          if (now.size > 0) focusFirstPending = false;
          return;
        }
        const active = manager();
        active?.setFocused(true);
        active?.setFocusedKey(now.first);
        focusFirstPending = false;
      },
    );

    // The field names what the collection has focused, while it has it.
    createEffect(
      () => {
        const collection = connected();
        if (collection === null || !shouldUseVirtualFocus()) return null;
        const active = collection.state.selectionManager();
        const key = active.focusedKey;
        if (!active.isFocused || key === null) return null;
        if (collection.state.collection().getItem(key) === null) return null;
        return collection.idFor(key);
      },
      (next) => {
        clearTimer();
        if (next !== null && delayNext) {
          delayNext = false;
          timer = setTimeout(() => {
            timer = null;
            state.setFocusedNodeId(next);
          }, ANNOUNCE_DELAY);
          return;
        }
        state.setFocusedNodeId(next);
      },
    );
  }

  let lastInputType = "";
  function onBeforeInput(event: InputEvent): void {
    lastInputType = event.inputType;
  }

  function onChange(value: string): void {
    const typed =
      lastInputType === "insertText" ||
      lastInputType === "insertCompositionText" ||
      lastInputType === "insertFromComposition";
    if (typed && access(options.disableAutoFocusFirst) !== true) {
      focusFirstItem();
    } else if (
      lastInputType.includes("insert") ||
      lastInputType.includes("delete") ||
      lastInputType.includes("history")
    ) {
      clearVirtualFocus(true);
    }
    state.setInputValue(value);
  }

  let keyDownTarget: Element | null = null;

  function focusedItem(): HTMLElement | null {
    const key = manager()?.focusedKey ?? null;
    if (key === null || untrack(state.focusedNodeId) === null) return null;
    return itemElement(key);
  }

  function onKeyDown(event: KeyboardEvent): void {
    keyDownTarget = targetElement(event);
    if (event.isComposing) return;
    if (!untrack(hasCollection) || !untrack(shouldUseVirtualFocus)) return;

    const item = focusedItem();
    switch (event.key) {
      case "a":
        if (isCtrlKeyPressed(event)) return;
        break;
      case "Escape":
        // The field may have used it; a dialog around it must not also close.
        if (event.defaultPrevented) return;
        break;
      case " ":
        return;
      case "Tab":
        return;
      default:
        break;
    }

    if (NAVIGATION.has(event.key)) {
      if ((event.key === "Home" || event.key === "End") && item === null && event.shiftKey) return;
      // With nothing highlighted, left and right move the caret.
      if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && item === null) {
        event.stopPropagation();
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") event.preventDefault();
      manager()?.setFocused(true);
    }

    event.stopPropagation();
    const collection = untrack(connected);
    const collectionElement =
      collection === null ? null : ((access(collection.ref) as Element | null) ?? null);
    const target = item ?? collectionElement;
    const proceeds = target === null ? true : target.dispatchEvent(copyKeyboardEvent(event));

    if (!proceeds) {
      event.preventDefault();
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      // Silenced rather than lost: the next arrow up or down starts from it.
      clearVirtualFocus();
    } else if (event.key === "Enter" && item !== null) {
      item.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }
  }

  if (!isServer) {
    // The release of a key passed on goes where the press went, ahead of
    // anything listening on the field, so the item sees a whole press.
    createEffect(input, (field) => {
      if (field === null) return undefined;
      const doc = ownerDocument(field);
      function onKeyUp(event: KeyboardEvent): void {
        if (targetElement(event) !== keyDownTarget || keyDownTarget === null) return;
        if (!untrack(hasCollection) || !untrack(shouldUseVirtualFocus)) return;
        event.stopImmediatePropagation();
        const collection = untrack(connected);
        const target =
          focusedItem() ??
          (collection === null ? null : ((access(collection.ref) as Element | null) ?? null));
        target?.dispatchEvent(copyKeyboardEvent(event));
      }
      doc.addEventListener("keyup", onKeyUp, true);
      return () => doc.removeEventListener("keyup", onKeyUp, true);
    });
  }

  function onBlur(): void {
    // The highlight is left where it was and its ring taken off; coming back
    // puts the ring back on it.
    manager()?.setFocused(false);
  }

  function onFocus(): void {
    const active = manager();
    if (active !== null && active.focusedKey !== null) active.setFocused(true);
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || event.pointerType === "touch") return;
    if (untrack(state.focusedNodeId) === null || input() === null) return;
    if (targetElement(event) === input()) clearVirtualFocus();
  }

  function virtual(): boolean {
    return hasCollection() && shouldUseVirtualFocus();
  }

  const filter =
    options.filter === undefined
      ? undefined
      : (textValue: string, node: Node<unknown>): boolean =>
          options.filter?.(textValue, state.inputValue(), node) ?? true;

  return {
    inputOptions: { value: state.inputValue, onChange },
    inputProps: {
      onBeforeInput,
      onKeyDown: (event: KeyboardEvent) => {
        if (virtual()) onKeyDown(event);
      },
      onFocus: () => {
        if (virtual()) onFocus();
      },
      onBlur: () => {
        if (virtual()) onBlur();
      },
      onPointerDown: (event: PointerEvent) => {
        if (virtual()) onPointerDown(event);
      },
      "aria-activedescendant": () => (virtual() ? (state.focusedNodeId() ?? undefined) : undefined),
      "aria-controls": () => (hasCollection() ? collectionId() : undefined),
      "aria-autocomplete": "list",
      enterkeyhint: "go",
      // The suggestions are the autocomplete's: iOS's autocorrect and
      // Safari's spelling fixes would rewrite the query under them.
      autocorrect: "off",
      spellcheck: "false",
      autocomplete: "off",
    },
    collectionProps: {
      id: collectionId,
      "aria-label": "Suggestions",
      shouldUseVirtualFocus,
      disallowTypeAhead: shouldUseVirtualFocus,
      autoFocus: () => (autoFocusOnMount() ? "first" : false),
    },
    filter,
    filterNodes:
      filter === undefined
        ? undefined
        : (nodes) =>
            (nodes instanceof ListCollection ? nodes : new ListCollection([...nodes])).filter(
              filter,
            ),
    connect(collection) {
      setConnected(collection);
      return () => {
        if (untrack(connected) === collection) setConnected(null);
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export interface AutocompleteInputValue {
  /** Goes on the field's element. */
  ref: (element: Element | null) => void;
  inputProps: DOMProps;
  inputOptions: AutocompleteInputOptions;
}

export interface AutocompleteCollectionValue {
  collectionProps: AutocompleteCollectionProps;
  filter: AutocompleteResult["filter"];
  filterNodes: AutocompleteResult["filterNodes"];
  connect: AutocompleteResult["connect"];
}

interface AutocompleteValue {
  state: AutocompleteState;
  input: AutocompleteInputValue;
  collection: AutocompleteCollectionValue;
}

const AutocompleteContext = createContext<AutocompleteValue | null>(null);

/** The enclosing {@link Autocomplete}'s state. */
export function useAutocompleteState(): AutocompleteState | null {
  return getContext(AutocompleteContext)?.state ?? null;
}

/** What the field inside an {@link Autocomplete} takes, or `null` outside one. */
export function useAutocompleteInput(): AutocompleteInputValue | null {
  return getContext(AutocompleteContext)?.input ?? null;
}

/** What the collection inside an {@link Autocomplete} takes, or `null` outside one. */
export function useAutocompleteCollection(): AutocompleteCollectionValue | null {
  return getContext(AutocompleteContext)?.collection ?? null;
}

export interface AutocompleteComponentProps {
  /** A field and a collection. */
  children?: Child;
  inputValue?: string;
  defaultInputValue?: string;
  onInputChange?: (value: string) => void;
  /** Narrows the collection as the user types. Without it the collection is shown whole. */
  filter?: AutocompleteFilter;
  /** @default false */
  disableAutoFocusFirst?: boolean;
  /** @default false */
  disableVirtualFocus?: boolean;
}

/**
 * ```tsx
 * <Autocomplete filter={contains}>
 *   <SearchField label="Search commands" />
 *   <Menu items={commands()}>{(command) => <MenuItem>{command.name}</MenuItem>}</Menu>
 * </Autocomplete>
 * ```
 */
export function Autocomplete(props: AutocompleteComponentProps) {
  const inputRef = makeRef<HTMLElement>();
  const state = autocompleteState({
    inputValue: () => props.inputValue,
    defaultInputValue: () => props.defaultInputValue,
    onInputChange: (value) => props.onInputChange?.(value),
  });
  const result = autocomplete(
    {
      inputRef,
      filter: callback<[string, string, Node<unknown>], boolean>(cells(props).filter),
      disableAutoFocusFirst: () => props.disableAutoFocusFirst,
      disableVirtualFocus: () => props.disableVirtualFocus,
    },
    state,
  );

  const value: AutocompleteValue = {
    state,
    input: {
      ref: (element) => inputRef.set(element as HTMLElement | null),
      inputProps: result.inputProps,
      inputOptions: result.inputOptions,
    },
    collection: {
      collectionProps: result.collectionProps,
      filter: result.filter,
      filterNodes: result.filterNodes,
      connect: (collection) => result.connect(collection),
    },
  };

  return <AutocompleteProvider value={value}>{props.children}</AutocompleteProvider>;
}

function AutocompleteProvider(props: ProviderProps<AutocompleteValue>) {
  return provide(
    AutocompleteContext,
    () => props.value,
    () => props.children as unknown,
  );
}
