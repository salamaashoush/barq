import { type Child, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { controllable } from "@barqjs/aria/utils";
import { Smile } from "@barqjs/lucide/icons/smile";
import type { ButtonVariant } from "@barqjs/ui/button";

import { IconButton, type IconButtonSize } from "../components/icon-button.tsx";
import { useArcMessages } from "../components/messages.ts";
import { ResponsiveOverlay } from "../components/responsive-overlay.tsx";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import type { EmojiEntry, EmojiSource } from "./emoji-data.ts";
import { EmojiPicker } from "./emoji-picker.tsx";

export const emojiButtonStyles = variants({
  slots: {
    root: arc({}),
    overlay: arc({}),
    picker: arc({}),
  },
});

type Slots = ReturnType<typeof emojiButtonStyles>;

export interface EmojiButtonProps extends Customisable<Slots> {
  /** An emoji was chosen; the picker has closed. */
  onSelect: (emoji: string, entry: EmojiEntry) => void;
  /** Names the button and the picker. @default arc's "Choose an emoji" */
  label?: string;
  /** The icon. @default a smiling face */
  children?: Child;
  /** Where the emoji come from. @default English, from emojibase */
  source?: EmojiSource;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** @default "sm" */
  size?: IconButtonSize;
  /** @default "ghost" */
  variant?: ButtonVariant;
  id?: string;
}

/**
 * An icon button that opens the `EmojiPicker`, a popover beside it on a wide
 * screen and a sheet under a finger, and closes once an emoji is chosen.
 *
 * ```tsx
 * <EmojiButton onSelect={(emoji) => insert(emoji)} />
 * <EmojiButton label="Add a reaction" onSelect={react}><SmilePlus /></EmojiButton>
 * ```
 *
 * The picker's search takes focus as it opens, and focus goes back to the
 * button as it closes.
 */
export function EmojiButton(props: EmojiButtonProps) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(emojiButtonStyles(), props.classes);
  const label = (): string => props.label ?? messages().emojiPicker;
  const [open, setOpen] = controllable<boolean>(
    () => props.open,
    () => untrack(() => props.defaultOpen) ?? false,
    (next) => props.onOpenChange?.(next),
  );
  return (
    <ResponsiveOverlay
      class={cls().overlay}
      heading={label()}
      desktop="popover"
      open={open()}
      onOpenChange={setOpen}
      trigger={
        <IconButton
          id={props.id}
          class={arc(cls().root, props.class, props.className)}
          slot="emoji-button"
          label={label()}
          variant={props.variant ?? "ghost"}
          size={props.size ?? "sm"}
          tooltip={false}
        >
          {props.children ?? <Smile aria-hidden="true" />}
        </IconButton>
      }
    >
      <EmojiPicker
        class={cls().picker}
        autoFocus
        source={props.source}
        onSelect={(emoji: string, entry: EmojiEntry) => {
          setOpen(false);
          props.onSelect(emoji, entry);
        }}
      />
    </ResponsiveOverlay>
  );
}
