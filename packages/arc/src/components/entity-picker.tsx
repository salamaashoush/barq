import { type Child, For, Show, createSignal, createUniqueId, onCleanup } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Plus } from "@barqjs/lucide/icons/plus";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@barqjs/ui/combobox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@barqjs/ui/field";
import { Spinner } from "@barqjs/ui/spinner";
import { srOnly } from "@barqjs/ui/sr-only";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, glyph, layout, space, type } from "../style/index.ts";
import { HighlightMatches } from "./highlight-matches.tsx";
import { useArcMessages } from "./messages.ts";
import { PersonAvatar } from "./person-avatar.tsx";
import { type RemoteSearchFn, type RemoteState, remoteSearch } from "./remote-search.ts";

/** One thing a picker offers: a person, a project, a check. */
export interface EntityOption {
  id: string;
  label: string;
  /** A line under the label: an email, a path. */
  description?: string;
  /** A photo; left out, the avatar is the label's initials. */
  src?: string;
  isDisabled?: boolean;
}

type Marker = EntityOption & { marker: "create" | "more" };

const rowInset = arc({ paddingInline: space.x2 });

export const entityPickerStyles = variants({
  slots: {
    root: arc({}),
    label: arc({}),
    description: arc({}),
    error: arc({}),
    chips: arc({}),
    chip: arc(layout.inlineRow, gap[1]),
    input: arc({}),
    content: arc({}),
    list: arc({}),
    option: arc(gap[2]),
    text: arc(layout.column, layout.minZero),
    optionDescription: arc(type.meta, layout.clip, layout.nowrap),
    create: arc(gap[2], glyph.sm),
    more: arc(fg.muted),
    status: arc(layout.row, gap[2], type.meta, rowInset),
    limit: arc(type.meta, rowInset),
  },
});

type Slots = ReturnType<typeof entityPickerStyles>;

interface Common extends Customisable<Slots> {
  label: string;
  description?: Child;
  errorMessage?: string;
  placeholder?: string;
  /**
   * Asked as the reader types, once the typing pauses: the options for the
   * text, or a page of them with a `next` cursor that adds Show more.
   */
  search: RemoteSearchFn<EntityOption>;
  /** @default 250 */
  debounce?: number;
  /** Fewer characters than this search nothing; 0 asks for suggestions on opening. @default 0 */
  minLength?: number;
  /** Adds Create "…" for text no option has: the new option, now or once made. */
  onCreate?: (text: string) => EntityOption | Promise<EntityOption>;
  /** An avatar before each option and chip. @default true */
  avatars?: boolean;
  isDisabled?: boolean;
  isRequired?: boolean;
  /** Submits each chosen id under this name in a plain form. */
  name?: string;
  id?: string;
}

export interface SingleEntityPickerProps extends Common {
  multiple?: false;
  value?: EntityOption | null;
  defaultValue?: EntityOption | null;
  onChange?: (value: EntityOption | null) => void;
}

export interface MultipleEntityPickerProps extends Common {
  multiple: true;
  value?: readonly EntityOption[];
  defaultValue?: readonly EntityOption[];
  onChange?: (value: readonly EntityOption[]) => void;
  /** No more than this many can be chosen; the rest are held back with the reason. */
  max?: number;
}

export type EntityPickerProps = SingleEntityPickerProps | MultipleEntityPickerProps;

const isMarker = (option: EntityOption): option is Marker => "marker" in option;

/**
 * A choice of one or several things a server finds as the reader types:
 * people, projects, records.
 *
 * ```tsx
 * <EntityPicker
 *   multiple
 *   label="Assignees"
 *   max={5}
 *   search={(query, { signal }) => api.people.search(query, { signal })}
 *   onCreate={(name) => api.people.invite(name)}
 *   onChange={setAssignees}
 * />
 * ```
 *
 * ui's combobox, its list kept as the server answers rather than filtered
 * again: each option with its avatar and the words that matched marked, the
 * chosen ones kept at the top until a search is typed, several as chips the
 * Backspace key takes off. The search is debounced and aborts the request it
 * replaces; a `next` cursor adds Show more, `onCreate` adds Create "…", and a
 * `max` holds the rest back with the reason.
 */
