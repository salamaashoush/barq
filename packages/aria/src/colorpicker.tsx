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
  type Accessor,
  type Child,
  computed,
  context,
  getContext,
  getOwner,
  type Incoming,
  install,
  isServer,
  signal,
} from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import {
  Color,
  defaultColor,
  parseColor,
  type ColorChannel,
  type ColorFormat,
  type ColorSpace,
} from "./color.ts";
import { focusWithoutScrolling } from "./dom.ts";
import { focusRing } from "./focus.ts";
import { hover } from "./interactions/hover.ts";
import { globalListeners } from "./interactions/listeners.ts";
import { move, type MoveMoveEvent } from "./interactions/move.ts";
import type { ElementRef } from "./interactions/press.ts";
import { label as useLabelHook } from "./label.ts";
import { visuallyHidden } from "./live.ts";
import { formReset, HIDDEN_INPUT_STYLE } from "./toggle.ts";
import { textField, type TextFieldOptions } from "./textfield.tsx";
import {
  type FormValidationState,
  type ValidateFunction,
  type ValidationBehavior,
} from "./validation.ts";
import type { Orientation } from "./selection.ts";
import {
  callback,
  access,
  clamp,
  controllable,
  id,
  mergeProps,
  styleProps,
  type DOMProps,
  type MaybeAccessor,
  type StyleProps,
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

  const dragging = signal(false);
  const channel = (): ColorChannel => access(options.channel);
  const isDisabled = (): boolean => access(options.isDisabled) === true;

  // What the LAST write produced, so a drag reads its own change back rather
  // than the value a controlled owner has not caught up with yet.
  let live = value();

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
      const was = dragging();
      dragging.set(next);
      if (was && !next) options.onChangeEnd?.(live);
    },
    increment: (step) => setChannelValue(live.getChannelValue(channel()) + (step ?? range().step)),
    decrement: (step) => setChannelValue(live.getChannelValue(channel()) - (step ?? range().step)),
    valueText: () => {
      const current = value();
      const name = current.getChannelName(channel());
      const amount = current.getChannelValue(channel());
      return `${name} ${channel() === "alpha" ? `${Math.round(amount * 100)}%` : Math.round(amount)}`;
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

  const dragging = signal(false);
  const isDisabled = (): boolean => access(options.isDisabled) === true;

  let live = value();
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
      const was = dragging();
      dragging.set(next);
      if (was && !next) options.onChangeEnd?.(live);
    },
    incrementX: (by) => step(xChannel(), by ?? live.getChannelRange(xChannel()).step),
    decrementX: (by) => step(xChannel(), -(by ?? live.getChannelRange(xChannel()).step)),
    incrementY: (by) => step(yChannel(), by ?? live.getChannelRange(yChannel()).step),
    decrementY: (by) => step(yChannel(), -(by ?? live.getChannelRange(yChannel()).step)),
    valueText: () => {
      const current = value();
      return `${current.getChannelName(xChannel())} ${Math.round(
        current.getChannelValue(xChannel()),
      )}, ${current.getChannelName(yChannel())} ${Math.round(current.getChannelValue(yChannel()))}`;
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

  const isVertical = (): boolean => state.orientation() === "vertical";
  let position: number | null = null;

  const { moveProps } = move({
    onMoveStart: () => {
      position = null;
      state.setDragging(true);
    },
    onMove: (event) => {
      const track = access(options.trackRef) as Element | null;
      if (track === null) return;
      const box = track.getBoundingClientRect();
      const size = isVertical() ? box.height : box.width;
      if (size === 0) return;

      if (position === null) position = state.percent() * size;
      // Up is MORE on a vertical track, and the y axis counts down.
      position += isVertical() ? -event.deltaY : event.deltaX;
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
    state.setPercent(isVertical() ? 1 - offset / size : offset / size);
    (access(options.inputRef) as HTMLInputElement | null)?.focus();
  };

  const range = (): ReturnType<Color["getChannelRange"]> =>
    state.value().getChannelRange(state.channel());

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
          `${(isVertical() ? 1 - state.percent() : state.percent()) * 100}%`,
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
        // Page Up and Page Down, which a range input has no notion of.
        if (event.key !== "PageUp" && event.key !== "PageDown") return;
        event.preventDefault();
        state.setDragging(true);
        if (event.key === "PageUp") state.increment(range().pageSize);
        else state.decrement(range().pageSize);
        state.setDragging(false);
      },
    }),
    outputProps: { "aria-live": "off", for: inputId },
  };
}

export interface ColorAreaOptions {
  containerRef: ElementRef;
  xInputRef: ElementRef<HTMLInputElement>;
  yInputRef: ElementRef<HTMLInputElement>;
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
  let position: { x: number; y: number } | null = null;

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

