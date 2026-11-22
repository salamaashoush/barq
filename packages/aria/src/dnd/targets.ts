/** Drop targets in a collection: by sibling, by arrow key, and by point. */

import type { Accessor } from "@barqjs/core";
import type { Collection, Key, Node } from "../collections.ts";
import type { ElementRef } from "../interactions/press.ts";
import type { KeyboardDelegate } from "../selection.ts";
import { access, type MaybeAccessor } from "../utils.ts";
import { refElement } from "./data.ts";
import type { DropPosition, DropTarget, DropTargetDelegate, ItemDropTarget } from "./types.ts";

// ---------------------------------------------------------------------------
// Siblings, in a collection whose keys are linked in document order
// ---------------------------------------------------------------------------

/**
 * The next node with the same parent, or null.
 *
 * A collection links its keys in DOCUMENT order, through sections and
 * children, so the item after the last one of a section is the first of the
 * next. Drop positions are about siblings: "after the last item of a section"
 * is a different place from "before the first of the next".
 */
export function nextSiblingNode(
  collection: Collection<unknown>,
  node: Node<unknown>,
): Node<unknown> | null {
  let key = collection.getKeyAfter(node.key);
  while (key !== null) {
    const next = collection.getItem(key);
    if (next === null || next.level < node.level) return null;
    if (next.level === node.level && next.parentKey === node.parentKey) return next;
    key = collection.getKeyAfter(key);
  }
  return null;
}

/** The previous node with the same parent, or null. */
export function previousSiblingNode(
  collection: Collection<unknown>,
  node: Node<unknown>,
): Node<unknown> | null {
  let key = collection.getKeyBefore(node.key);
  while (key !== null) {
    const previous = collection.getItem(key);
    if (previous === null || previous.level < node.level) return null;
    if (previous.level === node.level && previous.parentKey === node.parentKey) return previous;
    key = collection.getKeyBefore(key);
  }
  return null;
}

function nextSiblingItem(
  collection: Collection<unknown>,
  node: Node<unknown>,
): Node<unknown> | null {
  let next = nextSiblingNode(collection, node);
  while (next !== null && next.type !== "item") next = nextSiblingNode(collection, next);
  return next;
}

/** The next or previous ITEM in document order, past sections and loaders. */
function nextItemKey(
  collection: Collection<unknown>,
  key: Key,
  step: (key: Key) => Key | null,
): Key | null {
  let at = step(key);
  let node = at === null ? null : collection.getItem(at);
  while (node !== null && node.type !== "item") {
    at = step(node.key);
    node = at === null ? null : collection.getItem(at);
  }
  return at;
}

/**
 * The "after" positions that need an indicator of their own below `node`.
 *
 * Usually none: "after this item" is the same place as "before the next", and
 * that one is drawn. The exception is the last item of a level, and in a tree
 * the last item of each level being left at once.
 */
export function afterDropIndicatorTargets(
  collection: Collection<unknown>,
  node: Node<unknown>,
): ItemDropTarget[] {
  const keyAfter = nextItemKey(collection, node.key, (key) => collection.getKeyAfter(key));
  const nextInFlattened = keyAfter === null ? null : collection.getItem(keyAfter);
  if (nextSiblingItem(collection, node) !== null) return [];

  const isLeftBehind = (current: Node<unknown>): boolean =>
    nextInFlattened === null ||
    (current.parentKey !== nextInFlattened.parentKey && nextInFlattened.level < current.level);

  const targets: ItemDropTarget[] = [];
  let current: Node<unknown> | null = node;
  while (current?.type === "item" && isLeftBehind(current)) {
    targets.push({ type: "item", key: current.key, dropPosition: "after" });
    current = current.parentKey === undefined ? null : collection.getItem(current.parentKey);
  }
  return targets;
}

// ---------------------------------------------------------------------------
// Drop target keyboard navigation
// ---------------------------------------------------------------------------

export type DropNavigationDirection = "left" | "right" | "up" | "down";

/**
 * The drop target the arrow key `direction` moves to from `target`.
 *
 * Every item offers three positions, before, on and after, but "after one" and
 * "before the next" are the same place, so only one of the two is visited.
 * `null` means there is nowhere further; `wrap` returns to the root instead.
 */
