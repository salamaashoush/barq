/**
 * Sliders: one or more thumbs on a track.
 *
 * Each thumb is a real `<input type="range">`, visually hidden under whatever
 * the caller draws. That is not a shortcut — it is the only way to get the
 * behaviour right without reimplementing it:
 *
 * - The arrow keys, Home, End and Page Up/Down all work, in the direction the
 *   platform expects, including the ones that differ between screen readers.
 * - It participates in a form, and a reset puts it back.
 * - Assistive technology announces it as a slider with a value, and iOS
 *   VoiceOver's rotor can adjust it, which no `role="slider"` div supports.
 *
 * What is left for this file is the geometry — where a press on the track puts
 * the nearest thumb, and how far a drag moves it — and the ARIA that connects
 * a group of thumbs to one label.
 *
 * A range slider's thumbs cannot cross: each one's minimum is the thumb below
 * it and its maximum is the thumb above. Letting them swap would mean the same
 * gesture produces a different value depending on how fast the pointer moved.
 */

import {
  type Accessor,
  type Child,
  For,
  createMemo,
  createContext,
  createEffect,
  getContext,
  getOwner,
  type Incoming,
  install,
  isServer,
  createSignal,
  onSettled,
  untrack,
} from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { focusWithoutScrolling } from "./dom.ts";
import { focusRing } from "./focus.ts";
import { numberFormatter, useLocale } from "./i18n.ts";
import { focusable } from "./interactions/focusable.ts";
import { hover } from "./interactions/hover.ts";
import { globalListeners } from "./interactions/listeners.ts";
import { move } from "./interactions/move.ts";
import type { ElementRef } from "./interactions/press.ts";
import { label as useLabelHook, type LabelOptions } from "./label.ts";
import { visuallyHidden } from "./live.ts";
import type { Orientation } from "./selection.ts";
import { formReset } from "./toggle.ts";
import {
  access,
  clamp,
  type DOMProps,
  filterDOMProps,
  fromProps,
  id,
  type MaybeAccessor,
  mergeProps,
  snapValueToStep,
  type StyleProps,
  styleProps,
} from "./utils.ts";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const DEFAULT_MIN = 0;
const DEFAULT_MAX = 100;
const DEFAULT_STEP = 1;

export interface SliderStateOptions {
  value?: MaybeAccessor<number | number[] | undefined>;
  defaultValue?: MaybeAccessor<number | number[] | undefined>;
  /** @default 0 */
  minValue?: MaybeAccessor<number | undefined>;
  /** @default 100 */
  maxValue?: MaybeAccessor<number | undefined>;
  /** @default 1 */
  step?: MaybeAccessor<number | undefined>;
  /** @default "horizontal" */
  orientation?: MaybeAccessor<Orientation | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  /**
   * Puts the minimum at the far end: the right of a horizontal slider (the
   * left, right to left) and the top of a vertical one.
   */
  isInverted?: MaybeAccessor<boolean | undefined>;
  /** How many steps two neighbouring thumbs must stay apart. @default 0 */
  minStepsBetweenThumbs?: MaybeAccessor<number | undefined>;
  /** How the value is spoken and shown. */
  formatOptions?: MaybeAccessor<Intl.NumberFormatOptions | undefined>;
  onChange?: (value: number[]) => void;
  /** Called once, when the gesture that changed the value ends. */
  onChangeEnd?: (value: number[]) => void;
}

export interface SliderState {
  values: Accessor<number[]>;
  defaultValues: Accessor<number[]>;
  getThumbValue(index: number): number;
  setThumbValue(index: number, value: number): void;
  setThumbPercent(index: number, percent: number): void;
  isThumbDragging(index: number): boolean;
  setThumbDragging(index: number, dragging: boolean): void;
  focusedThumb: Accessor<number | undefined>;
  setFocusedThumb(index: number | undefined): void;
  getThumbPercent(index: number): number;
  getValuePercent(value: number): number;
  getThumbValueLabel(index: number): string;
  getFormattedValue(value?: number | number[]): string;
  getThumbMinValue(index: number): number;
  getThumbMaxValue(index: number): number;
  getPercentValue(percent: number): number;
  isThumbEditable(index: number): boolean;
  setThumbEditable(index: number, editable: boolean): void;
  incrementThumb(index: number, stepSize?: number): void;
  decrementThumb(index: number, stepSize?: number): void;
  step: Accessor<number>;
  /** How far Page Up and Page Down move. A tenth of the range, at least a step. */
  pageSize: Accessor<number>;
  orientation: Accessor<Orientation>;
  isInverted: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
}

