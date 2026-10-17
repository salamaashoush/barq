/**
 * A questionnaire: several questions, asked one at a time, answered as one form.
 *
 * The decisions that shape it:
 *
 * - **It is a native form.** Every answer is a real radio, checkbox or text
 *   input carrying the question's `name`, so the answers are read with
 *   `FormData` and the page needs no state of its own to collect them. An
 *   inactive question stays in the document, `hidden` and `inert`, so its
 *   answer is still submitted.
 * - **A question has three states, not two.** `unanswered`, `answered` and
 *   `skipped`. An optional question somebody chose to skip is a decision and
 *   is valid; one nobody has reached is neither. Skipping takes the `name` off
 *   the inputs, so a skipped question submits nothing rather than a stale
 *   choice.
 * - **A typed answer is an answer like any other.** `<QuestionnaireInput>`
 *   beside the choices is selected by typing into it, not by focusing it, and
 *   only carries the question's `name` while it is the selected answer. Radios
 *   therefore stop being `required` where one is present, or the browser would
 *   refuse a form whose question was answered in words.
 * - **Validation is the questionnaire's own by default.** `noValidate` is on,
 *   so the browser's bubbles do not compete with `<QuestionnaireError>`;
 *   turning it off adds `reportValidity()` for a malformed typed answer on top
 *   of the same rules.
 * - **Order is the document's.** Questions and answers register as they are
 *   built, which is not the order they sit in once a `<Show>` adds one in the
 *   middle, so both are sorted by position and re-sorted when the tree changes.
 *   `items` on the root declares the questions up front, which is what gives a
 *   server render the right count and the right shortcuts before anything has
 *   registered.
 * - **The horizontal arrows follow the writing direction.** Back is towards
 *   the start of the line, so they swap under `dir="rtl"`; up and down never
 *   do.
 */

import {
  type Accessor,
  type Child,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  flush,
  getContext,
  getOwner,
  type Incoming,
  install,
  type JSXElement,
  onCleanup,
  untrack,
} from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { useDirection } from "./i18n.ts";
import {
  type DOMProps,
  filterDOMProps,
  fromProps,
  mergeProps,
  partRender,
  type RenderPart,
  type StyleProps,
  styleProps,
} from "./utils.ts";

export type QuestionnaireItemStatus = "unanswered" | "answered" | "skipped";
export type QuestionnaireShortcutMode = "letters" | "numbers";

export interface QuestionnaireChoiceDefinition {
  value: string;
  disabled?: boolean;
}

export interface QuestionnaireItemDefinition {
  name: string;
  choices?: readonly QuestionnaireChoiceDefinition[];
  disabled?: boolean;
  required?: boolean;
}

export type QuestionnaireInputType =
  | "date"
  | "datetime-local"
  | "email"
  | "month"
  | "number"
  | "password"
  | "search"
  | "tel"
  | "text"
  | "time"
  | "url"
  | "week";

export interface QuestionnaireRootState {
  readonly current: Accessor<number>;
  readonly first: Accessor<boolean>;
  readonly last: Accessor<boolean>;
  readonly total: Accessor<number>;
}

export type QuestionnaireProgressState = QuestionnaireRootState;

export interface QuestionnaireItemState {
  readonly active: Accessor<boolean>;
  readonly disabled: Accessor<boolean>;
  readonly invalid: Accessor<boolean>;
  readonly multiple: Accessor<boolean>;
  readonly required: Accessor<boolean>;
  readonly status: Accessor<QuestionnaireItemStatus>;
}

export interface QuestionnaireChoicesState {
  readonly shortcuts: Accessor<QuestionnaireShortcutMode | null>;
}

export interface QuestionnaireChoiceState {
  readonly checked: Accessor<boolean>;
  readonly disabled: Accessor<boolean>;
  readonly invalid: Accessor<boolean>;
  readonly shortcut: Accessor<string | null>;
  readonly type: Accessor<"checkbox" | "radio">;
}

export type QuestionnaireChoiceShortcutState = Pick<QuestionnaireChoiceState, "shortcut">;

export interface QuestionnaireInputState {
  readonly disabled: Accessor<boolean>;
  readonly filled: Accessor<boolean>;
  readonly invalid: Accessor<boolean>;
}

