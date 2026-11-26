import {
  type Child,
  For,
  type JSXElement,
  Show,
  createEffect,
  createMemo,
  createSignal,
  untrack,
} from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { Key } from "@barqjs/aria/collections";
import { useLocale } from "@barqjs/aria/i18n";
import {
  Tree,
  TreeItem,
  TreeItemContent,
  TreeItemExpandButton,
  type TreeItemRenderState,
} from "@barqjs/aria/tree";
import { controllable } from "@barqjs/aria/utils";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { CircleCheck } from "@barqjs/lucide/icons/circle-check";
import { CircleDashed } from "@barqjs/lucide/icons/circle-dashed";
import { CircleMinus } from "@barqjs/lucide/icons/circle-minus";
import { CircleX } from "@barqjs/lucide/icons/circle-x";
import { Play } from "@barqjs/lucide/icons/play";
import { RotateCcw } from "@barqjs/lucide/icons/rotate-ccw";
import { Square } from "@barqjs/lucide/icons/square";
import { on } from "@barqjs/ui/conditions";
import { Button } from "@barqjs/ui/button";
import { icon } from "@barqjs/ui/shared-icon";
import { Spinner } from "@barqjs/ui/spinner";
import { srOnly } from "@barqjs/ui/sr-only";
import { ToggleGroup, ToggleGroupItem } from "@barqjs/ui/toggle-group";
import { isServer } from "@barqjs/web";

import type { CodeDiffProps } from "../code/code-diff.tsx";
import { codeSurface } from "../code/style.ts";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { type SourceLocation, documentName, positionText } from "../lib/source-location.ts";
import {
  edge,
  fg,
  gap,
  glyph,
  layout,
  rounded,
  space,
  surface,
  tone as tones,
  truncate,
  type,
} from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import { EmptyState } from "./empty-state.tsx";
import { IconButton } from "./icon-button.tsx";
import { type ArcMessages, useArcMessages } from "./messages.ts";
import { treeViewStyles } from "./tree-view.tsx";

export type TestStatus = "passed" | "failed" | "skipped" | "running" | "queued";

export const TEST_STATUSES: readonly TestStatus[] = [
  "failed",
  "passed",
  "skipped",
  "running",
  "queued",
];

/** Why a test failed. */
export interface TestFailure {
  message: string;
  /** What the assertion wanted, as text: compared with `actual` in a diff. */
  expected?: string;
  /** What it got. */
  actual?: string;
  /** The language `expected` and `actual` are written in, for their colours. */
  language?: string;
  /** Where it failed: the assertion's line. */
  location?: SourceLocation;
  /** The stack or trace, as the runner printed it. */
  trace?: string;
}

/** A test, or a suite of them when it has `children`. */
export interface TestNode {
  id: string;
  name: string;
  /** A test's result. A suite's is its tests' unless it is given. */
  status?: TestStatus;
  /** How long it took, in milliseconds. */
  duration?: number;
  failure?: TestFailure;
  /** Where it is written. */
  location?: SourceLocation;
  children?: readonly TestNode[];
}

export type TestCounts = Record<TestStatus, number>;

function leaves(nodes: readonly TestNode[]): TestNode[] {
  return nodes.flatMap((node) => (node.children === undefined ? [node] : leaves(node.children)));
}

/** How many tests, not suites, are in each status. A test with none is queued. */
export function testCounts(nodes: readonly TestNode[]): TestCounts {
  const counts: TestCounts = { passed: 0, failed: 0, skipped: 0, running: 0, queued: 0 };
  for (const test of leaves(nodes)) counts[test.status ?? "queued"]++;
  return counts;
}

/** A suite's status from its tests': failed beats running beats queued; all skipped is skipped. */
export function testStatus(node: TestNode): TestStatus {
  if (node.status !== undefined || node.children === undefined) return node.status ?? "queued";
  const counts = testCounts(node.children);
  if (counts.failed > 0) return "failed";
  if (counts.running > 0) return "running";
  if (counts.queued > 0) return "queued";
  if (counts.passed > 0) return "passed";
  return "skipped";
}

