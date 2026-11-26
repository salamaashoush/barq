import { type Child, For, Show, createSignal, createUniqueId, flush, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Input } from "@barqjs/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@barqjs/ui/select";
import { Spinner } from "@barqjs/ui/spinner";
import { Textarea } from "@barqjs/ui/textarea";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { textDirection } from "../lib/text-direction.ts";
import { control, fg, gap, layout, type } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";
import { serverMessage } from "./server-message.ts";

export const inlineEditStyles = variants({
  slots: {
    root: arc(layout.column, gap[1], layout.minZero),
    display: arc(control.quiet, type.written),
    placeholder: arc(fg.muted),
    editor: arc(layout.row, gap[2]),
    input: arc(layout.grow),
    spinner: arc(layout.noShrink, fg.muted),
    error: arc(type.meta, fg.danger),
  },
});

type InlineEditSlots = ReturnType<typeof inlineEditStyles>;

export interface InlineEditProps extends Customisable<InlineEditSlots> {
  /** Names the value: the label of the row it sits in. */
  label: string;
  value: string;
  /** Saves an edit. A promise holds the field pending; a rejection keeps it open with the reason. */
  onSave: (value: string) => void | Promise<unknown>;
  /** Several lines: Enter breaks a line, and Ctrl or Cmd with Enter saves. @default false */
  multiline?: boolean;
  /** Shown while it is empty. @default the provider's `notSet`, "Not set" */
  placeholder?: string;
  /** Why an edit cannot be saved, or nothing when it can. */
  validate?: (value: string) => string | undefined;
  maxLength?: number;
  isDisabled?: boolean;
}

/**
 * A value edited where it is read: a title, a description, a name.
 *
 * ```tsx
 * <InlineEdit label="Title" value={title()} onSave={(next) => rename(next)} />
 * ```
 *
 * It reads as its text until it is pressed, when it becomes a field holding
 * the text. Enter saves and Escape puts the text back; leaving the field
 * saves too. While a returned promise is out the field is read-only with a
 * spinner, and when it rejects the field stays open with the server's
 * reason, so nothing typed is lost.
 */
export function InlineEdit(props: InlineEditProps) {
  const messages = useArcMessages();
  const errorId = createUniqueId();
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal<string | undefined>(undefined);
  let field: HTMLInputElement | HTMLTextAreaElement | undefined;
  let display: HTMLButtonElement | undefined;
  let settled = false;

  function cls(): InlineEditSlots {
    return parts(inlineEditStyles(), props.classes);
  }

  function open(): void {
    if (props.isDisabled === true) return;
    settled = false;
    setDraft(untrack(() => props.value));
    setError(undefined);
    setEditing(true);
    flush();
    field?.focus();
    field?.select();
  }

  function close(refocus: boolean): void {
    settled = true;
    setEditing(false);
    setError(undefined);
    flush();
    if (refocus) display?.focus();
  }

  async function save(refocus: boolean): Promise<void> {
    if (settled || untrack(pending)) return;
    const next = untrack(draft);
    if (next === untrack(() => props.value)) {
      close(refocus);
      return;
    }
    const refused = untrack(() => props.validate)?.(next);
    if (refused !== undefined) {
      setError(refused);
      return;
    }
    settled = true;
    setPending(true);
    try {
      await untrack(() => props.onSave)(next);
      setPending(false);
      close(refocus);
    } catch (thrown: unknown) {
      settled = false;
      setPending(false);
      setError(serverMessage(thrown, untrack(messages).couldNotSave));
      flush();
      field?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key !== "Enter") return;
    const saves = props.multiline === true ? event.metaKey || event.ctrlKey : !event.shiftKey;
    if (!saves) return;
    event.preventDefault();
    void save(true);
  }

  function shared() {
    return {
      class: cls().input,
      value: draft(),
      "aria-label": props.label,
      "aria-invalid": error() !== undefined ? true : undefined,
      "aria-describedby": error() !== undefined ? errorId : undefined,
      "aria-busy": pending() ? true : undefined,
      readOnly: pending(),
      maxLength: props.maxLength,
      dir: textDirection(draft()) ?? undefined,
      onKeyDown,
      onBlur: () => void save(false),
    };
  }

  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      data-slot="inline-edit"
      data-editing={editing() ? "" : undefined}
    >
      <Show
        when={editing()}
        fallback={
          <button
            type="button"
            class={cls().display}
            data-slot="inline-edit-display"
            disabled={props.isDisabled}
            dir={textDirection(props.value) ?? undefined}
            aria-label={`${props.label}: ${props.value === "" ? (props.placeholder ?? messages().notSet) : props.value}`}
            ref={(element: HTMLButtonElement) => (display = element)}
            onClick={open}
          >
            <Show
              when={props.value !== ""}
              fallback={
                <span class={cls().placeholder} data-slot="inline-edit-placeholder">
                  {props.placeholder ?? messages().notSet}
                </span>
              }
            >
              {props.value}
            </Show>
          </button>
        }
      >
        <div class={cls().editor} data-slot="inline-edit-editor">
          <Show
            when={props.multiline === true}
            fallback={
              <Input
                {...shared()}
                data-slot="inline-edit-input"
                ref={(element: HTMLInputElement) => {
                  field = element;
                }}
                onInput={(event: Event) =>
                  setDraft((event.currentTarget as HTMLInputElement).value)
                }
              />
            }
          >
            <Textarea
              {...shared()}
              data-slot="inline-edit-input"
              ref={(element: HTMLTextAreaElement) => {
                field = element;
              }}
              onInput={(event: Event) =>
                setDraft((event.currentTarget as HTMLTextAreaElement).value)
              }
            />
          </Show>
          <Show when={pending()}>
            <Spinner class={cls().spinner} label={messages().saving} />
          </Show>
        </div>
        <Show when={error() !== undefined}>
          <p class={cls().error} id={errorId} data-slot="inline-edit-error" role="alert">
            {error()}
          </p>
        </Show>
      </Show>
    </div>
  );
}

