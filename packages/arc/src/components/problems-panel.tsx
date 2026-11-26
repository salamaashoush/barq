import { type Child, For, Show, createMemo, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { Key } from "@barqjs/aria/collections";
import {
  Tree,
  TreeItem,
  TreeItemContent,
  TreeItemExpandButton,
  type TreeItemRenderState,
} from "@barqjs/aria/tree";
import { controllable } from "@barqjs/aria/utils";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { CircleX } from "@barqjs/lucide/icons/circle-x";
import { CornerDownRight } from "@barqjs/lucide/icons/corner-down-right";
import { FileCode } from "@barqjs/lucide/icons/file-code";
import { Info } from "@barqjs/lucide/icons/info";
import { Lightbulb } from "@barqjs/lucide/icons/lightbulb";
import { TriangleAlert } from "@barqjs/lucide/icons/triangle-alert";
import { icon } from "@barqjs/ui/shared-icon";
import { srOnly } from "@barqjs/ui/sr-only";
import { on } from "@barqjs/ui/conditions";
import { ToggleGroup, ToggleGroupItem } from "@barqjs/ui/toggle-group";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  type SourceLocation,
  documentFolder,
  documentName,
  positionText,
} from "../lib/source-location.ts";
import {
  control,
  edge,
  fg,
  gap,
  glyph,
  layout,
  space,
  surface,
  tone as tones,
  truncate,
  type,
} from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import { EmptyState } from "./empty-state.tsx";
import { type ArcMessages, useArcMessages } from "./messages.ts";
import { treeViewStyles } from "./tree-view.tsx";

export type ProblemSeverity = "error" | "warning" | "info" | "hint";

export const PROBLEM_SEVERITIES: readonly ProblemSeverity[] = ["error", "warning", "info", "hint"];

/** Another place a problem involves: where a name was first declared, the other half of a clash. */
export interface ProblemRelated {
  message: string;
  location: SourceLocation;
}

/** One thing a checker found wrong, or worth a look, in a document. */
export interface Problem {
  /** Keeps its row as problems change. @default its index */
  id?: string;
  severity: ProblemSeverity;
  message: string;
  location: SourceLocation;
  /** What found it: a compiler, a linter. */
  source?: string;
  /** The checker's own name for it: `E0425`, `no-unused`. */
  code?: string;
  related?: readonly ProblemRelated[];
}

export type ProblemCounts = Record<ProblemSeverity, number>;

/** How many problems there are of each severity. */
export function problemCounts(problems: readonly Problem[]): ProblemCounts {
  const counts: ProblemCounts = { error: 0, warning: 0, info: 0, hint: 0 };
  for (const problem of problems) counts[problem.severity]++;
  return counts;
}

/** A severity in arc's words. */
export function severityName(severity: ProblemSeverity, messages: ArcMessages): string {
  switch (severity) {
    case "error":
      return messages.severityError;
    case "warning":
      return messages.severityWarning;
    case "info":
      return messages.severityInfo;
    default:
      return messages.severityHint;
  }
}

const SEVERITY_TONES: Record<ProblemSeverity, Tone> = {
  error: "danger",
  warning: "warning",
  info: "info",
  hint: "neutral",
};

interface SeverityIconProps {
  severity: ProblemSeverity;
  class?: string;
}

/** The glyph of a severity, in its tone, hidden from assistive tech. */
export function SeverityIcon(props: SeverityIconProps) {
  return (
    <span
      class={arc(tones[SEVERITY_TONES[props.severity]], fg.toneBase, props.class)}
      data-slot="severity-icon"
      data-severity={props.severity}
      aria-hidden="true"
    >
      <Show when={props.severity === "error"}>
        <CircleX />
      </Show>
      <Show when={props.severity === "warning"}>
        <TriangleAlert />
      </Show>
      <Show when={props.severity === "info"}>
        <Info />
      </Show>
      <Show when={props.severity === "hint"}>
        <Lightbulb />
      </Show>
    </span>
  );
}

const tree = treeViewStyles();

