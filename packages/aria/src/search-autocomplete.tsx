/**
 * A search autocomplete: a search field that suggests as you type.
 *
 * It is a combo box whose input is a search field, and both halves keep the
 * behaviour they have on their own here: the suggestions, the virtual focus
 * and the announcements are `comboBox`'s, Enter, Escape and the clear button
 * are `searchField`'s. What is its own is what a SEARCH means:
 *
 * - **The text is a value.** Typing something no suggestion matches and
 *   pressing Enter submits that text, so `allowsCustomValue` is always on,
 *   and nothing typed is ever thrown away for not being an option.
 * - **Submitting reports one of two things.** `onSubmit(value, null)` for the
 *   text, when no suggestion is highlighted; `onSubmit(null, key)` for a
 *   suggestion, chosen with Enter or a click. A suggestion is an answer, not
 *   a selection the field keeps: there is no `selectedKey`.
 * - **Escape clears.** With text in the field it empties it, as a search field
 *   does; with nothing in it, the key goes on to whatever is around the field.
 *
 * A `loadingState` makes the list asynchronous: it may open empty, says "No
 * results" when it is, and an indicator appears once a load has run for half
 * a second, which is long enough not to flicker on a fast answer. With
 * `onLoadMore` the suggestions load a page at a time: the next is asked for
 * as the end of the list scrolls into reach, and `"loadingMore"` shows the
 * indicator as the list's last entry.
 */

import {
  type Accessor,
  cells,
  type Child,
  createEffect,
  createSignal,
  type Incoming,
  onCleanup,
  Show,
  untrack,
} from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import type { ItemAccessors, Key } from "./collections.ts";
import {
  comboBox,
  ComboBoxListBox,
  type ComboBoxOptions,
  type ComboBoxResult,
  type ComboBoxState,
  comboBoxState,
  type ComboBoxStateOptions,
  type FilterFn,
  type MenuTriggerAction,
} from "./combobox.tsx";
import { Popover } from "./dialog.tsx";
import { focusRing } from "./focus.ts";
import { StringDictionary, stringFormatter } from "./i18n.ts";
import { hover } from "./interactions/hover.ts";
import type { Placement } from "./overlays.ts";
import { searchField } from "./textfield.tsx";
import {
  formValidationState,
  type ValidateFunction,
  type ValidationBehavior,
} from "./validation.ts";
import {
  access,
  callback,
  type DOMProps,
  filterDOMProps,
  fromProps,
  type MaybeAccessor,
  mergeProps,
  type StyleProps,
  styleProps,
} from "./utils.ts";

