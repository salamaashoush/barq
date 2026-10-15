import { useDirection } from "@barqjs/aria/i18n";
import { progressBar } from "@barqjs/aria/link";
import { fromProps, id, mergeProps } from "@barqjs/aria/utils";
import {
  Show,
  createContext,
  createSignal,
  getContext,
  isBlock,
  onCleanup,
  provide,
  type Accessor,
  type Child,
  type Incoming,
} from "@barqjs/core";
import { layer } from "@barqjs/css";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { text } from "../lib/shared-text.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const ui = layer("barq.ui");

const track = ui({
  position: "relative",
  display: "flex",
  height: "var(--spacing)",
  width: "100%",
  alignItems: "center",
  // `overflow-x`, not `overflow`: the label beside the fill is positioned
  // outside the track and clipping both axes would take it with it.
  overflowX: "hidden",
  borderRadius: "calc(infinity * 1px)",
  backgroundColor: "var(--muted)",
});

const bar = ui(box.transition, {
  height: "100%",
  width: "100%",
  flex: "1",
  backgroundColor: "var(--primary)",
  transitionProperty: "all",
});

const stack = ui({
  display: "flex",
  flexWrap: "wrap",
  gap: "calc(var(--spacing) * 3)",
});

const caption = ui(text.sm, text.medium);

const amount = ui(text.sm, {
  marginInlineStart: "auto",
  color: "var(--muted-foreground)",
  fontVariantNumeric: "tabular-nums",
});

