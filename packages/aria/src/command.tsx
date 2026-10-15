/**
 * A command palette: a text input over a list it filters, ranks and drives.
 *
 * ```tsx
 * <Command label="Commands">
 *   <CommandInput placeholder="Type a command" />
 *   <CommandList>
 *     <CommandEmpty>No results found.</CommandEmpty>
 *     <CommandGroup heading="Settings">
 *       <CommandItem onSelect={openProfile}>Profile</CommandItem>
 *       <CommandItem keywords={["invoice"]} onSelect={openBilling}>Billing</CommandItem>
 *     </CommandGroup>
 *   </CommandList>
 * </Command>
 * ```
 *
 * The behaviour is `cmdk`'s, which is what shadcn's `Command` wraps. The items
 * are the ones that RENDER (see `static-collection.ts`); this adds a score per
 * item and everything that follows from one.
 *
 * The decisions:
 *
 * - **Focus never leaves the input.** The highlighted item is named by
 *   `aria-activedescendant`, so typing and arrowing are the same gesture, and
 *   a press on an item does not take the keyboard away from the search.
 * - **An item that does not match stays mounted, with `hidden`.** Its value
 *   defaults to its own text, and unmounting it would lose the thing the next
 *   keystroke has to score. `hidden` takes it out of the accessibility tree
 *   and out of the keyboard's path.
 * - **The ranked order is drawn with `order`, not by moving nodes.** `cmdk`
 *   re-appends elements, which a renderer that tracks its own nodes cannot be
 *   handed back. The document keeps the order the items were written in, the
 *   keyboard follows the order that is drawn, and `aria-posinset` states that
 *   order to a screen reader while a search is in effect.
 * - **Clearing the search restores the written order**, where `cmdk` leaves
 *   the last ranking in place.
 * - **A highlight is an item, not a string.** Two items with one value are
 *   still two rows, and only the one the arrows reached is highlighted.
 */

import {
  type Accessor,
  type Child,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  getContext,
  type Incoming,
  onCleanup,
  onSettled,
  provide,
  Show,
  untrack,
} from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";

import type { Key } from "./collections.ts";
import { scrollIntoView } from "./dom.ts";
import type { ElementRef } from "./interactions/press.ts";
import { visuallyHidden } from "./live.ts";
import {
  provideStaticSection,
  staticCollection,
  staticItem,
  type StaticCollection,
  type StaticEntry,
} from "./static-collection.ts";
import {
  access,
  callback,
  type DOMProps,
  filterDOMProps,
  fromProps,
  id,
  type MaybeAccessor,
  mergeProps,
  type StyleProps,
  styleProps,
} from "./utils.ts";

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const SCORE_CONTINUE_MATCH = 1;
const SCORE_SPACE_WORD_JUMP = 0.9;
const SCORE_NON_SPACE_WORD_JUMP = 0.8;
const SCORE_CHARACTER_JUMP = 0.17;
const SCORE_TRANSPOSITION = 0.1;
const PENALTY_SKIPPED = 0.999;
const PENALTY_CASE_MISMATCH = 0.9999;
const PENALTY_NOT_COMPLETE = 0.99;

