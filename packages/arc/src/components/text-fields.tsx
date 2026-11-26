import {
  type Child,
  Show,
  createEffect,
  createSignal,
  createUniqueId,
  flush,
  onCleanup,
  untrack,
} from "@barqjs/core";
import { variants } from "@barqjs/css";
import { announce } from "@barqjs/aria/live";
import { debounce } from "@barqjs/primitives/scheduled";
import { Button } from "@barqjs/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@barqjs/ui/combobox";
import { Input } from "@barqjs/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@barqjs/ui/input-group";

import { arcLayer as arc } from "../layer.ts";
import {
  type ArcFieldProps,
  type FieldSlots,
  type FieldValueProps,
  Frame,
  bindField,
  fieldStyles,
  withOwnErrors,
} from "../lib/field.tsx";
import { type Customisable, parts } from "../lib/parts.ts";
import { textDirection } from "../lib/text-direction.ts";
import { fg, gap, layout, type } from "../style/index.ts";
import { type ArcMessages, useArcMessages } from "./messages.ts";
import { Sentence } from "./sentence.tsx";

/** A naming rule an identifier is typed to. */
export type IdentifierConvention = "upper-snake" | "snake" | "kebab" | "filename";

const REWRITES: Readonly<Record<IdentifierConvention, (text: string) => string>> = {
  "upper-snake": (text) => text.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
  snake: (text) => text.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
  kebab: (text) => text.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
  filename: (text) => text.replace(/[^A-Za-z0-9._-]/g, "-"),
};

/** `text` written to `convention`, a character for a character: `api key` is `API_KEY`. */
export function toIdentifier(text: string, convention: IdentifierConvention): string {
  return REWRITES[convention](text);
}

function ruleOf(convention: IdentifierConvention, messages: ArcMessages): string {
  switch (convention) {
    case "upper-snake":
      return messages.identifierUpperSnake;
    case "snake":
      return messages.identifierSnake;
    case "kebab":
      return messages.identifierKebab;
    default:
      return messages.identifierFilename;
  }
}

export const identifierFieldStyles = variants({
  slots: { input: arc(type.mono) },
});

type IdentifierSlots = ReturnType<typeof identifierFieldStyles> & FieldSlots;

export interface IdentifierFieldProps
  extends Omit<ArcFieldProps, "classes">, FieldValueProps<string>, Customisable<IdentifierSlots> {
  convention: IdentifierConvention;
  /** A rewrite of the app's own, in the convention's place. */
  rewrite?: (text: string) => string;
  /** The rule in words, after the description. @default the convention's */
  rule?: Child;
  placeholder?: string;
  maxLength?: number;
}

/**
 * A name typed to a convention: a variable as `UPPER_SNAKE`, an environment
 * as `kebab-case`, a file name with nothing a file system refuses.
 *
 * ```tsx
 * <IdentifierField label="Name" convention="upper-snake" />
 * ```
 *
 * Each character is rewritten as it is typed, the caret staying where it
 * was, and the rule is said under the field. The first rewrite in a visit is
 * announced with the rule, so a screen reader hears why the text changed.
 */
export function IdentifierField(props: IdentifierFieldProps) {
  const messages = useArcMessages();
  const of = bindField<string>(props, "");
  let told = false;
  function cls() {
    return parts({ ...fieldStyles(), ...identifierFieldStyles() }, props.classes);
  }
  function rewrite(text: string): string {
    return props.rewrite?.(text) ?? toIdentifier(text, props.convention);
  }
  function rule(): Child {
    return props.rule ?? ruleOf(props.convention, messages());
  }
  function onInput(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const typed = input.value;
    const next = rewrite(typed);
    const caret = input.selectionStart;
    of.change(next);
    if (next === typed) return;
    input.value = next;
    if (caret !== null && next.length === typed.length) input.setSelectionRange(caret, caret);
    if (!told) {
      told = true;
      const words = rule();
      if (typeof words === "string") announce(words, "polite");
    }
  }
  return (
    <Frame
      of={of}
      label={props.label}
      description={
        <>
          <Show when={props.description !== undefined}>{props.description} </Show>
          {rule()}
        </>
      }
      field={props}
      slot="identifier-field"
    >
      <Input
        class={arc(cls().input, cls().control)}
        data-slot="identifier-field-input"
        id={of.ids.control}
        name={of.name()}
        value={of.value() ?? ""}
        placeholder={props.placeholder}
        maxLength={props.maxLength}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        dir="ltr"
        disabled={props.isDisabled}
        required={props.isRequired}
        aria-invalid={of.isInvalid() ? true : undefined}
        aria-describedby={of.describedBy(true)}
        onInput={onInput}
        onFocus={() => (told = false)}
        onBlur={of.blur}
      />
    </Frame>
  );
}

/**
 * `text` as a slug: lower case, accents taken off, every run of anything
 * else one dash, none at either end. `Café Zürich!` is `cafe-zurich`.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `slug`, or the first of `slug-2`, `slug-3` … not in `taken`. */
