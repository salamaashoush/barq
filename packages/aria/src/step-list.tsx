/**
 * A step list: the steps of a task, in order, showing which are done, which is
 * current, and which can be visited.
 *
 * A step is reachable only once the way to it is clear: any completed step,
 * and the one straight after the last completed step. Everything further on
 * is `aria-disabled` and out of the Tab order, so the list cannot be used to
 * skip ahead past work that has not been done. Selecting the step after the
 * last completed one completes the one before it, and a selection made from
 * outside that jumps further ahead marks everything up to it complete.
 *
 * Each step is a link to its part of the task, named by three things read in
 * order: its number, its state ("Completed", "Not completed", "Current",
 * visually hidden and in the page's language) and its label. A screen reader
 * user hears where they are without the colour or the tick a sighted user
 * sees.
 *
 * The reachable steps are each a Tab stop, so Tab walks them and Enter or
 * Space selects. The arrows move focus between steps without selecting: a
 * step changes the page, which should not happen as focus passes over it.
 * `isReadOnly` shows the progress with nothing reachable; `isDisabled` the
 * same, greyed.
 *
 * When nothing is selected, or the selected step goes, the first step that is
 * neither disabled nor complete is selected, and reported.
 */

import {
  type Accessor,
  cells,
  type Child,
  createContext,
  createEffect,
  createMemo,
  For,
  getContext,
  getOwner,
  install,
  provide,
  untrack,
} from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import {
  type Collection,
  type ItemAccessors,
  type Key,
  type ListCollection,
  type Node,
  singleSelectListState,
  type SingleSelectListState,
} from "./collections.ts";
import { focusRing } from "./focus.ts";
import { numberFormatter, StringDictionary, stringFormatter } from "./i18n.ts";
import { hover } from "./interactions/hover.ts";
import type { ElementRef } from "./interactions/press.ts";
import { visuallyHidden } from "./live.ts";
import { selectableItem, selectableList } from "./selection.ts";
import {
  access,
  controllable,
  type DOMProps,
  filterDOMProps,
  fromProps,
  id,
  type MaybeAccessor,
  mergeProps,
  type StyleProps,
  styleProps,
} from "./utils.ts";

