import { type Child, Show, flush, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { numberFormatter } from "@barqjs/aria/i18n";
import { announce } from "@barqjs/aria/live";
import { X } from "@barqjs/lucide/icons/x";

import { arcLayer as arc } from "../layer.ts";
import {
  type ArcFieldProps,
  type FieldSlots,
  type FieldValueProps,
  Frame,
  bindField,
  fieldStyles,
} from "../lib/field.tsx";
import { type Customisable, parts } from "../lib/parts.ts";
import { edge, fg, gap, layout, rounded, space, type } from "../style/index.ts";
import { type EntityOption, EntityPicker } from "./entity-picker.tsx";
import { IconButton } from "./icon-button.tsx";
import { List, type ListReorderEvent, reorderItems } from "./item-list.tsx";
import { useArcMessages } from "./messages.ts";
import { PersonAvatar } from "./person-avatar.tsx";
import type { RemotePage, RemoteSearchFn } from "./remote-search.ts";

export const orderedMemberListStyles = variants({
  slots: {
    members: arc(edge.all, rounded.md, layout.minZero, { overflow: "hidden" }),
    member: arc(layout.row, gap[2], { minBlockSize: space.x10 }),
    position: arc(type.meta, type.numeric, layout.noShrink, {
      minInlineSize: space.x5,
      textAlign: "end",
    }),
    name: arc(type.sm, layout.grow, layout.minZero, layout.clip, layout.nowrap),
    left: arc(fg.muted, { fontStyle: "italic" }),
    detail: arc(type.meta, layout.noShrink),
    remove: arc(layout.noShrink),
    empty: arc(type.meta, { padding: space.x3 }),
    add: arc({}),
  },
});

type Slots = ReturnType<typeof orderedMemberListStyles> & FieldSlots;

export interface OrderedMemberListProps
  extends
    Omit<ArcFieldProps, "classes">,
    FieldValueProps<readonly EntityOption[]>,
    Customisable<Slots> {
  /** Finds people to add; the ones already listed are left out of its answers. */
  search: RemoteSearchFn<EntityOption>;
  /** No more than this many; the add field goes quiet at it. */
  max?: number;
  /** What an empty list says. @default the provider's `noMembers` */
  emptyLabel?: Child;
  /** @default the provider's `addMember`, "Add a member" */
  addLabel?: string;
  /** Rows drag to reorder as well as moving by their buttons. @default true */
  draggable?: boolean;
}

/**
 * People in an order that matters: an on-call rotation's turns, an
 * escalation's steps, a review chain.
 *
 * ```tsx
 * <OrderedMemberList
 *   label="Turn order"
 *   value={members()}
 *   onChange={setMembers}
 *   search={(query, { signal }) => api.members.search(query, { signal })}
 * />
 * ```
 *
 * A numbered `List` of people, each with their avatar, buttons that move
 * them earlier and later (quiet at the ends) and one that removes them, and
 * a drag handle for a pointer, a finger or the keyboard. An `EntityPicker`
 * under it adds people its `search` finds, leaving out those already
 * listed. A person whose name is gone reads as "Someone who left". Inside
 * `form.AppField` the list is the form's array, its errors under it.
 */
export function OrderedMemberList(props: OrderedMemberListProps) {
  const messages = useArcMessages();
  const of = bindField<readonly EntityOption[]>(props, []);
  const position = numberFormatter();
  let root: HTMLElement | undefined;
  function cls(): Slots {
    return parts({ ...fieldStyles(), ...orderedMemberListStyles() }, props.classes);
  }
  function members(): readonly EntityOption[] {
    return of.value() ?? [];
  }
  function nameOf(member: EntityOption): string {
    return member.label === "" ? messages().memberLeft : member.label;
  }
  function full(): boolean {
    return props.max !== undefined && members().length >= props.max;
  }
  function add(member: EntityOption | null): void {
    if (member === null) return;
    const listed = untrack(members);
    if (listed.some((one) => one.id === member.id)) return;
    of.change([...listed, member]);
    announce(
      untrack(() => messages().rowAdded(nameOf(member))),
      "polite",
    );
  }
  function remove(member: EntityOption): void {
    const listed = untrack(members);
    const at = listed.findIndex((one) => one.id === member.id);
    of.change(listed.filter((one) => one.id !== member.id));
    announce(
      untrack(() => messages().rowRemoved(nameOf(member))),
      "polite",
    );
    flush();
    const rows = root?.querySelectorAll<HTMLElement>('[data-slot="list-row"]');
    const next = rows?.[Math.min(at, rows.length - 1)];
    (
      next ?? root?.querySelector<HTMLElement>('[data-slot="ordered-member-list-add"] input')
    )?.focus();
  }
  function reorder(event: ListReorderEvent): void {
    of.change(reorderItems(untrack(members), event));
  }
  const search: RemoteSearchFn<EntityOption> = async (query, context) => {
    const found = await untrack(() => props.search)(query, context);
    const listed = new Set(untrack(members).map((one) => one.id));
    if (Array.isArray(found)) {
      return (found as readonly EntityOption[]).filter((one) => !listed.has(one.id));
    }
    const page = found as RemotePage<EntityOption>;
    return { ...page, results: page.results.filter((one) => !listed.has(one.id)) };
  };

  return (
    <Frame
      of={of}
      label={props.label}
      description={props.description}
      field={props}
      labelledById
      slot="ordered-member-list"
    >
      <div
        ref={(element: HTMLElement) => {
          root = element;
        }}
      >
        <List<EntityOption>
          class={cls().members}
          aria-labelledby={of.ids.label}
          items={members()}
          getTextValue={nameOf}
          moveButtons={props.isDisabled !== true}
          onReorder={props.isDisabled === true || props.draggable === false ? undefined : reorder}
          empty={
            <p class={cls().empty} data-slot="ordered-member-list-empty">
              {props.emptyLabel ?? messages().noMembers}
            </p>
          }
        >
          {(member: EntityOption) => (
            <div class={cls().member} data-slot="ordered-member-list-member">
              <span class={cls().position} data-slot="ordered-member-list-position">
                {position().format(members().indexOf(member) + 1)}
              </span>
              <PersonAvatar size="sm" person={{ name: nameOf(member), src: member.src }} />
              <span
                class={arc(cls().name, member.label === "" ? cls().left : undefined)}
                data-slot="ordered-member-list-name"
              >
                {nameOf(member)}
              </span>
              <Show when={member.description !== undefined}>
                <span class={cls().detail} data-slot="ordered-member-list-detail">
                  {member.description}
                </span>
              </Show>
              <Show when={props.isDisabled !== true}>
                <IconButton
                  class={cls().remove}
                  slot="ordered-member-list-remove"
                  size="sm"
                  label={messages().removeRowOf(nameOf(member))}
                  onPress={() => remove(member)}
                >
                  <X />
                </IconButton>
              </Show>
            </div>
          )}
        </List>
        <Show when={props.isDisabled !== true}>
          <EntityPicker
            class={cls().add}
            label={props.addLabel ?? messages().addMember}
            id={of.ids.control}
            search={search}
            value={null}
            isDisabled={full()}
            onChange={add}
          />
        </Show>
      </div>
    </Frame>
  );
}