const searchAutocompleteStrings = new StringDictionary<"loading" | "noResults" | "clear">({
  "ar-AE": {
    loading: "جارٍ التحميل...",
    noResults: "لا توجد نتائج",
    clear: "مسح",
  },
  "bg-BG": {
    loading: "Зареждане...",
    noResults: "Няма резултати",
    clear: "Изчисти",
  },
  "cs-CZ": {
    loading: "Načítání...",
    noResults: "Žádné výsledky",
    clear: "Vymazat",
  },
  "da-DK": {
    loading: "Indlæser...",
    noResults: "Ingen resultater",
    clear: "Ryd",
  },
  "de-DE": {
    loading: "Wird geladen...",
    noResults: "Keine Ergebnisse",
    clear: "Löschen",
  },
  "el-GR": {
    loading: "Φόρτωση...",
    noResults: "Χωρίς αποτέλεσμα",
    clear: "Καθαρισμός",
  },
  "en-US": {
    loading: "Loading...",
    noResults: "No results",
    clear: "Clear",
  },
  "es-ES": {
    loading: "Cargando…",
    noResults: "Sin resultados",
    clear: "Borrar",
  },
  "et-EE": {
    loading: "Laadimine...",
    noResults: "Tulemusi pole",
    clear: "Kustuta",
  },
  "fi-FI": {
    loading: "Ladataan...",
    noResults: "Ei tuloksia",
    clear: "Kirkas",
  },
  "fr-FR": {
    loading: "Chargement en cours…",
    noResults: "Aucun résultat",
    clear: "Effacer",
  },
  "he-IL": {
    loading: "טוען...",
    noResults: "אין תוצאות",
    clear: "נקה",
  },
  "hr-HR": {
    loading: "Učitavam...",
    noResults: "Nema rezultata",
    clear: "Izbriši",
  },
  "hu-HU": {
    loading: "Betöltés folyamatban…",
    noResults: "Nincsenek találatok",
    clear: "Törlés",
  },
  "it-IT": {
    loading: "Caricamento...",
    noResults: "Nessun risultato",
    clear: "Cancella",
  },
  "ja-JP": {
    loading: "読み込み中...",
    noResults: "結果なし",
    clear: "クリア",
  },
  "ko-KR": {
    loading: "로드 중...",
    noResults: "결과 없음",
    clear: "지우기",
  },
  "lt-LT": {
    loading: "Įkeliama...",
    noResults: "Rezultatų nėra",
    clear: "Išvalyti",
  },
  "lv-LV": {
    loading: "Notiek ielāde...",
    noResults: "Nav rezultātu",
    clear: "Notīrīt",
  },
  "nb-NO": {
    loading: "Laster inn...",
    noResults: "Ingen resultater",
    clear: "Tøm",
  },
  "nl-NL": {
    loading: "Laden...",
    noResults: "Geen resultaten",
    clear: "Wissen",
  },
  "pl-PL": {
    loading: "Wczytywanie...",
    noResults: "Brak wyników",
    clear: "Wyczyść",
  },
  "pt-BR": {
    loading: "Carregando...",
    noResults: "Nenhum resultado",
    clear: "Limpar",
  },
  "pt-PT": {
    loading: "A carregar...",
    noResults: "Sem resultados",
    clear: "Limpar",
  },
  "ro-RO": {
    loading: "Se încarcă...",
    noResults: "Niciun rezultat",
    clear: "Golire",
  },
  "ru-RU": {
    loading: "Загрузка...",
    noResults: "Результаты отсутствуют",
    clear: "Очистить",
  },
  "sk-SK": {
    loading: "Načítava sa...",
    noResults: "Žiadne výsledky",
    clear: "Vymazať",
  },
  "sl-SI": {
    loading: "Nalaganje...",
    noResults: "Ni rezultatov",
    clear: "Pobrišite",
  },
  "sr-SP": {
    loading: "Učitavam...",
    noResults: "Nema rezultata",
    clear: "Izbriši",
  },
  "sv-SE": {
    loading: "Läser in...",
    noResults: "Inga resultat",
    clear: "Rensa",
  },
  "tr-TR": {
    loading: "Yükleniyor...",
    noResults: "Sonuç yok",
    clear: "Temizle",
  },
  "uk-UA": {
    loading: "Завантаження...",
    noResults: "Результатів немає",
    clear: "Очистити",
  },
  "zh-CN": {
    loading: "正在加载...",
    noResults: "无结果",
    clear: "清除",
  },
  "zh-TW": {
    loading: "正在載入...",
    noResults: "無任何結果",
    clear: "清除",
  },
});

export type SearchAutocompleteLoadingState =
  | "loading"
  | "sorting"
  | "loadingMore"
  | "error"
  | "idle"
  | "filtering";

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface SearchAutocompleteStateOptions<T> extends Omit<
  ComboBoxStateOptions<T>,
  "selectedKey" | "defaultSelectedKey" | "onSelectionChange" | "allowsCustomValue" | "menuTrigger"
> {
  /** What opens the suggestions. @default "input" */
  menuTrigger?: MaybeAccessor<MenuTriggerAction | undefined>;
  /** Called when the text, or a suggestion, is submitted. */
  onSubmit?: (value: string | null, key: Key | null) => void;
}

/**
 * The combo box state a search autocomplete runs on: custom values always
 * allowed, and a chosen suggestion reported as a submission.
 */
export function searchAutocompleteState<T>(
  options: SearchAutocompleteStateOptions<T>,
): ComboBoxState<T> {
  return comboBoxState<T>({
    ...options,
    allowsCustomValue: true,
    onSelectionChange: (key) => {
      if (key !== null) options.onSubmit?.(null, key);
    },
  });
}

export interface SearchAutocompleteOptions extends Omit<
  ComboBoxOptions,
  "buttonRef" | "formValue" | "validate" | "validationState"
> {
  /** Called when the text, or a suggestion, is submitted. */
  onSubmit?: (value: string | null, key: Key | null) => void;
  onClear?: () => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  onKeyUp?: (event: KeyboardEvent) => void;
  /** What the page thinks of the text, checked as it changes. */
  validate?: ValidateFunction<string>;
  /** @default "search" */
  type?: MaybeAccessor<"search" | "text" | undefined>;
}

export interface SearchAutocompleteResult extends Omit<ComboBoxResult, "buttonProps"> {
  /**
   * For the clear button's element: out of the Tab order and hidden from
   * assistive technology, since Escape does the same from the field.
   */
  clearButtonProps: DOMProps;
}

/**
 * ```tsx
 * const state = searchAutocompleteState({ items: () => cities, onSubmit });
 * const { labelProps, inputProps, listBoxProps, clearButtonProps } = searchAutocomplete(
 *   { label: "Search", inputRef, listBoxRef, onSubmit },
 *   state,
 * );
 * ```
 */
