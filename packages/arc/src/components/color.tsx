import { type Child, For, Show, createMemo, createSignal } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { type Color, type ColorChannel, parseColor } from "@barqjs/aria/color";
import {
  ColorArea as AriaColorArea,
  ColorField as AriaColorField,
  ColorPicker as AriaColorPicker,
  ColorSlider as AriaColorSlider,
  ColorSwatch,
} from "@barqjs/aria/colorpicker";
import { ColorSwatchPicker, ColorSwatchPickerItem } from "@barqjs/aria/colorswatchpicker";
import { Pipette } from "@barqjs/lucide/icons/pipette";
import { Button } from "@barqjs/ui/button";
import { inputVariants } from "@barqjs/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@barqjs/ui/popover";
import { contrast } from "@barqjs/ui/shared-contrast";
import { srOnly } from "@barqjs/ui/sr-only";
import { on } from "@barqjs/ui/conditions";

import { arcLayer as arc } from "../layer.ts";
import { place } from "../lib/place.ts";
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
  focus,
  gap,
  layout,
  plainList,
  rounded,
  space,
  square,
  target,
  truncate,
  type,
} from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

/** A colour as a caller holds it: `#7f00ff`, or `#7f00ff80` with alpha. */
export function colorValue(color: Color): string {
  return color.getChannelValue("alpha") < 1 ? color.toString("hexa") : color.toString("hex");
}

/** A string as a colour, or nothing when it names none. */
export function readColor(value: string | null | undefined): Color | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  try {
    return parseColor(value);
  } catch {
    return null;
  }
}

/** A drawn colour's edge, so white shows on white and black on black. */
const ink = arc({
  boxShadow: "inset 0 0 0 1px color-mix(in oklab, currentColor 20%, transparent)",
});

/** What a colour holds when nothing was given: black, as a picker's own default is. */
const BLACK = "#000000";

/** A thumb on a track or in an area: a white ring around the colour, a finger's size on touch. */
const thumb = arc(rounded.full, contrast.focus, square.x5, {
  borderWidth: "2px",
  borderStyle: "solid",
  borderColor: "white",
  boxShadow: "0 0 0 1px rgb(0 0 0 / 0.35)",
  boxSizing: "border-box",
  "[data-focus-visible]": { width: space.x6, height: space.x6 },
  [on.coarse]: { width: space.x8, height: space.x8 },
});

export const colorStyles = variants({
  slots: {
    area: arc(layout.relative, layout.fill, rounded.md, ink, {
      aspectRatio: "1",
      minHeight: "8rem",
      "[data-disabled]": { opacity: "50%" },
    }),
    slider: arc(layout.relative, layout.fill, rounded.full, ink, {
      height: space.x6,
      "[data-disabled]": { opacity: "50%" },
    }),
    thumb: arc(thumb, { top: "50%" }),
    areaThumb: thumb,
    output: srOnly,
    swatch: arc(rounded.md, ink, square.x5),
  },
});

type ColorSlots = ReturnType<typeof colorStyles>;

export interface ColorAreaProps extends Customisable<Pick<ColorSlots, "area" | "areaThumb">> {
  value?: string;
  defaultValue?: string;
  xChannel?: ColorChannel;
  yChannel?: ColorChannel;
  isDisabled?: boolean;
  /** @default the provider's `colourArea`, "Colour" */
  "aria-label"?: string;
  onChange?: (value: string) => void;
  onChangeEnd?: (value: string) => void;
}

/**
 * Two channels of a colour in a square, saturation across and brightness up
 * by default, dragged by a pointer or a finger and stepped by the arrows.
 */
export function ColorArea(props: ColorAreaProps) {
  const messages = useArcMessages();
  const cls = () => parts(colorStyles(), props.classes);
  return (
    <AriaColorArea
      class={arc(cls().area, props.class, props.className)}
      thumbClass={cls().areaThumb}
      data-slot="color-area"
      value={props.value}
      defaultValue={props.defaultValue}
      xChannel={props.xChannel}
      yChannel={props.yChannel}
      isDisabled={props.isDisabled}
      aria-label={props["aria-label"] ?? messages().colourArea}
      onChange={(color: Color) => props.onChange?.(colorValue(color))}
      onChangeEnd={(color: Color) => props.onChangeEnd?.(colorValue(color))}
    />
  );
}

