/**
 * Which items of a row go into a menu when the row runs out of room,
 * measured the way React Spectrum measures them: show everything and measure
 * each item, keep what fits, and if that leaves a menu, decide again with the
 * menu button's own size, since it takes room too.
 *
 * What fits is chosen by priority, the highest first and then in order, so
 * with no priorities the trailing items go; the ones kept stay where they
 * were written. `keep` is an item that never goes, such as the selected tab.
 * `isAllOrNothing` sends every item into the menu once any has to go, for a
 * group whose items are one choice.
 */

import { type Accessor, createEffect, createSignal, untrack } from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { resizeObserver } from "@barqjs/primitives/observers";

import type { Key } from "./collections.ts";
import type { ElementRef } from "./interactions/press.ts";
import type { Orientation } from "./selection.ts";
import { access } from "./utils.ts";

function outerSize(element: HTMLElement, horizontal: boolean, first: boolean, last: boolean) {
  const style = window.getComputedStyle(element);
  const box = element.getBoundingClientRect();
  const margin = (value: string): number => {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  if (horizontal) {
    return (
      box.width + (first ? 0 : margin(style.marginLeft)) + (last ? 0 : margin(style.marginRight))
    );
  }
  return (
    box.height + (first ? 0 : margin(style.marginTop)) + (last ? 0 : margin(style.marginBottom))
  );
}

export interface OverflowChoice {
  /** The items, in order. */
  keys: readonly Key[];
  /** Each item's size along the row, in the same order. */
  sizes: readonly number[];
  /** The room the row has. */
  room: number;
  /** The menu button's size, once there is one. */
  menu: number;
  /** How long an item stays out of the menu: the highest go last. */
  priority?: (key: Key, index: number) => number;
  /** An item that never goes into the menu. */
  keep?: Key;
  /** Everything into the menu once anything has to go. */
  isAllOrNothing?: boolean;
}

/** The items that go into the menu, from their measured sizes. */
export function overflowingKeys(choice: OverflowChoice): ReadonlySet<Key> {
  const total = choice.sizes.reduce((sum, one) => sum + one, 0);
  if (Math.round(total) <= Math.round(choice.room)) return new Set();
  const order = choice.keys
    .map((key, index) => ({
      key,
      index,
      priority: key === choice.keep ? Infinity : (choice.priority?.(key, index) ?? 0),
    }))
    .toSorted((one, other) => other.priority - one.priority || one.index - other.index);
  const kept = new Set<Key>();
  let used = choice.menu;
  for (const { key, index } of order) {
    used += choice.sizes[index] ?? 0;
    if (Math.round(used) > Math.round(choice.room) && key !== choice.keep) break;
    kept.add(key);
  }
  if (choice.isAllOrNothing === true) kept.clear();
  return new Set(choice.keys.filter((key) => !kept.has(key)));
}

export interface OverflowOptions {
  /** The box whose size is the room the row has, which fills its parent. */
  wrapperRef: ElementRef;
  /** The row, whose children are the items in order. */
  groupRef: ElementRef;
  /** The menu button, when it is not the row's last child. */
  menuRef?: ElementRef;
  isCollapsing: Accessor<boolean>;
  orientation: Accessor<Orientation>;
  keys: Accessor<readonly Key[]>;
  priority?: (key: Key, index: number) => number;
  keep?: Accessor<Key | undefined>;
  isAllOrNothing?: Accessor<boolean>;
}

/** The items in the menu, kept up to date as the row's room and items change. */
export function overflowItems(options: OverflowOptions): {
  hidden: Accessor<ReadonlySet<Key>>;
  isMeasuring: Accessor<boolean>;
} {
  const NONE: ReadonlySet<Key> = new Set();
  const [hidden, setHidden] = createSignal<ReadonlySet<Key>>(NONE);
  const [phase, setPhase] = createSignal<"idle" | "measure" | "verify">("idle");
  /** Each item's size along the axis, from the pass that showed them all. */
  let sizes: number[] = [];

  const elements = (): { group: HTMLElement; wrapper: HTMLElement } | null => {
    const group = access(options.groupRef) as HTMLElement | null | undefined;
    const wrapper = access(options.wrapperRef) as HTMLElement | null | undefined;
    if (group === null || group === undefined || wrapper === null || wrapper === undefined) {
      return null;
    }
    return { group, wrapper };
  };

  const choose = (room: number, menu: number): ReadonlySet<Key> =>
    overflowingKeys({
      keys: options.keys(),
      sizes,
      room,
      menu,
      priority: options.priority,
      keep: options.keep?.(),
      isAllOrNothing: options.isAllOrNothing?.() ?? false,
    });

  const measure = (): void => {
    setHidden(NONE);
    setPhase(options.isCollapsing() ? "measure" : "idle");
  };

  if (!isServer) {
    createEffect(
      () => [options.keys(), options.isCollapsing(), options.orientation(), options.keep?.()],
      () => untrack(measure),
    );

    // The parent, not the group: a group squeezed by its siblings does not
    // shrink by itself when the space around it does.
    resizeObserver(
      () => (access(options.wrapperRef) as HTMLElement | null | undefined)?.parentElement,
      () => measure(),
    );

    // After the render each phase asked for, so the DOM measured is the one
    // that phase described.
    createEffect(
      () => [phase(), hidden()] as const,
      ([current]) => {
        const found = untrack(elements);
        if (current === "idle" || found === null) return;
        const horizontal = untrack(options.orientation) === "horizontal";
        const rect = found.wrapper.getBoundingClientRect();
        const room = horizontal ? rect.width : rect.height;
        const children = [...found.group.children] as HTMLElement[];
        if (current === "measure") {
          sizes = children.map((child, index) =>
            outerSize(child, horizontal, index === 0, index === children.length - 1),
          );
          const next = untrack(() => choose(room, 0));
          setHidden(next);
          const partly = next.size > 0 && next.size < untrack(options.keys).length;
          setPhase(partly ? "verify" : "idle");
        } else {
          const own = access(options.menuRef) as HTMLElement | null | undefined;
          const menu = own ?? children.at(-1);
          const menuSize =
            menu === undefined || menu === null ? 0 : outerSize(menu, horizontal, false, true);
          setHidden(untrack(() => choose(room, menuSize)));
          setPhase("idle");
        }
      },
    );
  }

  return { hidden, isMeasuring: () => phase() !== "idle" };
}
