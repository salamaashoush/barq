import { type Child, For, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useLocale } from "@barqjs/aria/i18n";
import { on } from "@barqjs/ui/conditions";
import { Progress } from "@barqjs/ui/progress";
import { Spinner } from "@barqjs/ui/spinner";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import type { SourcePosition } from "../lib/source-location.ts";
import {
  bg,
  control,
  edge,
  fg,
  focus,
  gap,
  glyph,
  interaction,
  layout,
  rounded,
  space,
  target,
  truncate,
  type,
} from "../style/index.ts";
import { useArcMessages } from "./messages.ts";
import { type ProblemCounts, SeverityIcon } from "./problems-panel.tsx";

/** Work going on in the background: a build, an index, a download. */
export interface StatusTask {
  id: string;
  label: string;
  /** How far along, from 0 to 1. Left out, it is going with no known end. */
  progress?: number;
}

/** Where the caret is, and how much is selected. */
export interface StatusCursor extends SourcePosition {
  /** Characters selected. */
  selected?: number;
}

const hiddenWhenCompact = { display: { default: "none", [on.cqMd]: "inline" } };

export const statusBarStyles = variants({
  slots: {
    root: arc(layout.container, layout.minZero, bg.muted, edge.top, type.xs, fg.muted),
    bar: arc(layout.row, layout.between, gap[1], layout.minZero, {
      paddingInline: space.x1,
      minHeight: space.x8,
    }),
    group: arc(layout.row, gap[0.5], layout.minZero),
    item: arc(layout.inlineRow, gap[1], glyph.sm, layout.nowrap, layout.minZero, rounded.sm, {
      paddingInline: space.x1_5,
      minHeight: space.x6,
    }),
    button: arc(control.bare, interaction.hover, focus.visible, target.size),
    low: arc({ display: { default: "none", [on.cqMd]: "inline-flex" } }),
    label: arc(truncate, hiddenWhenCompact),
    icon: arc(layout.inlineCentre, glyph.sm),
    count: arc(type.numeric),
    progress: arc(bg.page, { width: space.x16 }),
    percent: arc(type.numeric, hiddenWhenCompact),
  },
});

type Slots = ReturnType<typeof statusBarStyles>;

export interface StatusBarItemProps {
  children?: Child;
  /** Makes it a button. */
  onPress?: () => void;
  /** Names it to a screen reader, in place of its text. */
  label?: string;
  /** `low` is left out on a narrow bar, a phone's. @default "high" */
  priority?: "high" | "low";
  class?: string;
  /** @default "status-bar-item" */
  slot?: string;
}

/** One entry of a `StatusBar`: words, an icon and a count, or a button. */
export function StatusBarItem(props: StatusBarItemProps) {
  const cls = statusBarStyles();
  function own(): string {
    return arc(
      cls.item,
      props.onPress === undefined ? undefined : cls.button,
      props.priority === "low" ? cls.low : undefined,
      props.class,
    );
  }
  return (
    <Show
      when={props.onPress !== undefined}
      fallback={
        <span
          class={own()}
          data-slot={props.slot ?? "status-bar-item"}
          aria-label={props.label}
          role={props.label === undefined ? undefined : "group"}
        >
          {props.children}
        </span>
      }
    >
      <button
        type="button"
        class={own()}
        data-slot={props.slot ?? "status-bar-item"}
        aria-label={props.label}
        onClick={() => props.onPress?.()}
      >
        {props.children}
      </button>
    </Show>
  );
}

export interface StatusBarProps extends Customisable<Slots> {
  /** Names the bar. @default "Status bar" */
  "aria-label"?: string;
  /** The caller's own items at the start, before the problems: a branch, a connection. */
  start?: Child;
  /** The caller's own items at the end, after the language. */
  end?: Child;
  /** The document's language, by name. */
  language?: string;
  /** Makes the language a button: pick another. */
  onLanguageClick?: () => void;
  cursor?: StatusCursor;
  /** The problems found, counted: their errors and warnings are shown. */
  problems?: Partial<ProblemCounts>;
  /** Makes the counts a button: open the problems. */
  onProblemsClick?: () => void;
  tasks?: readonly StatusTask[];
  id?: string;
}

