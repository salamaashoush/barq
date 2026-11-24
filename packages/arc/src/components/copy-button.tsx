import { type Child, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Check } from "@barqjs/lucide/icons/check";
import { Copy } from "@barqjs/lucide/icons/copy";
import { clipboard } from "@barqjs/primitives/clipboard";
import { Button, type ButtonSize, type ButtonVariant } from "@barqjs/ui/button";
import { srOnly } from "@barqjs/ui/sr-only";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { useArcMessages } from "./messages.ts";

export const copyButtonStyles = variants({
  slots: { root: arc({ display: "inline-flex" }), button: arc({}), status: srOnly },
});

type Slots = ReturnType<typeof copyButtonStyles>;

export interface CopyButtonProps extends Customisable<Slots> {
  /** What is copied. */
  value: string;
  /** Names the button when it has no text of its own, such as "Copy the API key". @default "Copy" */
  label?: string;
  /** Announced once the value is on the clipboard. @default "Copied" */
  copiedLabel?: string;
  /** Announced when the browser refuses the write. @default "Could not copy" */
  failedLabel?: string;
  /** Text beside the icon. Left out, the button is the icon alone and `label` names it. */
  children?: Child;
  /** How long it shows that it copied, in milliseconds. @default 2000 */
  resetAfter?: number;
  /** @default "ghost" */
  variant?: ButtonVariant;
  /** @default "icon-sm" without children, "sm" with them */
  size?: ButtonSize;
  disabled?: boolean;
  onCopy?: (value: string) => void;
}

/**
 * A button that puts a value on the clipboard and says that it did.
 *
 * ```tsx
 * <CopyButton value={token} label="Copy the API key" />
 * <CopyButton value={url}>Copy link</CopyButton>
 * ```
 *
 * The icon turns to a check for a moment, and a polite live region tells a
 * screen reader, which hears nothing from an icon changing.
 */
export function CopyButton(props: CopyButtonProps) {
  const copier = clipboard({ resetAfter: props.resetAfter ?? 2000 });
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(copyButtonStyles(), props.classes);
  }
  function message(): string {
    return copier.copied()
      ? (props.copiedLabel ?? messages().copied)
      : copier.error() === undefined
        ? ""
        : (props.failedLabel ?? messages().copyFailed);
  }

  function copy(): void {
    const value = props.value;
    copier.copy(value).then(
      () => props.onCopy?.(value),
      () => {},
    );
  }

  return (
    <span class={arc(cls().root, props.class, props.className)} data-slot="copy-button-root">
      <Button
        variant={props.variant ?? "ghost"}
        size={props.size ?? (props.children === undefined ? "icon-sm" : "sm")}
        class={cls().button}
        isDisabled={props.disabled}
        aria-label={props.children === undefined ? (props.label ?? messages().copy) : undefined}
        data-slot="copy-button"
        data-copied={copier.copied() ? "" : undefined}
        onPress={copy}
      >
        {copier.copied() ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        <Show when={props.children !== undefined}>{props.children}</Show>
      </Button>
      <span role="status" class={cls().status} data-slot="copy-button-status">
        {message()}
      </span>
    </span>
  );
}