export const problemsPanelStyles = variants({
  slots: {
    root: arc(layout.column, layout.minZero, layout.clip, layout.container, surface.bordered),
    toolbar: arc(layout.row, layout.wrap, gap[2], edge.bottom, { padding: space.x2 }),
    severities: arc(layout.minZero, layout.scrollInline),
    severity: arc(gap[1]),
    count: arc(type.numeric, fg.muted),
    search: control.filter,
    tree: arc(layout.grow, layout.minZeroBlock, layout.scrollBlock, { padding: space.x1 }),
    row: arc({}),
    content: arc({}),
    expand: arc({}),
    spacer: arc({}),
    file: arc(layout.inlineCentre, layout.noShrink, glyph.sm, fg.muted),
    name: arc(type.medium, truncate, layout.minZero),
    folder: arc(type.meta, truncate, layout.minZero),
    fileCount: arc(type.meta, type.numeric, layout.pushEnd, layout.noShrink),
    icon: arc(layout.inlineCentre, layout.noShrink, glyph.sm),
    message: arc(layout.minZero, { overflowWrap: "anywhere", paddingBlock: space.x1 }),
    source: arc(type.meta, layout.noShrink, layout.nowrap, {
      display: { default: "none", [on.cqMd]: "inline" },
    }),
    position: arc(type.meta, type.numeric, layout.noShrink, layout.pushEnd),
    empty: arc(type.sm, fg.muted, { padding: space.x4 }),
  },
});

type Slots = ReturnType<typeof problemsPanelStyles>;

export interface ProblemsPanelProps extends Customisable<Slots> {
  problems: readonly Problem[];
  /** A problem, or a place related to one, was chosen by a press or Enter: go there. */
  onSelect?: (location: SourceLocation, problem: Problem) => void;
  /** Names the panel. @default "Problems" */
  "aria-label"?: string;
  /** The severities shown. @default every severity */
  severities?: readonly ProblemSeverity[];
  defaultSeverities?: readonly ProblemSeverity[];
  onSeveritiesChange?: (severities: ProblemSeverity[]) => void;
  /** Only problems whose message, source, code or document holds this text, case aside. */
  query?: string;
  defaultQuery?: string;
  onQueryChange?: (query: string) => void;
  /** The documents whose problems are folded away, by `uri`. @default none */
  collapsed?: readonly string[];
  defaultCollapsed?: readonly string[];
  onCollapsedChange?: (collapsed: string[]) => void;
  /** @default true */
  toolbar?: boolean;
  /** The checker is still running and has reported nothing yet. */
  isLoading?: boolean;
  /** Why the problems could not be read. */
  errorMessage?: string;
  /** What no problems at all says. @default "No problems" */
  empty?: Child;
  id?: string;
}

interface FileRow {
  kind: "file";
  key: string;
  uri: string;
  count: number;
  children: ProblemRow[];
}

interface ProblemRow {
  kind: "problem";
  key: string;
  problem: Problem;
  children: RelatedRow[];
}

interface RelatedRow {
  kind: "related";
  key: string;
  related: ProblemRelated;
  problem: Problem;
}

type Row = FileRow | ProblemRow | RelatedRow;

const FILE = "file:";

function rowChildren(row: Row): Row[] | undefined {
  if (row.kind === "related" || row.children.length === 0) return undefined;
  return row.children;
}

function textOf(row: Row): string {
  if (row.kind === "file") return documentName(row.uri);
  if (row.kind === "problem") return row.problem.message;
  return row.related.message;
}

function byPosition(left: Problem, right: Problem): number {
  return (
    left.location.line - right.location.line ||
    (left.location.column ?? 1) - (right.location.column ?? 1) ||
    PROBLEM_SEVERITIES.indexOf(left.severity) - PROBLEM_SEVERITIES.indexOf(right.severity)
  );
}

/**
 * What a checker found across a workspace: problems grouped under the
 * document they are in, counted and filtered by severity and by text.
 *
 * ```tsx
 * <ProblemsPanel
 *   problems={[
 *     { severity: "error", message: "Unknown name `totl`", location: { uri: "src/main.toy", line: 3, column: 7 } },
 *   ]}
 *   onSelect={(location) => openAt(location)}
 * />
 * ```
 *
 * On `@barqjs/aria`'s tree: one Tab stop, Up and Down between rows, Left and
 * Right to fold a document and walk into it, and Enter or a press on a
 * problem, or on a place related to one, calls `onSelect` with where it is.
 * Documents are in the order of their `uri`, and a document's problems in
 * the order they appear in it.
 */