export function freeSlug(slug: string, taken: readonly string[]): string {
  if (slug === "" || !taken.includes(slug)) return slug;
  let step = 2;
  while (taken.includes(`${slug}-${String(step)}`)) step += 1;
  return `${slug}-${String(step)}`;
}

/** What is typed into a slug, kept as slug characters while a trailing dash is still being typed. */
function typedSlug(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "");
}

export const slugFieldStyles = variants({
  slots: {
    group: arc({}),
    prefix: arc(type.mono),
    input: arc(type.mono),
    summary: arc(type.body, fg.muted, layout.row, layout.wrap, gap[1]),
    address: arc(type.mono, fg.default),
    change: arc({}),
    status: arc(type.meta),
  },
});

type SlugSlots = ReturnType<typeof slugFieldStyles> & FieldSlots;

type Availability = "idle" | "checking" | "free" | "taken" | "failed";

export interface SlugFieldProps
  extends Omit<ArcFieldProps, "classes">, FieldValueProps<string>, Customisable<SlugSlots> {
  /** What the slug follows until it is typed over: the name beside it. */
  source?: string;
  /** The address it lives under, before the field: `"acme.app/"`. */
  prefix?: string;
  /** Slugs in use: one followed from the source steps past them, to `acme-2`. */
  taken?: readonly string[];
  /** Whether a slug is free, asked once typing pauses; the request is aborted when it changes. */
  checkAvailability?: (slug: string, signal: AbortSignal) => Promise<boolean>;
  /**
   * The address as a sentence with a Change button, until the button is
   * pressed, the slug is typed over, or it holds an error. @default false
   */
  collapsed?: boolean;
  placeholder?: string;
  maxLength?: number;
}

/**
 * The part of an address a record is reached at, followed from its name.
 *
 * ```tsx
 * <form.AppField name="slug">
 *   {(field) => <field.SlugField label="Address" source={name()} prefix="acme.app/" taken={TAKEN} />}
 * </form.AppField>
 * ```
 *
 * It follows `source` until something is typed into it, and follows again
 * once it is emptied. A slug followed from the name steps past `taken`;
 * `checkAvailability` asks a server once typing pauses, saying it is free
 * under the field and holding it as an error when it is not. Typed text is
 * kept to slug characters, and its trailing dash goes when the field is left.
 */
export function SlugField(props: SlugFieldProps) {
  const messages = useArcMessages();
  const of = bindField<string>(props, "");
  const summaryId = createUniqueId();
  let input: HTMLInputElement | undefined;
  function cls() {
    return parts({ ...fieldStyles(), ...slugFieldStyles() }, props.classes);
  }
  function derived(): string {
    return freeSlug(slugify(props.source ?? ""), props.taken ?? []);
  }
  const [edited, setEdited] = createSignal(
    untrack(() => {
      const held = of.value() ?? "";
      return held !== "" && held !== derived();
    }),
  );
  const [opened, setOpened] = createSignal(false);
  const [availability, setAvailability] = createSignal<Availability>("idle");

  function slug(): string {
    return edited() ? (of.value() ?? "") : derived();
  }

  createEffect(
    () => (edited() ? null : derived()),
    (next: string | null) => {
      if (next !== null && next !== untrack(of.value)) untrack(() => of.change(next));
    },
  );

  let controller: AbortController | undefined;
  const check = debounce((value: string) => {
    const ask = untrack(() => props.checkAvailability);
    if (ask === undefined) return;
    controller?.abort();
    const own = new AbortController();
    controller = own;
    ask(value, own.signal).then(
      (free) => {
        if (!own.signal.aborted) setAvailability(free ? "free" : "taken");
      },
      () => {
        if (!own.signal.aborted) setAvailability("failed");
      },
    );
  }, 400);
  onCleanup(() => {
    check.clear();
    controller?.abort();
  });
  createEffect(
    () => (props.checkAvailability === undefined ? "" : slug()),
    (value: string) => {
      controller?.abort();
      check.clear();
      if (value === "") {
        setAvailability("idle");
        return;
      }
      setAvailability("checking");
      check(value);
    },
  );

  const wiring = withOwnErrors(of, () =>
    availability() === "taken" ? [messages().slugTaken(slug())] : [],
  );

  function isCollapsed(): boolean {
    return props.collapsed === true && !opened() && !edited() && !wiring.isInvalid();
  }

  function onInput(event: Event): void {
    const field = event.currentTarget as HTMLInputElement;
    const typed = typedSlug(field.value);
    setEdited(typed !== "");
    of.change(typed === "" ? untrack(derived) : typed);
    if (field.value !== typed && typed !== "") field.value = typed;
  }

  function status(): string {
    const value = slug();
    switch (availability()) {
      case "checking":
        return messages().slugChecking;
      case "free":
        return messages().slugFree(value);
      case "failed":
        return messages().slugCheckFailed;
      default:
        return "";
    }
  }

  return (
    <Frame
      of={wiring}
      label={props.label}
      description={props.description}
      field={props}
      labelledById={isCollapsed()}
      slot="slug-field"
    >
      <Show
        when={isCollapsed()}
        fallback={
          <InputGroup
            class={arc(cls().group, cls().control)}
            data-slot="slug-field-group"
            dir="ltr"
          >
            <Show when={props.prefix !== undefined}>
              <InputGroupAddon>
                <InputGroupText class={cls().prefix} data-slot="slug-field-prefix">
                  {props.prefix}
                </InputGroupText>
              </InputGroupAddon>
            </Show>
            <InputGroupInput
              class={cls().input}
              data-slot="slug-field-input"
              id={wiring.ids.control}
              name={of.name()}
              value={slug()}
              placeholder={props.placeholder}
              maxLength={props.maxLength}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              disabled={props.isDisabled}
              required={props.isRequired}
              aria-invalid={wiring.isInvalid() ? true : undefined}
              aria-describedby={wiring.describedBy(props.description !== undefined)}
              ref={(element: HTMLInputElement) => {
                input = element;
              }}
              onInput={onInput}
              onBlur={() => {
                const trimmed = slug().replace(/-+$/, "");
                if (trimmed !== slug()) of.change(trimmed);
                of.blur();
              }}
            />
          </InputGroup>
        }
      >
        <p class={cls().summary} data-slot="slug-field-summary">
          <span id={summaryId}>
            <Sentence words={messages().slugAt}>
              <span class={cls().address} data-slot="slug-field-address" dir="ltr">
                {`${props.prefix ?? ""}${slug()}`}
              </span>
            </Sentence>
          </span>
          <Button
            variant="link"
            size="sm"
            class={cls().change}
            data-slot="slug-field-change"
            aria-describedby={summaryId}
            isDisabled={props.isDisabled}
            onPress={() => {
              setOpened(true);
              flush();
              input?.focus();
            }}
          >
            {messages().change}
          </Button>
        </p>
      </Show>
      <Show when={props.checkAvailability !== undefined}>
        <p class={cls().status} data-slot="slug-field-status" role="status">
          {status()}
        </p>
      </Show>
    </Frame>
  );
}