const IS_GAP = /[\\/_+.#"@[({&]/;
const COUNT_GAPS = /[\\/_+.#"@[({&]/g;
const IS_SPACE = /[\s-]/;
const COUNT_SPACE = /[\s-]/g;
const COMBINING_MARKS = /[̀-ͯ]/g;

function scoreFrom(
  value: string,
  search: string,
  lowerValue: string,
  lowerSearch: string,
  valueIndex: number,
  searchIndex: number,
  memo: Map<number, number>,
): number {
  if (searchIndex === search.length) {
    return valueIndex === value.length ? SCORE_CONTINUE_MATCH : PENALTY_NOT_COMPLETE;
  }

  const memoKey = valueIndex * (search.length + 1) + searchIndex;
  const known = memo.get(memoKey);
  if (known !== undefined) return known;

  const wanted = lowerSearch.charAt(searchIndex);
  let index = lowerValue.indexOf(wanted, valueIndex);
  let best = 0;

  while (index >= 0) {
    let score = scoreFrom(value, search, lowerValue, lowerSearch, index + 1, searchIndex + 1, memo);

    if (score > best) {
      if (index === valueIndex) {
        score *= SCORE_CONTINUE_MATCH;
      } else if (IS_GAP.test(value.charAt(index - 1))) {
        score *= SCORE_NON_SPACE_WORD_JUMP;
        const skipped = value.slice(valueIndex, index - 1).match(COUNT_GAPS);
        if (skipped !== null && valueIndex > 0) score *= PENALTY_SKIPPED ** skipped.length;
      } else if (IS_SPACE.test(value.charAt(index - 1))) {
        score *= SCORE_SPACE_WORD_JUMP;
        const skipped = value.slice(valueIndex, index - 1).match(COUNT_SPACE);
        if (skipped !== null && valueIndex > 0) score *= PENALTY_SKIPPED ** skipped.length;
      } else {
        score *= SCORE_CHARACTER_JUMP;
        if (valueIndex > 0) score *= PENALTY_SKIPPED ** (index - valueIndex);
      }

      if (value.charAt(index) !== search.charAt(searchIndex)) score *= PENALTY_CASE_MISMATCH;
    }

    const next = lowerSearch.charAt(searchIndex + 1);
    const swapped = score < SCORE_TRANSPOSITION && lowerValue.charAt(index - 1) === next;
    // A doubled letter in the search is not a swap of itself.
    const doubled = next === wanted && lowerValue.charAt(index - 1) !== wanted;
    if (swapped || doubled) {
      const transposed = scoreFrom(
        value,
        search,
        lowerValue,
        lowerSearch,
        index + 1,
        searchIndex + 2,
        memo,
      );
      if (transposed * SCORE_TRANSPOSITION > score) score = transposed * SCORE_TRANSPOSITION;
    }

    if (score > best) best = score;
    index = lowerValue.indexOf(wanted, index + 1);
  }

  memo.set(memoKey, best);
  return best;
}

/** Every kind of space and the hyphen are one separator, so they match each other. */
function comparable(text: string): string {
  return text.toLowerCase().replace(COUNT_SPACE, " ");
}

/** Without its accents, so a plain letter finds an accented one. */
function unaccented(text: string): string {
  return text.normalize("NFD").replace(COMBINING_MARKS, "");
}

/**
 * How well `search` abbreviates `value`: 0 for not at all, 1 for exactly.
 *
 * `cmdk`'s `command-score`. The letters of the search must appear in the value
 * in order; what varies is how they were reached. Letters in a row are worth
 * the most, then a jump to the start of a word after a space, then one after
 * punctuation, then a jump into the middle of a word, which costs more the
 * further it skips. A differing case and an unfinished value each cost a
 * sliver, and two adjacent letters may be swapped at a tenth of the score.
 *
 * `keywords` are searched as if they were part of the value.
 *
 * The one addition is that accents are ignored on both sides.
 */
export function commandScore(
  value: string,
  search: string,
  keywords: readonly string[] = [],
): number {
  const text = unaccented(keywords.length > 0 ? `${value} ${keywords.join(" ")}` : value);
  const term = unaccented(search);
  return scoreFrom(text, term, comparable(text), comparable(term), 0, 0, new Map());
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** How well an item matches: 0 hides it, and a higher number is drawn earlier. */
export type CommandFilter = (value: string, search: string, keywords: string[]) => number;

export interface CommandStateOptions {
  /** The highlighted item's value. */
  value?: MaybeAccessor<string | undefined>;
  defaultValue?: MaybeAccessor<string | undefined>;
  onValueChange?: (value: string) => void;
  /** @default {@link commandScore} */
  filter?: MaybeAccessor<CommandFilter | undefined>;
  /** Hide and rank by the search. Turn off to filter the items yourself. @default true */
  shouldFilter?: MaybeAccessor<boolean | undefined>;
  /** Wrap from the last item to the first and back. @default false */
  loop?: MaybeAccessor<boolean | undefined>;
  /** Leave the highlight to the keyboard. @default false */
  disablePointerSelection?: MaybeAccessor<boolean | undefined>;
  /** Ctrl+J/N for down and Ctrl+K/P for up. @default true */
  vimBindings?: MaybeAccessor<boolean | undefined>;
}

/** One rendered item, as the ranking sees it. */
export interface CommandRow {
  key: Key;
  value: string;
  keywords: string[];
  isDisabled: boolean;
  /** The group it was written in, if any. */
  group: Key | undefined;
  score: number;
  /** Drawn: it matches, or nothing is being filtered, or it insists. */
  isRendered: boolean;
  onSelect: ((value: string) => void) | undefined;
}

interface Ranking {
  rows: Map<Key, CommandRow>;
  /** Whether each group is drawn. */
  groups: Map<Key, boolean>;
  /** Where each item and group sits among its siblings, while filtering. */
  order: Map<Key, number>;
  /** The drawn items, in the order they are drawn. */
  visible: Key[];
  /** The drawn groups, in the order they are drawn. */
  visibleGroups: Key[];
  /** How many items match. */
  count: number;
  isFiltering: boolean;
}

export interface CommandState {
  /** Where the items and groups register themselves. */
  rows: StaticCollection;
  search: Accessor<string>;
  setSearch: (search: string) => void;
  /**
   * Let something else own the search text: the input, when it is controlled.
   * `null` hands it back.
   */
  controlSearch: (search: Accessor<string | undefined> | null) => void;
  /** The highlighted item's value, or `""` when nothing is highlighted. */
  value: Accessor<string>;
  setValue: (value: string) => void;
  highlightedKey: Accessor<Key | null>;
  highlight: (key: Key | null) => void;
  /** How many items match the search. */
  count: Accessor<number>;
  /**
   * Nothing matches, and the items have had their chance to register.
   *
   * Not `count() === 0`: an empty state written above the items is built
   * before any of them exists, and on a server it would stay in the markup of
   * a palette that is full.
   */
  isEmpty: Accessor<boolean>;
  isFiltering: Accessor<boolean>;
  /** The drawn items, in the order they are drawn. */
  visible: Accessor<Key[]>;
  row: (key: Key) => CommandRow | null;
  isRendered: (key: Key) => boolean;
  isGroupRendered: (key: Key) => boolean;
  /** The `order` an item or a group is drawn at, while a search is in effect. */
  orderOf: (key: Key) => number | undefined;
  /**
   * One item along, skipping the disabled, wrapping if `loop`.
   *
   * Each move answers with the item it asked for, or `null` when there was
   * nowhere to go: the highlight itself is not readable until the write has
   * been flushed, and a caller scrolling to it cannot wait for that.
   */
  move: (by: 1 | -1) => Key | null;
  /** To the first item of the next or previous group that has one. */
  moveToGroup: (by: 1 | -1) => Key | null;
  moveToEdge: (edge: "first" | "last") => Key | null;
  /** Run an item's `onSelect`. The highlighted one when no key is given. */
  run: (key?: Key) => void;
  disablePointerSelection: Accessor<boolean>;
  vimBindings: Accessor<boolean>;
}

interface RowData {
  keywords?: string[];
  isDisabled?: boolean;
  forceMount?: boolean;
  onSelect?: (value: string) => void;
}

export function commandState(options: CommandStateOptions = {}): CommandState {
  const rows = staticCollection();

  const [typed, setTyped] = createSignal("", { ownedWrite: true });
  const [control, setControl] = createSignal<Accessor<string | undefined> | null>(null, {
    ownedWrite: true,
  });
  const search = createMemo((): string => control()?.() ?? typed());

  const ranking = createMemo((): Ranking => {
    const term = search();
    const isFiltering = access(options.shouldFilter) !== false && term !== "";
    const score = callback(options.filter) ?? commandScore;

    const rowOf = (entry: StaticEntry, group: Key | undefined): CommandRow => {
      const data = entry.props as RowData;
      const value = entry.textValue.trim();
      const keywords = data.keywords ?? [];
      const matched = isFiltering ? score(value, term, keywords) : 1;
      return {
        key: entry.key,
        value,
        keywords,
        isDisabled: data.isDisabled === true,
        group,
        score: matched,
        isRendered: !isFiltering || matched > 0 || data.forceMount === true,
        onSelect: data.onSelect,
      };
    };

    const byScore = (a: CommandRow, b: CommandRow): number => b.score - a.score;
    const all = new Map<Key, CommandRow>();
    const groups = new Map<Key, boolean>();
    const order = new Map<Key, number>();
    const visible: Key[] = [];
    const visibleGroups: Key[] = [];
    const loose: CommandRow[] = [];
    const sections: { key: Key; rows: CommandRow[]; best: number; isRendered: boolean }[] = [];

    for (const entry of rows.entries()) {
      if (entry.type === "item") {
        const row = rowOf(entry, undefined);
        all.set(row.key, row);
        loose.push(row);
        if (!isFiltering) visible.push(row.key);
        continue;
      }

      const members = (entry.children ?? []).map((child) => rowOf(child, entry.key));
      for (const row of members) all.set(row.key, row);
      const best = members.reduce((highest, row) => Math.max(highest, row.score), 0);
      const isRendered =
        !isFiltering ||
        (entry.props as RowData).forceMount === true ||
        members.some((row) => row.score > 0);
      groups.set(entry.key, isRendered);
      sections.push({ key: entry.key, rows: members, best, isRendered });
      if (!isFiltering) {
        visibleGroups.push(entry.key);
        for (const row of members) visible.push(row.key);
      }
    }

    if (isFiltering) {
      // The loose items first and the groups after them, each best match first:
      // the order `cmdk` leaves the document in after re-appending both.
      const ranked = loose.toSorted(byScore);
      for (const [index, row] of ranked.entries()) {
        order.set(row.key, index + 1);
        if (row.isRendered) visible.push(row.key);
      }
      const rankedSections = sections.toSorted((a, b) => b.best - a.best);
      for (const [index, section] of rankedSections.entries()) {
        order.set(section.key, ranked.length + index + 1);
        if (section.isRendered) visibleGroups.push(section.key);
        for (const [position, row] of section.rows.toSorted(byScore).entries()) {
          order.set(row.key, position + 1);
          if (section.isRendered && row.isRendered) visible.push(row.key);
        }
      }
    }

    let count = 0;
    for (const row of all.values()) if (!isFiltering || row.score > 0) count++;

    return { rows: all, groups, order, visible, visibleGroups, count, isFiltering };
  });

  // Uncontrolled, the highlight is the item the arrows reached; a value is the
  // way in from outside, for a `defaultValue` and for `setValue`.
  const [picked, setPicked] = createSignal<{ key: Key | null; value: string | undefined }>(
    { key: null, value: untrack(() => access(options.defaultValue)) },
    { ownedWrite: true },
  );

  const keyFor = (value: string, ranked: Ranking): Key | null =>
    ranked.visible.find((key) => ranked.rows.get(key)?.value === value) ?? null;

  const highlightedKey = createMemo((): Key | null => {
    const ranked = ranking();
    const controlled = access(options.value);
    if (controlled !== undefined) return keyFor(controlled, ranked);
    const current = picked();
    if (current.key !== null) return ranked.visible.includes(current.key) ? current.key : null;
    return current.value === undefined ? null : keyFor(current.value, ranked);
  });

  const valueOf = (key: Key | null): string =>
    key === null ? "" : (ranking().rows.get(key)?.value ?? "");
  const value = (): string => valueOf(highlightedKey());

  const highlight = (key: Key | null): void => {
    const previous = untrack(value);
    const next = untrack(() => valueOf(key));
    setPicked({ key, value: undefined });
    if (next !== previous) options.onValueChange?.(next);
  };

  const selectable = (): Key[] => {
    const ranked = ranking();
    return ranked.visible.filter((key) => ranked.rows.get(key)?.isDisabled !== true);
  };

  // The first item is highlighted whenever there is nothing better to keep: on
  // arrival, after every change to the search, and when the highlighted item
  // goes away. An effect, because it WRITES the highlight it reads.
  let searched = untrack(search);
  createEffect(
    () => ({ term: search(), key: highlightedKey(), first: selectable()[0] ?? null }),
    (now) => {
      const changed = now.term !== searched;
      searched = now.term;
      if (!changed && now.key !== null) return;
      if (now.first === now.key) return;
      highlight(now.first);
    },
  );

  const go = (key: Key | undefined): Key | null => {
    if (key === undefined) return null;
    highlight(key);
    return key;
  };

  const [isSettled, setSettled] = createSignal(false, { ownedWrite: true });
  onSettled(() => {
    setSettled(true);
  });

  const move = (by: 1 | -1): Key | null => {
    const keys = untrack(selectable);
    if (keys.length === 0) return null;
    const current = untrack(highlightedKey);
    const index = current === null ? -1 : keys.indexOf(current);
    let next = index + by;
    if (access(options.loop) === true) {
      next = next < 0 ? keys.length - 1 : next >= keys.length ? 0 : next;
    }
    return go(keys[next]);
  };

  const moveToGroup = (by: 1 | -1): Key | null => {
    const ranked = untrack(ranking);
    const keys = untrack(selectable);
    const current = untrack(highlightedKey);
    const group = current === null ? undefined : ranked.rows.get(current)?.group;
    let at = group === undefined ? -1 : ranked.visibleGroups.indexOf(group);
    // An item outside every group has no group to step from, so the jump is an
    // ordinary step.
    if (at < 0) return move(by);

    for (at += by; at >= 0 && at < ranked.visibleGroups.length; at += by) {
      const first = keys.find((key) => ranked.rows.get(key)?.group === ranked.visibleGroups[at]);
      if (first !== undefined) return go(first);
    }
    return move(by);
  };

  const moveToEdge = (edge: "first" | "last"): Key | null => {
    const keys = untrack(selectable);
    return go(edge === "first" ? keys[0] : keys.at(-1));
  };

  const run = (key?: Key): void => {
    const target = key ?? untrack(highlightedKey);
    if (target === null) return;
    const row = untrack(ranking).rows.get(target);
    if (row === undefined || row.isDisabled) return;
    row.onSelect?.(row.value);
  };

  return {
    rows,
    search,
    setSearch: setTyped,
    controlSearch: (owner) => {
      setControl(() => owner);
    },
    value,
    setValue: (next) => {
      const previous = untrack(value);
      setPicked({ key: null, value: next });
      if (next !== previous) options.onValueChange?.(next);
    },
    highlightedKey,
    highlight,
    count: () => ranking().count,
    isEmpty: () => isSettled() && ranking().count === 0,
    isFiltering: () => ranking().isFiltering,
    visible: () => ranking().visible,
    row: (key) => ranking().rows.get(key) ?? null,
    // A row the ranking has not seen yet is one that has only just rendered.
    isRendered: (key) => ranking().rows.get(key)?.isRendered ?? true,
    isGroupRendered: (key) => ranking().groups.get(key) ?? true,
    orderOf: (key) => ranking().order.get(key),
    move,
    moveToGroup,
    moveToEdge,
    run,
    disablePointerSelection: () => access(options.disablePointerSelection) === true,
    vimBindings: () => access(options.vimBindings) !== false,
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface CommandOptions {
  /** Names the input and the list. */
  label?: MaybeAccessor<string | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  /** The scroller, which is the list. */
  listRef: ElementRef;
}

export interface CommandResult {
  commandProps: DOMProps;
  /** For a visually hidden `<label>`, rendered only when there is a label. */
  labelProps: DOMProps;
  /** Options for {@link commandInput}, not props for an element. */
  inputProps: DOMProps;
  listProps: DOMProps;
  label: Accessor<string | undefined>;
  /** The id an item with this key renders under. */
  itemId: (key: Key) => string;
}

function isComposing(event: KeyboardEvent): boolean {
  // 229 is what a keydown carries while an input method is composing in the
  // browsers that do not set `isComposing` on it.
  return event.isComposing || event.keyCode === 229;
}

export function command(options: CommandOptions, state: CommandState): CommandResult {
  const inputId = id();
  const listId = id();
  const labelId = id();
  const baseId = id();
  const label = (): string | undefined => access(options.label) ?? access(options["aria-label"]);
  const itemId = (key: Key): string => `${baseId()}-item-${String(key)}`;
  const activeId = (): string | undefined => {
    const key = state.highlightedKey();
    return key === null ? undefined : itemId(key);
  };

  /** Scroll to an item, and to its group's heading when it is the group's first. */
  const reveal = (key: Key | null): void => {
    const list = access(options.listRef) as HTMLElement | null;
    if (list === null || key === null) return;
    const element = state.rows.elementOf(key) as HTMLElement | null;
    if (element === null) return;

    const group = state.row(key)?.group;
    const firstOfGroup = state.visible().find((other) => state.row(other)?.group === group);
    if (group !== undefined && firstOfGroup === key) {
      const heading = state.rows.elementOf(group)?.querySelector("[cmdk-group-heading]");
      if (heading instanceof HTMLElement) scrollIntoView(list, heading);
    }
    scrollIntoView(list, element);
  };

  const step = (event: KeyboardEvent, by: 1 | -1): void => {
    event.preventDefault();
    if (event.metaKey) reveal(state.moveToEdge(by === 1 ? "last" : "first"));
    else if (event.altKey) reveal(state.moveToGroup(by));
    else reveal(state.move(by));
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || isComposing(event)) return;

    switch (event.key) {
      case "n":
      case "j":
        if (state.vimBindings() && event.ctrlKey) step(event, 1);
        break;
      case "ArrowDown":
        step(event, 1);
        break;
      case "p":
      case "k":
        if (state.vimBindings() && event.ctrlKey) step(event, -1);
        break;
      case "ArrowUp":
        step(event, -1);
        break;
      case "Home":
        event.preventDefault();
        reveal(state.moveToEdge("first"));
        break;
      case "End":
        event.preventDefault();
        reveal(state.moveToEdge("last"));
        break;
      case "Enter":
        event.preventDefault();
        state.run();
        break;
      default:
        break;
    }
  };

  // A new search starts again from the top, where its best match is.
  createEffect(state.search, (now, previous) => {
    if (previous === undefined || previous === now) return;
    const list = untrack(() => access(options.listRef)) as HTMLElement | null;
    if (list !== null) list.scrollTop = 0;
  });

  return {
    label,
    itemId,
    commandProps: { "cmdk-root": "", tabIndex: -1, onKeyDown },
    labelProps: {
      "cmdk-label": "",
      id: labelId,
      for: inputId,
      ...visuallyHidden().visuallyHiddenProps,
    },
    inputProps: {
      id: inputId,
      "aria-controls": listId,
      "aria-labelledby": () => (access(options.label) === undefined ? undefined : labelId()),
      "aria-label": () =>
        access(options.label) === undefined ? access(options["aria-label"]) : undefined,
      "aria-activedescendant": activeId,
    },
    listProps: {
      "cmdk-list": "",
      id: listId,
      role: "listbox",
      tabIndex: -1,
      "aria-label": () => label() ?? "Suggestions",
      "aria-activedescendant": activeId,
    },
  };
}

export interface CommandInputOptions {
  /** The search text, when the caller owns it. */
  value?: MaybeAccessor<string | undefined>;
  onValueChange?: (search: string) => void;
}

/** The search box: a combobox whose popup is the list, which is always open. */
export function commandInput(
  options: CommandInputOptions,
  state: CommandState,
  shared: DOMProps,
): { inputProps: DOMProps } {
  const isControlled = (): boolean => access(options.value) !== undefined;
  state.controlSearch(() => access(options.value));
  onCleanup(() => state.controlSearch(null));

  const onInput = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    if (!isControlled()) state.setSearch(input.value);
    options.onValueChange?.(input.value);
    // The field has already changed itself. When the caller owns the text and
    // declined, nothing re-renders on a value that did not move, so the DOM
    // has to be put back by hand.
    if (isControlled() && input.value !== state.search()) input.value = state.search();
  };

  return {
    inputProps: mergeProps(shared, {
      "cmdk-input": "",
      type: "text",
      role: "combobox",
      autocomplete: "off",
      autocorrect: "off",
      spellcheck: false,
      "aria-autocomplete": "list",
      "aria-expanded": true,
      value: state.search,
      onInput,
    }),
  };
}

export interface CommandItemOptions {
  /** What the item is searched and reported by. @default its own text */
  value?: MaybeAccessor<string | undefined>;
  /** More words to find it by, which are not shown. */
  keywords?: MaybeAccessor<string[] | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  /** Draw it whether or not it matches. @default its group's */
  forceMount?: MaybeAccessor<boolean | undefined>;
  onSelect?: (value: string) => void;
}

export interface CommandItemResult {
  itemProps: DOMProps;
  key: Key;
  /** Goes on the item's element. */
  ref: (element: Element | null) => void;
  isHighlighted: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
  isRendered: Accessor<boolean>;
}

interface CommandGroupValue {
  forceMount: Accessor<boolean>;
}

const CommandGroupContext = createContext<CommandGroupValue | null>(null);

export function commandItem(
  options: CommandItemOptions,
  state: CommandState,
  itemId: (key: Key) => string,
): CommandItemResult {
  const group = getContext(CommandGroupContext) ?? null;
  const isDisabled = (): boolean => access(options.isDisabled) === true;

  const row = staticItem(state.rows, {
    textValue: () => access(options.value),
    props: () => ({
      keywords: access(options.keywords),
      isDisabled: isDisabled(),
      forceMount: access(options.forceMount) ?? group?.forceMount() ?? false,
      onSelect: options.onSelect,
    }),
  });

  const isHighlighted = (): boolean => state.highlightedKey() === row.key;
  const isRendered = (): boolean => state.isRendered(row.key);
  const position = (): number => state.visible().indexOf(row.key);

  return {
    key: row.key,
    ref: row.ref,
    isHighlighted,
    isDisabled,
    isRendered,
    itemProps: {
      "cmdk-item": "",
      id: () => itemId(row.key),
      role: "option",
      "aria-selected": isHighlighted,
      "aria-disabled": () => isDisabled() || undefined,
      // The document keeps the written order, so the drawn one is stated.
      "aria-posinset": () => (state.isFiltering() && position() >= 0 ? position() + 1 : undefined),
      "aria-setsize": () =>
        state.isFiltering() && position() >= 0 ? state.visible().length : undefined,
      "data-value": () => state.row(row.key)?.value,
      "data-selected": () => (isHighlighted() ? "true" : undefined),
      "data-disabled": () => (isDisabled() ? "true" : undefined),
      hidden: () => !isRendered() || undefined,
      style: () => {
        const order = state.orderOf(row.key);
        return order === undefined ? undefined : { order };
      },
      // A press must not take the focus out of the input.
      onMouseDown: (event: MouseEvent) => event.preventDefault(),
      onPointerMove: () => {
        if (isDisabled() || state.disablePointerSelection() || isHighlighted()) return;
        state.highlight(row.key);
      },
      onClick: () => {
        if (isDisabled()) return;
        state.highlight(row.key);
        state.run(row.key);
      },
    },
  };
}

export interface CommandGroupOptions {
  heading?: MaybeAccessor<unknown>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  /** Draw the group and everything in it whatever the search says. */
  forceMount?: MaybeAccessor<boolean | undefined>;
}

export interface CommandGroupResult {
  /** The wrapper: presentational, and `hidden` when nothing in it matches. */
  groupProps: DOMProps;
  headingProps: DOMProps;
  /** The `role="group"` element holding the items. */
  itemsProps: DOMProps;
  key: Key;
  ref: (element: Element | null) => void;
  /** Build the group's children inside it. */
  provide: (children: () => unknown) => unknown;
}

const COLUMN = { display: "flex", flexDirection: "column" } as const;

export function commandGroup(
  options: CommandGroupOptions,
  state: CommandState,
): CommandGroupResult {
  const headingId = id();
  const forceMount = (): boolean => access(options.forceMount) === true;
  const hasHeading = (): boolean => {
    const heading = access(options.heading);
    return heading !== undefined && heading !== null && heading !== "";
  };

  const section = staticItem(state.rows, {
    type: "section",
    textValue: "",
    props: () => ({ forceMount: forceMount() }),
  });
  const value: CommandGroupValue = { forceMount };

  return {
    key: section.key,
    ref: section.ref,
    provide: (children) =>
      provideStaticSection(section.key, () => provide(CommandGroupContext, () => value, children)),
    groupProps: {
      "cmdk-group": "",
      role: "presentation",
      hidden: () => !state.isGroupRendered(section.key) || undefined,
      style: () => {
        const order = state.orderOf(section.key);
        return order === undefined ? undefined : { order };
      },
    },
    headingProps: {
      "cmdk-group-heading": "",
      id: headingId,
      // The heading names the group; it is not one of its children.
      "aria-hidden": true,
    },
    itemsProps: {
      "cmdk-group-items": "",
      role: "group",
      "aria-label": () => access(options["aria-label"]),
      "aria-labelledby": () => (hasHeading() ? headingId() : undefined),
      // `order` is how a ranking is drawn, and it only means something to a
      // flex or grid child.
      style: COLUMN,
    },
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export interface CommandContextValue {
  state: CommandState;
  inputProps: DOMProps;
  listProps: DOMProps;
  listRef: ReturnType<typeof makeRef<HTMLDivElement>>;
  itemId: (key: Key) => string;
}

const CommandContext = createContext<CommandContextValue | null>(null);

/** The enclosing {@link Command}, or `null` outside one. */
export function useCommandContext(): CommandContextValue | null {
  return getContext(CommandContext) ?? null;
}

export function useCommand(): CommandContextValue {
  const value = useCommandContext();
  if (value === null) throw new Error("This must be rendered inside a Command.");
  return value;
}

function CommandProvider(props: Incoming<{ value: CommandContextValue; children?: Child }>) {
  return provide(
    CommandContext,
    () => props.value(),
    () => props.children as unknown,
  );
}

export interface CommandComponentProps extends StyleProps {
  children?: Child;
  /** Names the input and the list. Rendered, and visually hidden. */
  label?: string;
  "aria-label"?: string;
  /** The highlighted item's value. */
  value?: string;
  defaultValue?: string;
  filter?: CommandFilter;
  /** @default true */
  shouldFilter?: boolean;
  /** @default false */
  loop?: boolean;
  /** @default false */
  disablePointerSelection?: boolean;
  /** @default true */
  vimBindings?: boolean;
  ref?: RefTarget<HTMLDivElement>;
  onValueChange?: (value: string) => void;
}

export function Command(props: Incoming<CommandComponentProps>) {
  const listRef = makeRef<HTMLDivElement>();
  const options = fromProps(props);
  const state = commandState(options);
  const { commandProps, labelProps, inputProps, listProps, label, itemId } = command(
    { label: options.label, "aria-label": options["aria-label"], listRef },
    state,
  );

  const value: CommandContextValue = { state, inputProps, listProps, listRef, itemId };
  const elementProps = mergeProps(
    commandProps,
    filterDOMProps(options, { global: true }),
    styleProps(props),
    { "data-testid": () => props["data-testid"]?.() },
  );

  return (
    <div {...elementProps} ref={mergeRefs(props.ref?.())}>
      <Show when={props.label?.() !== undefined}>
        <label {...labelProps}>{label()}</label>
      </Show>
      <CommandProvider value={value}>{props.children}</CommandProvider>
    </div>
  );
}

export interface CommandInputComponentProps extends StyleProps {
  /** The search text, when the caller owns it. */
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  "aria-label"?: string;
  ref?: RefTarget<HTMLInputElement>;
  onValueChange?: (search: string) => void;
}

export function CommandInput(props: Incoming<CommandInputComponentProps>) {
  const held = useCommand();
  const options = fromProps(props);
  const { inputProps } = commandInput(options, held.state, held.inputProps);

  const elementProps = mergeProps(
    inputProps,
    filterDOMProps(options, { global: true, propNames: INPUT_PROPS }),
    styleProps(props),
    {
      "aria-label": () =>
        props["aria-label"]?.() ??
        access(held.inputProps["aria-label"] as MaybeAccessor<string | undefined>),
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return <input {...elementProps} ref={mergeRefs(props.ref?.())} />;
}

const INPUT_PROPS = new Set(["placeholder", "disabled", "autoFocus", "onKeyDown", "onKeyUp"]);

export interface CommandListComponentProps extends StyleProps {
  children?: Child;
  "aria-label"?: string;
  ref?: RefTarget<HTMLDivElement>;
}

export function CommandList(props: Incoming<CommandListComponentProps>) {
  const held = useCommand();
  const elementProps = mergeProps(
    held.listProps,
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      "aria-label": () =>
        props["aria-label"]?.() ??
        access(held.listProps["aria-label"] as MaybeAccessor<string | undefined>),
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <div {...elementProps} ref={mergeRefs(held.listRef.set, props.ref?.())}>
      {/* Presentational, or it would stand between the listbox and its options. */}
      <div cmdk-list-sizer="" role="presentation" style={COLUMN}>
        {props.children}
      </div>
    </div>
  );
}

export interface CommandEmptyComponentProps extends StyleProps {
  children?: Child;
}

/** Rendered while the search matches nothing, and not otherwise. */
export function CommandEmpty(props: Incoming<CommandEmptyComponentProps>) {
  const held = useCommand();
  return (
    <Show when={held.state.isEmpty()}>
      <div
        cmdk-empty=""
        role="presentation"
        {...filterDOMProps(fromProps(props), { global: true })}
        {...styleProps(props)}
      >
        {props.children}
      </div>
    </Show>
  );
}

export interface CommandGroupComponentProps extends StyleProps {
  children?: Child;
  /** Draws the heading and names the group. */
  heading?: Child;
  "aria-label"?: string;
  forceMount?: boolean;
  /** The heading's own class and slot, since `class` styles the group. */
  headingClass?: string;
  headingSlot?: string;
  ref?: RefTarget<HTMLDivElement>;
}

export function CommandGroup(props: Incoming<CommandGroupComponentProps>) {
  const held = useCommand();
  const group = commandGroup(
    {
      heading: () => props.heading?.(),
      "aria-label": () => props["aria-label"]?.(),
      forceMount: () => props.forceMount?.(),
    },
    held.state,
  );

  const elementProps = mergeProps(
    group.groupProps,
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      // The order comes last, so a caller's own `style` does not drop it.
      style: () => ({
        ...props.style?.(),
        ...access(group.groupProps.style as MaybeAccessor<Record<string, number> | undefined>),
      }),
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <div {...elementProps} ref={mergeRefs(group.ref, props.ref?.())}>
      <Show when={props.heading?.() !== undefined}>
        <div
          {...group.headingProps}
          class={props.headingClass?.()}
          data-slot={props.headingSlot?.()}
        >
          {props.heading}
        </div>
      </Show>
      <div {...group.itemsProps}>{group.provide(() => props.children) as Child}</div>
    </div>
  );
}

export interface CommandItemComponentProps extends StyleProps {
  children?: Child;
  /** What the item is searched and reported by. @default its own text */
  value?: string;
  keywords?: string[];
  disabled?: boolean;
  forceMount?: boolean;
  ref?: RefTarget<HTMLDivElement>;
  onSelect?: (value: string) => void;
}

export function CommandItem(props: Incoming<CommandItemComponentProps>) {
  const held = useCommand();
  const options = fromProps(props);
  const item = commandItem(
    {
      value: options.value,
      keywords: options.keywords,
      isDisabled: options.disabled,
      forceMount: options.forceMount,
      onSelect: options.onSelect,
    },
    held.state,
    held.itemId,
  );

  const elementProps = mergeProps(
    item.itemProps,
    filterDOMProps(options, { global: true, labelable: true }),
    styleProps(props),
    {
      // The order comes last, so a caller's own `style` does not drop it.
      style: () => ({
        ...props.style?.(),
        ...access(item.itemProps.style as MaybeAccessor<Record<string, number> | undefined>),
      }),
      "data-focused": item.isHighlighted,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <div {...elementProps} ref={mergeRefs(item.ref, props.ref?.())}>
      {props.children}
    </div>
  );
}

export interface CommandSeparatorComponentProps extends StyleProps {
  /** Stay through a search, where a separator otherwise divides nothing. */
  alwaysRender?: boolean;
}

export function CommandSeparator(props: Incoming<CommandSeparatorComponentProps>) {
  const held = useCommand();
  return (
    <Show when={props.alwaysRender?.() === true || held.state.search() === ""}>
      <div
        cmdk-separator=""
        role="separator"
        {...filterDOMProps(fromProps(props), { global: true })}
        {...styleProps(props)}
      />
    </Show>
  );
}

export interface CommandLoadingComponentProps extends StyleProps {
  children?: Child;
  /** How far along, from 0 to 100. */
  progress?: number;
  /** @default "Loading..." */
  label?: string;
}

/** Shown, by the caller's own condition, while the items are being fetched. */
export function CommandLoading(props: Incoming<CommandLoadingComponentProps>) {
  return (
    <div
      cmdk-loading=""
      role="progressbar"
      aria-valuenow={props.progress?.()}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={props.label?.() ?? "Loading..."}
      {...filterDOMProps(fromProps(props), { global: true })}
      {...styleProps(props)}
    >
      <div aria-hidden="true">{props.children}</div>
    </div>
  );
}
