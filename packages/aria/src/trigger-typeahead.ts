/**
 * Suggestions a text field offers after a trigger it types: the names after
 * `{{`, the people after `@`, the commands after `/`.
 *
 * The field is a combo box whose text is free: what opens its list is the
 * text just before the caret matching `pattern`,
 * and what a choice does is replace that match. Focus stays in the field:
 * the highlighted option is named with `aria-activedescendant`, Up and Down
 * move it, Enter and Tab choose it, Escape closes the list until the next
 * keystroke. A pointer press on an option keeps focus where it is.
 */

import { type Accessor, createSignal, untrack } from "@barqjs/core";

import { type DOMProps, id } from "./utils.ts";

/** Where the query typed after a trigger sits in the text. */
export interface TriggerMatch {
  /** What was typed after the trigger. */
  query: string;
  /** Where the query starts, right after the trigger. */
  from: number;
  /** The caret. */
  to: number;
}

/** What a choice writes: the new text and where the caret goes. */
export interface TriggerInsert {
  value: string;
  caret: number;
}

export interface TriggerTypeaheadOptions<T> {
  /**
   * Matched against the text before the caret; the match must end at the
   * caret, and its first group is the query: `/\{\{(\w*)$/`.
   */
  pattern: RegExp;
  /** What to offer for a query, in order. Empty closes the list. */
  options: (query: string) => readonly T[];
  /** The text a chosen option puts in place of the query, given what follows the caret. */
  insert: (option: T, match: TriggerMatch, after: string) => string;
  /** The field's text after a choice changed it, as typing reports it. */
  onChange: (value: string) => void;
  isDisabled?: Accessor<boolean>;
}

export interface TriggerTypeahead<T> {
  isOpen: Accessor<boolean>;
  /** What is offered now. */
  options: Accessor<readonly T[]>;
  /** The highlighted option's index. */
  active: Accessor<number>;
  match: Accessor<TriggerMatch | null>;
  listId: Accessor<string>;
  optionId: (index: number) => string;
  /** For the `<input>` or `<textarea>`. */
  inputProps: DOMProps;
  /** For the element that holds the options. */
  listProps: DOMProps;
  /** For each option. */
  optionProps: (index: number) => DOMProps;
  choose: (index: number) => void;
  close: () => void;
}

type TextField = HTMLInputElement | HTMLTextAreaElement;

/** Where `pattern` matches the text of `field` before its caret, if it does. */
export function triggerMatch(text: string, caret: number, pattern: RegExp): TriggerMatch | null {
  const found = pattern.exec(text.slice(0, caret));
  if (found === null) return null;
  const query = found[1] ?? "";
  return { query, from: found.index + found[0].length - query.length, to: caret };
}

/** `written` in place of the query, and the caret after it. */
export function applyTrigger(text: string, match: TriggerMatch, written: string): TriggerInsert {
  return {
    value: text.slice(0, match.from) + written + text.slice(match.to),
    caret: match.from + written.length,
  };
}

export function triggerTypeahead<T>(options: TriggerTypeaheadOptions<T>): TriggerTypeahead<T> {
  const listId = id();
  const [match, setMatch] = createSignal<TriggerMatch | null>(null);
  const [offered, setOffered] = createSignal<readonly T[]>([]);
  const [active, setActive] = createSignal(0);
  let field: TextField | null = null;

  function isOpen(): boolean {
    return match() !== null && offered().length > 0;
  }

  function optionId(index: number): string {
    return `${listId()}-option-${String(index)}`;
  }

  function look(target: TextField): void {
    field = target;
    if (options.isDisabled?.() === true) {
      setMatch(null);
      return;
    }
    const found = triggerMatch(target.value, target.selectionStart ?? 0, options.pattern);
    setMatch(found);
    setOffered(found === null ? [] : options.options(found.query));
    setActive(0);
  }

  function close(): void {
    setMatch(null);
    setOffered([]);
  }

  function choose(index: number): void {
    const at = untrack(match);
    const option = untrack(offered)[index];
    if (at === null || option === undefined || field === null) return;
    const written = options.insert(option, at, field.value.slice(at.to));
    const next = applyTrigger(field.value, at, written);
    field.value = next.value;
    field.setSelectionRange(next.caret, next.caret);
    close();
    options.onChange(next.value);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (!untrack(isOpen)) return;
    const count = untrack(offered).length;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((untrack(active) + 1) % count);
        return;
      case "ArrowUp":
        event.preventDefault();
        setActive((untrack(active) - 1 + count) % count);
        return;
      case "Enter":
      case "Tab":
        event.preventDefault();
        choose(untrack(active));
        return;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
    }
  }

  function fromEvent(event: Event): void {
    const target = event.currentTarget as TextField | null;
    if (target !== null) look(target);
  }

  const inputProps: DOMProps = {
    role: "combobox",
    "aria-autocomplete": "list",
    "aria-expanded": () => (isOpen() ? "true" : "false"),
    "aria-controls": () => (isOpen() ? listId() : undefined),
    "aria-activedescendant": () => (isOpen() ? optionId(active()) : undefined),
    onInput: fromEvent,
    onKeyDown,
    onKeyUp: (event: KeyboardEvent) => {
      if (
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.key === "Home" ||
        event.key === "End"
      ) {
        fromEvent(event);
      }
    },
    onClick: fromEvent,
    onBlur: close,
  };

  const listProps: DOMProps = {
    id: listId,
    role: "listbox",
  };

  function optionProps(index: number): DOMProps {
    return {
      id: optionId(index),
      role: "option",
      "aria-selected": () => (active() === index ? "true" : "false"),
      onPointerDown: (event: PointerEvent) => event.preventDefault(),
      onClick: () => choose(index),
      onPointerMove: () => setActive(index),
    };
  }

  return {
    isOpen,
    options: offered,
    active,
    match,
    listId,
    optionId,
    inputProps,
    listProps,
    optionProps,
    choose,
    close,
  };
}