/** A test's or a run's length as a runner writes it: `12 ms`, `1.24 s`. */
export function testDurationText(milliseconds: number, locale: string): string {
  const seconds = milliseconds >= 1000;
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: seconds ? "second" : "millisecond",
    unitDisplay: "narrow",
    maximumFractionDigits: seconds ? 2 : 0,
  }).format(seconds ? milliseconds / 1000 : milliseconds);
}

function statusName(status: TestStatus, messages: ArcMessages): string {
  switch (status) {
    case "passed":
      return messages.testPassed;
    case "failed":
      return messages.testFailed;
    case "skipped":
      return messages.testSkipped;
    case "running":
      return messages.testRunning;
    default:
      return messages.testQueued;
  }
}

const STATUS_TONES: Record<TestStatus, Tone> = {
  passed: "success",
  failed: "danger",
  skipped: "neutral",
  running: "info",
  queued: "neutral",
};

interface StatusIconProps {
  status: TestStatus;
  class?: string;
}

function StatusIcon(props: StatusIconProps) {
  return (
    <span
      class={arc(tones[STATUS_TONES[props.status]], fg.toneBase, props.class)}
      data-slot="test-results-status"
      data-status={props.status}
      aria-hidden="true"
    >
      <Show when={props.status === "passed"}>
        <CircleCheck />
      </Show>
      <Show when={props.status === "failed"}>
        <CircleX />
      </Show>
      <Show when={props.status === "skipped"}>
        <CircleMinus />
      </Show>
      <Show when={props.status === "running"}>
        <Spinner />
      </Show>
      <Show when={props.status === "queued"}>
        <CircleDashed />
      </Show>
    </span>
  );
}

const tree = treeViewStyles();

export const testResultsStyles = variants({
  slots: {
    root: arc(layout.column, layout.minZero, layout.clip, surface.bordered),
    toolbar: arc(layout.row, layout.wrap, gap[2], edge.bottom, { padding: space.x2 }),
    actions: arc(layout.row, gap[1]),
    statuses: arc(layout.minZero, layout.scrollInline),
    status: arc(gap[1]),
    count: arc(type.numeric, fg.muted),
    total: arc(type.meta, type.numeric, layout.pushEnd),
    body: arc(layout.container, layout.minZero, layout.grow, layout.minZeroBlock, {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr)",
      [on.cqLg]: { gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" },
    }),
    tree: arc(layout.scrollBlock, {
      padding: space.x1,
      maxHeight: "var(--tests-height, 28rem)",
    }),
    row: arc({}),
    content: arc({}),
    expand: arc({}),
    spacer: arc({}),
    icon: arc(layout.inlineCentre, layout.noShrink, glyph.sm),
    name: arc(truncate, layout.minZero),
    duration: arc(type.meta, type.numeric, layout.noShrink, layout.pushEnd),
    run: arc(layout.noShrink),
    detail: arc(layout.column, gap[3], layout.minZero, layout.scrollBlock, edge.top, {
      padding: space.x3,
      [on.cqLg]: { borderBlockStartWidth: "0px", borderInlineStartWidth: "1px" },
    }),
    heading: arc(layout.row, gap[2], type.label, layout.minZero),
    meta: arc(type.meta, type.numeric),
    message: arc(codeSurface, type.written, fg.danger, rounded.md, {
      padding: space.x3,
      overflowX: "auto",
    }),
    sides: arc(layout.column, gap[2]),
    side: arc(layout.column, gap[1]),
    sideLabel: arc(type.caption, fg.muted),
    sideText: arc(codeSurface, type.written, rounded.md, { padding: space.x2, overflowX: "auto" }),
    trace: arc(codeSurface, type.written, fg.muted, rounded.md, {
      padding: space.x2,
      overflowX: "auto",
    }),
    source: arc({ alignSelf: "flex-start" }),
    hint: arc(type.meta),
    empty: arc({ padding: space.x4 }),
  },
});

type Slots = ReturnType<typeof testResultsStyles>;

