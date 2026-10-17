/**
 * A window splitter: panels in a row or a column, and the handles between them.
 *
 * The decisions, since the mechanism is arithmetic:
 *
 * - **Sizes are percentages of the group.** A layout in pixels has to be
 *   re-measured whenever the container changes and drifts as it is rounded; a
 *   layout in percentages survives a resize untouched. A limit may still be
 *   WRITTEN in `px`, `rem`, `em`, `vw` or `vh`, and is turned into a share of
 *   the group whenever the group is measured. Unmeasured, such a limit says
 *   nothing yet rather than something wrong.
 * - **A handle moves more than its two neighbours.** When the panel beside it
 *   reaches its limit, the move carries on into the panel after that one, which
 *   is what dragging a divider across a full row should do.
 * - **A drag is measured from where it began.** Each move is the whole distance
 *   since the press, applied to the layout as it was then. Adding up small
 *   steps instead loses whatever a clamped step threw away, so the handle
 *   wanders off the pointer.
 * - **Collapsing is a snap, not a size.** A collapsible panel is at its
 *   collapsed size or at least its minimum and never between: a drag jumps at
 *   the halfway point, and one key press at the minimum jumps the whole way.
 * - **A move is in screen terms.** Positive is toward the right or the bottom,
 *   so a right-to-left row turns it round here and no caller has to.
 * - **The order is the document's.** Panels and handles register as they are
 *   built, which is the order a server render and the first paint use; once
 *   the elements exist they are re-read in document order, so a panel that
 *   appears later lands between the right handles.
 */

import { type Accessor, createSignal, createEffect, isServer, untrack } from "@barqjs/core";
import { tryCleanup } from "@barqjs/primitives/utils";
import { ownerWindow } from "./dom.ts";
import { type ReadingDirection, useDirection } from "./i18n.ts";
import type { ElementRef } from "./interactions/press.ts";
import type { Orientation } from "./selection.ts";
import { access, type DOMProps, filterDOMProps, type MaybeAccessor, mergeProps } from "./utils.ts";

/** A percentage as a number, or a length as `"30%"`, `"240px"`, `"15rem"`, `"20vw"`. */
export type SplitterSize = number | string;

export type SizeUnit = "%" | "px" | "rem" | "em" | "vw" | "vh";

export interface ParsedSize {
  value: number;
  unit: SizeUnit;
}

/** What a length is measured against. */
export interface SizeContext {
  /** The group's own extent along its axis. */
  groupPixels: number;
  rootFontSize?: number;
  fontSize?: number;
  viewportWidth?: number;
  viewportHeight?: number;
}

/** One panel's limits, all as percentages of the group. */
export interface PanelConstraints {
  minSize: number;
  maxSize: number;
  collapsedSize: number;
  collapsible: boolean;
  defaultSize?: number;
}

export interface PanelSize {
  asPercentage: number;
  inPixels: number;
}

export type ResizeTrigger = "keyboard" | "pointer" | "imperative";

const SIZE = /^(-?\d*\.?\d+)(%|px|rem|em|vw|vh)?$/;
const EPSILON = 1e-6;

const same = (a: number, b: number): boolean => Math.abs(a - b) < EPSILON;
const tidy = (value: number): number => Number.parseFloat(value.toFixed(10));
const sameLayout = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((each, index) => same(each, b[index] ?? Number.NaN));

export function parseSize(value: SplitterSize | undefined): ParsedSize | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? { value, unit: "%" } : undefined;
  const match = SIZE.exec(value.trim());
  if (match === null) return undefined;
  return { value: Number.parseFloat(match[1] ?? "0"), unit: (match[2] as SizeUnit) ?? "%" };
}

export function toPercentage(
  value: SplitterSize | undefined,
  context: SizeContext,
): number | undefined {
  const parsed = parseSize(value);
  if (parsed === undefined) return undefined;
  if (parsed.unit === "%") return parsed.value;
  if (context.groupPixels <= 0) return undefined;

  let pixels: number;
  if (parsed.unit === "px") pixels = parsed.value;
  else if (parsed.unit === "rem") pixels = parsed.value * (context.rootFontSize ?? 16);
  else if (parsed.unit === "em") {
    pixels = parsed.value * (context.fontSize ?? context.rootFontSize ?? 16);
  } else if (parsed.unit === "vw") pixels = (parsed.value / 100) * (context.viewportWidth ?? 0);
  else pixels = (parsed.value / 100) * (context.viewportHeight ?? 0);

  return tidy((pixels / context.groupPixels) * 100);
}

export function clampPanelSize(constraints: PanelConstraints, size: number): number {
  let next = size;
  if (next < constraints.minSize && !same(next, constraints.minSize)) {
    if (constraints.collapsible) {
      const halfway = (constraints.collapsedSize + constraints.minSize) / 2;
      next = next < halfway ? constraints.collapsedSize : constraints.minSize;
    } else {
      next = constraints.minSize;
    }
  }
  return tidy(Math.min(constraints.maxSize, next));
}