export function ProblemsPanel(props: ProblemsPanelProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(problemsPanelStyles(), props.classes);
  }
  const [severities, setSeverities] = controllable<readonly ProblemSeverity[]>(
    () => props.severities,
    () => props.defaultSeverities ?? PROBLEM_SEVERITIES,
    (next) => props.onSeveritiesChange?.([...next]),
  );
  const [query, setQuery] = controllable<string>(
    () => props.query,
    () => props.defaultQuery ?? "",
    (next) => props.onQueryChange?.(next),
  );
  const [collapsed, setCollapsed] = controllable<readonly string[]>(
    () => props.collapsed,
    () => props.defaultCollapsed ?? [],
    (next) => props.onCollapsedChange?.([...next]),
  );

  const counts = createMemo(() => problemCounts(props.problems));
  function present(): ProblemSeverity[] {
    return PROBLEM_SEVERITIES.filter((severity) => counts()[severity] > 0);
  }

  const shown = createMemo((): Problem[] => {
    const wanted = new Set(severities());
    const needle = query().trim().toLocaleLowerCase();
    return props.problems.filter((problem) => {
      if (!wanted.has(problem.severity)) return false;
      if (needle === "") return true;
      return [problem.message, problem.source, problem.code, problem.location.uri]
        .filter((part) => part !== undefined)
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle);
    });
  });

  const rows = createMemo((): FileRow[] => {
    const keys = new Map<Problem, string>();
    props.problems.forEach((problem, index) => keys.set(problem, problem.id ?? String(index)));
    const byUri = new Map<string, Problem[]>();
    for (const problem of shown()) {
      const list = byUri.get(problem.location.uri) ?? [];
      list.push(problem);
      byUri.set(problem.location.uri, list);
    }
    return [...byUri.keys()].toSorted().map((uri) => {
      const list = (byUri.get(uri) ?? []).toSorted(byPosition);
      return {
        kind: "file",
        key: FILE + uri,
        uri,
        count: list.length,
        children: list.map((problem) => {
          const key = `problem:${keys.get(problem) ?? ""}`;
          return {
            kind: "problem",
            key,
            problem,
            children: (problem.related ?? []).map((related, index) => ({
              kind: "related",
              key: `${key}:${String(index)}`,
              related,
              problem,
            })),
          };
        }),
      };
    });
  });

  function expanded(): Key[] {
    const folded = new Set(collapsed());
    return rows().flatMap((file) => [
      ...(folded.has(file.uri) ? [] : [file.key]),
      ...file.children.filter((row) => row.children.length > 0).map((row) => row.key),
    ]);
  }
  function onExpandedChange(keys: Set<Key>): void {
    const shownFiles = new Set(rows().map((file) => file.uri));
    const kept = untrack(collapsed).filter((uri) => !shownFiles.has(uri));
    const folded = rows()
      .filter((file) => !keys.has(file.key))
      .map((file) => file.uri);
    setCollapsed([...kept, ...folded]);
  }
  function toggle(uri: string): void {
    const now = untrack(collapsed);
    setCollapsed(now.includes(uri) ? now.filter((one) => one !== uri) : [...now, uri]);
  }
  function find(key: Key): Row | undefined {
    for (const file of rows()) {
      if (file.key === key) return file;
      for (const problem of file.children) {
        if (problem.key === key) return problem;
        const related = problem.children.find((one) => one.key === key);
        if (related !== undefined) return related;
      }
    }
    return undefined;
  }
  function act(key: Key): void {
    const row = find(key);
    if (row === undefined) return;
    if (row.kind === "file") toggle(row.uri);
    else if (row.kind === "problem") props.onSelect?.(row.problem.location, row.problem);
    else props.onSelect?.(row.related.location, row.problem);
  }
  function clearFilters(): void {
    setQuery("");
    setSeverities(PROBLEM_SEVERITIES);
  }

  return (
    <section
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="problems-panel"
      aria-label={props["aria-label"] ?? messages().problems}
      aria-busy={props.isLoading === true ? "true" : undefined}
    >
      <Show when={props.toolbar !== false}>
        <div class={cls().toolbar} data-slot="problems-panel-toolbar">
          <Show when={present().length > 0}>
            <ToggleGroup
              type="multiple"
              variant="outline"
              size="sm"
              class={cls().severities}
              aria-label={messages().problemSeverities}
              value={[...severities()]}
              onValueChange={(value: string | string[]) => {
                setSeverities((Array.isArray(value) ? value : [value]) as ProblemSeverity[]);
              }}
            >
              <For each={present()}>
                {(severity: ProblemSeverity) => (
                  <ToggleGroupItem
                    value={severity}
                    class={cls().severity}
                    data-slot="problems-panel-severity"
                  >
                    <SeverityIcon severity={severity} class={cls().icon} />
                    {severityName(severity, messages())}
                    <span class={cls().count}>{counts()[severity]}</span>
                  </ToggleGroupItem>
                )}
              </For>
            </ToggleGroup>
          </Show>
          <input
            type="search"
            class={cls().search}
            data-slot="problems-panel-search"
            aria-label={messages().problemsSearch}
            placeholder={messages().problemsSearch}
            value={query()}
            onInput={(event: Event) => setQuery((event.currentTarget as HTMLInputElement).value)}
          />
        </div>
      </Show>
      <Show
        when={props.errorMessage === undefined}
        fallback={
          <div class={arc(cls().empty, fg.danger)} role="alert" data-slot="problems-panel-error">
            {props.errorMessage}
          </div>
        }
      >
        <Show
          when={props.isLoading !== true || props.problems.length > 0}
          fallback={
            <div class={cls().empty} data-slot="problems-panel-loading">
              {messages().problemsLoading}
            </div>
          }
        >
          <Show
            when={rows().length > 0}
            fallback={
              <div class={cls().empty} data-slot="problems-panel-empty">
                <EmptyState
                  placement="section"
                  kind={props.problems.length === 0 ? "empty" : "filtered"}
                  heading={
                    props.problems.length === 0
                      ? (props.empty ?? messages().problemsEmpty)
                      : messages().problemsNoMatches
                  }
                  onClearFilters={clearFilters}
                />
              </div>
            }
          >
            <Tree<Row>
              class={arc(tree.root, cls().tree)}
              data-slot="problems-panel-tree"
              aria-label={props["aria-label"] ?? messages().problems}
              items={rows()}
              getKey={(row: Row) => row.key}
              getTextValue={textOf}
              getChildren={rowChildren}
              expandedKeys={expanded()}
              onExpandedChange={onExpandedChange}
              onAction={act}
            >
              {(row: Row) => (
                <TreeItem
                  class={arc(tree.row, cls().row)}
                  data-slot={`problems-panel-${row.kind}`}
                  hasChildItems={rowChildren(row) !== undefined}
                >
                  <TreeItemContent>
                    {(state: TreeItemRenderState) => (
                      <ProblemLine row={row} state={state} classes={cls()} messages={messages()} />
                    )}
                  </TreeItemContent>
                </TreeItem>
              )}
            </Tree>
          </Show>
        </Show>
      </Show>
      <span class={srOnly} role="status" data-slot="problems-panel-status">
        {query().trim() === "" ? "" : messages().problemsMatch(shown().length)}
      </span>
    </section>
  );
}

