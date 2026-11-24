import { type Child, For, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { SmilePlus } from "@barqjs/lucide/icons/smile-plus";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { srOnly } from "@barqjs/ui/sr-only";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { gap, layout, type } from "../style/index.ts";
import { Chip } from "./chip.tsx";
import { IconButton } from "./icon-button.tsx";
import { useArcMessages } from "./messages.ts";

/** One emoji on something, how many put it there, and whether the reader did. */
export interface Reaction {
  emoji: string;
  count: number;
  /** The reader is one of the `count`. */
  reacted?: boolean;
  /** Who reacted, in words, for a screen reader and the title: "Salama and 2 others". */
  label?: string;
}

/** The emoji offered to react with when no picker is given. */
export const QUICK_REACTIONS: readonly string[] = ["👍", "❤️", "🎉", "😄", "👀"];

export const reactionBarStyles = variants({
  slots: {
    root: arc(layout.row, layout.wrap, gap[1]),
    chip: arc(type.numeric),
    add: arc({}),
  },
});

type Slots = ReturnType<typeof reactionBarStyles>;

export interface ReactionBarProps extends Customisable<Slots> {
  reactions: readonly Reaction[];
  /** Adding or taking back one. Left out, the chips are read-only and there is no add. */
  onReact?: (emoji: string, add: boolean) => void;
  /** Offered by the add button's menu. @default 👍 ❤️ 🎉 😄 👀 */
  quick?: readonly string[];
  /**
   * The add control in place of the menu of `quick`: an emoji picker in a
   * popover, handed the function that adds what is picked.
   */
  picker?: (pick: (emoji: string) => void) => Child;
  /** The root's slot, where the bar is part of something else. @default "reaction-bar" */
  slot?: string;
}

/**
 * The reactions on a comment or a message: a pressed chip per emoji with its
 * count, the reader's own pressed, and an add button.
 *
 * ```tsx
 * <ReactionBar reactions={message.reactions} onReact={(emoji, add) => react(message.id, emoji, add)} />
 * ```
 *
 * Each chip is a toggle a screen reader hears as the emoji, the count and who
 * reacted. Adding an emoji the reader already reacted with does nothing.
 */
export function ReactionBar(props: ReactionBarProps) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(reactionBarStyles(), props.classes);
  const pick = (emoji: string): void => {
    const held = props.reactions.find((one) => one.emoji === emoji);
    if (held?.reacted !== true) props.onReact?.(emoji, true);
  };
  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      data-slot={props.slot ?? "reaction-bar"}
      role="group"
      aria-label={messages().reactions}
    >
      <For each={props.reactions}>
        {(reaction: Reaction) => (
          <Chip
            class={cls().chip}
            size="sm"
            selected={reaction.reacted === true}
            isDisabled={props.onReact === undefined}
            onSelectedChange={(add) => props.onReact?.(reaction.emoji, add)}
          >
            <span aria-hidden="true" title={reaction.label}>
              {`${reaction.emoji} ${String(reaction.count)}`}
            </span>
            <span class={srOnly}>
              {messages().reactedWith(reaction.emoji, reaction.count, reaction.label)}
            </span>
          </Chip>
        )}
      </For>
      <Show when={props.onReact !== undefined}>
        <Show
          when={props.picker === undefined}
          fallback={
            <span class={cls().add} data-slot="reaction-bar-add">
              {props.picker?.(pick)}
            </span>
          }
        >
          <DropdownMenu>
            <DropdownMenuTrigger>
              <IconButton
                class={cls().add}
                label={messages().addReaction}
                variant="ghost"
                size="sm"
                tooltip={false}
              >
                <SmilePlus aria-hidden="true" />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent aria-label={messages().addReaction}>
              <For each={props.quick ?? QUICK_REACTIONS}>
                {(emoji: string) => (
                  <DropdownMenuItem id={emoji} textValue={emoji} onAction={() => pick(emoji)}>
                    {emoji}
                  </DropdownMenuItem>
                )}
              </For>
            </DropdownMenuContent>
          </DropdownMenu>
        </Show>
      </Show>
    </div>
  );
}
