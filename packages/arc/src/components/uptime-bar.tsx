import { For, Show, createSignal, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useDirection } from "@barqjs/aria/i18n";
import { srOnly } from "@barqjs/ui/sr-only";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  elevation,
  fg,
  focus,
  gap,
  layout,
  motion,
  place,
  plainList,
  rounded,
  space,
  square,
  surface,
  tone as tones,
  type,
} from "../style/index.ts";
import { chartNumbers } from "./chart-frame.tsx";
import { type ArcMessages, useArcMessages } from "./messages.ts";

/** How a day or a run went: up, partly down, down, or not measured. */
export type UptimeState = "up" | "degraded" | "down" | "none";

/** One day or one run of the strip. */
export interface UptimeCell {
  key: string;
  /** What the cell is, said first: a day, a run's time. */
  label: string;
  /** The share it was up, 0 to 100, or `null` with no data. */
  value?: number | null;
  /** Its state, in place of the one `value` falls in. */
  state?: UptimeState;
  /** What happened, a line each: an incident's title, a report. */
  notes?: readonly string[];
}

/** From `up` a value is up, from `degraded` partly down, and below it down. */
export interface UptimeThresholds {
  up: number;
  degraded: number;
}

const DEFAULT_THRESHOLDS: UptimeThresholds = { up: 99.9, degraded: 95 };

/** The state `value` falls in. */
export function uptimeState(
  value: number | null | undefined,
  thresholds: UptimeThresholds = DEFAULT_THRESHOLDS,
): UptimeState {
  if (value === null || value === undefined || !Number.isFinite(value)) return "none";
  if (value >= thresholds.up) return "up";
  return value >= thresholds.degraded ? "degraded" : "down";
}

function stateWords(messages: ArcMessages, state: UptimeState): string {
  if (state === "up") return messages.uptimeUp;
  if (state === "degraded") return messages.uptimeDegraded;
  if (state === "down") return messages.uptimeDown;
  return messages.uptimeNone;
}

const STATES: readonly UptimeState[] = ["up", "degraded", "down", "none"];

/** Each state's fill: a tone's for the measured ones, the muted fill for no data. */
const STATE_FILL: Record<UptimeState, string> = {
  up: arc(tones.success, bg.toneSolid),
  degraded: arc(tones.warning, bg.toneSolid),
  down: arc(tones.danger, bg.toneSolid),
  none: bg.muted,
};

export const uptimeBarStyles = variants({
  slots: {
    root: arc(layout.column, layout.minZero, gap[2]),
    header: arc(layout.row, layout.between, layout.wrap, gap.line),
    label: arc(type.label),
    summary: arc(type.meta, type.numeric),
    plot: arc(layout.relative),
    cells: arc(layout.row, { alignItems: "stretch", gap: "2px", blockSize: space.x8 }),
    cell: arc(rounded.xs, focus.visible, motion.colours, layout.minZero, {
      flex: "1 1 0",
      outlineOffset: "1px",
      "[data-active]": { opacity: "0.75" },
    }),
    tooltip: arc(surface.elevated, type.xs, place.passive, elevation.raised, {
      insetBlockEnd: `calc(100% + ${space.x2})`,
      paddingInline: space.x2_5,
      paddingBlock: space.x1_5,
      inlineSize: "max-content",
      maxInlineSize: "16rem",
      zIndex: "1",
    }),
    tooltipLabel: arc(type.medium, fg.default),
    tooltipState: arc(type.numeric, fg.muted),
    tooltipNote: arc(layout.clip, layout.nowrap, fg.muted),
    ends: arc(layout.row, layout.between, type.meta),
    legend: arc(plainList, layout.row, layout.wrap, type.meta, gap.line),
    legendItem: arc(layout.inlineRow, gap[1.5]),
    swatch: arc(rounded.xs, layout.noShrink, square.x2),
  },
  variants: {
    size: {
      sm: { cells: arc({ blockSize: space.x4 }) },
      md: {},
    },
  },
  defaults: { size: "md" },
});