/** The sizes panels asked for, with the ones that asked for none sharing the rest. */
export function defaultLayout(constraints: readonly PanelConstraints[]): number[] {
  const named = constraints.reduce((sum, each) => sum + (each.defaultSize ?? 0), 0);
  const unnamed = constraints.filter((each) => each.defaultSize === undefined).length;
  const share = unnamed === 0 ? 0 : Math.max(0, 100 - named) / unnamed;
  return constraints.map((each) => each.defaultSize ?? share);
}

/** A layout that adds up to a hundred with every panel inside its limits. */
export function validateLayout(
  layout: readonly number[],
  constraints: readonly PanelConstraints[],
): number[] {
  const next = [...layout];
  if (next.length === 0) return next;

  const total = next.reduce((sum, each) => sum + each, 0);
  if (total <= 0) next.fill(100 / next.length);
  else if (!same(total, 100)) {
    for (let index = 0; index < next.length; index++)
      next[index] = (100 / total) * (next[index] ?? 0);
  }

  let remaining = 0;
  for (let index = 0; index < next.length; index++) {
    const limits = constraints[index];
    const unsafe = next[index] ?? 0;
    if (limits === undefined) continue;
    const safe = clampPanelSize(limits, unsafe);
    if (!same(unsafe, safe)) {
      remaining += unsafe - safe;
      next[index] = safe;
    }
  }

  if (!same(remaining, 0)) {
    for (let index = 0; index < next.length; index++) {
      const limits = constraints[index];
      const previous = next[index] ?? 0;
      if (limits === undefined) continue;
      const safe = clampPanelSize(limits, previous + remaining);
      if (!same(previous, safe)) {
        remaining -= safe - previous;
        next[index] = safe;
        if (same(remaining, 0)) break;
      }
    }
  }

  return next.map(tidy);
}

export interface AdjustLayoutOptions {
  /** Positive grows the panel before the handle. */
  delta: number;
  /** The layout the delta is measured from. */
  initialLayout: readonly number[];
  /** The layout on screen, returned as it is when nothing can move. */
  prevLayout: readonly number[];
  constraints: readonly PanelConstraints[];
  /** The panels on either side of the handle. */
  pivot: readonly [number, number];
  trigger: ResizeTrigger;
}

/**
 * Move a handle by `delta`, as far as the limits on both sides allow.
 *
 * Returns `prevLayout` itself, the same array, when the move changes nothing,
 * so a caller can tell by identity.
 */
