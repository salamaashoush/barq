import { Show, createSignal, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { CalendarSync } from "@barqjs/lucide/icons/calendar-sync";
import { Button } from "@barqjs/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@barqjs/ui/input-group";
import { srOnly } from "@barqjs/ui/sr-only";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, layout, type } from "../style/index.ts";
import { confirm } from "./confirm.tsx";
import { CopyButton } from "./copy-button.tsx";
import { DescriptionList } from "./description-list.tsx";
import { FormattedDate, type Moment, RelativeTime } from "./format.tsx";
import { useArcMessages } from "./messages.ts";
import { serverMessage } from "./server-message.ts";

export const calendarFeedStyles = variants({
  slots: {
    root: arc(layout.column, gap[3], layout.minZero),
    link: arc(layout.minZero),
    url: arc(type.mono, type.xs),
    apps: arc(layout.row, layout.wrap, gap[2]),
    existing: arc(type.body),
    note: arc(type.meta),
    error: arc(type.body, fg.danger, layout.flush),
    reset: arc({ alignSelf: "flex-start" }),
  },
});

type Slots = ReturnType<typeof calendarFeedStyles>;

/** A feed that exists but whose secret is not shown again. */
export interface CalendarFeedRecord {
  createdAt: Moment;
  /** When a calendar last read it; `null` when none has. */
  lastReadAt?: Moment | null;
}

export interface CalendarFeedProps extends Customisable<Slots> {
  /** The feed's `https:` address, while it may be shown. */
  url?: string;
  /** Names the calendar where an app asks: Outlook's subscription. */
  name?: string;
  /** A feed made before, whose address is not shown again. */
  existing?: CalendarFeedRecord;
  /** Makes a feed, or a new one in place of the old, which stops working. Resolves with its address. */
  onReset?: () => Promise<string>;
  /** The address is shown this once: say so, and that anyone with it sees the calendar. */
  shownOnce?: boolean;
}

/** The feed's address as a `webcal:` link, which a calendar app opens as a subscription. */
export function webcalUrl(url: string): string {
  return url.replace(/^https?:/, "webcal:");
}

/**
 * A private calendar feed, to subscribe to in the calendar a reader already
 * uses: its address to copy, buttons that open Google Calendar, Apple
 * Calendar and Outlook on it, and a reset that makes a new one.
 *
 * ```tsx
 * <CalendarFeed url={feed.url} name="Acme on-call" onReset={() => api.resetCalendarFeed()} />
 * <CalendarFeed existing={{ createdAt: feed.createdAt, lastReadAt: feed.readAt }} shownOnce
 *   onReset={() => api.resetCalendarFeed()} />
 * ```
 *
 * A feed's address is its secret. With `shownOnce` it is shown when made and
 * then only replaced: the block names when the current one was made and last
 * read, and a reset asks first, since the old address stops working.
 */
export function CalendarFeed(props: CalendarFeedProps) {
  const messages = useArcMessages();
  const id = createUniqueId();
  const [made, setMade] = createSignal<string | undefined>(undefined);
  const [pending, setPending] = createSignal(false);
  const [failure, setFailure] = createSignal<string | undefined>(undefined);
  function cls(): Slots {
    return parts(calendarFeedStyles(), props.classes);
  }
  function url(): string | undefined {
    return made() ?? props.url;
  }
  function google(feed: string): string {
    return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl(feed))}`;
  }
  function outlook(feed: string): string {
    const name = props.name === undefined ? "" : `&name=${encodeURIComponent(props.name)}`;
    return `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feed)}${name}`;
  }
  async function make(): Promise<void> {
    const reset = props.onReset;
    if (reset === undefined) return;
    setFailure(undefined);
    if (url() !== undefined || props.existing !== undefined) {
      await confirm({
        title: messages().calendarResetTitle,
        description: messages().calendarResetDescription,
        confirmLabel: messages().calendarReset,
        tone: "danger",
        action: async () => setMade(await reset()),
      });
      return;
    }
    setPending(true);
    try {
      setMade(await reset());
    } catch (error) {
      setFailure(serverMessage(error, messages().actionFailed));
    } finally {
      setPending(false);
    }
  }
  function feedUrl(): string {
    return url() ?? "";
  }
  return (
    <div class={arc(cls().root, props.class, props.className)} data-slot="calendar-feed">
      <Show
        when={url() !== undefined}
        fallback={
          <Show when={props.existing !== undefined}>
            <div data-slot="calendar-feed-existing">
              <DescriptionList
                class={cls().existing}
                layout="inline"
                items={[
                  {
                    term: messages().calendarFeedMade,
                    details: <FormattedDate value={props.existing?.createdAt ?? 0} />,
                  },
                  {
                    term: messages().calendarFeedLastRead,
                    details:
                      props.existing?.lastReadAt === undefined ||
                      props.existing.lastReadAt === null ? (
                        messages().calendarFeedNeverRead
                      ) : (
                        <RelativeTime value={props.existing.lastReadAt} />
                      ),
                  },
                ]}
              />
            </div>
          </Show>
        }
      >
        <label for={`${id}-url`} class={srOnly}>
          {messages().calendarFeedLink}
        </label>
        <InputGroup class={cls().link} data-slot="calendar-feed-link">
          <InputGroupInput
            id={`${id}-url`}
            class={cls().url}
            readOnly
            dir="ltr"
            value={feedUrl()}
            onFocus={(event: FocusEvent) => (event.currentTarget as HTMLInputElement).select()}
          />
          <InputGroupAddon align="inline-end">
            <CopyButton value={feedUrl()} label={messages().calendarFeedCopy} />
          </InputGroupAddon>
        </InputGroup>
        <div class={cls().apps} role="group" aria-label={messages().calendarFeedOpenIn}>
          <Button variant="outline" size="sm" href={google(feedUrl())} target="_blank">
            {messages().calendarGoogle}
          </Button>
          <Button variant="outline" size="sm" href={webcalUrl(feedUrl())}>
            {messages().calendarApple}
          </Button>
          <Button variant="outline" size="sm" href={outlook(feedUrl())} target="_blank">
            {messages().calendarOutlook}
          </Button>
        </div>
        <Show when={props.shownOnce === true}>
          <p class={cls().note} data-slot="calendar-feed-once">
            {messages().calendarFeedOnce}
          </p>
        </Show>
      </Show>
      <Show when={props.onReset !== undefined}>
        <Button
          variant={url() === undefined && props.existing === undefined ? "default" : "outline"}
          size="sm"
          class={cls().reset}
          isPending={pending()}
          onPress={() => void make()}
          data-slot="calendar-feed-reset"
        >
          <CalendarSync aria-hidden="true" />
          {url() === undefined && props.existing === undefined
            ? messages().calendarFeedMake
            : messages().calendarReset}
        </Button>
      </Show>
      <Show when={failure() !== undefined}>
        <p class={cls().error} role="alert" data-slot="calendar-feed-error">
          {failure()}
        </p>
      </Show>
      <p class={cls().note}>{messages().calendarFeedDelay}</p>
    </div>
  );
}
