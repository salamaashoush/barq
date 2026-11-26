import { type Child, For, Show, createMemo } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useLocale } from "@barqjs/aria/i18n";
import { controllable } from "@barqjs/aria/utils";
import { CircleAlert } from "@barqjs/lucide/icons/circle-alert";
import { Hourglass } from "@barqjs/lucide/icons/hourglass";
import { ShieldCheck } from "@barqjs/lucide/icons/shield-check";
import { ShieldQuestion } from "@barqjs/lucide/icons/shield-question";
import { ShieldX } from "@barqjs/lucide/icons/shield-x";
import { srOnly } from "@barqjs/ui/sr-only";
import { ToggleGroup, ToggleGroupItem } from "@barqjs/ui/toggle-group";

import { lightHighlightLines } from "../code/light-highlight.ts";
import { codeSurface } from "../code/style.ts";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { type SourceLocation, documentName, positionText } from "../lib/source-location.ts";
import {
  control,
  edge,
  fg,
  focus,
  gap,
  glyph,
  interaction,
  layout,
  plainList,
  rounded,
  space,
  surface,
  tone as tones,
  type,
} from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import type { NavIcon } from "./app-shell.tsx";
import { DescriptionList } from "./description-list.tsx";
import { EmptyState } from "./empty-state.tsx";
import { type ArcMessages, useArcMessages } from "./messages.ts";
import { testDurationText } from "./test-results.tsx";

export type CheckVerdict = "proved" | "falsified" | "unknown" | "error" | "timeout";

export const CHECK_VERDICTS: readonly CheckVerdict[] = [
  "falsified",
  "error",
  "timeout",
  "unknown",
  "proved",
];

/** How a verdict is drawn: its word, its tone and its glyph. */
export interface CheckVerdictLook {
  label: string;
  tone: Tone;
  /** A lucide icon, or any component that draws one. */
  icon?: NavIcon;
}

/** One property a checker tried to prove, and what it concluded. */
export interface CheckResult {
  id: string;
  name: string;
  /** One of `CHECK_VERDICTS`, or one of the caller's own that `verdicts` describes. */
  verdict: CheckVerdict | (string & Record<never, never>);
  /** Where the property is written. */
  location?: SourceLocation;
  /** Why: an error's message, what left it unknown. */
  message?: string;
  /** The values that break it, by name. */
  counterexample?: Readonly<Record<string, unknown>>;
  /** How long it took, in milliseconds. */
  duration?: number;
}

function defaultLooks(messages: ArcMessages): Record<CheckVerdict, CheckVerdictLook> {
  return {
    proved: { label: messages.verdictProved, tone: "success", icon: ShieldCheck },
    falsified: { label: messages.verdictFalsified, tone: "danger", icon: ShieldX },
    unknown: { label: messages.verdictUnknown, tone: "warning", icon: ShieldQuestion },
    error: { label: messages.verdictError, tone: "danger", icon: CircleAlert },
    timeout: { label: messages.verdictTimeout, tone: "warning", icon: Hourglass },
  };
}

interface VerdictIconProps {
  look: CheckVerdictLook;
  class: string;
}

function VerdictIcon(props: VerdictIconProps) {
  const Icon = props.look.icon;
  return (
    <span class={props.class} aria-hidden="true">
      {Icon === undefined ? null : <Icon />}
    </span>
  );
}

/** A counterexample's value as a reader reads it: strings quoted, the rest as JSON. */
export function counterexampleText(value: unknown): string {
  if (value === undefined) return "undefined";
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  if (typeof value === "symbol" || typeof value === "function") return value.toString();
  return JSON.stringify(value, null, 2);
}

export const checkResultsStyles = variants({
  slots: {
    root: arc(layout.column, layout.minZero, layout.clip, surface.bordered),
    toolbar: arc(layout.row, layout.wrap, gap[2], edge.bottom, { padding: space.x2 }),
    verdicts: arc(layout.minZero, layout.scrollInline),
    filter: arc(gap[1]),
    count: arc(type.numeric, fg.muted),
    search: control.filter,
    list: arc(plainList, layout.column, layout.grow, layout.minZeroBlock, layout.scrollBlock),
    check: arc(layout.column, gap[2], edge.bottom, {
      padding: space.x3,
      "&:last-child": { borderBlockEndWidth: "0px" },
    }),
    line: arc(layout.row, layout.wrap, gap[2], layout.minZero),
    verdict: arc(layout.inlineRow, gap[1], type.label, fg.tone, layout.noShrink),
    icon: arc(layout.inlineCentre, glyph.sm, fg.toneBase),
    name: arc(type.medium, { overflowWrap: "anywhere" }),
    go: arc(control.bare, rounded.sm, focus.visible, interaction.hoverText, { textAlign: "start" }),
    location: arc(type.meta, type.numeric, layout.pushEnd),
    message: arc(type.sm, fg.muted, type.written),
    counterexample: arc(layout.column, gap[1], rounded.md, surface.sunken, { padding: space.x2 }),
    caption: arc(type.caption, fg.muted),
    term: arc(type.mono),
    value: arc(codeSurface, {
      margin: "0px",
      background: "transparent",
      whiteSpace: "pre",
      overflowX: "auto",
    }),
    empty: arc(type.sm, fg.muted, { padding: space.x4 }),
  },
});

