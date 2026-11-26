import {
  type Child,
  Match,
  Show,
  Switch,
  createSignal,
  createUniqueId,
  untrack,
} from "@barqjs/core";
import { variants } from "@barqjs/css";
import { type CalendarDate, parseDate } from "@barqjs/aria/date";
import { dateFormatter } from "@barqjs/aria/i18n";
import { CalendarDays } from "@barqjs/lucide/icons/calendar-days";
import { Button } from "@barqjs/ui/button";
import { Calendar } from "@barqjs/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@barqjs/ui/popover";
import { Spinner } from "@barqjs/ui/spinner";
import { srOnly } from "@barqjs/ui/sr-only";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  control,
  fg,
  gap,
  layout,
  rounded,
  space,
  square,
  tone as tones,
  type,
} from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import { DescriptionList, type DescriptionItem } from "./description-list.tsx";
import { type EntityOption, EntityPicker } from "./entity-picker.tsx";
import { InlineEdit, type InlineOption, InlineSelect } from "./inline-edit.tsx";
import { useArcMessages } from "./messages.ts";
import type { RemoteSearchFn } from "./remote-search.ts";
import { serverMessage } from "./server-message.ts";

/** One choice of a `choice` property: a status, a priority. */
export interface PropertyOption {
  value: string;
  label: string;
  /** Before the label. Left out with a `tone`, a dot in that tone. */
  icon?: Child;
  tone?: Tone;
  isDisabled?: boolean;
}

interface PropertyBase {
  /** The key its value is read from and saved under. */
  id: string;
  label: string;
  isDisabled?: boolean;
  /** Beside the value, at the end: a copy button, a link. */
  action?: Child;
}

/** Text edited in place. Its value is a string. */
export interface TextProperty extends PropertyBase {
  kind: "text";
  multiline?: boolean;
  placeholder?: string;
  maxLength?: number;
  validate?: (value: string) => string | undefined;
}

/** One of a few options: a status, a priority, a plan. Its value is the option's `value`, or `null`. */
export interface ChoiceProperty extends PropertyBase {
  kind: "choice";
  options: readonly PropertyOption[];
  /** An option that saves `null`: "No priority". */
  noneLabel?: string;
}

/** People found by a search: assignees, reviewers. Its value is a list of `EntityOption`. */
export interface PeopleProperty extends PropertyBase {
  kind: "people";
  search: RemoteSearchFn<EntityOption>;
  max?: number;
  placeholder?: string;
}

/** A calendar day. Its value is an ISO date, `2026-03-04`, or `null`. */
export interface DateProperty extends PropertyBase {
  kind: "date";
  /** Adds a Clear that saves `null`. */
  clearable?: boolean;
  minValue?: string;
  maxValue?: string;
}

/** A value shown as it is, not edited here: an id, a creation date. */
export interface ValueProperty extends PropertyBase {
  kind: "value";
  /** How it is written. @default the value as text */
  format?: (value: unknown) => Child;
}

/** One row of a `PropertyList`: what the value is, and how it is edited. */
export type PropertyField =
  | TextProperty
  | ChoiceProperty
  | PeopleProperty
  | DateProperty
  | ValueProperty;

export const propertyListStyles = variants({
  slots: {
    root: arc({}),
    value: arc(layout.minZero),
    dot: arc(rounded.full, bg.toneSolid, layout.noShrink, square.x2),
    date: arc(control.quiet, layout.row, gap[2], { justifyContent: "flex-start" }),
    placeholder: arc(fg.muted),
    calendar: arc({ padding: space.x2 }),
    clear: arc({ marginBlockStart: space.x2, width: "100%" }),
    spinner: arc(layout.noShrink, fg.muted),
    error: arc(type.meta, fg.danger),
  },
});

type Slots = ReturnType<typeof propertyListStyles>;

export interface PropertyListProps extends Customisable<Slots> {
  fields: readonly PropertyField[];
  /** Each field's value, by its `id`. */
  values: Readonly<Record<string, unknown>>;
  /**
   * Saves one field. A promise holds that field pending; a rejection keeps
   * the edit open, or puts the value back, with the reason.
   */
  onSave: (id: string, value: unknown) => void | Promise<unknown>;
  /** Every field read-only. */
  isDisabled?: boolean;
  /** As `DescriptionList`'s. @default "auto" */
  layout?: "auto" | "inline" | "stacked";
  /** A rule under each row. @default false */
  divided?: boolean;
  "aria-label"?: string;
  id?: string;
}