export type UptimeBarSlots = ReturnType<typeof uptimeBarStyles>;

export interface UptimeBarProps extends Customisable<UptimeBarSlots> {
  /** Names the strip: a component, a check. */
  label: string;
  /** Oldest first: the newest is at the reading direction's end. */
  cells: readonly UptimeCell[];
  /** Where a value turns from up to partly down to down. @default 99.9 and 95 */
  thresholds?: UptimeThresholds;
  /** The words for each state, in place of arc's "Operational", "Partial outage", "Outage", "No data". */
  stateLabels?: Partial<Record<UptimeState, string>>;
  /** The share up across every cell with data, beside the label. @default true */
  showSummary?: boolean;
  /** The words under the strip's two ends: `"90 days ago"`, `"Today"`. */
  startLabel?: string;
  endLabel?: string;
  /** A key to the states under the strip. @default false */
  legend?: boolean;
  /** The label for a screen reader only, where a heading says it. @default false */
  labelHidden?: boolean;
  /** @default "md" */
  size?: "sm" | "md";
  id?: string;
}

/**
 * How something held up over time, a cell a day or a run, each in a tone:
 * a status page's components, a check's last ninety days, recent results.
 *
 * ```tsx
 * <UptimeBar label="API" startLabel="90 days ago" endLabel="Today"
 *   cells={days.map((day) => ({ key: day.date, label: formatDay(day.date), value: day.uptime }))} />
 * ```
 *
 * The cells are one Tab stop: the arrow keys walk them (Home and End to the
 * ends), and the cell under the pointer, the finger or the focus shows what
 * it was in a tip. Each cell is an image named by its label, its state in
 * words and its share up, so a screen reader hears what the tip shows and
 * the tone is never the only key. The summary averages the cells with data.
 */
