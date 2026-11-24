import { For, Show, createSignal } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Radio, RadioGroup } from "@barqjs/aria/radio";
import { useLocale } from "@barqjs/aria/i18n";
import { Star } from "@barqjs/lucide/icons/star";
import { contrast } from "@barqjs/ui/shared-contrast";

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
import { fg, focus, layout, motion, rounded, space, square, target, tone } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

/** A star in the tone, filled. */
const solid = arc(fg.toneBase, { "& svg": { fill: "currentColor" } });

export const ratingStyles = variants({
  slots: {
    group: arc(layout.inlineRow, tone.warning, { gap: space.x0_5 }),
    star: arc(
      layout.inlineCentre,
      rounded.sm,
      fg.faint,
      focus.slot,
      target.size,
      motion.colours,
      contrast.selected,
      { cursor: "pointer", "[data-readonly], [data-disabled]": { cursor: "default" } },
    ),
    filled: solid,
    icon: arc({}),
    display: arc(layout.inlineRow, tone.warning, { gap: space.x0_5 }),
    track: arc(layout.relative, layout.inlineCentre, fg.faint),
    fill: arc(solid, {
      position: "absolute",
      insetBlock: "0",
      insetInlineStart: "0",
      overflow: "hidden",
    }),
  },
  variants: {
    size: {
      sm: { icon: square.x4 },
      md: { icon: square.x5 },
      lg: { icon: square.x8 },
    },
  },
  defaults: { size: "md" },
});

type Slots = ReturnType<typeof ratingStyles> & FieldSlots;

export interface RatingProps
  extends
    Omit<ArcFieldProps, "classes" | "label">,
    FieldValueProps<number | null>,
    Customisable<Slots> {
  /** Names the rating. Without one, give `aria-label`. */
  label?: ArcFieldProps["label"];
  "aria-label"?: string;
  /** How many stars. @default 5 */
  max?: number;
  /** Pressing the chosen star again takes the rating away. @default false */
  allowClear?: boolean;
  /**
   * Shown, not given: the stars fill to the value, a fraction included, and
   * are read as one image, "Rated 3.5 out of 5".
   */
  isReadOnly?: boolean;
  /** @default "md" */
  size?: "sm" | "md" | "lg";
}

/**
 * A score in stars, given or shown.
 *
 * ```tsx
 * <Rating label="How was it?" value={score()} onChange={setScore} />
 * <Rating aria-label="Average" value={4.3} isReadOnly size="sm" />
 * ```
 *
 * Given, it is a radio group: one Tab stop, the arrows move and choose in the
 * reading direction, and each star is named "3 stars". The stars up to the
 * one under the pointer fill as a preview, and the chosen ones fill whatever
 * the colour scheme, with system colours under forced colours.
 */
export function Rating(props: RatingProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  const of = bindField<number | null>(props, null);
  const [hovered, setHovered] = createSignal<number | null>(null);
  let cleared: number | null = null;
  const max = (): number => props.max ?? 5;
  const stars = (): number[] => Array.from({ length: max() }, (_, at) => at + 1);
  const cls = () =>
    parts({ ...fieldStyles(), ...ratingStyles({ size: props.size }) }, props.classes);
  const filled = (star: number): boolean => star <= (hovered() ?? of.value() ?? 0);
  const number = (value: number): string =>
    new Intl.NumberFormat(locale().locale, { maximumFractionDigits: 1 }).format(value);

  const shown = () => (
    <span
      class={arc(
        cls().display,
        props.label === undefined ? arc(props.class, props.className) : undefined,
      )}
      data-slot="rating"
      role="img"
      aria-label={
        props.label === undefined
          ? `${props["aria-label"] ?? ""} ${messages().rated(number(of.value() ?? 0), number(max()))}`.trim()
          : messages().rated(number(of.value() ?? 0), number(max()))
      }
    >
      <For each={stars()}>
        {(star: number) => {
          const part = (): number => Math.min(1, Math.max(0, (of.value() ?? 0) - (star - 1)));
          return (
            <span class={cls().track} data-slot="rating-track" aria-hidden="true">
              <Star class={cls().icon} />
              <span
                class={cls().fill}
                data-slot="rating-fill"
                style={{ width: `${String(Math.round(part() * 100))}%` }}
              >
                <Star class={cls().icon} />
              </span>
            </span>
          );
        }}
      </For>
    </span>
  );

  const given = () => (
    <RadioGroup
      class={arc(
        cls().group,
        props.label === undefined ? arc(props.class, props.className) : undefined,
      )}
      data-slot="rating"
      orientation="horizontal"
      value={of.value() === null || of.value() === undefined ? null : String(of.value())}
      aria-label={props.label === undefined ? props["aria-label"] : undefined}
      aria-labelledby={props.label === undefined ? undefined : of.ids.label}
      name={of.name()}
      isDisabled={props.isDisabled}
      isRequired={props.isRequired}
      isInvalid={of.isInvalid()}
      onChange={(next: string) => {
        if (Number(next) === cleared) return;
        of.change(Number(next));
        of.blur();
      }}
      onPointerLeave={() => setHovered(null)}
    >
      <For each={stars()}>
        {(star: number) => (
          <Radio
            value={String(star)}
            class={arc(cls().star, filled(star) ? cls().filled : undefined)}
            data-slot="rating-star"
            data-filled={filled(star) ? "" : undefined}
            aria-label={messages().stars(star)}
            onPointerEnter={() => setHovered(star)}
            onPress={() => {
              if (props.allowClear === true && of.value() === star) {
                // A press on the star's label goes on to click its radio, which
                // the browser checks again once the rating is gone; that click
                // is this same press, not a new choice.
                cleared = star;
                setTimeout(() => {
                  cleared = null;
                });
                of.change(null);
                setHovered(null);
              }
            }}
          >
            <Star class={cls().icon} aria-hidden="true" />
          </Radio>
        )}
      </For>
    </RadioGroup>
  );

  const body = () => (
    <Show when={props.isReadOnly === true} fallback={given()}>
      {shown()}
    </Show>
  );

  return (
    <Show when={props.label !== undefined} fallback={body()}>
      <Frame
        of={of}
        label={props.label}
        description={props.description}
        field={{ ...props, label: props.label, classes: props.classes }}
        labelledById
        slot="rating-field"
      >
        {body()}
      </Frame>
    </Show>
  );
}
