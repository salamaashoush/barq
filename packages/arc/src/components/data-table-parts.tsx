import { type Child, For, Show, createMemo, createSignal } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { numberFormatter } from "@barqjs/aria/i18n";
import { Ellipsis } from "@barqjs/lucide/icons/ellipsis";
import { Button, type ButtonSize } from "@barqjs/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { Spinner } from "@barqjs/ui/spinner";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { edge, fg, gap, layout, place, space, type } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

/** Something done to one row, from its menu or, for at most one, beside it. */
export interface DataTableRowAction {
  label: string;
  /** Drawn before the label, `aria-hidden`. */
  icon?: Child;
  /** `danger` draws it as destructive. */
  tone?: "default" | "danger";
  /**
   * Drawn beside the row rather than in its menu, on a wide screen. Only the
   * first such action is; a dangerous one never is.
   */
  inline?: boolean;
  /** A link, rather than an action: a payment page, a report. */
  href?: string;
  onAction?: () => void | Promise<unknown>;
  isDisabled?: boolean;
}

export const rowActionsStyles = variants({
  slots: {
    root: arc(layout.row, layout.end, gap[1]),
    inline: arc({}),
    menu: arc({}),
  },
});

type ActionSlots = ReturnType<typeof rowActionsStyles>;

export interface RowActionsProps extends Customisable<ActionSlots> {
  actions: readonly DataTableRowAction[];
  /** The row's name, which the menu button is named after. */
  name: string;
  /** Every action in the menu, as a phone's card draws them. */
  menuOnly?: boolean;
  /** The menu button's size: larger on a card, under a finger. @default "icon-sm" */
  size?: ButtonSize;
}

/** A row's own actions: at most one beside it, the rest in a menu named after the row. */
export function RowActions(props: RowActionsProps) {
  const messages = useArcMessages();
  const [pending, setPending] = createSignal<DataTableRowAction | null>(null);
  function cls(): ActionSlots {
    return parts(rowActionsStyles(), props.classes);
  }
  // Read once: a caller's `rowActions` makes new objects on every call, and
  // the inline action is told from the rest by identity.
  const actions = createMemo(() => props.actions);
  function inline(): DataTableRowAction | undefined {
    if (props.menuOnly === true) return undefined;
    return actions().find((action) => action.inline === true && action.tone !== "danger");
  }
  function rest(): DataTableRowAction[] {
    const shown = inline();
    return actions().filter((action) => action !== shown);
  }
  async function run(action: DataTableRowAction): Promise<void> {
    setPending(action);
    try {
      await action.onAction?.();
    } finally {
      setPending(null);
    }
  }
  return (
    <span class={arc(cls().root, props.class, props.className)} data-slot="row-actions">
      <Show when={inline()}>
        {(action: () => DataTableRowAction) => (
          <Button
            variant="ghost"
            size="sm"
            class={cls().inline}
            data-slot="row-actions-inline"
            href={action().href}
            isPending={pending() === action()}
            isDisabled={action().isDisabled}
            onPress={action().href === undefined ? () => void run(action()) : undefined}
          >
            {action().icon}
            {action().label}
          </Button>
        )}
      </Show>
      <Show when={rest().length > 0}>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button
              variant="ghost"
              size={props.size ?? "icon-sm"}
              class={cls().menu}
              data-slot="row-actions-menu"
              aria-label={messages().actionsFor(props.name)}
              isPending={pending() !== null && pending() !== inline()}
            >
              <Ellipsis aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" aria-label={messages().actionsFor(props.name)}>
            <For each={rest}>
              {(action: DataTableRowAction) => (
                <DropdownMenuItem
                  variant={action.tone === "danger" ? "destructive" : "default"}
                  href={action.href}
                  isDisabled={action.isDisabled}
                  onAction={action.href === undefined ? () => void run(action) : undefined}
                >
                  {action.icon}
                  {action.label}
                </DropdownMenuItem>
              )}
            </For>
          </DropdownMenuContent>
        </DropdownMenu>
      </Show>
    </span>
  );
}

export const dataTableStripStyles = variants({
  slots: {
    root: arc(
      layout.row,
      layout.between,
      layout.wrap,
      gap[4],
      edge.top,
      type.meta,
      fg.faint,
      {
        minHeight: space.x11,
      },
      place.padded,
    ),
    count: arc(type.numeric),
    more: arc({}),
  },
});

type StripSlots = ReturnType<typeof dataTableStripStyles>;

export interface DataTableNoteProps extends Customisable<StripSlots> {
  children: Child;
}

/**
 * A rule or a fact under a table's rows, in a `DataTable`'s `footer`:
 * "Online means it called in within the last two minutes."
 */
export function DataTableNote(props: DataTableNoteProps) {
  function cls(): StripSlots {
    return parts(dataTableStripStyles(), props.classes);
  }
  return (
    <div class={arc(cls().root, props.class, props.className)} data-slot="data-table-note">
      {props.children}
    </div>
  );
}

export interface DataTableCountProps extends Customisable<StripSlots> {
  /** The rows loaded so far. */
  shown: number;
  /** All there are, when the server says. */
  total?: number;
  /** Another page is there to load. */
  hasMore?: boolean;
  isLoading?: boolean;
  /** A Load more button while `hasMore`. */
  onLoadMore?: () => void;
  /** Fewer rows than this, all loaded, and the strip is not drawn. @default 0 */
  minRows?: number;
}

/**
 * How many rows a `DataTable` shows, in its `footer`: "Showing 25 of 120",
 * or "Showing 40, all loaded", with Load more while there is more.
 */
export function DataTableCount(props: DataTableCountProps) {
  const messages = useArcMessages();
  const format = numberFormatter();
  function cls(): StripSlots {
    return parts(dataTableStripStyles(), props.classes);
  }
  function drawn(): boolean {
    return props.hasMore === true || props.shown >= (props.minRows ?? 0);
  }
  function words(): string {
    const shown = format().format(props.shown);
    if (props.total !== undefined) return messages().showingOf(shown, format().format(props.total));
    return props.hasMore === true ? messages().showing(shown) : messages().showingAll(shown);
  }
  return (
    <Show when={drawn()}>
      <div class={arc(cls().root, props.class, props.className)} data-slot="data-table-count">
        <span class={cls().count} role="status" data-slot="data-table-count-text">
          {words()}
        </span>
        <Show when={props.hasMore === true && props.onLoadMore !== undefined}>
          <Button
            variant="outline"
            size="sm"
            class={cls().more}
            data-slot="data-table-count-more"
            isDisabled={props.isLoading === true}
            onPress={() => props.onLoadMore?.()}
          >
            <Show when={props.isLoading === true}>
              <Spinner />
            </Show>
            {messages().loadMore}
          </Button>
        </Show>
      </div>
    </Show>
  );
}