/** One choice of an `InlineSelect`. */
export interface InlineOption {
  value: string;
  label: string;
  /** Before the label: a status dot, an avatar. The label carries the meaning. */
  icon?: Child;
  isDisabled?: boolean;
}

/** The key of the "none" option, which saves `null`. */
const NONE = "__arc-none";

export const inlineSelectStyles = variants({
  slots: {
    root: arc(layout.column, gap[1], layout.minZero),
    trigger: arc(control.quiet, layout.row, gap[2], {
      boxShadow: "none",
      justifyContent: "space-between",
      "[data-disabled]": { opacity: "1" },
    }),
    item: arc(layout.row, gap[2]),
    icon: arc(layout.inlineCentre, layout.noShrink),
    spinner: arc(layout.noShrink, fg.muted),
    error: arc(type.meta, fg.danger),
  },
});

type InlineSelectSlots = ReturnType<typeof inlineSelectStyles>;

export interface InlineSelectProps extends Customisable<InlineSelectSlots> {
  /** Names the select: the label of the row it sits in. */
  label: string;
  value: string | null;
  options: readonly InlineOption[];
  /** Saves a choice. A promise holds it pending; a rejection puts the value back with the reason. */
  onSave: (value: string | null) => void | Promise<unknown>;
  /** An option that saves `null`: "Nobody", "No due date". Shown for `null` too. */
  noneLabel?: string;
  /** What a held value no longer among the options reads as. @default the value itself */
  unknownLabel?: (value: string) => string;
  isDisabled?: boolean;
}

/**
 * A choice edited where it is read: an assignee, a severity, a plan.
 *
 * ```tsx
 * <InlineSelect label="Assignee" value={owner()} options={PEOPLE} noneLabel="Nobody" onSave={assign} />
 * ```
 *
 * It reads as its value until hovered or opened, and saves as soon as it
 * changes, showing the new choice with a spinner while the promise is out.
 * A value that left the options stays one, so the row never reads blank.
 */
export function InlineSelect(props: InlineSelectProps) {
  const messages = useArcMessages();
  const errorId = createUniqueId();
  const [pendingValue, setPendingValue] = createSignal<string | null | undefined>(undefined);
  const [error, setError] = createSignal<string | undefined>(undefined);

  function cls(): InlineSelectSlots {
    return parts(inlineSelectStyles(), props.classes);
  }
  function shown(): string | null {
    const pending = pendingValue();
    return pending === undefined ? props.value : pending;
  }
  function options(): readonly InlineOption[] {
    const held = props.value;
    const known = props.options;
    const extra: InlineOption[] = [];
    if (props.noneLabel !== undefined) extra.push({ value: NONE, label: props.noneLabel });
    if (held !== null && !known.some((option) => option.value === held)) {
      extra.push({ value: held, label: props.unknownLabel?.(held) ?? held });
    }
    return [...extra, ...known];
  }

  async function choose(key: string): Promise<void> {
    const next = key === NONE ? null : key;
    if (next === untrack(() => props.value)) return;
    setError(undefined);
    setPendingValue(next);
    try {
      await untrack(() => props.onSave)(next);
    } catch (thrown: unknown) {
      setError(serverMessage(thrown, untrack(messages).couldNotSave));
    }
    setPendingValue(undefined);
  }

  return (
    <div class={arc(cls().root, props.class, props.className)} data-slot="inline-select">
      <Select
        value={shown() ?? (props.noneLabel === undefined ? undefined : NONE)}
        isDisabled={props.isDisabled === true || pendingValue() !== undefined}
        onValueChange={(key: string) => void choose(key)}
      >
        <SelectTrigger
          size="sm"
          class={cls().trigger}
          data-slot="inline-select-trigger"
          aria-label={props.label}
          aria-busy={pendingValue() !== undefined ? true : undefined}
          aria-describedby={error() !== undefined ? errorId : undefined}
        >
          <SelectValue placeholder={messages().notSet} />
          <Show when={pendingValue() !== undefined}>
            <Spinner class={cls().spinner} label={messages().saving} />
          </Show>
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          <For each={options()}>
            {(option: InlineOption) => (
              <SelectItem
                value={option.value}
                isDisabled={option.isDisabled}
                textValue={option.label}
                class={cls().item}
              >
                <Show when={option.icon !== undefined}>
                  <span class={cls().icon} data-slot="inline-select-icon" aria-hidden="true">
                    {option.icon}
                  </span>
                </Show>
                {option.label}
              </SelectItem>
            )}
          </For>
        </SelectContent>
      </Select>
      <Show when={error() !== undefined}>
        <p class={cls().error} id={errorId} data-slot="inline-select-error" role="alert">
          {error()}
        </p>
      </Show>
    </div>
  );
}