const stepListStrings = new StringDictionary<"steplist" | "completed" | "notCompleted" | "current">(
  {
    "ar-AE": {
      steplist: "قائمة الخطوات",
      completed: "مكتمل: ",
      notCompleted: "غير مكتمل: ",
      current: "الحالي: ",
    },
    "bg-BG": {
      steplist: "Списък със стъпки",
      completed: "Завършено: ",
      notCompleted: "Незавършено: ",
      current: "Текущ: ",
    },
    "cs-CZ": {
      steplist: "Seznam kroků",
      completed: "Dokončeno: ",
      notCompleted: "Nedokončeno: ",
      current: "Aktuální: ",
    },
    "da-DK": {
      steplist: "Trinliste",
      completed: "Fuldført: ",
      notCompleted: "Ikke afsluttet: ",
      current: "Nuværende: ",
    },
    "de-DE": {
      steplist: "Schrittliste",
      completed: "Abgeschlossen: ",
      notCompleted: "Nicht abgeschlossen: ",
      current: "Aktuell: ",
    },
    "el-GR": {
      steplist: "Λίστα βημάτων",
      completed: "Ολοκληρώθηκε:  ",
      notCompleted: "Μη ολοκληρωμένο:  ",
      current: "Τρέχον:  ",
    },
    "en-US": {
      steplist: "Step List",
      completed: "Completed: ",
      notCompleted: "Not completed: ",
      current: "Current: ",
    },
    "es-ES": {
      steplist: "Lista de pasos",
      completed: "Completado: ",
      notCompleted: "No se ha completado: ",
      current: "Actual: ",
    },
    "et-EE": {
      steplist: "Sammude loend",
      completed: "Lõpetatud: ",
      notCompleted: "Lõpetamata: ",
      current: "Praegune: ",
    },
    "fi-FI": {
      steplist: "Vaiheluettelo",
      completed: "Valmistunut: ",
      notCompleted: "Ei valmis: ",
      current: "Nykyinen: ",
    },
    "fr-FR": {
      steplist: "Liste des étapes",
      completed: "Terminé : ",
      notCompleted: "Pas terminé : ",
      current: "Actuel : ",
    },
    "he-IL": {
      steplist: "רשימת צעדים",
      completed: "הושלם:  ",
      notCompleted: "לא הושלם:  ",
      current: "נוכחי: ",
    },
    "hr-HR": {
      steplist: "Lista koraka",
      completed: "Završeno: ",
      notCompleted: "Nije završeno: ",
      current: "Trenutno: ",
    },
    "hu-HU": {
      steplist: "Lépések listája",
      completed: "Elkészült: ",
      notCompleted: "Nincs kész: ",
      current: "Jelenlegi: ",
    },
    "it-IT": {
      steplist: "Elenco dei passaggi",
      completed: "Completato: ",
      notCompleted: "Non completato: ",
      current: "Attuale: ",
    },
    "ja-JP": {
      steplist: "手順リスト",
      completed: "完了 :",
      notCompleted: "未完了 :",
      current: "現在 :",
    },
    "ko-KR": {
      steplist: "단계 목록",
      completed: "완료됨: ",
      notCompleted: "완료되지 않음: ",
      current: "현재: ",
    },
    "lt-LT": {
      steplist: "Žingsnių sąrašas",
      completed: "Užbaigta: ",
      notCompleted: "Ne pabaigtas: ",
      current: "Dabartinis: ",
    },
    "lv-LV": {
      steplist: "Darbību saraksts",
      completed: "Pabeigts: ",
      notCompleted: "Nav pabeigts: ",
      current: "Pašreizējais: ",
    },
    "nb-NO": {
      steplist: "Trinnliste",
      completed: "Fullført: ",
      notCompleted: "Ikke fullført: ",
      current: "Nåværende: ",
    },
    "nl-NL": {
      steplist: "Stappenlijst",
      completed: "Voltooid: ",
      notCompleted: "Niet voltooid: ",
      current: "Actueel: ",
    },
    "pl-PL": {
      steplist: "Lista kroków",
      completed: "Ukończone: ",
      notCompleted: "Nie ukończone: ",
      current: "Aktualny: ",
    },
    "pt-BR": {
      steplist: "Lista de etapas",
      completed: "Concluído: ",
      notCompleted: "Incompleto: ",
      current: "Atual: ",
    },
    "pt-PT": {
      steplist: "Lista de passos",
      completed: "Concluído: ",
      notCompleted: "Não concluído: ",
      current: "Atual: ",
    },
    "ro-RO": {
      steplist: "Lista de pași",
      completed: "Finalizat: ",
      notCompleted: "Nefinalizat: ",
      current: "Actual: ",
    },
    "ru-RU": {
      steplist: "Список шагов",
      completed: "Завершено: ",
      notCompleted: "Не завершено: ",
      current: "Текущее: ",
    },
    "sk-SK": {
      steplist: "Zoznam krokov",
      completed: "Dokončené: ",
      notCompleted: "Nedokončené: ",
      current: "Aktuálne: ",
    },
    "sl-SI": {
      steplist: "Seznam korakov",
      completed: "Dokončano: ",
      notCompleted: "Ni dokončano: ",
      current: "Trenutno: ",
    },
    "sr-SP": {
      steplist: "Lista koraka",
      completed: "Završeno: ",
      notCompleted: "Nije završeno: ",
      current: "Trenutno: ",
    },
    "sv-SE": {
      steplist: "Steglista",
      completed: "Avslutad: ",
      notCompleted: "Ej genomförd: ",
      current: "Nuvarande: ",
    },
    "tr-TR": {
      steplist: "Adım Listesi",
      completed: "Tamamlanmış: ",
      notCompleted: "Tamamlanmamıs: ",
      current: "Güncel: ",
    },
    "uk-UA": {
      steplist: "Список кроків",
      completed: "Завершено: ",
      notCompleted: "Не завершено: ",
      current: "Поточний: ",
    },
    "zh-CN": {
      steplist: "步骤列表",
      completed: "已完成：",
      notCompleted: "未完成：",
      current: "当前：",
    },
    "zh-TW": {
      steplist: "步驟清單",
      completed: "已完成：",
      notCompleted: "未完成：",
      current: "目前：",
    },
  },
);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface StepListStateOptions<T> extends ItemAccessors<T> {
  items?: MaybeAccessor<Iterable<T> | undefined>;
  selectedKey?: MaybeAccessor<Key | null | undefined>;
  defaultSelectedKey?: MaybeAccessor<Key | null | undefined>;
  /** Reported with the step selected, never with nothing. */
  onSelectionChange?: (key: Key) => void;
  lastCompletedStep?: MaybeAccessor<Key | null | undefined>;
  defaultLastCompletedStep?: MaybeAccessor<Key | null | undefined>;
  onLastCompletedStepChange?: (key: Key | null) => void;
  disabledKeys?: MaybeAccessor<Iterable<Key> | undefined>;
  /** Nothing is reachable, and the list says so. */
  isDisabled?: MaybeAccessor<boolean | undefined>;
  /** Nothing is reachable; the steps are shown, not offered. */
  isReadOnly?: MaybeAccessor<boolean | undefined>;
}