/**
 * A record's properties, each edited where it is read: a task's status,
 * priority, assignees and due date; a page block's settings.
 *
 * ```tsx
 * <PropertyList
 *   fields={[
 *     { id: "status", label: "Status", kind: "choice", options: STATUSES },
 *     { id: "assignees", label: "Assignees", kind: "people", search: findPeople },
 *     { id: "due", label: "Due", kind: "date", clearable: true },
 *     { id: "summary", label: "Summary", kind: "text", multiline: true },
 *   ]}
 *   values={task()}
 *   onSave={(id, value) => api.tasks.update(task().id, { [id]: value })}
 * />
 * ```
 *
 * A `DescriptionList` whose values are editors, drawn from the fields'
 * schema: text through `InlineEdit`, a choice through `InlineSelect` with
 * each option's icon or a dot in its tone, people through `EntityPicker`,
 * and a day through a calendar in a popover. Each saves on its own, holds
 * while the save is out, and says why one failed.
 */
export function PropertyList(props: PropertyListProps) {
  function cls(): Slots {
    return parts(propertyListStyles(), props.classes);
  }
  function items(): DescriptionItem[] {
    return props.fields.map((field) => ({
      id: field.id,
      term: field.label,
      details: <PropertyValue field={field} list={props} classes={cls()} />,
      action: field.action,
    }));
  }
  return (
    <DescriptionList
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      aria-label={props["aria-label"]}
      layout={props.layout}
      divided={props.divided === true}
      items={items()}
    />
  );
}

interface PropertyValueProps {
  field: PropertyField;
  list: PropertyListProps;
  classes: Slots;
}

function PropertyValue(props: PropertyValueProps) {
  function value(): unknown {
    return props.list.values[props.field.id];
  }
  function disabled(): boolean {
    return props.list.isDisabled === true || props.field.isDisabled === true;
  }
  function save(next: unknown): void | Promise<unknown> {
    return untrack(() => props.list.onSave)(props.field.id, next);
  }
  return (
    <div class={props.classes.value} data-slot="property-list-value" data-kind={props.field.kind}>
      <Switch>
        <Match when={props.field.kind === "text" ? props.field : undefined}>
          {(field: () => TextProperty) => (
            <InlineEdit
              label={field().label}
              value={typeof value() === "string" ? (value() as string) : ""}
              multiline={field().multiline}
              placeholder={field().placeholder}
              maxLength={field().maxLength}
              validate={field().validate}
              isDisabled={disabled()}
              onSave={save}
            />
          )}
        </Match>
        <Match when={props.field.kind === "choice" ? props.field : undefined}>
          {(field: () => ChoiceProperty) => (
            <InlineSelect
              label={field().label}
              value={typeof value() === "string" ? (value() as string) : null}
              options={field().options.map((option) => choice(option, props.classes))}
              noneLabel={field().noneLabel}
              isDisabled={disabled()}
              onSave={save}
            />
          )}
        </Match>
        <Match when={props.field.kind === "people" ? props.field : undefined}>
          {(field: () => PeopleProperty) => (
            <PeopleValue
              field={field()}
              value={Array.isArray(value()) ? (value() as EntityOption[]) : []}
              isDisabled={disabled()}
              save={save}
              classes={props.classes}
            />
          )}
        </Match>
        <Match when={props.field.kind === "date" ? props.field : undefined}>
          {(field: () => DateProperty) => (
            <DateValue
              field={field()}
              value={typeof value() === "string" ? (value() as string) : null}
              isDisabled={disabled()}
              save={save}
              classes={props.classes}
            />
          )}
        </Match>
        <Match when={props.field.kind === "value" ? props.field : undefined}>
          {(field: () => ValueProperty) =>
            field().format === undefined ? written(value()) : field().format?.(value())
          }
        </Match>
      </Switch>
    </div>
  );
}

function written(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "";
}

function choice(option: PropertyOption, classes: Slots): InlineOption {
  return {
    value: option.value,
    label: option.label,
    isDisabled: option.isDisabled,
    icon:
      option.icon ??
      (option.tone === undefined ? undefined : (
        <span class={arc(classes.dot, tones[option.tone])} data-slot="property-list-dot" />
      )),
  };
}

