import { type Child, For, Show, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { controllable } from "@barqjs/aria/utils";
import { Smile } from "@barqjs/lucide/icons/smile";
import { Button } from "@barqjs/ui/button";

import { Chip } from "../components/chip.tsx";
import { FormDialog } from "../components/form-dialog.tsx";
import { type FieldOption, useArcForm } from "../components/form.tsx";
import { type ArcMessages, useArcMessages } from "../components/messages.ts";
import { type CustomStatus, statusHolds } from "../components/presence.tsx";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bg, gap, layout, place, rounded, type } from "../style/index.ts";
import { EmojiButton } from "./emoji-button.tsx";

/** When a status lapses by itself. */
export type StatusClearAfter = "never" | "30m" | "1h" | "4h" | "today" | "week";

/** A status offered in one press: an emoji, its words, and when it lapses. */
export interface StatusPreset {
  emoji?: string;
  text: string;
  clearAfter?: StatusClearAfter;
}

const CLEAR_AFTER: readonly StatusClearAfter[] = ["never", "30m", "1h", "4h", "today", "week"];

function clearAfterLabel(messages: ArcMessages, choice: StatusClearAfter): string {
  if (choice === "30m") return messages.clearIn30Minutes;
  if (choice === "1h") return messages.clearIn1Hour;
  if (choice === "4h") return messages.clearIn4Hours;
  if (choice === "today") return messages.clearToday;
  if (choice === "week") return messages.clearThisWeek;
  return messages.clearNever;
}

/**
 * The moment a status chosen at `now` lapses: after so long, at the end of
 * the day, or at the end of the week (Sunday), in the reader's own clock.
 */
export function statusExpiry(choice: StatusClearAfter, now: Date = new Date()): Date | undefined {
  const minutes = { "30m": 30, "1h": 60, "4h": 240 } as const;
  if (choice === "30m" || choice === "1h" || choice === "4h") {
    return new Date(now.getTime() + minutes[choice] * 60_000);
  }
  if (choice === "never") return undefined;
  const end = new Date(now);
  if (choice === "week") end.setDate(end.getDate() + ((7 - end.getDay()) % 7));
  end.setHours(23, 59, 59, 999);
  return end;
}

export const customStatusStyles = variants({
  slots: {
    current: arc(layout.row, layout.between, gap[2], bg.muted, rounded.md, place.padded),
    currentText: arc(layout.inlineRow, layout.minZero, gap[2], type.sm),
    line: arc(layout.row, gap[2], { alignItems: "flex-end" }),
    emoji: arc({ fontSize: "var(--text-lg)" }),
    text: arc(layout.grow, layout.minZero),
    presets: arc(layout.column, gap[2]),
    presetsLabel: arc(type.meta, layout.flush),
    presetList: arc(layout.row, layout.wrap, gap[2]),
  },
});

export type CustomStatusSlots = ReturnType<typeof customStatusStyles>;

