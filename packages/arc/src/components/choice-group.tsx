import { type Child, For, Show, createSignal, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Button } from "@barqjs/ui/button";
import { Checkbox } from "@barqjs/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@barqjs/ui/field";
import { RadioGroup, RadioGroupItem } from "@barqjs/ui/radio-group";
import { Switch } from "@barqjs/ui/switch";

import { arcLayer as arc } from "../layer.ts";
import {
  type ArcFieldProps,
  type Binding,
  type FieldSlots,
  type FieldValueProps,
  Frame,
  bindField,
  fieldStyles,
  useArcFormContext,
  withOwnErrors,
} from "../lib/field.tsx";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, layout, plainList, space, tone, type } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

/** One choice of a `CheckboxGroupField` or a `RadioGroupField`. */
export interface GroupOption {
  value: string;
  label: Child;
  description?: Child;
  /** A line under the description in a warning tone: what choosing it costs or leaves out. */
  caveat?: Child;
  isDisabled?: boolean;
}

/** A button over the options that sets them at once: "All", "Basic". */
export interface ChoiceShortcut {
  label: string;
  values: readonly string[];
}

export const choiceGroupStyles = variants({
  slots: {
    shortcuts: arc(layout.row, layout.wrap, gap[1]),
    shortcut: arc({}),
    group: arc(layout.fill, gap[3]),
    option: arc({}),
    optionLabel: arc({}),
    optionDescription: arc({}),
    caveat: arc(type.meta, tone.warning, fg.tone),
    control: arc({}),
    readList: arc(plainList, layout.column, gap[1], type.body),
    empty: arc(type.body, fg.muted),
  },
  variants: {
    layout: {
      column: { group: arc(layout.column) },
      row: { group: arc(layout.row, layout.wrap, { columnGap: space.x6 }) },
      grid: {
        group: arc({
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fill, minmax(min(100%, var(--choice-column-min, 16rem)), 1fr))",
        }),
      },
    },
  },
  defaults: { layout: "column" },
});

type GroupSlots = ReturnType<typeof choiceGroupStyles> & FieldSlots;

interface GroupCommon extends Omit<ArcFieldProps, "classes">, Customisable<GroupSlots> {
  options: readonly GroupOption[];
  /**
   * `column` stacks them, `row` lets them wrap along a line, and `grid` sets
   * columns that drop to one on a phone. @default "column"
   */
  layout?: "column" | "row" | "grid";
  /** The narrowest a `grid` column gets. @default "16rem" */
  minColumnWidth?: string;
  /** Shows the chosen options as text, and nothing to change them. */
  isReadOnly?: boolean;
  /** What a read-only group says when nothing is chosen. @default the provider's `noneChosen` */
  emptyLabel?: Child;
  /** What a held value missing from the options reads as. @default the value itself */
  unknownLabel?: (value: string) => string;
}

/** The options with any held value they do not have, kept at the end so it is never dropped. */
function withHeld(
  options: readonly GroupOption[],
  held: readonly string[],
  unknownLabel: ((value: string) => string) | undefined,
): readonly GroupOption[] {
  const extra = held
    .filter((value) => !options.some((option) => option.value === value))
    .map((value) => ({ value, label: unknownLabel?.(value) ?? value }));
  return extra.length === 0 ? options : [...options, ...extra];
}

interface RowProps {
  option: GroupOption;
  cls: GroupSlots;
  control: (id: string, describedBy: string | undefined) => Child;
}

/** One option: its control beside its label, its description and its caveat. */
function Row(props: RowProps) {
  const id = createUniqueId();
  function describedBy(): string | undefined {
    const ids = [
      props.option.description === undefined ? "" : `${id}-description`,
      props.option.caveat === undefined ? "" : `${id}-caveat`,
    ].filter((one) => one !== "");
    return ids.length === 0 ? undefined : ids.join(" ");
  }
  return (
    <Field
      orientation="horizontal"
      class={props.cls.option}
      data-slot="choice-group-option"
      data-disabled={props.option.isDisabled === true ? "" : undefined}
    >
      {props.control(id, describedBy())}
      <FieldContent>
        <FieldLabel class={props.cls.optionLabel} for={id} data-slot="choice-group-label">
          {props.option.label}
        </FieldLabel>
        <Show when={props.option.description !== undefined}>
          <FieldDescription
            class={props.cls.optionDescription}
            id={`${id}-description`}
            data-slot="choice-group-description"
          >
            {props.option.description}
          </FieldDescription>
        </Show>
        <Show when={props.option.caveat !== undefined}>
          <p class={props.cls.caveat} id={`${id}-caveat`} data-slot="choice-group-caveat">
            {props.option.caveat}
          </p>
        </Show>
      </FieldContent>
    </Field>
  );
}