export function navigateDropTarget(
  keyboardDelegate: KeyboardDelegate,
  collection: Collection<unknown>,
  target: DropTarget | null | undefined,
  direction: DropNavigationDirection,
  rtl = false,
  wrap = false,
): DropTarget | null {
  if (direction === "left") {
    return rtl
      ? nextDropTarget(keyboardDelegate, collection, target, wrap, "left")
      : previousDropTarget(keyboardDelegate, collection, target, wrap, "left");
  }
  if (direction === "right") {
    return rtl
      ? previousDropTarget(keyboardDelegate, collection, target, wrap, "right")
      : nextDropTarget(keyboardDelegate, collection, target, wrap, "right");
  }
  return direction === "up"
    ? previousDropTarget(keyboardDelegate, collection, target, wrap)
    : nextDropTarget(keyboardDelegate, collection, target, wrap);
}

function nextDropTarget(
  keyboardDelegate: KeyboardDelegate,
  collection: Collection<unknown>,
  target: DropTarget | null | undefined,
  wrap: boolean,
  horizontal: "left" | "right" | null = null,
): DropTarget | null {
  if (target === null || target === undefined) return { type: "root" };

  if (target.type === "root") {
    const nextKey = keyboardDelegate.getFirstKey?.() ?? null;
    return nextKey === null ? null : { type: "item", key: nextKey, dropPosition: "before" };
  }

  let nextKey: Key | null | undefined;
  if (horizontal !== null) {
    nextKey =
      horizontal === "right"
        ? keyboardDelegate.getKeyRightOf?.(target.key)
        : keyboardDelegate.getKeyLeftOf?.(target.key);
  } else {
    nextKey = keyboardDelegate.getKeyBelow?.(target.key);
  }
  const nextCollectionKey = nextItemKey(collection, target.key, (key) =>
    collection.getKeyAfter(key),
  );

  // The delegate jumped somewhere other than the next item (a grid moving a
  // row): keep the position. Otherwise step through this item's positions.
  if (nextKey !== null && nextKey !== undefined && nextKey !== nextCollectionKey) {
    return { type: "item", key: nextKey, dropPosition: target.dropPosition };
  }

  switch (target.dropPosition) {
    case "before":
      return { type: "item", key: target.key, dropPosition: "on" };
    case "on": {
      // Into the children before past this item; and a next item on this
      // level's "before" is the same place as this one's "after".
      const targetNode = collection.getItem(target.key);
      const nextNode =
        nextKey === null || nextKey === undefined ? null : collection.getItem(nextKey);
      if (targetNode !== null && nextNode !== null && nextNode.level >= targetNode.level) {
        return { type: "item", key: nextNode.key, dropPosition: "before" };
      }
      return { type: "item", key: target.key, dropPosition: "after" };
    }
    case "after": {
      // The last child of a level goes on to its parent's position.
      const targetNode = collection.getItem(target.key);
      const nextInLevel = targetNode === null ? null : nextSiblingItem(collection, targetNode);

      if (targetNode !== null && nextInLevel === null && targetNode.parentKey !== undefined) {
        const parentNode = collection.getItem(targetNode.parentKey);
        const afterParent = parentNode === null ? null : nextSiblingNode(collection, parentNode);
        if (afterParent?.type === "item") {
          return { type: "item", key: afterParent.key, dropPosition: "before" };
        }
        if (parentNode?.type === "item") {
          return { type: "item", key: parentNode.key, dropPosition: "after" };
        }
      }

      if (nextInLevel !== null) {
        return { type: "item", key: nextInLevel.key, dropPosition: "on" };
      }
    }
  }

  return wrap ? { type: "root" } : null;
}

