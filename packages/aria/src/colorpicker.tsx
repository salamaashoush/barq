/**
 * Colour controls: an area, a slider, a wheel, a field and a swatch.
 *
 * A colour picker is several controls editing one value in different spaces,
 * and the accessibility of each rests on the same idea: a colour is not a
 * picture, it is NUMBERS, and every control has to say which number it is
 * moving and what it currently is.
 *
 * - **The area is two sliders in one element.** Dragging moves saturation and
 *   brightness at once, so it carries `role="application"` holding two
 *   `slider`s — one per axis — and the arrows move whichever axis they point
 *   along. A single slider cannot express two dimensions, and a canvas
 *   expresses none.
 * - **Every slider says its value in words.** "Saturation 62%" and, for the
 *   colour as a whole, a name: `aria-valuetext` on a hue slider reading "212"
 *   tells a screen reader user nothing, and "212 degrees, blue" tells them
 *   what they have.
 * - **The swatch is an image, not a button.** It shows a colour, and its
 *   `aria-label` is that colour's description — an unlabelled coloured square
 *   is invisible to anyone not looking at it.
 */

import {
  cells,
  type Accessor,
  type Child,
  createMemo,
  createContext,
  getContext,
  getOwner,
  install,
  createSignal,
} from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import {
  Color,
  defaultColor,
  parseColor,
  type ColorChannel,
  type ColorFormat,
  type ColorSpace,
} from "./color.ts";
import { useColorSwatchPickerItem } from "./colorswatchpicker.tsx";
import { focusWithoutScrolling } from "./dom.ts";
import { focusRing } from "./focus.ts";
import { numberFormatter, StringDictionary, stringFormatter, useLocale } from "./i18n.ts";
import { focusWithin } from "./interactions/focus-events.ts";
import { hover } from "./interactions/hover.ts";
import { globalListeners } from "./interactions/listeners.ts";
import { move, type MoveMoveEvent } from "./interactions/move.ts";
import type { ElementRef } from "./interactions/press.ts";
import { scrollWheel } from "./interactions/scroll-wheel.ts";
import { label as useLabelHook } from "./label.ts";
import { visuallyHidden } from "./live.ts";
import { spinButton } from "./numberfield.tsx";
import { formReset, HIDDEN_INPUT_STYLE } from "./toggle.ts";
import { textField, type TextFieldOptions } from "./textfield.tsx";
import {
  type FormValidationState,
  type ValidateFunction,
  type ValidationBehavior,
} from "./validation.ts";
import type { Orientation } from "./selection.ts";
import {
  access,
  callback,
  clamp,
  controllable,
  type DOMProps,
  filterDOMProps,
  fromProps,
  id,
  type MaybeAccessor,
  mergeProps,
  type StyleProps,
  styleProps,
} from "./utils.ts";

// ---------------------------------------------------------------------------
// The value itself
// ---------------------------------------------------------------------------

export interface ColorStateOptions {
  value?: MaybeAccessor<Color | string | null | undefined>;
  defaultValue?: MaybeAccessor<Color | string | null | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  onChange?: (value: Color) => void;
  /** Called once, when the gesture that changed the colour ends. */
  onChangeEnd?: (value: Color) => void;
}

function asColor(value: Color | string | null | undefined): Color | undefined {
  if (value === null || value === undefined) return undefined;
  return typeof value === "string" ? parseColor(value) : value;
}

/** A channel as words read it, in the locale in scope: "Hue 212", "Alpha 50%". */
function channelWords(): (color: Color, channel: ColorChannel) => string {
  const locale = useLocale();
  const decimal = numberFormatter();
  const percent = numberFormatter({ style: "percent", maximumFractionDigits: 0 });
  return (color, channel) => {
    const amount = color.getChannelValue(channel);
    const value =
      channel === "alpha" ? percent().format(amount) : decimal().format(Math.round(amount));
    return `${color.getChannelName(channel, locale().locale)} ${value}`;
  };
}

function message(
  format: Accessor<{ format(key: PickerStringKey): string }>,
  key: PickerStringKey,
  variables: Record<string, string> = {},
): string {
  return format()
    .format(key)
    .replace(/\{(\w+)\}/g, (whole, name: string) => variables[name] ?? whole);
}

// ---------------------------------------------------------------------------
// A single channel: the slider and the wheel
// ---------------------------------------------------------------------------

export interface ColorSliderStateOptions extends ColorStateOptions {
  channel: MaybeAccessor<ColorChannel>;
  /** @default "horizontal" */
  orientation?: MaybeAccessor<Orientation | undefined>;
}

export interface ColorSliderState {
  value: Accessor<Color>;
  setValue(value: Color): void;
  channel: Accessor<ColorChannel>;
  /** The channel's number, in its own units. */
  channelValue: Accessor<number>;
  setChannelValue(value: number): void;
  /** Where the thumb sits, 0 at the minimum and 1 at the maximum. */
  percent: Accessor<number>;
  setPercent(percent: number): void;
  isDragging: Accessor<boolean>;
  setDragging(isDragging: boolean): void;
  isDisabled: Accessor<boolean>;
  orientation: Accessor<Orientation>;
  increment(step?: number): void;
  decrement(step?: number): void;
  /** What the value is, in words. */
  valueText: Accessor<string>;
}

export function colorSliderState(options: ColorSliderStateOptions): ColorSliderState {
  const [value, setValueRaw] = controllable<Color>(
    () => asColor(access(options.value)),
    () => asColor(access(options.defaultValue)) ?? defaultColor(),
    options.onChange,
  );

  const [dragging, writeDragging] = createSignal(false);
  const channel = (): ColorChannel => access(options.channel);
  const isDisabled = (): boolean => access(options.isDisabled) === true;
  const locale = useLocale();
  const words = channelWords();

  // What the LAST write produced, so a drag reads its own change back rather
  // than the value a controlled owner has not caught up with yet. The drag
  // flag is kept the same way: a key press starts and ends a drag in one
  // tick, before the signal's write is published.
  let live = value();
  let isDragging = false;

  const setValue = (next: Color): void => {
    live = next;
    setValueRaw(next);
  };

  const range = (): ReturnType<Color["getChannelRange"]> => value().getChannelRange(channel());

  const setChannelValue = (next: number): void => {
    if (isDisabled()) return;
    setValue(live.withChannelValue(channel(), next));
  };

  return {
    value,
    setValue,
    channel,
    isDisabled,
    isDragging: dragging,
    orientation: () => access(options.orientation) ?? "horizontal",
    channelValue: () => value().getChannelValue(channel()),
    setChannelValue,
    percent: () => {
      const limits = range();
      return (
        (value().getChannelValue(channel()) - limits.minValue) / (limits.maxValue - limits.minValue)
      );
    },
    setPercent: (percent) => {
      const limits = range();
      const raw = limits.minValue + clamp(percent, 0, 1) * (limits.maxValue - limits.minValue);
      // Snapped to the step, so a drag lands on a value the arrows can reach.
      setChannelValue(Math.round(raw / limits.step) * limits.step);
    },
    setDragging: (next) => {
      const was = isDragging;
      isDragging = next;
      writeDragging(next);
      if (was && !next) options.onChangeEnd?.(live);
    },
    increment: (step) => setChannelValue(live.getChannelValue(channel()) + (step ?? range().step)),
    decrement: (step) => setChannelValue(live.getChannelValue(channel()) - (step ?? range().step)),
    valueText: () => {
      const current = value();
      const text = words(current, channel());
      if (channel() === "hue" || channel() === "alpha") return text;
      // The channel's number alone does not say what colour it made.
      return `${text}, ${current.withChannelValue("alpha", 1).getColorName(locale().locale)}`;
    },
  };
}

// ---------------------------------------------------------------------------
// Two channels at once: the area
// ---------------------------------------------------------------------------

export interface ColorAreaStateOptions extends ColorStateOptions {
  /** @default the colour's second channel */
  xChannel?: MaybeAccessor<ColorChannel | undefined>;
  /** @default the colour's third channel */
  yChannel?: MaybeAccessor<ColorChannel | undefined>;
}

