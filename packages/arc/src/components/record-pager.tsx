import { Show, onCleanup } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { ChevronUp } from "@barqjs/lucide/icons/chevron-up";
import { shortcut } from "@barqjs/primitives/keyboard";
import { isServer } from "@barqjs/web";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, layout, type } from "../style/index.ts";
import { IconButton } from "./icon-button.tsx";
import { maybeRouter } from "./link.ts";
import { useArcMessages } from "./messages.ts";

/**
 * Where the record being read sits among its neighbours, and how to reach
 * them: a handler, or a link when each neighbour has an address of its own.
 * A side with neither is the end of the list, and its button is disabled.
 */
export interface RecordSteps {
  onPrevious?: () => void;
  onNext?: () => void;
  previousHref?: string;
  nextHref?: string;
  /** The record's place, from 1, for "3 of 40". */
  position?: number;
  /** How many records there are to step through. */
  count?: number;
  /** Names the previous button: "Previous run at Frankfurt". @default "Previous" */
  previousLabel?: string;
  /** @default "Next" */
  nextLabel?: string;
}

export const recordPagerStyles = variants({
  slots: {
    root: arc(layout.row, layout.noShrink, gap[1]),
    position: arc(type.meta, type.numeric, fg.muted, layout.nowrap, {
      paddingInlineEnd: "calc(var(--spacing) * 1)",
    }),
    button: arc({}),
  },
});

type Slots = ReturnType<typeof recordPagerStyles>;

export interface RecordPagerProps extends RecordSteps, Customisable<Slots> {
  /**
   * K and J step back and on from anywhere on the page but a text field, while
   * this is on screen: in a record's sheet, or on a page that is one record of a list.
   * @default false
   */
  shortcuts?: boolean;
  id?: string;
}

/**
 * The previous and next record of a list, from the record being read: in a
 * `DetailSheet` opened from a table, or in a record page's header.
 *
 * ```tsx
 * <RecordPager
 *   position={index() + 1}
 *   count={rows().length}
 *   onPrevious={index() > 0 ? () => open(index() - 1) : undefined}
 *   onNext={index() < rows().length - 1 ? () => open(index() + 1) : undefined}
 *   shortcuts
 * />
 * ```
 *
 * The arrows point up and down, the way the list runs, so they read the same
 * either side of a right-to-left page. The position is a status, so a screen
 * reader hears "4 of 40" as K or J moves on.
 */
export function RecordPager(props: RecordPagerProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(recordPagerStyles(), props.classes);
  }
  function hasPrevious(): boolean {
    return props.onPrevious !== undefined || props.previousHref !== undefined;
  }
  function hasNext(): boolean {
    return props.onNext !== undefined || props.nextHref !== undefined;
  }
  const router = maybeRouter();
  function follow(href: string | undefined, handler: (() => void) | undefined): void {
    if (handler !== undefined) handler();
    else if (href !== undefined) {
      if (router === undefined) window.location.assign(href);
      else void router.navigate(href);
    }
  }
  if (!isServer && props.shortcuts === true) {
    onCleanup(
      shortcut("k", () => {
        if (hasPrevious()) follow(props.previousHref, props.onPrevious);
      }),
    );
    onCleanup(
      shortcut("j", () => {
        if (hasNext()) follow(props.nextHref, props.onNext);
      }),
    );
  }
  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="record-pager"
    >
      <Show when={props.position !== undefined && props.count !== undefined}>
        <span class={cls().position} role="status" dir="auto" data-slot="record-pager-position">
          {messages().recordPosition(props.position ?? 0, props.count ?? 0)}
        </span>
      </Show>
      <IconButton
        label={props.previousLabel ?? messages().previousRecord}
        shortcut={props.shortcuts === true ? "K" : undefined}
        variant="outline"
        size="sm"
        class={cls().button}
        slot="record-pager-previous"
        href={props.onPrevious === undefined ? props.previousHref : undefined}
        isDisabled={!hasPrevious()}
        onPress={() => props.onPrevious?.()}
      >
        <ChevronUp />
      </IconButton>
      <IconButton
        label={props.nextLabel ?? messages().nextRecord}
        shortcut={props.shortcuts === true ? "J" : undefined}
        variant="outline"
        size="sm"
        class={cls().button}
        slot="record-pager-next"
        href={props.onNext === undefined ? props.nextHref : undefined}
        isDisabled={!hasNext()}
        onPress={() => props.onNext?.()}
      >
        <ChevronDown />
      </IconButton>
    </div>
  );
}