interface ReadOnlyProps {
  chosen: readonly GroupOption[];
  cls: GroupSlots;
  labelId: string;
  emptyLabel?: Child;
}

function ReadOnly(props: ReadOnlyProps) {
  const messages = useArcMessages();
  return (
    <Show
      when={props.chosen.length > 0}
      fallback={
        <p class={props.cls.empty} data-slot="choice-group-empty">
          {props.emptyLabel ?? messages().noneChosen}
        </p>
      }
    >
      <ul class={props.cls.readList} data-slot="choice-group-read" aria-labelledby={props.labelId}>
        <For each={props.chosen}>{(option: GroupOption) => <li>{option.label}</li>}</For>
      </ul>
    </Show>
  );
}

/**
 * Whether the form has been submitted at least once, so a rule the field
 * keeps itself shows on a field nobody touched.
 */
function useSubmitted(own: Binding<unknown>): () => boolean {
  if (!("field" in own)) return () => false;
  const form = useArcFormContext();
  return form.useSelector((state) => state.submissionAttempts > 0);
}

export interface CheckboxGroupFieldProps extends GroupCommon, FieldValueProps<readonly string[]> {
  /** Buttons over the options that set them at once. */
  shortcuts?: readonly ChoiceShortcut[];
  /** Each option a switch rather than a checkbox: settings turned on one by one. @default "checkbox" */
  control?: "checkbox" | "switch";
}

/**
 * Several of a list of options, each a checkbox beside its label, with a
 * line about it and a caveat when there is one: the events to send, the
 * severities to page for, the modules a class takes.
 *
 * ```tsx
 * <CheckboxGroupField label="Severities" isRequired layout="row" options={SEVERITIES} />
 * ```
 *
 * Held as the chosen values in the options' order, whatever order they were
 * ticked in, so a dirty check ignores the order; a held value the options do
 * not have stays, as one more checkbox. `isRequired` asks for at least one,
 * said under the group once it has been touched or the form submitted.
 */
export function CheckboxGroupField(props: CheckboxGroupFieldProps) {
  const messages = useArcMessages();
  const of = bindField<readonly string[]>(props, []);
  const submitted = useSubmitted(of as Binding<unknown>);
  const [touched, setTouched] = createSignal(false);
  function cls(): GroupSlots {
    return parts(
      { ...fieldStyles(), ...choiceGroupStyles({ layout: props.layout ?? "column" }) },
      props.classes,
    );
  }
  function chosen(): readonly string[] {
    return of.value() ?? [];
  }
  function options(): readonly GroupOption[] {
    return withHeld(props.options, chosen(), props.unknownLabel);
  }
  function inOrder(values: readonly string[]): string[] {
    return options()
      .map((option) => option.value)
      .filter((value) => values.includes(value));
  }
  function set(values: readonly string[]): void {
    setTouched(true);
    of.change(inOrder(values));
    of.blur();
  }
  function toggle(value: string, on: boolean): void {
    set(on ? [...chosen(), value] : chosen().filter((one) => one !== value));
  }
  const wiring = withOwnErrors(of, () =>
    props.isRequired === true &&
    props.isReadOnly !== true &&
    chosen().length === 0 &&
    (touched() || submitted())
      ? [messages().pickAtLeastOne]
      : [],
  );
  return (
    <Frame
      of={wiring}
      label={props.label}
      description={props.description}
      field={props}
      labelledById
      slot="checkbox-group-field"
    >
      <Show
        when={props.isReadOnly !== true}
        fallback={
          <ReadOnly
            chosen={options().filter((option) => chosen().includes(option.value))}
            cls={cls()}
            labelId={of.ids.label}
            emptyLabel={props.emptyLabel}
          />
        }
      >
        <Show when={(props.shortcuts ?? []).length > 0}>
          <div class={cls().shortcuts} data-slot="checkbox-group-shortcuts">
            <For each={props.shortcuts ?? []}>
              {(shortcut: ChoiceShortcut) => (
                <Button
                  variant="link"
                  size="sm"
                  class={cls().shortcut}
                  data-slot="checkbox-group-shortcut"
                  isDisabled={props.isDisabled}
                  onPress={() => set(shortcut.values)}
                >
                  {shortcut.label}
                </Button>
              )}
            </For>
          </div>
        </Show>
        <div
          class={cls().group}
          data-slot="checkbox-group"
          role="group"
          style={
            props.minColumnWidth === undefined
              ? undefined
              : { "--choice-column-min": props.minColumnWidth }
          }
          aria-labelledby={of.ids.label}
          aria-describedby={wiring.describedBy(props.description !== undefined)}
          aria-required={props.isRequired === true ? true : undefined}
          aria-invalid={wiring.isInvalid() ? true : undefined}
        >
          <For each={options()}>
            {(option: GroupOption) => (
              <Row
                option={option}
                cls={cls()}
                control={(id, describedBy) => (
                  <Show
                    when={props.control === "switch"}
                    fallback={
                      <Checkbox
                        id={id}
                        class={cls().control}
                        name={of.name()}
                        value={option.value}
                        isSelected={chosen().includes(option.value)}
                        isDisabled={props.isDisabled === true || option.isDisabled === true}
                        isInvalid={wiring.isInvalid()}
                        aria-describedby={describedBy}
                        onChange={(on: boolean) => toggle(option.value, on)}
                      />
                    }
                  >
                    <Switch
                      id={id}
                      class={cls().control}
                      name={of.name()}
                      value={option.value}
                      isSelected={chosen().includes(option.value)}
                      isDisabled={props.isDisabled === true || option.isDisabled === true}
                      aria-describedby={describedBy}
                      onChange={(on: boolean) => toggle(option.value, on)}
                    />
                  </Show>
                )}
              />
            )}
          </For>
        </div>
      </Show>
    </Frame>
  );
}

