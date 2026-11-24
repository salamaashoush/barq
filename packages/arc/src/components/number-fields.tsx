import { variants } from "@barqjs/css";
import { NumberField as AriaNumberField } from "@barqjs/aria/numberfield";
import { Minus } from "@barqjs/lucide/icons/minus";
import { Plus } from "@barqjs/lucide/icons/plus";

import { when } from "@barqjs/ui/shared-when";

import { arcLayer as arc } from "../layer.ts";
import {
  type ArcFieldProps,
  type FieldSlots,
  type FieldValueProps,
  Frame,
  bareInput,
  bindField,
  boxedButton,
  fieldStyles,
  segmented,
} from "../lib/field.tsx";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, focus, glyph, interaction, layout, space, type } from "../style/index.ts";

export const numberFieldStyles = variants({
  slots: {
    group: arc(segmented, { paddingInline: space.x0_5, gap: space.x0_5 }),
    input: arc(bareInput, type.numeric, { textAlign: "start" }),
    stepper: arc(
      boxedButton,
      layout.inlineCentre,
      layout.noShrink,
      fg.muted,
      glyph.sm,
      focus.visible,
      interaction.hover,
      interaction.pressable,
      when.disabled,
      { aspectRatio: "1" },
    ),
  },
  variants: {
    steppers: { true: {}, false: { stepper: arc({ display: "none" }) } },
  },
  defaults: { steppers: true },
});

type Slots = ReturnType<typeof numberFieldStyles> & FieldSlots;

export interface FormattedFieldProps
  extends Omit<ArcFieldProps, "classes">, FieldValueProps<number | null>, Customisable<Slots> {
  minValue?: number;
  maxValue?: number;
  step?: number;
  placeholder?: string;
  /** Leave the − and + buttons out, for a field typed more than stepped. @default false */
  hideSteppers?: boolean;
  /**
   * Snap a committed value to the range and the step, or keep it as typed
   * and mark it invalid. @default "snap"
   */
  commitBehavior?: "snap" | "validate";
}

interface BodyProps extends FormattedFieldProps {
  formatOptions: Intl.NumberFormatOptions;
  slot: string;
}

/** aria's number field, formatted, in the field frame: what the three fields here are. */
function FormattedField(props: BodyProps) {
  const of = bindField<number | null>(props, null);
  const cls = () =>
    parts(
      { ...fieldStyles(), ...numberFieldStyles({ steppers: props.hideSteppers !== true }) },
      props.classes,
    );
  return (
    <Frame
      of={of}
      label={props.label}
      description={props.description}
      field={props}
      labelledById
      slot={props.slot}
    >
      <AriaNumberField
        class={cls().group}
        inputClass={cls().input}
        stepperClass={cls().stepper}
        incrementIcon={<Plus aria-hidden="true" />}
        decrementIcon={<Minus aria-hidden="true" />}
        data-slot={`${props.slot}-control`}
        aria-labelledby={of.ids.label}
        aria-describedby={of.describedBy(props.description !== undefined)}
        value={of.value()}
        minValue={props.minValue}
        maxValue={props.maxValue}
        step={props.step}
        formatOptions={props.formatOptions}
        commitBehavior={props.commitBehavior}
        placeholder={props.placeholder}
        name={of.name()}
        isDisabled={props.isDisabled}
        isRequired={props.isRequired}
        isInvalid={of.isInvalid()}
        onChange={(value: number) => of.change(Number.isNaN(value) ? null : value)}
        onFocusOut={(event: FocusEvent) => {
          const to = event.relatedTarget as Node | null;
          if (to === null || !(event.currentTarget as Element).contains(to)) of.blur();
        }}
      />
    </Frame>
  );
}

export interface CurrencyFieldProps extends FormattedFieldProps {
  /** The ISO 4217 code: `"USD"`, `"EUR"`, `"SAR"`. */
  currency: string;
  /** @default "symbol" */
  currencyDisplay?: "symbol" | "narrowSymbol" | "code" | "name";
  /** `"accounting"` writes a negative amount in parentheses. @default "standard" */
  currencySign?: "standard" | "accounting";
}

/**
 * An amount of money, written and read in the locale: `$1,234.50`,
 * `1.234,50 €`, `‏١٬٢٣٤٫٥٠ ر.س.‏`. Held as a number in the currency's
 * units, or `null` while empty.
 *
 * ```tsx
 * <CurrencyField label="Price" currency="EUR" minValue={0} />
 * ```
 *
 * Typed with the locale's separators and digits, which are parsed back, and
 * stepped by the arrows and the − and + buttons.
 */
export function CurrencyField(props: CurrencyFieldProps) {
  return (
    <FormattedField
      {...props}
      slot="currency-field"
      formatOptions={{
        style: "currency",
        currency: props.currency,
        currencyDisplay: props.currencyDisplay,
        currencySign: props.currencySign,
      }}
    />
  );
}

export interface PercentFieldProps extends FormattedFieldProps {
  /** Digits after the point. @default 0 */
  fractionDigits?: number;
}

/**
 * A share, written as a percentage and held as a fraction: `25%` is `0.25`,
 * which is what arithmetic on it wants.
 *
 * ```tsx
 * <PercentField label="Discount" minValue={0} maxValue={1} step={0.05} />
 * ```
 */
export function PercentField(props: PercentFieldProps) {
  return (
    <FormattedField
      {...props}
      step={props.step ?? 0.01}
      slot="percent-field"
      formatOptions={{
        style: "percent",
        minimumFractionDigits: props.fractionDigits ?? 0,
        maximumFractionDigits: props.fractionDigits ?? 0,
      }}
    />
  );
}

export interface UnitFieldProps extends FormattedFieldProps {
  /**
   * The unit, as `Intl.NumberFormat` names it: `"kilogram"`, `"megabyte"`,
   * `"kilometer-per-hour"`, `"millisecond"`.
   */
  unit: string;
  /** @default "short" */
  unitDisplay?: "short" | "narrow" | "long";
  /** Digits after the point, at most. @default 2 */
  maximumFractionDigits?: number;
}

/**
 * A measure in a unit, written in the locale's words for it: `12 kg`,
 * `250 MB`, `٣٠ كم/س`. Held as the number.
 *
 * ```tsx
 * <UnitField label="Storage" unit="gigabyte" minValue={1} />
 * ```
 */
export function UnitField(props: UnitFieldProps) {
  return (
    <FormattedField
      {...props}
      slot="unit-field"
      formatOptions={{
        style: "unit",
        unit: props.unit,
        unitDisplay: props.unitDisplay ?? "short",
        maximumFractionDigits: props.maximumFractionDigits ?? 2,
      }}
    />
  );
}
