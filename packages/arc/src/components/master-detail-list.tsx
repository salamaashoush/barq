import { type Child, Show, createEffect } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { Key } from "@barqjs/aria/collections";
import { controllable } from "@barqjs/aria/utils";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { Checkbox } from "@barqjs/ui/checkbox";
import { tokens } from "@barqjs/ui/theme/tokens";
import { isServer } from "@barqjs/web";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { gap, layout, place, space } from "../style/index.ts";
import { List, type ListProps } from "./item-list.tsx";
import { useArcMessages } from "./messages.ts";

export const masterDetailListStyles = variants({
  slots: {
    root: arc(layout.minZero, layout.scrollBlock),
    row: arc(layout.relative, place.afterLayer, {
      "[data-selected]::after": {
        insetBlock: "0",
        insetInlineStart: "0",
        width: space.x0_5,
        backgroundColor: tokens.primary,
      },
    }),
    line: arc(layout.row, layout.minZero, gap[1], { paddingInlineStart: space.x3 }),
    check: arc(layout.noShrink),
    content: arc(layout.grow, layout.minZero),
  },
});

type Slots = ReturnType<typeof masterDetailListStyles>;

export interface MasterDetailListProps<T>
  extends
    Pick<
      ListProps<T>,
      "items" | "getKey" | "getTextValue" | "disabledKeys" | "empty" | "section" | "virtual"
    >,
    Customisable<Slots> {
  /** One row's content: a `<ListItem>`. */
  children: (item: T) => Child;
  /** Names the list. */
  "aria-label": string;
  /** The row open in the viewer beside the list. */
  current?: Key;
  defaultCurrent?: Key;
  /** A press, or an arrow key moving onto a row: open it in the viewer. */
  onCurrentChange?: (key: Key) => void;
  /** A checkbox on each row, for acting on several at once. @default false */
  checkboxes?: boolean;
  checkedKeys?: Iterable<Key>;
  defaultCheckedKeys?: Iterable<Key>;
  onCheckedChange?: (keys: Set<Key>) => void;
  /** Whether a row's checkbox can be ticked: a row nothing can be done to says so by being disabled. */
  isCheckable?: (item: T) => boolean;
  id?: string;
}

interface MaybeKeyed {
  id?: Key;
}

interface TextFields {
  label?: unknown;
  name?: unknown;
  title?: unknown;
}

/**
 * A list read beside a viewer: the arrows move through the rows and each row
 * they reach opens, the open one marked at its start edge and kept in view,
 * with a checkbox per row for acting on several at once. Screenshots to
 * review, submissions to mark, messages to triage.
 *
 * ```tsx
 * <MasterDetailList
 *   aria-label="Screenshots"
 *   items={snapshots()}
 *   current={open()}
 *   onCurrentChange={setOpen}
 *   checkboxes
 *   checkedKeys={picked()}
 *   onCheckedChange={setPicked}
 * >
 *   {(shot) => <ListItem title={shot.name} description={shot.test} meta={<Status … />} />}
 * </MasterDetailList>
 * ```
 *
 * On `List`, a grid list whose one selected row is the open one, so the open
 * row is the list's Tab stop and a screen reader hears it as selected. The
 * checkboxes are their own controls inside each row, reached with the
 * arrows across it, and a press on one leaves the open row where it is.
 */
export function MasterDetailList<T>(props: MasterDetailListProps<T>) {
  const messages = useArcMessages();
  const root = makeRef<HTMLDivElement>();
  const [current, setCurrent] = controllable<Key | undefined>(
    () => props.current,
    () => props.defaultCurrent,
    (next) => {
      if (next !== undefined) props.onCurrentChange?.(next);
    },
  );
  const [checked, setChecked] = controllable<Set<Key>>(
    () => (props.checkedKeys === undefined ? undefined : new Set(props.checkedKeys)),
    () => new Set(props.defaultCheckedKeys ?? []),
    (next) => props.onCheckedChange?.(next),
  );
  function cls(): Slots {
    return parts(masterDetailListStyles(), props.classes);
  }
  function keyOf(item: T): Key {
    return props.getKey?.(item) ?? ((item as MaybeKeyed).id as Key);
  }
  function nameOf(item: T): string {
    const own = props.getTextValue?.(item);
    if (own !== undefined) return own;
    const record = item as TextFields;
    const text = record.label ?? record.name ?? record.title;
    return typeof text === "string" ? text : String(keyOf(item));
  }
  function check(key: Key, on: boolean): void {
    const next = new Set(checked());
    if (on) next.add(key);
    else next.delete(key);
    setChecked(next);
  }

  if (!isServer) {
    createEffect(
      () => [current(), root()] as const,
      ([key, element]) => {
        if (key === undefined || element === null) return;
        const row = element.querySelector(`[data-row-key="${CSS.escape(String(key))}"]`);
        row?.closest('[role="row"]')?.scrollIntoView?.({ block: "nearest" });
      },
    );
  }

  return (
    <div
      ref={root.set}
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="master-detail-list"
    >
      <List<T>
        aria-label={props["aria-label"]}
        items={props.items}
        getKey={props.getKey}
        getTextValue={props.getTextValue}
        disabledKeys={props.disabledKeys}
        empty={props.empty}
        section={props.section}
        virtual={props.virtual}
        classes={{ row: cls().row }}
        selectionMode="single"
        selectionBehavior="replace"
        disallowEmptySelection
        selectedKeys={current() === undefined ? [] : [current() as Key]}
        onSelectionChange={(keys: "all" | Set<Key>) => {
          if (keys === "all") return;
          const [next] = keys;
          if (next !== undefined && next !== current()) setCurrent(next);
        }}
      >
        {(item: T) => (
          <div
            class={cls().line}
            data-slot="master-detail-list-line"
            data-row-key={String(keyOf(item))}
          >
            <Show when={props.checkboxes === true}>
              <Checkbox
                class={cls().check}
                data-slot="master-detail-list-check"
                aria-label={messages().selectItemOf(nameOf(item))}
                isSelected={checked().has(keyOf(item))}
                isDisabled={props.isCheckable?.(item) === false}
                onChange={(on: boolean) => check(keyOf(item), on)}
              />
            </Show>
            <div class={cls().content} data-slot="master-detail-list-content">
              {props.children(item)}
            </div>
          </div>
        )}
      </List>
    </div>
  );
}