export interface TestResultsProps extends Customisable<Slots> {
  tests: readonly TestNode[];
  /** Names the results. @default "Test results" */
  "aria-label"?: string;
  /** Run one test, or a suite's tests. Each row gets a run button. */
  onRun?: (id: string) => void;
  /** The toolbar's Run all. */
  onRunAll?: () => void;
  /** The toolbar's Rerun failed, with the failed tests' ids. */
  onRerunFailed?: (ids: string[]) => void;
  /** A run is going: the run buttons wait, and Stop calls this. */
  onStop?: () => void;
  running?: boolean;
  /** Enter on a test, or its Go to source: where it, or its failure, is written. */
  onSelect?: (location: SourceLocation, test: TestNode) => void;
  /** The statuses shown. @default every status */
  statuses?: readonly TestStatus[];
  defaultStatuses?: readonly TestStatus[];
  onStatusesChange?: (statuses: TestStatus[]) => void;
  /** The test whose result is shown beside the tree. */
  selected?: string | null;
  defaultSelected?: string | null;
  onSelectedChange?: (id: string | null) => void;
  /** Finding the tests. */
  isLoading?: boolean;
  /** Why the tests could not be found or run. */
  errorMessage?: string;
  /** What no tests at all says. @default "No tests yet" */
  empty?: Child;
  /** The tree's tallest, a CSS length. @default 28rem */
  height?: string;
  id?: string;
}

type DiffView = (props: CodeDiffProps) => JSXElement;

// The diff is CodeMirror's, which arc's main entry never loads up front: it
// arrives with the first failure that has an expected and an actual value.
const [diffView, setDiffView] = createSignal<DiffView | undefined>(undefined, {
  ownedWrite: true,
});
let diffRequested = false;

function loadDiff(): void {
  if (diffRequested) return;
  diffRequested = true;
  void import("../code/code-diff.tsx").then((module) => {
    setDiffView(() => module.CodeDiff);
  });
}

interface Shown {
  node: TestNode;
  children?: Shown[];
}

function filtered(nodes: readonly TestNode[], wanted: ReadonlySet<TestStatus>): Shown[] {
  return nodes.flatMap((node): Shown[] => {
    if (node.children === undefined) return wanted.has(node.status ?? "queued") ? [{ node }] : [];
    const children = filtered(node.children, wanted);
    return children.length === 0 ? [] : [{ node, children }];
  });
}

function suiteKeys(nodes: readonly TestNode[]): string[] {
  return nodes.flatMap((node) =>
    node.children === undefined ? [] : [node.id, ...suiteKeys(node.children)],
  );
}