export interface CustomStatusDialogProps extends Customisable<CustomStatusSlots> {
  /** The status set now, shown at the top with a button that clears it. */
  status?: CustomStatus;
  /** Sets the status; a failure thrown here is shown on the form. */
  onSave: (status: CustomStatus) => void | Promise<void>;
  /** Clears the status now. */
  onClear?: () => void | Promise<void>;
  /** Statuses offered in one press. */
  presets?: readonly StatusPreset[];
  /** The choices of when it lapses. @default never, 30 minutes, 1 hour, 4 hours, today, this week */
  clearAfterOptions?: readonly StatusClearAfter[];
  /** The control that opens it. */
  trigger?: Child;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface StatusForm {
  emoji: string;
  text: string;
  clearAfter: string | null;
}

/**
 * Where someone says what they are up to: an emoji, a few words, and when
 * it lapses. A dialog (a sheet on a phone) on `FormDialog`.
 *
 * ```tsx
 * <CustomStatusDialog trigger={<Button variant="ghost">Set a status</Button>} status={mine()}
 *   presets={[{ emoji: "📅", text: "In a meeting", clearAfter: "1h" }]}
 *   onSave={(status) => api.setStatus(status)} onClear={() => api.clearStatus()} />
 * ```
 *
 * The emoji is chosen with `EmojiButton`, a preset fills the emoji, the
 * words and the lapse in one press, and saving with neither emoji nor
 * words says what is missing. The status now, if any, is at the top with
 * a button that clears it.
 */
export function CustomStatusDialog(props: CustomStatusDialogProps) {
  const messages = useArcMessages();
  const [open, setOpen] = controllable<boolean>(
    () => props.open,
    () => untrack(() => props.defaultOpen) ?? false,
    (next) => props.onOpenChange?.(next),
  );
  const form = useArcForm(() => ({
    defaultValues: {
      emoji: untrack(() => props.status?.emoji) ?? "",
      text: untrack(() => props.status?.text) ?? "",
      clearAfter: "never",
    } as StatusForm,
    validators: {
      onSubmit: ({ value }) =>
        value.emoji === "" && value.text.trim() === ""
          ? { fields: { text: messages().statusNeedsSomething } }
          : undefined,
    },
    onSubmit: async ({ value }) => {
      const expiresAt = statusExpiry((value.clearAfter ?? "never") as StatusClearAfter);
      await props.onSave({
        ...(value.emoji === "" ? {} : { emoji: value.emoji }),
        ...(value.text.trim() === "" ? {} : { text: value.text.trim() }),
        ...(expiresAt === undefined ? {} : { expiresAt }),
      });
    },
  }));
  const emoji = form.useSelector((state) => state.values.emoji);
  function cls(): CustomStatusSlots {
    return parts(customStatusStyles(), props.classes);
  }
  function clearAfterOptions(): readonly FieldOption[] {
    return (props.clearAfterOptions ?? CLEAR_AFTER).map((choice) => ({
      value: choice,
      label: clearAfterLabel(messages(), choice),
    }));
  }
  function pick(preset: StatusPreset): void {
    form.setFieldValue("emoji", preset.emoji ?? "");
    form.setFieldValue("text", preset.text);
    if (preset.clearAfter !== undefined) form.setFieldValue("clearAfter", preset.clearAfter);
  }
  async function clear(): Promise<void> {
    await props.onClear?.();
    setOpen(false);
  }
  return (
    <FormDialog
      form={form}
      heading={messages().setStatus}
      trigger={props.trigger}
      open={open()}
      onOpenChange={setOpen}
      class={arc(props.class, props.className)}
    >
      <Show when={props.onClear !== undefined && statusHolds(props.status)}>
        <div class={cls().current} data-slot="custom-status-current">
          <span class={cls().currentText}>
            <Show when={props.status?.emoji !== undefined}>
              <span aria-hidden="true">{props.status?.emoji}</span>
            </Show>
            {props.status?.text ?? ""}
          </span>
          <Button
            variant="ghost"
            size="sm"
            data-slot="custom-status-clear"
            onPress={() => void clear()}
          >
            {messages().clearStatus}
          </Button>
        </div>
      </Show>
      <div class={cls().line} data-slot="custom-status-line">
        <EmojiButton
          label={messages().statusEmoji}
          variant="outline"
          size="md"
          onSelect={(chosen: string) => form.setFieldValue("emoji", chosen)}
        >
          <Show when={emoji() !== ""} fallback={<Smile />}>
            <span class={cls().emoji} data-slot="custom-status-emoji">
              {emoji()}
            </span>
          </Show>
        </EmojiButton>
        <div class={cls().text}>
          <form.AppField name="text">
            {(field) => (
              <field.TextField
                label={messages().statusText}
                placeholder={messages().statusPlaceholder}
                autoComplete="off"
              />
            )}
          </form.AppField>
        </div>
      </div>
      <Show when={(props.presets ?? []).length > 0}>
        <div class={cls().presets} data-slot="custom-status-presets">
          <p class={cls().presetsLabel}>{messages().statusSuggestions}</p>
          <div class={cls().presetList} role="group" aria-label={messages().statusSuggestions}>
            <For each={() => props.presets ?? []}>
              {(preset: StatusPreset) => (
                <Chip size="sm" onPress={() => pick(preset)} icon={preset.emoji}>
                  {preset.text}
                </Chip>
              )}
            </For>
          </div>
        </div>
      </Show>
      <form.AppField name="clearAfter">
        {(field) => (
          <field.SelectField label={messages().clearAfter} options={clearAfterOptions()} />
        )}
      </form.AppField>
    </FormDialog>
  );
}