export function EntityPicker(props: EntityPickerProps) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(entityPickerStyles(), props.classes);
  const anchor = useComboboxAnchor();
  const inputId = props.id ?? createUniqueId();
  const describedBy = createUniqueId();
  const multiple = (): boolean => props.multiple === true;

  const initial = (): EntityOption[] => {
    const given = props.defaultValue;
    if (given === undefined || given === null) return [];
    return Array.isArray(given) ? [...(given as readonly EntityOption[])] : [given as EntityOption];
  };
  const [own, setOwn] = createSignal<readonly EntityOption[]>(initial(), { ownedWrite: true });
  const [text, setText] = createSignal("");
  const [found, setFound] = createSignal<RemoteState<EntityOption>>({
    status: "idle",
    results: [],
    loadingMore: false,
  });
  const [creating, setCreating] = createSignal(false);

  const chosen = (): readonly EntityOption[] => {
    const given = props.value;
    if (given === undefined) return own();
    if (given === null) return [];
    return Array.isArray(given) ? (given as readonly EntityOption[]) : [given as EntityOption];
  };
  const max = (): number =>
    props.multiple === true ? (props.max ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
  const full = (): boolean => multiple() && chosen().length >= max();

  const remote = remoteSearch<EntityOption>({
    search: () => props.search,
    debounce: props.debounce,
    minLength: props.minLength,
    onChange: setFound,
  });
  onCleanup(remote.stop);

  const commit = (next: readonly EntityOption[]): void => {
    if (props.value === undefined) setOwn(next);
    if (props.multiple === true) props.onChange?.(next);
    else props.onChange?.(next[0] ?? null);
  };

  const options = (): EntityOption[] => {
    const results = found().results;
    const typed = text().trim();
    const picked = chosen();
    const kept =
      typed === "" || !multiple()
        ? picked.filter((one) => !results.some((result) => result.id === one.id))
        : [];
    const list: EntityOption[] = [...kept, ...results];
    if (found().next !== undefined && !found().loadingMore) {
      list.push({ id: "\u0000more", label: messages().showMoreResults, marker: "more" } as Marker);
    }
    const exact = list.some((one) => one.label.toLocaleLowerCase() === typed.toLocaleLowerCase());
    if (props.onCreate !== undefined && typed !== "" && !exact && found().status !== "loading") {
      list.push({ id: "\u0000create", label: typed, marker: "create" } as Marker);
    }
    return list;
  };

  const create = (typed: string): void => {
    const made = props.onCreate?.(typed);
    if (made === undefined) return;
    const add = (option: EntityOption): void => {
      setCreating(false);
      commit(multiple() ? [...chosen(), option] : [option]);
    };
    if (made instanceof Promise) {
      setCreating(true);
      made.then(add, () => setCreating(false));
    } else {
      add(made);
    }
  };

  // Choosing an option empties a multiple picker's text, which is right for a
  // value and wrong for Show more: the next page is for the same search.
  let keepText = false;

  const onValueChange = (value: EntityOption | readonly EntityOption[] | null): void => {
    const list = value === null ? [] : Array.isArray(value) ? [...value] : [value as EntityOption];
    const marker = list.find(isMarker);
    if (marker?.marker === "more") {
      keepText = true;
      remote.more();
      return;
    }
    if (marker?.marker === "create") {
      create(marker.label);
      return;
    }
    if (multiple() && list.length > max()) return;
    commit(list);
  };

  const label = (option: EntityOption): Child =>
    isMarker(option) ? option.label : <HighlightMatches text={option.label} query={text()} />;

  const avatar = (option: EntityOption) => (
    <Show when={props.avatars !== false}>
      <PersonAvatar person={{ name: option.label, src: option.src }} size="sm" />
    </Show>
  );

  const list = () => (
    <ComboboxContent class={cls().content} data-slot="entity-picker-content" anchor={anchor}>
      <Show when={found().status === "loading" || found().loadingMore || creating()}>
        <div class={cls().status} role="status" data-slot="entity-picker-loading">
          <Spinner />
          {messages().searching}
        </div>
      </Show>
      <Show when={found().status === "error"}>
        <div class={cls().status} role="alert" data-slot="entity-picker-error">
          {messages().searchFailedPlain}
        </div>
      </Show>
      <Show when={found().status === "done" && options().length === 0}>
        <div class={cls().status} data-slot="entity-picker-empty">
          {messages().noMatches}
        </div>
      </Show>
      <Show when={full()}>
        <div class={cls().limit} data-slot="entity-picker-limit">
          {messages().tooManyTags(max())}
        </div>
      </Show>
      <ComboboxList class={cls().list} data-slot="entity-picker-list">
        {(option: EntityOption) => (
          <ComboboxItem
            value={option}
            textValue={option.label}
            disabled={
              option.isDisabled === true ||
              (full() && !isMarker(option) && !chosen().some((one) => one.id === option.id))
            }
            class={
              isMarker(option)
                ? option.marker === "create"
                  ? cls().create
                  : cls().more
                : cls().option
            }
            data-slot={isMarker(option) ? `entity-picker-${option.marker}` : "entity-picker-option"}
          >
            <Show
              when={!isMarker(option)}
              fallback={
                <Show when={(option as Marker).marker === "create"} fallback={option.label}>
                  <Plus aria-hidden="true" />
                  {messages().createOption(option.label)}
                </Show>
              }
            >
              {avatar(option)}
              <span class={cls().text}>
                <span>{label(option)}</span>
                <Show when={option.description !== undefined}>
                  <span class={cls().optionDescription}>{option.description}</span>
                </Show>
              </span>
            </Show>
          </ComboboxItem>
        )}
      </ComboboxList>
    </ComboboxContent>
  );

  return (
    <Field
      class={arc(cls().root, props.class, props.className)}
      data-slot="entity-picker"
      isInvalid={props.errorMessage !== undefined}
      isDisabled={props.isDisabled}
    >
      <FieldLabel class={cls().label} for={inputId}>
        {props.label}
      </FieldLabel>
      <Combobox
        multiple={multiple()}
        items={options()}
        value={multiple() ? chosen() : (chosen()[0] ?? null)}
        onValueChange={onValueChange}
        inputValue={multiple() ? text() : undefined}
        onInputValueChange={(next: string) => {
          if (keepText) {
            keepText = false;
            return;
          }
          setText(next);
          remote.query(next);
        }}
        onOpenChange={(open: boolean) => {
          if (open && found().status === "idle") remote.query(text());
        }}
        itemToStringValue={(option: EntityOption) => option.id}
        itemToStringLabel={(option: EntityOption) => option.label}
        filter={null}
        disabled={props.isDisabled}
        name={props.name}
      >
        <Show
          when={multiple()}
          fallback={
            <>
              <ComboboxInput
                id={inputId}
                class={cls().input}
                data-slot="entity-picker-input"
                placeholder={props.placeholder}
                required={props.isRequired}
                aria-describedby={describedBy}
                aria-invalid={props.errorMessage !== undefined}
                triggerLabel={messages().showSuggestions}
              />
              {list()}
            </>
          }
        >
          <ComboboxChips
            ref={anchor}
            class={cls().chips}
            data-slot="entity-picker-chips"
            aria-label={messages().chosenItems(props.label)}
          >
            <ComboboxValue>
              {(values: EntityOption[]) => (
                <>
                  <For each={values}>
                    {(value: EntityOption) => (
                      <ComboboxChip
                        class={cls().chip}
                        data-slot="entity-picker-chip"
                        removeLabel={messages().remove}
                      >
                        {avatar(value)}
                        {value.label}
                      </ComboboxChip>
                    )}
                  </For>
                  <ComboboxChipsInput
                    id={inputId}
                    class={cls().input}
                    data-slot="entity-picker-input"
                    placeholder={chosen().length === 0 ? props.placeholder : undefined}
                    aria-describedby={describedBy}
                    aria-invalid={props.errorMessage !== undefined}
                  />
                </>
              )}
            </ComboboxValue>
          </ComboboxChips>
          {list()}
        </Show>
      </Combobox>
      <span id={describedBy} class={srOnly}>
        {full() ? messages().tooManyTags(max()) : ""}
      </span>
      <Show when={props.description !== undefined}>
        <FieldDescription class={cls().description}>{props.description}</FieldDescription>
      </Show>
      <Show when={props.errorMessage !== undefined}>
        <FieldError class={cls().error}>{props.errorMessage}</FieldError>
      </Show>
    </Field>
  );
}
