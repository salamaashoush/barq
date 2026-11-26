import { type Child, Show, createSignal } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Archive } from "@barqjs/lucide/icons/archive";
import { ArchiveRestore } from "@barqjs/lucide/icons/archive-restore";
import { Trash2 } from "@barqjs/lucide/icons/trash-2";
import { Button, type ButtonVariant } from "@barqjs/ui/button";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { gap, layout } from "../style/index.ts";
import { Banner, InlineAlert, type alertStyles } from "./alert.tsx";
import { FormattedDate, type Moment, RelativeTime } from "./format.tsx";
import { useArcMessages } from "./messages.ts";
import { Sentence } from "./sentence.tsx";

export const restoreButtonStyles = variants({
  slots: { root: arc(gap[1.5]), icon: arc(layout.inlineCentre) },
});

type RestoreSlots = ReturnType<typeof restoreButtonStyles>;

export interface RestoreButtonProps extends Customisable<RestoreSlots> {
  /** What it brings back, which names the button for a screen reader: "Restore Homepage". */
  name: string;
  /** Its promise holds the button pending. */
  onRestore: () => unknown;
  /** @default "outline" */
  variant?: ButtonVariant;
  /** @default "sm" */
  size?: "sm" | "default";
  isDisabled?: boolean;
}

/**
 * Brings back an archived or deleted item: in a row of a recently deleted
 * list, or on the item's own page. "Restore" on screen, named for its item,
 * and pending while the restore runs.
 *
 * ```tsx
 * <RestoreButton name={channel.name} onRestore={() => api.restoreChannel(channel.id)} />
 * ```
 */
export function RestoreButton(props: RestoreButtonProps) {
  const messages = useArcMessages();
  const [pending, setPending] = createSignal(false, { ownedWrite: true });
  function cls(): RestoreSlots {
    return parts(restoreButtonStyles(), props.classes);
  }
  async function restore(): Promise<void> {
    setPending(true);
    try {
      await props.onRestore();
    } finally {
      setPending(false);
    }
  }
  return (
    <Button
      class={arc(cls().root, props.class, props.className)}
      data-slot="restore-button"
      variant={props.variant ?? "outline"}
      size={props.size ?? "sm"}
      isDisabled={props.isDisabled}
      isPending={pending()}
      aria-label={messages().restoreNamed(props.name)}
      onPress={() => void restore()}
    >
      <ArchiveRestore aria-hidden="true" class={cls().icon} />
      {messages().restore}
    </Button>
  );
}

type AlertSlots = ReturnType<typeof alertStyles>;

export interface LifecycleNoticeProps extends Customisable<AlertSlots> {
  /** `archived` keeps it whole but still; `deleted` keeps it until it is purged. */
  state: "archived" | "deleted";
  /** When it was archived or deleted. */
  at: Moment;
  /** Who did it. */
  by?: string;
  /** When a deleted item is removed for good. */
  purgeAt?: Moment;
  /** What the state means for the reader, under the line. @default the state's own words */
  description?: Child;
  /** What it brings back, which names the Restore button. */
  name: string;
  /** Restore; left out, there is no button, for a reader who may not. */
  onRestore?: () => unknown;
  /** `banner` runs across the top of the page; `inline` sits in its content. @default "banner" */
  placement?: "banner" | "inline";
  timeZone?: string;
}

/**
 * The strip on an archived or deleted item's page: who did it and when,
 * when a deleted one goes for good, what that means, and Restore for a
 * reader who may.
 *
 * ```tsx
 * <LifecycleNotice
 *   state="archived"
 *   at={project.archivedAt}
 *   by={project.archivedBy}
 *   name={project.name}
 *   onRestore={() => api.unarchive(project.id)}
 * />
 * ```
 *
 * A neutral status that waits its turn for a screen reader. Archiving and
 * deleting themselves ask through `confirm()`, whose `details` hold the
 * impact and whose `action` runs inside the question.
 */
export function LifecycleNotice(props: LifecycleNoticeProps) {
  return (
    <Show
      when={props.placement === "inline"}
      fallback={
        <Banner
          tone="neutral"
          icon={<NoticeIcon state={props.state} />}
          title={<NoticeTitle {...props} />}
          actions={<NoticeRestore {...props} />}
          class={props.class}
          className={props.className}
          classes={props.classes}
        >
          <NoticeBody {...props} />
        </Banner>
      }
    >
      <InlineAlert
        tone="neutral"
        icon={<NoticeIcon state={props.state} />}
        title={<NoticeTitle {...props} />}
        actions={<NoticeRestore {...props} />}
        class={props.class}
        className={props.className}
        classes={props.classes}
      >
        <NoticeBody {...props} />
      </InlineAlert>
    </Show>
  );
}

interface NoticeIconProps {
  state: "archived" | "deleted";
}

function NoticeIcon(props: NoticeIconProps) {
  return (
    <Show when={props.state === "deleted"} fallback={<Archive />}>
      <Trash2 />
    </Show>
  );
}

function NoticeTitle(props: LifecycleNoticeProps) {
  const messages = useArcMessages();
  return (
    <Sentence
      words={(date) =>
        props.state === "deleted"
          ? messages().deletedOn(props.by, date)
          : messages().archivedOn(props.by, date)
      }
    >
      <FormattedDate value={props.at} timeZone={props.timeZone} />
    </Sentence>
  );
}

function NoticeBody(props: LifecycleNoticeProps) {
  const messages = useArcMessages();
  return (
    <>
      {props.description ??
        (props.state === "deleted" ? messages().deletedHint : messages().archivedHint)}
      <Show when={props.state === "deleted" && props.purgeAt !== undefined}>
        {" "}
        <Sentence words={messages().purgedIn}>
          <RelativeTime value={props.purgeAt ?? 0} timeZone={props.timeZone} exact />
        </Sentence>
      </Show>
    </>
  );
}

function NoticeRestore(props: LifecycleNoticeProps) {
  return (
    <Show when={props.onRestore !== undefined}>
      <RestoreButton name={props.name} onRestore={() => props.onRestore?.()} />
    </Show>
  );
}
