import { For, Show, createEffect, createMemo, createSignal, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { controllable } from "@barqjs/aria/utils";
import { useLocale } from "@barqjs/aria/i18n";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { ArrowDownToLine } from "@barqjs/lucide/icons/arrow-down-to-line";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { virtual } from "@barqjs/primitives/virtual";
import { srOnly } from "@barqjs/ui/sr-only";
import { Toggle } from "@barqjs/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@barqjs/ui/toggle-group";
import { isServer } from "@barqjs/web";

import { lightHighlightLines } from "../code/light-highlight.ts";
import { codeSurface } from "../code/style.ts";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  control,
  edge,
  fg,
  focus,
  gap,
  glyph,
  interaction,
  layout,
  place,
  rounded,
  space,
  surface,
  type,
} from "../style/index.ts";
import { CopyButton } from "./copy-button.tsx";
import { EmptyState } from "./empty-state.tsx";
import { expandChevron } from "./expand-chevron.ts";
import { FormattedDate } from "./format.tsx";
import { type ArcMessages, useArcMessages } from "./messages.ts";
import { RedactedText } from "./secret-display.tsx";

export type LogLevel = "error" | "warn" | "info" | "log" | "debug";

export const LOG_LEVELS: readonly LogLevel[] = ["error", "warn", "info", "log", "debug"];

export interface LogEntry {
  /** Keeps the line's row as lines arrive. @default its index */
  id?: string;
  /** @default "log" */
  level?: LogLevel;
  /** A clock time (a `Date`, an ISO string), or milliseconds since the run began. */
  time?: Date | string | number;
  /** Where it came from: `page`, `script`, a worker's name. */
  source?: string;
  text: string;
}

/** A run of text in one ANSI style. */
export interface AnsiSegment {
  text: string;
  /** `red`, `green`, ..., `bright-red`, ... */
  colour?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

const COLOURS = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];

const ESC = String.fromCharCode(27);
const SEQUENCE = new RegExp(`${ESC}\\[([0-9;]*)([A-Za-z])`, "g");

/**
 * `text` cut into runs by its ANSI SGR codes (colour, bold, dim, italic,
 * underline), every other escape sequence dropped.
 */
export function ansiSegments(text: string): AnsiSegment[] {
  const out: AnsiSegment[] = [];
  let style: Omit<AnsiSegment, "text"> = {};
  let last = 0;
  function push(piece: string): void {
    if (piece !== "") out.push({ text: piece, ...style });
  }
  for (const match of text.matchAll(SEQUENCE)) {
    push(text.slice(last, match.index));
    last = (match.index ?? 0) + match[0].length;
    if (match[2] !== "m") continue;
    const codes = (match[1] ?? "").split(";").map((one) => (one === "" ? 0 : Number(one)));
    for (const code of codes) {
      if (code === 0) style = {};
      else if (code === 1) style = { ...style, bold: true };
      else if (code === 2) style = { ...style, dim: true };
      else if (code === 3) style = { ...style, italic: true };
      else if (code === 4) style = { ...style, underline: true };
      else if (code === 22) style = { ...style, bold: false, dim: false };
      else if (code === 23) style = { ...style, italic: false };
      else if (code === 24) style = { ...style, underline: false };
      else if (code === 39) style = { ...style, colour: undefined };
      else if (code >= 30 && code <= 37) style = { ...style, colour: COLOURS[code - 30] };
      else if (code >= 90 && code <= 97)
        style = { ...style, colour: `bright-${COLOURS[code - 90] ?? ""}` };
    }
  }
  push(text.slice(last));
  return out;
}

/** `text` with its ANSI escape sequences taken out. */
export function stripAnsi(text: string): string {
  return text.replace(SEQUENCE, "");
}