function previousDropTarget(
  keyboardDelegate: KeyboardDelegate,
  collection: Collection<unknown>,
  target: DropTarget | null | undefined,
  wrap: boolean,
  horizontal: "left" | "right" | null = null,
): DropTarget | null {
  // From the start: after the last item at the top level. The delegate's last
  // key is the deepest one, so it is walked up to its top-level ancestor.
  if (target === null || target === undefined || (wrap && target.type === "root")) {
    let previousKey: Key | null = null;
    let lastKey: Key | null | undefined = keyboardDelegate.getLastKey?.();
    while (lastKey !== null && lastKey !== undefined) {
      const node = collection.getItem(lastKey);
      if (node?.type !== "item") break;
      previousKey = lastKey;
      lastKey = node.parentKey;
    }
    return previousKey === null ? null : { type: "item", key: previousKey, dropPosition: "after" };
  }

  if (target.type === "item") {
    let previousKey: Key | null | undefined;
    if (horizontal !== null) {
      previousKey =
        horizontal === "left"
          ? keyboardDelegate.getKeyLeftOf?.(target.key)
          : keyboardDelegate.getKeyRightOf?.(target.key);
    } else {
      previousKey = keyboardDelegate.getKeyAbove?.(target.key);
    }
    const previousCollectionKey = nextItemKey(collection, target.key, (key) =>
      collection.getKeyBefore(key),
    );

    if (
      previousKey !== null &&
      previousKey !== undefined &&
      previousKey !== previousCollectionKey
    ) {
      return { type: "item", key: previousKey, dropPosition: target.dropPosition };
    }

    switch (target.dropPosition) {
      case "before": {
        // After the last child of the previous item, when it shows children.
        const targetNode = collection.getItem(target.key);
        const previousNode =
          targetNode === null ? null : previousSiblingNode(collection, targetNode);
        if (previousNode !== null) {
          const lastChild = lastChildTarget(collection, previousNode.key);
          if (lastChild !== null) return lastChild;
        }
        if (previousKey !== null && previousKey !== undefined) {
          return { type: "item", key: previousKey, dropPosition: "on" };
        }
        return { type: "root" };
      }
      case "on":
        return { type: "item", key: target.key, dropPosition: "before" };
      case "after":
        return (
          lastChildTarget(collection, target.key) ?? {
            type: "item",
            key: target.key,
            dropPosition: "on",
          }
        );
    }
  }

  return target.type !== "root" ? { type: "root" } : null;
}

function lastChildTarget(collection: Collection<unknown>, key: Key): ItemDropTarget | null {
  // A collapsed node still has its children, so whether they are shown is
  // read from whether the next row is deeper.
  const targetNode = collection.getItem(key);
  const nextKey = nextItemKey(collection, key, (at) => collection.getKeyAfter(at));
  const nextNode = nextKey === null ? null : collection.getItem(nextKey);
  if (targetNode === null || nextNode === null || nextNode.level <= targetNode.level) return null;
  const lastChild = targetNode.childNodes.findLast((child) => child.type === "item");
  return lastChild === undefined
    ? null
    : { type: "item", key: lastChild.key, dropPosition: "after" };
}

// ---------------------------------------------------------------------------
// Drop targets from a point
// ---------------------------------------------------------------------------

export interface ListDropTargetDelegateOptions {
  /** @default "stack" */
  layout?: MaybeAccessor<"stack" | "grid" | undefined>;
  /** The direction the collection scrolls. @default "vertical" */
  orientation?: MaybeAccessor<"horizontal" | "vertical" | undefined>;
  /** @default "ltr" */
  direction?: MaybeAccessor<"ltr" | "rtl" | undefined>;
}

/**
 * Which drop target a point in a list or grid of items is over.
 *
 * Over the middle of an item is "on" it; within five pixels of its leading or
 * trailing edge is "before" or "after", where those are accepted. Between
 * items, the nearer edge decides. The items are found by `data-key`.
 */
export class ListDropTargetDelegate implements DropTargetDelegate {
  #collection: MaybeAccessor<Iterable<Node<unknown>>>;
  #ref: ElementRef;
  #options: ListDropTargetDelegateOptions;

  constructor(
    collection: MaybeAccessor<Iterable<Node<unknown>>>,
    ref: ElementRef,
    options: ListDropTargetDelegateOptions = {},
  ) {
    this.#collection = collection;
    this.#ref = ref;
    this.#options = options;
  }

  get #layout(): "stack" | "grid" {
    return access(this.#options.layout) ?? "stack";
  }

  get #orientation(): "horizontal" | "vertical" {
    return access(this.#options.orientation) ?? "vertical";
  }

  get #direction(): "ltr" | "rtl" {
    return access(this.#options.direction) ?? "ltr";
  }