export function searchAutocomplete(
  options: SearchAutocompleteOptions,
  state: ComboBoxState<unknown>,
): SearchAutocompleteResult {
  // The search field's keys and clear button, driving the combo box's text.
  // Only those: the label, the description and the validation are the combo
  // box's, so one element is described once.
  const search = searchField(
    {
      value: state.inputValue,
      onChange: (value) => state.setInputValue(value),
      isDisabled: options.isDisabled,
      isReadOnly: options.isReadOnly,
      onClear: () => options.onClear?.(),
      onSubmit: (value) => {
        // A highlighted suggestion is what Enter submits, and the combo box
        // reports it when it chooses it.
        if (state.selectionManager().focusedKey === null) options.onSubmit?.(value, null);
      },
      onKeyDown: options.onKeyDown,
      onKeyUp: options.onKeyUp,
    },
    options.inputRef,
  );

  // The combo box's toggle button is left out: the field opens its list by
  // typing and by the arrows, and its trailing control is the clear button.
  // The text is the value, so the text is what is validated.
  const textValidation = formValidationState<string>({
    value: state.inputValue,
    validate: options.validate,
    validationBehavior: options.validationBehavior,
    isInvalid: options.isInvalid,
    name: options.name,
  });
  const combo = comboBox(
    { ...options, validate: undefined, formValue: "text", validationState: textValidation },
    state,
  );

  return {
    baseId: combo.baseId,
    labelProps: combo.labelProps,
    listBoxProps: combo.listBoxProps,
    descriptionProps: combo.descriptionProps,
    errorMessageProps: combo.errorMessageProps,
    validation: combo.validation,
    errors: combo.errors,
    isInvalid: combo.isInvalid,
    clearButtonProps: search.clearButtonProps,
    inputProps: mergeProps(
      { onKeyDown: search.inputProps.onKeyDown, onKeyUp: search.inputProps.onKeyUp },
      combo.inputProps,
      { type: () => access(options.type) ?? "search" },
    ),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface SearchAutocompleteComponentProps<T> extends StyleProps, ItemAccessors<T> {
  /** Every suggestion, before the typed text narrows it. */
  items: Iterable<T>;
  /** How one renders. Return an `<Option>`. */
  children: (item: T) => Child;
  label?: Child;
  description?: Child;
  errorMessage?: Child;
  placeholder?: string;
  inputValue?: string;
  defaultInputValue?: string;
  disabledKeys?: Iterable<Key>;
  /** @default a locale-aware `contains` */
  filterBy?: FilterFn;
  /** @default "input" */
  menuTrigger?: MenuTriggerAction;
  shouldFocusWrap?: boolean;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  isInvalid?: boolean;
  /** What the page thinks of the text, checked as it changes. */
  validate?: ValidateFunction<string>;
  /** @default "aria" */
  validationBehavior?: ValidationBehavior;
  name?: string;
  form?: string;
  /** Makes the suggestions asynchronous; see the module's notes. */
  loadingState?: SearchAutocompleteLoadingState;
  /** Shown before the input. */
  icon?: Child;
  /** @default "bottom start" */
  placement?: Placement;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  ref?: RefTarget<HTMLInputElement>;
  onSubmit?: (value: string | null, key: Key | null) => void;
  onClear?: () => void;
  /** Called when the end of the suggestions comes into reach, to load the next page. */
  onLoadMore?: () => void;
  onInputChange?: (value: string) => void;
  onOpenChange?: (isOpen: boolean, trigger?: MenuTriggerAction) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  onKeyUp?: (event: KeyboardEvent) => void;
}

const LOADING_DELAY = 500;

/**
 * Whether the loading indicator shows: once a load has run for half a second,
 * restarted by every change to the text, since that is a new request.
 */
function delayedLoading(
  isLoading: Accessor<boolean>,
  inputValue: Accessor<string>,
): Accessor<boolean> {
  const [shown, setShown] = createSignal(false);
  if (isServer) return shown;

  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  onCleanup(stop);

  createEffect(
    () => [isLoading(), inputValue()] as const,
    ([loading]) => {
      if (!loading) {
        stop();
        setShown(false);
        return;
      }
      if (untrack(shown)) return;
      stop();
      timer = setTimeout(() => {
        timer = null;
        setShown(true);
      }, LOADING_DELAY);
    },
  );

  return shown;
}

/**
 * ```tsx
 * <SearchAutocomplete
 *   label="Search"
 *   items={cities()}
 *   onSubmit={(text, key) => (key === null ? searchFor(text) : open(key))}
 * >
 *   {(city) => <Option>{city.name}</Option>}
 * </SearchAutocomplete>
 * ```
 */
export function SearchAutocomplete<T>(props: SearchAutocompleteComponentProps<T>) {
  const inputRef = makeRef<HTMLInputElement>();
  const listRef = makeRef<HTMLUListElement>();
  const popoverRef = makeRef<HTMLDivElement>();
  const options = fromProps(cells(props) as unknown as Incoming<Record<string, unknown>>);
  const message = stringFormatter(searchAutocompleteStrings);
  const isAsync = (): boolean => props.loadingState !== undefined;

  const state = searchAutocompleteState<T>({
    ...(options as SearchAutocompleteStateOptions<T>),
    filterBy: callback<[string, string], boolean>(cells(props).filterBy),
    allowsEmptyCollection: isAsync,
    onSubmit: (value, key) => props.onSubmit?.(value, key),
    onInputChange: (value) => props.onInputChange?.(value),
    onOpenChange: (isOpen, trigger) => props.onOpenChange?.(isOpen, trigger),
  }) as unknown as ComboBoxState<unknown>;

  const {
    labelProps,
    inputProps,
    listBoxProps,
    clearButtonProps,
    descriptionProps,
    errorMessageProps,
    errors,
    isInvalid,
  } = searchAutocomplete(
    {
      ...(options as unknown as SearchAutocompleteOptions),
      inputRef,
      listBoxRef: listRef,
      popoverRef,
      validate: callback(cells(props).validate),
      validationBehavior: () => props.validationBehavior,
      onSubmit: (value, key) => props.onSubmit?.(value, key),
      onClear: () => props.onClear?.(),
    },
    state,
  );

  const { hoverProps, isHovered } = hover({ isDisabled: () => props.isDisabled });
  const { focusProps, isFocused, isFocusVisible } = focusRing({ isTextInput: true });

  const isLoading = (): boolean =>
    props.loadingState === "loading" || props.loadingState === "filtering";
  const loadingShown = delayedLoading(isLoading, state.inputValue);
  const showsLoading = (): boolean =>
    loadingShown() &&
    (state.isOpen() || props.menuTrigger === "manual" || props.loadingState === "loading");

  const inputElementProps = mergeProps(inputProps, hoverProps, focusProps, {
    "data-hovered": isHovered,
    "data-focused": isFocused,
    "data-focus-visible": isFocusVisible,
    "data-open": state.isOpen,
    "data-disabled": () => props.isDisabled === true,
    "data-readonly": () => props.isReadOnly === true,
    "data-invalid": isInvalid,
  });

  const loadingLabel = (): string => message().format("loading");

  return (
    <div
      {...mergeProps(
        // The `data-*` the caller wrote are the input's, as they are on a combo box.
        Object.fromEntries(
          Object.entries(filterDOMProps(options, { global: true, id: false })).filter(
            ([key]) => !key.startsWith("data-"),
          ),
        ),
        styleProps(cells(props)),
        {
          "data-empty": () => state.inputValue() === "",
          "data-open": state.isOpen,
          "data-disabled": () => props.isDisabled === true,
          "data-invalid": isInvalid,
        },
      )}
    >
      <span {...labelProps}>{props.label}</span>
      <div data-search-autocomplete-group="">
        {props.icon}
        <input {...inputElementProps} ref={mergeRefs(inputRef.set, props.ref)} />
        <Show when={showsLoading()}>
          <span role="progressbar" aria-label={loadingLabel()} data-loading="" />
        </Show>
        <Show when={state.inputValue() !== "" && props.isReadOnly !== true}>
          <button type="button" {...clearButtonProps}>
            {message().format("clear")}
          </button>
        </Show>
      </div>
      <Popover
        triggerRef={inputRef}
        isOpen={state.isOpen()}
        onOpenChange={state.setOpen}
        placement={props.placement ?? "bottom start"}
        isDismissable
        ref={popoverRef.set}
      >
        <ComboBoxListBox
          options={listBoxProps}
          state={state}
          listRef={listRef}
          render={props.children as unknown as (item: unknown) => Child}
          renderEmpty={
            isAsync()
              ? (_state: ComboBoxState<unknown>) => (
                  <span data-empty-state="">{message().format("noResults")}</span>
                )
              : undefined
          }
          onLoadMore={props.onLoadMore}
          isLoadingMore={props.loadingState === "loadingMore"}
          renderLoading={(_state: ComboBoxState<unknown>) => (
            <span role="progressbar" aria-label={loadingLabel()} data-loading-more="" />
          )}
        />
      </Popover>
      <span {...descriptionProps}>{props.description}</span>
      <span {...errorMessageProps}>
        {() => {
          const given = props.errorMessage;
          if (given !== undefined && given !== null && given !== "") return given;
          const found = errors();
          return found.length === 0 ? null : found.join(" ");
        }}
      </span>
    </div>
  );
}
