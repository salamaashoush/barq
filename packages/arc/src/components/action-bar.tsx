import { type Child, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { Key } from "@barqjs/aria/collections";
import { ActionGroup, ActionGroupItem } from "@barqjs/aria/action-group";
import { Ellipsis } from "@barqjs/lucide/icons/ellipsis";
import { type ButtonVariant, buttonVariants } from "@barqjs/ui/button";
import { dropdownMenuVariants } from "@barqjs/ui/dropdown-menu";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { gap, glyph, layout } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

export interface BarAction {
  id: string;
  label: string;
  icon?: Child;
  /**
   * How long it stays out of the More menu as the bar narrows: the lowest
   * go first, equal ones from the end. @default 0
   */
  priority?: number;
  /** Shown as the icon alone while in the bar, named by `label`. */
  iconOnly?: boolean;
  isDisabled?: boolean;
  /** Drawn as destructive. */
  tone?: "danger";
}

export const actionBarStyles = variants({
  slots: {
    root: arc(layout.minZero, { flex: "1 1 auto" }),
    group: arc(layout.row, gap[1.5], { flexWrap: "nowrap" }),
    action: arc({}),
    icon: arc(layout.inlineCentre, glyph.md),
    more: arc({}),
    menu: arc({}),
    menuItem: arc(gap[2]),
  },
});

type Slots = ReturnType<typeof actionBarStyles>;

export interface ActionBarProps extends Customisable<Slots> {
  actions: readonly BarAction[];
  onAction: (id: string) => void;
  /** Names the bar. */
  "aria-label": string;
  /** @default "outline" */
  variant?: ButtonVariant;
  /** @default "sm" */
  size?: "sm" | "default";
  /** Move what does not fit into a More menu, or wrap it onto another line. @default "collapse" */
  overflow?: "collapse" | "wrap";
  isDisabled?: boolean;
}

/**
 * A row of a page's or a record's actions that keeps its most important
 * ones in view as it narrows, moving the rest into a More menu by
 * `priority`.
 *
 * ```tsx
 * <ActionBar
 *   aria-label="Invoice"
 *   actions={[
 *     { id: "send", label: "Send", priority: 3 },
 *     { id: "pdf", label: "Download PDF", icon: <Download />, priority: 1 },
 *     { id: "void", label: "Void", tone: "danger" },
 *   ]}
 *   onAction={run}
 * />
 * ```
 *
 * On `@barqjs/aria`'s action group: one Tab stop, the arrows moving in the
 * reading direction, and the More button a stop of its own when it holds the
 * remembered focus. The menu is ui's, and an item keeps its icon there.
 */
export function ActionBar(props: ActionBarProps) {
  const messages = useArcMessages();
  const cls = () => {
    const own = parts(actionBarStyles(), props.classes);
    const size = props.size ?? "sm";
    const menu = dropdownMenuVariants();
    return {
      ...own,
      action: arc(buttonVariants({ variant: props.variant ?? "outline", size }), own.action),
      more: arc(
        buttonVariants({
          variant: props.variant ?? "outline",
          size: size === "sm" ? "icon-sm" : "icon",
        }),
        own.more,
      ),
      menu: arc(menu.content, own.menu),
      menuItem: arc(menu.item, own.menuItem),
    };
  };
  const byId = (id: Key): BarAction | undefined => props.actions.find((one) => one.id === id);
  return (
    <div class={arc(cls().root, props.class, props.className)} data-slot="action-bar">
      <ActionGroup<BarAction>
        class={cls().group}
        data-slot="action-bar-group"
        items={props.actions}
        getKey={(action: BarAction) => action.id}
        getTextValue={(action: BarAction) => action.label}
        getPriority={(action: BarAction) => action.priority ?? 0}
        disabledKeys={props.actions.filter((one) => one.isDisabled === true).map((one) => one.id)}
        isDisabled={props.isDisabled}
        overflowMode={props.overflow === "wrap" ? "wrap" : "collapse"}
        aria-label={props["aria-label"]}
        moreClass={cls().more}
        moreIcon={<Ellipsis aria-hidden="true" />}
        moreLabel={messages().moreActions}
        menuClass={cls().menu}
        menuItemClass={cls().menuItem}
        onAction={(key: Key) => {
          if (byId(key) !== undefined) props.onAction(String(key));
        }}
      >
        {(action: BarAction) => (
          <ActionGroupItem
            class={cls().action}
            data-slot="action-bar-action"
            data-variant={action.tone === "danger" ? "destructive" : undefined}
            aria-label={action.iconOnly === true ? action.label : undefined}
          >
            <Show when={action.icon !== undefined}>
              <span class={cls().icon} data-slot="action-bar-icon" aria-hidden="true">
                {action.icon}
              </span>
            </Show>
            <Show when={action.iconOnly !== true}>{action.label}</Show>
          </ActionGroupItem>
        )}
      </ActionGroup>
    </div>
  );
}