export interface ColorSliderProps extends Customisable<
  Pick<ColorSlots, "slider" | "thumb" | "output">
> {
  /** @default "hue" */
  channel?: ColorChannel;
  value?: string;
  defaultValue?: string;
  isDisabled?: boolean;
  /** @default the channel's name in the locale */
  "aria-label"?: string;
  onChange?: (value: string) => void;
  onChangeEnd?: (value: string) => void;
}

/** One channel of a colour on a track: the hue, the alpha, the lightness. */
export function ColorSlider(props: ColorSliderProps) {
  const cls = () => parts(colorStyles(), props.classes);
  return (
    <AriaColorSlider
      class={arc(cls().slider, props.class, props.className)}
      thumbClass={cls().thumb}
      outputClass={cls().output}
      data-slot="color-slider"
      channel={props.channel ?? "hue"}
      value={props.value}
      defaultValue={props.defaultValue}
      isDisabled={props.isDisabled}
      aria-label={props["aria-label"]}
      onChange={(color: Color) => props.onChange?.(colorValue(color))}
      onChangeEnd={(color: Color) => props.onChangeEnd?.(colorValue(color))}
    />
  );
}

export const colorSwatchesStyles = variants({
  slots: {
    list: arc(plainList, layout.row, layout.wrap, gap[1.5]),
    item: arc(
      fg.default,
      rounded.md,
      focus.slot,
      focus.none,
      target.size,
      contrast.selected,
      layout.inlineCentre,
      {
        cursor: "pointer",
        "[data-selected]": {
          outlineStyle: "solid",
          outlineWidth: "2px",
          outlineOffset: "2px",
          outlineColor: "currentColor",
        },
        "[data-disabled]": { opacity: "40%", cursor: "not-allowed" },
      },
    ),
    swatch: arc({}),
  },
  variants: {
    size: {
      sm: { swatch: square.x4 },
      md: {},
      lg: { swatch: square.x8 },
    },
    shape: {
      square: {},
      circle: { item: rounded.full, swatch: rounded.full },
    },
  },
  defaults: { size: "md", shape: "square" },
});

type SwatchSlots = ReturnType<typeof colorSwatchesStyles>;

/** A colour in a set of swatches, with what to call it when its own name is not enough. */
export type SwatchColor = string | { color: string; label?: string };

function swatchOf(entry: SwatchColor): { color: string; label?: string } {
  return typeof entry === "string" ? { color: entry } : entry;
}

/** The same colour, however each was written. */
function sameColor(one: string | null | undefined, other: string): boolean {
  const first = readColor(one);
  const second = readColor(other);
  return first !== null && second !== null && first.toHexInt() === second.toHexInt();
}