type Slots = ReturnType<typeof checkResultsStyles>;

export interface CheckResultsProps extends Customisable<Slots> {
  checks: readonly CheckResult[];
  /**
   * How each verdict is drawn, over arc's own for `proved`, `falsified`,
   * `unknown`, `error` and `timeout`: another word, or a verdict of the
   * checker's own (`vacuous`, `partial`).
   */
  verdicts?: Readonly<Record<string, CheckVerdictLook>>;
  /** A check's name was pressed: go to where it is written. */
  onSelect?: (location: SourceLocation, check: CheckResult) => void;
  /** Names the list. @default "Checks" */
  "aria-label"?: string;
  /** The verdicts shown. @default every verdict */
  shownVerdicts?: readonly string[];
  defaultShownVerdicts?: readonly string[];
  onShownVerdictsChange?: (verdicts: string[]) => void;
  /** Only checks whose name, message or document holds this text, case aside. */
  query?: string;
  defaultQuery?: string;
  onQueryChange?: (query: string) => void;
  /** @default true */
  toolbar?: boolean;
  /** Still checking, with nothing concluded yet. */
  isLoading?: boolean;
  /** Why the checker could not run. */
  errorMessage?: string;
  /** What no checks at all says. @default "No checks yet" */
  empty?: Child;
  id?: string;
}

/**
 * What a prover or a property checker concluded, a check at a time: proved,
 * falsified with the counterexample that breaks it, unknown, failed or out
 * of time, each linked to where it is written.
 *
 * ```tsx
 * <CheckResults
 *   checks={[
 *     { id: "1", name: "sort keeps length", verdict: "proved", location: { uri: "sort.toy", line: 4 } },
 *     { id: "2", name: "sort is stable", verdict: "falsified", counterexample: { xs: [2, 1, 2] } },
 *   ]}
 *   onSelect={(location) => openAt(location)}
 * />
 * ```
 *
 * The counts filter by verdict and the search by name. A counterexample's
 * values are a `DescriptionList`, each value written as JSON. `verdicts`
 * renames a verdict or adds the checker's own; one it does not describe is
 * shown by its own name in a neutral tone.
 */
export function CheckResults(props: CheckResultsProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  function cls(): Slots {
    return parts(checkResultsStyles(), props.classes);
  }
  function look(verdict: string): CheckVerdictLook {
    const own = props.verdicts?.[verdict];
    if (own !== undefined) return own;
    const known = (defaultLooks(messages()) as Record<string, CheckVerdictLook>)[verdict];
    return known ?? { label: verdict, tone: "neutral" };
  }
  const counts = createMemo(() => {
    const out = new Map<string, number>();
    for (const check of props.checks) out.set(check.verdict, (out.get(check.verdict) ?? 0) + 1);
    return out;
  });
  function present(): string[] {
    const found = [...counts().keys()];
    const ordered = CHECK_VERDICTS.filter((verdict) => counts().has(verdict));
    return [
      ...ordered,
      ...found.filter((verdict) => !(CHECK_VERDICTS as string[]).includes(verdict)),
    ];
  }
  const [shownVerdicts, setShownVerdicts] = controllable<readonly string[] | null>(
    () => props.shownVerdicts,
    () => props.defaultShownVerdicts ?? null,
    (next) => props.onShownVerdictsChange?.([...(next ?? present())]),
  );
  const [query, setQuery] = controllable<string>(
    () => props.query,
    () => props.defaultQuery ?? "",
    (next) => props.onQueryChange?.(next),
  );
  function wanted(): ReadonlySet<string> {
    return new Set(shownVerdicts() ?? present());
  }
  const shown = createMemo((): CheckResult[] => {
    const allowed = wanted();
    const needle = query().trim().toLocaleLowerCase();
    return props.checks.filter((check) => {
      if (!allowed.has(check.verdict)) return false;
      if (needle === "") return true;
      return [check.name, check.message, check.location?.uri]
        .filter((part) => part !== undefined)
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle);
    });
  });

  return (
    <section
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="check-results"
      aria-label={props["aria-label"] ?? messages().checks}
      aria-busy={props.isLoading === true ? "true" : undefined}
    >
      <Show when={props.toolbar !== false}>
        <div class={cls().toolbar} data-slot="check-results-toolbar">
          <Show when={present().length > 0}>
            <ToggleGroup
              type="multiple"
              variant="outline"
              size="sm"
              class={cls().verdicts}
              aria-label={messages().checkVerdicts}
              value={[...wanted()]}
              onValueChange={(value: string | string[]) => {
                setShownVerdicts(Array.isArray(value) ? value : [value]);
              }}
            >
              <For each={present()}>
                {(verdict: string) => (
                  <ToggleGroupItem
                    value={verdict}
                    class={arc(cls().filter, tones[look(verdict).tone])}
                    data-slot="check-results-filter"
                  >
                    <VerdictIcon look={look(verdict)} class={cls().icon} />
                    {look(verdict).label}
                    <span class={cls().count}>{counts().get(verdict) ?? 0}</span>
                  </ToggleGroupItem>
                )}
              </For>
            </ToggleGroup>
          </Show>
          <input
            type="search"
            class={cls().search}
            data-slot="check-results-search"
            aria-label={messages().checksSearch}
            placeholder={messages().checksSearch}
            value={query()}
            onInput={(event: Event) => setQuery((event.currentTarget as HTMLInputElement).value)}
          />
        </div>
      </Show>
      <Show
        when={props.errorMessage === undefined}
        fallback={
          <div class={arc(cls().empty, fg.danger)} role="alert" data-slot="check-results-error">
            {props.errorMessage}
          </div>
        }
      >
        <Show
          when={props.isLoading !== true || props.checks.length > 0}
          fallback={
            <div class={cls().empty} data-slot="check-results-loading">
              {messages().checksLoading}
            </div>
          }
        >
          <Show
            when={shown().length > 0}
            fallback={
              <div class={cls().empty} data-slot="check-results-empty">
                <EmptyState
                  placement="section"
                  kind={props.checks.length === 0 ? "empty" : "filtered"}
                  heading={
                    props.checks.length === 0
                      ? (props.empty ?? messages().checksEmpty)
                      : messages().checksNoMatches
                  }
                  onClearFilters={() => {
                    setQuery("");
                    setShownVerdicts(null);
                  }}
                />
              </div>
            }
          >
            <ul class={cls().list} data-slot="check-results-list">
              <For each={shown()} keyed={(check: CheckResult) => check.id}>
                {(check: () => CheckResult) => (
                  <CheckRow
                    check={check()}
                    look={look(check().verdict)}
                    classes={cls()}
                    messages={messages()}
                    locale={locale().locale}
                    onSelect={props.onSelect}
                  />
                )}
              </For>
            </ul>
          </Show>
        </Show>
      </Show>
      <span class={srOnly} role="status" data-slot="check-results-status">
        {query().trim() === "" ? "" : messages().checksMatch(shown().length)}
      </span>
    </section>
  );
}

