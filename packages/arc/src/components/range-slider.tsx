import { createMemo } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useLocale } from "@barqjs/aria/i18n";
import { Slider } from "@barqjs/ui/slider";

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
import { layout, space, target, type } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

export type Range = readonly [number, number];

export const rangeSliderStyles = variants({
  slots: {
    slider: arc(layout.fill, { paddingBlock: space.x2 }),
    track: arc({}),
    thumb: target.size,
    values: arc(type.meta, type.numeric, { textAlign: "end" }),
  },
});

type Slots = ReturnType<typeof rangeSliderStyles> & FieldSlots;

export interface RangeSliderProps
  extends Omit<ArcFieldProps, "classes">, FieldValueProps<Range>, Customisable<Slots> {
  /** @default 0 */
  minValue?: number;
  /** @default 100 */
  maxValue?: number;
  /** @default 1 */
  step?: number;
  /** How many steps the two thumbs stay apart. @default 0 */
  minStepsBetweenThumbs?: number;
  /** How the two ends are written: `{ style: "currency", currency: "EUR" }`. */
  formatOptions?: Intl.NumberFormatOptions;
  /** @default the provider's `minimum`, "Minimum" */
  minimumLabel?: string;
  /** @default the provider's `maximum`, "Maximum" */
  maximumLabel?: string;
}

/**
 * A low and a high value on one track: a price band, an age range, a window
 * of hours.
 *
 * ```tsx
 * <RangeSlider label="Price" minValue={0} maxValue={500} formatOptions={{ style: "currency", currency: "USD" }} />
 * ```
 *
 * Two real thumbs, each named ("Minimum, Price"), stepped by the arrows,
 * Page Up and Down, Home and End, and dragged by a finger with room for it.
 * The range is written beside the label in the locale, and it runs from the
 * reading direction's start.
 */
export function RangeSlider(props: RangeSliderProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  function min(): number {
    return props.minValue ?? 0;
  }
  function max(): number {
    return props.maxValue ?? 100;
  }
  const of = bindField<Range>(props, [props.minValue ?? 0, props.maxValue ?? 100]);
  const format = createMemo(() => new Intl.NumberFormat(locale().locale, props.formatOptions));
  function written(): string {
    const [low, high] = of.value();
    return format().formatRange(low, high);
  }
  function cls() {
    return parts({ ...fieldStyles(), ...rangeSliderStyles() }, props.classes);
  }
  return (
    <Frame
      of={of}
      label={props.label}
      description={
        <>
          <output class={cls().values} data-slot="range-slider-values" aria-hidden="true">
            {written()}
          </output>
          {props.description}
        </>
      }
      field={props}
      labelledById
      slot="range-slider"
    >
      <Slider
        class={cls().slider}
        trackClass={cls().track}
        thumbClass={cls().thumb}
        data-slot="range-slider-control"
        aria-labelledby={of.ids.label}
        aria-describedby={of.describedBy(props.description !== undefined)}
        value={[...of.value()]}
        minValue={min()}
        maxValue={max()}
        step={props.step}
        minStepsBetweenThumbs={props.minStepsBetweenThumbs}
        formatOptions={props.formatOptions}
        thumbLabels={[
          props.minimumLabel ?? messages().minimum,
          props.maximumLabel ?? messages().maximum,
        ]}
        name={of.name()}
        isDisabled={props.isDisabled}
        onChange={(next: number[]) => of.change([next[0] ?? min(), next[1] ?? max()])}
        onChangeEnd={() => of.blur()}
      />
    </Frame>
  );
}