  const { moveProps } = move({
    onMoveStart: () => {
      position = null;
      state.setDragging(true);
    },
    onMove: (event) => {
      const container = access(options.containerRef) as Element | null;
      if (container === null) return;
      const box = container.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;

      if (position === null) {
        position = { x: state.xPercent() * box.width, y: (1 - state.yPercent()) * box.height };
      }
      position.x += event.deltaX;
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
    state.setDragging(true);
    state.setPercents((clientX - box.left) / box.width, 1 - (clientY - box.top) / box.height);
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
      "aria-label": () => state.value().getChannelName(channel()),
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
      "aria-label": () => access(options["aria-label"]) ?? "Color area",
      "aria-labelledby": () => access(options["aria-labelledby"]),
      "aria-roledescription": "2D slider",
      "aria-disabled": () => state.isDisabled() || undefined,
      onPointerDown: (event: PointerEvent) => {
        if (event.button !== 0) return;
        onDown(event.clientX, event.clientY);
      },
      style: { position: "relative", "touch-action": "none" },
    }),
    thumbProps: {
      style: () => ({
        position: "absolute",
        left: `${state.xPercent() * 100}%`,
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

  const dragging = signal(false);
  const isDisabled = (): boolean => access(options.isDisabled) === true;

  // What the LAST write produced, so a drag reads its own change back rather
  // than the value a controlled owner has not caught up with yet.
  let live = value();

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
      const was = dragging();
      dragging.set(next);
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
      "aria-label": () => access(options["aria-label"]) ?? "Hue",
      "aria-labelledby": () => access(options["aria-labelledby"]),
      // The number MEANS something: "212" is not a colour, "Hue 212" is.
      "aria-valuetext": () => `Hue ${Math.round(state.hue())}`,
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
   * and a validator handed one has nothing to say about it.
   */
  validate?: ValidateFunction<Color>;
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

/**
 * A colour as text.
 *
 * Committed on blur and on Enter, never as you type: "#ff" is not a colour,
 * and a field that reported one on every keystroke would flash the page
 * through every prefix of what was typed.
 */
export function colorField(
  options: ColorFieldOptions,
  state: { value: Accessor<Color>; setValue(value: Color): void; isDisabled: Accessor<boolean> },
  ref: ElementRef<HTMLInputElement>,
): ColorFieldResult {
  const format = (): ColorFormat => access(options.format) ?? "hex";
  const text = signal(state.value().toString(format()));

  let live = state.value().toString(format());
  const sync = (): void => {
    const formatted = state.value().toString(format());
    if (formatted === live) return;
    live = formatted;
    text.set(formatted);
  };

  const commit = (): void => {
    try {
      const parsed = parseColor(text());
      live = parsed.toString(format());
      text.set(live);
      state.setValue(parsed);
    } catch {
      // Not a colour: the field goes back to what it holds rather than
      // keeping text that means nothing.
      text.set(state.value().toString(format()));
    }
  };

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
      value: () => {
        sync();
        return text();
      },
      // The caller validates the COLOUR; `textField` validates a string, so
      // the typed text is ignored and the committed value is handed over.
      validate:
        options.validate === undefined
          ? undefined
          : () => (options.validate as ValidateFunction<Color>)(state.value()),
      onChange: (next) => text.set(next),
      autoComplete: "off",
    },
    ref,
  );

  return {
    labelProps,
    descriptionProps,
    errorMessageProps,
    validation,
    errors,
    isInvalid,
    inputProps: mergeProps(inputProps, {
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
  const color = computed(() => {
    const given = access(options.color);
    return typeof given === "string" ? parseColor(given) : given;
  });

  const description = (): string => {
    const current = color();
    const hsl = current.toFormat("hsl");
    return `${Math.round(hsl.getChannelValue("hue"))} degrees, ${Math.round(
      hsl.getChannelValue("saturation"),
    )}% saturation, ${Math.round(hsl.getChannelValue("lightness"))}% lightness`;
  };

  return {
    color,
    swatchProps: {
      // An image, not a button: it SHOWS a colour and does nothing.
      role: "img",
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

const ColorPickerContext = context<ColorPickerContextValue | null>(null);

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
export function ColorPicker(props: Incoming<ColorPickerComponentProps>) {
  const [value, setValue] = controllable<Color>(
    () => asColor(props.value?.()),
    () => asColor(props.defaultValue?.()) ?? defaultColor(),
    (next) => props.onChange?.()?.(next),
  );

  const owner = getOwner();
  if (owner !== null) {
    install(owner, ColorPickerContext, () => ({
      value,
      setValue,
      isDisabled: () => props.isDisabled?.() === true,
    }));
  }

  const elementProps = mergeProps(styleProps(props), {
    "data-testid": () => props["data-testid"]?.(),
  });

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
  "aria-label"?: string;
  ref?: RefTarget<HTMLDivElement>;
  onChange?: (value: Color) => void;
  onChangeEnd?: (value: Color) => void;
}

/** One channel on a track: a hue, an alpha, a red. */
export function ColorSlider(props: Incoming<ColorSliderComponentProps>) {
  const trackRef = makeRef<HTMLDivElement>();
  const inputRef = makeRef<HTMLInputElement>();
  const picker = useColorPicker();

  const state = colorSliderState({
    channel: () => props.channel(),
    orientation: () => props.orientation?.(),
    value: () => props.value?.() ?? picker?.value(),
    defaultValue: () => props.defaultValue?.(),
    isDisabled: () => props.isDisabled?.() ?? picker?.isDisabled(),
    onChange: (value) => {
      picker?.setValue(value);
      props.onChange?.()?.(value);
    },
    onChangeEnd: (value) => props.onChangeEnd?.()?.(value),
  });

  const { labelProps, trackProps, thumbProps, inputProps, outputProps } = colorSlider(
    {
      trackRef,
      inputRef,
      label: () => props.label?.(),
      "aria-label": () =>
        props["aria-label"]?.() ??
        (props.label?.() === undefined ? state.value().getChannelName(props.channel()) : undefined),
    },
    state,
  );

  const { visuallyHiddenProps } = visuallyHidden();
  const { focusProps, isFocusVisible } = focusRing();
  const { hoverProps, isHovered } = hover({ isDisabled: state.isDisabled });

  const elementProps = mergeProps(trackProps, hoverProps, styleProps(props), {
    "data-orientation": state.orientation,
    "data-dragging": state.isDragging,
    "data-disabled": state.isDisabled,
    "data-testid": () => props["data-testid"]?.(),
  });

  return (
    <>
      {() => (props.label?.() === undefined ? null : <label {...labelProps}>{props.label}</label>)}
      <output {...outputProps}>{() => state.valueText()}</output>
      <div {...elementProps} ref={mergeRefs(trackRef.set, props.ref?.())}>
        <div
          {...mergeProps(thumbProps, {
            "data-focus-visible": isFocusVisible,
            "data-hovered": isHovered,
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
  "aria-label"?: string;
  ref?: RefTarget<HTMLDivElement>;
  onChange?: (value: Color) => void;
  onChangeEnd?: (value: Color) => void;
}

/** Two channels in a square: saturation across, brightness up. */
export function ColorArea(props: Incoming<ColorAreaComponentProps>) {
  const containerRef = makeRef<HTMLDivElement>();
  const xInputRef = makeRef<HTMLInputElement>();
  const yInputRef = makeRef<HTMLInputElement>();
  const picker = useColorPicker();

  const state = colorAreaState({
    value: () => props.value?.() ?? picker?.value(),
    defaultValue: () => props.defaultValue?.(),
    xChannel: () => props.xChannel?.(),
    yChannel: () => props.yChannel?.(),
    isDisabled: () => props.isDisabled?.() ?? picker?.isDisabled(),
    onChange: (value) => {
      picker?.setValue(value);
      props.onChange?.()?.(value);
    },
    onChangeEnd: (value) => props.onChangeEnd?.()?.(value),
  });

  const { colorAreaProps, thumbProps, xInputProps, yInputProps } = colorArea(
    {
      containerRef,
      xInputRef,
      yInputRef,
      "aria-label": () => props["aria-label"]?.(),
    },
    state,
  );

  const { visuallyHiddenProps } = visuallyHidden();
  const { focusProps, isFocusVisible } = focusRing();

  const elementProps = mergeProps(colorAreaProps, styleProps(props), {
    "data-dragging": state.isDragging,
    "data-disabled": state.isDisabled,
    "data-testid": () => props["data-testid"]?.(),
  });

  return (
    <div {...elementProps} ref={mergeRefs(containerRef.set, props.ref?.())}>
      <div {...mergeProps(thumbProps, { "data-focus-visible": isFocusVisible })}>
        <input
          {...mergeProps(xInputProps, focusProps, { style: visuallyHiddenProps.style })}
          ref={xInputRef.set}
        />
        <input
          {...mergeProps(yInputProps, { style: visuallyHiddenProps.style })}
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
export function ColorWheel(props: Incoming<ColorWheelComponentProps>) {
  const trackRef = makeRef<HTMLDivElement>();
  const inputRef = makeRef<HTMLInputElement>();
  const picker = useColorPicker();

  const state = colorWheelState({
    value: () => props.value?.() ?? picker?.value(),
    defaultValue: () => props.defaultValue?.(),
    isDisabled: () => props.isDisabled?.() ?? picker?.isDisabled(),
    onChange: (value) => {
      picker?.setValue(value);
      props.onChange?.()?.(value);
    },
    onChangeEnd: (value) => props.onChangeEnd?.()?.(value),
  });

  const outerRadius = (): number => props.outerRadius?.() ?? 80;
  const innerRadius = (): number => props.innerRadius?.() ?? 64;

  const { trackProps, thumbProps, inputProps } = colorWheel(
    {
      trackRef,
      inputRef,
      innerRadius,
      outerRadius,
      name: () => props.name?.(),
      form: () => props.form?.(),
      "aria-label": () => props["aria-label"]?.(),
      "aria-labelledby": () => props["aria-labelledby"]?.(),
    },
    state,
  );

  const { focusProps, isFocusVisible } = focusRing();
  const { hoverProps, isHovered } = hover({ isDisabled: state.isDisabled });

  const elementProps = mergeProps(trackProps, hoverProps, styleProps(props), {
    "data-dragging": state.isDragging,
    "data-disabled": state.isDisabled,
    "data-testid": () => props["data-testid"]?.(),
    style: () => ({
      position: "relative",
      "touch-action": "none",
      width: `${outerRadius() * 2}px`,
      height: `${outerRadius() * 2}px`,
    }),
  });

  return (
    <div {...elementProps} ref={mergeRefs(trackRef.set, props.ref?.())}>
      <div
        {...mergeProps(thumbProps, {
          "data-focus-visible": isFocusVisible,
          "data-hovered": isHovered,
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
  value?: Color | string;
  defaultValue?: Color | string;
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
  name?: string;
  "aria-label"?: string;
  ref?: RefTarget<HTMLInputElement>;
  onChange?: (value: Color) => void;
}

/** A colour as text: `#7f00ff`, committed on blur and on Enter. */
export function ColorField(props: Incoming<ColorFieldComponentProps>) {
  const domRef = makeRef<HTMLInputElement>();
  const picker = useColorPicker();

  const [value, setValue] = controllable<Color>(
    () => asColor(props.value?.()) ?? picker?.value(),
    () => asColor(props.defaultValue?.()) ?? defaultColor(),
    (next) => {
      picker?.setValue(next);
      props.onChange?.()?.(next);
    },
  );

  const state = {
    value,
    setValue,
    isDisabled: (): boolean => props.isDisabled?.() ?? picker?.isDisabled() ?? false,
  };

  const { labelProps, inputProps, descriptionProps, errorMessageProps, errors, isInvalid } =
    colorField(
      {
        label: () => props.label?.(),
        description: () => props.description?.(),
        errorMessage: () => props.errorMessage?.(),
        format: () => props.format?.(),
        isDisabled: state.isDisabled,
        isReadOnly: () => props.isReadOnly?.(),
        isRequired: () => props.isRequired?.(),
        isInvalid: () => props.isInvalid?.(),
        validate: callback<[Color], string | string[] | true | null | undefined>(props.validate),
        validationBehavior: () => props.validationBehavior?.(),
        name: () => props.name?.(),
        "aria-label": () => props["aria-label"]?.(),
      },
      state,
      domRef,
    );

  const { focusProps, isFocusVisible } = focusRing();

  const elementProps = mergeProps(inputProps, focusProps, styleProps(props), {
    "data-focus-visible": isFocusVisible,
    "data-invalid": isInvalid,
    "data-testid": () => props["data-testid"]?.(),
  });

  return (
    <>
      <label {...labelProps}>{props.label}</label>
      <input {...elementProps} ref={mergeRefs(domRef.set, props.ref?.())} />
      <span {...descriptionProps}>{props.description}</span>
      <span {...errorMessageProps}>
        {() => {
          const given = props.errorMessage?.();
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
export function ColorSwatch(props: Incoming<ColorSwatchComponentProps>) {
  const picker = useColorPicker();

  const { swatchProps } = colorSwatch({
    color: () => props.color?.() ?? picker?.value() ?? defaultColor(),
    "aria-label": () => props["aria-label"]?.(),
  });

  const elementProps = mergeProps(swatchProps, {
    class: () => props.class?.() ?? props.className?.(),
    "data-testid": () => props["data-testid"]?.(),
  });

  return <div {...elementProps} ref={mergeRefs(props.ref?.())} />;
}

export { parseColor, type Color, type ColorChannel, type ColorFormat, type ColorSpace };
