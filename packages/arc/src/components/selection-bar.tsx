import { type Child, For, Show, createSignal } from "@barqjs/core";
import { X } from "@barqjs/lucide/icons/x";
import { Button } from "@barqjs/ui/button";

import { arcLayer as arc } from "../layer.ts";
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

export interface SelectionBarProps<T> {
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

const dock = arc({
  pointerEvents: "none",
  position: "sticky",
  insetBlockEnd: "calc(var(--spacing) * 4)",
  zIndex: "var(--z-sticky, 10)",
  display: "flex",
  justifyContent: "center",
  marginBlockStart: "calc(var(--spacing) * 3)",
});

const bar = arc({
  pointerEvents: "auto",
  display: "flex",
  maxWidth: "100%",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "calc(var(--spacing) * 1)",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "var(--border)",
  borderRadius: "calc(var(--radius) * 1.4)",
  backgroundColor: "var(--popover)",
  color: "var(--popover-foreground)",
  padding: "calc(var(--spacing) * 1.5)",
  paddingInlineStart: "calc(var(--spacing) * 3)",
  fontSize: "var(--text-sm)",
  '[data-floating="true"]': {
    boxShadow: "0 10px 15px -3px var(--shadow-color, rgb(0 0 0 / 0.1))",
  },
});

const count = arc({
  marginInlineEnd: "calc(var(--spacing) * 1.5)",
  fontWeight: "var(--font-weight-medium)",
  fontVariantNumeric: "tabular-nums",
});

const danger = arc({
  color: "var(--destructive)",
});

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
      class={bar}
      role="group"
      aria-label={props.label ?? "Selection"}
      data-slot="selection-bar"
      data-floating={props.floating === true ? "true" : "false"}
    >
      <span class={count} role="status" data-slot="selection-bar-count">
        {(props.selectedLabel ?? ((n: number) => `${String(n)} selected`))(props.count)}
      </span>
      <For each={() => props.actions}>
        {(action: SelectionAction<T>) => (
          <Button
            variant="ghost"
            size="sm"
            class={action.tone === "danger" ? danger : undefined}
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
        aria-label={props.clearLabel ?? "Clear selection"}
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
      <div class={dock} data-slot="selection-bar-dock">
        {content()}
      </div>
    </Show>
  );
}
