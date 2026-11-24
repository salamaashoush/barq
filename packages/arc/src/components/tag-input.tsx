import { For, createMemo, createSignal, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { announce } from "@barqjs/aria/live";
import { when } from "@barqjs/ui/shared-when";

import { arcLayer as arc } from "../layer.ts";
import {
  type ArcFieldProps,
  type FieldValueProps,
  Frame,
  bindField,
  withOwnErrors,
} from "../lib/field.tsx";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  control,
  edge,
  focus,
  gap,
  interaction,
  layout,
  rounded,
  space,
  target,
  type,
} from "../style/index.ts";
import type { ChipVariant } from "./chip.tsx";
import { useArcMessages } from "./messages.ts";
import { TagGroup, type TagGroupSlots } from "./tag-group.tsx";

export const tagInputStyles = variants({
  slots: {
    control: arc(
      layout.row,
      layout.wrap,
      layout.fill,
      gap[1],
      edge.input,
      rounded.md,
      bg.transparent,
      focus.within,
      interaction.invalid,
      when.disabledCursor,
      target.size,
      { minHeight: space.x9, padding: space.x1 },
    ),
    input: arc(control.bareInput, type.sm, { minWidth: "8ch", minHeight: space.x6 }),
  },
});

type OwnSlots = ReturnType<typeof tagInputStyles>;

export type TagInputSlots = OwnSlots &
  Pick<TagGroupSlots, "list" | "tag" | "cell" | "remove"> & {
    root: string;
    label: string;
    description: string;
    error: string;
  };

export interface TagInputProps
  extends
    Omit<ArcFieldProps, "classes">,
    FieldValueProps<readonly string[]>,
    Customisable<TagInputSlots> {
  placeholder?: string;
  /**
   * Why a tag cannot be added, or nothing when it can. Runs after the
   * built-in checks for an empty tag, a repeat and `maxTags`.
   */
  validate?: (tag: string, tags: readonly string[]) => string | undefined;
  /** What a typed tag becomes before it is checked: lower-cased, a `#` taken off. @default trimmed */
  normalize?: (text: string) => string;
  /** Characters that end a tag as they are typed, beside Enter. @default [","] */
  separators?: readonly string[];
  /** The most tags it holds. */
  maxTags?: number;
  /** Two tags differing only in case are the same tag. @default true */
  caseInsensitive?: boolean;
  /** Add what is typed when the field loses focus. @default false */
  addOnBlur?: boolean;
  /** @default "outline" */
  variant?: ChipVariant;
}