export interface RadioGroupFieldProps extends GroupCommon, FieldValueProps<string | null> {}

/**
 * One of a few options, each a radio beside its label and a line about it:
 * a scope, a strategy, a schedule kind.
 *
 * ```tsx
 * <RadioGroupField label="Run on" options={STRATEGIES} />
 * ```
 *
 * A radio group, so it is one Tab stop and the arrows choose in the reading
 * direction. `RadioCards` is the same choice drawn as cards.
 */
export function RadioGroupField(props: RadioGroupFieldProps) {
  const of = bindField<string | null>(props, null);
  function cls(): GroupSlots {
    return parts(
      { ...fieldStyles(), ...choiceGroupStyles({ layout: props.layout ?? "column" }) },
      props.classes,
    );
  }
  function options(): readonly GroupOption[] {
    const held = of.value();
    return withHeld(
      props.options,
      held === null || held === undefined ? [] : [held],
      props.unknownLabel,
    );
  }
  return (
    <Frame
      of={of}
      label={props.label}
      description={props.description}
      field={props}
      labelledById
      slot="radio-group-field"
    >
      <Show
        when={props.isReadOnly !== true}
        fallback={
          <ReadOnly
            chosen={options().filter((option) => option.value === of.value())}
            cls={cls()}
            labelId={of.ids.label}
            emptyLabel={props.emptyLabel}
          />
        }
      >
        <RadioGroup
          class={cls().group}
          data-slot="radio-group-field-group"
          style={
            props.minColumnWidth === undefined
              ? undefined
              : { "--choice-column-min": props.minColumnWidth }
          }
          aria-labelledby={of.ids.label}
          aria-describedby={of.describedBy(props.description !== undefined)}
          orientation={props.layout === "row" ? "horizontal" : "vertical"}
          value={of.value()}
          name={of.name()}
          isDisabled={props.isDisabled}
          isRequired={props.isRequired}
          isInvalid={of.isInvalid()}
          onChange={(value: string) => {
            of.change(value);
            of.blur();
          }}
        >
          <For each={options()}>
            {(option: GroupOption) => (
              <Row
                option={option}
                cls={cls()}
                control={(id, describedBy) => (
                  <RadioGroupItem
                    id={id}
                    value={option.value}
                    class={cls().control}
                    isDisabled={option.isDisabled}
                    aria-describedby={describedBy}
                  />
                )}
              />
            )}
          </For>
        </RadioGroup>
      </Show>
    </Frame>
  );
}