export function adjustLayoutByDelta(options: AdjustLayoutOptions): number[] {
  const { initialLayout, prevLayout, constraints, pivot, trigger } = options;
  const [first, second] = pivot;
  const previous = prevLayout as number[];
  let { delta } = options;

  if (same(delta, 0)) {
    return sameLayout(initialLayout, prevLayout) ? previous : [...initialLayout];
  }

  const limitsAt = (index: number): PanelConstraints =>
    constraints[index] ?? { minSize: 0, maxSize: 100, collapsedSize: 0, collapsible: false };
  const next = [...initialLayout];
  let applied = 0;

  if (trigger === "keyboard") {
    // A step is smaller than the gap between collapsed and minimum, and a
    // panel may not rest inside that gap, so the step becomes the whole gap.
    const opening = delta < 0 ? second : first;
    const openingLimits = limitsAt(opening);
    if (openingLimits.collapsible && same(next[opening] ?? 0, openingLimits.collapsedSize)) {
      const gap = openingLimits.minSize - openingLimits.collapsedSize;
      if (gap > Math.abs(delta)) delta = delta < 0 ? -gap : gap;
    }

    const closing = delta < 0 ? first : second;
    const closingLimits = limitsAt(closing);
    if (closingLimits.collapsible && same(next[closing] ?? 0, closingLimits.minSize)) {
      const gap = closingLimits.minSize - closingLimits.collapsedSize;
      if (gap > Math.abs(delta)) delta = delta < 0 ? -gap : gap;
    }
  }

  {
    // No further than the growing side can take.
    const step = delta < 0 ? 1 : -1;
    let index = delta < 0 ? second : first;
    let available = 0;
    while (index >= 0 && index < next.length) {
      available += clampPanelSize(limitsAt(index), 100) - (initialLayout[index] ?? 0);
      index += step;
    }
    const least = Math.min(Math.abs(delta), Math.abs(available));
    delta = delta < 0 ? -least : least;
  }

  {
    // Take it from the shrinking side, nearest the handle first.
    const step = delta < 0 ? -1 : 1;
    let index = delta < 0 ? first : second;
    while (index >= 0 && index < next.length) {
      const wanted = Math.abs(delta) - Math.abs(applied);
      const before = initialLayout[index] ?? 0;
      const safe = clampPanelSize(limitsAt(index), before - wanted);
      if (!same(before, safe)) {
        applied += before - safe;
        next[index] = safe;
        if (applied > Math.abs(delta) || same(applied, Math.abs(delta))) break;
      }
      index += step;
    }
  }

  if (sameLayout(prevLayout, next)) return previous;

  {
    const growing = delta < 0 ? second : first;
    const unsafe = (initialLayout[growing] ?? 0) + applied;
    const safe = clampPanelSize(limitsAt(growing), unsafe);
    next[growing] = safe;

    // The growing panel snapped: out of collapse to more than was given, or
    // back into it. The shrinking side makes up the difference.
    if (!same(safe, unsafe)) {
      let remaining = unsafe - safe;
      const step = delta < 0 ? -1 : 1;
      let index = delta < 0 ? first : second;
      while (index >= 0 && index < next.length) {
        const before = next[index] ?? 0;
        const settled = clampPanelSize(limitsAt(index), before + remaining);
        if (!same(before, settled)) {
          remaining -= settled - before;
          next[index] = settled;
        }
        if (same(remaining, 0)) break;
        index += step;
      }
    }
  }

  const total = next.reduce((sum, each) => sum + each, 0);
  if (!same(total, 100)) return previous;
  if (sameLayout(prevLayout, next)) return previous;
  return next.map(tidy);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface SplitterStorage {
  getItem(name: string): string | null;
  setItem(name: string, value: string): void;
}

export interface SplitterStateOptions {
  /** The group's element, which is what a pixel is a share of. */
  ref: ElementRef;
  /** @default "horizontal" */
  orientation?: MaybeAccessor<Orientation | undefined>;
  /** Overrides the direction in scope. */
  direction?: MaybeAccessor<ReadingDirection | undefined>;
  /** No handle moves; the imperative calls still do. */
  isDisabled?: MaybeAccessor<boolean | undefined>;
  /** How far an arrow key moves a handle, as a percentage. @default 10 */
  keyboardResizeBy?: MaybeAccessor<number | undefined>;
  /** Remember the layout under this name and start from it next time. */
  autoSaveId?: MaybeAccessor<string | undefined>;
  /** @default localStorage */
  storage?: MaybeAccessor<SplitterStorage | undefined>;
  /** Sizes by panel id, used when every panel present is named in it. */
  defaultLayout?: MaybeAccessor<Readonly<Record<string, number>> | undefined>;
  /** Every change a person or a call made, as it happens. */
  onLayoutChange?: (layout: Record<string, number>, sizes: number[]) => void;
  /** The same, once: after a key press or a call, and when a drag ends. */
  onLayoutChanged?: (layout: Record<string, number>, sizes: number[]) => void;
}

export interface SplitterPanelOptions {
  id: string;
  /**
   * Whether the id was made up rather than given. A made-up id differs from
   * one page load to the next, so a saved layout names such a panel by its
   * position instead.
   */
  isGeneratedId?: boolean;
  ref: ElementRef;
  defaultSize?: MaybeAccessor<SplitterSize | undefined>;
  /** @default 0 */
  minSize?: MaybeAccessor<SplitterSize | undefined>;
  /** @default 100 */
  maxSize?: MaybeAccessor<SplitterSize | undefined>;
  collapsible?: MaybeAccessor<boolean | undefined>;
  /** @default 0 */
  collapsedSize?: MaybeAccessor<SplitterSize | undefined>;
  onResize?: (size: PanelSize, id: string, previous: PanelSize | undefined) => void;
  onCollapse?: () => void;
  onExpand?: () => void;
}

export interface SplitterState {
  orientation: Accessor<Orientation>;
  direction: Accessor<ReadingDirection>;
  isDisabled: Accessor<boolean>;
  /** How far one arrow key moves a handle, as a percentage. */
  keyboardStep: Accessor<number>;
  /** In layout order. */
  panelIds: Accessor<readonly string[]>;
  /** Every panel's percentage, in layout order. */
  layout: Accessor<number[]>;
  sizeOf(id: string): number;
  constraintsOf(id: string): PanelConstraints;
  isCollapsed(id: string): boolean;
  getSize(id: string): PanelSize;
  collapse(id: string): void;
  /** Back to the size it was collapsed from, and at least `minSize`. */
  expand(id: string, minSize?: SplitterSize): void;
  resize(id: string, size: SplitterSize): void;
  getLayout(): Record<string, number>;
  setLayout(layout: Readonly<Record<string, number>> | readonly number[]): void;
  registerPanel(options: SplitterPanelOptions): () => void;
  registerHandle(id: string, element: Accessor<Element | null>): () => void;
  /** The panels before and after a handle. */
  panelsAround(handleId: string): readonly [string, string] | null;
  /** One step from a handle, in screen terms: positive is right or down. */
  resizeBy(handleId: string, delta: number, trigger: ResizeTrigger): void;
  /** Collapse the panel a handle controls, or bring it back. */
  toggleCollapse(handleId: string): void;
  startDrag(handleId: string): void;
  /** The whole distance since {@link startDrag}, as a percentage, in screen terms. */
  dragBy(handleId: string, delta: number): void;
  endDrag(handleId: string): void;
  draggingHandle: Accessor<string | null>;
  /** The handle elements in layout order, for moving focus among them. */
  handleElements(): HTMLElement[];
  /** What a length is measured against, right now. */
  sizeContext(): SizeContext;
}

interface PanelEntry {
  kind: "panel";
  id: string;
  options: SplitterPanelOptions;
}

interface HandleEntry {
  kind: "handle";
  id: string;
  element: Accessor<Element | null>;
}

type Entry = PanelEntry | HandleEntry;

interface Saved {
  layout: number[];
  expandTo: Record<string, number>;
}

const STORAGE_PREFIX = "barq.splitter:";

/**
 * A value kept beside the signal that announces it.
 *
 * A write to a signal is staged until the next flush, and this state is read
 * straight after it is written: a panel registers and the layout is worked out
 * in the same breath, a drag starts and moves in one event. The signal carries
 * the dependency and the variable carries the answer.
 */
function kept<T>(initial: T): [Accessor<T>, (next: T) => void] {
  let value = initial;
  // `ownedWrite`: panels and handles register from their own component
  // bodies, and the layout is worked out as each one arrives.
  const [version, bump] = createSignal(0, { equals: false, ownedWrite: true });
  return [
    () => {
      version();
      return value;
    },
    (next) => {
      if (Object.is(next, value)) return;
      value = next;
      bump(0);
    },
  ];
}

function inDocumentOrder(a: Element, b: Element): number {
  const position = a.compareDocumentPosition(b);
  if ((position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) return -1;
  if ((position & Node.DOCUMENT_POSITION_PRECEDING) !== 0) return 1;
  return 0;
}

export function splitterState(options: SplitterStateOptions): SplitterState {
  const scoped = useDirection();
  const orientation = (): Orientation => access(options.orientation) ?? "horizontal";
  const direction = (): ReadingDirection => access(options.direction) ?? scoped();
  const isDisabled = (): boolean => access(options.isDisabled) === true;

  const entries = new Map<string, Entry>();
  const [order, setOrder] = kept<readonly string[]>([]);
  const [sizes, setSizes] = kept<Readonly<Record<string, number>>>({});
  const [groupPixels, setGroupPixels] = kept(0);
  const [dragging, setDragging] = kept<string | null>(null);

  /** The size each collapsed panel came from, which is where it goes back to. */
  const expandTo = new Map<string, number>();
  let dragStart: number[] | null = null;
  let dragMoved = false;

  const keyOf = (entry: Entry): string => `${entry.kind}:${entry.id}`;
  const elementOf = (entry: Entry): Element | null =>
    entry.kind === "panel" ? (access(entry.options.ref) ?? null) : entry.element();

  const ordered = (): Entry[] => {
    const out: Entry[] = [];
    for (const key of order()) {
      const entry = entries.get(key);
      if (entry !== undefined) out.push(entry);
    }
    return out;
  };

  const panels = (): PanelEntry[] =>
    ordered().filter((each): each is PanelEntry => each.kind === "panel");
  const panelIds = (): readonly string[] => panels().map((each) => each.id);

  const extentOf = (element: Element, along: Orientation): number => {
    const box = element.getBoundingClientRect();
    return along === "horizontal" ? box.width : box.height;
  };
  const measure = (): number => {
    const element = access(options.ref);
    if (element === null || element === undefined) return 0;
    return extentOf(element, orientation());
  };

  const sizeContext = (): SizeContext => {
    const element = access(options.ref) ?? null;
    const context: SizeContext = { groupPixels: groupPixels() || measure() };
    if (isServer || element === null) return context;
    const view = ownerWindow(element);
    const fontOf = (target: Element): number | undefined => {
      const parsed = Number.parseFloat(view.getComputedStyle(target).fontSize);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    };
    return {
      ...context,
      rootFontSize: fontOf(element.ownerDocument.documentElement),
      fontSize: fontOf(element),
      viewportWidth: view.innerWidth,
      viewportHeight: view.innerHeight,
    };
  };

  const usesLengths = (): boolean =>
    panels().some((each) =>
      [
        each.options.defaultSize,
        each.options.minSize,
        each.options.maxSize,
        each.options.collapsedSize,
      ]
        .map((value) => parseSize(access(value)))
        .some((parsed) => parsed !== undefined && parsed.unit !== "%"),
    );

  const resolve = (panel: SplitterPanelOptions, context: SizeContext): PanelConstraints => {
    const maxSize = Math.min(100, toPercentage(access(panel.maxSize), context) ?? 100);
    const minSize = Math.min(
      maxSize,
      Math.max(0, toPercentage(access(panel.minSize), context) ?? 0),
    );
    const collapsedSize = Math.min(
      minSize,
      Math.max(0, toPercentage(access(panel.collapsedSize), context) ?? 0),
    );
    return {
      minSize,
      maxSize,
      collapsedSize,
      collapsible: access(panel.collapsible) === true,
      defaultSize: toPercentage(access(panel.defaultSize), context),
    };
  };

  const constraintsNow = (): PanelConstraints[] => {
    const context = usesLengths() ? sizeContext() : { groupPixels: 0 };
    return panels().map((each) => resolve(each.options, context));
  };

  const layout = (): number[] => {
    const held = sizes();
    return panelIds().map((id) => held[id] ?? 0);
  };

  const record = (ids: readonly string[], values: readonly number[]): Record<string, number> =>
    Object.fromEntries(ids.map((id, index) => [id, values[index] ?? 0]));

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  const storage = (): SplitterStorage | null => {
    const given = access(options.storage);
    if (given !== undefined) return given;
    try {
      return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
      return null;
    }
  };

  const savedName = (panel: PanelEntry, index: number): string =>
    panel.options.isGeneratedId === true ? `#${String(index)}` : panel.id;

  /** Which panels a saved layout is for: a different set is a different layout. */
  const panelKey = (list: readonly PanelEntry[]): string => list.map(savedName).join(",");

  const readSaved = (): Record<string, Saved> => {
    const name = access(options.autoSaveId);
    const store = storage();
    if (name === undefined || store === null) return {};
    try {
      const parsed: unknown = JSON.parse(store.getItem(STORAGE_PREFIX + name) ?? "{}");
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, Saved>) : {};
    } catch {
      return {};
    }
  };

  const loadSaved = (list: readonly PanelEntry[]): number[] | null => {
    if (access(options.autoSaveId) === undefined) return null;
    const saved = readSaved()[panelKey(list)];
    if (saved === undefined || !Array.isArray(saved.layout)) return null;
    if (saved.layout.length !== list.length) return null;
    if (!saved.layout.every((each) => typeof each === "number" && Number.isFinite(each)))
      return null;
    if (typeof saved.expandTo === "object" && saved.expandTo !== null) {
      list.forEach((each, index) => {
        const size = saved.expandTo[savedName(each, index)];
        if (typeof size === "number") expandTo.set(each.id, size);
      });
    }
    return saved.layout;
  };

  const save = (): void => {
    const name = access(options.autoSaveId);
    const store = storage();
    if (name === undefined || store === null) return;
    const list = untrack(panels);
    const all = readSaved();
    all[panelKey(list)] = {
      layout: untrack(layout),
      expandTo: Object.fromEntries(
        list.flatMap((each, index) => {
          const size = expandTo.get(each.id);
          return size === undefined ? [] : [[savedName(each, index), size]];
        }),
      ),
    };
    try {
      store.setItem(STORAGE_PREFIX + name, JSON.stringify(all));
    } catch {
      // A full or forbidden store loses the layout, not the page.
    }
  };

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  /** Work the layout out again, keeping it when the same panels are present. */
  const settle = (): void => {
    const list = untrack(panels);
    const ids = list.map((each) => each.id);
    const limits = untrack(constraintsNow);
    const held = untrack(sizes);

    let unsafe: number[] | null = null;
    const known = Object.keys(held);
    if (known.length === ids.length && ids.every((id) => held[id] !== undefined)) {
      unsafe = ids.map((id) => held[id] ?? 0);
    }
    if (unsafe === null) unsafe = loadSaved(list);
    if (unsafe === null) {
      const declared = access(options.defaultLayout);
      if (
        declared !== undefined &&
        ids.length > 0 &&
        ids.every((id) => declared[id] !== undefined)
      ) {
        unsafe = ids.map((id) => declared[id] ?? 0);
      }
    }
    unsafe ??= defaultLayout(limits);

    setSizes(record(ids, validateLayout(unsafe, limits)));
  };

  const pixelsOf = (percentage: number): number =>
    (untrack(sizeContext).groupPixels * percentage) / 100;
  const sized = (percentage: number): PanelSize => ({
    asPercentage: percentage,
    inPixels: pixelsOf(percentage),
  });

  /** Put a layout a person or a call asked for on screen, and tell everyone. */
  const commit = (next: readonly number[], settled: boolean): boolean => {
    const list = untrack(panels);
    const ids = list.map((each) => each.id);
    const before = untrack(layout);
    if (next === before || sameLayout(before, next)) return false;
    const limits = untrack(constraintsNow);

    setSizes(record(ids, next));

    list.forEach((each, index) => {
      const was = before[index] ?? 0;
      const now = next[index] ?? 0;
      if (same(was, now)) return;
      const bounds = limits[index];
      each.options.onResize?.(sized(now), each.id, sized(was));
      if (bounds === undefined || !bounds.collapsible) return;
      const wasCollapsed = same(was, bounds.collapsedSize);
      const isCollapsed = same(now, bounds.collapsedSize);
      if (isCollapsed && !wasCollapsed) {
        // Where a drag, a key or a call took it from is where it goes back to.
        expandTo.set(each.id, was);
        each.options.onCollapse?.();
      } else if (!isCollapsed && wasCollapsed) {
        each.options.onExpand?.();
      }
    });

    const named = record(ids, next);
    options.onLayoutChange?.(named, [...next]);
    if (settled) {
      options.onLayoutChanged?.(named, [...next]);
      save();
    }
    return true;
  };

  const indexOf = (id: string): number => untrack(panelIds).indexOf(id);

  /** The handle a panel is resized through: the one after it, or before the last. */
  const pivotOf = (index: number, count: number): readonly [number, number] =>
    index === count - 1 ? [index - 1, index] : [index, index + 1];

  const moveTo = (id: string, target: number): void => {
    const index = indexOf(id);
    const before = untrack(layout);
    if (index < 0 || before.length < 2) return;
    const size = before[index] ?? 0;
    const isLast = index === before.length - 1;
    const next = adjustLayoutByDelta({
      delta: isLast ? size - target : target - size,
      initialLayout: before,
      prevLayout: before,
      constraints: untrack(constraintsNow),
      pivot: pivotOf(index, before.length),
      trigger: "imperative",
    });
    commit(next, true);
  };

  const constraintsOf = (id: string): PanelConstraints => {
    const entry = entries.get(`panel:${id}`);
    if (entry === undefined || entry.kind !== "panel") {
      return { minSize: 0, maxSize: 100, collapsedSize: 0, collapsible: false };
    }
    return resolve(entry.options, usesLengths() ? sizeContext() : { groupPixels: 0 });
  };

  const sizeOf = (id: string): number => sizes()[id] ?? 0;
  const isCollapsed = (id: string): boolean => {
    const limits = constraintsOf(id);
    return limits.collapsible && same(sizeOf(id), limits.collapsedSize);
  };

  const panelsAround = (handleId: string): readonly [string, string] | null => {
    const list = ordered();
    const at = list.findIndex((each) => each.kind === "handle" && each.id === handleId);
    if (at < 0) return null;
    let before: string | null = null;
    let after: string | null = null;
    for (let index = at - 1; index >= 0 && before === null; index--) {
      const entry = list[index];
      if (entry?.kind === "panel") before = entry.id;
    }
    for (let index = at + 1; index < list.length && after === null; index++) {
      const entry = list[index];
      if (entry?.kind === "panel") after = entry.id;
    }
    return before === null || after === null ? null : [before, after];
  };

  const pivotAround = (handleId: string): readonly [number, number] | null => {
    const around = untrack(() => panelsAround(handleId));
    if (around === null) return null;
    const ids = untrack(panelIds);
    return [ids.indexOf(around[0]), ids.indexOf(around[1])];
  };

  /** Screen terms to layout terms: a right-to-left row runs the other way. */
  const logical = (delta: number): number =>
    untrack(orientation) === "horizontal" && untrack(direction) === "rtl" ? -delta : delta;

  const add = (entry: Entry): (() => void) => {
    const key = keyOf(entry);
    entries.set(key, entry);
    const before = untrack(order);
    if (!before.includes(key)) setOrder([...before, key]);
    if (entry.kind === "panel") settle();
    return () => {
      if (entries.get(key) !== entry) return;
      entries.delete(key);
      setOrder(untrack(order).filter((each) => each !== key));
      if (entry.kind === "panel") {
        expandTo.delete(entry.id);
        settle();
      }
    };
  };

  const collapse = (id: string): void => {
    const limits = untrack(() => constraintsOf(id));
    if (!limits.collapsible || untrack(() => isCollapsed(id))) return;
    moveTo(id, limits.collapsedSize);
  };

  const expand = (id: string, minSize?: SplitterSize): void => {
    const limits = untrack(() => constraintsOf(id));
    if (!limits.collapsible || !untrack(() => isCollapsed(id))) return;
    const least = Math.max(
      limits.minSize,
      toPercentage(minSize, untrack(sizeContext)) ?? limits.minSize,
    );
    const remembered = expandTo.get(id);
    moveTo(id, remembered !== undefined && remembered >= least ? remembered : least);
  };

  if (!isServer) {
    createEffect(
      () => {
        const keys = order();
        const elements = keys.map((key) => {
          const entry = entries.get(key);
          return entry === undefined ? null : elementOf(entry);
        });
        return { keys, elements };
      },
      ({ keys, elements }) => {
        const placed: { key: string; element: Element }[] = [];
        for (const [index, key] of keys.entries()) {
          const element = elements[index] ?? null;
          // Not all built yet, or not in one tree yet: the registration order
          // stands until they are, and each ref landing runs this again.
          if (element === null || !element.isConnected) return;
          placed.push({ key, element });
        }
        const sorted = placed
          .toSorted((a, b) => inDocumentOrder(a.element, b.element))
          .map((each) => each.key);
        if (sorted.some((key, index) => key !== keys[index])) setOrder(sorted);
      },
    );

    createEffect(
      // Orientation read so a turn from row to column measures the other axis.
      () => [access(options.ref), orientation()] as const,
      ([element, along]) => {
        if (element === null || element === undefined) return undefined;
        const update = (): void => {
          const next = extentOf(element, along);
          if (next === untrack(groupPixels)) return;
          setGroupPixels(next);
          // Only a limit written as a length changes its share when the group does.
          if (untrack(usesLengths)) settle();
        };
        update();
        if (typeof ResizeObserver === "undefined") return undefined;
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => observer.disconnect();
      },
    );
  }

  return {
    orientation,
    direction,
    isDisabled,
    keyboardStep: () => access(options.keyboardResizeBy) ?? 10,
    panelIds,
    layout,
    sizeOf,
    constraintsOf,
    isCollapsed,
    getSize: (id) => sized(untrack(() => sizeOf(id))),
    collapse,
    expand,
    resize(id, size) {
      const target = toPercentage(size, untrack(sizeContext));
      if (target !== undefined) moveTo(id, target);
    },
    getLayout: () => record(untrack(panelIds), untrack(layout)),
    setLayout(next) {
      const ids = untrack(panelIds);
      const values = Array.isArray(next)
        ? (next as readonly number[])
        : ids.map((id) => (next as Readonly<Record<string, number>>)[id] ?? 0);
      if (values.length !== ids.length) return;
      commit(validateLayout(values, untrack(constraintsNow)), true);
    },
    registerPanel: (panel) => add({ kind: "panel", id: panel.id, options: panel }),
    registerHandle: (id, element) => add({ kind: "handle", id, element }),
    panelsAround,
    resizeBy(handleId, delta, trigger) {
      if (untrack(isDisabled)) return;
      const pivot = pivotAround(handleId);
      if (pivot === null) return;
      const before = untrack(layout);
      commit(
        adjustLayoutByDelta({
          delta: logical(delta),
          initialLayout: before,
          prevLayout: before,
          constraints: untrack(constraintsNow),
          pivot,
          trigger,
        }),
        true,
      );
    },
    toggleCollapse(handleId) {
      if (untrack(isDisabled)) return;
      const around = untrack(() => panelsAround(handleId));
      if (around === null) return;
      // The panel before the handle is the one it controls; one after it that
      // collapses is the next best thing a key can do.
      const id = around.find((each) => untrack(() => constraintsOf(each)).collapsible);
      if (id === undefined) return;
      if (untrack(() => isCollapsed(id))) expand(id);
      else collapse(id);
    },
    startDrag(handleId) {
      if (untrack(isDisabled) || pivotAround(handleId) === null) return;
      dragStart = untrack(layout);
      dragMoved = false;
      setDragging(handleId);
    },
    dragBy(handleId, delta) {
      if (dragStart === null || untrack(dragging) !== handleId) return;
      const pivot = pivotAround(handleId);
      if (pivot === null) return;
      const moved = commit(
        adjustLayoutByDelta({
          delta: logical(delta),
          initialLayout: dragStart,
          prevLayout: untrack(layout),
          constraints: untrack(constraintsNow),
          pivot,
          trigger: "pointer",
        }),
        false,
      );
      dragMoved ||= moved;
    },
    endDrag(handleId) {
      if (untrack(dragging) !== handleId) return;
      const start = dragStart;
      dragStart = null;
      setDragging(null);
      const now = untrack(layout);
      if (!dragMoved || start === null || sameLayout(start, now)) return;
      options.onLayoutChanged?.(record(untrack(panelIds), now), [...now]);
      save();
    },
    draggingHandle: dragging,
    handleElements() {
      const out: HTMLElement[] = [];
      for (const entry of untrack(ordered)) {
        if (entry.kind !== "handle") continue;
        const element = entry.element();
        if (element instanceof HTMLElement) out.push(element);
      }
      return out;
    },
    sizeContext,
  };
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

/** What a caller holding a panel can do to it. */
export interface SplitterPanelHandle {
  collapse(): void;
  expand(minSize?: SplitterSize): void;
  getId(): string;
  getSize(): PanelSize;
  isCollapsed(): boolean;
  isExpanded(): boolean;
  resize(size: SplitterSize): void;
}

export interface SplitterPanelResult {
  panelProps: DOMProps;
  /** A percentage of the group. */
  size: Accessor<number>;
  isCollapsed: Accessor<boolean>;
  handle: SplitterPanelHandle;
}

/**
 * One panel: registered with the group for as long as its owner lives.
 *
 * ```tsx
 * const domRef = ref<HTMLDivElement>();
 * const { panelProps, size } = splitterPanel({ id: "nav", ref: domRef, minSize: 15 }, state);
 * <div {...panelProps} ref={domRef.set} style={{ flex: `0 0 ${size()}%` }} />
 * ```
 */
export function splitterPanel(
  options: SplitterPanelOptions,
  state: SplitterState,
): SplitterPanelResult {
  const { id } = options;
  // While the component is built rather than in an effect: a server render
  // runs no effects, and its markup has to carry the sizes too.
  tryCleanup(state.registerPanel(options));

  const size = (): number => state.sizeOf(id);
  const isCollapsed = (): boolean => state.isCollapsed(id);

  return {
    size,
    isCollapsed,
    panelProps: {
      id,
      "data-panel": "",
      "data-panel-id": id,
      "data-panel-size": () => String(Number.parseFloat(size().toFixed(1))),
      "data-panel-collapsible": () => (access(options.collapsible) === true ? "true" : undefined),
      "data-collapsed": () => (isCollapsed() ? "" : undefined),
    },
    handle: {
      collapse: () => state.collapse(id),
      expand: (minSize) => state.expand(id, minSize),
      getId: () => id,
      getSize: () => state.getSize(id),
      isCollapsed: () => untrack(isCollapsed),
      isExpanded: () => !untrack(isCollapsed),
      resize: (next) => state.resize(id, next),
    },
  };
}

// ---------------------------------------------------------------------------
// Handle
// ---------------------------------------------------------------------------

export interface SplitterHandleOptions {
  id: string;
  ref: ElementRef;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  onDragging?: (isDragging: boolean) => void;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
  "aria-describedby"?: MaybeAccessor<string | undefined>;
}

export interface SplitterHandleResult {
  separatorProps: DOMProps;
  isDragging: Accessor<boolean>;
  isHovered: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
}

/**
 * The divider between two panels, as the window splitter pattern describes it.
 *
 * A focusable `separator` whose value is the size of the panel before it. The
 * arrows along the group's axis move it a step, Home and End send it to that
 * panel's limits, Enter collapses the panel and brings it back, and F6 goes to
 * the next handle in the group. The arrows of the other axis are left to the
 * page.
 */
export function splitterHandle(
  options: SplitterHandleOptions,
  state: SplitterState,
): SplitterHandleResult {
  const { id } = options;
  tryCleanup(state.registerHandle(id, () => access(options.ref) ?? null));

  const [isHovered, setHovered] = createSignal(false);
  const isDisabled = (): boolean => state.isDisabled() || access(options.isDisabled) === true;
  const isDragging = (): boolean => state.draggingHandle() === id;
  const primary = (): string | undefined => state.panelsAround(id)?.[0];

  const percentOf = (pixels: number): number => {
    const whole = untrack(() => state.sizeContext().groupPixels);
    return whole <= 0 ? 0 : (pixels / whole) * 100;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || untrack(isDisabled)) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const horizontal = untrack(state.orientation) === "horizontal";
    const step = untrack(state.keyboardStep);

    let delta: number | null = null;
    if (event.key === (horizontal ? "ArrowLeft" : "ArrowUp")) delta = -step;
    else if (event.key === (horizontal ? "ArrowRight" : "ArrowDown")) delta = step;

    if (delta !== null) {
      event.preventDefault();
      state.resizeBy(id, delta, "keyboard");
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      // To the limit of the panel before the handle, whichever side of the
      // screen that is: the logical end, not the visual one.
      const flipped = horizontal && untrack(state.direction) === "rtl";
      state.resizeBy(id, (event.key === "Home") === flipped ? 100 : -100, "keyboard");
    } else if (event.key === "Enter") {
      event.preventDefault();
      state.toggleCollapse(id);
    } else if (event.key === "F6") {
      event.preventDefault();
      const handles = state.handleElements();
      const at = handles.indexOf(event.currentTarget as HTMLElement);
      if (at < 0 || handles.length < 2) return;
      const to = (at + (event.shiftKey ? handles.length - 1 : 1)) % handles.length;
      handles[to]?.focus();
    }
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (untrack(isDisabled) || (event.pointerType === "mouse" && event.button !== 0)) return;
    const element = event.currentTarget as HTMLElement;
    const horizontal = untrack(state.orientation) === "horizontal";
    const origin = horizontal ? event.clientX : event.clientY;

    state.startDrag(id);
    if (untrack(state.draggingHandle) !== id) return;
    // The page must not start a text selection or a scroll under the drag.
    event.preventDefault();
    element.focus({ preventScroll: true });
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // A pointer that is already gone has nothing to capture.
    }
    options.onDragging?.(true);

    const onMove = (next: PointerEvent): void => {
      const now = horizontal ? next.clientX : next.clientY;
      state.dragBy(id, percentOf(now - origin));
    };
    const onEnd = (): void => {
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerup", onEnd);
      element.removeEventListener("pointercancel", onEnd);
      element.removeEventListener("lostpointercapture", onEnd);
      state.endDrag(id);
      options.onDragging?.(false);
    };
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerup", onEnd);
    element.addEventListener("pointercancel", onEnd);
    element.addEventListener("lostpointercapture", onEnd);
  };

  const value = (pick: (limits: PanelConstraints, size: number) => number): number | undefined => {
    const panel = primary();
    if (panel === undefined) return undefined;
    return Math.round(pick(state.constraintsOf(panel), state.sizeOf(panel)));
  };

  return {
    isDragging,
    isHovered,
    isDisabled,
    separatorProps: mergeProps(filterDOMProps(options, { labelable: true }), {
      role: "separator",
      tabIndex: () => (isDisabled() ? undefined : 0),
      // Perpendicular to the group: a row of panels is divided by vertical lines.
      "aria-orientation": () => (state.orientation() === "horizontal" ? "vertical" : "horizontal"),
      "aria-controls": primary,
      "aria-valuenow": () => value((_, size) => size),
      "aria-valuemin": () =>
        value((limits) => (limits.collapsible ? limits.collapsedSize : limits.minSize)),
      "aria-valuemax": () => value((limits) => limits.maxSize),
      "aria-disabled": () => isDisabled() || undefined,
      "data-separator": () =>
        isDisabled() ? "disabled" : isDragging() ? "active" : isHovered() ? "hover" : "inactive",
      "data-disabled": () => (isDisabled() ? "" : undefined),
      onKeyDown,
      onPointerDown,
      onPointerEnter: () => setHovered(true),
      onPointerLeave: () => setHovered(false),
    }),
  };
}
