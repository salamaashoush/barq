import { type Child, For, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { Button, type ButtonVariant } from "@barqjs/ui/button";
import { ButtonGroup } from "@barqjs/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { gap, glyph, layout } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

export interface SplitAction {
  id: string;
  label: Child;
  /** What a typeahead in the menu matches, when `label` is not text. */
  textValue?: string;
  icon?: Child;
  /** Drawn as a destructive item. */
  tone?: "danger";
  isDisabled?: boolean;
  onAction: () => void;
}

export const splitButtonStyles = variants({
  slots: {
    root: arc({}),
    action: arc(gap[1.5]),
    trigger: arc({}),
    menu: arc({}),
    item: arc(layout.row, gap[2]),
    icon: arc(layout.inlineCentre, glyph.md),
  },
});

type Slots = ReturnType<typeof splitButtonStyles>;

export interface SplitButtonProps extends Customisable<Slots> {
  /** The default action's words. */
  children: Child;
  /** Before them. */
  icon?: Child;
  onPress: () => void;
  /** The alternatives, in the menu behind the arrow. */
  actions: readonly SplitAction[];
  /** @default "default" */
  variant?: ButtonVariant;
  /** @default "default" */
  size?: "sm" | "default" | "lg";
  isDisabled?: boolean;
  /** Pending: the default action is running. */
  isPending?: boolean;
  /** Names the arrow. @default the provider's `moreOptions`, "More options" */
  menuLabel?: string;
}

const ICON_SIZES = { sm: "icon-sm", default: "icon", lg: "icon-lg" } as const;

/**
 * A default action and its alternatives in one control: Send, and Schedule
 * or Save as draft behind the arrow beside it.
 *
 * ```tsx
 * <SplitButton onPress={send} actions={[{ id: "later", label: "Send later", onAction: schedule }]}>
 *   Send
 * </SplitButton>
 * ```
 *
 * Two buttons welded by ui's `ButtonGroup`, each its own Tab stop: the
 * default runs on a press, and the arrow opens a menu whose items the
 * arrows, Home, End and typing move through.
 */
export function SplitButton(props: SplitButtonProps) {
  const messages = useArcMessages();
  function cls() {
    return parts(splitButtonStyles(), props.classes);
  }
  return (
    <ButtonGroup class={arc(cls().root, props.class, props.className)} data-slot="split-button">
      <Button
        class={cls().action}
        data-slot="split-button-action"
        variant={props.variant ?? "default"}
        size={props.size ?? "default"}
        isDisabled={props.isDisabled}
        isPending={props.isPending}
        onPress={() => props.onPress()}
      >
        <Show when={props.icon !== undefined}>
          <span class={cls().icon} data-slot="split-button-icon" aria-hidden="true">
            {props.icon}
          </span>
        </Show>
        {props.children}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button
            class={cls().trigger}
            data-slot="split-button-trigger"
            variant={props.variant ?? "default"}
            size={ICON_SIZES[props.size ?? "default"]}
            isDisabled={props.isDisabled}
            aria-label={props.menuLabel ?? messages().moreOptions}
          >
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          class={cls().menu}
          data-slot="split-button-menu"
          align="end"
          aria-label={props.menuLabel ?? messages().moreOptions}
        >
          <For each={props.actions}>
            {(action: SplitAction) => (
              <DropdownMenuItem
                class={cls().item}
                data-slot="split-button-item"
                id={action.id}
                textValue={action.textValue}
                variant={action.tone === "danger" ? "destructive" : "default"}
                isDisabled={action.isDisabled}
                onAction={() => action.onAction()}
              >
                <Show when={action.icon !== undefined}>
                  <span class={cls().icon} aria-hidden="true">
                    {action.icon}
                  </span>
                </Show>
                {action.label}
              </DropdownMenuItem>
            )}
          </For>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}
