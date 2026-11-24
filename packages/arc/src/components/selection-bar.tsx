import { type Child, For, Show, createSignal } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { X } from "@barqjs/lucide/icons/x";
import { Button } from "@barqjs/ui/button";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bg, edge, elevation, fg, gap, layout, rounded, space, type } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";
import { type ConfirmOptions, confirm } from "./confirm.tsx";

/** Something done to every selected row at once. */
export interface SelectionAction<T> {
  label: string;
  /** Drawn before the label, `aria-hidden`: `<Archive aria-hidden="true" />`. */
  icon?: Child;
  /** `danger` draws it as destructive. */
  tone?: "default" | "danger";
  /** Asked first, through `confirm()`, with the rows it would act on. */
  confirm?: (rows: readonly T[]) => ConfirmOptions;
  /** Its promise holds the bar pending; once it settles the selection is cleared. */
  onAction: (rows: readonly T[]) => void | Promise<unknown>;
}

export interface SelectionBarProps<T> extends Customisable<Slots> {
  count: number;
  /** What is selected, handed to every action. */
  rows: readonly T[];
  actions: readonly SelectionAction<T>[];
  onClear: () => void;
  /** @default "3 selected" */
  selectedLabel?: (count: number) => string;
  /** @default "Clear selection" */
  clearLabel?: string;
  /** Names the group of actions. @default "Selection" */
  label?: string;
  /** Floats at the foot of the viewport while its list is in view. */
  floating?: boolean;
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
 * rows are ticked. An action with `confirm` asks first; while one runs the
 * others wait.
 */
export function SelectionBar<T>(props: SelectionBarProps<T>) {
  const [pending, setPending] = createSignal<SelectionAction<T> | null>(null);
  const messages = useArcMessages();
  const cls = (): Slots =>
    parts(selectionBarStyles({ floating: props.floating === true }), props.classes);

  const run = async (action: SelectionAction<T>): Promise<void> => {
    const rows = props.rows;
    if (action.confirm !== undefined && !(await confirm(action.confirm(rows)))) return;
    setPending(action);
    try {
      await action.onAction(rows);
      props.onClear();
    } finally {
      setPending(null);
    }
  };

  const content = () => (
    <div
      class={props.floating === true ? cls().root : arc(cls().root, props.class, props.className)}
      role="group"
      aria-label={props.label ?? messages().selection}
      data-slot="selection-bar"
      data-floating={props.floating === true ? "true" : "false"}
    >
      <span class={cls().count} role="status" data-slot="selection-bar-count">
        {(props.selectedLabel ?? messages().selected)(props.count)}
      </span>
      <For each={() => props.actions}>
        {(action: SelectionAction<T>) => (
          <Button
            variant="ghost"
            size="sm"
            class={action.tone === "danger" ? arc(cls().action, fg.danger) : cls().action}
            isPending={pending() === action}
            isDisabled={pending() !== null && pending() !== action}
            data-slot="selection-bar-action"
            onPress={() => void run(action)}
          >
            {action.icon}
            {action.label}
          </Button>
        )}
      </For>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={props.clearLabel ?? messages().clearSelection}
        class={cls().clear}
        isDisabled={pending() !== null}
        data-slot="selection-bar-clear"
        onPress={() => props.onClear()}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );

  return (
    <Show when={props.floating === true} fallback={content()}>
      <div class={arc(cls().dock, props.class, props.className)} data-slot="selection-bar-dock">
        {content()}
      </div>
    </Show>
  );
}