function asArray(value: number | number[] | undefined): number[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? [...value] : [value];
}

export function sliderState(options: SliderStateOptions): SliderState {
  const min = (): number => access(options.minValue) ?? DEFAULT_MIN;
  const max = (): number => access(options.maxValue) ?? DEFAULT_MAX;
  const step = (): number => access(options.step) ?? DEFAULT_STEP;
  const isDisabled = (): boolean => access(options.isDisabled) === true;

  const pageSize = (): number => {
    const size = (max() - min()) / 10;
    return Math.max(snapValueToStep(size, 0, size + step(), step()), step());
  };

  const gap = (): number => Math.max(access(options.minStepsBetweenThumbs) ?? 0, 0) * step();

  /**
   * Every thumb snapped to the step, and penned in by its neighbours.
   *
   * In order, each against the one already placed below it, so two values that
   * arrive closer than the gap are opened out upwards rather than crossing.
   */
  const restrict = (values: number[]): number[] => {
    const out: number[] = [];
    values.forEach((value, index) => {
      const lower = index === 0 ? min() : (out[index - 1] as number) + gap();
      const upper = max() - (values.length - 1 - index) * gap();
      out.push(snapValueToStep(value, Math.min(lower, upper), upper, step()));
    });
    return out;
  };

  const controlled = (): number[] | undefined => {
    const given = asArray(access(options.value));
    return given === undefined ? undefined : restrict(given);
  };

  const [internal, setInternal] = createSignal<number[]>(
    controlled() ?? restrict(asArray(access(options.defaultValue)) ?? [min()]),
  );

  const values = (): number[] => controlled() ?? internal();

  // What the LAST write produced, so a gesture reads its own change back
  // rather than the value a controlled owner has not caught up with yet.
  let live = values();

  const initial = values();

  const setValues = (next: number[]): void => {
    live = next;
    if (controlled() === undefined) setInternal(next);
    options.onChange?.(next);
  };

  const [dragging, setDragging] = createSignal<boolean[]>(
    new Array<boolean>(values().length).fill(false),
  );
  // What the last write to `dragging` produced. A keyboard change starts and
  // ends its gesture in one tick, and the signal does not publish until the
  // flush, so reading it back would find the gesture never begun.
  let liveDragging: boolean[] = new Array(values().length).fill(false);
  const editable: boolean[] = new Array(values().length).fill(true);
  const [focused, setFocused] = createSignal<number | undefined>(undefined);

  const getThumbMinValue = (index: number): number =>
    index === 0 ? min() : (values()[index - 1] as number) + gap();
  const getThumbMaxValue = (index: number): number =>
    index === values().length - 1 ? max() : (values()[index + 1] as number) - gap();

  const isThumbEditable = (index: number): boolean => editable[index] !== false;

  const updateValue = (index: number, value: number): void => {
    if (isDisabled() || !isThumbEditable(index)) return;
    const snapped = snapValueToStep(
      value,
      getThumbMinValue(index),
      getThumbMaxValue(index),
      step(),
    );
    if (live[index] === snapped) return;
    const next = [...live];
    next[index] = snapped;
    setValues(next);
  };

  const updateDragging = (index: number, isDragging: boolean): void => {
    if (isDisabled() || !isThumbEditable(index)) return;
    const current = liveDragging;
    const wasDragging = current[index] === true;
    if (isDragging) live = values();

    const next = [...current];
    next[index] = isDragging;
    liveDragging = next;
    setDragging(next);

    // `onChangeEnd` fires once the whole gesture is over, not once per thumb:
    // a two-thumb drag is one interaction.
    if (wasDragging && !next.some(Boolean)) options.onChangeEnd?.(live);
  };

  const format = createMemo(() => numberFormatter(access(options.formatOptions))());
  const locale = useLocale();
  let listFormat: Intl.ListFormat | null = null;

  const getFormattedValue = (value: number | number[] = values()): string => {
    const list = Array.isArray(value) ? value : [value];
    if (list.length === 0) return "";
    if (list.length === 1) return format().format(list[0] as number);
    if (list.length === 2) return format().formatRange(list[0] as number, list[1] as number);
    if (listFormat === null) listFormat = new Intl.ListFormat(locale().locale, { type: "unit" });
    return listFormat.format(list.map((entry) => format().format(entry)));
  };

  const getValuePercent = (value: number): number => (value - min()) / (max() - min());

  const getPercentValue = (percent: number): number => {
    const raw = percent * (max() - min()) + min();
    const rounded = Math.round((raw - min()) / step()) * step() + min();
    return clamp(rounded, min(), max());
  };

  return {
    values,
    defaultValues: () =>
      access(options.defaultValue) !== undefined
        ? restrict(asArray(access(options.defaultValue)) as number[])
        : initial,
    getThumbValue: (index) => values()[index] as number,
    setThumbValue: updateValue,
    setThumbPercent: (index, percent) => updateValue(index, getPercentValue(percent)),
    isThumbDragging: (index) => dragging()[index] === true,
    setThumbDragging: updateDragging,
    focusedThumb: focused,
    setFocusedThumb: (index) => setFocused(index),
    getThumbPercent: (index) => getValuePercent(values()[index] as number),
    getValuePercent,
    getThumbValueLabel: (index) => getFormattedValue(values()[index]),
    getFormattedValue,
    getThumbMinValue,
    getThumbMaxValue,
    getPercentValue,
    isThumbEditable,
    setThumbEditable: (index, value) => {
      editable[index] = value;
    },
    incrementThumb: (index, stepSize = 1) => {
      const size = Math.max(stepSize, step());
      updateValue(index, snapValueToStep((live[index] as number) + size, min(), max(), step()));
    },
    decrementThumb: (index, stepSize = 1) => {
      const size = Math.max(stepSize, step());
      updateValue(index, snapValueToStep((live[index] as number) - size, min(), max(), step()));
    },
    step,
    pageSize,
    orientation: () => access(options.orientation) ?? "horizontal",
    isInverted: () => access(options.isInverted) === true,
    isDisabled,
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Whether a larger value sits at a smaller coordinate: nearer the left, or
 * nearer the top.
 *
 * A vertical slider starts that way, because its minimum is at the bottom; a
 * horizontal one only right to left. `isInverted` reverses whichever it was.
 */
export function runsBackwards(state: SliderState, rtl: boolean): boolean {
  const backwards = state.orientation() === "vertical" ? true : rtl;
  return backwards !== state.isInverted();
}

/** The ids a slider's thumbs and its group share. */
function thumbId(base: string, index: number): string {
  return `${base}-thumb-${index}`;
}

export interface SliderOptions extends LabelOptions {
  trackRef: ElementRef;
  /** The first thumb's id, when the caller chose it: what the label's press focuses. */
  firstThumbId?: MaybeAccessor<string | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  "aria-describedby"?: MaybeAccessor<string | undefined>;
}

export interface SliderResult {
  labelProps: DOMProps;
  /** For the element holding every thumb: one group, one label. */
  groupProps: DOMProps;
  trackProps: DOMProps;
  outputProps: DOMProps;
  /** The base every thumb id is derived from. */
  baseId: Accessor<string>;
}

export function slider(options: SliderOptions, state: SliderState): SliderResult {
  const baseId = id();
  const locale = useLocale();
  const listeners = globalListeners();

  const isVertical = (): boolean => state.orientation() === "vertical";
  const flipped = (): boolean => runsBackwards(state, locale().direction === "rtl");

  const { labelProps, fieldProps } = useLabelHook({
    ...options,
    // The label names the GROUP, not any one thumb: pointing it at the first
    // thumb makes iOS VoiceOver announce that thumb as the whole slider.
    labelElementType: "span",
  });

  let draggingIndex: number | null = null;
  let position: number | null = null;
  let pointer: number | null | undefined;

  const trackSize = (): number => {
    const track = access(options.trackRef) as Element | null;
    if (track === null) return 0;
    const box = track.getBoundingClientRect();
    return isVertical() ? box.height : box.width;
  };

  const { moveProps } = move({
    onMoveStart: () => {
      position = null;
    },
    onMove: (event) => {
      if (draggingIndex === null) return;
      const size = trackSize();
      if (size === 0) return;

      if (position === null) position = state.getThumbPercent(draggingIndex) * size;

      // Down is a LOWER value on a vertical slider, and right is a lower one
      // in a right-to-left layout, so the delta is flipped rather than the
      // value.
      let delta = isVertical() ? event.deltaY : event.deltaX;
      if (flipped()) delta = -delta;

      position += delta;
      state.setThumbPercent(draggingIndex, clamp(position / size, 0, 1));
    },
    onMoveEnd: () => {
      if (draggingIndex === null) return;
      state.setThumbDragging(draggingIndex, false);
      draggingIndex = null;
    },
  });

  /** The thumb a press at this point should pick up. */
  const closestThumb = (value: number): number => {
    const values = state.values();
    const split = values.findIndex((entry) => value - entry < 0);
    if (split === 0) return 0;
    if (split === -1) return values.length - 1;
    const before = values[split - 1] as number;
    const after = values[split] as number;
    // Stacked on top of each other: take the upper one, so a range that has
    // collapsed to a point can still be opened out.
    return Math.abs(before - value) < Math.abs(after - value) ? split - 1 : split;
  };

  const onUpTrack = (event: Event): void => {
    const identifier =
      (event as PointerEvent).pointerId ??
      (event as TouchEvent).changedTouches?.[0]?.identifier ??
      undefined;
    if (identifier !== pointer) return;
    if (draggingIndex !== null) {
      state.setThumbDragging(draggingIndex, false);
      draggingIndex = null;
    }
    listeners.removeAll();
  };

  const onDownTrack = (
    event: Event,
    identifier: number | undefined,
    clientX: number,
    clientY: number,
  ): void => {
    const track = access(options.trackRef) as Element | null;
    if (track === null || access(options.isDisabled) === true) return;
    if (state.values().some((_, index) => state.isThumbDragging(index))) return;

    const box = track.getBoundingClientRect();
    const size = isVertical() ? box.height : box.width;
    if (size === 0) return;
    const offset = (isVertical() ? clientY : clientX) - (isVertical() ? box.top : box.left);
    let percent = offset / size;
    if (flipped()) percent = 1 - percent;

    const value = state.getPercentValue(percent);
    const index = closestThumb(value);
    if (index < 0 || !state.isThumbEditable(index)) return;

    // Nothing loses focus: the press is picking a thumb up, not moving focus
    // to the track.
    event.preventDefault();
    draggingIndex = index;
    pointer = identifier;
    state.setFocusedThumb(index);
    state.setThumbDragging(index, true);
    state.setThumbValue(index, value);

    if (!isServer) {
      const view = (track.ownerDocument.defaultView ?? window) as Window;
      listeners.add(view, "mouseup", onUpTrack);
      listeners.add(view, "touchend", onUpTrack);
      listeners.add(view, "pointerup", onUpTrack);
    }
  };

  return {
    baseId,
    labelProps: mergeProps(labelProps, {
      // The label points at the group, so clicking it has to move focus by
      // hand — and show the focus ring, since the user is now on the keyboard.
      onClick: () => {
        if (access(options.isDisabled) === true) return;
        const first = (access(options.trackRef) as Element | null)?.ownerDocument.getElementById(
          access(options.firstThumbId) ?? thumbId(baseId(), 0),
        );
        if (first !== null && first !== undefined) focusWithoutScrolling(first);
      },
    }),
    groupProps: mergeProps(filterDOMProps(options, { labelable: true }), fieldProps, {
      role: "group",
    }),
    trackProps: mergeProps(moveProps, {
      onMouseDown: (event: MouseEvent) => {
        if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey) return;
        onDownTrack(event, undefined, event.clientX, event.clientY);
      },
      onPointerDown: (event: PointerEvent) => {
        if (
          event.pointerType === "mouse" &&
          (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey)
        ) {
          return;
        }
        onDownTrack(event, event.pointerId, event.clientX, event.clientY);
      },
      onTouchStart: (event: TouchEvent) => {
        const touch = event.changedTouches[0];
        if (touch === undefined) return;
        onDownTrack(event, touch.identifier, touch.clientX, touch.clientY);
      },
      style: { position: "relative", "touch-action": "none" },
    }),
    outputProps: {
      // `off`, not `polite`: the thumb's own value is announced as it moves,
      // and a live region saying the same thing is the value read twice.
      "aria-live": "off",
      for: () =>
        state
          .values()
          .map((_, index) => thumbId(baseId(), index))
          .join(" "),
    },
  };
}

export interface SliderThumbOptions {
  /** @default 0 */
  index?: number;
  trackRef: ElementRef;
  inputRef: ElementRef<HTMLInputElement>;
  baseId: MaybeAccessor<string>;
  /** The input's id, where the caller chose one. @default derived from `baseId` */
  id?: MaybeAccessor<string | undefined>;
  /** The group's own id, so the thumb is announced with the slider's name. */
  groupLabelId?: MaybeAccessor<string | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isRequired?: MaybeAccessor<boolean | undefined>;
  isInvalid?: MaybeAccessor<boolean | undefined>;
  name?: MaybeAccessor<string | undefined>;
  form?: MaybeAccessor<string | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
  "aria-describedby"?: MaybeAccessor<string | undefined>;
}

export interface SliderThumbResult {
  thumbProps: DOMProps;
  /** For the `<input type="range">` under the thumb. */
  inputProps: DOMProps;
  labelProps: DOMProps;
  isDragging: Accessor<boolean>;
  isFocused: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
}

export function sliderThumb(options: SliderThumbOptions, state: SliderState): SliderThumbResult {
  const index = options.index ?? 0;
  const locale = useLocale();
  const listeners = globalListeners();

  const isVertical = (): boolean => state.orientation() === "vertical";
  const reversed = (): boolean => locale().direction === "rtl";
  const flipped = (): boolean => runsBackwards(state, reversed());
  const isDisabled = (): boolean => access(options.isDisabled) === true || state.isDisabled();
  const isFocused = (): boolean => state.focusedThumb() === index;

  state.setThumbEditable(index, !isDisabled());

  const focusInput = (): void => {
    const input = access(options.inputRef) as HTMLInputElement | null;
    if (input !== null) focusWithoutScrolling(input);
  };

  if (!isServer) {
    // The state decides which thumb is focused — the track hands focus to the
    // one a press picked up — so the DOM follows it rather than the reverse.
    createEffect(isFocused, (focused) => {
      if (focused) untrack(focusInput);
    });

    createEffect(isDisabled, (disabled) => {
      state.setThumbEditable(index, !disabled);
    });
  }

  let position: number | null = null;

  const { moveProps } = move({
    onMoveStart: () => {
      position = null;
      state.setThumbDragging(index, true);
    },
    onMove: (event) => {
      // Before anything is measured: a key needs no geometry, and a track that
      // has none (not laid out yet, or `display: none` on an ancestor) would
      // otherwise swallow it.
      if (event.pointerType === "keyboard") {
        // The native input already handles the plain arrows; what reaches here
        // is the drag emulation, so a Shift is a page rather than a step.
        const amount = event.shiftKey ? state.pageSize() : state.step();
        // The keys follow what is DRAWN. Left and right mirror with the
        // horizontal axis, up and down with the vertical one, and an inversion
        // only reaches the axis the slider runs along.
        const inverted = state.isInverted();
        const lowOnLeft = isVertical() ? !reversed() : reversed() === inverted;
        const lowOnBottom = !(isVertical() && inverted);
        const backwards =
          event.deltaX !== 0 ? event.deltaX < 0 === lowOnLeft : event.deltaY > 0 === lowOnBottom;
        if (backwards) state.decrementThumb(index, amount);
        else state.incrementThumb(index, amount);
        return;
      }

      const track = access(options.trackRef) as Element | null;
      if (track === null) return;
      const box = track.getBoundingClientRect();
      const size = isVertical() ? box.height : box.width;
      if (size === 0) return;

      if (position === null) position = state.getThumbPercent(index) * size;

      let delta = isVertical() ? event.deltaY : event.deltaX;
      if (flipped()) delta = -delta;
      position += delta;
      state.setThumbPercent(index, clamp(position / size, 0, 1));
    },
    onMoveEnd: () => state.setThumbDragging(index, false),
  });

  const { focusableProps } = focusable(
    {
      isDisabled,
      onFocus: () => state.setFocusedThumb(index),
      onBlur: () => state.setFocusedThumb(undefined),
    },
    options.inputRef,
  );

  let pointer: number | undefined;

  const onUp = (event: Event): void => {
    const identifier =
      (event as PointerEvent).pointerId ??
      (event as TouchEvent).changedTouches?.[0]?.identifier ??
      undefined;
    if (identifier !== pointer) return;
    focusInput();
    state.setThumbDragging(index, false);
    listeners.removeAll();
  };

  const onDown = (identifier?: number): void => {
    focusInput();
    pointer = identifier;
    state.setThumbDragging(index, true);
    if (isServer) return;
    const input = access(options.inputRef) as HTMLInputElement | null;
    const view = (input?.ownerDocument.defaultView ?? window) as Window;
    listeners.add(view, "mouseup", onUp);
    listeners.add(view, "touchend", onUp);
    listeners.add(view, "pointerup", onUp);
  };

  formReset(
    options.inputRef,
    () => state.defaultValues()[index] ?? 0,
    (value) => state.setThumbValue(index, value),
  );

  const onKeyDown = (event: KeyboardEvent): void => {
    // The native range input has no page step and no Home/End of its own on
    // every engine, so those four are ours.
    switch (event.key) {
      case "PageUp":
        event.preventDefault();
        state.setThumbDragging(index, true);
        state.incrementThumb(index, state.pageSize());
        state.setThumbDragging(index, false);
        return;
      case "PageDown":
        event.preventDefault();
        state.setThumbDragging(index, true);
        state.decrementThumb(index, state.pageSize());
        state.setThumbDragging(index, false);
        return;
      case "Home":
        event.preventDefault();
        state.setThumbDragging(index, true);
        state.setThumbValue(index, state.getThumbMinValue(index));
        state.setThumbDragging(index, false);
        return;
      case "End":
        event.preventDefault();
        state.setThumbDragging(index, true);
        state.setThumbValue(index, state.getThumbMaxValue(index));
        state.setThumbDragging(index, false);
        return;
      default:
        return;
    }
  };

  const thumbPercent = (): number => {
    const percent = state.getThumbPercent(index);
    return flipped() ? 1 - percent : percent;
  };

  const interactions: DOMProps = isDisabled()
    ? {}
    : mergeProps(moveProps, {
        onMouseDown: (event: MouseEvent) => {
          if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey) return;
          onDown();
        },
        onPointerDown: (event: PointerEvent) => {
          if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey) return;
          onDown(event.pointerId);
        },
        onTouchStart: (event: TouchEvent) => onDown(event.changedTouches[0]?.identifier),
      });

  return {
    isDragging: () => state.isThumbDragging(index),
    isFocused,
    isDisabled,
    labelProps: { for: () => access(options.id) ?? thumbId(access(options.baseId), index) },
    thumbProps: mergeProps(interactions, {
      style: () => ({
        position: "absolute",
        [isVertical() ? "top" : "left"]: `${thumbPercent() * 100}%`,
        transform: "translate(-50%, -50%)",
        "touch-action": "none",
      }),
    }),
    inputProps: mergeProps(focusableProps, {
      id: () => access(options.id) ?? thumbId(access(options.baseId), index),
      type: "range",
      tabIndex: () => (isDisabled() ? undefined : 0),
      min: () => state.getThumbMinValue(index),
      max: () => state.getThumbMaxValue(index),
      step: state.step,
      value: () => state.getThumbValue(index),
      name: () => access(options.name),
      form: () => access(options.form),
      disabled: isDisabled,
      "aria-orientation": state.orientation,
      // What the number MEANS: "40%", "£12.50". Without it a screen reader
      // reads the raw number and the unit is lost.
      "aria-valuetext": () => state.getThumbValueLabel(index),
      "aria-required": () => access(options.isRequired) === true || undefined,
      "aria-invalid": () => access(options.isInvalid) === true || undefined,
      "aria-label": () => access(options["aria-label"]),
      "aria-labelledby": () =>
        [access(options.groupLabelId), access(options["aria-labelledby"])]
          .filter(Boolean)
          .join(" ") || undefined,
      "aria-describedby": () => access(options["aria-describedby"]),
      onKeyDown,
      onInput: (event: Event) => {
        state.setThumbValue(index, Number.parseFloat((event.target as HTMLInputElement).value));
      },
      onChange: (event: Event) => {
        state.setThumbValue(index, Number.parseFloat((event.target as HTMLInputElement).value));
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/** What `useSlider` returns. Exported because it is the return type of an exported function. */
export interface SliderContextValue {
  state: SliderState;
  baseId: Accessor<string>;
  trackRef: ReturnType<typeof makeRef<HTMLDivElement>>;
  groupLabelId: Accessor<string | undefined>;
  /** The id the caller gave the slider, which is the first thumb's. */
  firstThumbId: Accessor<string | undefined>;
  outputProps: DOMProps;
  name: Accessor<string | undefined>;
  form: Accessor<string | undefined>;
}

const SliderContext = createContext<SliderContextValue | null>(null);

export function useSlider(): SliderContextValue {
  const value = getContext(SliderContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a Slider.");
  }
  return value;
}

export interface SliderComponentProps extends StyleProps {
  children?: Child;
  label?: Child;
  value?: number | number[];
  defaultValue?: number | number[];
  /** @default 0 */
  minValue?: number;
  /** @default 100 */
  maxValue?: number;
  /** @default 1 */
  step?: number;
  /** @default "horizontal" */
  orientation?: Orientation;
  isDisabled?: boolean;
  /** Puts the minimum at the far end. See {@link SliderStateOptions.isInverted}. */
  isInverted?: boolean;
  /** How many steps two neighbouring thumbs must stay apart. @default 0 */
  minStepsBetweenThumbs?: number;
  formatOptions?: Intl.NumberFormatOptions;
  name?: string;
  form?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  ref?: RefTarget<HTMLDivElement>;
  onChange?: (value: number[]) => void;
  onChangeEnd?: (value: number[]) => void;
}

/**
 * ```tsx
 * <Slider label="Volume" defaultValue={30} onChange={([v]) => volume.set(v)} />
 * <Slider label="Price" defaultValue={[20, 60]} formatOptions={{ style: "currency", currency: "GBP" }} />
 * ```
 *
 * With no children it draws the ordinary layout — a label, the value, a track
 * and a thumb per value. Compose `<SliderOutput>`, `<SliderTrack>` and
 * `<SliderThumb>` yourself for anything else.
 */
export function Slider(props: Incoming<SliderComponentProps>) {
  const trackRef = makeRef<HTMLDivElement>();
  const options = fromProps(props);

  const state = sliderState({
    ...(options as SliderStateOptions),
    onChange: (value) => props.onChange?.()?.(value),
    onChangeEnd: (value) => props.onChangeEnd?.()?.(value),
  });

  // The caller's `id` is the first thumb's, because the thumb is what a
  // `<label for>` elsewhere on the page can name and focus: on the group it
  // pointed at a `<div>`, which a label reaches neither way.
  const firstThumbId = (): string | undefined => props.id?.();
  const { id: _, ...groupOptions } = options as unknown as SliderOptions & { id?: unknown };
  const { labelProps, groupProps, trackProps, outputProps, baseId } = slider(
    { ...groupOptions, trackRef, firstThumbId },
    state,
  );
  const ownName = (): boolean =>
    props.label !== undefined ||
    props["aria-label"]?.() !== undefined ||
    props["aria-labelledby"]?.() !== undefined;

  // Named only by a `<label for>` on its first thumb, the group takes its name
  // from the same label. Asked once the slider is in the document, where the
  // label can be found.
  const [namedBy, setNamedBy] = createSignal<string | undefined>(undefined);
  onSettled(() => {
    const given = firstThumbId();
    const track = trackRef();
    if (given === undefined || ownName() || track === null) return;
    const ids: string[] = [];
    for (const label of track.ownerDocument.querySelectorAll("label")) {
      if (label.htmlFor !== given) continue;
      if (label.id === "")
        label.id = `${given}-label${ids.length === 0 ? "" : `-${String(ids.length)}`}`;
      ids.push(label.id);
    }
    if (ids.length > 0) setNamedBy(ids.join(" "));
  });

  const owner = getOwner();
  if (owner !== null) {
    install(owner, SliderContext, () => ({
      state,
      baseId,
      trackRef,
      /**
       * The label element when there is one, and the GROUP when there is not.
       *
       * A thumb is `role="slider"` and needs a name of its own — that is the
       * thing a screen reader announces, not the group around it. A caller who
       * writes `<Slider aria-label="Volume" />` renders no label element, so
       * `labelProps.id` is undefined and the thumb had no name at all: measured
       * as `role="slider" has no accessible name` on the very first sweep of
       * the library. The group carries the `aria-label`, and `aria-labelledby`
       * resolves through it, so pointing at the group answers both shapes.
       * React Aria does the same, with `data.id` in `useSliderThumb`.
       */
      groupLabelId: () =>
        access(labelProps.id as MaybeAccessor<string | undefined>) ??
        // A thumb labelled by a nameless group would lose the name its own
        // `<label for>` gives it: `aria-labelledby` wins over a label.
        (firstThumbId() !== undefined && !ownName()
          ? undefined
          : access(groupProps.id as MaybeAccessor<string | undefined>)),
      firstThumbId,
      outputProps,
      name: () => props.name?.(),
      form: () => props.form?.(),
    }));
  }

  const elementProps = mergeProps(
    groupProps,
    filterDOMProps(groupOptions, { global: true }),
    styleProps(props),
    {
      "aria-labelledby": () =>
        access(groupProps["aria-labelledby"] as MaybeAccessor<string | undefined>) ?? namedBy(),
      "data-orientation": state.orientation,
      "data-inverted": state.isInverted,
      "data-disabled": state.isDisabled,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <div {...elementProps} ref={mergeRefs(props.ref?.())}>
      <span {...labelProps}>{props.label}</span>
      {() =>
        props.children === undefined ? (
          <>
            <SliderOutput />
            <SliderTrack trackProps={trackProps}>
              {(index: number) => <SliderThumb index={index} />}
            </SliderTrack>
          </>
        ) : (
          props.children
        )
      }
    </div>
  );
}

export interface SliderOutputComponentProps extends StyleProps {
  children?: Child;
}

/** The current value, as text. */
export function SliderOutput(props: Incoming<SliderOutputComponentProps>) {
  const group = useSlider();

  const elementProps = mergeProps(
    group.outputProps,
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <output {...elementProps}>
      {() => (props.children === undefined ? group.state.getFormattedValue() : props.children)}
    </output>
  );
}

export interface SliderTrackComponentProps extends StyleProps {
  /** How one thumb renders. Given its index. */
  children: (index: number) => Child;
  /** Only when composing outside the default layout. */
  trackProps?: DOMProps;
  ref?: RefTarget<HTMLDivElement>;
}

/**
 * The track, and a thumb for every value.
 *
 * A press anywhere on it moves the nearest thumb there, which is what makes a
 * slider usable with one gesture rather than requiring the thumb to be hit.
 */
export function SliderTrack(props: Incoming<SliderTrackComponentProps>) {
  const group = useSlider();
  const render = props.children;

  const elementProps = mergeProps(
    props.trackProps?.() ?? {},
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      "data-orientation": group.state.orientation,
      "data-disabled": group.state.isDisabled,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <div {...elementProps} ref={mergeRefs(group.trackRef.set, props.ref?.())}>
      <For each={() => group.state.values().map((_, index) => index)}>
        {(index: number) => render(index)}
      </For>
    </div>
  );
}

export interface SliderThumbComponentProps extends StyleProps {
  children?: Child;
  /** @default 0 */
  index?: number;
  isDisabled?: boolean;
  "aria-label"?: string;
  ref?: RefTarget<HTMLDivElement>;
}

/**
 * One thumb, over a visually hidden `<input type="range">`.
 *
 * The input is what the keyboard, the form and assistive technology all talk
 * to; the element around it is only what the user sees.
 */
export function SliderThumb(props: Incoming<SliderThumbComponentProps>) {
  const group = useSlider();
  const inputRef = makeRef<HTMLInputElement>();
  const index = props.index?.() ?? 0;

  const { thumbProps, inputProps, isDragging, isFocused, isDisabled } = sliderThumb(
    {
      index,
      trackRef: group.trackRef,
      inputRef,
      baseId: group.baseId,
      id: () => (index === 0 ? group.firstThumbId() : undefined),
      groupLabelId: group.groupLabelId,
      isDisabled: () => props.isDisabled?.(),
      name: group.name,
      form: group.form,
      "aria-label": () => props["aria-label"]?.(),
    },
    group.state,
  );

  const { hoverProps, isHovered } = hover({ isDisabled });
  const { focusProps, isFocusVisible } = focusRing();
  const { visuallyHiddenProps } = visuallyHidden();

  const elementProps = mergeProps(
    thumbProps,
    hoverProps,
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      "data-dragging": isDragging,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-hovered": isHovered,
      "data-disabled": isDisabled,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  const hiddenInputProps = mergeProps(inputProps, focusProps, {
    style: visuallyHiddenProps.style,
  });

  return (
    <div {...elementProps} ref={mergeRefs(props.ref?.())}>
      <input {...hiddenInputProps} ref={inputRef.set} />
      {props.children}
    </div>
  );
}