function findTest(nodes: readonly TestNode[], id: string | null): TestNode | undefined {
  if (id === null) return undefined;
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findTest(node.children ?? [], id);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * A test run read as a tree of suites and tests: each one's status and
 * time, the run's counts, and the chosen test's failure beside the tree
 * with what was expected against what came back.
 *
 * ```tsx
 * <TestResults
 *   tests={[{ id: "math", name: "math", children: [
 *     { id: "add", name: "adds", status: "passed", duration: 3 },
 *     { id: "div", name: "divides", status: "failed", failure: { message: "4 is not 5", expected: "5", actual: "4" } },
 *   ] }]}
 *   onRun={(id) => runner.run(id)}
 *   onRunAll={() => runner.run()}
 *   onRerunFailed={(ids) => runner.run(...ids)}
 * />
 * ```
 *
 * On `@barqjs/aria`'s tree: Up and Down choose a test and show its result,
 * Left and Right fold a suite, Enter goes to the test's source through
 * `onSelect`, and each row's run button is reached with Right. The counts
 * filter by status. The diff is `CodeDiff`, loaded the first time a
 * failure has both sides; until then, and on a server, the two sides are
 * shown as text.
 */
export function TestResults(props: TestResultsProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  function cls(): Slots {
    return parts(testResultsStyles(), props.classes);
  }
  const [statuses, setStatuses] = controllable<readonly TestStatus[]>(
    () => props.statuses,
    () => props.defaultStatuses ?? TEST_STATUSES,
    (next) => props.onStatusesChange?.([...next]),
  );
  const [selected, setSelected] = controllable<string | null>(
    () => props.selected,
    () => props.defaultSelected ?? null,
    (next) => props.onSelectedChange?.(next),
  );
  const counts = createMemo(() => testCounts(props.tests));
  function present(): TestStatus[] {
    return TEST_STATUSES.filter((status) => counts()[status] > 0);
  }
  const shown = createMemo(() => filtered(props.tests, new Set(statuses())));
  const expandedAtFirst = untrack(() => suiteKeys(props.tests));
  function failedIds(): string[] {
    return leaves(props.tests)
      .filter((test) => test.status === "failed")
      .map((test) => test.id);
  }
  function total(): number | undefined {
    const timed = props.tests.filter((node) => node.duration !== undefined);
    if (timed.length === props.tests.length && timed.length > 0) {
      return timed.reduce((sum, node) => sum + (node.duration ?? 0), 0);
    }
    const tests = leaves(props.tests).filter((test) => test.duration !== undefined);
    return tests.length === 0
      ? undefined
      : tests.reduce((sum, test) => sum + (test.duration ?? 0), 0);
  }
  function chosen(): TestNode | undefined {
    return findTest(props.tests, selected());
  }
  function go(node: TestNode): void {
    const location = node.failure?.location ?? node.location;
    if (location !== undefined) props.onSelect?.(location, node);
  }

  if (!isServer) {
    createEffect(
      () => {
        const failure = chosen()?.failure;
        return failure?.expected !== undefined && failure.actual !== undefined;
      },
      (wanted) => {
        if (wanted) loadDiff();
      },
    );
  }

  return (
    <section
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="test-results"
      aria-label={props["aria-label"] ?? messages().testResults}
      aria-busy={props.isLoading === true || props.running === true ? "true" : undefined}
      style={props.height === undefined ? {} : { "--tests-height": props.height }}
    >
      <div class={cls().toolbar} data-slot="test-results-toolbar">
        <Show when={props.onRunAll !== undefined || props.onRerunFailed !== undefined}>
          <div class={cls().actions}>
            <Show when={props.onRunAll !== undefined}>
              <Button
                size="sm"
                variant="outline"
                data-slot="test-results-run-all"
                isDisabled={props.running === true}
                onPress={() => props.onRunAll?.()}
              >
                <Play aria-hidden="true" />
                {messages().runAllTests}
              </Button>
            </Show>
            <Show when={props.onRerunFailed !== undefined}>
              <Button
                size="sm"
                variant="outline"
                data-slot="test-results-rerun-failed"
                isDisabled={props.running === true || counts().failed === 0}
                onPress={() => props.onRerunFailed?.(failedIds())}
              >
                <RotateCcw aria-hidden="true" />
                {messages().rerunFailedTests}
              </Button>
            </Show>
            <Show when={props.running === true && props.onStop !== undefined}>
              <Button
                size="sm"
                variant="outline"
                data-slot="test-results-stop"
                onPress={() => props.onStop?.()}
              >
                <Square aria-hidden="true" />
                {messages().stopTests}
              </Button>
            </Show>
          </div>
        </Show>
        <Show when={present().length > 0}>
          <ToggleGroup
            type="multiple"
            variant="outline"
            size="sm"
            class={cls().statuses}
            aria-label={messages().testStatuses}
            value={[...statuses()]}
            onValueChange={(value: string | string[]) => {
              setStatuses((Array.isArray(value) ? value : [value]) as TestStatus[]);
            }}
          >
            <For each={present()}>
              {(status: TestStatus) => (
                <ToggleGroupItem
                  value={status}
                  class={cls().status}
                  data-slot="test-results-filter"
                >
                  <StatusIcon status={status} class={cls().icon} />
                  {statusName(status, messages())}
                  <span class={cls().count}>{counts()[status]}</span>
                </ToggleGroupItem>
              )}
            </For>
          </ToggleGroup>
        </Show>
        <Show when={total() !== undefined}>
          <span class={cls().total} data-slot="test-results-total">
            {messages().testsTook(testDurationText(total() ?? 0, locale().locale))}
          </span>
        </Show>
      </div>
      <Show
        when={props.errorMessage === undefined}
        fallback={
          <div class={cls().empty} role="alert" data-slot="test-results-error">
            {props.errorMessage}
          </div>
        }
      >
        <Show
          when={props.isLoading !== true || props.tests.length > 0}
          fallback={
            <div class={cls().empty} data-slot="test-results-loading">
              {messages().testsLoading}
            </div>
          }
        >
          <Show
            when={shown().length > 0}
            fallback={
              <div class={cls().empty} data-slot="test-results-empty">
                <EmptyState
                  placement="section"
                  kind={props.tests.length === 0 ? "empty" : "filtered"}
                  heading={
                    props.tests.length === 0
                      ? (props.empty ?? messages().testsEmpty)
                      : messages().testsNoMatches
                  }
                  onClearFilters={() => setStatuses(TEST_STATUSES)}
                />
              </div>
            }
          >
            <div class={cls().body} data-slot="test-results-body">
              <Tree<Shown>
                class={arc(tree.root, cls().tree)}
                data-slot="test-results-tree"
                aria-label={props["aria-label"] ?? messages().testResults}
                items={shown()}
                getKey={(row: Shown) => row.node.id}
                getTextValue={(row: Shown) => row.node.name}
                getChildren={(row: Shown) => row.children}
                defaultExpandedKeys={expandedAtFirst}
                selectionMode="single"
                selectionBehavior="replace"
                selectedKeys={selected() === null ? [] : [selected() as string]}
                onSelectionChange={(keys: "all" | Set<Key>) => {
                  if (keys === "all") return;
                  const [first] = keys;
                  setSelected(first === undefined ? null : String(first));
                }}
                onAction={(key: Key) => {
                  const node = findTest(props.tests, String(key));
                  if (node !== undefined) go(node);
                }}
              >
                {(row: Shown) => (
                  <TreeItem
                    class={arc(tree.row, cls().row)}
                    data-slot={
                      row.children === undefined ? "test-results-test" : "test-results-suite"
                    }
                    hasChildItems={row.children !== undefined}
                  >
                    <TreeItemContent>
                      {(state: TreeItemRenderState) => (
                        <TestLine
                          row={row}
                          state={state}
                          classes={cls()}
                          messages={messages()}
                          locale={locale().locale}
                          running={props.running === true}
                          onRun={props.onRun}
                        />
                      )}
                    </TreeItemContent>
                  </TreeItem>
                )}
              </Tree>
              <div
                class={cls().detail}
                data-slot="test-results-detail"
                role="region"
                aria-label={chosen()?.name ?? messages().testResult}
                aria-live="polite"
              >
                <Show
                  when={chosen()}
                  keyed
                  fallback={<p class={cls().hint}>{messages().testChoose}</p>}
                >
                  {(node: TestNode) => (
                    <TestDetail
                      node={node}
                      classes={cls()}
                      messages={messages()}
                      locale={locale().locale}
                      onSelect={props.onSelect === undefined ? undefined : () => go(node)}
                    />
                  )}
                </Show>
              </div>
            </div>
          </Show>
        </Show>
      </Show>
    </section>
  );
}

interface TestLineProps {
  row: Shown;
  state: TreeItemRenderState;
  classes: Slots;
  messages: ArcMessages;
  locale: string;
  running: boolean;
  onRun: ((id: string) => void) | undefined;
}

function TestLine(props: TestLineProps) {
  const node = props.row.node;
  function status(): TestStatus {
    return testStatus(node);
  }
  return (
    <div class={arc(tree.content, props.classes.content)} data-slot="test-results-content">
      <Show
        when={props.state.hasChildItems()}
        fallback={<span class={arc(tree.spacer, props.classes.spacer)} />}
      >
        <TreeItemExpandButton
          class={arc(tree.expand, props.classes.expand)}
          data-slot="test-results-expand"
        >
          <ChevronRight class={icon.directional} aria-hidden="true" />
        </TreeItemExpandButton>
      </Show>
      <StatusIcon status={status()} class={props.classes.icon} />
      <span class={srOnly}>{statusName(status(), props.messages)}</span>
      <span class={props.classes.name} data-slot="test-results-name" dir="auto">
        {node.name}
      </span>
      <Show when={node.duration !== undefined}>
        <span class={props.classes.duration} data-slot="test-results-duration">
          {testDurationText(node.duration ?? 0, props.locale)}
        </span>
      </Show>
      <Show when={props.onRun !== undefined}>
        <IconButton
          size="xs"
          tooltip={false}
          class={arc(props.classes.run, node.duration === undefined ? layout.pushEnd : undefined)}
          slot="test-results-run"
          label={
            status() === "failed" || status() === "passed"
              ? props.messages.rerunTest(node.name)
              : props.messages.runTest(node.name)
          }
          isDisabled={props.running}
          onPress={() => props.onRun?.(node.id)}
        >
          <Play />
        </IconButton>
      </Show>
    </div>
  );
}

interface TestDetailProps {
  node: TestNode;
  classes: Slots;
  messages: ArcMessages;
  locale: string;
  onSelect: (() => void) | undefined;
}

function TestDetail(props: TestDetailProps) {
  const node = props.node;
  const failure = node.failure;
  const location = failure?.location ?? node.location;
  function status(): TestStatus {
    return testStatus(node);
  }
  return (
    <>
      <div class={props.classes.heading} data-slot="test-results-heading">
        <StatusIcon status={status()} class={props.classes.icon} />
        <span class={truncate} dir="auto">
          {node.name}
        </span>
      </div>
      <p class={props.classes.meta} data-slot="test-results-summary">
        {statusName(status(), props.messages)}
        <Show when={node.duration !== undefined}>
          {` · ${testDurationText(node.duration ?? 0, props.locale)}`}
        </Show>
        <Show when={location !== undefined}>
          {` · ${documentName(location?.uri ?? "")}:${positionText(location ?? { line: 1 })}`}
        </Show>
      </p>
      <Show when={failure !== undefined}>
        <pre class={props.classes.message} data-slot="test-results-message" dir="ltr">
          {failure?.message}
        </pre>
      </Show>
      <Show when={failure?.expected !== undefined && failure.actual !== undefined}>
        <Show
          when={diffView() !== undefined}
          fallback={
            <div class={props.classes.sides} data-slot="test-results-sides">
              <div class={props.classes.side}>
                <span class={props.classes.sideLabel}>{props.messages.testExpected}</span>
                <pre class={props.classes.sideText} dir="ltr">
                  {failure?.expected}
                </pre>
              </div>
              <div class={props.classes.side}>
                <span class={props.classes.sideLabel}>{props.messages.testActual}</span>
                <pre class={props.classes.sideText} dir="ltr">
                  {failure?.actual}
                </pre>
              </div>
            </div>
          }
        >
          <FailureDiff failure={failure as TestFailure} messages={props.messages} />
        </Show>
      </Show>
      <Show when={failure?.trace !== undefined}>
        <pre class={props.classes.trace} data-slot="test-results-trace" dir="ltr">
          {failure?.trace}
        </pre>
      </Show>
      <Show when={props.onSelect !== undefined && location !== undefined}>
        <Button
          size="sm"
          variant="outline"
          class={props.classes.source}
          data-slot="test-results-source"
          onPress={() => props.onSelect?.()}
        >
          {props.messages.goToSource}
        </Button>
      </Show>
    </>
  );
}

interface FailureDiffProps {
  failure: TestFailure;
  messages: ArcMessages;
}

function FailureDiff(props: FailureDiffProps) {
  const Diff = diffView() as DiffView;
  return (
    <div data-slot="test-results-diff">
      <Diff
        original={props.failure.expected ?? ""}
        modified={props.failure.actual ?? ""}
        language={props.failure.language}
        layout="unified"
        collapseUnchanged={false}
        originalLabel={props.messages.testExpected}
        modifiedLabel={props.messages.testActual}
      />
    </div>
  );
}