export const suggestionFieldStyles = variants({
  slots: { input: arc({}), list: arc({}), item: arc({}) },
});

type SuggestionSlots = ReturnType<typeof suggestionFieldStyles> & FieldSlots;

export interface SuggestionFieldProps
  extends Omit<ArcFieldProps, "classes">, FieldValueProps<string>, Customisable<SuggestionSlots> {
  /** Values already in use, offered as the text is typed. */
  suggestions: readonly string[];
  placeholder?: string;
}

/**
 * Free text with what is already in use offered under it: a group name, a
 * profile, a label. Choosing a suggestion fills it in; typing a new one is
 * just as good.
 *
 * ```tsx
 * <SuggestionField label="Group" suggestions={["Website", "API"]} />
 * ```
 *
 * `ComboboxField` holds only what its list has; this holds the text.
 */
export function SuggestionField(props: SuggestionFieldProps) {
  const messages = useArcMessages();
  const of = bindField<string>(props, "");
  function cls() {
    return parts({ ...fieldStyles(), ...suggestionFieldStyles() }, props.classes);
  }
  function text(): string {
    return of.value() ?? "";
  }
  function chosen(): string | null {
    return props.suggestions.includes(text()) ? text() : null;
  }
  return (
    <Frame
      of={of}
      label={props.label}
      description={props.description}
      field={props}
      slot="suggestion-field"
    >
      <Combobox
        items={props.suggestions}
        value={chosen()}
        inputValue={text()}
        disabled={props.isDisabled}
        allowsCustomValue
        itemToStringLabel={(item: string) => item}
        itemToStringValue={(item: string) => item}
        onInputValueChange={(next: string) => {
          if (next !== untrack(text)) of.change(next);
        }}
        onValueChange={(value: unknown) => {
          if (typeof value === "string") of.change(value);
        }}
        onOpenChange={(open: boolean) => {
          if (!open) of.blur();
        }}
      >
        <ComboboxInput
          class={arc(cls().input, cls().control)}
          data-slot="suggestion-field-input"
          id={of.ids.control}
          placeholder={props.placeholder}
          disabled={props.isDisabled}
          required={props.isRequired}
          triggerLabel={messages().showSuggestions}
          aria-invalid={of.isInvalid() ? true : undefined}
          aria-describedby={of.describedBy(props.description !== undefined)}
        />
        <ComboboxContent>
          <ComboboxEmpty>{messages().noSuggestions}</ComboboxEmpty>
          <ComboboxList class={cls().list}>
            {(item: string) => (
              <ComboboxItem class={cls().item} value={item} dir={textDirection(item) ?? undefined}>
                {item}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <Show when={of.name() !== undefined}>
        <input type="hidden" name={of.name()} value={text()} />
      </Show>
    </Frame>
  );
}