interface SwatchListProps extends Customisable<SwatchSlots> {
  colors: readonly SwatchColor[];
  value: string | null;
  onChange: (value: string) => void;
  size?: "sm" | "md" | "lg";
  shape?: "square" | "circle";
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

/** The swatches as a listbox, a colour per option: what `ColorSwatches` and `ColorEditor` draw. */
function SwatchList(props: SwatchListProps) {
  const cls = () =>
    parts(colorSwatchesStyles({ size: props.size, shape: props.shape }), props.classes);
  const entries = () => props.colors.map(swatchOf);
  /** The chosen colour as one of the swatches' own spellings, so the swatch is the one selected. */
  const chosen = (): string | undefined => {
    const value = props.value;
    return entries().find((entry) => sameColor(value, entry.color))?.color ?? value ?? undefined;
  };
  return (
    <ColorSwatchPicker
      class={arc(cls().list, props.class, props.className)}
      data-slot="color-swatches"
      value={chosen()}
      aria-label={props["aria-label"]}
      aria-labelledby={props["aria-labelledby"]}
      aria-describedby={props["aria-describedby"]}
      onChange={(color: Color) => props.onChange(colorValue(color))}
    >
      <For each={entries()}>
        {(entry: { color: string; label?: string }) => (
          <ColorSwatchPickerItem
            class={cls().item}
            data-slot="color-swatches-item"
            color={entry.color}
            aria-label={entry.label}
          >
            <ColorSwatch
              class={arc(colorStyles().swatch, cls().swatch)}
              data-slot="color-swatch"
              color={entry.color}
            />
          </ColorSwatchPickerItem>
        )}
      </For>
    </ColorSwatchPicker>
  );
}

export interface ColorSwatchesProps
  extends
    Omit<ArcFieldProps, "classes" | "label">,
    FieldValueProps<string | null>,
    Customisable<SwatchSlots & FieldSlots> {
  /** Names the swatches above them. Without one, give `aria-label`. */
  label?: Child;
  "aria-label"?: string;
  colors: readonly SwatchColor[];
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  /** @default "square" */
  shape?: "square" | "circle";
}

/**
 * A colour picked from a set: a label's, a calendar's, a brand's.
 *
 * ```tsx
 * <ColorSwatches label="Colour" colors={["#e11d48", "#2563eb", { color: "#16a34a", label: "Go" }]} />
 * ```
 *
 * A listbox, so it is one Tab stop and the arrows move through it in the
 * reading direction. Each swatch is named by its colour in the locale's
 * words ("dark vibrant blue") unless given a label, and the chosen one is
 * ringed as well as selected, so it never rests on colour alone.
 */
export function ColorSwatches(props: ColorSwatchesProps) {
  const messages = useArcMessages();
  const of = bindField<string | null>(props, null);
  const cls = () => parts({ ...fieldStyles(), ...colorSwatchesStyles() }, props.classes);
  const list = () => (
    <SwatchList
      colors={props.colors}
      value={of.value()}
      size={props.size}
      shape={props.shape}
      class={props.label === undefined ? arc(props.class, props.className) : undefined}
      classes={{ list: cls().list, item: cls().item, swatch: cls().swatch }}
      aria-label={
        props.label === undefined ? (props["aria-label"] ?? messages().colourSwatches) : undefined
      }
      aria-labelledby={props.label === undefined ? undefined : of.ids.label}
      aria-describedby={of.describedBy(props.description !== undefined)}
      onChange={(value) => {
        of.change(value);
        of.blur();
      }}
    />
  );
  return (
    <Show when={props.label !== undefined} fallback={list()}>
      <Frame
        of={of}
        label={props.label}
        description={props.description}
        field={{ ...props, label: props.label, classes: props.classes }}
        labelledById
        slot="color-swatches-field"
      >
        {list()}
        <Show when={of.name() !== undefined}>
          <input type="hidden" name={of.name()} value={of.value() ?? ""} />
        </Show>
      </Frame>
    </Show>
  );
}

/** The browser's eye dropper, where there is one: Chromium on a desktop. */
interface EyeDropperApi {
  open(): Promise<{ sRGBHex: string }>;
}

function eyeDropper(): (new () => EyeDropperApi) | undefined {
  return typeof window === "undefined"
    ? undefined
    : (window as unknown as { EyeDropper?: new () => EyeDropperApi }).EyeDropper;
}

export const colorEditorStyles = variants({
  slots: {
    editor: arc(layout.column, gap[3], { width: "min(16rem, 100%)" }),
    area: arc({}),
    slider: arc({}),
    row: arc(layout.row, gap[1.5]),
    hex: arc(inputVariants(), type.mono, { textTransform: "uppercase" }),
    dropper: arc({}),
    swatches: arc({}),
  },
});

type EditorSlots = ReturnType<typeof colorEditorStyles>;

export interface ColorEditorProps extends Customisable<EditorSlots> {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** A slider for opacity, and a value written with it. @default false */
  alpha?: boolean;
  /** Colours offered under the editor. */
  swatches?: readonly SwatchColor[];
  isDisabled?: boolean;
}

/**
 * A colour edited every way at once: an area for saturation and brightness,
 * a hue slider, an alpha slider with `alpha`, a hex field, the screen's eye
 * dropper where the browser has one, and `swatches`.
 *
 * ```tsx
 * <ColorEditor value={brand()} onChange={setBrand} swatches={BRAND} />
 * ```
 *
 * Every control is the same colour, so dragging the area updates the hex as
 * it moves and typing a hex moves the area.
 */
export function ColorEditor(props: ColorEditorProps) {
  const messages = useArcMessages();
  const [own, setOwn] = createSignal(props.defaultValue ?? BLACK);
  const current = (): string => props.value ?? own();
  const change = (next: string): void => {
    if (props.value === undefined) setOwn(next);
    props.onChange?.(next);
  };
  const cls = () => parts(colorEditorStyles(), props.classes);
  const dropper = eyeDropper();
  const pick = (): void => {
    if (dropper === undefined) return;
    new dropper().open().then(
      (result) => change(result.sRGBHex),
      () => {},
    );
  };
  return (
    <AriaColorPicker
      class={arc(cls().editor, props.class, props.className)}
      data-slot="color-editor"
      value={current()}
      isDisabled={props.isDisabled}
      onChange={(color: Color) => change(colorValue(color))}
    >
      <ColorArea classes={{ area: cls().area }} />
      <ColorSlider channel="hue" classes={{ slider: cls().slider }} />
      <Show when={props.alpha === true}>
        <ColorSlider channel="alpha" classes={{ slider: cls().slider }} />
      </Show>
      <div class={cls().row} data-slot="color-editor-row">
        <AriaColorField
          class={cls().hex}
          data-slot="color-editor-hex"
          data-size="sm"
          aria-label={messages().hex}
          isDisabled={props.isDisabled}
        />
        <Show when={dropper !== undefined}>
          <Button
            class={cls().dropper}
            data-slot="color-editor-dropper"
            variant="outline"
            size="icon-sm"
            aria-label={messages().pickFromScreen}
            isDisabled={props.isDisabled}
            onPress={pick}
          >
            <Pipette aria-hidden="true" />
          </Button>
        </Show>
      </div>
      <Show when={(props.swatches?.length ?? 0) > 0}>
        <SwatchList
          colors={props.swatches ?? []}
          value={current()}
          size="sm"
          classes={{ list: cls().swatches }}
          aria-label={messages().colourSwatches}
          onChange={change}
        />
      </Show>
    </AriaColorPicker>
  );
}

/** The colour held, drawn beside it and hidden from assistive tech, which reads the value. */
function Chip(props: { class: string; color: string | null }) {
  const css = (): string => {
    const color = readColor(props.color);
    return color === null ? "transparent" : color.toString("css");
  };
  return (
    <span
      class={props.class}
      data-slot="color-chip"
      data-empty={readColor(props.color) === null ? "" : undefined}
      style={{ "background-color": css() }}
      aria-hidden="true"
    />
  );
}

export const colorFieldStyles = variants({
  slots: {
    control: arc(layout.relative, layout.fill),
    swatch: arc(place.middle, { insetInlineStart: space.x2, pointerEvents: "none" }),
    input: arc(inputVariants(), type.mono, { paddingInlineStart: space.x9 }),
    chip: arc(layout.noShrink),
    trigger: arc(layout.row, gap[2], { justifyContent: "flex-start", minWidth: "10rem" }),
    value: arc(truncate, type.mono),
    content: arc({ width: "auto", padding: space.x3 }),
  },
});

type FieldColorSlots = ReturnType<typeof colorFieldStyles> & FieldSlots;

export interface ColorFieldProps
  extends
    Omit<ArcFieldProps, "classes">,
    FieldValueProps<string | null>,
    Customisable<FieldColorSlots> {}

/**
 * A colour typed as hex, with a swatch of it at the start of the field.
 * Committed on Enter and when the field is left; the arrows step it.
 *
 * ```tsx
 * <ColorField label="Accent" value={accent()} onChange={setAccent} />
 * ```
 */
export function ColorField(props: ColorFieldProps) {
  const of = bindField<string | null>(props, null);
  const cls = () => parts({ ...fieldStyles(), ...colorFieldStyles() }, props.classes);
  return (
    <Frame
      of={of}
      label={props.label}
      description={props.description}
      field={props}
      slot="color-field"
    >
      <div class={cls().control} data-slot="color-field-control">
        <Chip class={arc(colorStyles().swatch, cls().swatch)} color={of.value()} />
        <AriaColorField
          id={of.ids.control}
          class={cls().input}
          data-slot="color-field-input"
          value={of.value()}
          name={of.name()}
          isDisabled={props.isDisabled}
          isRequired={props.isRequired}
          isInvalid={of.isInvalid()}
          aria-describedby={of.describedBy(props.description !== undefined)}
          onChange={(color: Color | null) => of.change(color === null ? null : colorValue(color))}
          onBlur={of.blur}
        />
      </div>
    </Frame>
  );
}

export interface ColorPickerProps
  extends Omit<ColorFieldProps, "classes">, Customisable<FieldColorSlots & EditorSlots> {
  /** What the button says with no colour held. @default the provider's `pickColour` */
  placeholder?: string;
  /** A slider for opacity. @default false */
  alpha?: boolean;
  /** Colours offered in the popover. */
  swatches?: readonly SwatchColor[];
}

/**
 * A colour as a button showing it, opening an editor: area, hue, hex, eye
 * dropper and `swatches`.
 *
 * ```tsx
 * <ColorPicker label="Brand" swatches={BRAND} value={brand()} onChange={setBrand} />
 * ```
 *
 * The button is named by the label and the colour it holds, so a screen
 * reader hears "Brand, #7F00FF".
 */
export function ColorPicker(props: ColorPickerProps) {
  const messages = useArcMessages();
  const of = bindField<string | null>(props, null);
  const [open, setOpen] = createSignal(false);
  const cls = () =>
    parts({ ...fieldStyles(), ...colorFieldStyles(), ...colorEditorStyles() }, props.classes);
  const shown = createMemo((): string | null => {
    const color = readColor(of.value());
    return color === null ? null : colorValue(color).toUpperCase();
  });
  return (
    <Frame
      of={of}
      label={props.label}
      description={props.description}
      field={props}
      labelledById
      slot="color-picker"
    >
      <Popover
        isOpen={open()}
        onOpenChange={(next: boolean) => {
          setOpen(next);
          if (!next) of.blur();
        }}
      >
        <PopoverTrigger>
          <Button
            id={of.ids.control}
            class={cls().trigger}
            data-slot="color-picker-trigger"
            variant="outline"
            isDisabled={props.isDisabled}
            aria-labelledby={`${of.ids.label} ${of.ids.control}`}
            aria-describedby={of.describedBy(props.description !== undefined)}
            aria-invalid={of.isInvalid() ? true : undefined}
          >
            <Chip class={arc(colorStyles().swatch, cls().chip)} color={of.value()} />
            <span class={cls().value} data-slot="color-picker-value">
              {shown() ?? props.placeholder ?? messages().pickColour}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          class={cls().content}
          data-slot="color-picker-content"
          placement="bottom start"
        >
          <ColorEditor
            value={of.value() ?? undefined}
            defaultValue={BLACK}
            alpha={props.alpha}
            swatches={props.swatches}
            classes={{ editor: cls().editor }}
            onChange={(value) => of.change(value)}
          />
        </PopoverContent>
      </Popover>
      <Show when={of.name() !== undefined}>
        <input type="hidden" name={of.name()} value={of.value() ?? ""} />
      </Show>
    </Frame>
  );
}
