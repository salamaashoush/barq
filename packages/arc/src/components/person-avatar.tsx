import { type Child, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Avatar, AvatarFallback, AvatarImage, type AvatarSize } from "@barqjs/ui/avatar";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import type { Person } from "./avatar-stack.tsx";

export const personAvatarStyles = variants({
  slots: {
    root: arc({}),
    image: arc({}),
    fallback: arc({}),
  },
});

type Slots = ReturnType<typeof personAvatarStyles>;

export interface PersonAvatarProps extends Customisable<Slots> {
  person: Person;
  /** @default "default" */
  size?: AvatarSize;
  /** Inside the avatar after the picture: the words a screen reader hears, a presence badge. */
  children?: Child;
  role?: string;
  /** The root's slot, where the avatar is a part of something else. @default "person-avatar" */
  slot?: string;
}

/**
 * One person's avatar: their photo, or the initials of their name while it
 * loads or when it fails. The picture is decorative; the name is read from
 * the words beside it, or from `children`.
 */
export function PersonAvatar(props: PersonAvatarProps) {
  function cls(): Slots {
    return parts(personAvatarStyles(), props.classes);
  }
  return (
    <Avatar
      class={arc(cls().root, props.class, props.className)}
      data-slot={props.slot ?? "person-avatar"}
      role={props.role}
      size={props.size}
    >
      <Show when={props.person.src !== undefined}>
        <AvatarImage class={cls().image} src={props.person.src} alt="" />
      </Show>
      <AvatarFallback class={cls().fallback} aria-hidden="true">
        {initials(props.person.name)}
      </AvatarFallback>
      {props.children}
    </Avatar>
  );
}

/** The initials a person's avatar falls back to: the first letters of the first and last words. */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/u)
    .filter((one) => one !== "");
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
  return (first + last).toLocaleUpperCase();
}