interface ProblemLineProps {
  row: Row;
  state: TreeItemRenderState;
  classes: Slots;
  messages: ArcMessages;
}

function ProblemLine(props: ProblemLineProps) {
  const row = props.row;
  return (
    <div class={arc(tree.content, props.classes.content)} data-slot="problems-panel-content">
      <Show
        when={props.state.hasChildItems()}
        fallback={<span class={arc(tree.spacer, props.classes.spacer)} />}
      >
        <TreeItemExpandButton
          class={arc(tree.expand, props.classes.expand)}
          data-slot="problems-panel-expand"
        >
          <ChevronRight class={icon.directional} aria-hidden="true" />
        </TreeItemExpandButton>
      </Show>
      {row.kind === "file" ? (
        <>
          <span class={props.classes.file} aria-hidden="true">
            <FileCode />
          </span>
          <span class={props.classes.name} data-slot="problems-panel-name">
            {documentName(row.uri)}
          </span>
          <Show when={documentFolder(row.uri) !== ""}>
            <span class={props.classes.folder} data-slot="problems-panel-folder" dir="ltr">
              {documentFolder(row.uri)}
            </span>
          </Show>
          <span class={props.classes.fileCount} data-slot="problems-panel-file-count">
            {props.messages.problemCount(row.count)}
          </span>
        </>
      ) : row.kind === "problem" ? (
        <>
          <SeverityIcon severity={row.problem.severity} class={props.classes.icon} />
          <span class={srOnly}>{severityName(row.problem.severity, props.messages)}</span>
          <span class={props.classes.message} data-slot="problems-panel-message" dir="auto">
            {row.problem.message}
          </span>
          <Show when={row.problem.source !== undefined || row.problem.code !== undefined}>
            <span class={props.classes.source} data-slot="problems-panel-source">
              {[row.problem.source, row.problem.code]
                .filter((part) => part !== undefined)
                .join(" ")}
            </span>
          </Show>
          <span class={props.classes.position} data-slot="problems-panel-position" dir="ltr">
            {positionText(row.problem.location)}
          </span>
        </>
      ) : (
        <>
          <span class={props.classes.icon} aria-hidden="true">
            <CornerDownRight class={icon.directional} />
          </span>
          <span class={props.classes.message} data-slot="problems-panel-message" dir="auto">
            {row.related.message}
          </span>
          <span class={props.classes.position} data-slot="problems-panel-position" dir="ltr">
            {`${documentName(row.related.location.uri)}:${positionText(row.related.location)}`}
          </span>
        </>
      )}
    </div>
  );
}