interface CheckRowProps {
  check: CheckResult;
  look: CheckVerdictLook;
  classes: Slots;
  messages: ArcMessages;
  locale: string;
  onSelect: ((location: SourceLocation, check: CheckResult) => void) | undefined;
}

function CheckRow(props: CheckRowProps) {
  function entries(): [string, unknown][] {
    return Object.entries(props.check.counterexample ?? {});
  }
  return (
    <li
      class={arc(props.classes.check, tones[props.look.tone])}
      data-slot="check-results-check"
      data-verdict={props.check.verdict}
    >
      <div class={props.classes.line}>
        <span class={props.classes.verdict} data-slot="check-results-verdict">
          <VerdictIcon look={props.look} class={props.classes.icon} />
          {props.look.label}
        </span>
        <Show
          when={props.onSelect !== undefined && props.check.location !== undefined}
          fallback={
            <span class={props.classes.name} data-slot="check-results-name" dir="auto">
              {props.check.name}
            </span>
          }
        >
          <button
            type="button"
            class={arc(props.classes.name, props.classes.go)}
            data-slot="check-results-name"
            dir="auto"
            onClick={() => props.onSelect?.(props.check.location as SourceLocation, props.check)}
          >
            {props.check.name}
          </button>
        </Show>
        <span class={props.classes.location} data-slot="check-results-location" dir="ltr">
          <Show when={props.check.location !== undefined}>
            {`${documentName(props.check.location?.uri ?? "")}:${positionText(props.check.location ?? { line: 1 })}`}
          </Show>
          <Show when={props.check.duration !== undefined}>
            {`${props.check.location === undefined ? "" : " · "}${testDurationText(props.check.duration ?? 0, props.locale)}`}
          </Show>
        </span>
      </div>
      <Show when={props.check.message !== undefined}>
        <p class={props.classes.message} data-slot="check-results-message" dir="auto">
          {props.check.message}
        </p>
      </Show>
      <Show when={entries().length > 0}>
        <div class={props.classes.counterexample} data-slot="check-results-counterexample">
          <span class={props.classes.caption}>{props.messages.counterexample}</span>
          <DescriptionList
            divided={false}
            aria-label={props.messages.counterexampleOf(props.check.name)}
            items={entries().map(([name, value]) => ({
              id: name,
              term: <code class={props.classes.term}>{name}</code>,
              details: (
                <pre
                  class={props.classes.value}
                  dir="ltr"
                  innerHTML={lightHighlightLines(counterexampleText(value), "json").join("\n")}
                />
              ),
            }))}
          />
        </div>
      </Show>
    </li>
  );
}
