import { type Child, For, Show, createSignal, onCleanup, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { dateFormatter } from "@barqjs/aria/i18n";
import { interval } from "@barqjs/primitives/timer";
import { Skeleton } from "@barqjs/ui/skeleton";
import type { RenderPart } from "@barqjs/ui/slot";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts, rendered } from "../lib/parts.ts";
import { edge, fg, gap, layout, plainList, rounded, space, surface, type } from "../style/index.ts";
import type { Person } from "./avatar-stack.tsx";
import { type Moment, hydrated, toDate } from "./format.tsx";
import { EmptyState } from "./empty-state.tsx";
import { useArcMessages } from "./messages.ts";
import { PersonAvatar } from "./person-avatar.tsx";
import { type CustomStatus, type Presence, PresenceDot, PresenceStatus } from "./presence.tsx";

/** One way to reach someone, or one fact about them. */
export interface ProfileContact {
  key: string;
  /** What it is: `"Email"`, `"Phone"`. */
  label: string;
  value: Child;
  /** Opens it: `mailto:`, `tel:`, a profile page. */
  href?: string;
  /** Beside the label: a mail or a phone icon. */
  icon?: Child;
}

export const profileCardStyles = variants({
  slots: {
    root: arc(layout.column, layout.minZero, gap[4]),
    header: arc(layout.row, layout.minZero, gap[3]),
    avatar: arc(layout.noShrink),
    identity: arc(layout.column, layout.minZero, gap[1]),
    name: arc(type.heading, { overflowWrap: "anywhere" }),
    title: arc(type.sm, fg.muted, layout.flush),
    presence: arc(type.sm),
    actions: arc(layout.row, layout.wrap, gap[2]),
    contacts: arc(plainList, layout.column, gap[3]),
    contact: arc(layout.row, gap[2], { alignItems: "flex-start" }),
    contactIcon: arc(fg.muted, layout.noShrink, {
      marginBlockStart: space.x0_5,
      "& > svg": { inlineSize: space.x4, blockSize: space.x4 },
    }),
    contactBody: arc(layout.column, layout.minZero),
    contactLabel: arc(type.meta),
    contactValue: arc(type.sm, { overflowWrap: "anywhere" }),
    section: arc(layout.column, gap[1], edge.top, { paddingBlockStart: space.x4 }),
    sectionHeading: arc(type.label, layout.flush),
    about: arc(type.body, fg.muted),
    skeletonAvatar: arc(rounded.full, layout.noShrink, {
      inlineSize: space.x10,
      blockSize: space.x10,
    }),
    skeletonName: arc({ blockSize: space.x5, inlineSize: "60%" }),
    skeletonLine: arc({ blockSize: space.x4, inlineSize: "50%" }),
  },
  variants: {
    variant: {
      card: { root: arc(surface.card, { padding: space.x5 }) },
      panel: {
        header: arc(layout.column, { textAlign: "center" }),
        identity: arc({ alignItems: "center" }),
        avatar: arc({ inlineSize: "5rem", blockSize: "5rem", fontSize: "var(--text-2xl)" }),
        actions: arc({ justifyContent: "center" }),
      },
    },
  },
  defaults: { variant: "card" },
});

export type ProfileCardSlots = ReturnType<typeof profileCardStyles>;

export interface ProfileCardRenders {
  name?: RenderPart<Child>;
}

export interface ProfileCardProps extends Customisable<ProfileCardSlots> {
  person: Person;
  /** Their presence, a dot on the avatar and a word under the name. */
  presence?: Presence;
  /** What they say about themselves, shown until it lapses. */
  status?: CustomStatus;
  /** Their role or title, under the name. */
  title?: Child;
  /** Message, call: their own buttons. */
  actions?: Child;
  contacts?: readonly ProfileContact[];
  /** Where they are, so their own time is written beside the reader's: `"Europe/Berlin"`. */
  timeZone?: string;
  /** What they wrote about themselves. */
  about?: Child;
  /** The moment the local time is written for on the server and while hydrating. */
  now?: Moment;
  /** A card, or the column of a side panel with the avatar centred and larger. @default "card" */
  variant?: "card" | "panel";
  /** Shapes in place of the person while they load. */
  loading?: boolean;
  /** Nobody to show: the person was not found, or was removed. */
  missing?: boolean;
  /** Another element for the name: a heading at the page's level. */
  renders?: ProfileCardRenders;
  id?: string;
}

/**
 * A person at a glance: who they are, whether they are around, what they
 * said about themselves, how to reach them and what time it is where they
 * are. A member's card, a side panel opened from a name.
 *
 * ```tsx
 * <ProfileCard
 *   person={{ name: "Salama Ashoush", src: avatar }}
 *   presence="online"
 *   status={{ emoji: "🌴", text: "On leave", expiresAt: "2026-12-01" }}
 *   title="Engineering"
 *   timeZone="Africa/Cairo"
 *   contacts={[{ key: "email", label: "Email", value: "salama@example.com", href: "mailto:salama@example.com" }]}
 *   actions={<Button>Message</Button>}
 * />
 * ```
 *
 * A region named by the person's name. The presence is a dot with its word,
 * the status a `PresenceStatus`; the local time is written once the page
 * has hydrated (or for `now`), so the server and the browser agree.
 */
