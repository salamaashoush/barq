import { For, Show, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { controllable } from "@barqjs/aria/utils";
import { tokens } from "@barqjs/ui/theme/tokens";
import { ToggleGroup, ToggleGroupItem } from "@barqjs/ui/toggle-group";

import { arcLayer as arc } from "../layer.ts";
import { type ArcFieldProps, type FieldValueProps, Frame, bindField } from "../lib/field.tsx";
import { type Customisable, parts } from "../lib/parts.ts";
import { type SearchParamState, useSearchParam } from "../lib/search-state.ts";
import { fg, gap, glyph, layout, space, tone as tones, type } from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import type { NavIcon } from "./app-shell.tsx";
import { statusVariants } from "./status.tsx";

/** One choice in a segmented control. */
export interface Segment {
  /** `""` is a choice too: the default, such as "Browser default". */
  value: string;
  label: string;
  /** How many it holds, in faint numerals after the label. */
  count?: number;
  /** A dot in this tone before the label; the label carries the meaning. */
  tone?: Tone;
  icon?: NavIcon;
  isDisabled?: boolean;
}

export const segmentedControlStyles = variants({
  slots: {
    root: arc(layout.minZero, { overflowX: "auto", overscrollBehaviorX: "contain" }),
    group: arc({ "&[data-invalid] > *": { borderColor: tokens.destructive } }),
    item: arc(gap[1.5], glyph.md),
    dot: arc({ width: space.x1_5, height: space.x1_5 }),
    count: arc(fg.faint, type.numeric),
  },
  variants: {
    size: {
      sm: { item: arc({ paddingInline: space.x2_5 }) },
      default: { item: arc({ paddingInline: space.x3 }) },
    },
  },
  defaults: { size: "default" },
});

type Slots = ReturnType<typeof segmentedControlStyles>;

/** A key the toggle group can hold for the `""` segment, which it would read as nothing pressed. */
const BLANK = "__arc-blank";
/** No segment held. */
const NONE = "__arc-none";

function keyOf(value: string): string {
  return value === "" ? BLANK : value;
}

function valueOf(key: string): string {
  return key === BLANK ? "" : key;
}

interface SegmentedCommon extends Customisable<Slots> {
  items: readonly Segment[];
  /** Names the group: "State", "Projects to show". */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  /** @default "default" */
  size?: "sm" | "default";
  isDisabled?: boolean;
  isInvalid?: boolean;
  /** Submitted under this name by a plain `<form>`, one input per value. */
  name?: string;
  id?: string;
}

export interface SegmentedControlProps extends SegmentedCommon {
  /** `null` holds none, for a choice made elsewhere: a custom range beside the presets. */
  value?: string | null;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /**
   * Kept in this search parameter, the default segment (`defaultValue`, else
   * the first) leaving it out, and an unknown value falling back to it.
   */
  param?: string;
}

export interface MultiSegmentedControlProps extends SegmentedCommon {
  value?: readonly string[];
  defaultValue?: readonly string[];
  onChange?: (value: string[]) => void;
  /** Kept in this search parameter, joined by commas. */
  param?: string;
}

interface SegmentsProps extends SegmentedCommon {
  multiple: boolean;
  keys: readonly string[];
  onKeys: (keys: string[]) => void;
}

function Segments(props: SegmentsProps) {
  function cls(): Slots {
    return parts(segmentedControlStyles({ size: props.size ?? "default" }), props.classes);
  }
  function names(): readonly string[] {
    return props.keys.map(valueOf);
  }
  return (
    <div class={arc(cls().root, props.class, props.className)} data-slot="segmented-control">
      <ToggleGroup
        type={props.multiple ? "multiple" : "single"}
        variant="outline"
        size={props.size ?? "default"}
        class={cls().group}
        data-slot="segmented-control-group"
        id={props.id}
        aria-label={props["aria-label"]}
        aria-labelledby={props["aria-labelledby"]}
        aria-describedby={props["aria-describedby"]}
        data-invalid={props.isInvalid === true ? "" : undefined}
        isDisabled={props.isDisabled}
        value={props.multiple ? props.keys : (props.keys[0] ?? "")}
        onValueChange={(next: string | string[]) => {
          const keys = typeof next === "string" ? (next === "" ? [] : [next]) : next;
          if (keys.length === 0) return;
          props.onKeys(keys);
        }}
      >
        <For each={() => props.items}>
          {(segment: Segment) => {
            const Icon = segment.icon;
            return (
              <ToggleGroupItem
                value={keyOf(segment.value)}
                class={cls().item}
                data-slot="segmented-control-item"
                isDisabled={segment.isDisabled}
              >
                <Show when={segment.tone !== undefined}>
                  <span
                    class={arc(statusVariants().dot, tones[segment.tone ?? "neutral"], cls().dot)}
                    data-slot="segmented-control-dot"
                    aria-hidden="true"
                  />
                </Show>
                {Icon === undefined ? null : <Icon />}
                {segment.label}
                <Show when={segment.count !== undefined}>
                  <span class={cls().count} data-slot="segmented-control-count">
                    {String(segment.count)}
                  </span>
                </Show>
              </ToggleGroupItem>
            );
          }}
        </For>
      </ToggleGroup>
      <Show when={props.name !== undefined}>
        <For each={names}>
          {(value: string) => <input type="hidden" name={props.name} value={value} />}
        </For>
      </Show>
    </div>
  );
}

function first(items: readonly Segment[]): string {
  return items.find((segment) => segment.isDisabled !== true)?.value ?? "";
}

function known(items: readonly Segment[], value: string | undefined): string | undefined {
  return value !== undefined && items.some((segment) => segment.value === value)
    ? value
    : undefined;
}

/**
 * One choice among a few, always one held: a status subset, a time window, a
 * view. Each segment may carry a count and a tone dot.
 *
 * ```tsx
 * <SegmentedControl
 *   aria-label="State"
 *   param="state"
 *   items={[
 *     { value: "open", label: "Open", count: 3, tone: "danger" },
 *     { value: "resolved", label: "Resolved", tone: "success" },
 *     { value: "all", label: "All" },
 *   ]}
 * />
 * ```
 *
 * On ui's toggle group: one Tab stop, the arrows moving in the reading
 * direction, and pressing the held segment again keeps it. It scrolls
 * sideways in a narrow container rather than wrapping.
 */
export function SegmentedControl(props: SegmentedControlProps) {
  const param = untrack(() => props.param);
  const fallback = untrack(() => known(props.items, props.defaultValue) ?? first(props.items));
  const url: SearchParamState<string> | undefined =
    param === undefined
      ? undefined
      : useSearchParam<string>(param, {
          defaultValue: fallback,
          parse: (raw) => known(props.items, raw),
        });
  const [own, setOwn] = controllable<string>(
    () => (props.value === null ? NONE : known(props.items, props.value)),
    () => fallback,
    (next) => props.onChange?.(next),
  );
  function current(): string {
    return url === undefined ? own() : url.value();
  }
  function keys(): string[] {
    return current() === NONE ? [] : [keyOf(current())];
  }
  function choose(next: string): void {
    if (next === current()) return;
    if (url === undefined) setOwn(next);
    else {
      url.setValue(next);
      props.onChange?.(next);
    }
  }
  return (
    <Segments
      {...props}
      multiple={false}
      keys={keys()}
      onKeys={(pressedKeys) => {
        const pressed = pressedKeys.find((key) => key !== keyOf(current())) ?? pressedKeys[0];
        if (pressed !== undefined) choose(valueOf(pressed));
      }}
    />
  );
}

/** The items' own order, whatever order they were pressed in. */
function ordered(items: readonly Segment[], values: readonly string[]): string[] {
  return items.map((segment) => segment.value).filter((value) => values.includes(value));
}

/**
 * Several of a few choices at once, at least one always held: the browsers a
 * check runs on. The value keeps the items' order whatever order they were
 * pressed in, and releasing the last held segment is refused.
 */
export function MultiSegmentedControl(props: MultiSegmentedControlProps) {
  const param = untrack(() => props.param);
  const fallback = untrack(() => ordered(props.items, props.defaultValue ?? []));
  const url: SearchParamState<string[]> | undefined =
    param === undefined
      ? undefined
      : useSearchParam<string[]>(param, {
          defaultValue: fallback,
          parse: (raw) => {
            const values = ordered(props.items, raw.split(","));
            return values.length === 0 ? undefined : values;
          },
          format: (values) => values.join(","),
        });
  const [own, setOwn] = controllable<string[]>(
    () => (props.value === undefined ? undefined : ordered(props.items, props.value)),
    () => fallback,
    (next) => props.onChange?.(next),
  );
  function current(): readonly string[] {
    return url === undefined ? own() : url.value();
  }
  return (
    <Segments
      {...props}
      multiple
      keys={current().map(keyOf)}
      onKeys={(keys) => {
        const next = ordered(props.items, keys.map(valueOf));
        if (next.length === 0) return;
        if (url === undefined) setOwn(next);
        else {
          url.setValue(next);
          props.onChange?.(next);
        }
      }}
    />
  );
}

export interface SegmentedFieldProps extends ArcFieldProps, FieldValueProps<string> {
  items: readonly Segment[];
  size?: "sm" | "default";
}

/**
 * A `SegmentedControl` with its label, description and error, standing alone
 * or as `field.SegmentedField` in an arc form.
 */
export function SegmentedField(props: SegmentedFieldProps) {
  const of = bindField<string>(
    props,
    untrack(() => first(props.items)),
  );
  return (
    <Frame
      of={of}
      label={props.label}
      description={props.description}
      field={props}
      labelledById
      slot="segmented-field"
    >
      <SegmentedControl
        class={props.classes?.control}
        items={props.items}
        size={props.size}
        aria-labelledby={of.ids.label}
        aria-describedby={of.describedBy(props.description !== undefined)}
        isInvalid={of.isInvalid()}
        isDisabled={props.isDisabled}
        name={of.name()}
        value={of.value()}
        onChange={(next) => {
          of.change(next);
          of.blur();
        }}
      />
    </Frame>
  );
}

export interface MultiSegmentedFieldProps extends ArcFieldProps, FieldValueProps<string[]> {
  items: readonly Segment[];
  size?: "sm" | "default";
}

/** A `MultiSegmentedControl` with its label, description and error, or `field.MultiSegmentedField`. */
export function MultiSegmentedField(props: MultiSegmentedFieldProps) {
  const of = bindField<string[]>(props, []);
  return (
    <Frame
      of={of}
      label={props.label}
      description={props.description}
      field={props}
      labelledById
      slot="multi-segmented-field"
    >
      <MultiSegmentedControl
        class={props.classes?.control}
        items={props.items}
        size={props.size}
        aria-labelledby={of.ids.label}
        aria-describedby={of.describedBy(props.description !== undefined)}
        isInvalid={of.isInvalid()}
        isDisabled={props.isDisabled}
        name={of.name()}
        value={of.value()}
        onChange={(next) => {
          of.change(next);
          of.blur();
        }}
      />
    </Frame>
  );
}