/** A save that holds while it is out and keeps the reason it failed. */
function saving(run: (next: unknown) => void | Promise<unknown>) {
  const messages = useArcMessages();
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal<string | undefined>(undefined);
  async function save(next: unknown): Promise<void> {
    setError(undefined);
    setPending(true);
    try {
      await run(next);
    } catch (thrown: unknown) {
      setError(serverMessage(thrown, untrack(messages).couldNotSave));
    }
    setPending(false);
  }
  return { pending, error, save };
}

interface EditorProps<V, F> {
  field: F;
  value: V;
  isDisabled: boolean;
  save: (next: unknown) => void | Promise<unknown>;
  classes: Slots;
}

function PeopleValue(props: EditorProps<readonly EntityOption[], PeopleProperty>) {
  const state = saving((next) => props.save(next));
  return (
    <>
      <EntityPicker
        multiple
        label={props.field.label}
        classes={{ label: srOnly }}
        value={props.value}
        max={props.field.max}
        placeholder={props.field.placeholder}
        search={props.field.search}
        isDisabled={props.isDisabled || state.pending()}
        errorMessage={state.error()}
        onChange={(people: readonly EntityOption[]) => void state.save([...people])}
      />
      <Show when={state.pending()}>
        <PendingNote classes={props.classes} />
      </Show>
    </>
  );
}

interface PendingNoteProps {
  classes: Slots;
}

function PendingNote(props: PendingNoteProps) {
  const messages = useArcMessages();
  return <Spinner class={props.classes.spinner} label={messages().saving} />;
}

function DateValue(props: EditorProps<string | null, DateProperty>) {
  const messages = useArcMessages();
  const errorId = createUniqueId();
  const [open, setOpen] = createSignal(false);
  const state = saving((next) => props.save(next));
  const format = dateFormatter({ dateStyle: "medium", timeZone: "UTC" });
  function day(iso: string | null | undefined): CalendarDate | null {
    if (iso === null || iso === undefined || iso === "") return null;
    try {
      return parseDate(iso);
    } catch {
      return null;
    }
  }
  function text(): string | undefined {
    const date = day(props.value);
    return date === null ? undefined : format().format(date.toDate("UTC"));
  }
  function pick(date: CalendarDate | null): void {
    setOpen(false);
    const next = date === null ? null : date.toString();
    if (next === untrack(() => props.value)) return;
    void state.save(next);
  }
  return (
    <>
      <Popover isOpen={open()} onOpenChange={setOpen}>
        <PopoverTrigger>
          <Button
            class={props.classes.date}
            data-slot="property-list-date"
            variant="ghost"
            size="sm"
            isDisabled={props.isDisabled || state.pending()}
            aria-label={`${props.field.label}: ${text() ?? messages().notSet}`}
            aria-busy={state.pending() ? true : undefined}
            aria-describedby={state.error() !== undefined ? errorId : undefined}
          >
            <CalendarDays aria-hidden="true" />
            <Show
              when={text() !== undefined}
              fallback={<span class={props.classes.placeholder}>{messages().notSet}</span>}
            >
              {text()}
            </Show>
            <Show when={state.pending()}>
              <Spinner class={props.classes.spinner} label={messages().saving} />
            </Show>
          </Button>
        </PopoverTrigger>
        <PopoverContent placement="bottom start" data-slot="property-list-calendar">
          <div class={props.classes.calendar}>
            <Calendar
              aria-label={props.field.label}
              value={day(props.value)}
              minValue={day(props.field.minValue)}
              maxValue={day(props.field.maxValue)}
              autoFocus
              onChange={pick}
            />
            <Show when={props.field.clearable === true && props.value !== null}>
              <Button
                class={props.classes.clear}
                data-slot="property-list-clear"
                variant="outline"
                size="sm"
                onPress={() => pick(null)}
              >
                {messages().clearDate}
              </Button>
            </Show>
          </div>
        </PopoverContent>
      </Popover>
      <Show when={state.error() !== undefined}>
        <p class={props.classes.error} id={errorId} role="alert" data-slot="property-list-error">
          {state.error()}
        </p>
      </Show>
    </>
  );
}