export interface ProgressProps extends UiProps {
  /** 0 to `maxValue`. @default 0 */
  value?: number;
  minValue?: number;
  maxValue?: number;
  /** shadcn's spelling of `maxValue`. */
  max?: number;
  isIndeterminate?: boolean;
  /** Rendered visually hidden, and what names the bar. */
  label?: string;
  /** What a screen reader says instead of the formatted percentage. */
  valueLabel?: string;
  /** The same, computed from the numbers: `(2, 4) => "2 of 4"`. */
  getValueLabel?: (value: number, max: number) => string;
  /** @default { style: "percent" } */
  formatOptions?: Intl.NumberFormatOptions;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

type ProgressStatus = "loading" | "complete" | "indeterminate";

interface ProgressValueOf {
  readonly status: Accessor<ProgressStatus>;
  readonly value: Accessor<number | null>;
  readonly max: Accessor<number>;
  /** What the bar says its value is, or `undefined` when it does not know. */
  readonly text: Accessor<string | undefined>;
  readonly fill: Accessor<Record<string, string>>;
  readonly labelId: Accessor<string>;
  readonly setLabelled: (present: boolean) => void;
}

const ProgressContext = createContext<ProgressValueOf | null>(null);

function useProgress(): ProgressValueOf {
  const value = getContext(ProgressContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a <Progress>.");
  }
  return value;
}

/**
 * ```tsx
 * <Progress value={60} label="Upload" />
 * ```
 *
 * Built on the `progressBar` hook rather than `@barqjs/aria`'s component,
 * because that one renders the value as visible text — right for a bar with a
 * number beside it, and inside this track it would be text on top of the fill.
 *
 * Give it a `label` or an `aria-label`. A progress bar with neither is a
 * rectangle a screen reader announces as "progress bar, 60 percent" with no
 * word about what is at sixty percent.
 */
export function Progress(props: Incoming<ProgressProps>) {
  const direction = useDirection();
  const labelId = id();
  // `ownedWrite`: a `<ProgressLabel>` announces itself while it is being built.
  const [labelled, setLabelled] = createSignal(false, { ownedWrite: true });

  const max = (): number => props.maxValue?.() ?? props.max?.() ?? 100;
  const { progressBarProps, labelProps, percentage, valueText } = progressBar({
    ...fromProps(props),
    formatOptions: props.formatOptions?.(),
    maxValue: max,
    valueLabel: () =>
      props.getValueLabel?.()?.(props.value?.() ?? 0, max()) ?? props.valueLabel?.(),
    "aria-labelledby": () =>
      [props["aria-labelledby"]?.(), labelled() ? labelId() : undefined]
        .filter((part) => part !== undefined)
        .join(" ") || undefined,
  });

  const indeterminate = (): boolean => props.isIndeterminate?.() === true;
  const status = (): ProgressStatus =>
    indeterminate() ? "indeterminate" : percentage() >= 1 ? "complete" : "loading";
  const value = (): number | null => (indeterminate() ? null : (props.value?.() ?? 0));

  // The fill starts at the reading edge, which right to left is the right one.
  const fill = (): Record<string, string> => {
    const hidden = indeterminate() ? 50 : 100 - percentage() * 100;
    return { transform: `translateX(${direction() === "rtl" ? "" : "-"}${String(hidden)}%)` };
  };

  const context: ProgressValueOf = {
    status,
    value,
    max,
    text: valueText,
    fill,
    labelId,
    setLabelled,
  };

  const composed = props.children !== undefined;

  const elementProps = mergeProps(progressBarProps, {
    "data-slot": "progress",
    "data-state": status,
    "data-value": () => value() ?? undefined,
    "data-max": max,
    "data-testid": () => props["data-testid"]?.(),
    class: () => ui(composed ? stack : track, props.class?.(), props.className?.()),
    style: () => props.style?.(),
  });

  return (
    <div {...elementProps}>
      <Show when={props.label?.() !== undefined}>
        <span {...labelProps} class={visuallyHidden}>
          {props.label}
        </span>
      </Show>
      <ProgressProvider value={context}>
        {composed ? (
          <>
            {props.children}
            <ProgressTrack>
              <ProgressIndicator />
            </ProgressTrack>
          </>
        ) : (
          <ProgressIndicator />
        )}
      </ProgressProvider>
    </div>
  );
}

function ProgressProvider(props: Incoming<{ value: ProgressValueOf; children?: Child }>) {
  return provide(
    ProgressContext,
    () => props.value(),
    () => props.children,
  );
}

/** The pill the fill moves inside, when the bar has a label and a value above it. */
export function ProgressTrack(props: Incoming<UiProps>) {
  return <div {...uiProps("progress-track", track, props)}>{props.children}</div>;
}

export function ProgressIndicator(props: Incoming<Omit<UiProps, "children">>) {
  const progress = useProgress();
  return (
    <div
      {...uiProps("progress-indicator", bar, props)}
      data-state={() => progress.status()}
      data-value={() => progress.value() ?? undefined}
      data-max={() => progress.max()}
      style={progress.fill()}
    />
  );
}

/** Visible text that names the bar: the root points its `aria-labelledby` here. */
export function ProgressLabel(props: Incoming<UiProps>) {
  const progress = useProgress();
  progress.setLabelled(true);
  onCleanup(() => progress.setLabelled(false));

  return (
    <span {...uiProps("progress-label", caption, props)} id={() => progress.labelId()}>
      {props.children}
    </span>
  );
}

export interface ProgressValueProps extends Omit<UiProps, "children"> {
  /** Writes the value out from the numbers. Both are `null` while indeterminate. */
  children?: (formatted: string | null, value: number | null) => Child;
}

/**
 * The value as text, for a sighted reader. Hidden from assistive technology,
 * which already has it as the bar's `aria-valuetext` and would read it twice.
 */
export function ProgressValue(props: Incoming<ProgressValueProps>) {
  const progress = useProgress();

  type Render = (formatted: string | null, value: number | null) => Child;
  const given = props.children as unknown;
  const render: Render | undefined =
    given === undefined || given === null
      ? undefined
      : isBlock(given)
        ? (given as Render)
        : (given as () => Render)();

  const formatted = (): string | null => progress.text() ?? null;

  return (
    <span {...uiProps("progress-value", amount, props)} aria-hidden="true">
      {() => (render === undefined ? formatted() : render(formatted(), progress.value()))}
    </span>
  );
}

/** The label is named to assistive technology and drawn nowhere. */
const visuallyHidden = ui({
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: "0",
  margin: "-1px",
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  borderWidth: "0",
});