/**
 * The strip along the foot of a workbench: what is going on and where the
 * caret is, each a click from its panel.
 *
 * ```tsx
 * <StatusBar
 *   problems={{ error: 2, warning: 1 }}
 *   onProblemsClick={() => setPanel("problems")}
 *   tasks={[{ id: "build", label: "Building", progress: 0.4 }]}
 *   cursor={{ line: 12, column: 5 }}
 *   language="Toy"
 * />
 * ```
 *
 * `start` and `end` take the caller's own `StatusBarItem`s. On a narrow bar,
 * a phone's, the cursor, the language and every `low` item step aside and a
 * task keeps its spinner or bar without its words, which a screen reader
 * still hears. It is not a live region: a caret that moves on every key
 * would talk over the typing.
 */
export function StatusBar(props: StatusBarProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  function cls(): Slots {
    return parts(statusBarStyles(), props.classes);
  }
  function errors(): number {
    return props.problems?.error ?? 0;
  }
  function warnings(): number {
    return props.problems?.warning ?? 0;
  }
  function percent(value: number): string {
    return new Intl.NumberFormat(locale().locale, { style: "percent" }).format(
      Math.min(1, Math.max(0, value)),
    );
  }
  function problemsLabel(): string {
    return messages().problemsSummary(errors(), warnings());
  }
  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="status-bar"
      role="group"
      aria-label={props["aria-label"] ?? messages().statusBar}
    >
      <div class={cls().bar} data-slot="status-bar-bar">
        <div class={cls().group} data-slot="status-bar-start">
          {props.start}
          <Show when={props.problems !== undefined}>
            <StatusBarItem
              slot="status-bar-problems"
              onPress={props.onProblemsClick}
              label={
                props.onProblemsClick === undefined
                  ? problemsLabel()
                  : messages().showProblems(problemsLabel())
              }
            >
              <SeverityIcon severity="error" class={cls().icon} />
              <span class={cls().count} aria-hidden="true">
                {errors()}
              </span>
              <SeverityIcon severity="warning" class={cls().icon} />
              <span class={cls().count} aria-hidden="true">
                {warnings()}
              </span>
            </StatusBarItem>
          </Show>
          <For each={() => props.tasks ?? []}>
            {(task: StatusTask) => (
              <StatusBarItem slot="status-bar-task">
                <Show
                  when={task.progress !== undefined}
                  fallback={<Spinner class={cls().icon} label={task.label} />}
                >
                  <Progress
                    class={cls().progress}
                    value={Math.round((task.progress ?? 0) * 100)}
                    aria-label={task.label}
                  />
                </Show>
                <span class={cls().label} data-slot="status-bar-task-label" aria-hidden="true">
                  {task.label}
                </span>
                <Show when={task.progress !== undefined}>
                  <span class={cls().percent} aria-hidden="true">
                    {percent(task.progress ?? 0)}
                  </span>
                </Show>
              </StatusBarItem>
            )}
          </For>
        </div>
        <div class={cls().group} data-slot="status-bar-end">
          <Show when={props.cursor !== undefined}>
            <StatusBarItem slot="status-bar-cursor" priority="low">
              {messages().cursorPosition(props.cursor?.line ?? 1, props.cursor?.column ?? 1)}
              <Show when={(props.cursor?.selected ?? 0) > 0}>
                {` ${messages().cursorSelected(props.cursor?.selected ?? 0)}`}
              </Show>
            </StatusBarItem>
          </Show>
          <Show when={props.language !== undefined}>
            <StatusBarItem
              slot="status-bar-language"
              priority="low"
              onPress={props.onLanguageClick}
              label={
                props.onLanguageClick === undefined
                  ? undefined
                  : messages().changeLanguage(props.language ?? "")
              }
            >
              {props.language}
            </StatusBarItem>
          </Show>
          {props.end}
        </div>
      </div>
    </div>
  );
}