export interface QuestionnaireNavigationState {
  readonly disabled: Accessor<boolean>;
  readonly shortcut: Accessor<"Enter" | null>;
  readonly status: Accessor<QuestionnaireItemStatus | null>;
  readonly visible: Accessor<boolean>;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function hasInputValue(value: string | number | null | undefined): boolean {
  return value !== undefined && value !== null && String(value).trim().length > 0;
}

function shortcutKeys(mode: QuestionnaireShortcutMode | null): string[] {
  if (mode === "letters") {
    return Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
  }
  if (mode === "numbers") return Array.from({ length: 9 }, (_, index) => String(index + 1));
  return [];
}

function shortcutFromKey(key: string, mode: QuestionnaireShortcutMode): string | null {
  const normalized = mode === "letters" ? key.toUpperCase() : key;
  return shortcutKeys(mode).includes(normalized) ? normalized : null;
}

function keyShortcuts(...keys: (string | null | undefined | false)[]): string | undefined {
  const present = keys.filter((key) => typeof key === "string" && key !== "");
  return present.length === 0 ? undefined : present.join(" ");
}

const TEXT_NAVIGABLE = new Set(["email", "password", "search", "tel", "text", "url"]);
const NOT_TEXT_ENTRY = new Set(["button", "checkbox", "radio", "reset", "submit"]);

function isTextEntryTarget(element: Element): boolean {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
  if (element instanceof HTMLInputElement) return !NOT_TEXT_ENTRY.has(element.type);
  return element instanceof HTMLElement && element.isContentEditable;
}

function isRadioTarget(element: Element): boolean {
  return element instanceof HTMLInputElement && element.type === "radio";
}

/**
 * The entries, in the order their elements sit under `scope`.
 *
 * One not under it yet goes last and keeps the order it arrived in, which is
 * every entry while the questionnaire is first being built, and is right then.
 */
function inDocumentOrder<T>(
  entries: readonly T[],
  scope: Element | null,
  selector: string,
  elementOf: (entry: T) => Element,
): T[] {
  if (scope === null) return [...entries];
  const position = new Map<Element, number>();
  for (const [index, element] of scope.querySelectorAll(selector).entries()) {
    position.set(element, index);
  }
  const at = (entry: T): number => position.get(elementOf(entry)) ?? position.size;
  return entries.toSorted((first, second) => at(first) - at(second));
}

interface Collection {
  readonly enabled: readonly QuestionnaireItemDefinition[];
  readonly byName: ReadonlyMap<string, QuestionnaireItemDefinition>;
}

function createCollection(
  items: readonly QuestionnaireItemDefinition[] | undefined,
): Collection | null {
  if (items === undefined) return null;
  return {
    enabled: items.filter((item) => item.disabled !== true),
    byName: new Map(items.map((item) => [item.name, item])),
  };
}

function initialItemName(collection: Collection | null, wanted: string | undefined): string | null {
  if (collection === null) return wanted ?? null;
  const definition = wanted === undefined ? undefined : collection.byName.get(wanted);
  if (definition !== undefined && definition.disabled !== true) return definition.name;
  return collection.enabled[0]?.name ?? null;
}

function shortcutsByChoiceValue(
  item: QuestionnaireItemDefinition | undefined,
  mode: QuestionnaireShortcutMode | null,
): Map<string, string> {
  const out = new Map<string, string>();
  if (item === undefined || mode === null) return out;
  const keys = shortcutKeys(mode);
  let index = 0;
  for (const choice of item.choices ?? []) {
    if (choice.disabled === true) continue;
    const key = keys[index];
    if (key === undefined) break;
    out.set(choice.value, key);
    index++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

interface Answer {
  readonly id: string;
  readonly type: "choice" | "input";
  readonly element: HTMLInputElement;
  readonly disabled: Accessor<boolean>;
  /** A choice's `value`; nothing for a typed answer. */
  readonly value: Accessor<string>;
  /** What the state says a choice's input should show. */
  readonly checked: Accessor<boolean>;
}

function isAnswerFilled(answer: Answer): boolean {
  if (answer.type === "choice") return answer.element.checked;
  return answer.element.hasAttribute("name") && hasInputValue(answer.element.value);
}

function isEmptyNavigableInput(answer: Answer | null): boolean {
  return (
    answer !== null &&
    answer.type === "input" &&
    TEXT_NAVIGABLE.has(answer.element.type) &&
    !hasInputValue(answer.element.value)
  );
}

interface ItemHandle {
  readonly element: HTMLFieldSetElement;
  readonly name: Accessor<string>;
  readonly disabled: Accessor<boolean>;
  readonly required: Accessor<boolean>;
  readonly status: Accessor<QuestionnaireItemStatus>;
  focus(): void;
  focusInvalid(): void;
  validate(): boolean;
  reset(): void;
  skip(): void;
  answerByElement(element: Element): Answer | null;
  answerByShortcut(shortcut: string): Answer | null;
  moveAnswerFocus(element: Element, direction: "next" | "previous"): boolean;
}

interface RootValue {
  readonly activeName: Accessor<string | null>;
  readonly activeRequired: Accessor<boolean | null>;
  readonly activeStatus: Accessor<QuestionnaireItemStatus | null>;
  readonly current: Accessor<number>;
  readonly total: Accessor<number>;
  readonly first: Accessor<boolean>;
  readonly last: Accessor<boolean>;
  readonly declared: Accessor<boolean>;
  readonly definition: (name: string) => QuestionnaireItemDefinition | undefined;
  readonly domVersion: Accessor<number>;
  readonly nativeValidation: Accessor<boolean>;
  readonly shortcuts: Accessor<QuestionnaireShortcutMode | null>;
  readonly backKey: Accessor<"ArrowLeft" | "ArrowRight">;
  readonly forwardKey: Accessor<"ArrowLeft" | "ArrowRight">;
  register(handle: ItemHandle): () => void;
  readonly goNext: () => void;
  readonly goPrevious: () => void;
  readonly skipCurrent: () => void;
}

interface ItemValue {
  readonly name: Accessor<string>;
  readonly disabled: Accessor<boolean>;
  readonly required: Accessor<boolean>;
  readonly multiple: Accessor<boolean>;
  readonly invalid: Accessor<boolean>;
  readonly status: Accessor<QuestionnaireItemStatus>;
  readonly hasInputAnswer: Accessor<boolean>;
  readonly resetVersion: Accessor<number>;
  readonly shortcuts: Accessor<QuestionnaireShortcutMode | null>;
  isSelected(answerId: string): boolean;
  shortcutFor(answerId: string, value: string | undefined): string | null;
  registerAnswer(answer: Answer): () => void;
  registerSelection(answerId: string, selected: boolean): () => void;
  setDefault(answerId: string, selected: boolean): void;
  selectFromInteraction(answerId: string, selected: boolean): void;
  syncControlled(answerId: string, selected: boolean): void;
  /** Put every choice input back to what the state says, after the browser moved one. */
  repair(): void;
  registerDescription(id: string): () => void;
  registerError(id: string): () => void;
}

interface ChoiceValue {
  readonly inputProps: DOMProps;
  readonly stateProps: DOMProps;
  readonly state: QuestionnaireChoiceState;
}

const RootContext = createContext<RootValue | null>(null);
const ItemContext = createContext<ItemValue | null>(null);
const ChoiceContext = createContext<ChoiceValue | null>(null);

function useRoot(): RootValue {
  const value = getContext(RootContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a <Questionnaire>.");
  }
  return value;
}

function useItem(): ItemValue {
  const value = getContext(ItemContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a <QuestionnaireItem>.");
  }
  return value;
}

function useChoice(): ChoiceValue {
  const value = getContext(ChoiceContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a <QuestionnaireChoice>.");
  }
  return value;
}

/** A list other components add themselves to while they are being built. */
function registry<T>(): [
  Accessor<readonly T[]>,
  (entry: T, same?: (other: T) => boolean) => () => void,
] {
  const [entries, setEntries] = createSignal<readonly T[]>([], { ownedWrite: true });
  const add = (entry: T, same?: (other: T) => boolean): (() => void) => {
    setEntries((current) => [
      ...current.filter((other) => other !== entry && same?.(other) !== true),
      entry,
    ]);
    return () => {
      setEntries((current) => current.filter((other) => other !== entry));
    };
  };
  return [entries, add];
}

const present = (value: boolean): "" | undefined => (value ? "" : undefined);

const FORM_PROPS = new Set([
  "action",
  "method",
  "encType",
  "target",
  "name",
  "autoComplete",
  "acceptCharset",
  "rel",
  "role",
]);

const INPUT_PROPS = new Set([
  "placeholder",
  "autoComplete",
  "autoFocus",
  "autoCapitalize",
  "autoCorrect",
  "spellCheck",
  "enterKeyHint",
  "inputMode",
  "maxLength",
  "minLength",
  "min",
  "max",
  "step",
  "pattern",
  "readOnly",
  "required",
  "list",
  "size",
  "aria-required",
  "aria-errormessage",
  "onInput",
  "onChange",
  "onKeyDown",
  "onKeyUp",
  "onCopy",
  "onCut",
  "onPaste",
  "onCompositionStart",
  "onCompositionEnd",
  "onSelect",
]);

const BUTTON_PROPS = new Set(["name", "value", "form", "formAction", "formMethod", "formTarget"]);

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export interface QuestionnaireProps extends StyleProps {
  children?: Child;
  /** The question shown first. @default the first enabled one */
  defaultItem?: string;
  /** The question shown, when the caller owns that. */
  item?: string;
  /** The questions, declared up front so a server render knows them all. */
  items?: readonly QuestionnaireItemDefinition[];
  onItemChange?: (item: string) => void;
  /** Give each choice a key that selects it. */
  shortcuts?: QuestionnaireShortcutMode;
  /** @default true */
  noValidate?: boolean;
  onSubmit?: (event: SubmitEvent) => void;
  onReset?: (event: Event) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  action?: string;
  method?: string;
  name?: string;
  role?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  ref?: RefTarget<HTMLFormElement>;
}

/**
 * ```tsx
 * <Questionnaire onSubmit={(event) => send(new FormData(event.currentTarget))}>
 *   <QuestionnaireProgress />
 *   <QuestionnaireItem name="plan" required>
 *     <QuestionnaireTitle>Which plan?</QuestionnaireTitle>
 *     <QuestionnaireChoices>
 *       <QuestionnaireChoice value="plus">
 *         <QuestionnaireChoiceInput />
 *         <QuestionnaireChoiceLabel>Plus</QuestionnaireChoiceLabel>
 *       </QuestionnaireChoice>
 *     </QuestionnaireChoices>
 *     <QuestionnaireError />
 *   </QuestionnaireItem>
 *   <QuestionnairePrevious />
 *   <QuestionnaireNext />
 *   <QuestionnaireSubmit />
 * </Questionnaire>
 * ```
 */
export function Questionnaire(props: Incoming<QuestionnaireProps>) {
  const options = fromProps(props);
  const direction = useDirection();

  const shortcuts = (): QuestionnaireShortcutMode | null => props.shortcuts?.() ?? null;
  const noValidate = (): boolean => props.noValidate?.() ?? true;
  const backKey = (): "ArrowLeft" | "ArrowRight" =>
    direction() === "rtl" ? "ArrowRight" : "ArrowLeft";
  const forwardKey = (): "ArrowLeft" | "ArrowRight" =>
    direction() === "rtl" ? "ArrowLeft" : "ArrowRight";

  const collection = createMemo(() => createCollection(props.items?.()));
  const [handles, register] = registry<ItemHandle>();
  // `ownedWrite`: the form's own `ref` bumps it, and a ref is called while this
  // component is still being built.
  const [domVersion, setDomVersion] = createSignal(0, { ownedWrite: true });
  const [uncontrolled, setUncontrolled] = createSignal<string | null>(
    untrack(() => initialItemName(collection(), props.defaultItem?.())),
  );
  let form: HTMLFormElement | null = null;
  let observer: MutationObserver | undefined;
  let pendingFocus: { name: string; target: "invalid" | "item" } | null = null;

  const controlled = (): boolean => props.item?.() !== undefined;

  const runtimeItems = createMemo(() => {
    domVersion();
    return inDocumentOrder(handles(), form, "fieldset", (handle) => handle.element).filter(
      (handle) => !handle.disabled(),
    );
  });
  const names = createMemo<readonly string[]>(() => {
    const declared = collection();
    return declared === null
      ? runtimeItems().map((handle) => handle.name())
      : declared.enabled.map((definition) => definition.name);
  });
  const requested = (): string | null => props.item?.() ?? uncontrolled();
  // Before the first question has been made current, the first one is.
  const activeName = (): string | null =>
    requested() ?? (controlled() ? null : (names()[0] ?? null));
  const currentIndex = createMemo(() => {
    const name = activeName();
    return name === null ? -1 : names().indexOf(name);
  });
  const activeItem = createMemo<ItemHandle | null>(() => {
    if (currentIndex() < 0) return null;
    const name = activeName();
    return runtimeItems().find((handle) => handle.name() === name) ?? null;
  });
  const total = (): number => names().length;
  const current = (): number => currentIndex() + 1;
  const first = (): boolean => total() > 0 && currentIndex() === 0;
  const last = (): boolean => total() > 0 && currentIndex() === total() - 1;

  const activeRequired = (): boolean | null => {
    if (currentIndex() < 0) return null;
    const definition = collection()?.byName.get(activeName() ?? "");
    if (definition !== undefined) return definition.required === true;
    return activeItem()?.required() ?? false;
  };
  const activeStatus = (): QuestionnaireItemStatus | null => {
    if (currentIndex() < 0) return null;
    return activeItem()?.status() ?? "unanswered";
  };

  const setItem = (next: string, target: "invalid" | "item" = "item"): void => {
    if (next === requested()) return;
    pendingFocus = { name: next, target };
    if (!controlled()) setUncontrolled(next);
    options.onItemChange?.(next);
  };

  let previousName = untrack(activeName);
  createEffect(
    () => ({ name: activeName(), item: activeItem(), index: currentIndex(), names: names() }),
    (now) => {
      const firstName = now.names[0];
      if (firstName === undefined) return;

      if (untrack(requested) === null && !untrack(controlled)) {
        setUncontrolled(firstName);
        return;
      }
      if (now.index < 0) {
        setItem(firstName);
        return;
      }

      const changed = previousName !== now.name;
      previousName = now.name;
      const pending = pendingFocus;

      if (pending === null || pending.name !== now.name) {
        // A caller that moved a controlled questionnaire itself still expects
        // focus to follow, or a screen reader stays on a question that is gone.
        if (untrack(controlled) && changed) {
          pendingFocus = null;
          now.item?.focus();
        }
        return;
      }

      if (pending.target === "invalid") now.item?.focusInvalid();
      else now.item?.focus();
      pendingFocus = null;
    },
  );

  const goPrevious = (): void => {
    const index = currentIndex();
    const previous = names()[index - 1];
    if (index <= 0 || previous === undefined) return;
    setItem(previous);
  };

  const goNext = (): void => {
    const item = activeItem();
    const next = names()[currentIndex() + 1];
    if (item === null || next === undefined) return;
    if (!item.validate()) {
      item.focusInvalid();
      return;
    }
    setItem(next);
  };

  const confirmCurrent = (): void => {
    const item = activeItem();
    if (item === null) return;
    if (!item.validate()) {
      item.focusInvalid();
      return;
    }
    if (last()) {
      form?.requestSubmit();
      return;
    }
    const next = names()[currentIndex() + 1];
    if (next !== undefined) setItem(next);
  };

  const skipCurrent = (): void => {
    const item = activeItem();
    if (item === null || item.required()) return;
    const wasLast = last();
    const next = names()[currentIndex() + 1];
    item.skip();
    if (!wasLast) {
      if (next !== undefined) setItem(next);
      return;
    }
    // The skip takes the `name` off the question's inputs, and the form has to
    // be read after that has reached the document.
    flush();
    form?.requestSubmit();
  };

  const onReset = (event: Event): void => {
    options.onReset?.(event);
    if (event.defaultPrevented) return;
    for (const handle of handles()) handle.reset();

    const declared = collection();
    const wanted = props.defaultItem?.();
    const name =
      declared === null
        ? (runtimeItems()
            .find((handle) => handle.name() === wanted)
            ?.name() ?? runtimeItems()[0]?.name())
        : initialItemName(declared, wanted);
    if (name !== undefined && name !== null) setItem(name);
  };

  const onSubmit = (event: SubmitEvent): void => {
    const declared = collection();
    const ordered =
      declared === null
        ? runtimeItems()
        : declared.enabled.flatMap((definition) => {
            const handle = runtimeItems().find((each) => each.name() === definition.name);
            return handle === undefined ? [] : [handle];
          });
    const invalid = ordered.find((handle) => !handle.validate());

    if (invalid === undefined) {
      options.onSubmit?.(event);
      return;
    }

    event.preventDefault();
    const wasActive = invalid.name() === activeName();
    setItem(invalid.name(), "invalid");
    if (wasActive) {
      invalid.focusInvalid();
      pendingFocus = null;
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const item = activeItem();
    const target = event.target;
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.keyCode === 229 ||
      item === null ||
      !(target instanceof Element)
    ) {
      return;
    }

    if (
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      !event.shiftKey
    ) {
      event.preventDefault();
      if (!event.repeat) confirmCurrent();
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (item.moveAnswerFocus(target, event.key === "ArrowDown" ? "next" : "previous")) {
        event.preventDefault();
        return;
      }
    }

    if (
      (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
      !isTextEntryTarget(target) &&
      !isRadioTarget(target)
    ) {
      event.preventDefault();
      if (event.repeat) return;
      if (event.key === backKey()) goPrevious();
      else if (item.status() !== "unanswered") goNext();
      return;
    }

    if (event.key === "Enter") {
      const answer = item.answerByElement(target);
      if (answer === null) return;
      // Always taken from an answer, chosen or not: the browser's own Enter
      // submits the form, which here would skip every question after this one.
      event.preventDefault();
      if (!event.repeat && isAnswerFilled(answer)) confirmCurrent();
      return;
    }

    const mode = shortcuts();
    if (mode === null || isTextEntryTarget(target)) return;
    const shortcut = shortcutFromKey(event.key, mode);
    const answer = shortcut === null ? null : item.answerByShortcut(shortcut);
    if (answer === null) return;

    event.preventDefault();
    if (event.repeat) return;
    answer.element.focus();
    if (answer.type === "choice") answer.element.click();
  };

  const attach = (element: HTMLFormElement | null): void => {
    form = element;
    setDomVersion((version) => version + 1);
    if (element === null || isServer || typeof MutationObserver === "undefined") return;
    observer?.disconnect();
    observer = new MutationObserver(() => setDomVersion((version) => version + 1));
    observer.observe(element, { childList: true, subtree: true });
  };
  onCleanup(() => observer?.disconnect());

  const value: RootValue = {
    activeName,
    activeRequired,
    activeStatus,
    current,
    total,
    first,
    last,
    declared: () => collection() !== null,
    definition: (name) => collection()?.byName.get(name),
    domVersion,
    nativeValidation: () => !noValidate(),
    shortcuts,
    backKey,
    forwardKey,
    register: (handle) => register(handle, (other) => other.name() === handle.name()),
    goNext,
    goPrevious,
    skipCurrent,
  };

  const owner = getOwner();
  if (owner !== null) install(owner, RootContext, () => value);

  const formProps = mergeProps(
    filterDOMProps(options, { global: true, labelable: true, propNames: FORM_PROPS }),
    styleProps(props),
    {
      noValidate,
      "data-shortcuts": () => shortcuts() ?? undefined,
      "data-current": () => String(current()),
      "data-total": () => String(total()),
      "data-first": () => present(first()),
      "data-last": () => present(last()),
      // After the caller's own, which may have dealt with the key already.
      onKeyDown: (event: KeyboardEvent): void => {
        options.onKeyDown?.(event);
        onKeyDown(event);
      },
      onReset,
      onSubmit,
    },
  );

  return (
    <form {...formProps} ref={mergeRefs(attach, props.ref?.())}>
      {props.children}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export interface QuestionnaireProgressProps extends StyleProps {
  /** @default "Question 1 of 3" */
  children?: Child;
  "aria-label"?: string;
  ref?: RefTarget<HTMLDivElement>;
  render?: RenderPart<QuestionnaireProgressState>;
}

export function QuestionnaireProgress(props: Incoming<QuestionnaireProgressProps>) {
  const root = useRoot();
  const options = fromProps(props);
  const known = (): boolean => root.total() > 0;
  const label = (): string | undefined =>
    known() ? `Question ${String(root.current())} of ${String(root.total())}` : undefined;

  const elementProps = mergeProps(
    {
      role: "progressbar",
      "aria-label": "Questionnaire progress",
      "aria-live": "polite",
      "aria-valuemin": () => (known() ? 1 : undefined),
      "aria-valuemax": () => (known() ? root.total() : undefined),
      "aria-valuenow": () => (known() ? root.current() : undefined),
      "aria-valuetext": label,
      "data-current": () => String(root.current()),
      "data-total": () => String(root.total()),
      "data-first": () => present(root.first()),
      "data-last": () => present(root.last()),
    },
    filterDOMProps(options, { global: true, labelable: true }),
    styleProps(props),
  );

  const render = props.render?.();
  if (render !== undefined) {
    const state: QuestionnaireProgressState = {
      current: root.current,
      first: root.first,
      last: root.last,
      total: root.total,
    };
    return render(partRender({ ...elementProps, ref: props.ref?.() }), state) as JSXElement;
  }

  return (
    <div {...elementProps} ref={mergeRefs(props.ref?.())}>
      {props.children === undefined ? () => label() : props.children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

export interface QuestionnaireItemProps extends StyleProps {
  children?: Child;
  /** The form field name its answers are submitted under. */
  name: string;
  required?: boolean;
  /** Checkboxes rather than radios. */
  multiple?: boolean;
  /** An error the caller found, on top of the questionnaire's own rule. */
  invalid?: boolean;
  disabled?: boolean;
  onStatusChange?: (status: QuestionnaireItemStatus) => void;
  "aria-describedby"?: string;
  "aria-keyshortcuts"?: string;
  ref?: RefTarget<HTMLFieldSetElement>;
}

export function QuestionnaireItem(props: Incoming<QuestionnaireItemProps>) {
  const root = useRoot();
  const options = fromProps(props);

  const name = (): string => props.name();
  const disabled = (): boolean => props.disabled?.() ?? false;
  const required = (): boolean => props.required?.() ?? false;
  const multiple = (): boolean => props.multiple?.() ?? false;
  const externallyInvalid = (): boolean => props.invalid?.() ?? false;

  // Each of these is written by a child while this question is being built: a
  // choice that starts checked, a description announcing its id.
  const building = { ownedWrite: true } as const;
  const [controls, registerAnswer] = registry<Answer>();
  const [descriptionIds, registerDescription] = registry<string>();
  const [errorIds, registerError] = registry<string>();
  const [selectedIds, setSelectedIds] = createSignal<readonly string[]>([], building);
  const [skipped, setSkipped] = createSignal(false, building);
  const [attempted, setAttempted] = createSignal(false);
  const [resetVersion, setResetVersion] = createSignal(0);
  let defaults: string[] = [];
  let element: HTMLFieldSetElement | null = null;

  const active = (): boolean => !disabled() && root.activeName() === name();
  const answers = createMemo(() => {
    root.domVersion();
    return inDocumentOrder(controls(), element, "input", (answer) => answer.element).filter(
      (answer) => !answer.disabled(),
    );
  });
  const status = createMemo((): QuestionnaireItemStatus => {
    if (skipped()) return "skipped";
    const selected = selectedIds();
    return answers().some((answer) => selected.includes(answer.id)) ? "answered" : "unanswered";
  });
  const intentionallySkipped = (): boolean => status() === "skipped" && !required();
  const valid = (): boolean =>
    disabled() || intentionallySkipped() || (!externallyInvalid() && status() === "answered");
  const invalid = (): boolean =>
    !disabled() && !intentionallySkipped() && (externallyInvalid() || (attempted() && !valid()));
  const hasInputAnswer = (): boolean => answers().some((answer) => answer.type === "input");

  const declaredShortcuts = createMemo(() =>
    root.declared() ? shortcutsByChoiceValue(root.definition(name()), root.shortcuts()) : null,
  );
  const positionalShortcuts = createMemo(() => {
    const out = new Map<string, string>();
    if (declaredShortcuts() !== null) return out;
    const keys = shortcutKeys(root.shortcuts());
    const choices = answers().filter((answer) => answer.type === "choice");
    for (const [index, answer] of choices.slice(0, keys.length).entries()) {
      out.set(answer.id, keys[index] as string);
    }
    return out;
  });

  const select = (answerId: string, selected: boolean): void => {
    setSelectedIds((current) => {
      if (!selected) return current.filter((id) => id !== answerId);
      if (!untrack(multiple)) return [answerId];
      return current.includes(answerId) ? current : [...current, answerId];
    });
  };

  createEffect(status, (now, previous) => {
    if (previous !== undefined && previous !== now) options.onStatusChange?.(now);
  });

  createEffect(multiple, (now, previous) => {
    if (previous !== true || now) return;
    const kept = untrack(answers).find((answer) => untrack(selectedIds).includes(answer.id));
    setSelectedIds(kept === undefined ? [] : [kept.id]);
  });

  const focusInvalid = (): void => {
    const filled = element?.querySelector<HTMLElement>("input[data-filled][name]:not(:disabled)");
    const control = element?.querySelector<HTMLElement>(
      "input:not([type=hidden]):not(:disabled), textarea:not(:disabled)",
    );
    (filled ?? control ?? element)?.focus();
  };

  const validate = (): boolean => {
    setAttempted(true);
    if (!valid()) return false;
    if (!root.nativeValidation()) return true;

    const malformed = answers().find(
      (answer) =>
        isAnswerFilled(answer) && answer.element.willValidate && !answer.element.validity.valid,
    );
    if (malformed === undefined) return true;
    malformed.element.focus();
    malformed.element.reportValidity();
    return false;
  };

  const moveAnswerFocus = (from: Element, direction: "next" | "previous"): boolean => {
    const all = answers();
    const index = all.findIndex((answer) => answer.element === from);
    const at = index < 0 ? null : (all[index] ?? null);

    if (
      all.length === 0 ||
      (isTextEntryTarget(from) && !isEmptyNavigableInput(at)) ||
      (index < 0 && from !== element)
    ) {
      return false;
    }

    const next =
      index < 0
        ? (all.find(isAnswerFilled) ?? (direction === "next" ? all[0] : all.at(-1)))
        : all[(index + (direction === "next" ? 1 : -1) + all.length) % all.length];

    if (next === undefined || next.element === from) return false;
    // Between two radios the browser already moves and selects.
    if (index >= 0 && isRadioTarget(from) && isRadioTarget(next.element)) return false;

    next.element.focus();
    if (next.type === "choice" && isRadioTarget(next.element)) next.element.click();
    return true;
  };

  const handleFor = (node: HTMLFieldSetElement): ItemHandle => ({
    element: node,
    name,
    disabled,
    required,
    status,
    focus: () => node.focus(),
    focusInvalid,
    validate,
    reset: () => {
      setAttempted(false);
      setSkipped(false);
      setSelectedIds(untrack(multiple) ? [...defaults] : defaults.slice(0, 1));
      setResetVersion((version) => version + 1);
    },
    skip: () => {
      if (untrack(required)) return;
      setSelectedIds([]);
      setSkipped(true);
    },
    answerByElement: (target) => answers().find((answer) => answer.element === target) ?? null,
    answerByShortcut: (shortcut) => {
      const declared = declaredShortcuts();
      if (declared !== null) {
        const wanted = [...declared].find(([, key]) => key === shortcut)?.[0];
        return (
          answers().find((answer) => answer.type === "choice" && answer.value() === wanted) ?? null
        );
      }
      const wanted = [...positionalShortcuts()].find(([, key]) => key === shortcut)?.[0];
      return answers().find((answer) => answer.id === wanted) ?? null;
    },
    moveAnswerFocus,
  });

  let unregister: (() => void) | undefined;
  const attach = (node: HTMLFieldSetElement | null): void => {
    unregister?.();
    unregister = undefined;
    element = node;
    if (node !== null) unregister = root.register(handleFor(node));
  };
  onCleanup(() => unregister?.());

  const value: ItemValue = {
    name,
    disabled,
    required,
    multiple,
    invalid,
    status,
    hasInputAnswer,
    resetVersion,
    shortcuts: root.shortcuts,
    isSelected: (answerId) => selectedIds().includes(answerId),
    shortcutFor: (answerId, choiceValue) =>
      (choiceValue === undefined ? undefined : declaredShortcuts()?.get(choiceValue)) ??
      positionalShortcuts().get(answerId) ??
      null,
    registerAnswer: (answer) => registerAnswer(answer, (other) => other.id === answer.id),
    registerSelection: (answerId, selected) => {
      if (selected) {
        defaults = [...defaults.filter((id) => id !== answerId), answerId];
        setSelectedIds((current) => {
          if (!untrack(multiple)) return current.length > 0 ? current : [answerId];
          return current.includes(answerId) ? current : [...current, answerId];
        });
      }
      return () => {
        defaults = defaults.filter((id) => id !== answerId);
        setSelectedIds((current) => current.filter((id) => id !== answerId));
      };
    },
    setDefault: (answerId, selected) => {
      defaults = defaults.filter((id) => id !== answerId);
      if (selected) defaults.push(answerId);
    },
    selectFromInteraction: (answerId, selected) => {
      setSkipped(false);
      select(answerId, selected);
    },
    syncControlled: (answerId, selected) => {
      if (selected) setSkipped(false);
      select(answerId, selected);
    },
    repair: () => {
      for (const answer of untrack(controls)) {
        if (answer.type === "choice") answer.element.checked = untrack(answer.checked);
      }
    },
    registerDescription,
    registerError,
  };

  const owner = getOwner();
  if (owner !== null) install(owner, ItemContext, () => value);

  const describedBy = (): string | undefined => {
    const ids = [
      ...descriptionIds(),
      ...(invalid() ? errorIds() : []),
      props["aria-describedby"]?.(),
    ].filter((id) => id !== undefined && id !== "");
    return ids.length === 0 ? undefined : ids.join(" ");
  };

  const fieldsetProps = mergeProps(filterDOMProps(options, { global: true }), styleProps(props), {
    "aria-describedby": describedBy,
    "aria-invalid": () => (invalid() ? true : undefined),
    "aria-keyshortcuts": () =>
      keyShortcuts(
        props["aria-keyshortcuts"]?.(),
        active() && "Meta+Enter Control+Enter",
        active() && answers().length > 0 && "ArrowUp ArrowDown",
        active() && !root.first() && root.backKey(),
        active() && !root.last() && status() !== "unanswered" && root.forwardKey(),
      ),
    disabled,
    hidden: () => !active(),
    inert: () => !active(),
    tabIndex: -1,
    "data-active": () => present(active()),
    "data-disabled": () => present(disabled()),
    "data-invalid": () => present(invalid()),
    "data-multiple": () => present(multiple()),
    "data-required": () => present(required()),
    "data-status": status,
  });

  return (
    <fieldset {...fieldsetProps} ref={mergeRefs(attach, props.ref?.())}>
      {props.children}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Title, description, error
// ---------------------------------------------------------------------------

export interface QuestionnairePartProps extends StyleProps {
  children?: Child;
  render?: RenderPart;
}

/** The question itself: a `<legend>`, so it names the group. */
export function QuestionnaireTitle(props: Incoming<QuestionnairePartProps>) {
  useItem();
  const elementProps = mergeProps(
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
  );
  const render = props.render?.();
  if (render !== undefined) return render(partRender(elementProps)) as JSXElement;
  return <legend {...elementProps}>{props.children}</legend>;
}

export function QuestionnaireDescription(props: Incoming<QuestionnairePartProps>) {
  const item = useItem();
  const generated = createUniqueId();
  const descriptionId = (): string => props.id?.() ?? generated;
  onCleanup(item.registerDescription(untrack(descriptionId)));

  const elementProps = mergeProps(
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    { id: descriptionId },
  );
  const render = props.render?.();
  if (render !== undefined) return render(partRender(elementProps)) as JSXElement;
  return <p {...elementProps}>{props.children}</p>;
}

export interface QuestionnaireErrorProps extends StyleProps {
  /** @default a sentence saying an answer is needed, or that it may be skipped */
  children?: Child;
  render?: RenderPart<Pick<QuestionnaireItemState, "invalid">>;
}

/** Shown, and announced, only while the question is invalid. */
export function QuestionnaireError(props: Incoming<QuestionnaireErrorProps>) {
  const item = useItem();
  const generated = createUniqueId();
  const errorId = (): string => props.id?.() ?? generated;
  onCleanup(item.registerError(untrack(errorId)));

  const message = (): string =>
    item.required() ? "Choose an answer to continue." : "Choose an answer or skip this question.";

  const elementProps = mergeProps(
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      id: errorId,
      hidden: () => !item.invalid(),
      role: () => (item.invalid() ? "alert" : undefined),
      "data-invalid": () => present(item.invalid()),
    },
  );
  const render = props.render?.();
  if (render !== undefined) {
    return render(partRender(elementProps), { invalid: item.invalid }) as JSXElement;
  }
  return <p {...elementProps}>{props.children === undefined ? () => message() : props.children}</p>;
}

// ---------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------

export interface QuestionnaireChoicesProps extends StyleProps {
  children?: Child;
  render?: RenderPart<QuestionnaireChoicesState>;
}

export function QuestionnaireChoices(props: Incoming<QuestionnaireChoicesProps>) {
  const item = useItem();
  const elementProps = mergeProps(
    filterDOMProps(fromProps(props), { global: true, labelable: true }),
    styleProps(props),
    { "data-shortcuts": () => item.shortcuts() ?? undefined },
  );
  const render = props.render?.();
  if (render !== undefined) {
    return render(partRender(elementProps), { shortcuts: item.shortcuts }) as JSXElement;
  }
  return <div {...elementProps}>{props.children}</div>;
}

export interface QuestionnaireChoiceProps extends StyleProps {
  children?: Child;
  /** What is submitted when this choice is the answer. */
  value: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onChange?: (event: Event) => void;
  render?: RenderPart<QuestionnaireChoiceState>;
}

/**
 * One fixed answer: a `<label>` around its input, so the whole row is the
 * target.
 */
export function QuestionnaireChoice(props: Incoming<QuestionnaireChoiceProps>) {
  const item = useItem();
  const options = fromProps(props);
  const answerId = createUniqueId();

  const value = (): string => props.value();
  const ownDisabled = (): boolean => props.disabled?.() ?? false;
  const disabled = (): boolean => item.disabled() || ownDisabled();
  const controlledChecked = (): boolean | undefined => props.checked?.();
  const checked = (): boolean => {
    const controlled = controlledChecked();
    if (controlled === undefined) return item.isSelected(answerId);
    return item.status() === "skipped" ? false : controlled;
  };
  const type = (): "checkbox" | "radio" => (item.multiple() ? "checkbox" : "radio");
  const shortcut = (): string | null => (disabled() ? null : item.shortcutFor(answerId, value()));

  onCleanup(
    item.registerSelection(
      answerId,
      untrack(() => props.defaultChecked?.() ?? false),
    ),
  );
  const initial = untrack(controlledChecked);
  if (initial !== undefined) item.syncControlled(answerId, initial);

  let input: HTMLInputElement | null = null;
  let unregister: (() => void) | undefined;
  const attach = (node: HTMLInputElement | null): void => {
    unregister?.();
    unregister = undefined;
    input = node;
    if (node === null) return;
    unregister = item.registerAnswer({
      id: answerId,
      type: "choice",
      element: node,
      disabled,
      value,
      checked,
    });
  };
  onCleanup(() => unregister?.());

  createEffect(
    () => props.defaultChecked?.() ?? false,
    (now) => item.setDefault(answerId, now),
  );

  createEffect(
    () => ({ controlled: controlledChecked(), version: item.resetVersion() }),
    (now) => {
      if (now.controlled !== undefined) item.syncControlled(answerId, now.controlled);
    },
  );

  // `defaultChecked` is what a native reset restores, and the state's own
  // reset has to agree with it or the two disagree until the next click.
  createEffect(
    () => ({
      checked: checked(),
      fallback: controlledChecked() ?? props.defaultChecked?.() ?? false,
      version: item.resetVersion(),
    }),
    (now) => {
      if (input === null) return;
      input.defaultChecked = now.fallback;
      if (now.version > 0) input.checked = now.checked;
    },
  );

  const onChange = (event: Event): void => {
    options.onChange?.(event);
    const target = event.currentTarget as HTMLInputElement;
    const controlled = untrack(controlledChecked);
    if (controlled === undefined) {
      item.selectFromInteraction(answerId, target.checked);
    } else if (untrack(item.status) === "skipped" && controlled === target.checked) {
      item.selectFromInteraction(answerId, controlled);
    }
    // The browser has already moved the mark, on this input and on the radio
    // it unchecked to do so. Where the state disagrees, the state is right.
    flush();
    item.repair();
  };

  const stateProps: DOMProps = {
    "data-checked": () => present(checked()),
    "data-unchecked": () => present(!checked()),
    "data-disabled": () => present(disabled()),
    "data-invalid": () => present(item.invalid()),
    "data-shortcut": () => shortcut() ?? undefined,
    "data-type": type,
  };

  const state: QuestionnaireChoiceState = {
    checked,
    disabled,
    invalid: item.invalid,
    shortcut,
    type,
  };

  const choice: ChoiceValue = {
    state,
    stateProps,
    inputProps: {
      id: answerId,
      type,
      value,
      checked,
      disabled,
      name: () => (item.status() === "skipped" ? undefined : item.name()),
      required: () => item.required() && !item.multiple() && !item.hasInputAnswer(),
      "aria-invalid": () => (item.invalid() ? true : undefined),
      "aria-keyshortcuts": () => keyShortcuts(shortcut(), !disabled() && checked() && "Enter"),
      onChange,
      ref: attach,
    },
  };

  const owner = getOwner();
  if (owner !== null) install(owner, ChoiceContext, () => choice);

  const labelProps = mergeProps(
    // NOT `id`: it belongs on the input, which is the labelable element.
    filterDOMProps(options, { global: true, id: false }),
    styleProps(props),
    stateProps,
  );

  const render = props.render?.();
  if (render !== undefined) return render(partRender(labelProps), state) as JSXElement;
  return <label {...labelProps}>{props.children}</label>;
}

export interface QuestionnaireChoiceInputProps extends StyleProps {
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  ref?: RefTarget<HTMLInputElement>;
  render?: RenderPart<QuestionnaireChoiceState>;
}

/** The radio or checkbox itself, which is what holds focus and is submitted. */
export function QuestionnaireChoiceInput(props: Incoming<QuestionnaireChoiceInputProps>) {
  const choice = useChoice();
  const { ref: attach, ...inputProps } = choice.inputProps;
  const elementProps = mergeProps(
    filterDOMProps(fromProps(props), { global: true, labelable: true, id: false }),
    styleProps(props),
    choice.stateProps,
    inputProps,
  );
  const ref = mergeRefs(attach as RefTarget<HTMLInputElement>, props.ref?.());
  const render = props.render?.();
  if (render !== undefined) {
    return render(partRender({ ...elementProps, ref }), choice.state) as JSXElement;
  }
  return <input {...elementProps} ref={ref} />;
}

export function QuestionnaireChoiceLabel(props: Incoming<QuestionnairePartProps>) {
  useChoice();
  const elementProps = mergeProps(
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
  );
  const render = props.render?.();
  if (render !== undefined) return render(partRender(elementProps)) as JSXElement;
  return <span {...elementProps}>{props.children}</span>;
}

export interface QuestionnaireChoiceShortcutProps extends StyleProps {
  /** @default the key assigned to the choice */
  children?: Child;
  render?: RenderPart<QuestionnaireChoiceShortcutState>;
}

/**
 * The key that selects the choice, for sighted readers.
 *
 * `aria-hidden`, because the input already carries it in `aria-keyshortcuts`
 * and reading it twice is noise.
 */
export function QuestionnaireChoiceShortcut(props: Incoming<QuestionnaireChoiceShortcutProps>) {
  const choice = useChoice();
  const elementProps = mergeProps(
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      "aria-hidden": true,
      hidden: () => choice.state.shortcut() === null,
      "data-shortcut": () => choice.state.shortcut() ?? undefined,
    },
  );
  const render = props.render?.();
  if (render !== undefined) {
    return render(partRender(elementProps), { shortcut: choice.state.shortcut }) as JSXElement;
  }
  return (
    <span {...elementProps}>
      {props.children === undefined ? () => choice.state.shortcut() : props.children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface QuestionnaireInputProps extends StyleProps {
  /** @default "text" */
  type?: QuestionnaireInputType;
  value?: string | number;
  defaultValue?: string | number;
  disabled?: boolean;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: string;
  maxLength?: number;
  minLength?: number;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  pattern?: string;
  readOnly?: boolean;
  onInput?: (event: InputEvent) => void;
  onChange?: (event: Event) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  ref?: RefTarget<HTMLInputElement>;
  render?: RenderPart<QuestionnaireInputState>;
}

/** A typed answer, on its own or beside the choices. */
export function QuestionnaireInput(props: Incoming<QuestionnaireInputProps>) {
  const item = useItem();
  const options = fromProps(props);
  const answerId = createUniqueId();

  const controlledValue = (): string | number | undefined => props.value?.();
  const defaultFilled = (): boolean => hasInputValue(props.defaultValue?.());
  const [typed, setTyped] = createSignal(untrack(defaultFilled));
  const disabled = (): boolean => item.disabled() || (props.disabled?.() ?? false);
  const filled = (): boolean => {
    const controlled = controlledValue();
    return controlled === undefined ? typed() : hasInputValue(controlled);
  };
  const selected = (): boolean => item.isSelected(answerId);

  onCleanup(item.registerSelection(answerId, untrack(defaultFilled)));
  const initial = untrack(controlledValue);
  if (initial !== undefined) item.syncControlled(answerId, hasInputValue(initial));

  let input: HTMLInputElement | null = null;
  let unregister: (() => void) | undefined;
  const attach = (node: HTMLInputElement | null): void => {
    unregister?.();
    unregister = undefined;
    input = node;
    if (node === null) return;
    const start = untrack(() => props.defaultValue?.());
    // The content attribute, so a native reset has something to restore.
    if (untrack(controlledValue) === undefined && start !== undefined) {
      node.defaultValue = String(start);
    }
    unregister = item.registerAnswer({
      id: answerId,
      type: "input",
      element: node,
      disabled,
      value: () => "",
      checked: () => false,
    });
  };
  onCleanup(() => unregister?.());

  createEffect(defaultFilled, (now) => item.setDefault(answerId, now));

  createEffect(
    () => ({ controlled: controlledValue(), version: item.resetVersion() }),
    (now, previous) => {
      if (now.controlled !== undefined) {
        item.syncControlled(answerId, hasInputValue(now.controlled));
        if (input !== null) input.defaultValue = String(now.controlled);
        return;
      }
      if (previous !== undefined && now.version !== previous.version) {
        setTyped(untrack(defaultFilled));
      }
    },
  );

  const onInput = (event: Event): void => {
    if (untrack(controlledValue) !== undefined) return;
    const next = (event.currentTarget as HTMLInputElement).value.trim().length > 0;
    setTyped(next);
    item.selectFromInteraction(answerId, next);
  };

  const inputProps = mergeProps(
    filterDOMProps(options, {
      global: true,
      labelable: true,
      id: false,
      propNames: INPUT_PROPS,
    }),
    styleProps(props),
    {
      id: answerId,
      type: () => props.type?.() ?? "text",
      disabled,
      // Outside the form until it is the answer, so an abandoned draft is
      // neither submitted nor validated.
      form: () => (selected() ? undefined : ""),
      name: () => (selected() ? item.name() : undefined),
      "aria-invalid": () => (item.invalid() ? true : undefined),
      "aria-keyshortcuts": () => keyShortcuts(!disabled() && filled() && selected() && "Enter"),
      "data-disabled": () => present(disabled()),
      "data-invalid": () => present(item.invalid()),
      "data-filled": () => present(filled()),
      "data-empty": () => present(!filled()),
      onInput,
    },
    props.value === undefined ? null : { value: () => String(controlledValue() ?? "") },
  );

  const ref = mergeRefs(attach, props.ref?.());
  const render = props.render?.();
  if (render !== undefined) {
    const state: QuestionnaireInputState = { disabled, filled, invalid: item.invalid };
    return render(partRender({ ...inputProps, ref }), state) as JSXElement;
  }
  return <input {...inputProps} ref={ref} />;
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export interface QuestionnaireButtonProps extends StyleProps {
  children?: Child;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  ref?: RefTarget<HTMLButtonElement>;
  render?: RenderPart<QuestionnaireNavigationState>;
}

interface NavigationOptions {
  visible: Accessor<boolean>;
  label: string;
  type: "button" | "submit";
  /** Whether Enter on a chosen answer does what this button does. */
  confirms: boolean;
  action?: () => void;
}

/**
 * A button that is in the document for every question and shown for some.
 *
 * Hidden rather than removed, so the row of actions keeps its columns and a
 * layout does not jump when the last question swaps Next for Submit.
 */
function NavigationButton(
  props: Incoming<QuestionnaireButtonProps>,
  navigation: NavigationOptions,
) {
  const root = useRoot();
  const options = fromProps(props);
  const disabled = (): boolean => props.disabled?.() ?? false;
  const shortcut = (): "Enter" | null =>
    navigation.confirms && navigation.visible() && !disabled() ? "Enter" : null;

  const buttonProps = mergeProps(
    filterDOMProps(options, { global: true, labelable: true, propNames: BUTTON_PROPS }),
    styleProps(props),
    {
      type: () => props.type?.() ?? navigation.type,
      disabled,
      hidden: () => !navigation.visible(),
      inert: () => !navigation.visible(),
      "aria-hidden": () => (navigation.visible() ? undefined : true),
      "aria-keyshortcuts": () => shortcut() ?? undefined,
      tabIndex: () => (navigation.visible() ? props.tabIndex?.() : -1),
      "data-visible": () => present(navigation.visible()),
      "data-hidden": () => present(!navigation.visible()),
      "data-disabled": () => present(disabled()),
      "data-shortcut": () => shortcut() ?? undefined,
      "data-status": () => root.activeStatus() ?? undefined,
      // Chained after the caller's `onClick`, which can cancel the move.
      onClick: (event: MouseEvent): void => {
        if (!event.defaultPrevented) navigation.action?.();
      },
    },
  );

  const render = props.render?.();
  if (render !== undefined) {
    const state: QuestionnaireNavigationState = {
      disabled,
      shortcut,
      status: root.activeStatus,
      visible: navigation.visible,
    };
    return render(partRender({ ...buttonProps, ref: props.ref?.() }), state) as JSXElement;
  }

  return (
    <button {...buttonProps} ref={mergeRefs(props.ref?.())}>
      {props.children === undefined ? navigation.label : props.children}
    </button>
  );
}

export function QuestionnairePrevious(props: Incoming<QuestionnaireButtonProps>) {
  const root = useRoot();
  return NavigationButton(props, {
    visible: () => root.total() > 1 && !root.first(),
    label: "Previous",
    type: "button",
    confirms: false,
    action: root.goPrevious,
  });
}

export function QuestionnaireSkip(props: Incoming<QuestionnaireButtonProps>) {
  const root = useRoot();
  return NavigationButton(props, {
    visible: () => root.activeRequired() === false,
    label: "Skip",
    type: "button",
    confirms: false,
    action: root.skipCurrent,
  });
}

export function QuestionnaireNext(props: Incoming<QuestionnaireButtonProps>) {
  const root = useRoot();
  return NavigationButton(props, {
    visible: () => root.total() > 1 && !root.last(),
    label: "Next",
    type: "button",
    confirms: true,
    action: root.goNext,
  });
}

export function QuestionnaireSubmit(props: Incoming<QuestionnaireButtonProps>) {
  const root = useRoot();
  return NavigationButton(props, {
    visible: () => root.total() > 0 && root.last(),
    label: "Submit",
    type: "submit",
    confirms: true,
  });
}