export function UptimeBar(props: UptimeBarProps) {
  const messages = useArcMessages();
  const direction = useDirection();
  const percent = chartNumbers({ style: "percent", maximumFractionDigits: 2 });
  const labelId = createUniqueId();
  const [active, setActive] = createSignal<number | undefined>(undefined);
  const [focused, setFocused] = createSignal<number | undefined>(undefined);
  let cellsElement: HTMLElement | undefined;
  function cls(): UptimeBarSlots {
    return parts(uptimeBarStyles({ size: props.size }), props.classes);
  }
  function stateOf(cell: UptimeCell): UptimeState {
    return cell.state ?? uptimeState(cell.value, props.thresholds);
  }
  function words(state: UptimeState): string {
    return props.stateLabels?.[state] ?? stateWords(messages(), state);
  }
  function described(cell: UptimeCell): string {
    const value =
      cell.value === null || cell.value === undefined ? undefined : percent(cell.value / 100);
    return [cell.label, words(stateOf(cell)), value, ...(cell.notes ?? [])]
      .filter((part) => part !== undefined)
      .join(", ");
  }
  function summary(): string {
    const known = props.cells.filter((cell) => cell.value !== null && cell.value !== undefined);
    if (known.length === 0) return words("none");
    const mean = known.reduce((sum, cell) => sum + (cell.value ?? 0), 0) / known.length;
    return messages().uptimeShare(percent(mean / 100));
  }
  function tabStop(): number {
    return focused() ?? props.cells.length - 1;
  }
  function move(to: number): void {
    const last = props.cells.length - 1;
    const next = Math.max(0, Math.min(last, to));
    setFocused(next);
    setActive(next);
    const element = cellsElement?.children[next];
    if (element instanceof HTMLElement) element.focus();
  }
  function onKeyDown(event: KeyboardEvent, at: number): void {
    const forward = direction() === "rtl" ? "ArrowLeft" : "ArrowRight";
    const back = direction() === "rtl" ? "ArrowRight" : "ArrowLeft";
    if (event.key === forward) move(at + 1);
    else if (event.key === back) move(at - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(props.cells.length - 1);
    else if (event.key === "Escape") setActive(undefined);
    else return;
    event.preventDefault();
  }
  function shown(): UptimeCell | undefined {
    const at = active();
    return at === undefined ? undefined : props.cells[at];
  }
  function tipPlace(): Record<string, string> {
    const at = active() ?? 0;
    const count = Math.max(1, props.cells.length);
    const share = (at + 0.5) / count;
    const sign = direction() === "rtl" ? 1 : -1;
    const shift = share < 0.15 ? 0 : share > 0.85 ? 100 : 50;
    return {
      "inset-inline-start": `${String(Math.round(share * 10000) / 100)}%`,
      translate: `${String(sign * shift)}% 0`,
    };
  }
  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="uptime-bar"
      role="group"
      aria-labelledby={labelId}
    >
      <div class={cls().header} data-slot="uptime-bar-header">
        <span
          class={props.labelHidden === true ? srOnly : cls().label}
          id={labelId}
          data-slot="uptime-bar-label"
        >
          {props.label}
        </span>
        <Show when={props.showSummary !== false}>
          <span class={cls().summary} data-slot="uptime-bar-summary">
            {summary()}
          </span>
        </Show>
      </div>
      <div class={cls().plot} data-slot="uptime-bar-plot">
        <div
          class={cls().cells}
          data-slot="uptime-bar-cells"
          ref={(element: HTMLElement) => {
            cellsElement = element;
          }}
          onPointerLeave={() => {
            if (focused() === undefined) setActive(undefined);
          }}
        >
          <For each={() => props.cells}>
            {(cell: UptimeCell, at: () => number) => (
              <span
                class={arc(cls().cell, STATE_FILL[stateOf(cell)])}
                data-slot="uptime-bar-cell"
                data-state={stateOf(cell)}
                data-active={active() === at() ? "" : undefined}
                role="img"
                aria-label={described(cell)}
                tabIndex={tabStop() === at() ? 0 : -1}
                onPointerEnter={() => setActive(at())}
                onPointerDown={() => setActive(at())}
                onFocus={() => {
                  setFocused(at());
                  setActive(at());
                }}
                onBlur={() => {
                  setActive(undefined);
                }}
                onKeyDown={(event: KeyboardEvent) => onKeyDown(event, at())}
              />
            )}
          </For>
        </div>
        <Show when={shown()}>
          {(cell: () => UptimeCell) => (
            <div
              class={cls().tooltip}
              data-slot="uptime-bar-tooltip"
              aria-hidden="true"
              style={tipPlace()}
            >
              <div class={cls().tooltipLabel}>{cell().label}</div>
              <div class={cls().tooltipState}>
                {[
                  words(stateOf(cell())),
                  cell().value === null || cell().value === undefined
                    ? undefined
                    : percent((cell().value ?? 0) / 100),
                ]
                  .filter((part) => part !== undefined)
                  .join(", ")}
              </div>
              <For each={() => cell().notes ?? []}>
                {(note: string) => <div class={cls().tooltipNote}>{note}</div>}
              </For>
            </div>
          )}
        </Show>
      </div>
      <Show when={props.startLabel !== undefined || props.endLabel !== undefined}>
        <div class={cls().ends} data-slot="uptime-bar-ends" aria-hidden="true">
          <span>{props.startLabel}</span>
          <span>{props.endLabel}</span>
        </div>
      </Show>
      <Show when={props.legend === true}>
        <ul class={cls().legend} data-slot="uptime-bar-legend">
          <For each={STATES}>
            {(state: UptimeState) => (
              <li class={cls().legendItem} data-slot="uptime-bar-legend-item">
                <span
                  class={arc(cls().swatch, STATE_FILL[state])}
                  data-state={state}
                  aria-hidden="true"
                />
                {words(state)}
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
