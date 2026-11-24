import { type Child, Show, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Button as AriaButton, ToggleButton } from "@barqjs/aria/button";
import { controllable } from "@barqjs/aria/utils";
import { Check } from "@barqjs/lucide/icons/check";
import { X } from "@barqjs/lucide/icons/x";
import { contrast } from "@barqjs/ui/shared-contrast";
import { when } from "@barqjs/ui/shared-when";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  edge,
  fg,
  focus,
  gap,
  glyph,
  interaction,
  layout,
  motion,
  rounded,
  space,
  target,
  tone as tones,
  type,
} from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import { useArcMessages } from "./messages.ts";

export type ChipVariant = "outline" | "subtle";
export type ChipSize = "sm" | "md";

/**
 * A chip's look, shared by `Chip` and the tags of `TagGroup` and
 * `TagInput`, so a filter chip and a removable tag are one shape.
 */
/** A button inside the chip: its whole height, round, ringed on focus, room for a finger. */
const pressable = arc(
  rounded.full,
  focus.visible,
  target.size,
  bg.transparent,
  edge.none,
  fg.inherit,
  interaction.pressable,
  when.disabledCursor,
);

export const chipVariants = variants({
  slots: {
    root: arc(
      layout.inlineRow,
      layout.noShrink,
      rounded.full,
      type.label,
      fg.tone,
      motion.colours,
      contrast.edge,
      contrast.selected,
      contrast.disabled,
      when.disabledCursor,
      {
        maxWidth: "100%",
        verticalAlign: "middle",
        "[data-selected]": { backgroundColor: "var(--arc-tone-subtle)" },
      },
    ),
    action: arc(layout.inlineRow, layout.minZero, gap[1], glyph.sm, pressable, {
      alignSelf: "stretch",
      paddingInline: space.x2_5,
      font: "inherit",
    }),
    label: arc(layout.minZero, layout.clip, layout.nowrap),
    icon: arc(layout.inlineCentre, glyph.sm),
    check: arc(layout.inlineCentre, glyph.sm),
    remove: arc(layout.inlineCentre, layout.noShrink, glyph.sm, pressable, interaction.hover, {
      marginInlineEnd: space.x1,
      marginInlineStart: "calc(var(--spacing) * -1)",
      padding: space.x0_5,
    }),
  },
  variants: {
    tone: {
      success: { root: tones.success },
      warning: { root: tones.warning },
      danger: { root: tones.danger },
      info: { root: tones.info },
      neutral: { root: tones.neutral },
    },
    variant: {
      outline: { root: edge.all },
      subtle: { root: arc(bg.tone, edge.all, { borderColor: "transparent" }) },
    },
    size: {
      sm: { root: arc(type.xs, { minHeight: space.x6 }), action: arc({ paddingInline: space.x2 }) },
      md: { root: arc({ minHeight: space.x8 }) },
    },
    plain: {
      true: { label: arc({ paddingInline: space.x2_5 }) },
      false: {},
    },
  },
  defaults: { tone: "neutral", variant: "outline", size: "md", plain: true },
});

export type ChipSlots = ReturnType<typeof chipVariants>;

export interface ChipProps extends Customisable<ChipSlots> {
  /** The chip's words. */
  children?: Child;
  /** Before the words: an icon or an avatar. Hidden from assistive tech. */
  icon?: Child;
  /** @default "neutral" */
  tone?: Tone;
  /** @default "outline" */
  variant?: ChipVariant;
  /** @default "md" */
  size?: ChipSize;
  /**
   * Held on or off: a filter chip. The chip is a toggle button and shows a
   * check while it is on.
   */
  selected?: boolean;
  defaultSelected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  /** An action chip: the chip is a button. */
  onPress?: () => void;
  /** An input chip: a button at the end removes it, named "Remove" and the chip's words. */
  onRemove?: () => void;
  /** @default the provider's `remove` message, "Remove" */
  removeLabel?: string;
  isDisabled?: boolean;
  id?: string;
}

/**
 * A compact label that may be pressed, held on or removed.
 *
 * ```tsx
 * <Chip>Design</Chip>
 * <Chip selected={remote()} onSelectedChange={setRemote}>Remote</Chip>
 * <Chip onRemove={() => drop("design")}>Design</Chip>
 * <Chip tone="success" variant="subtle" icon={<Check />}>Passed</Chip>
 * ```
 *
 * A filter chip is a toggle button, so a screen reader hears it pressed or
 * not; its check is drawn as well as its fill, so the state never rests on
 * colour. The remove button is its own stop, named after the chip.
 */
export function Chip(props: ChipProps) {
  const messages = useArcMessages();
  const labelId = createUniqueId();
  const removeId = createUniqueId();
  const selectable = (): boolean =>
    props.selected !== undefined ||
    props.defaultSelected !== undefined ||
    props.onSelectedChange !== undefined;
  const [selected, setSelected] = controllable<boolean>(
    () => props.selected,
    () => props.defaultSelected ?? false,
    (next) => props.onSelectedChange?.(next),
  );
  const interactive = (): boolean => selectable() || props.onPress !== undefined;
  const cls = (): ChipSlots =>
    parts(
      chipVariants({
        tone: props.tone,
        variant: props.variant,
        size: props.size,
        plain: !interactive(),
      }),
      props.classes,
    );

  const content = () => (
    <>
      <Show when={selectable() && selected()}>
        <span class={cls().check} data-slot="chip-check" aria-hidden="true">
          <Check />
        </span>
      </Show>
      <Show when={props.icon !== undefined}>
        <span class={cls().icon} data-slot="chip-icon" aria-hidden="true">
          {props.icon}
        </span>
      </Show>
      <span class={cls().label} id={labelId} data-slot="chip-label">
        {props.children}
      </span>
    </>
  );

  return (
    <span
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="chip"
      data-tone={props.tone ?? "neutral"}
      data-variant={props.variant ?? "outline"}
      data-size={props.size ?? "md"}
      data-selected={selectable() && selected() ? "" : undefined}
      data-disabled={props.isDisabled === true ? "" : undefined}
    >
      <Show
        when={selectable()}
        fallback={
          <Show when={props.onPress !== undefined} fallback={content()}>
            <AriaButton
              class={cls().action}
              data-slot="chip-action"
              isDisabled={props.isDisabled}
              onPress={() => props.onPress?.()}
            >
              {content()}
            </AriaButton>
          </Show>
        }
      >
        <ToggleButton
          class={cls().action}
          data-slot="chip-action"
          isSelected={selected()}
          isDisabled={props.isDisabled}
          onChange={setSelected}
        >
          {content()}
        </ToggleButton>
      </Show>
      <Show when={props.onRemove !== undefined}>
        <AriaButton
          class={cls().remove}
          id={removeId}
          data-slot="chip-remove"
          aria-label={props.removeLabel ?? messages().remove}
          aria-labelledby={`${removeId} ${labelId}`}
          isDisabled={props.isDisabled}
          onPress={() => props.onRemove?.()}
        >
          <X aria-hidden="true" />
        </AriaButton>
      </Show>
    </span>
  );
}
