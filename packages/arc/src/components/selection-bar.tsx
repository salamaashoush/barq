import { type Child, For, Show, createSignal } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { X } from "@barqjs/lucide/icons/x";
import { Button } from "@barqjs/ui/button";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bg, edge, elevation, fg, gap, layout, rounded, space, type } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";
import { type ConfirmOptions, confirm } from "./confirm.tsx";

interface SelectionActionBase<T> {
  label: string;
  /** Drawn before the label, `aria-hidden`: `<Archive aria-hidden="true" />`. */
  icon?: Child;
  /** `danger` draws it as destructive. */
  tone?: "default" | "danger";
  /**
   * The selected rows it can act on: acknowledge only the open ones, only
   * where the reader holds the right. It acts on those alone, says how many,
   * and is disabled while none qualify.
   */
  appliesTo?: (row: T) => boolean;
  /** Asked first, through `confirm()`, with the rows it would act on. */
  confirm?: (rows: readonly T[]) => ConfirmOptions;
}

/** One call for the whole selection: its promise holds the bar pending, then the selection clears. */
export interface SelectionBatchAction<T> extends SelectionActionBase<T> {
  onAction: (rows: readonly T[]) => void | Promise<unknown>;
  onEach?: never;
}

/**
 * One call per row, for an API with no bulk endpoint. Every row is tried and
 * a refusal does not stop the rest; the bar counts them as they settle. The
 * rows that went through leave the selection; the ones refused stay selected
 * with the first reason and a Retry.
 */
export interface SelectionEachAction<T> extends SelectionActionBase<T> {
  onEach: (row: T) => Promise<unknown>;
  onAction?: never;
  /** Rows in flight at once. @default all of them */
  concurrency?: number;
  /** Once every row has settled, with which went through and which were refused. */
  onSettled?: (result: SelectionResult<T>) => void;
}

/** Something done to the selected rows. */
export type SelectionAction<T> = SelectionBatchAction<T> | SelectionEachAction<T>;

export interface SelectionFailure<T> {
  row: T;
  error: unknown;
}

export interface SelectionResult<T> {
  done: readonly T[];
  failed: readonly SelectionFailure<T>[];
}

export interface SelectionBarProps<T> extends Customisable<Slots> {
  count: number;
  /** What is selected, handed to every action. */
  rows: readonly T[];
  actions: readonly SelectionAction<T>[];
  onClear: () => void;
  /**
   * After a per-row action that some rows refused: the rows to keep selected,
   * the refused ones. Without it the selection is left as it was.
   */
  onKeep?: (rows: readonly T[]) => void;
  /** @default "3 selected" */
  selectedLabel?: (count: number) => string;
  /** @default "Clear selection" */
  clearLabel?: string;
  /** Names the group of actions. @default "Selection" */
  label?: string;
  /** Floats at the foot of the viewport while its list is in view. */
  floating?: boolean;
}

interface Progress {
  settled: number;
  total: number;
}

interface Outcome<T> {
  action: SelectionEachAction<T>;
  done: number;
  failed: readonly SelectionFailure<T>[];
}

export const selectionBarStyles = variants({
  slots: {
    dock: arc(layout.row, layout.sticky, {
      pointerEvents: "none",
      insetBlockEnd: space.x4,
      justifyContent: "center",
      marginBlockStart: space.x3,
    }),
    root: arc(
      edge.all,
      rounded.lg,
      bg.popover,
      fg.popover,
      layout.row,
      layout.wrap,
      gap[1],
      type.sm,
      {
        pointerEvents: "auto",
        maxWidth: "100%",
        padding: space.x1_5,
        paddingInlineStart: space.x3,
      },
    ),
    count: arc(type.medium, type.numeric, { marginInlineEnd: space.x1_5 }),
    action: arc({}),
    eligible: arc(fg.muted, type.numeric),
    result: arc(layout.row, layout.wrap, gap[1], fg.danger, {
      flexBasis: "100%",
      paddingInlineEnd: space.x1_5,
    }),
    clear: arc({}),
  },
  variants: {
    floating: { true: { root: elevation.raised }, false: {} },
  },
});

type Slots = ReturnType<typeof selectionBarStyles>;

/**
 * How many rows are selected, what can be done to them, and a way to let go.
 *
 * ```tsx
 * <SelectionBar
 *   count={selected().size}
 *   rows={selectedInvoices()}
 *   actions={[{ label: "Archive", onAction: archive }]}
 *   onClear={() => setSelected(new Set())}
 * />
 * ```
 *
 * The count is a polite live region, so a screen reader hears it change as
 * rows are ticked and, for a per-row action, as each row settles. An action
 * with `confirm` asks first; while one runs the others wait. An action with
 * `appliesTo` acts only on the selected rows it fits and says how many.
 */