export interface StepListState<T> extends SingleSelectListState<T> {
  lastCompletedStep: Accessor<Key | null>;
  setLastCompletedStep(key: Key): void;
  /** At or before the last completed step. */
  isCompleted(key: Key | null | undefined): boolean;
  /** Whether the step can be selected now. */
  isSelectable(key: Key): boolean;
  isDisabled: Accessor<boolean>;
  isReadOnly: Accessor<boolean>;
}

interface StepOrder {
  index: Map<Key, number>;
  previous: Map<Key, Key | undefined>;
}

function orderOf(collection: Collection<unknown>): StepOrder {
  const index = new Map<Key, number>();
  const previous = new Map<Key, Key | undefined>();
  let before: Key | undefined;
  for (const node of collection) {
    index.set(node.key, index.size);
    previous.set(node.key, before);
    before = node.key;
  }
  return { index, previous };
}

/**
 * ```ts
 * const state = stepListState({ items: () => steps, defaultLastCompletedStep: "details" });
 * state.isSelectable("payment");
 * ```
 */
export function stepListState<T>(options: StepListStateOptions<T>): StepListState<T> {
  const list = singleSelectListState<T>({
    ...options,
    onSelectionChange: (key) => {
      if (key !== null) options.onSelectionChange?.(key);
    },
  });

  const [lastCompletedStep, setLastCompletedStep] = controllable<Key | null>(
    () => access(options.lastCompletedStep),
    () => access(options.defaultLastCompletedStep) ?? null,
    options.onLastCompletedStepChange,
  );

  const order = createMemo(() => orderOf(list.collection() as Collection<unknown>));

  function isCompleted(step: Key | null | undefined): boolean {
    if (step === undefined || step === null) return false;
    const last = lastCompletedStep();
    if (last === null) return false;
    const { index } = order();
    const at = index.get(step);
    const through = index.get(last);
    return at !== undefined && through !== undefined && at <= through;
  }

  function isDisabled(): boolean {
    return access(options.isDisabled) === true;
  }
  function isReadOnly(): boolean {
    return access(options.isReadOnly) === true;
  }

  function isSelectable(step: Key): boolean {
    if (isDisabled() || isReadOnly()) return false;
    if (list.disabledKeys().has(step)) return false;
    if (isCompleted(step)) return true;
    return isCompleted(order().previous.get(step)) || step === list.collection().getFirstKey();
  }

  function firstOpenStep(collection: ListCollection<T>, disabled: Set<Key>): Key | null {
    let key = collection.getFirstKey();
    while (key !== null && key !== collection.getLastKey()) {
      if (!disabled.has(key) && !isCompleted(key)) break;
      key = collection.getKeyAfter(key);
    }
    return key;
  }

  if (!isServer) {
    createEffect(
      () => ({
        collection: list.collection(),
        selected: list.selectedKey(),
        last: lastCompletedStep(),
        disabled: list.disabledKeys(),
      }),
      ({ collection, selected, last, disabled }) =>
        untrack(() => {
          // A step is always selected: the first open one when nothing is,
          // or when the selected step has gone.
          let key = selected;
          if (key === null || collection.getItem(key) === null) {
            key = firstOpenStep(collection, disabled);
            if (key !== null) list.selectionManager().replaceSelection(key);
          }

          const manager = list.selectionManager();
          if (manager.focusedKey === null && key !== null && isSelectable(key)) {
            manager.setFocusedKey(key);
          }

          // Selected past the step after the last completed one, from
          // outside: everything before it is done.
          if (key === null) return;
          const { index, previous } = order();
          const at = index.get(key);
          const through = last === null ? -1 : (index.get(last) ?? -1);
          const before = previous.get(key);
          if (at !== undefined && at > 0 && at > through + 1 && before !== undefined) {
            setLastCompletedStep(before);
          }
        }),
    );
  }

  return {
    ...list,
    lastCompletedStep,
    setLastCompletedStep: (key) => setLastCompletedStep(key),
    isCompleted,
    isSelectable,
    isDisabled,
    isReadOnly,
    setSelectedKey: (key) => {
      if (key !== null) {
        const before = order().previous.get(key);
        if (before !== undefined && !isCompleted(before)) setLastCompletedStep(before);
      }
      list.setSelectedKey(key);
    },
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface StepListOptions {
  ref: ElementRef;
  id?: MaybeAccessor<string | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
  "aria-describedby"?: MaybeAccessor<string | undefined>;
  "aria-details"?: MaybeAccessor<string | undefined>;
}

export interface StepListResult {
  listProps: DOMProps;
}

/**
 * The list's element: its name and the arrows.
 *
 * ```tsx
 * const { listProps } = stepList({ ref: domRef }, state);
 * <ol {...listProps} ref={domRef.set}>…</ol>
 * ```
 */
export function stepList(options: StepListOptions, state: StepListState<unknown>): StepListResult {
  const message = stringFormatter(stepListStrings);

  const { listProps } = selectableList({
    ref: options.ref,
    collection: state.collection,
    selectionManager: state.selectionManager,
    // The arrows pass over what cannot be reached, as they would a disabled
    // item: focus on a step that does nothing is a dead end.
    disabledKeys: () => {
      const unreachable = new Set<Key>();
      for (const key of state.collection().getKeys()) {
        if (!state.isSelectable(key)) unreachable.add(key);
      }
      return unreachable;
    },
    // Every reachable step is its own Tab stop.
    allowsTabNavigation: true,
    disallowEmptySelection: true,
    disallowTypeAhead: true,
  });

  return {
    listProps: mergeProps(listProps, filterDOMProps(options, { labelable: true }), {
      "aria-label": () =>
        access(options["aria-label"]) ??
        (access(options["aria-labelledby"]) === undefined
          ? message().format("steplist")
          : undefined),
      // The steps are the stops; the list itself is never one.
      tabIndex: () => undefined,
    }),
  };
}

export interface StepListItemOptions {
  key: Key;
  ref: ElementRef;
}

export interface StepListItemResult {
  /** For the step's own element: a link to its part of the task. */
  stepProps: DOMProps;
  /** For the visually hidden element that says how far along the step is. */
  stepStateProps: DOMProps;
  /** "Completed: ", "Not completed: " or "Current: ", in the page's language. */
  stepStateText: Accessor<string>;
  isSelected: Accessor<boolean>;
  isCompleted: Accessor<boolean>;
  isSelectable: Accessor<boolean>;
  isPressed: Accessor<boolean>;
  isFocused: Accessor<boolean>;
}

/**
 * One step.
 *
 * ```tsx
 * const step = stepListItem({ key: node.key, ref: domRef }, state);
 * <a {...step.stepProps} ref={domRef.set}>
 *   <span {...step.stepStateProps}>{step.stepStateText()}</span>
 *   {node.textValue}
 * </a>
 * ```
 */
export function stepListItem(
  options: StepListItemOptions,
  state: StepListState<unknown>,
): StepListItemResult {
  const { key } = options;
  const message = stringFormatter(stepListStrings);
  function isSelectable(): boolean {
    return state.isSelectable(key);
  }
  function isSelected(): boolean {
    return state.selectedKey() === key;
  }
  function isCompleted(): boolean {
    return state.isCompleted(key);
  }

  const { itemProps, isPressed, isFocused } = selectableItem({
    key,
    ref: options.ref,
    selectionManager: state.selectionManager,
    isDisabled: () => !isSelectable(),
  });
  const { visuallyHiddenProps } = visuallyHidden();

  return {
    isSelected,
    isCompleted,
    isSelectable,
    isPressed,
    isFocused,
    stepStateText: () => {
      if (isSelected()) return message().format("current");
      if (isCompleted()) return message().format("completed");
      return message().format("notCompleted");
    },
    stepStateProps: visuallyHiddenProps,
    stepProps: mergeProps(itemProps, {
      role: "link",
      "aria-current": () => (isSelected() ? "step" : undefined),
      "aria-disabled": () => (isSelectable() ? undefined : true),
      tabIndex: () => (isSelectable() ? 0 : undefined),
    }),
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

const StepListContext = createContext<StepListState<unknown> | null>(null);
const StepNodeContext = createContext<Node<unknown> | null>(null);

/** The enclosing {@link StepList}'s state, for a step of the caller's own. */
export function useStepList(): StepListState<unknown> | null {
  return getContext(StepListContext) ?? null;
}

export interface StepListComponentProps<T> extends StyleProps, ItemAccessors<T> {
  /** The steps, in order. */
  items: Iterable<T>;
  /** How one renders. Return a `<StepListItem>`. */
  children: (item: T) => Child;
  selectedKey?: Key | null;
  defaultSelectedKey?: Key | null;
  lastCompletedStep?: Key | null;
  defaultLastCompletedStep?: Key | null;
  disabledKeys?: Iterable<Key>;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  /** Only for styling: the steps are a list whichever way they run. @default "horizontal" */
  orientation?: "horizontal" | "vertical";
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-details"?: string;
  ref?: RefTarget<HTMLOListElement>;
  onSelectionChange?: (key: Key) => void;
  onLastCompletedStepChange?: (key: Key | null) => void;
}

/**
 * ```tsx
 * <StepList aria-label="Checkout" items={steps} defaultLastCompletedStep="cart">
 *   {(step) => <StepListItem>{step.name}</StepListItem>}
 * </StepList>
 * ```
 */
export function StepList<T>(props: StepListComponentProps<T>) {
  const domRef = makeRef<HTMLOListElement>();
  const options = fromProps(cells(props));

  const state = stepListState<T>({
    // The item accessors arrive as Cells around the callbacks, which is what
    // `buildCollection` unwraps.
    ...(options as unknown as ItemAccessors<T>),
    items: () => props.items,
    selectedKey: () => props.selectedKey,
    defaultSelectedKey: () => props.defaultSelectedKey,
    lastCompletedStep: () => props.lastCompletedStep,
    defaultLastCompletedStep: () => props.defaultLastCompletedStep,
    disabledKeys: () => props.disabledKeys,
    isDisabled: () => props.isDisabled,
    isReadOnly: () => props.isReadOnly,
    onSelectionChange: (key) => props.onSelectionChange?.(key),
    onLastCompletedStepChange: (key) => props.onLastCompletedStepChange?.(key),
  }) as unknown as StepListState<unknown>;

  const { listProps } = stepList(
    {
      ref: domRef,
      "aria-label": () => props["aria-label"],
      "aria-labelledby": () => props["aria-labelledby"],
      "aria-describedby": () => props["aria-describedby"],
      "aria-details": () => props["aria-details"],
    },
    state,
  );

  const elementProps = mergeProps(
    listProps,
    filterDOMProps(options, { global: true }),
    styleProps(cells(props)),
    {
      "data-orientation": () => props.orientation ?? "horizontal",
      "data-disabled": () => props.isDisabled === true,
      "data-readonly": () => props.isReadOnly === true,
      "data-testid": () => props["data-testid"],
    },
  );

  const render = props.children as (item: unknown) => Child;

  return (
    <ol {...elementProps} ref={mergeRefs(domRef.set, props.ref)}>
      <StepListProvider state={state}>
        <For each={() => [...state.collection()]}>
          {(node: Node<unknown>) => {
            const owner = getOwner();
            if (owner !== null) install(owner, StepNodeContext, () => node);
            return render(node.value);
          }}
        </For>
      </StepListProvider>
    </ol>
  );
}

interface StepListProviderProps {
  state: StepListState<unknown>;
  children?: Child;
}

function StepListProvider(props: StepListProviderProps) {
  return provide(
    StepListContext,
    () => props.state,
    () => props.children as unknown,
  );
}

export interface StepListItemComponentProps extends StyleProps {
  /** The step's label. */
  children?: Child;
  ref?: RefTarget<HTMLAnchorElement>;
}

/**
 * One step: an `<li>` holding the link.
 *
 * The link holds three parts, which is what its name is built from: the
 * visually hidden state, the label (`data-step-label`) and the step's number
 * (`data-step-marker`), both `aria-hidden` so they are read once, through the
 * name, rather than again as content.
 */
export function StepListItem(props: StepListItemComponentProps) {
  const state = getContext(StepListContext);
  const node = getContext(StepNodeContext);
  if (state === null || state === undefined || node === null || node === undefined) {
    throw new Error("A StepListItem must be rendered by its StepList's item callback.");
  }
  const domRef = makeRef<HTMLAnchorElement>();
  const step = stepListItem({ key: node.key, ref: domRef }, state);
  const number = numberFormatter();
  const markerId = id();
  const stateId = id();
  const labelId = id();
  const isDisabled: () => boolean = () => state.isDisabled() || state.disabledKeys().has(node.key);

  const { hoverProps, isHovered } = hover({
    isDisabled: () => !step.isSelectable() || step.isSelected(),
  });
  const { focusProps, isFocusVisible } = focusRing();

  const linkProps = mergeProps(
    step.stepProps,
    hoverProps,
    focusProps,
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    {
      "aria-labelledby": () => `${markerId()} ${stateId()} ${labelId()}`,
      "data-selected": step.isSelected,
      "data-completed": step.isCompleted,
      "data-selectable": () => step.isSelectable() && !step.isSelected(),
      "data-disabled": isDisabled,
      "data-pressed": step.isPressed,
      "data-hovered": isHovered,
      "data-focus-visible": isFocusVisible,
      "data-testid": () => props["data-testid"],
    },
  );

  return (
    <li
      data-selected={step.isSelected()}
      data-completed={step.isCompleted()}
      data-disabled={isDisabled()}
    >
      <a {...linkProps} ref={mergeRefs(domRef.set, props.ref)}>
        <span {...step.stepStateProps} id={stateId()}>
          {step.stepStateText()}
        </span>
        <span id={labelId()} aria-hidden="true" data-step-label="">
          {props.children}
        </span>
        <span id={markerId()} aria-hidden="true" data-step-marker="">
          {number().format(node.index + 1)}
        </span>
      </a>
    </li>
  );
}
