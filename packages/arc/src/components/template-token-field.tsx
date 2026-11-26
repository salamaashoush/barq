import { For, Show, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { filter as localeFilter } from "@barqjs/aria/i18n";
import { type TriggerTypeahead, triggerTypeahead } from "@barqjs/aria/trigger-typeahead";
import { Lock } from "@barqjs/lucide/icons/lock";
import { inputVariants } from "@barqjs/ui/input";

import { arcLayer as arc } from "../layer.ts";
import {
  type ArcFieldProps,
  type FieldSlots,
  type FieldValueProps,
  Frame,
  bindField,
  fieldStyles,
} from "../lib/field.tsx";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  fg,
  gap,
  glyph,
  interaction,
  layout,
  place,
  plainList,
  rounded,
  space,
  surface,
  target,
  truncate,
  type,
} from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

/** A name a template may reference: a variable, or a secret whose value is never shown. */
export interface TemplateToken {
  name: string;
  secret?: boolean;
  /** Beside the name in the list. */
  description?: string;
}

const REFERENCES = /\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}/g;

/** Every name `text` references as `{{NAME}}`, once each, in order. */
export function templateReferences(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(REFERENCES)) {
    const name = match[1];
    if (name !== undefined && !found.includes(name)) found.push(name);
  }
  return found;
}

export const templateTokenFieldStyles = variants({
  slots: {
    anchor: arc(layout.relative),
    input: arc(inputVariants(), type.mono),
    list: arc(plainList, surface.elevated, layout.column, place.across, layout.scrollBlock, {
      insetBlockStart: "calc(100% + 0.25rem)",
      zIndex: "var(--z-popover, 40)",
      maxHeight: "15rem",
      padding: space.x1,
    }),
    option: arc(
      layout.row,
      gap[2],
      interaction.pressable,
      interaction.selected,
      target.size,
      type.sm,
      rounded.sm,
      place.paddedLine,
    ),
    name: arc(type.mono, truncate, layout.minZero),
    kind: arc(layout.inlineRow, gap[1], glyph.sm, type.meta, layout.noShrink, layout.pushEnd),
    unknown: arc(type.meta, {
      color: "var(--warning-foreground)",
      marginBlockStart: space.x0,
    }),
  },
});

type Slots = ReturnType<typeof templateTokenFieldStyles> & FieldSlots;

interface TokenOptionProps {
  token: TemplateToken | undefined;
  index: number;
  typeahead: TriggerTypeahead<TemplateToken>;
  classes: Slots;
}

function TokenOption(props: TokenOptionProps) {
  const messages = useArcMessages();
  return (
    <li
      {...props.typeahead.optionProps(props.index)}
      class={props.classes.option}
      data-slot="template-token-field-option"
      data-selected={props.typeahead.active() === props.index ? "" : undefined}
    >
      <span class={props.classes.name}>{props.token?.name}</span>
      <span class={arc(props.classes.kind, fg.muted)} data-slot="template-token-field-kind">
        <Show when={props.token?.secret === true}>
          <Lock aria-hidden="true" />
        </Show>
        {props.token?.description ??
          (props.token?.secret === true ? messages().secret : messages().variable)}
      </span>
    </li>
  );
}

export interface TemplateTokenFieldProps
  extends Omit<ArcFieldProps, "classes">, FieldValueProps<string>, Customisable<Slots> {
  /** The names a reference may use. */
  tokens: readonly TemplateToken[];
  /** @default `{{NAME}}`, which shows the form a reference takes */
  placeholder?: string;
  /** Warns about a reference to a name not in `tokens`. @default true */
  warnUnknown?: boolean;
  autoFocus?: boolean;
}

/**
 * Plain text that may reference variables and secrets as `{{NAME}}`: a URL,
 * a header, a password that names a secret rather than holding it.
 *
 * ```tsx
 * <TemplateTokenField
 *   label="URL"
 *   tokens={[{ name: "BASE_URL" }, { name: "API_TOKEN", secret: true }]}
 *   defaultValue="{{BASE_URL}}/health"
 * />
 * ```
 *
 * Typing `{{` offers the names, each secret marked; choosing one writes it
 * and the closing braces unless they are there already. A reference to a
 * name it does not know is named under the field as a warning, which does
 * not stop a submit: the name may be defined somewhere this form cannot see.
 */
export function TemplateTokenField(props: TemplateTokenFieldProps) {
  const messages = useArcMessages();
  const of = bindField<string>(props, "");
  const unknownId = createUniqueId();
  const contains = localeFilter({ sensitivity: "base" });
  function cls(): Slots {
    return parts({ ...fieldStyles(), ...templateTokenFieldStyles() }, props.classes);
  }
  function text(): string {
    return of.value() ?? "";
  }
  const typeahead = triggerTypeahead<TemplateToken>({
    pattern: /\{\{\s*([A-Za-z0-9_.-]*)$/,
    options: (query) => props.tokens.filter((token) => contains.contains(token.name, query)),
    insert: (token, _match, after) => (/^\s*\}\}/.test(after) ? token.name : `${token.name}}}`),
    onChange: (value) => of.change(value),
    isDisabled: () => props.isDisabled === true,
  });
  function unknown(): string[] {
    if (props.warnUnknown === false) return [];
    const known = new Set(props.tokens.map((token) => token.name));
    return templateReferences(text()).filter((name) => !known.has(name));
  }
  function describedBy(): string | undefined {
    const ids = [
      of.describedBy(props.description !== undefined),
      unknown().length > 0 ? unknownId : undefined,
    ].filter((one) => one !== undefined && one !== "");
    return ids.length === 0 ? undefined : ids.join(" ");
  }
  return (
    <Frame
      of={of}
      label={props.label}
      description={props.description}
      field={props}
      slot="template-token-field"
    >
      <div class={cls().anchor} data-slot="template-token-field-anchor">
        <input
          {...typeahead.inputProps}
          type="text"
          id={of.ids.control}
          class={arc(cls().input, cls().control)}
          data-slot="template-token-field-input"
          value={text()}
          name={of.name()}
          placeholder={props.placeholder ?? "{{NAME}}"}
          disabled={props.isDisabled}
          required={props.isRequired}
          autofocus={props.autoFocus}
          autocomplete="off"
          spellcheck={false}
          dir="ltr"
          aria-invalid={of.isInvalid() ? "true" : undefined}
          aria-describedby={describedBy()}
          onInput={(event: Event) => {
            of.change((event.currentTarget as HTMLInputElement).value);
            (typeahead.inputProps.onInput as (event: Event) => void)(event);
          }}
          onBlur={() => {
            typeahead.close();
            of.blur();
          }}
        />
        <Show when={typeahead.isOpen()}>
          <ul
            {...typeahead.listProps}
            aria-label={messages().templateTokens}
            class={cls().list}
            data-slot="template-token-field-list"
          >
            <For each={typeahead.options().map((_token, index) => index)}>
              {(index: number) => (
                <TokenOption
                  token={typeahead.options()[index]}
                  index={index}
                  typeahead={typeahead}
                  classes={cls()}
                />
              )}
            </For>
          </ul>
        </Show>
      </div>
      <Show when={unknown().length > 0}>
        <p id={unknownId} class={cls().unknown} data-slot="template-token-field-unknown">
          {messages().unknownTokens(unknown())}
        </p>
      </Show>
    </Frame>
  );
}