/** The parsed value of a line that is a JSON object or array, or `undefined`. */
function jsonOf(text: string): unknown {
  const trimmed = text.trim();
  const first = trimmed[0];
  if (first !== "{" && first !== "[") return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function lineCount(text: string): number {
  let count = 1;
  for (let at = text.indexOf("\n"); at !== -1; at = text.indexOf("\n", at + 1)) count++;
  return count;
}

/** ANSI colours in arc's tones, for text drawn by `AnsiText` anywhere inside. */
export const ansiColours = arc({
  "& [data-ansi=red], & [data-ansi=bright-red]": { color: "var(--danger-foreground)" },
  "& [data-ansi=green], & [data-ansi=bright-green]": { color: "var(--success-foreground)" },
  "& [data-ansi=yellow], & [data-ansi=bright-yellow]": { color: "var(--warning-foreground)" },
  "& [data-ansi=blue], & [data-ansi=bright-blue]": { color: "var(--info-foreground)" },
  "& [data-ansi=magenta], & [data-ansi=bright-magenta]": { color: "var(--code-keyword)" },
  "& [data-ansi=cyan], & [data-ansi=bright-cyan]": { color: "var(--code-type)" },
  "& [data-ansi=black], & [data-ansi=bright-black]": { color: "var(--neutral-foreground)" },
  "& [data-dim]": { opacity: "0.7" },
  "& [data-italic]": { fontStyle: "italic" },
  "& [data-underline]": { textDecorationLine: "underline" },
});

const ansiBold = arc({ fontWeight: "var(--font-weight-semibold)" });

const LINE = 20;
const ROW_PAD = 4;
/** Below this many lines every line is drawn, so the browser's find reaches them all. */
const WHOLE = 300;

export const consoleLogStyles = variants({
  slots: {
    root: arc(layout.column, layout.minZero, layout.clip, surface.bordered, surface.sunken),
    toolbar: arc(layout.row, layout.wrap, gap[2], edge.bottom, {
      padding: space.x2,
    }),
    levels: arc(layout.minZero, layout.scrollInline),
    level: arc({}),
    count: arc(type.numeric, fg.muted, { marginInlineStart: space.x1 }),
    search: control.filter,
    follow: arc(glyph.sm, gap[1]),
    copy: arc(layout.pushEnd),
    viewport: arc(codeSurface, focus.outline, ansiColours, {
      overflow: "auto",
      maxHeight: "var(--log-max-height, none)",
      overscrollBehavior: "contain",
      lineHeight: "20px",
    }),
    lines: arc({ minWidth: "max-content", paddingBlock: space.x1 }),
    line: arc(layout.row, gap[3], {
      paddingBlock: "2px",
      paddingInline: space.x3,
      alignItems: "flex-start",
      "&[data-level=error]": {
        backgroundColor: "var(--danger-subtle)",
        color: "var(--danger-foreground)",
      },
      "&[data-level=warn]": {
        backgroundColor: "var(--warning-subtle)",
        color: "var(--warning-foreground)",
      },
      "&[data-level=debug]": { color: "var(--muted-foreground)" },
    }),
    time: arc(type.numeric, layout.noShrink, fg.faint, { minWidth: "6ch" }),
    levelName: arc(layout.noShrink, { width: "5ch", textTransform: "lowercase", opacity: "0.8" }),
    source: arc(layout.noShrink, fg.faint),
    message: arc(layout.column, { whiteSpace: "pre", minWidth: "0px" }),
    expand: arc(
      control.bare,
      layout.inlineRow,
      glyph.sm,
      rounded.sm,
      focus.visible,
      interaction.hoverText,
      {
        alignSelf: "flex-start",
        height: "20px",
      },
    ),
    json: arc(type.written, { paddingBlock: space.x1 }),
    empty: arc(layout.grow, { padding: space.x6 }),
    jump: arc(
      layout.inlineRow,
      gap[1],
      glyph.sm,
      surface.elevated,
      focus.visible,
      interaction.pressable,
      type.meta,
      place.endCorner,
      place.paddedStrip,
      { position: "absolute" },
    ),
    frame: arc(layout.relative, layout.column, layout.minZero, layout.grow, layout.minZeroBlock),
    ansiBold,
  },
  variants: {
    sized: {
      true: {
        root: arc({ height: "var(--log-height)" }),
        viewport: arc(layout.grow, layout.minZeroBlock, { flexBasis: "0px" }),
      },
      false: { viewport: arc({ height: "24rem" }) },
    },
  },
  defaults: { sized: false },
});

type Slots = ReturnType<typeof consoleLogStyles>;

export interface ConsoleLogViewProps extends Customisable<Slots> {
  entries: readonly LogEntry[];
  /** Names the log. @default "Log" */
  "aria-label"?: string;
  /** The levels shown. @default every level */
  levels?: readonly LogLevel[];
  defaultLevels?: readonly LogLevel[];
  onLevelsChange?: (levels: LogLevel[]) => void;
  /** Only lines holding this text, case aside. */
  query?: string;
  defaultQuery?: string;
  onQueryChange?: (query: string) => void;
  /** Keep the newest line in view as lines arrive. Scrolling up turns it off. @default on while `live`, from when it turns on */
  follow?: boolean;
  defaultFollow?: boolean;
  onFollowChange?: (follow: boolean) => void;
  /** Lines are still arriving: new ones are announced politely, and following is on to start. */
  live?: boolean;
  /** `none` leaves the time column out. @default "auto", a clock time or an offset by what `time` holds */
  timestamps?: "auto" | "none";
  /** @default true */
  toolbar?: boolean;
  /** What a redaction looks like in a line, its first group the secret's name. @default `RedactedText`'s, `[redacted: NAME]` */
  redaction?: RegExp;
  /**
   * The whole log's height, its toolbar included, the lines taking what is
   * left: a CSS length, pixels, or `100%` to fill a container that has a
   * height, a resizable panel's. @default the lines are 24rem tall
   */
  height?: string | number;
  /** Still fetching the log. */
  isLoading?: boolean;
  /** Why the log could not be read. */
  errorMessage?: string;
}

interface Row {
  key: string;
  entry: LogEntry;
  level: LogLevel;
  json: unknown;
}

interface LineProps {
  row: Row;
  expanded: boolean;
  onToggle: () => void;
  showTime: boolean;
  redaction: RegExp | undefined;
  classes: Slots;
  messages: ArcMessages;
}

function cssLength(value: string | number): string {
  return typeof value === "number" ? `${String(value)}px` : value;
}

function levelName(level: LogLevel, messages: ArcMessages): string {
  switch (level) {
    case "error":
      return messages.logError;
    case "warn":
      return messages.logWarning;
    case "info":
      return messages.logInfo;
    case "debug":
      return messages.logDebug;
    default:
      return messages.logLog;
  }
}

interface TimeProps {
  time: Date | string | number;
  classes: Slots;
}

function Time(props: TimeProps) {
  const locale = useLocale();
  function offset(): string {
    const seconds = (props.time as number) / 1000;
    return new Intl.NumberFormat(locale().locale, {
      style: "unit",
      unit: "second",
      unitDisplay: "narrow",
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(seconds);
  }
  return (
    <span class={props.classes.time} data-slot="console-log-time">
      <Show
        when={typeof props.time === "number"}
        fallback={
          <FormattedDate
            value={props.time}
            options={{
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              fractionalSecondDigits: 3,
              hourCycle: "h23",
            }}
          />
        }
      >
        {offset()}
      </Show>
    </span>
  );
}

export interface AnsiTextProps {
  text: string;
  /** What a redaction looks like in the text, as `ConsoleLogView` takes it. */
  redaction?: RegExp;
  /** On a bold run. @default arc's semibold */
  boldClass?: string;
}

/**
 * Text with ANSI style codes drawn as spans, each run marked with its colour
 * and style; `ansiColours` on an ancestor colours them in arc's tones.
 */
export function AnsiText(props: AnsiTextProps) {
  return (
    <For each={ansiSegments(props.text)}>
      {(segment: AnsiSegment) => (
        <span
          class={segment.bold === true ? (props.boldClass ?? ansiBold) : undefined}
          data-ansi={segment.colour}
          data-dim={segment.dim === true ? "" : undefined}
          data-italic={segment.italic === true ? "" : undefined}
          data-underline={segment.underline === true ? "" : undefined}
        >
          <RedactedText text={segment.text} pattern={props.redaction} />
        </span>
      )}
    </For>
  );
}

function Line(props: LineProps) {
  return (
    <div
      class={props.classes.line}
      data-slot="console-log-line"
      data-level={props.row.level}
      role="listitem"
    >
      <Show when={props.showTime}>
        <Show
          when={props.row.entry.time !== undefined}
          fallback={<span class={props.classes.time} />}
        >
          <Time time={props.row.entry.time as Date | string | number} classes={props.classes} />
        </Show>
      </Show>
      <span class={props.classes.levelName} data-slot="console-log-level">
        {levelName(props.row.level, props.messages)}
      </span>
      <Show when={props.row.entry.source !== undefined}>
        <span class={props.classes.source} data-slot="console-log-source">
          {props.row.entry.source}
        </span>
      </Show>
      <div class={props.classes.message} data-slot="console-log-message" dir="ltr">
        <Show
          when={props.row.json !== undefined}
          fallback={
            <span>
              <AnsiText
                text={props.row.entry.text}
                redaction={props.redaction}
                boldClass={props.classes.ansiBold}
              />
            </span>
          }
        >
          <span class={arc(layout.inlineRow, gap[1])}>
            <button
              type="button"
              class={props.classes.expand}
              data-slot="console-log-expand"
              aria-expanded={props.expanded ? "true" : "false"}
              aria-label={props.expanded ? props.messages.logCollapse : props.messages.logExpand}
              onClick={() => props.onToggle()}
            >
              <ChevronRight class={expandChevron} aria-hidden="true" />
            </button>
            <span>{props.row.entry.text}</span>
          </span>
          <Show when={props.expanded}>
            <div
              class={props.classes.json}
              data-slot="console-log-json"
              innerHTML={lightHighlightLines(JSON.stringify(props.row.json, null, 2), "json").join(
                "\n",
              )}
            />
          </Show>
        </Show>
      </div>
    </div>
  );
}

/**
 * A console's or a server's output to read: levelled lines with their time
 * and source, filtered by level and by text, following the newest line as it
 * arrives, copied whole.
 *
 * ```tsx
 * <ConsoleLogView
 *   entries={[
 *     { level: "error", time: 1250, source: "page", text: "TypeError: x is undefined" },
 *     { level: "log", time: 1310, source: "script", text: "{\"status\":200}" },
 *   ]}
 * />
 * ```
 *
 * Colour and style codes in a line are drawn, a line that is a JSON object
 * or array opens to its formatted value, and a long log draws only the lines
 * in view. Each line names its level in words. The log is a Tab stop, so a
 * keyboard scrolls it, and with `live` new lines are announced politely.
 * The copy holds the lines shown, with their level and source.
 */
export function ConsoleLogView(props: ConsoleLogViewProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(consoleLogStyles({ sized: props.height !== undefined }), props.classes);
  }
  const [levels, setLevels] = controllable<readonly LogLevel[]>(
    () => props.levels,
    () => props.defaultLevels ?? LOG_LEVELS,
    (next) => props.onLevelsChange?.([...next]),
  );
  const [query, setQuery] = controllable<string>(
    () => props.query,
    () => props.defaultQuery ?? "",
    (next) => props.onQueryChange?.(next),
  );
  const [follow, setFollow] = controllable<boolean>(
    () => props.follow,
    () => props.defaultFollow ?? props.live === true,
    (next) => props.onFollowChange?.(next),
  );
  const [expanded, setExpanded] = createSignal<ReadonlySet<string>>(new Set());
  const [atEnd, setAtEnd] = createSignal(true);

  const rows = createMemo((): Row[] =>
    props.entries.map((entry, index) => ({
      key: entry.id ?? String(index),
      entry,
      level: entry.level ?? "log",
      json: jsonOf(entry.text),
    })),
  );
  const shown = createMemo((): Row[] => {
    const wanted = new Set(levels());
    const needle = query().trim().toLocaleLowerCase();
    return rows().filter((row) => {
      if (!wanted.has(row.level)) return false;
      if (needle === "") return true;
      const haystack = `${row.entry.source ?? ""} ${stripAnsi(row.entry.text)}`.toLocaleLowerCase();
      return haystack.includes(needle);
    });
  });
  function counts(): Record<LogLevel, number> {
    const out: Record<LogLevel, number> = { error: 0, warn: 0, info: 0, log: 0, debug: 0 };
    for (const row of rows()) out[row.level]++;
    return out;
  }
  function present(): LogLevel[] {
    const found = counts();
    return LOG_LEVELS.filter((level) => found[level] > 0);
  }
  function showTime(): boolean {
    return props.timestamps !== "none" && props.entries.some((entry) => entry.time !== undefined);
  }

  function heightOf(row: Row): number {
    let lines = lineCount(row.entry.text);
    if (row.json !== undefined && expanded().has(row.key)) {
      lines += lineCount(JSON.stringify(row.json, null, 2));
    }
    return lines * LINE + ROW_PAD;
  }

  const viewport = makeRef<HTMLDivElement>();
  const span = virtual(() => viewport(), {
    count: () => shown().length,
    size: (index: number) => {
      const row = untrack(shown)[index];
      return row === undefined ? LINE + ROW_PAD : heightOf(row);
    },
    overscan: () => (shown().length <= WHOLE ? shown().length : 10),
  });
  function before(): number {
    return span.items()[0]?.start ?? 0;
  }
  function after(): number {
    const last = span.items().at(-1);
    return last === undefined ? 0 : Math.max(0, span.total() - last.start - last.size);
  }
  function visible(): Row[] {
    return span.items().flatMap((item) => {
      const row = shown()[item.index];
      return row === undefined ? [] : [row];
    });
  }

  function toBottom(): void {
    const element = viewport();
    if (element !== null) element.scrollTop = element.scrollHeight;
  }
  if (!isServer) {
    createEffect(
      () => props.live === true,
      (live, was) => {
        if (live && was === false && props.defaultFollow === undefined) setFollow(true);
      },
    );
    createEffect(
      () => [shown().length, follow(), viewport()] as const,
      ([, on, element]) => {
        if (on && element !== null) queueMicrotask(toBottom);
      },
    );
  }
  function onScroll(event: Event): void {
    const element = event.currentTarget as HTMLDivElement;
    const end = element.scrollHeight - element.scrollTop - element.clientHeight < LINE;
    setAtEnd(end);
    if (!end && untrack(follow)) setFollow(false);
  }
  function toggle(key: string): void {
    const next = new Set(untrack(expanded));
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpanded(next);
  }
  function copied(): string {
    return shown()
      .map((row) =>
        [
          typeof row.entry.time === "number" ? String(row.entry.time) : (row.entry.time ?? ""),
          row.level,
          row.entry.source ?? "",
          stripAnsi(row.entry.text),
        ]
          .filter((part) => part !== "")
          .join(" "),
      )
      .join("\n");
  }

  return (
    <section
      class={arc(cls().root, props.class, props.className)}
      data-slot="console-log"
      aria-label={props["aria-label"] ?? messages().log}
      aria-busy={props.isLoading === true ? "true" : undefined}
      style={props.height === undefined ? {} : { "--log-height": cssLength(props.height) }}
    >
      <Show when={props.toolbar !== false}>
        <div class={cls().toolbar} data-slot="console-log-toolbar">
          <Show when={present().length > 1}>
            <ToggleGroup
              type="multiple"
              variant="outline"
              size="sm"
              class={cls().levels}
              aria-label={messages().logLevels}
              value={[...levels()]}
              onValueChange={(value: string | string[]) => {
                setLevels((Array.isArray(value) ? value : [value]) as LogLevel[]);
              }}
            >
              <For each={present()}>
                {(level: LogLevel) => (
                  <ToggleGroupItem value={level} class={cls().level}>
                    {levelName(level, messages())}
                    <span class={cls().count}>{counts()[level]}</span>
                  </ToggleGroupItem>
                )}
              </For>
            </ToggleGroup>
          </Show>
          <input
            type="search"
            class={cls().search}
            data-slot="console-log-search"
            aria-label={messages().logSearch}
            placeholder={messages().logSearch}
            value={query()}
            onInput={(event: Event) => setQuery((event.currentTarget as HTMLInputElement).value)}
          />
          <Toggle
            variant="outline"
            size="sm"
            class={cls().follow}
            pressed={follow()}
            onPressedChange={(on: boolean) => setFollow(on)}
          >
            <ArrowDownToLine aria-hidden="true" />
            {messages().logFollow}
          </Toggle>
          <CopyButton
            value={copied()}
            label={messages().copyLog}
            class={cls().copy}
            disabled={shown().length === 0}
          />
        </div>
      </Show>
      <Show
        when={props.errorMessage === undefined}
        fallback={
          <div class={cls().empty} role="alert" data-slot="console-log-error">
            {props.errorMessage}
          </div>
        }
      >
        <Show
          when={props.isLoading !== true || props.entries.length > 0}
          fallback={
            <div class={cls().empty} data-slot="console-log-loading">
              {messages().logLoading}
            </div>
          }
        >
          <Show
            when={shown().length > 0}
            fallback={
              <div class={cls().empty}>
                <EmptyState
                  placement="section"
                  kind={rows().length === 0 ? "empty" : "filtered"}
                  heading={rows().length === 0 ? messages().logEmpty : messages().logNoMatches}
                  onClearFilters={() => {
                    setQuery("");
                    setLevels(LOG_LEVELS);
                  }}
                />
              </div>
            }
          >
            <div class={cls().frame}>
              <div
                ref={viewport.set}
                class={cls().viewport}
                data-slot="console-log-viewport"
                dir="ltr"
                role="log"
                aria-live={props.live === true ? "polite" : "off"}
                aria-label={props["aria-label"] ?? messages().log}
                tabIndex={0}
                onScroll={onScroll}
              >
                <div class={cls().lines} role="list">
                  <div style={{ height: `${String(before())}px` }} aria-hidden="true" />
                  <For each={visible()} keyed={(row: Row) => row.key}>
                    {(row: () => Row) => (
                      <Line
                        row={row()}
                        expanded={expanded().has(row().key)}
                        onToggle={() => toggle(row().key)}
                        showTime={showTime()}
                        redaction={props.redaction}
                        classes={cls()}
                        messages={messages()}
                      />
                    )}
                  </For>
                  <div style={{ height: `${String(after())}px` }} aria-hidden="true" />
                </div>
              </div>
              <Show when={!atEnd() && !follow()}>
                <button
                  type="button"
                  class={cls().jump}
                  data-slot="console-log-jump"
                  onClick={() => {
                    setFollow(true);
                    toBottom();
                  }}
                >
                  <ArrowDownToLine aria-hidden="true" />
                  {messages().logJumpToLatest}
                </button>
              </Show>
            </div>
          </Show>
        </Show>
      </Show>
      <span class={srOnly} role="status" data-slot="console-log-status">
        {query().trim() === "" ? "" : messages().logMatches(shown().length)}
      </span>
    </section>
  );
}