export function ProfileCard(props: ProfileCardProps) {
  const messages = useArcMessages();
  const clock = dateFormatter({ timeStyle: "short", timeZone: untrack(() => props.timeZone) });
  const local = hydrated();
  const [tick, setTick] = createSignal(0, { ownedWrite: true });
  onCleanup(interval(() => setTick((n) => n + 1), 60_000));
  function cls(): ProfileCardSlots {
    return parts(profileCardStyles({ variant: props.variant }), props.classes);
  }
  function localTime(): string | undefined {
    tick();
    if (props.timeZone === undefined) return undefined;
    if (local()) return clock().format(new Date());
    return props.now === undefined ? undefined : clock().format(toDate(props.now));
  }
  function nameContent(): Child {
    return props.person.name;
  }
  return (
    <section
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="profile-card"
      data-variant={props.variant ?? "card"}
      aria-label={props.loading === true || props.missing === true ? undefined : props.person.name}
      aria-busy={props.loading === true ? "true" : undefined}
    >
      <Show
        when={props.missing !== true}
        fallback={<EmptyState placement="section" heading={messages().personMissing} />}
      >
        <Show
          when={props.loading !== true}
          fallback={
            <div class={cls().header} data-slot="profile-card-header">
              <Skeleton class={cls().skeletonAvatar} />
              <div class={cls().identity}>
                <Skeleton class={cls().skeletonName} />
                <Skeleton class={cls().skeletonLine} />
              </div>
            </div>
          }
        >
          <div class={cls().header} data-slot="profile-card-header">
            <PersonAvatar
              class={cls().avatar}
              slot="profile-card-avatar"
              person={props.person}
              size="lg"
            >
              <Show when={props.presence}>
                {(presence: () => Presence) => (
                  <PresenceDot presence={presence()} anchored label={false} />
                )}
              </Show>
            </PersonAvatar>
            <div class={cls().identity} data-slot="profile-card-identity">
              {props.renders?.name === undefined ? (
                <h2 class={cls().name} data-slot="profile-card-name">
                  {nameContent()}
                </h2>
              ) : (
                rendered(
                  props.renders.name,
                  { class: cls().name, "data-slot": "profile-card-name" },
                  nameContent(),
                )
              )}
              <Show when={props.title !== undefined}>
                <p class={cls().title} data-slot="profile-card-title">
                  {props.title}
                </p>
              </Show>
              <Show when={props.presence}>
                {(presence: () => Presence) => (
                  <PresenceStatus
                    class={cls().presence}
                    presence={presence()}
                    status={props.status}
                    now={props.now}
                  />
                )}
              </Show>
            </div>
          </div>
          <Show when={props.actions !== undefined}>
            <div class={cls().actions} data-slot="profile-card-actions">
              {props.actions}
            </div>
          </Show>
          <Show when={(props.contacts ?? []).length > 0 || props.timeZone !== undefined}>
            <ul
              class={arc(cls().contacts, cls().section)}
              data-slot="profile-card-contacts"
              aria-label={messages().contactDetails}
            >
              <For each={() => props.contacts ?? []}>
                {(contact: ProfileContact) => (
                  <li class={cls().contact} data-slot="profile-card-contact">
                    <Show when={contact.icon !== undefined}>
                      <span class={cls().contactIcon} aria-hidden="true">
                        {contact.icon}
                      </span>
                    </Show>
                    <span class={cls().contactBody}>
                      <span class={cls().contactLabel}>{contact.label}</span>
                      <span class={cls().contactValue}>
                        <Show when={contact.href !== undefined} fallback={contact.value}>
                          <a class={fg.link} href={contact.href}>
                            {contact.value}
                          </a>
                        </Show>
                      </span>
                    </span>
                  </li>
                )}
              </For>
              <Show when={props.timeZone !== undefined}>
                <li class={cls().contact} data-slot="profile-card-time">
                  <span class={cls().contactBody}>
                    <span class={cls().contactLabel}>{messages().localTime}</span>
                    <span class={cls().contactValue}>
                      {localTime() === undefined
                        ? props.timeZone
                        : messages().timeIn(localTime() ?? "", props.timeZone ?? "")}
                    </span>
                  </span>
                </li>
              </Show>
            </ul>
          </Show>
          <Show when={props.about !== undefined}>
            <div class={cls().section} data-slot="profile-card-about">
              <h3 class={cls().sectionHeading}>{messages().about}</h3>
              <p class={arc(cls().about, layout.flush)}>{props.about}</p>
            </div>
          </Show>
        </Show>
      </Show>
    </section>
  );
}
