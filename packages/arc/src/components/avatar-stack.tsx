import { For, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { listFormatter, numberFormatter } from "@barqjs/aria/i18n";
import { AvatarBadge, AvatarGroup, AvatarGroupCount, type AvatarSize } from "@barqjs/ui/avatar";
import { srOnly } from "@barqjs/ui/sr-only";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bg, plainList, tone as tones, type } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";
import { PersonAvatar } from "./person-avatar.tsx";
import { PRESENCE_TONE, type Presence, presenceLabel } from "./presence.tsx";

export { initials } from "./person-avatar.tsx";

export type { Presence } from "./presence.tsx";

export interface Person {
  id?: string;
  name: string;
  /** A photo. Left out, or failing to load, the initials of `name`. */
  src?: string;
  presence?: Presence;
}

export const avatarStackStyles = variants({
  slots: {
    root: arc(plainList),
    avatar: arc({}),
    presence: arc(bg.toneSolid),
    count: arc(type.numeric),
    hint: arc(srOnly),
  },
});

type Slots = ReturnType<typeof avatarStackStyles>;

export interface AvatarStackProps extends Customisable<Slots> {
  people: readonly Person[];
  /** How many are drawn before the rest become "+3". @default 4 */
  max?: number;
  /** @default "default" */
  size?: AvatarSize;
  /** Names the group. @default the names, in a list the locale writes */
  "aria-label"?: string;
  id?: string;
}

/**
 * The people on something, overlapped: who is in a channel, assigned to a
 * task, editing a document.
 *
 * ```tsx
 * <AvatarStack people={members()} max={3} />
 * <AvatarStack people={[{ name: "Salama Ashoush", presence: "online" }]} size="sm" />
 * ```
 *
 * ui's avatar group, each a photo or initials, in a list a screen reader
 * counts. A presence dot is in a tone and in words ("Online"), and the ones
 * past `max` are one "+3" read as "3 more". The group is named by the names,
 * joined as the locale joins a list.
 */
export function AvatarStack(props: AvatarStackProps) {
  const messages = useArcMessages();
  const list = listFormatter({ type: "conjunction" });
  const format = numberFormatter();
  const max = (): number => Math.max(0, props.max ?? 4);
  const shown = (): readonly Person[] => props.people.slice(0, max());
  const rest = (): number => Math.max(0, props.people.length - max());
  const label = (): string => {
    if (props["aria-label"] !== undefined) return props["aria-label"];
    const names = shown().map((one) => one.name);
    if (rest() > 0) names.push(messages().moreCount(rest()));
    return list().format(names);
  };
  const cls = (): Slots => parts(avatarStackStyles(), props.classes);
  return (
    <AvatarGroup
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="avatar-stack"
      role="list"
      aria-label={label()}
    >
      <For each={() => shown()}>
        {(person: Person) => (
          <PersonAvatar
            person={person}
            class={cls().avatar}
            slot="avatar-stack-avatar"
            role="listitem"
            size={props.size}
          >
            <span class={cls().hint} data-slot="avatar-stack-name">
              {person.presence === undefined
                ? person.name
                : `${person.name}, ${presenceLabel(messages(), person.presence)}`}
            </span>
            <Show when={person.presence !== undefined}>
              <AvatarBadge
                class={arc(tones[PRESENCE_TONE[person.presence ?? "offline"]], cls().presence)}
                data-slot="avatar-stack-presence"
                data-presence={person.presence}
              />
            </Show>
          </PersonAvatar>
        )}
      </For>
      <Show when={rest() > 0}>
        <AvatarGroupCount class={cls().count} data-slot="avatar-stack-count" role="listitem">
          <span aria-hidden="true">{`+${format().format(rest())}`}</span>
          <span class={cls().hint}>{messages().moreCount(rest())}</span>
        </AvatarGroupCount>
      </Show>
    </AvatarGroup>
  );
}
