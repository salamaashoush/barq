import { type Child, For, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Ellipsis } from "@barqjs/lucide/icons/ellipsis";
import { Button, type ButtonVariant } from "@barqjs/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { on } from "@barqjs/ui/conditions";
import { toast } from "@barqjs/ui/sonner";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, glyph, layout, space, target } from "../style/index.ts";
import { type ConfirmOptions, confirm } from "./confirm.tsx";
import { useArcMessages } from "./messages.ts";
import { serverMessage } from "./server-message.ts";

export const actionMenuStyles = variants({
  slots: {
    trigger: arc(fg.muted),
    menu: arc({ minWidth: "11rem" }),
    item: arc(layout.row, gap[2], target.size, { [on.belowMd]: { minBlockSize: space.x10 } }),
    icon: arc(layout.inlineCentre, glyph.md),
    separator: arc({}),
  },
});

type Slots = ReturnType<typeof actionMenuStyles>;

interface MenuActionBase {
  id: string;
  /** The item's words, and what a confirmation's button repeats. */
  label: string;
  /** Drawn before the label. */
  icon?: Child;
  isDisabled?: boolean;
}

/** An action that loses nothing: run on choosing it, or a link. */
export interface RegularMenuAction extends MenuActionBase {
  tone?: "default";
  /** A link to go to rather than something to run. */
  href?: string;
  /** Asked first when given, as `confirm()` asks. */
  confirm?: Omit<ConfirmOptions, "action">;
  /** Its failure is a toast, as a menu has nowhere inline to show it. */
  onAction?: () => unknown;
}

/** An action that removes something, so it always asks first, naming what goes. */
export interface DangerMenuAction extends MenuActionBase {
  tone: "danger";
  confirm: Omit<ConfirmOptions, "action" | "tone">;
  /** Run inside the confirmation, which shows its failure and stays open. */
  onAction: () => unknown;
}

export type MenuAction = RegularMenuAction | DangerMenuAction;

export interface ActionMenuProps extends Customisable<Slots> {
  actions: readonly MenuAction[];
  /** Names the trigger and the menu. @default the provider's `moreActions`, "More actions" */
  label?: string;
  /** @default "ghost" */
  variant?: ButtonVariant;
  /** @default "sm" */
  size?: "sm" | "default" | "lg";
  /** In place of the `•••` button. */
  trigger?: Child;
}

const ICON_SIZES = { sm: "icon-sm", default: "icon", lg: "icon-lg" } as const;

/**
 * The `•••` menu of a row or a record: its regular actions, then the
 * destructive ones after a separator, each of those confirmed in a dialog
 * that names what it removes and runs the action there.
 *
 * ```tsx
 * <ActionMenu
 *   actions={[
 *     { id: "rename", label: "Rename", icon: <Pencil />, onAction: rename },
 *     {
 *       id: "delete",
 *       label: "Delete",
 *       tone: "danger",
 *       confirm: { title: "Delete Homepage?", description: "Its 3,400 runs go with it." },
 *       onAction: () => api.deleteCheck(id),
 *     },
 *   ]}
 * />
 * ```
 *
 * A menu whose items the arrows, Home, End and typing move through, each
 * item tall enough for a finger on a phone or under a coarse pointer. A regular action
 * that fails says so in a toast; a destructive one fails inside its
 * confirmation, which stays open to try again. With no actions it draws
 * nothing.
 */
export function ActionMenu(props: ActionMenuProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(actionMenuStyles(), props.classes);
  }
  function label(): string {
    return props.label ?? messages().moreActions;
  }
  function regular(): readonly RegularMenuAction[] {
    return props.actions.filter((action): action is RegularMenuAction => action.tone !== "danger");
  }
  function danger(): readonly DangerMenuAction[] {
    return props.actions.filter((action): action is DangerMenuAction => action.tone === "danger");
  }

  async function run(action: MenuAction): Promise<void> {
    if (action.tone === "danger") {
      await confirm({
        ...action.confirm,
        tone: "danger",
        confirmLabel: action.confirm.confirmLabel ?? action.label,
        action: action.onAction,
      });
      return;
    }
    if (action.confirm !== undefined) {
      const sure = await confirm({
        ...action.confirm,
        confirmLabel: action.confirm.confirmLabel ?? action.label,
      });
      if (!sure) return;
    }
    try {
      await action.onAction?.();
    } catch (error) {
      toast.error(messages().actionFailed, {
        description: serverMessage(error, messages().somethingWentWrong),
      });
    }
  }

  return (
    <Show when={props.actions.length > 0}>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Show when={props.trigger === undefined} fallback={props.trigger}>
            <Button
              class={arc(cls().trigger, props.class, props.className)}
              data-slot="action-menu-trigger"
              variant={props.variant ?? "ghost"}
              size={ICON_SIZES[props.size ?? "sm"]}
              aria-label={label()}
            >
              <Ellipsis aria-hidden="true" />
            </Button>
          </Show>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          class={cls().menu}
          data-slot="action-menu"
          align="end"
          aria-label={label()}
        >
          <For each={regular()}>
            {(action: RegularMenuAction) => <ActionItem action={action} cls={cls()} run={run} />}
          </For>
          <Show when={regular().length > 0 && danger().length > 0}>
            <DropdownMenuSeparator class={cls().separator} />
          </Show>
          <For each={danger()}>
            {(action: DangerMenuAction) => <ActionItem action={action} cls={cls()} run={run} />}
          </For>
        </DropdownMenuContent>
      </DropdownMenu>
    </Show>
  );
}

interface ActionItemProps {
  action: MenuAction;
  cls: Slots;
  run: (action: MenuAction) => Promise<void>;
}

function ActionItem(props: ActionItemProps) {
  return (
    <DropdownMenuItem
      class={props.cls.item}
      data-slot="action-menu-item"
      id={props.action.id}
      textValue={props.action.label}
      variant={props.action.tone === "danger" ? "destructive" : "default"}
      isDisabled={props.action.isDisabled}
      href={props.action.tone === "danger" ? undefined : props.action.href}
      onAction={() => void props.run(props.action)}
    >
      <Show when={props.action.icon !== undefined}>
        <span class={props.cls.icon} aria-hidden="true">
          {props.action.icon}
        </span>
      </Show>
      {props.action.label}
    </DropdownMenuItem>
  );
}