export function SelectionBar<T>(props: SelectionBarProps<T>) {
  const [pending, setPending] = createSignal<SelectionAction<T> | null>(null);
  const [progress, setProgress] = createSignal<Progress | null>(null);
  const [outcome, setOutcome] = createSignal<Outcome<T> | null>(null);
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(selectionBarStyles({ floating: props.floating === true }), props.classes);
  }

  function eligible(action: SelectionAction<T>): readonly T[] {
    const test = action.appliesTo;
    return test === undefined ? props.rows : props.rows.filter((row) => test(row));
  }

  async function each(action: SelectionEachAction<T>, rows: readonly T[]): Promise<void> {
    const failed: SelectionFailure<T>[] = [];
    const done: T[] = [];
    let settled = 0;
    let next = 0;
    setProgress({ settled: 0, total: rows.length });
    async function worker(): Promise<void> {
      while (next < rows.length) {
        const row = rows[next++] as T;
        try {
          await action.onEach(row);
          done.push(row);
        } catch (error) {
          failed.push({ row, error });
        }
        settled += 1;
        setProgress({ settled, total: rows.length });
      }
    }
    const lanes = Math.max(1, Math.min(rows.length, action.concurrency ?? rows.length));
    await Promise.all(Array.from({ length: lanes }, () => worker()));
    setProgress(null);
    const order = new Map(rows.map((row, at) => [row, at]));
    failed.sort((a, b) => (order.get(a.row) ?? 0) - (order.get(b.row) ?? 0));
    action.onSettled?.({ done, failed });
    if (failed.length === 0) {
      setOutcome(null);
      props.onClear();
      return;
    }
    setOutcome({ action, done: done.length, failed });
    props.onKeep?.(failed.map((one) => one.row));
  }

  async function run(action: SelectionAction<T>, given?: readonly T[]): Promise<void> {
    const rows = given ?? eligible(action);
    if (rows.length === 0) return;
    if (action.confirm !== undefined && !(await confirm(action.confirm(rows)))) return;
    setOutcome(null);
    setPending(action);
    try {
      if (action.onEach !== undefined) await each(action, rows);
      else {
        await action.onAction(rows);
        props.onClear();
      }
    } finally {
      setPending(null);
    }
  }

  function reason(error: unknown): string {
    if (error instanceof Error && error.message !== "") return error.message;
    return typeof error === "string" && error !== "" ? error : messages().somethingWentWrong;
  }

  function status(): string {
    const going = progress();
    if (going !== null) return messages().bulkProgress(going.settled, going.total);
    return (props.selectedLabel ?? messages().selected)(props.count);
  }

  function content() {
    return (
      <div
        class={props.floating === true ? cls().root : arc(cls().root, props.class, props.className)}
        role="group"
        aria-label={props.label ?? messages().selection}
        data-slot="selection-bar"
        data-floating={props.floating === true ? "true" : "false"}
      >
        <span class={cls().count} role="status" data-slot="selection-bar-count">
          {status()}
        </span>
        <For each={() => props.actions}>
          {(action: SelectionAction<T>) => {
            function count(): number {
              return eligible(action).length;
            }
            function partial(): boolean {
              return action.appliesTo !== undefined && count() < props.rows.length;
            }
            return (
              <Button
                variant="ghost"
                size="sm"
                class={action.tone === "danger" ? arc(cls().action, fg.danger) : cls().action}
                isPending={pending() === action}
                isDisabled={(pending() !== null && pending() !== action) || count() === 0}
                aria-label={
                  partial()
                    ? `${action.label}, ${messages().appliesTo(count(), props.rows.length)}`
                    : undefined
                }
                data-slot="selection-bar-action"
                onPress={() => void run(action)}
              >
                {action.icon}
                {action.label}
                <Show when={partial()}>
                  <span
                    class={cls().eligible}
                    data-slot="selection-bar-eligible"
                    aria-hidden="true"
                  >
                    {String(count())}
                  </span>
                </Show>
              </Button>
            );
          }}
        </For>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={props.clearLabel ?? messages().clearSelection}
          class={cls().clear}
          isDisabled={pending() !== null}
          data-slot="selection-bar-clear"
          onPress={() => {
            setOutcome(null);
            props.onClear();
          }}
        >
          <X aria-hidden="true" />
        </Button>
        <Show when={outcome()}>
          {(held: () => Outcome<T>) => (
            <span class={cls().result} data-slot="selection-bar-result" role="alert">
              {messages().bulkPartial(
                held().done,
                held().done + held().failed.length,
                reason(held().failed[0]?.error),
              )}
              <Button
                variant="outline"
                size="xs"
                data-slot="selection-bar-retry"
                isDisabled={pending() !== null}
                onPress={() =>
                  void run(
                    held().action,
                    held().failed.map((one) => one.row),
                  )
                }
              >
                {messages().retryFailed}
              </Button>
            </span>
          )}
        </Show>
      </div>
    );
  }

  return (
    <Show when={props.floating === true} fallback={content()}>
      <div class={arc(cls().dock, props.class, props.className)} data-slot="selection-bar-dock">
        {content()}
      </div>
    </Show>
  );
}
