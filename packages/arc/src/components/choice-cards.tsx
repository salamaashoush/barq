import { type Child, For, Show, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Checkbox } from "@barqjs/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@barqjs/ui/field";
import { RadioGroup, RadioGroupItem } from "@barqjs/ui/radio-group";

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
import { bg, edge, fg, gap, glyph, layout, target } from "../style/index.ts";

export interface ChoiceOption {
  value: string;
  label: Child;
  description?: Child;
  /** Before the words: an icon, a logo, a small preview. */
  icon?: Child;
  /**
   * Across the top of the card, edge to edge: a screenshot, a theme drawn
   * small, a layout. Decorative; the label names the option.
   */
  media?: Child;
  isDisabled?: boolean;
}

export const choiceCardsStyles = variants({
  slots: {
    group: arc(layout.fill, gap[3], {
      display: "grid",
      gridTemplateColumns:
        "repeat(auto-fill, minmax(min(100%, var(--choice-card-min, 14rem)), 1fr))",
    }),
    card: arc(target.size, { cursor: "pointer", overflow: "hidden" }),
    media: arc(edge.bottom, bg.muted, {
      display: "block",
      aspectRatio: "var(--choice-card-media-ratio, 16 / 9)",
      overflow: "hidden",
      "& > img": { display: "block", width: "100%", height: "100%", objectFit: "cover" },
    }),
    body: arc({ alignItems: "flex-start" }),
    icon: arc(layout.inlineCentre, layout.noShrink, fg.muted, glyph.md),
    title: arc({}),
    description: arc({}),
    control: arc({}),
  },
});

type Slots = ReturnType<typeof choiceCardsStyles> & FieldSlots;

interface CardsProps extends Omit<ArcFieldProps, "classes">, Customisable<Slots> {
  options: readonly ChoiceOption[];
  /** The narrowest a card gets before the grid drops a column. @default "14rem" */
  minCardWidth?: string;
  /** The shape of each card's `media`, as an aspect ratio. @default "16 / 9" */
  mediaRatio?: string;
}

function cardVars(props: CardsProps): Record<string, string> | undefined {
  const vars: Record<string, string> = {};
  if (props.minCardWidth !== undefined) vars["--choice-card-min"] = props.minCardWidth;
  if (props.mediaRatio !== undefined) vars["--choice-card-media-ratio"] = props.mediaRatio;
  return Object.keys(vars).length === 0 ? undefined : vars;
}

interface CardProps {
  option: ChoiceOption;
  cls: Slots;
  /**
   * The control, given the ids its card wires: its own, its title's (so the
   * card's description is not read into its name) and its description's.
   */
  control: (id: string, labelledBy: string, describedBy: string | undefined) => Child;
}

/** One option as a card: ui's field label around a horizontal field, the whole card pressable. */
function Card(props: CardProps) {
  const id = createUniqueId();
  const description = `${id}-description`;
  const title = `${id}-title`;
  return (
    <FieldLabel class={props.cls.card} for={id} data-slot="choice-card">
      <Show when={props.option.media !== undefined}>
        <span class={props.cls.media} data-slot="choice-card-media" aria-hidden="true">
          {props.option.media}
        </span>
      </Show>
      <Field
        orientation="horizontal"
        class={props.cls.body}
        data-disabled={props.option.isDisabled === true ? "" : undefined}
      >
        <Show when={props.option.icon !== undefined}>
          <span class={props.cls.icon} data-slot="choice-card-icon" aria-hidden="true">
            {props.option.icon}
          </span>
        </Show>
        <FieldContent>
          <FieldTitle class={props.cls.title} id={title} data-slot="choice-card-title">
            {props.option.label}
          </FieldTitle>
          <Show when={props.option.description !== undefined}>
            <FieldDescription
              class={props.cls.description}
              id={description}
              data-slot="choice-card-description"
            >
              {props.option.description}
            </FieldDescription>
          </Show>
        </FieldContent>
        {props.control(id, title, props.option.description === undefined ? undefined : description)}
      </Field>
    </FieldLabel>
  );
}

export interface RadioCardsProps extends CardsProps, FieldValueProps<string | null> {}

/**
 * One of a few options, each a card with a title and a line about it: a
 * plan, a template, a delivery speed.
 *
 * ```tsx
 * <RadioCards label="Plan" options={[{ value: "team", label: "Team", description: "Up to 20 seats." }]} />
 * ```
 *
 * A radio group, so it is one Tab stop and the arrows choose in the reading
 * direction. The whole card is the press target, the chosen one is filled
 * and its radio checked, and the cards drop to fewer columns as the room
 * narrows, to one on a phone.
 */
export function RadioCards(props: RadioCardsProps) {
  const of = bindField<string | null>(props, null);
  function cls() {
    return parts({ ...fieldStyles(), ...choiceCardsStyles() }, props.classes);
  }
  return (
    <Frame
      of={of}
      label={props.label}
      description={props.description}
      field={props}
      labelledById
      slot="radio-cards"
    >
      <RadioGroup
        class={cls().group}
        data-slot="radio-cards-group"
        style={cardVars(props)}
        aria-labelledby={of.ids.label}
        aria-describedby={of.describedBy(props.description !== undefined)}
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
        <For each={props.options}>
          {(option: ChoiceOption) => (
            <Card
              option={option}
              cls={cls()}
              control={(id, labelledBy, describedBy) => (
                <RadioGroupItem
                  id={id}
                  aria-labelledby={labelledBy}
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
    </Frame>
  );
}

export interface CheckboxCardsProps extends CardsProps, FieldValueProps<readonly string[]> {}

/**
 * Several of a few options, each a card with a checkbox: the features to
 * turn on, the channels to notify. Held as the chosen values, in the
 * options' order.
 */
export function CheckboxCards(props: CheckboxCardsProps) {
  const of = bindField<readonly string[]>(props, []);
  function cls() {
    return parts({ ...fieldStyles(), ...choiceCardsStyles() }, props.classes);
  }
  function chosen(): readonly string[] {
    return of.value() ?? [];
  }
  function toggle(value: string, on: boolean): void {
    const next = props.options
      .map((option) => option.value)
      .filter((one) => (one === value ? on : chosen().includes(one)));
    of.change(next);
    of.blur();
  }
  return (
    <Frame
      of={of}
      label={props.label}
      description={props.description}
      field={props}
      labelledById
      slot="checkbox-cards"
    >
      <div
        class={cls().group}
        data-slot="checkbox-cards-group"
        role="group"
        style={cardVars(props)}
        aria-labelledby={of.ids.label}
        aria-describedby={of.describedBy(props.description !== undefined)}
      >
        <For each={props.options}>
          {(option: ChoiceOption) => (
            <Card
              option={option}
              cls={cls()}
              control={(id, labelledBy, describedBy) => (
                <Checkbox
                  id={id}
                  aria-labelledby={labelledBy}
                  class={cls().control}
                  name={of.name()}
                  value={option.value}
                  isSelected={chosen().includes(option.value)}
                  isDisabled={props.isDisabled === true || option.isDisabled === true}
                  isInvalid={of.isInvalid()}
                  aria-describedby={describedBy}
                  onChange={(on: boolean) => toggle(option.value, on)}
                />
              )}
            />
          )}
        </For>
      </div>
    </Frame>
  );
}
