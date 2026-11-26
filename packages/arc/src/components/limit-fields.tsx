import { type Child, Show, createSignal, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { NumberField as AriaNumberField } from "@barqjs/aria/numberfield";
import { Minus } from "@barqjs/lucide/icons/minus";
import { Plus } from "@barqjs/lucide/icons/plus";
import { Switch } from "@barqjs/ui/switch";

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
import { fg, gap, layout, type } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";
import { numberFieldStyles } from "./number-fields.tsx";
import { Sentence } from "./sentence.tsx";

/** A number box narrow enough to sit inside a sentence. */
const inline = arc({ width: "var(--limit-width, 9rem)", flex: "none" });

interface AmountProps {
  value: number | null;
  label: string;
  minValue?: number;
  maxValue?: number;
  step?: number;
  placeholder?: string;
  formatOptions?: Intl.NumberFormatOptions;
  isDisabled?: boolean;
  isInvalid?: boolean;
  describedBy?: string;
  class?: string;
  slot: string;
  onChange: (value: number | null) => void;
  onBlur: () => void;
}

/** aria's number field drawn as arc's, sized to sit inside a line of text. */
function Amount(props: AmountProps) {
  function cls() {
    return numberFieldStyles({ steppers: true });
  }
  return (
    <AriaNumberField
      class={arc(cls().group, inline, props.class)}
      inputClass={cls().input}
      stepperClass={cls().stepper}
      incrementIcon={<Plus aria-hidden="true" />}
      decrementIcon={<Minus aria-hidden="true" />}
      data-slot={props.slot}
      aria-label={props.label}
      aria-describedby={props.describedBy}
      value={props.value}
      minValue={props.minValue}
      maxValue={props.maxValue}
      step={props.step}
      formatOptions={props.formatOptions}
      placeholder={props.placeholder}
      isDisabled={props.isDisabled}
      isInvalid={props.isInvalid}
      onChange={(value: number) => props.onChange(Number.isNaN(value) ? null : value)}
      onFocusOut={(event: FocusEvent) => {
        const to = event.relatedTarget as Node | null;
        if (to === null || !(event.currentTarget as Element).contains(to)) props.onBlur();
      }}
    />
  );
}

export const optionalLimitFieldStyles = variants({
  slots: {
    row: arc(layout.row, layout.wrap, gap[3]),
    sentence: arc(layout.row, layout.wrap, gap[2], type.body),
    amount: arc({}),
  },
});

type LimitSlots = ReturnType<typeof optionalLimitFieldStyles> & FieldSlots;

export interface OptionalLimitFieldProps
  extends Omit<ArcFieldProps, "classes">, FieldValueProps<number | null>, Customisable<LimitSlots> {
  /**
   * The sentence the number sits in, handed a marker where it goes:
   * `` (amount) => `Alert when no runner is online for ${amount} minutes` ``.
   */
  sentence: (amount: string) => string;
  /** Names the number for a screen reader: "Minutes", "Jobs at once". */
  amountLabel: string;
  /**
   * `switch` turns the limit on and off, the number disabled and held as
   * `null` while off; `blank` has no switch, an empty number being no limit.
   * @default "switch"
   */
  mode?: "switch" | "blank";
  /** What the number starts at when the switch turns it on. @default `minValue`, else 1 */
  defaultAmount?: number;
  minValue?: number;
  maxValue?: number;
  step?: number;
  /** How the number is written: a currency, a unit. */
  formatOptions?: Intl.NumberFormatOptions;
  /** What an empty number says in `blank` mode. @default the provider's `noLimit`, "No limit" */
  placeholder?: string;
}

/**
 * A limit that may be off, read as a sentence: "Alert when no runner is
 * online for [10] minutes", "Run at most [4] jobs at once".
 *
 * ```tsx
 * <OptionalLimitField
 *   label="Offline alert"
 *   amountLabel="Minutes"
 *   sentence={(amount) => `Alert when no runner is online for ${amount} minutes`}
 * />
 * ```
 *
 * Held as the number, or `null` with the limit off. Turning the switch back
 * on brings back the number it had, so a slip of the thumb loses nothing.
 * In `blank` mode an empty number is the off state.
 */
export function OptionalLimitField(props: OptionalLimitFieldProps) {
  const messages = useArcMessages();
  const of = bindField<number | null>(props, null);
  const [last, setLast] = createSignal<number | null>(untrack(of.value) ?? null);
  function cls(): LimitSlots {
    return parts({ ...fieldStyles(), ...optionalLimitFieldStyles() }, props.classes);
  }
  function isOn(): boolean {
    return (of.value() ?? null) !== null;
  }
  function blank(): boolean {
    return props.mode === "blank";
  }
  function turn(on: boolean): void {
    if (!on) {
      setLast(untrack(of.value) ?? null);
      of.change(null);
    } else {
      of.change(untrack(last) ?? props.defaultAmount ?? props.minValue ?? 1);
    }
    of.blur();
  }
  function amount() {
    return (
      <Sentence words={props.sentence}>
        <Amount
          slot="optional-limit-amount"
          class={cls().amount}
          value={of.value() ?? null}
          label={props.amountLabel}
          minValue={props.minValue}
          maxValue={props.maxValue}
          step={props.step}
          formatOptions={props.formatOptions}
          placeholder={blank() ? (props.placeholder ?? messages().noLimit) : undefined}
          isDisabled={props.isDisabled === true || (!blank() && !isOn())}
          isInvalid={of.isInvalid()}
          describedBy={of.describedBy(props.description !== undefined)}
          onChange={(value) => {
            if (value !== null) setLast(value);
            if (value !== null || blank()) of.change(value);
          }}
          onBlur={of.blur}
        />
      </Sentence>
    );
  }
  return (
    <Frame
      of={of}
      label={props.label}
      description={props.description}
      field={props}
      labelledById
      slot="optional-limit-field"
    >
      <div class={cls().row} data-slot="optional-limit-row">
        <Show when={!blank()}>
          <Switch
            id={of.ids.control}
            class={cls().control}
            aria-labelledby={of.ids.label}
            aria-describedby={of.describedBy(props.description !== undefined)}
            isSelected={isOn()}
            isDisabled={props.isDisabled}
            onChange={turn}
          />
        </Show>
        <span class={cls().sentence} data-slot="optional-limit-sentence">
          {amount()}
        </span>
      </div>
      <Show when={of.name() !== undefined}>
        <input type="hidden" name={of.name()} value={of.value() ?? ""} />
      </Show>
    </Frame>
  );
}

/** Two numbers read as one value: a width and a height, a latitude and a longitude. */
export type NumberPair = readonly [number, number];

export const pairedNumberFieldStyles = variants({
  slots: {
    row: arc(layout.row, layout.wrap, gap[2]),
    first: arc({}),
    second: arc({}),
    separator: arc(fg.muted, type.sm),
    unit: arc(type.meta),
  },
});

type PairSlots = ReturnType<typeof pairedNumberFieldStyles> & FieldSlots;

export interface PairedNumberFieldProps
  extends
    Omit<ArcFieldProps, "classes">,
    FieldValueProps<NumberPair | null>,
    Customisable<PairSlots> {
  /** Names each number for a screen reader: `["Width", "Height"]`. */
  labels: readonly [string, string];
  /** Between the two. @default "×" */
  separator?: string;
  /** After the pair, in words: "pixels", "degrees". */
  unit?: Child;
  placeholders?: readonly [string, string];
  minValue?: number;
  maxValue?: number;
  step?: number;
  formatOptions?: Intl.NumberFormatOptions;
}

/**
 * Two numbers read as one value: a viewport's width and height, a place's
 * latitude and longitude.
 *
 * ```tsx
 * <PairedNumberField label="Viewport" labels={["Width", "Height"]} unit="pixels" minValue={1} />
 * ```
 *
 * Held as `[first, second]`, or `null` with both empty. With one filled and
 * the other not it holds `null` and says to fill in both, in the one error
 * line under the pair that both numbers point at.
 */
export function PairedNumberField(props: PairedNumberFieldProps) {
  const messages = useArcMessages();
  const of = bindField<NumberPair | null>(props, null);
  const held = untrack(of.value) ?? null;
  const [first, setFirst] = createSignal<number | null>(held === null ? null : held[0]);
  const [second, setSecond] = createSignal<number | null>(held === null ? null : held[1]);
  const [left, setLeft] = createSignal(false);
  function cls(): PairSlots {
    return parts({ ...fieldStyles(), ...pairedNumberFieldStyles() }, props.classes);
  }
  function shown(index: 0 | 1): number | null {
    const value = of.value() ?? null;
    if (value !== null) return value[index];
    return index === 0 ? first() : second();
  }
  function isPartial(): boolean {
    return (shown(0) === null) !== (shown(1) === null);
  }
  function set(index: 0 | 1, value: number | null): void {
    if (index === 0) setFirst(value);
    else setSecond(value);
    const one = index === 0 ? value : untrack(() => shown(0));
    const two = index === 1 ? value : untrack(() => shown(1));
    of.change(one !== null && two !== null ? [one, two] : null);
  }
  function blur(): void {
    setLeft(true);
    of.blur();
  }
  const wiring = withOwnErrors(of, () =>
    isPartial() && left() ? [messages().fillBothOrNeither] : [],
  );
  function part(index: 0 | 1) {
    return (
      <Amount
        slot={index === 0 ? "paired-number-first" : "paired-number-second"}
        class={index === 0 ? cls().first : cls().second}
        value={shown(index)}
        label={props.labels[index]}
        minValue={props.minValue}
        maxValue={props.maxValue}
        step={props.step}
        formatOptions={props.formatOptions}
        placeholder={props.placeholders?.[index]}
        isDisabled={props.isDisabled}
        isInvalid={wiring.isInvalid()}
        describedBy={wiring.describedBy(props.description !== undefined)}
        onChange={(value) => set(index, value)}
        onBlur={blur}
      />
    );
  }
  return (
    <Frame
      of={wiring}
      label={props.label}
      description={props.description}
      field={props}
      labelledById
      slot="paired-number-field"
    >
      <div
        class={cls().row}
        data-slot="paired-number-row"
        role="group"
        aria-labelledby={of.ids.label}
      >
        {part(0)}
        <span class={cls().separator} data-slot="paired-number-separator" aria-hidden="true">
          {props.separator ?? "×"}
        </span>
        {part(1)}
        <Show when={props.unit !== undefined}>
          <span class={cls().unit} data-slot="paired-number-unit">
            {props.unit}
          </span>
        </Show>
      </div>
      <Show when={of.name() !== undefined}>
        <input type="hidden" name={of.name()} value={(of.value() ?? []).join(",")} />
      </Show>
    </Frame>
  );
}