export interface ColorAreaState {
  value: Accessor<Color>;
  setValue(value: Color): void;
  xChannel: Accessor<ColorChannel>;
  yChannel: Accessor<ColorChannel>;
  xValue: Accessor<number>;
  yValue: Accessor<number>;
  setXValue: (value: number) => void;
  setYValue: (value: number) => void;
  /** Where the thumb sits, 0 to 1 on each axis. `y` counts UP the element. */
  xPercent: Accessor<number>;
  yPercent: Accessor<number>;
  setPercents(x: number, y: number): void;
  isDragging: Accessor<boolean>;
  setDragging(isDragging: boolean): void;
  isDisabled: Accessor<boolean>;
  incrementX(step?: number): void;
  decrementX(step?: number): void;
  incrementY(step?: number): void;
  decrementY(step?: number): void;
  valueText: Accessor<string>;
}

export function colorAreaState(options: ColorAreaStateOptions): ColorAreaState {
  const [value, setValueRaw] = controllable<Color>(
    () => asColor(access(options.value)),
    () => asColor(access(options.defaultValue)) ?? defaultColor(),
    options.onChange,
  );

  const [dragging, writeDragging] = createSignal(false);
  const isDisabled = (): boolean => access(options.isDisabled) === true;
  const words = channelWords();

  let live = value();
  let isDragging = false;
  const setValue = (next: Color): void => {
    live = next;
    setValueRaw(next);
  };

  // The two channels that are not the first: saturation and brightness in
  // HSB, green and blue in RGB. The first is the one a hue slider or a red
  // slider edits alongside the area.
  const channels = (): [ColorChannel, ColorChannel] => {
    const [, second, third] = value().getColorChannels();
    return [second, third];
  };

  const xChannel = (): ColorChannel => access(options.xChannel) ?? channels()[0];
  const yChannel = (): ColorChannel => access(options.yChannel) ?? channels()[1];

  const percentOf = (channel: ColorChannel): number => {
    const limits = value().getChannelRange(channel);
    return (
      (value().getChannelValue(channel) - limits.minValue) / (limits.maxValue - limits.minValue)
    );
  };

  const set = (channel: ColorChannel, next: number): void => {
    if (isDisabled()) return;
    setValue(live.withChannelValue(channel, next));
  };

  const step = (channel: ColorChannel, by: number): void =>
    set(channel, live.getChannelValue(channel) + by);

  return {
    value,
    setValue,
    xChannel,
    yChannel,
    isDisabled,
    isDragging: dragging,
    xValue: () => value().getChannelValue(xChannel()),
    yValue: () => value().getChannelValue(yChannel()),
    setXValue: (next) => set(xChannel(), next),
    setYValue: (next) => set(yChannel(), next),
    xPercent: () => percentOf(xChannel()),
    yPercent: () => percentOf(yChannel()),
    setPercents: (x, y) => {
      if (isDisabled()) return;
      const xLimits = live.getChannelRange(xChannel());
      const yLimits = live.getChannelRange(yChannel());
      const xValue = xLimits.minValue + clamp(x, 0, 1) * (xLimits.maxValue - xLimits.minValue);
      const yValue = yLimits.minValue + clamp(y, 0, 1) * (yLimits.maxValue - yLimits.minValue);
      setValue(
        live
          .withChannelValue(xChannel(), Math.round(xValue / xLimits.step) * xLimits.step)
          .withChannelValue(yChannel(), Math.round(yValue / yLimits.step) * yLimits.step),
      );
    },
    setDragging: (next) => {
      const was = isDragging;
      isDragging = next;
      writeDragging(next);
      if (was && !next) options.onChangeEnd?.(live);
    },
    incrementX: (by) => step(xChannel(), by ?? live.getChannelRange(xChannel()).step),
    decrementX: (by) => step(xChannel(), -(by ?? live.getChannelRange(xChannel()).step)),
    incrementY: (by) => step(yChannel(), by ?? live.getChannelRange(yChannel()).step),
    decrementY: (by) => step(yChannel(), -(by ?? live.getChannelRange(yChannel()).step)),
    valueText: () => {
      const current = value();
      return `${words(current, xChannel())}, ${words(current, yChannel())}`;
    },
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface ColorSliderOptions {
  trackRef: ElementRef;
  inputRef: ElementRef<HTMLInputElement>;
  label?: MaybeAccessor<Child>;
  name?: MaybeAccessor<string | undefined>;
  form?: MaybeAccessor<string | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
}

export interface ColorSliderResult {
  labelProps: DOMProps;
  trackProps: DOMProps;
  thumbProps: DOMProps;
  /** For the visually hidden `<input type="range">` under the thumb. */
  inputProps: DOMProps;
  outputProps: DOMProps;
}

/**
 * One channel on a track.
 *
 * A real range input under the thumb, for the same reason a slider has one:
 * the keys, the form and the screen reader's rotor all come from the platform
 * rather than being reimplemented.
 */
export function colorSlider(
  options: ColorSliderOptions,
  state: ColorSliderState,
): ColorSliderResult {
  const inputId = id();
  const { labelProps, fieldProps } = useLabelHook({
    ...options,
    id: inputId,
    labelElementType: "label",
  });

  const locale = useLocale();
  const listeners = globalListeners();
  const isVertical = (): boolean => state.orientation() === "vertical";
  // Right to left, the minimum of a horizontal track is on the right.
  const isMirrored = (): boolean => !isVertical() && locale().direction === "rtl";
  let position: number | null = null;

  const range = (): ReturnType<Color["getChannelRange"]> =>
    state.value().getChannelRange(state.channel());

  // A press that never moves is still a change, and the release ends it.
  const endOnRelease = (element: Element): void => {
    if (isServer) return;
    listeners.add(element.ownerDocument.defaultView ?? window, "pointerup", () => {
      state.setDragging(false);
      listeners.removeAll();
    });
  };

  // A key press is a drag that starts and ends at once, so it ends the change.
  const byKeyboard = (change: () => void): void => {
    if (state.isDisabled()) return;
    state.setDragging(true);
    change();
    state.setDragging(false);
  };

  const { moveProps } = move({
    onMoveStart: () => {
      position = null;
      state.setDragging(true);
    },
    onMove: (event) => {
      if (event.pointerType === "keyboard") {
        const by = event.shiftKey ? range().pageSize : range().step;
        const lower =
          (event.deltaX > 0 && isMirrored()) ||
          (event.deltaX < 0 && !isMirrored()) ||
          event.deltaY > 0;
        if (lower) state.decrement(by);
        else state.increment(by);
        return;
      }

      const track = access(options.trackRef) as Element | null;
      if (track === null) return;
      const box = track.getBoundingClientRect();
      const size = isVertical() ? box.height : box.width;
      if (size === 0) return;

      if (position === null) position = state.percent() * size;
      // Up is MORE on a vertical track, and the y axis counts down.
      if (isVertical()) position -= event.deltaY;
      else position += isMirrored() ? -event.deltaX : event.deltaX;
      state.setPercent(position / size);
    },
    onMoveEnd: () => state.setDragging(false),
  });

  const onTrackDown = (clientX: number, clientY: number): void => {
    const track = access(options.trackRef) as Element | null;
    if (track === null || state.isDisabled()) return;
    const box = track.getBoundingClientRect();
    const size = isVertical() ? box.height : box.width;
    if (size === 0) return;
    const offset = (isVertical() ? clientY : clientX) - (isVertical() ? box.top : box.left);
    state.setDragging(true);
    state.setPercent(isVertical() || isMirrored() ? 1 - offset / size : offset / size);
    (access(options.inputRef) as HTMLInputElement | null)?.focus();
    endOnRelease(track);
  };

  const initial = state.channelValue();
  formReset(options.inputRef, initial, (next: number) => state.setChannelValue(next));

  return {
    labelProps,
    trackProps: mergeProps(moveProps, {
      onPointerDown: (event: PointerEvent) => {
        if (event.button !== 0) return;
        onTrackDown(event.clientX, event.clientY);
      },
      style: { position: "relative", "touch-action": "none" },
    }),
    thumbProps: {
      style: () => ({
        position: "absolute",
        [isVertical() ? "top" : "left"]:
          `${(isVertical() || isMirrored() ? 1 - state.percent() : state.percent()) * 100}%`,
        transform: "translate(-50%, -50%)",
        "touch-action": "none",
      }),
    },
    inputProps: mergeProps(fieldProps, {
      id: inputId,
      type: "range",
      min: () => range().minValue,
      max: () => range().maxValue,
      step: () => range().step,
      value: state.channelValue,
      disabled: state.isDisabled,
      name: () => access(options.name),
      form: () => access(options.form),
      "aria-orientation": state.orientation,
      // The number MEANS something: "212" is not a colour, "Hue 212" is.
      "aria-valuetext": state.valueText,
      onInput: (event: Event) => {
        state.setChannelValue(Number.parseFloat((event.target as HTMLInputElement).value));
      },
      onChange: (event: Event) => {
        state.setChannelValue(Number.parseFloat((event.target as HTMLInputElement).value));
      },
      onKeyDown: (event: KeyboardEvent) => {
        // Keys a range input either lacks or handles without ending the change.
        switch (event.key) {
          case "PageUp":
            byKeyboard(() => state.increment(range().pageSize));
            break;
          case "PageDown":
            byKeyboard(() => state.decrement(range().pageSize));
            break;
          case "Home":
            byKeyboard(() => state.setChannelValue(range().minValue));
            break;
          case "End":
            byKeyboard(() => state.setChannelValue(range().maxValue));
            break;
          default:
            return;
        }
        event.preventDefault();
      },
    }),
    outputProps: { "aria-live": "off", for: inputId },
  };
}

export interface ColorAreaOptions {
  containerRef: ElementRef;
  xInputRef: ElementRef<HTMLInputElement>;
  yInputRef: ElementRef<HTMLInputElement>;
  /** The form names the two channels are submitted under. */
  xName?: MaybeAccessor<string | undefined>;
  yName?: MaybeAccessor<string | undefined>;
  form?: MaybeAccessor<string | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
}

export interface ColorAreaResult {
  colorAreaProps: DOMProps;
  thumbProps: DOMProps;
  xInputProps: DOMProps;
  yInputProps: DOMProps;
}

/**
 * Two channels in one square.
 *
 * `role="application"` on the container, because the arrow keys inside it move
 * a thumb rather than the reading cursor, and a screen reader has to hand them
 * over. Inside are two real sliders, one per axis: that is what makes the
 * value reachable at all without a pointer.
 */
export function colorArea(options: ColorAreaOptions, state: ColorAreaState): ColorAreaResult {
  const listeners = globalListeners();
  const locale = useLocale();
  const strings = stringFormatter(PICKER_STRINGS);
  let position: { x: number; y: number } | null = null;

  // Right to left, X grows leftwards, as the text does.
  const isMirrored = (): boolean => locale().direction === "rtl";

  /**
   * Which axis the keyboard last moved, so a drag ends on the input that was
   * driving it.
   *
   * There are two `<input type="range">`s under a colour area, one per channel,
   * and only one can hold focus. Always returning to the X one loses a screen
   * reader user's place the moment they adjust Y: the reader announces the X
   * channel again and the arrows go back to moving X.
   */
  let axis: "x" | "y" = "x";

  const focusAxis = (): void => {
    const ref = axis === "y" ? options.yInputRef : options.xInputRef;
    (access(ref) as HTMLInputElement | null)?.focus();
  };

  const pageOf = (channel: ColorChannel): number => {
    const range = state.value().getChannelRange(channel);
    return Math.max(range.pageSize, range.step);
  };

  // A key press is a drag that starts and ends at once, so it ends the change.
  const byKeyboard = (moved: "x" | "y", change: () => void): void => {
    if (state.isDisabled()) return;
    state.setDragging(true);
    change();
    state.setDragging(false);
    axis = moved;
    focusAxis();
  };

  const { moveProps } = move({
    onMoveStart: () => {
      position = null;
      state.setDragging(true);
    },
    onMove: (event) => {
      if (event.pointerType === "keyboard") {
        const xStep = event.shiftKey ? pageOf(state.xChannel()) : undefined;
        const yStep = event.shiftKey ? pageOf(state.yChannel()) : undefined;
        const right = isMirrored() ? -event.deltaX : event.deltaX;
        if (right > 0) state.incrementX(xStep);
        else if (right < 0) state.decrementX(xStep);
        else if (event.deltaY > 0) state.decrementY(yStep);
        else if (event.deltaY < 0) state.incrementY(yStep);
        axis = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? "y" : "x";
        return;
      }

      const container = access(options.containerRef) as Element | null;
      if (container === null) return;
      const box = container.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;

      if (position === null) {
        position = { x: state.xPercent() * box.width, y: (1 - state.yPercent()) * box.height };
      }
      position.x += isMirrored() ? -event.deltaX : event.deltaX;
      position.y += event.deltaY;
      // The y axis counts DOWN the screen and UP the value.
      state.setPercents(position.x / box.width, 1 - position.y / box.height);
    },
    onMoveEnd: () => {
      state.setDragging(false);
      focusAxis();
    },
  });

  const onDown = (clientX: number, clientY: number): void => {
    const container = access(options.containerRef) as Element | null;
    if (container === null || state.isDisabled()) return;
    const box = container.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const x = (clientX - box.left) / box.width;
    state.setDragging(true);
    state.setPercents(isMirrored() ? 1 - x : x, 1 - (clientY - box.top) / box.height);
    // A pointer drives both channels at once, so it lands on X — which is what
    // a reader then announces, and what the arrows move next.
    axis = "x";
    focusAxis();
    if (isServer) return;
    const view = container.ownerDocument.defaultView ?? window;
    listeners.add(view, "pointerup", () => {
      state.setDragging(false);
      listeners.removeAll();
    });
  };

  formReset(options.xInputRef, state.value(), (next: Color) => state.setValue(next));

  const inputFor = (axisName: "x" | "y"): DOMProps => {
    const channel = axisName === "x" ? state.xChannel : state.yChannel;
    const read = axisName === "x" ? state.xValue : state.yValue;
    const write = axisName === "x" ? state.setXValue : state.setYValue;
    const range = (): ReturnType<Color["getChannelRange"]> =>
      state.value().getChannelRange(channel());

    return {
      type: "range",
      min: () => range().minValue,
      max: () => range().maxValue,
      step: () => range().step,
      value: read,
      disabled: state.isDisabled,
      name: () => access(axisName === "x" ? options.xName : options.yName),
      form: () => access(options.form),
      "aria-label": () => state.value().getChannelName(channel(), locale().locale),
      "aria-orientation": axisName === "x" ? "horizontal" : "vertical",
      // Both axes, on both inputs: a screen reader user moving one has to hear
      // what the other is, or the colour is half a description.
      "aria-valuetext": state.valueText,
      onFocus: () => {
        axis = axisName;
      },
      onInput: (event: Event) => {
        axis = axisName;
        write(Number.parseFloat((event.target as HTMLInputElement).value));
      },
      onChange: (event: Event) => {
        axis = axisName;
        write(Number.parseFloat((event.target as HTMLInputElement).value));
      },
    };
  };

  return {
    colorAreaProps: mergeProps(moveProps, {
      // The arrows belong to the thumb, not to the reading cursor.
      role: "application",
      "aria-label": () => access(options["aria-label"]) ?? message(strings, "colorPicker"),
      "aria-labelledby": () => access(options["aria-labelledby"]),
      "aria-roledescription": () => message(strings, "twoDimensionalSlider"),
      "aria-disabled": () => state.isDisabled() || undefined,
      onPointerDown: (event: PointerEvent) => {
        if (event.button !== 0) return;
        onDown(event.clientX, event.clientY);
      },
      onKeyDown: (event: KeyboardEvent) => {
        // Page Up and Down page Y; Home and End page X, towards the start and
        // the end of the line as the text runs.
        const toEnd = (by: number): void =>
          isMirrored() ? state.decrementX(by) : state.incrementX(by);
        const toStart = (by: number): void =>
          isMirrored() ? state.incrementX(by) : state.decrementX(by);
        switch (event.key) {
          case "PageUp":
            byKeyboard("y", () => state.incrementY(pageOf(state.yChannel())));
            break;
          case "PageDown":
            byKeyboard("y", () => state.decrementY(pageOf(state.yChannel())));
            break;
          case "Home":
            byKeyboard("x", () => toStart(pageOf(state.xChannel())));
            break;
          case "End":
            byKeyboard("x", () => toEnd(pageOf(state.xChannel())));
            break;
          default:
            return;
        }
        event.preventDefault();
      },
      style: { position: "relative", "touch-action": "none" },
    }),
    thumbProps: {
      style: () => ({
        position: "absolute",
        left: `${(isMirrored() ? 1 - state.xPercent() : state.xPercent()) * 100}%`,
        top: `${(1 - state.yPercent()) * 100}%`,
        transform: "translate(-50%, -50%)",
        "touch-action": "none",
      }),
    },
    xInputProps: inputFor("x"),
    yInputProps: inputFor("y"),
  };
}

// ---------------------------------------------------------------------------
// The hue on a circle: the wheel
// ---------------------------------------------------------------------------

/** Zero degrees is three o'clock, and the angle grows clockwise. */
function angleToCartesian(angle: number, radius: number): { x: number; y: number } {
  const radians = ((360 - angle + 90) * Math.PI) / 180;
  return { x: Math.sin(radians) * radius, y: Math.cos(radians) * radius };
}

function cartesianToAngle(x: number, y: number, radius: number): number {
  const degrees = (Math.atan2(y / radius, x / radius) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

/** A positive remainder, which `%` does not give for a negative left-hand side. */
function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

export interface ColorWheelStateOptions extends ColorStateOptions {}

export interface ColorWheelState {
  value: Accessor<Color>;
  setValue(value: Color): void;
  /** What a form reset goes back to. */
  defaultValue: Accessor<Color>;
  hue: Accessor<number>;
  setHue(hue: number): void;
  /** From a point relative to the CENTRE of the wheel. */
  setHueFromPoint(x: number, y: number, radius: number): void;
  /** Where the thumb sits, relative to the centre. */
  thumbPosition(radius: number): { x: number; y: number };
  increment(step?: number): void;
  decrement(step?: number): void;
  step: Accessor<number>;
  pageStep: Accessor<number>;
  isDragging: Accessor<boolean>;
  setDragging(isDragging: boolean): void;
  isDisabled: Accessor<boolean>;
}

/**
 * The hue of a colour, as an angle.
 *
 * Hue is the one channel that WRAPS: 359 and 1 are two degrees apart, and a
 * slider cannot say that. Everything here follows from it — incrementing past
 * 360 lands on 0 rather than stopping, and decrementing from 0 goes to the
 * last step below 360 rather than to −1.
 *
 * The value is kept in HSL or HSB, because RGB has no hue to turn.
 */
export function colorWheelState(options: ColorWheelStateOptions = {}): ColorWheelState {
  const [raw, setRaw] = controllable<Color>(
    () => asColor(access(options.value)),
    () => asColor(access(options.defaultValue)) ?? parseColor("hsl(0, 100%, 50%)"),
    options.onChange,
  );

  const value = (): Color => {
    const current = raw();
    const space = current.getColorSpace();
    return space === "hsl" || space === "hsb" ? current : current.toFormat("hsl");
  };

  // Read once: a form reset goes back to where the wheel STARTED, not to
  // wherever the caller's default happens to point by then.
  const initial = value();

  const [dragging, writeDragging] = createSignal(false);
  const isDisabled = (): boolean => access(options.isDisabled) === true;

  // What the LAST write produced, so a drag reads its own change back rather
  // than the value a controlled owner has not caught up with yet.
  let live = value();
  let isDragging = false;

  const setValue = (next: Color): void => {
    live = next;
    setRaw(next);
  };

  const range = (): ReturnType<Color["getChannelRange"]> => value().getChannelRange("hue");
  const step = (): number => range().step;
  const pageStep = (): number => range().pageSize ?? Math.max(step(), 15);

  const hue = (): number => value().getChannelValue("hue");

  const setHue = (next: number): void => {
    if (isDisabled()) return;
    // 360 is 0. Without this the wheel has a value the user can reach going up
    // and never going down.
    const wrapped = next > 360 ? 0 : next;
    const snapped = Math.round(mod(wrapped, 360) / step()) * step();
    if (hue() === snapped) return;
    setValue(live.withChannelValue("hue", snapped));
  };

  return {
    value,
    setValue,
    defaultValue: () => initial,
    hue,
    setHue,
    setHueFromPoint: (x, y, radius) => setHue(cartesianToAngle(x, y, radius)),
    thumbPosition: (radius) => angleToCartesian(hue(), radius),
    step,
    pageStep,
    isDragging: dragging,
    isDisabled,
    setDragging: (next) => {
      const was = isDragging;
      isDragging = next;
      writeDragging(next);
      if (was && !next) options.onChangeEnd?.(live);
    },
    increment: (amount) => {
      const by = Math.max(amount ?? 1, step());
      const next = hue() + by;
      // Past the top is back to the bottom, so the wheel turns rather than
      // stopping at a seam the user cannot see.
      setHue(next >= range().maxValue ? range().minValue : mod(next, 360));
    },
    decrement: (amount) => {
      const by = Math.max(amount ?? 1, step());
      if (hue() !== 0) {
        setHue(mod(hue() - by, 360));
        return;
      }
      // Below zero is the last step under 360. Subtracting `by` would land on
      // a negative, and `mod` would bring it back to something that is not on
      // the step grid.
      const top = 360 / by;
      setHue((Number.isInteger(top) ? top - 1 : Math.floor(top)) * by);
    },
  };
}

export interface ColorWheelOptions {
  /** The wheel element, for turning a pointer position into an angle. */
  trackRef: ElementRef;
  inputRef: ElementRef<HTMLInputElement>;
  /** The hole in the middle. A press inside it is not a press on the track. */
  innerRadius: MaybeAccessor<number>;
  outerRadius: MaybeAccessor<number>;
  // No `isDisabled`: the STATE carries it, and a second copy here would be a
  // flag a caller could set and watch do nothing.
  name?: MaybeAccessor<string | undefined>;
  form?: MaybeAccessor<string | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
}

export interface ColorWheelResult {
  trackProps: DOMProps;
  thumbProps: DOMProps;
  /** A real `<input type="range">`, hidden, which is what the platform drives. */
  inputProps: DOMProps;
}

/**
 * A circular hue picker.
 *
 * The control is a real `<input type="range">` under the visuals, hidden but
 * focusable, exactly as the sliders here are: it is what a screen reader
 * announces, what the platform's own arrow handling drives, and what a form
 * submits. The circle is decoration over it.
 *
 * A press lands on the track only between the two radii. The hole in the
 * middle usually holds a colour area, and a press there belongs to that.
 */
export function colorWheel(options: ColorWheelOptions, state: ColorWheelState): ColorWheelResult {
  const inputId = id();
  const locale = useLocale();
  const words = channelWords();
  const listeners = globalListeners();
  const thumbRadius = (): number => (access(options.innerRadius) + access(options.outerRadius)) / 2;

  const focusInput = (): void => {
    const input = access(options.inputRef) as HTMLInputElement | null;
    if (input !== null) focusWithoutScrolling(input);
  };

  formReset(options.inputRef, state.defaultValue, (next: Color) => state.setValue(next));

  /** Where the drag is, in wheel coordinates, accumulated across the move. */
  let at: { x: number; y: number } | null = null;
  /** Whether the press that started this drag landed on the ring. */
  let onTrack = false;

  const beginDrag = (): void => {
    at = null;
    state.setDragging(true);
  };

  const drag = (event: MoveMoveEvent): void => {
    at ??= state.thumbPosition(thumbRadius());
    at.x += event.deltaX;
    at.y += event.deltaY;

    if (event.pointerType === "keyboard") {
      // Right and up are more; left and down are less. The wheel has no axis,
      // so both pairs mean the same thing.
      if (event.deltaX > 0 || event.deltaY < 0) {
        state.increment(event.shiftKey ? state.pageStep() : state.step());
      } else if (event.deltaX < 0 || event.deltaY > 0) {
        state.decrement(event.shiftKey ? state.pageStep() : state.step());
      }
      return;
    }
    state.setHueFromPoint(at.x, at.y, thumbRadius());
  };

  const endDrag = (): void => {
    onTrack = false;
    state.setDragging(false);
    focusInput();
  };

  const { moveProps: thumbMoveProps } = move({
    onMoveStart: beginDrag,
    onMove: drag,
    onMoveEnd: endDrag,
  });

  // The same handlers on the CONTAINER, but only once a press has landed on
  // the ring: a drag that began in the hole is not this wheel's.
  const { moveProps: trackMoveProps } = move({
    onMoveStart: () => {
      if (onTrack) beginDrag();
    },
    onMove: (event) => {
      if (onTrack) drag(event);
    },
    onMoveEnd: () => {
      if (onTrack) endDrag();
    },
  });

  const onTrackDown = (clientX: number, clientY: number): void => {
    const track = access(options.trackRef) as Element | null;
    if (track === null || state.isDisabled()) return;

    const box = track.getBoundingClientRect();
    const x = clientX - box.x - box.width / 2;
    const y = clientY - box.y - box.height / 2;
    const radius = Math.hypot(x, y);

    // Between the two radii and nowhere else: the hole belongs to whatever is
    // in it, and outside the ring is the page.
    if (radius <= access(options.innerRadius) || radius >= access(options.outerRadius)) return;

    onTrack = true;
    state.setHueFromPoint(x, y, radius);
    focusInput();
    state.setDragging(true);
    if (isServer) return;
    // A press that never moves is still a change, and the release ends it.
    listeners.add(track.ownerDocument.defaultView ?? window, "pointerup", () => {
      onTrack = false;
      state.setDragging(false);
      listeners.removeAll();
    });
  };

  return {
    trackProps: mergeProps(trackMoveProps, {
      onPointerDown: (event: PointerEvent) => {
        if (event.button !== 0) return;
        onTrackDown(event.clientX, event.clientY);
      },
      style: { position: "relative", "touch-action": "none" },
    }),
    thumbProps: mergeProps(thumbMoveProps, {
      style: () => {
        const position = state.thumbPosition(thumbRadius());
        return {
          position: "absolute",
          left: `${position.x + access(options.outerRadius)}px`,
          top: `${position.y + access(options.outerRadius)}px`,
          transform: "translate(-50%, -50%)",
          "touch-action": "none",
        };
      },
      onPointerDown: () => {
        if (state.isDisabled()) return;
        focusInput();
      },
    }),
    inputProps: {
      id: inputId,
      type: "range",
      min: 0,
      max: 360,
      step: state.step,
      value: state.hue,
      disabled: state.isDisabled,
      name: () => access(options.name),
      form: () => access(options.form),
      "aria-label": () =>
        access(options["aria-label"]) ?? state.value().getChannelName("hue", locale().locale),
      "aria-labelledby": () => access(options["aria-labelledby"]),
      // The number MEANS something: "212" is not a colour, "Hue 212" is.
      "aria-valuetext": () => words(state.value(), "hue"),
      style: HIDDEN_INPUT_STYLE,
      onInput: (event: Event) => {
        state.setHue(Number.parseFloat((event.target as HTMLInputElement).value));
      },
      onChange: (event: Event) => {
        state.setHue(Number.parseFloat((event.target as HTMLInputElement).value));
      },
      onKeyDown: (event: KeyboardEvent) => {
        // Page Up and Page Down, which a range input has no notion of.
        if (event.key !== "PageUp" && event.key !== "PageDown") return;
        event.preventDefault();
        state.setDragging(true);
        if (event.key === "PageUp") state.increment(state.pageStep());
        else state.decrement(state.pageStep());
        state.setDragging(false);
      },
    },
  };
}

export interface ColorFieldOptions extends Omit<
  TextFieldOptions,
  "value" | "onChange" | "type" | "validate"
> {
  /** @default "hex" */
  format?: MaybeAccessor<ColorFormat | undefined>;
  /**
   * What the page thinks of the COLOUR, checked as it is committed.
   *
   * The colour rather than the typed text: "#ff" is a prefix, not a colour,
   * and a validator handed one has nothing to say about it. An empty field has
   * no colour, and is not handed over.
   */
  validate?: ValidateFunction<Color>;
  /** Stop the scroll wheel stepping the colour. @default false */
  isWheelDisabled?: MaybeAccessor<boolean | undefined>;
}

export interface ColorFieldResult {
  labelProps: DOMProps;
  inputProps: DOMProps;
  descriptionProps: DOMProps;
  errorMessageProps: DOMProps;
  /** What is wrong with the colour, and whether the user is being told. */
  validation: FormValidationState;
  errors: Accessor<string[]>;
  isInvalid: Accessor<boolean>;
}

const BLACK = 0x000000;
const WHITE = 0xffffff;

function fromHexInt(value: number): Color {
  return parseColor(`#${value.toString(16).padStart(6, "0")}`);
}

/** What was typed, as a colour, or null. Hex may be typed without its `#`. */
function readColor(text: string): Color | null {
  const trimmed = text.trim();
  for (const candidate of [trimmed, `#${trimmed}`]) {
    try {
      return parseColor(candidate);
    } catch {
      // Not this reading; the next, or none.
    }
  }
  return null;
}

/**
 * A colour as text.
 *
 * Committed on blur and on Enter, never as you type: "#ff" is not a colour,
 * and a field that reported one on every keystroke would flash the page
 * through every prefix of what was typed. The arrows, Page Up and Down, and the
 * wheel step it through the 24-bit colours one at a time; Home and End go to
 * black and to white. Emptied and committed, it holds no colour at all.
 */
export function colorField(
  options: ColorFieldOptions,
  state: {
    value: Accessor<Color | null>;
    setValue(value: Color | null): void;
    isDisabled: Accessor<boolean>;
  },
  ref: ElementRef<HTMLInputElement>,
): ColorFieldResult {
  const format = (): ColorFormat => access(options.format) ?? "hex";
  const show = (color: Color | null): string => color?.toString(format()) ?? "";
  // Bumped on every commit, so the text is re-seeded from the colour even when
  // the colour did not move: a controlled field refusing the edit, or text
  // that was not a colour, both go back to what the field holds.
  const [commits, setCommits] = createSignal(0);
  const [text, writeText] = createSignal(() => {
    commits();
    return show(state.value());
  });

  // What was typed since the last commit. Enter commits in the same tick as
  // the keystroke that produced the text, and a signal write is not published
  // until the flush, so `text()` would hand the parser the value the typing
  // replaced.
  let typed: string | null = null;
  const setText = (next: string): void => {
    typed = next;
    writeText(next);
  };
  const current = (): string => typed ?? text();

  const put = (next: Color | null): void => {
    typed = null;
    setCommits((count) => count + 1);
    const held = state.value();
    const same = next === null ? held === null : held !== null && next.isEqual(held);
    if (!same) state.setValue(next);
  };

  const commit = (): void => {
    const entered = current();
    if (entered.trim() === "") {
      put(null);
      return;
    }
    put(readColor(entered) ?? state.value());
  };

  const stepTo = (target: (from: number) => number): void => {
    const from = (readColor(current()) ?? fromHexInt(BLACK)).toHexInt();
    put(fromHexInt(Math.min(Math.max(target(from), BLACK), WHITE)));
    validation.commitValidation();
  };

  const isReadOnly = (): boolean => access(options.isReadOnly) === true;

  const {
    labelProps,
    inputProps,
    descriptionProps,
    errorMessageProps,
    validation,
    errors,
    isInvalid,
  } = textField(
    {
      ...options,
      type: "text",
      value: text,
      // The caller validates the COLOUR; `textField` validates a string, so
      // the typed text is ignored and the committed value is handed over.
      validate:
        options.validate === undefined
          ? undefined
          : () => {
              const held = state.value();
              return held === null ? null : (options.validate as ValidateFunction<Color>)(held);
            },
      onChange: setText,
      autoComplete: "off",
    },
    ref,
  );

  const { spinButtonProps } = spinButton({
    isDisabled: state.isDisabled,
    isReadOnly,
    minValue: BLACK,
    maxValue: WHITE,
    value: () => state.value()?.toHexInt(),
    textValue: () => state.value()?.toString("hex"),
    onIncrement: () => stepTo((from) => from + 1),
    onDecrement: () => stepTo((from) => from - 1),
    onIncrementToMax: () => stepTo(() => WHITE),
    onDecrementToMin: () => stepTo(() => BLACK),
  });

  const { focusWithinProps, isFocusWithin } = focusWithin({ isDisabled: state.isDisabled });

  scrollWheel({
    ref,
    isDisabled: () =>
      access(options.isWheelDisabled) === true ||
      state.isDisabled() ||
      isReadOnly() ||
      !isFocusWithin(),
    onScroll: (delta) => {
      // Mostly sideways is a trackpad scrolling the page, not this field.
      if (Math.abs(delta.deltaY) <= Math.abs(delta.deltaX)) return;
      if (delta.deltaY > 0) stepTo((from) => from + 1);
      else stepTo((from) => from - 1);
    },
  });

  return {
    labelProps,
    descriptionProps,
    errorMessageProps,
    validation,
    errors,
    isInvalid,
    inputProps: mergeProps(inputProps, spinButtonProps, focusWithinProps, {
      autocorrect: "off",
      spellcheck: "false",
      onBlur: () => {
        commit();
        validation.commitValidation();
      },
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key !== "Enter") return;
        commit();
      },
    }),
  };
}

export interface ColorSwatchOptions {
  color: MaybeAccessor<Color | string>;
  /** What to call it. Defaults to the colour's own description. */
  "aria-label"?: MaybeAccessor<string | undefined>;
}

export interface ColorSwatchResult {
  swatchProps: DOMProps;
  color: Accessor<Color>;
}

/** A square of colour, named so it is not invisible to a screen reader. */
export function colorSwatch(options: ColorSwatchOptions): ColorSwatchResult {
  const color = createMemo(() => {
    const given = access(options.color);
    return typeof given === "string" ? parseColor(given) : given;
  });

  const locale = useLocale();
  const strings = stringFormatter(PICKER_STRINGS);
  const degrees = numberFormatter({ style: "unit", unit: "degree", unitDisplay: "long" });
  const percent = numberFormatter({ style: "percent" });

  const description = (): string => {
    const current = color();
    if (current.alpha === 0) return message(strings, "transparent");
    const hsl = current.toFormat("hsl");
    const share = (channel: ColorChannel): string =>
      percent().format(Math.round(hsl.getChannelValue(channel)) / 100);
    return message(strings, "colorSwatchDescription", {
      hue: degrees().format(Math.round(hsl.getChannelValue("hue"))),
      saturation: share("saturation"),
      lightness: share("lightness"),
      name: current.getColorName(locale().locale),
    });
  };

  return {
    color,
    swatchProps: {
      // An image, not a button: it SHOWS a colour and does nothing.
      role: "img",
      "aria-roledescription": () => message(strings, "colorSwatch"),
      "aria-label": () => access(options["aria-label"]) ?? description(),
      style: () => ({ "background-color": color().toString("css") }),
    },
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface ColorPickerContextValue {
  value: Accessor<Color>;
  setValue(value: Color): void;
  isDisabled: Accessor<boolean>;
}

const ColorPickerContext = createContext<ColorPickerContextValue | null>(null);

/** The enclosing {@link ColorPicker}, if there is one. */
export function useColorPicker(): ColorPickerContextValue | null {
  return getContext(ColorPickerContext) ?? null;
}

export interface ColorPickerComponentProps extends StyleProps {
  children?: Child;
  value?: Color | string;
  defaultValue?: Color | string;
  isDisabled?: boolean;
  onChange?: (value: Color) => void;
}

/**
 * One colour, shared by every control inside.
 *
 * ```tsx
 * <ColorPicker defaultValue="#7f00ff">
 *   <ColorArea />
 *   <ColorSlider channel="hue" />
 *   <ColorSlider channel="alpha" />
 *   <ColorField label="Hex" />
 * </ColorPicker>
 * ```
 */
export function ColorPicker(props: ColorPickerComponentProps) {
  const [value, setValue] = controllable<Color>(
    () => asColor(props.value),
    () => asColor(props.defaultValue) ?? defaultColor(),
    (next) => props.onChange?.(next),
  );

  const owner = getOwner();
  if (owner !== null) {
    install(owner, ColorPickerContext, () => ({
      value,
      setValue,
      isDisabled: () => props.isDisabled === true,
    }));
  }

  const elementProps = mergeProps(
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    {
      "data-testid": () => props["data-testid"],
    },
  );

  return <div {...elementProps}>{props.children}</div>;
}

export interface ColorSliderComponentProps extends StyleProps {
  channel: ColorChannel;
  label?: Child;
  value?: Color | string;
  defaultValue?: Color | string;
  /** @default "horizontal" */
  orientation?: Orientation;
  isDisabled?: boolean;
  /** The form name the channel's value is submitted under. */
  name?: string;
  form?: string;
  "aria-label"?: string;
  ref?: RefTarget<HTMLDivElement>;
  onChange?: (value: Color) => void;
  onChangeEnd?: (value: Color) => void;
}

/** One channel on a track: a hue, an alpha, a red. */
export function ColorSlider(props: ColorSliderComponentProps) {
  const trackRef = makeRef<HTMLDivElement>();
  const inputRef = makeRef<HTMLInputElement>();
  const picker = useColorPicker();
  const locale = useLocale();

  const state = colorSliderState({
    channel: () => props.channel,
    orientation: () => props.orientation,
    value: () => props.value ?? picker?.value(),
    defaultValue: () => props.defaultValue,
    isDisabled: () => props.isDisabled ?? picker?.isDisabled(),
    onChange: (value) => {
      picker?.setValue(value);
      props.onChange?.(value);
    },
    onChangeEnd: (value) => props.onChangeEnd?.(value),
  });

  const { labelProps, trackProps, thumbProps, inputProps, outputProps } = colorSlider(
    {
      trackRef,
      inputRef,
      label: () => props.label,
      name: () => props.name,
      form: () => props.form,
      "aria-label": () =>
        props["aria-label"] ??
        (props.label === undefined
          ? state.value().getChannelName(props.channel, locale().locale)
          : undefined),
    },
    state,
  );

  const { visuallyHiddenProps } = visuallyHidden();
  const { focusProps, isFocused, isFocusVisible } = focusRing();
  const { hoverProps, isHovered } = hover({ isDisabled: state.isDisabled });

  const elementProps = mergeProps(
    trackProps,
    hoverProps,
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    {
      "data-orientation": state.orientation,
      "data-dragging": state.isDragging,
      "data-disabled": state.isDisabled,
      "data-testid": () => props["data-testid"],
    },
  );

  return (
    <>
      {() => (props.label === undefined ? null : <label {...labelProps}>{props.label}</label>)}
      <output {...outputProps}>{() => state.valueText()}</output>
      <div {...elementProps} ref={mergeRefs(trackRef.set, props.ref)}>
        <div
          {...mergeProps(thumbProps, {
            "data-focused": isFocused,
            "data-focus-visible": isFocusVisible,
            "data-hovered": isHovered,
            "data-dragging": state.isDragging,
            "data-disabled": state.isDisabled,
          })}
        >
          <input
            {...mergeProps(inputProps, focusProps, { style: visuallyHiddenProps.style })}
            ref={inputRef.set}
          />
        </div>
      </div>
    </>
  );
}

export interface ColorAreaComponentProps extends StyleProps {
  value?: Color | string;
  defaultValue?: Color | string;
  xChannel?: ColorChannel;
  yChannel?: ColorChannel;
  isDisabled?: boolean;
  /** The form names the two channels are submitted under. */
  xName?: string;
  yName?: string;
  form?: string;
  "aria-label"?: string;
  ref?: RefTarget<HTMLDivElement>;
  onChange?: (value: Color) => void;
  onChangeEnd?: (value: Color) => void;
}

/** Two channels in a square: saturation across, brightness up. */
export function ColorArea(props: ColorAreaComponentProps) {
  const containerRef = makeRef<HTMLDivElement>();
  const xInputRef = makeRef<HTMLInputElement>();
  const yInputRef = makeRef<HTMLInputElement>();
  const picker = useColorPicker();

  const state = colorAreaState({
    value: () => props.value ?? picker?.value(),
    defaultValue: () => props.defaultValue,
    xChannel: () => props.xChannel,
    yChannel: () => props.yChannel,
    isDisabled: () => props.isDisabled ?? picker?.isDisabled(),
    onChange: (value) => {
      picker?.setValue(value);
      props.onChange?.(value);
    },
    onChangeEnd: (value) => props.onChangeEnd?.(value),
  });

  const { colorAreaProps, thumbProps, xInputProps, yInputProps } = colorArea(
    {
      containerRef,
      xInputRef,
      yInputRef,
      xName: () => props.xName,
      yName: () => props.yName,
      form: () => props.form,
      "aria-label": () => props["aria-label"],
    },
    state,
  );

  const { visuallyHiddenProps } = visuallyHidden();
  // One ring for both inputs: the thumb is one thing, whichever axis has focus.
  const { focusProps, isFocused, isFocusVisible } = focusRing();

  const elementProps = mergeProps(
    colorAreaProps,
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    {
      "data-dragging": state.isDragging,
      "data-disabled": state.isDisabled,
      "data-testid": () => props["data-testid"],
    },
  );

  return (
    <div {...elementProps} ref={mergeRefs(containerRef.set, props.ref)}>
      <div
        {...mergeProps(thumbProps, {
          "data-focused": isFocused,
          "data-focus-visible": isFocusVisible,
          "data-dragging": state.isDragging,
          "data-disabled": state.isDisabled,
        })}
      >
        <input
          {...mergeProps(xInputProps, focusProps, { style: visuallyHiddenProps.style })}
          ref={xInputRef.set}
        />
        <input
          {...mergeProps(yInputProps, focusProps, { style: visuallyHiddenProps.style })}
          ref={yInputRef.set}
        />
      </div>
    </div>
  );
}

export interface ColorWheelComponentProps extends StyleProps {
  value?: Color | string;
  defaultValue?: Color | string;
  /** The hole in the middle, in pixels. @default 64 */
  innerRadius?: number;
  /** The wheel's radius, in pixels. @default 80 */
  outerRadius?: number;
  isDisabled?: boolean;
  name?: string;
  form?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  ref?: RefTarget<HTMLDivElement>;
  onChange?: (value: Color) => void;
  onChangeEnd?: (value: Color) => void;
}

/**
 * ```tsx
 * <ColorWheel defaultValue="hsl(30, 100%, 50%)" onChange={(c) => colour.set(c)} />
 * ```
 *
 * The hue on a circle. The conic gradient that makes it look like a wheel is
 * the caller's to style; what is here is the geometry, the keyboard and the
 * hidden `<input type="range">` a screen reader announces.
 */
export function ColorWheel(props: ColorWheelComponentProps) {
  const trackRef = makeRef<HTMLDivElement>();
  const inputRef = makeRef<HTMLInputElement>();
  const picker = useColorPicker();

  const state = colorWheelState({
    value: () => props.value ?? picker?.value(),
    defaultValue: () => props.defaultValue,
    isDisabled: () => props.isDisabled ?? picker?.isDisabled(),
    onChange: (value) => {
      picker?.setValue(value);
      props.onChange?.(value);
    },
    onChangeEnd: (value) => props.onChangeEnd?.(value),
  });

  const outerRadius = (): number => props.outerRadius ?? 80;
  const innerRadius = (): number => props.innerRadius ?? 64;

  const { trackProps, thumbProps, inputProps } = colorWheel(
    {
      trackRef,
      inputRef,
      innerRadius,
      outerRadius,
      name: () => props.name,
      form: () => props.form,
      "aria-label": () => props["aria-label"],
      "aria-labelledby": () => props["aria-labelledby"],
    },
    state,
  );

  const { focusProps, isFocused, isFocusVisible } = focusRing();
  const { hoverProps, isHovered } = hover({ isDisabled: state.isDisabled });

  const elementProps = mergeProps(
    trackProps,
    hoverProps,
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    {
      "data-dragging": state.isDragging,
      "data-disabled": state.isDisabled,
      "data-testid": () => props["data-testid"],
      style: () => ({
        position: "relative",
        "touch-action": "none",
        width: `${outerRadius() * 2}px`,
        height: `${outerRadius() * 2}px`,
      }),
    },
  );

  return (
    <div {...elementProps} ref={mergeRefs(trackRef.set, props.ref)}>
      <div
        {...mergeProps(thumbProps, {
          "data-focused": isFocused,
          "data-focus-visible": isFocusVisible,
          "data-hovered": isHovered,
          "data-dragging": state.isDragging,
          "data-disabled": state.isDisabled,
        })}
      >
        <input {...mergeProps(inputProps, focusProps)} ref={inputRef.set} />
      </div>
    </div>
  );
}

export interface ColorFieldComponentProps extends StyleProps {
  label?: Child;
  description?: Child;
  errorMessage?: Child;
  /** Null is an empty field: no colour at all. */
  value?: Color | string | null;
  defaultValue?: Color | string | null;
  /** @default "hex" */
  format?: ColorFormat;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  isInvalid?: boolean;
  /** What the page thinks of the colour, checked as it is committed. */
  validate?: ValidateFunction<Color>;
  /** @default "aria" */
  validationBehavior?: ValidationBehavior;
  /** Stop the scroll wheel stepping the colour. @default false */
  isWheelDisabled?: boolean;
  name?: string;
  "aria-label"?: string;
  ref?: RefTarget<HTMLInputElement>;
  /** Called with null when the field is emptied. */
  onChange?: (value: Color | null) => void;
}

/** A colour as text: `#7f00ff`, committed on blur and on Enter. */
export function ColorField(props: ColorFieldComponentProps) {
  const domRef = makeRef<HTMLInputElement>();
  const picker = useColorPicker();

  const [value, setValue] = controllable<Color | null>(
    () => (props.value === null ? null : (asColor(props.value) ?? picker?.value())),
    () => asColor(props.defaultValue) ?? null,
    (next) => {
      // A picker always holds a colour, so emptying a field inside one leaves
      // the picker's colour where it was and the field goes back to it.
      if (next !== null) picker?.setValue(next);
      props.onChange?.(next);
    },
  );

  const state = {
    value,
    setValue,
    isDisabled: (): boolean => props.isDisabled ?? picker?.isDisabled() ?? false,
  };

  const { labelProps, inputProps, descriptionProps, errorMessageProps, errors, isInvalid } =
    colorField(
      {
        label: () => props.label,
        description: () => props.description,
        errorMessage: () => props.errorMessage,
        format: () => props.format,
        isDisabled: state.isDisabled,
        isReadOnly: () => props.isReadOnly,
        isRequired: () => props.isRequired,
        isInvalid: () => props.isInvalid,
        validate: callback<[Color], string | string[] | true | null | undefined>(
          cells(props).validate,
        ),
        validationBehavior: () => props.validationBehavior,
        isWheelDisabled: () => props.isWheelDisabled,
        name: () => props.name,
        "aria-label": () => props["aria-label"],
      },
      state,
      domRef,
    );

  const { focusProps, isFocusVisible } = focusRing();

  const elementProps = mergeProps(
    inputProps,
    focusProps,
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    {
      "data-focus-visible": isFocusVisible,
      "data-invalid": isInvalid,
      "data-testid": () => props["data-testid"],
    },
  );

  return (
    <>
      <label {...labelProps}>{props.label}</label>
      <input {...elementProps} ref={mergeRefs(domRef.set, props.ref)} />
      <span {...descriptionProps}>{props.description}</span>
      <span {...errorMessageProps}>
        {() => {
          const given = props.errorMessage;
          if (given !== undefined && given !== null && given !== "") return given;
          const found = errors();
          return found.length === 0 ? null : found.join(" ");
        }}
      </span>
    </>
  );
}

export interface ColorSwatchComponentProps extends StyleProps {
  color?: Color | string;
  "aria-label"?: string;
  ref?: RefTarget<HTMLDivElement>;
}

/** A square showing a colour, named with what it is. */
export function ColorSwatch(props: ColorSwatchComponentProps) {
  const picker = useColorPicker();
  const item = useColorSwatchPickerItem();

  const { swatchProps } = colorSwatch({
    color: () => props.color ?? item?.() ?? picker?.value() ?? defaultColor(),
    "aria-label": () => props["aria-label"],
  });

  const elementProps = mergeProps(swatchProps, {
    class: () => props.class ?? props.className,
    "data-testid": () => props["data-testid"],
  });

  return <div {...elementProps} ref={mergeRefs(props.ref)} />;
}

export { parseColor, type Color, type ColorChannel, type ColorFormat, type ColorSpace };

// ---------------------------------------------------------------------------
// Strings
// ---------------------------------------------------------------------------

type PickerStringKey =
  | "colorPicker"
  | "twoDimensionalSlider"
  | "colorSwatch"
  | "transparent"
  | "colorSwatchDescription";

// English describes a swatch by its numbers. No other locale has a translation
// of that, so every other one names the colour, in its own words.
const PICKER_STRINGS = new StringDictionary<PickerStringKey>({
  "ar-AE": {
    colorPicker: "أداة انتقاء اللون",
    twoDimensionalSlider: "مُنزلق 2D",
    colorSwatch: "تغيير الألوان",
    transparent: "شفاف",
    colorSwatchDescription: "{name}",
  },
  "bg-BG": {
    colorPicker: "Средство за избиране на цвят",
    twoDimensionalSlider: "2D плъзгач",
    colorSwatch: "цветна мостра",
    transparent: "прозрачен",
    colorSwatchDescription: "{name}",
  },
  "cs-CZ": {
    colorPicker: "Výběr barvy",
    twoDimensionalSlider: "2D posuvník",
    colorSwatch: "barevný vzorek",
    transparent: "průhledný",
    colorSwatchDescription: "{name}",
  },
  "da-DK": {
    colorPicker: "Farvevælger",
    twoDimensionalSlider: "2D-skyder",
    colorSwatch: "farveprøve",
    transparent: "gennemsigtig",
    colorSwatchDescription: "{name}",
  },
  "de-DE": {
    colorPicker: "Farbwähler",
    twoDimensionalSlider: "2D-Schieberegler",
    colorSwatch: "Farbfeld",
    transparent: "transparent",
    colorSwatchDescription: "{name}",
  },
  "el-GR": {
    colorPicker: "Επιλογέας χρωμάτων",
    twoDimensionalSlider: "Ρυθμιστικό 2D",
    colorSwatch: "χρωματικό δείγμα",
    transparent: "διαφανές",
    colorSwatchDescription: "{name}",
  },
  "en-US": {
    colorPicker: "Color picker",
    twoDimensionalSlider: "2D slider",
    colorSwatch: "color swatch",
    transparent: "transparent",
    colorSwatchDescription: "{hue}, {saturation} saturation, {lightness} lightness",
  },
  "es-ES": {
    colorPicker: "Selector de color",
    twoDimensionalSlider: "Regulador 2D",
    colorSwatch: "muestra de color",
    transparent: "transparente",
    colorSwatchDescription: "{name}",
  },
  "et-EE": {
    colorPicker: "Värvivalija",
    twoDimensionalSlider: "2D-liugur",
    colorSwatch: "värvinäidis",
    transparent: "läbipaistev",
    colorSwatchDescription: "{name}",
  },
  "fi-FI": {
    colorPicker: "Värimuokkain",
    twoDimensionalSlider: "2D-liukusäädin",
    colorSwatch: "värimalli",
    transparent: "läpinäkyvä",
    colorSwatchDescription: "{name}",
  },
  "fr-FR": {
    colorPicker: "Sélecteur de couleurs",
    twoDimensionalSlider: "Curseur 2D",
    colorSwatch: "Échantillon de couleurs",
    transparent: "Transparent",
    colorSwatchDescription: "{name}",
  },
  "he-IL": {
    colorPicker: "בוחר הצבעים",
    twoDimensionalSlider: "מחוון דו מימדי",
    colorSwatch: "דוגמית צבע",
    transparent: "שקוף",
    colorSwatchDescription: "{name}",
  },
  "hr-HR": {
    colorPicker: "Odabir boje",
    twoDimensionalSlider: "2D klizač",
    colorSwatch: "uzorak boje",
    transparent: "transparentno",
    colorSwatchDescription: "{name}",
  },
  "hu-HU": {
    colorPicker: "Színválasztó",
    twoDimensionalSlider: "2D-csúszka",
    colorSwatch: "színtár",
    transparent: "átlátszó",
    colorSwatchDescription: "{name}",
  },
  "it-IT": {
    colorPicker: "Selettore colore",
    twoDimensionalSlider: "Cursore 2D",
    colorSwatch: "campione di colore",
    transparent: "trasparente",
    colorSwatchDescription: "{name}",
  },
  "ja-JP": {
    colorPicker: "カラーピッカー",
    twoDimensionalSlider: "2D スライダー",
    colorSwatch: "カラースウォッチ",
    transparent: "透明",
    colorSwatchDescription: "{name}",
  },
  "ko-KR": {
    colorPicker: "색상 피커",
    twoDimensionalSlider: "2D 슬라이더",
    colorSwatch: "색상 견본",
    transparent: "투명도",
    colorSwatchDescription: "{name}",
  },
  "lt-LT": {
    colorPicker: "Spalvų parinkiklis",
    twoDimensionalSlider: "2D slankiklis",
    colorSwatch: "spalvų pavyzdys",
    transparent: "skaidrus",
    colorSwatchDescription: "{name}",
  },
  "lv-LV": {
    colorPicker: "Krāsu atlasītājs",
    twoDimensionalSlider: "2D slīdnis",
    colorSwatch: "krāsu paraugs",
    transparent: "caurspīdīgs",
    colorSwatchDescription: "{name}",
  },
  "nb-NO": {
    colorPicker: "Fargevelger",
    twoDimensionalSlider: "2D-glidebryter",
    colorSwatch: "fargekart",
    transparent: "gjennomsiktig",
    colorSwatchDescription: "{name}",
  },
  "nl-NL": {
    colorPicker: "Kleurkiezer",
    twoDimensionalSlider: "2D-schuifregelaar",
    colorSwatch: "kleurstaal",
    transparent: "transparant",
    colorSwatchDescription: "{name}",
  },
  "pl-PL": {
    colorPicker: "Próbnik kolorów",
    twoDimensionalSlider: "Suwak 2D",
    colorSwatch: "próbka koloru",
    transparent: "przezroczysty",
    colorSwatchDescription: "{name}",
  },
  "pt-BR": {
    colorPicker: "Seletor de cores",
    twoDimensionalSlider: "Controle deslizante 2D",
    colorSwatch: "amostra de cores",
    transparent: "transparente",
    colorSwatchDescription: "{name}",
  },
  "pt-PT": {
    colorPicker: "Seletor de cores",
    twoDimensionalSlider: "Controle deslizante 2D",
    colorSwatch: "amostra de cor",
    transparent: "transparente",
    colorSwatchDescription: "{name}",
  },
  "ro-RO": {
    colorPicker: "Selector de culori",
    twoDimensionalSlider: "Glisor 2D",
    colorSwatch: "specimen de culoare",
    transparent: "transparent",
    colorSwatchDescription: "{name}",
  },
  "ru-RU": {
    colorPicker: "Палитра цветов",
    twoDimensionalSlider: "Ползунок 2D",
    colorSwatch: "цветовой образец",
    transparent: "прозрачный",
    colorSwatchDescription: "{name}",
  },
  "sk-SK": {
    colorPicker: "Výber farieb",
    twoDimensionalSlider: "2D jazdec",
    colorSwatch: "vzorkovník farieb",
    transparent: "transparentný",
    colorSwatchDescription: "{name}",
  },
  "sl-SI": {
    colorPicker: "Izbirnik barv",
    twoDimensionalSlider: "2D drsnik",
    colorSwatch: "barvna paleta",
    transparent: "prozorno",
    colorSwatchDescription: "{name}",
  },
  "sr-SP": {
    colorPicker: "Birač boja",
    twoDimensionalSlider: "2D klizač",
    colorSwatch: "Uzorak boje",
    transparent: "providno",
    colorSwatchDescription: "{name}",
  },
  "sv-SE": {
    colorPicker: "Färgväljaren",
    twoDimensionalSlider: "2D-reglage",
    colorSwatch: "färgruta",
    transparent: "genomskinlig",
    colorSwatchDescription: "{name}",
  },
  "tr-TR": {
    colorPicker: "Renk Seçici",
    twoDimensionalSlider: "2D sürgü",
    colorSwatch: "renk örneği",
    transparent: "saydam",
    colorSwatchDescription: "{name}",
  },
  "uk-UA": {
    colorPicker: "Палітра кольорів",
    twoDimensionalSlider: "Повзунок 2D",
    colorSwatch: "зразок кольору",
    transparent: "прозорий",
    colorSwatchDescription: "{name}",
  },
  "zh-CN": {
    colorPicker: "拾色器",
    twoDimensionalSlider: "2D 滑块",
    colorSwatch: "颜色色板",
    transparent: "透明",
    colorSwatchDescription: "{name}",
  },
  "zh-TW": {
    colorPicker: "檢色器",
    twoDimensionalSlider: "2D 滑桿",
    colorSwatch: "色票",
    transparent: "透明",
    colorSwatchDescription: "{name}",
  },
});