/** A pasted list split into its entries. */
function splitList(text: string, separators: readonly string[]): string[] {
  const marks = [...new Set([...separators, "\n", "\r", "\t", ";"])].map((mark) =>
    mark.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  return text.split(new RegExp(marks.join("|"))).filter((part) => part.trim() !== "");
}

/**
 * Tags typed one at a time: a word, then Enter or a comma, and it becomes a
 * removable tag. A pasted list becomes a tag per entry.
 *
 * ```tsx
 * <TagInput
 *   label="Hosts"
 *   value={hosts()}
 *   onChange={setHosts}
 *   validate={(host) => (isHost(host) ? undefined : `${host} is not a host name`)}
 * />
 * ```
 *
 * In `form.AppField` it is `field.TagInput` and holds the form's value. A
 * tag that cannot be added stays in the input with the reason under it, so
 * nothing typed is lost; Backspace in an empty input moves to the last tag,
 * where a second Backspace removes it.
 */
export function TagInput(props: TagInputProps) {
  const messages = useArcMessages();
  const of = bindField<readonly string[]>(props, []);
  const [text, setText] = createSignal("");
  const [rejected, setRejected] = createSignal<string[]>([]);
  let input: HTMLInputElement | undefined;
  let group: HTMLElement | undefined;

  const tags = (): readonly string[] => of.value() ?? [];
  const items = createMemo(() => tags().map((tag) => ({ id: tag, label: tag })));
  const same = (one: string, other: string): boolean =>
    props.caseInsensitive === false ? one === other : one.toLowerCase() === other.toLowerCase();

  const wiring = withOwnErrors(of, rejected);
  const isInvalid = wiring.isInvalid;

  /** Adds what it can, returns what it could not with why. */
  const add = (entries: readonly string[]): string[] => {
    const held = [...untrack(tags)];
    const left: string[] = [];
    const reasons: string[] = [];
    for (const entry of entries) {
      const tag = (props.normalize ?? ((raw: string) => raw.trim()))(entry);
      const reason =
        tag === ""
          ? undefined
          : held.some((one) => same(one, tag))
            ? messages().duplicateTag(tag)
            : props.maxTags !== undefined && held.length >= props.maxTags
              ? messages().tooManyTags(props.maxTags)
              : props.validate?.(tag, held);
      if (tag === "") continue;
      if (reason === undefined) {
        held.push(tag);
        announce(messages().added(tag), "polite");
      } else {
        left.push(entry.trim());
        if (!reasons.includes(reason)) reasons.push(reason);
      }
    }
    if (held.length !== untrack(tags).length) of.change(held);
    setRejected(reasons);
    return left;
  };

  const commit = (): void => {
    const pending = untrack(text);
    if (pending.trim() === "") return;
    setText(add([pending]).join(", "));
  };

  const separators = (): readonly string[] => props.separators ?? [","];

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing) return;
    if (event.key === "Enter" || separators().includes(event.key)) {
      if (untrack(text).trim() === "") return;
      event.preventDefault();
      commit();
      return;
    }
    if (event.key === "Backspace" && untrack(text) === "" && untrack(tags).length > 0) {
      event.preventDefault();
      const rows = group?.querySelectorAll<HTMLElement>('[role="row"]');
      rows?.[rows.length - 1]?.focus();
    }
  };

  const onInput = (event: Event): void => {
    const value = (event.currentTarget as HTMLInputElement).value;
    const marks = separators();
    if (marks.some((mark) => value.includes(mark))) {
      const pieces = splitList(value, marks);
      const ended = marks.some((mark) => value.endsWith(mark));
      const last = ended ? "" : (pieces.pop() ?? "");
      setText([...add(pieces), last].filter((piece) => piece !== "").join(", "));
      return;
    }
    setText(value);
    if (untrack(rejected).length > 0) setRejected([]);
  };

  const onPaste = (event: ClipboardEvent): void => {
    const pasted = event.clipboardData?.getData("text") ?? "";
    const pieces = splitList(pasted, separators());
    if (pieces.length < 2) return;
    event.preventDefault();
    setText(add(pieces).join(", "));
  };

  const remove = (keys: Set<unknown>): void => {
    const next = untrack(tags).filter((tag) => !keys.has(tag));
    of.change(next);
    setRejected([]);
    if (next.length === 0) input?.focus();
  };

  const cls = (): TagInputSlots =>
    parts(
      {
        ...tagInputStyles(),
        root: "",
        list: arc({ display: "contents" }),
        tag: "",
        cell: "",
        remove: "",
        label: "",
        description: "",
        error: "",
      },
      props.classes,
    );

  return (
    <Frame
      of={wiring}
      field={{
        label: props.label,
        class: arc(cls().root, props.class, props.className),
        classes: { label: cls().label, description: cls().description, error: cls().error },
      }}
      label={props.label}
      description={props.description}
      slot="tag-input"
    >
      <div
        class={cls().control}
        data-slot="tag-input-control"
        data-invalid={isInvalid() ? "" : undefined}
        data-disabled={props.isDisabled === true ? "" : undefined}
        ref={(element: HTMLElement) => (group = element)}
        onPointerDown={(event: PointerEvent) => {
          if (event.target === event.currentTarget) {
            event.preventDefault();
            input?.focus();
          }
        }}
      >
        <TagGroup
          aria-labelledby={of.ids.label}
          items={items()}
          size="sm"
          variant={props.variant}
          onRemove={props.isDisabled === true ? undefined : remove}
          classes={{
            root: arc({ display: "contents" }),
            list: cls().list,
            tag: cls().tag,
            cell: cls().cell,
            remove: cls().remove,
          }}
        />
        <input
          class={cls().input}
          data-slot="tag-input-field"
          id={of.ids.control}
          type="text"
          value={text()}
          placeholder={props.placeholder}
          disabled={props.isDisabled}
          enterkeyhint="enter"
          autocomplete="off"
          aria-invalid={isInvalid() ? true : undefined}
          aria-required={props.isRequired === true ? true : undefined}
          aria-describedby={wiring.describedBy(props.description !== undefined)}
          ref={(element: HTMLInputElement) => (input = element)}
          onKeyDown={onKeyDown}
          onInput={onInput}
          onPaste={onPaste}
          onBlur={() => {
            if (props.addOnBlur === true) commit();
            of.blur();
          }}
        />
        <For each={of.name() === undefined ? [] : tags()}>
          {(tag: string) => <input type="hidden" name={of.name()} value={tag} />}
        </For>
      </div>
    </Frame>
  );
}