  #primaryStart(rect: DOMRect): number {
    return this.#orientation === "horizontal" ? rect.left : rect.top;
  }

  #primaryEnd(rect: DOMRect): number {
    return this.#orientation === "horizontal" ? rect.right : rect.bottom;
  }

  #secondaryStart(rect: DOMRect): number {
    return this.#orientation === "horizontal" ? rect.top : rect.left;
  }

  #secondaryEnd(rect: DOMRect): number {
    return this.#orientation === "horizontal" ? rect.bottom : rect.right;
  }

  #flowStart(rect: DOMRect): number {
    return this.#layout === "stack" ? this.#primaryStart(rect) : this.#secondaryStart(rect);
  }

  #flowEnd(rect: DOMRect): number {
    return this.#layout === "stack" ? this.#primaryEnd(rect) : this.#secondaryEnd(rect);
  }

  /**
   * Every item, in order, with a section's items in its place. A collection
   * that answers `getChildren` for a section answers with the rows it shows,
   * nested ones included, which is what a tree's section needs.
   */
  #items(): Node<unknown>[] {
    const collection = access(this.#collection);
    const sectionRows = (section: Node<unknown>): Iterable<Node<unknown>> =>
      typeof (collection as Partial<Collection<unknown>>).getChildren === "function"
        ? (collection as Collection<unknown>).getChildren(section.key)
        : section.childNodes;
    const items: Node<unknown>[] = [];
    for (const node of collection) {
      if (node.type === "item") items.push(node);
      else if (node.type === "section") {
        for (const child of sectionRows(node)) if (child.type === "item") items.push(child);
      }
    }
    return items;
  }

  getDropTargetFromPoint(
    x: number,
    y: number,
    isValidTarget: (target: DropTarget) => boolean,
  ): DropTarget {
    const container = refElement(this.#ref) as HTMLElement | null;
    const items = this.#items();
    if (container === null || items.length === 0) return { type: "root" };

    let rect: DOMRect | undefined = container.getBoundingClientRect();
    let primary = this.#orientation === "horizontal" ? x : y;
    let secondary = this.#orientation === "horizontal" ? y : x;
    primary += this.#primaryStart(rect);
    secondary += this.#secondaryStart(rect);

    const flow = this.#layout === "stack" ? primary : secondary;
    const isPrimaryRTL = this.#orientation === "horizontal" && this.#direction === "rtl";
    const isSecondaryRTL =
      this.#layout === "grid" && this.#orientation === "vertical" && this.#direction === "rtl";
    const isFlowRTL = this.#layout === "stack" ? isPrimaryRTL : isSecondaryRTL;

    // Scoped to this collection: the nearest collection around an item has to
    // be this one, so a nested one does not answer for it.
    const scope = container.getAttribute("data-collection");
    const elementMap = new Map<string, HTMLElement>();
    for (const element of container.querySelectorAll("[data-key]")) {
      if (!(element instanceof HTMLElement) || element.dataset.key === undefined) continue;
      if (scope !== null) {
        const owner = element.closest("[data-collection]");
        if (owner !== container && owner?.getAttribute("data-collection") !== scope) continue;
      }
      elementMap.set(element.dataset.key, element);
    }

    let low = 0;
    let high = items.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const item = items[mid] as Node<unknown>;
      const element = elementMap.get(String(item.key));
      if (element === undefined) break;
      const itemRect = element.getBoundingClientRect();
      // Which way the point lies past this item, or null when it is over it.
      let isGreater: boolean | null = null;
      if (primary < this.#primaryStart(itemRect)) isGreater = isPrimaryRTL;
      else if (primary > this.#primaryEnd(itemRect)) isGreater = !isPrimaryRTL;
      else if (secondary < this.#secondaryStart(itemRect)) isGreater = isSecondaryRTL;
      else if (secondary > this.#secondaryEnd(itemRect)) isGreater = !isSecondaryRTL;

      if (isGreater === true) {
        low = mid + 1;
      } else if (isGreater === false) {
        high = mid;
      } else {
        const target: ItemDropTarget = { type: "item", key: item.key, dropPosition: "on" };
        const before: DropPosition = isFlowRTL ? "after" : "before";
        const after: DropPosition = isFlowRTL ? "before" : "after";

        if (isValidTarget(target)) {
          // On is accepted, so before and after only claim the edges.
          if (
            flow <= this.#flowStart(itemRect) + 5 &&
            isValidTarget({ ...target, dropPosition: "before" })
          ) {
            target.dropPosition = before;
          } else if (
            flow >= this.#flowEnd(itemRect) - 5 &&
            isValidTarget({ ...target, dropPosition: "after" })
          ) {
            target.dropPosition = after;
          }
        } else {
          const middle =
            this.#flowStart(itemRect) + (this.#flowEnd(itemRect) - this.#flowStart(itemRect)) / 2;
          if (flow <= middle && isValidTarget({ ...target, dropPosition: "before" })) {
            target.dropPosition = before;
          } else if (flow >= middle && isValidTarget({ ...target, dropPosition: "after" })) {
            target.dropPosition = after;
          }
        }
        return target;
      }
    }

    const item = items[Math.min(low, items.length - 1)] as Node<unknown>;
    rect = elementMap.get(String(item.key))?.getBoundingClientRect();

    if (
      rect !== undefined &&
      (primary < this.#primaryStart(rect) ||
        Math.abs(flow - this.#flowStart(rect)) < Math.abs(flow - this.#flowEnd(rect)))
    ) {
      return { type: "item", key: item.key, dropPosition: isFlowRTL ? "after" : "before" };
    }
    return { type: "item", key: item.key, dropPosition: isFlowRTL ? "before" : "after" };
  }
}

// ---------------------------------------------------------------------------
// Drop targets from a point, in a tree
// ---------------------------------------------------------------------------

export interface TreeDropTargetState {
  collection: Accessor<Collection<unknown>>;
  expandedKeys: Accessor<Set<Key>>;
}

interface PointerTracking {
  lastY: number;
  lastX: number;
  yDirection: "up" | "down" | null;
  xDirection: "left" | "right" | null;
  boundaryContext: {
    parentKey: Key;
    lastSwitchY: number;
    lastSwitchX: number;
    preferredTargetIndex: number;
  } | null;
}

const X_SWITCH_THRESHOLD = 10;
const Y_SWITCH_THRESHOLD = 5;

/**
 * Which drop target a point in a tree is over, on top of a flat delegate.
 *
 * Below the last child of a branch, one point is several places: after the
 * child, after its parent, after the grandparent. The pointer's vertical
 * movement picks the innermost or outermost on arrival, and horizontal
 * movement walks between them, outwards to the left in a left-to-right
 * layout, as an indented outline suggests. "Before" a row is read as "after"
 * the row above it, and "after" an expanded parent as "before its first
 * child", so each place has one name.
 */
export class TreeDropTargetDelegate implements DropTargetDelegate {
  #delegate: DropTargetDelegate;
  #state: TreeDropTargetState;
  #direction: MaybeAccessor<"ltr" | "rtl" | undefined>;
  #tracking: PointerTracking = {
    lastY: 0,
    lastX: 0,
    yDirection: null,
    xDirection: null,
    boundaryContext: null,
  };

  constructor(
    delegate: DropTargetDelegate,
    state: TreeDropTargetState,
    direction: MaybeAccessor<"ltr" | "rtl" | undefined> = "ltr",
  ) {
    this.#delegate = delegate;
    this.#state = state;
    this.#direction = direction;
  }

  getDropTargetFromPoint(
    x: number,
    y: number,
    isValidTarget: (target: DropTarget) => boolean,
  ): DropTarget | null {
    const base = this.#delegate.getDropTargetFromPoint(x, y, isValidTarget);
    if (base === null || base.type === "root") return base;
    return this.#resolve({ ...base }, x, y, isValidTarget);
  }

  #resolve(
    start: ItemDropTarget,
    x: number,
    y: number,
    isValidTarget: (target: DropTarget) => boolean,
  ): DropTarget {
    const tracking = this.#tracking;
    const collection = this.#state.collection();
    let target = start;

    const deltaY = y - tracking.lastY;
    const deltaX = x - tracking.lastX;
    let yMovement = tracking.yDirection;
    let xMovement = tracking.xDirection;
    if (Math.abs(deltaY) > Y_SWITCH_THRESHOLD) {
      yMovement = deltaY > 0 ? "down" : "up";
      tracking.yDirection = yMovement;
      tracking.lastY = y;
    }
    if (Math.abs(deltaX) > X_SWITCH_THRESHOLD) {
      xMovement = deltaX > 0 ? "right" : "left";
      tracking.xDirection = xMovement;
      tracking.lastX = x;
    }

    if (target.dropPosition === "before") {
      let keyBefore = collection.getKeyBefore(target.key);
      while (keyBefore !== null) {
        const node = collection.getItem(keyBefore);
        if (node?.type === "item") break;
        keyBefore = node?.parentKey ?? null;
      }
      if (keyBefore !== null) {
        const after: ItemDropTarget = { type: "item", key: keyBefore, dropPosition: "after" };
        if (isValidTarget(after)) target = after;
      }
    }

    const candidates = this.#candidates(target, isValidTarget);
    if (candidates.length === 0) return { type: "root" };
    if (candidates.length === 1) {
      tracking.boundaryContext = null;
      return candidates[0] as ItemDropTarget;
    }
    return this.#select(candidates, target, x, y, yMovement, xMovement);
  }

  /** The places a target may mean, innermost first. */
  #candidates(
    original: ItemDropTarget,
    isValidTarget: (target: DropTarget) => boolean,
  ): ItemDropTarget[] {
    if (original.dropPosition === "on") return [original];

    const collection = this.#state.collection();
    const target: ItemDropTarget = { ...original };
    let current = collection.getItem(target.key);
    while (current !== null && current.type !== "item") {
      const next = nextSiblingNode(collection, current);
      if (next === null) break;
      target.key = next.key;
      current = next;
    }

    // After an expanded parent is before its first child.
    if (
      current !== null &&
      current.hasChildNodes &&
      this.#state.expandedKeys().has(current.key) &&
      target.dropPosition === "after"
    ) {
      const firstChild = current.childNodes.find((child) => child.type === "item");
      if (firstChild !== undefined) {
        const before: ItemDropTarget = {
          type: "item",
          key: firstChild.key,
          dropPosition: "before",
        };
        return isValidTarget(before) ? [before] : [];
      }
    }

    if (current !== null && nextSiblingNode(collection, current) !== null) return [target];

    // The last child of a level is also after each ancestor it closes.
    const ancestors: ItemDropTarget[] = [];
    let parentKey = current?.parentKey;
    while (parentKey !== undefined) {
      const parent = collection.getItem(parentKey);
      const afterParent = parent === null ? null : nextSiblingNode(collection, parent);
      // Only an item: a section's key is not one a caller can drop after.
      if (parent?.type === "item") {
        const after: ItemDropTarget = { type: "item", key: parentKey, dropPosition: "after" };
        if (isValidTarget(after)) ancestors.push(after);
      }
      if (afterParent !== null) break;
      parentKey = parent?.parentKey;
    }

    const candidates = [target, ...ancestors];

    if (candidates.length === 1) {
      const nextKey = collection.getKeyAfter(target.key);
      const nextNode = nextKey === null ? null : collection.getItem(nextKey);
      if (nextNode !== null && current !== null && nextNode.level > current.level) {
        const before: ItemDropTarget = {
          type: "item",
          key: nextNode.key,
          dropPosition: "before",
        };
        if (isValidTarget(before)) return [before];
      }
    }

    return candidates.filter(isValidTarget);
  }

  #select(
    candidates: ItemDropTarget[],
    original: ItemDropTarget,
    x: number,
    y: number,
    yMovement: "up" | "down" | null,
    xMovement: "left" | "right" | null,
  ): ItemDropTarget {
    const tracking = this.#tracking;
    const last = candidates.length - 1;
    const parentKey = this.#state.collection().getItem(original.key)?.parentKey;
    if (parentKey === undefined) return candidates[0] as ItemDropTarget;

    // Arriving from below starts at the outermost place, from above at the innermost.
    if (tracking.boundaryContext?.parentKey !== parentKey) {
      tracking.boundaryContext = {
        parentKey,
        preferredTargetIndex: tracking.yDirection === "up" ? last : 0,
        lastSwitchY: y,
        lastSwitchX: x,
      };
    }
    const context = tracking.boundaryContext;

    if (Math.abs(y - context.lastSwitchY) > Y_SWITCH_THRESHOLD && yMovement !== null) {
      if (yMovement === "down" && context.preferredTargetIndex === 0) {
        context.preferredTargetIndex = last;
      } else if (yMovement === "up" && context.preferredTargetIndex === last) {
        context.preferredTargetIndex = 0;
      }
      // Moving diagonally would otherwise switch on both axes and flicker.
      tracking.xDirection = null;
    }

    if (Math.abs(x - context.lastSwitchX) > X_SWITCH_THRESHOLD && xMovement !== null) {
      const index = context.preferredTargetIndex;
      const outwards = (access(this.#direction) ?? "ltr") === "ltr" ? "left" : "right";
      if (xMovement === outwards) {
        if (index < last) {
          context.preferredTargetIndex = index + 1;
          context.lastSwitchX = x;
        }
      } else if (index > 0) {
        context.preferredTargetIndex = index - 1;
        context.lastSwitchX = x;
      }
      tracking.yDirection = null;
    }

    const index = Math.max(0, Math.min(context.preferredTargetIndex, last));
    return candidates[index] as ItemDropTarget;
  }
}
