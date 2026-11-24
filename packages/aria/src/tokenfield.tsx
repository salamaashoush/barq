/**
 * A token field: editable text with inline tokens in it.
 *
 * A prompt field with mentions, a structured search query, a recipient list.
 * It is `contenteditable`, because text and tokens flow and wrap together as
 * one paragraph and an `<input>` cannot hold an element. The browser is never
 * allowed to edit it, though. Every edit arrives as a `beforeinput`, is
 * cancelled, and is applied to the VALUE: a list of text and token segments.
 * The DOM is then drawn from the value and the caret put back where the value
 * says it is. A browser left to edit a contenteditable puts typed text inside
 * a token, merges two tokens' wrappers, or deletes half of one.
 *
 * The decisions that follow from that:
 *
 * - **A token is one character to the caret.** Arrows step over it, Backspace
 *   deletes it whole, and a selection that touches it selects all of it. Each
 *   token sits between two zero-width spaces so the caret has somewhere to
 *   stand on either side of it.
 * - **Composition is left alone.** An input method's text cannot be cancelled,
 *   and touching the DOM while one is composing ends the composition. So the
 *   field stops redrawing, records what the browser does, and when the
 *   composition ends puts the DOM back exactly as it was and redraws from the
 *   value. The value is still reported while composing, so an autocomplete
 *   keeps up.
 * - **Moving next to a token announces it.** A screen reader otherwise reads
 *   the zero-width space beside it, which is nothing.
 * - **Undo is the value's own history**, coalescing a run of typing into one
 *   step, because the browser's history was never told about any of it.
 */

import {
  cells,
  type Accessor,
  type Child,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  For,
  getContext,
  onCleanup,
  provide,
  untrack,
} from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { useAutocompleteInput } from "./autocomplete.tsx";
import { activeElement, contains, ownerDocument, scrollParents } from "./dom.ts";
import { focusRing } from "./focus.ts";
import { useLocale } from "./i18n.ts";
import { focusable, type FocusableOptions } from "./interactions/focusable.ts";
import { hover, type HoverEvent } from "./interactions/hover.ts";
import { keyboard, type KeyboardShortcutBindings } from "./interactions/keyboard.ts";
import {
  getInteractionModality,
  isVirtualClick,
  setInteractionModality,
} from "./interactions/modality.ts";
import type { ElementRef } from "./interactions/press.ts";
import { field, type FieldOptions } from "./label.ts";
import { announce } from "./live.ts";
import { isMac } from "./platform.ts";
import {
  access,
  controllable,
  type DOMProps,
  filterDOMProps,
  fromProps,
  type MaybeAccessor,
  mergeProps,
  type StyleProps,
  styleProps,
  type ProviderProps,
} from "./utils.ts";

// ---------------------------------------------------------------------------
// The value
// ---------------------------------------------------------------------------

export interface TextSegment {
  type: "text";
  text: string;
}

export interface TokenSegment<T = unknown> {
  type: "token";
  /** What the token reads as, in the text and to a screen reader. */
  text: string;
  value?: T;
}

export type TokenFieldSegment<T = unknown> = TextSegment | TokenSegment<T>;

/** A place in the value: a segment, and a UTF-16 offset into its text. */
export interface Position {
  index: number;
  offset: number;
}

function compare(a: Position, b: Position): number {
  return a.index === b.index ? a.offset - b.offset : a.index - b.index;
}

function isSamePosition(a: Position, b: Position): boolean {
  return a.index === b.index && a.offset === b.offset;
}

/** A selection in a token field: where it started and where the caret is. */
export class SelectedRange {
  anchor: Position;
  current: Position;

  /** One position is a collapsed selection: a caret. */
  constructor(anchor: Position, current: Position = anchor) {
    this.anchor = anchor;
    this.current = current;
  }

  get isCollapsed(): boolean {
    return isSamePosition(this.anchor, this.current);
  }

  /** The end nearer the start of the value. */
  get start(): Position {
    return compare(this.anchor, this.current) < 0 ? this.anchor : this.current;
  }

  get end(): Position {
    return compare(this.anchor, this.current) < 0 ? this.current : this.anchor;
  }

  isEqual(other: SelectedRange): boolean {
    return (
      this === other ||
      (isSamePosition(this.anchor, other.anchor) && isSamePosition(this.current, other.current))
    );
  }
}

/** Which way through the value: towards its end, or its start. */
export const TokenDirection = { Forward: 1, Backward: -1 } as const;
export type TokenDirection = (typeof TokenDirection)[keyof typeof TokenDirection];

export interface TokenFieldValueOptions {
  selectedRange?: SelectedRange | null;
}

function textSegment(text: string): TextSegment {
  return { type: "text", text };
}

function findInText(
  text: string,
  search: string | RegExp,
  direction: TokenDirection,
  from?: number,
): number {
  if (typeof search === "string") {
    if (direction === TokenDirection.Backward) {
      return text.lastIndexOf(search, from === undefined ? text.length - 1 : from - 1);
    }
    return text.indexOf(search, from ?? 0);
  }
  if (direction === TokenDirection.Forward) {
    const start = from ?? 0;
    const found = text.slice(start).search(search);
    return found >= 0 ? start + found : -1;
  }
  const limit = from ?? text.length;
  if (limit < 0) return -1;
  const global = search.flags.includes("g")
    ? search
    : new RegExp(search.source, `${search.flags}g`);
  return [...text.slice(0, limit).matchAll(global)].at(-1)?.index ?? -1;
}

function appendSegments<T>(
  segments: TokenFieldSegment<T>[],
  insert: readonly TokenFieldSegment<T>[],
  tokenize?: (text: string) => TokenFieldSegment<T>[],
): TokenFieldSegment<T>[] {
  for (const segment of insert) {
    if (segment.type === "text" && segment.text.length === 0) continue;
    const last = segments.at(-1);
    if (last !== undefined && last.type === "text" && segment.type === "text") {
      if (tokenize === undefined)
        segments[segments.length - 1] = textSegment(last.text + segment.text);
      else segments.splice(segments.length - 1, 1, ...tokenize(last.text + segment.text));
    } else if (tokenize !== undefined && segment.type === "text") {
      segments.push(...tokenize(segment.text));
    } else {
      segments.push(segment);
    }
  }
  return segments;
}

/**
 * Text and tokens, the selection in them, and the undo history behind them.
 *
 * Immutable: every edit answers a new value linked into the history. Extend it
 * and override `tokenize` to turn typed text into tokens as it is entered.
 */
export class TokenFieldValue<T = unknown> {
  static readonly Direction = TokenDirection;
  static readonly SelectedRange = SelectedRange;

  readonly segments: readonly TokenFieldSegment<T>[];
  selectedRange: SelectedRange;
  #previous: this | null = null;
  #next: this | null = null;
  #isCoalescing = true;

  constructor(segments: readonly TokenFieldSegment<T>[], options?: TokenFieldValueOptions) {
    this.segments = segments;
    this.selectedRange = options?.selectedRange ?? new SelectedRange({ index: 0, offset: 0 });
  }

  /** A value of the same class, so a subclass's `tokenize` survives an edit. */
  protected createFieldValue(segments: readonly TokenFieldSegment<T>[]): this {
    const Constructor = this.constructor as new (
      segments: readonly TokenFieldSegment<T>[],
      options?: TokenFieldValueOptions,
    ) => this;
    return new Constructor(segments);
  }

  /** Text typed or pasted, as segments. The whole of it as text, unless overridden. */
  protected tokenize(text: string): TokenFieldSegment<T>[] {
    return [textSegment(text)];
  }

  get caretPosition(): Position {
    return this.selectedRange.current;
  }

  withSelectedRange(selectedRange: SelectedRange): this {
    if (this.selectedRange.isEqual(selectedRange)) return this;
    const result = this.createFieldValue(this.segments);
    result.selectedRange = selectedRange;
    result.#previous = this.#previous;
    result.#next = this.#next;
    result.#isCoalescing = this.#isCoalescing;
    return result;
  }

  withCaretPosition(position: Position): this {
    return this.withSelectedRange(new SelectedRange(position));
  }

  #split(
    segment: TokenFieldSegment<T> | undefined,
    offset: number,
  ): [TokenFieldSegment<T> | null, TokenFieldSegment<T> | null] {
    if (segment === undefined) {
      const empty = textSegment("");
      return [offset > 0 ? empty : null, offset > 0 ? null : empty];
    }
    if (segment.type === "token") {
      return [offset > 0 ? { ...segment } : null, offset > 0 ? null : { ...segment }];
    }
    return [
      offset > 0 ? textSegment(segment.text.slice(0, offset)) : null,
      offset < segment.text.length ? textSegment(segment.text.slice(offset)) : null,
    ];
  }

  #clamp(position: Position): Position {
    const last = this.segments.at(-1);
    if (last !== undefined && position.index >= this.segments.length) {
      return { index: this.segments.length - 1, offset: last.text.length };
    }
    if (position.index < 0) return { index: 0, offset: 0 };
    return position;
  }

  /** The text between two positions replaced with `text`. */
  replaceRange(start: Position, end: Position, text: string, coalesce = true): this {
    return this.replaceRangeWithSegments(
      start,
      end,
      text.length > 0 ? [textSegment(text)] : [],
      coalesce,
    );
  }

  /** The text between two positions replaced with segments. */
  replaceRangeWithSegments(
    start: Position,
    end: Position,
    insert: readonly TokenFieldSegment<T>[],
    coalesce = true,
  ): this {
    const from = this.#clamp(start);
    const to = this.#clamp(end);
    const [before] = this.#split(this.segments[from.index], from.offset);
    const [, after] = this.#split(this.segments[to.index], to.offset);

    const next = this.segments.slice(0, from.index);
    if (before !== null) appendSegments(next, [before]);
    if (insert.length > 0) appendSegments(next, insert, (text) => this.tokenize(text));

    const last = next.at(-1);
    const lastIsText = last !== undefined && last.type === "text";
    const caret = {
      index: lastIsText ? next.length - 1 : next.length,
      offset: lastIsText ? last.text.length : 0,
    };

    if (after !== null) appendSegments(next, [after]);
    appendSegments(next, this.segments.slice(to.index + 1));

    const result = this.createFieldValue(next);
    result.selectedRange = new SelectedRange(caret);
    result.#isCoalescing = coalesce;
    if (this.#isCoalescing && coalesce && this.#previous !== null) {
      result.#previous = this.#previous;
      this.#previous.#next = result;
    } else {
      result.#previous = this;
      this.selectedRange = new SelectedRange(from, to);
      this.#next = result;
    }
    return result;
  }

  /** The grapheme or word boundary before or after a position. A token is one of either. */
  findBoundaryWithSegmenter(
    position: Position,
    segmenter: Intl.Segmenter,
    direction: TokenDirection,
  ): Position | null {
    const at = this.#clamp(position);
    for (let i = at.index; i >= 0 && i < this.segments.length; i += direction) {
      const segment = this.segments[i] as TokenFieldSegment<T>;
      if (segment.type === "token") {
        const beside =
          i !== at.index ||
          (direction === TokenDirection.Backward ? at.offset > 0 : at.offset === 0);
        if (!beside) continue;
        const index = i + direction;
        return {
          index: Math.max(index, 0),
          offset:
            direction === TokenDirection.Backward && index >= 0
              ? (this.segments[index]?.text.length ?? 0)
              : 0,
        };
      }

      let offset = direction === TokenDirection.Backward ? segment.text.length : 0;
      if (i === at.index) offset = at.offset;
      if (direction === TokenDirection.Backward) offset--;
      if (offset < 0 || offset >= segment.text.length) continue;

      let part = segmenter.segment(segment.text).containing(offset);
      while (part !== undefined && part.isWordLike === false) {
        offset += direction;
        part = segmenter.segment(segment.text).containing(offset);
      }
      if (part !== undefined) {
        return {
          index: i,
          offset:
            direction === TokenDirection.Backward ? part.index : part.index + part.segment.length,
        };
      }
    }
    return null;
  }

  findLineBoundary(position: Position, direction: TokenDirection): Position | null {
    const found = this.findText(position, direction, "\n");
    if (found !== null) return found;
    if (direction === TokenDirection.Backward) return { index: 0, offset: 0 };
    return {
      index: this.segments.length - 1,
      offset: this.segments.at(-1)?.text.length ?? 0,
    };
  }

  /** Where `search` next matches in the text, before or after a position. Tokens are skipped. */
  findText(
    position: Position,
    direction: TokenDirection,
    search: string | RegExp,
  ): Position | null {
    for (let i = position.index; i >= 0 && i < this.segments.length; i += direction) {
      const segment = this.segments[i] as TokenFieldSegment<T>;
      if (segment.type !== "text") continue;
      const offset = findInText(
        segment.text,
        search,
        direction,
        i === position.index ? position.offset : undefined,
      );
      if (offset >= 0) return { index: i, offset };
    }
    return null;
  }

  /** One grapheme, word or token deleted at a position. */
  delete(
    position: Position,
    segmenter: Intl.Segmenter,
    direction: TokenDirection,
    coalesce = true,
  ): this {
    const boundary = this.findBoundaryWithSegmenter(position, segmenter, direction);
    if (boundary === null) return this.withSelectedRange(new SelectedRange(position));
    return direction === TokenDirection.Backward
      ? this.replaceRange(boundary, position, "", coalesce)
      : this.replaceRange(position, boundary, "", coalesce);
  }

  /** Everything to the next or previous line break deleted. */
  deleteLine(position: Position, direction: TokenDirection, coalesce = true): this {
    if (this.segments.length === 0) return this;
    const boundary = this.findLineBoundary(position, direction);
    if (boundary === null) return this.withSelectedRange(new SelectedRange(position));
    return direction === TokenDirection.Backward
      ? this.replaceRange(boundary, position, "", coalesce)
      : this.replaceRange(position, boundary, "", coalesce);
  }

  /** The segments between two positions, as a value of their own. */
  slice(start: Position, end: Position): this {
    const from = this.#clamp(start);
    const to = this.#clamp(end);
    if (isSamePosition(from, to)) return this.createFieldValue([]);
    if (from.index === to.index) {
      const segment = this.segments[from.index] as TokenFieldSegment<T>;
      return this.createFieldValue([
        segment.type === "text" ? textSegment(segment.text.slice(from.offset, to.offset)) : segment,
      ]);
    }
    const [, head] = this.#split(this.segments[from.index], from.offset);
    const [tail] = this.#split(this.segments[to.index], to.offset);
    const result: TokenFieldSegment<T>[] = [];
    if (head !== null) result.push(head);
    result.push(...this.segments.slice(from.index + 1, to.index));
    if (tail !== null) result.push(tail);
    return this.createFieldValue(result);
  }

  /** The text, with each token as its own text. */
  toString(): string {
    return this.segments.map((segment) => segment.text).join("");
  }

  undo(): this {
    return this.#previous ?? this;
  }

  redo(): this {
    return this.#next ?? this;
  }

  /** The next edit starts an undo step of its own rather than joining this one. */
  endCoalescing(): void {
    this.#isCoalescing = false;
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface TokenFieldStateOptions<V extends TokenFieldValue> {
  value?: MaybeAccessor<V | undefined>;
  defaultValue?: MaybeAccessor<V | undefined>;
  onChange?: (value: V) => void;
}

export interface TokenFieldState<V extends TokenFieldValue = TokenFieldValue> {
  value: Accessor<V>;
  /** A value, or a function of the latest one, including a write not yet flushed. */
  setValue(next: V | ((value: V) => V)): void;
  isComposing: Accessor<boolean>;
  setComposing(isComposing: boolean): void;
}

interface StagedValue<V extends TokenFieldValue> {
  base: V;
  next: V;
}

export function tokenFieldState<V extends TokenFieldValue = TokenFieldValue>(
  options: TokenFieldStateOptions<V> = {},
): TokenFieldState<V> {
  const [value, write] = controllable<V>(
    () => access(options.value) as V | undefined,
    () => (access(options.defaultValue) as V | undefined) ?? (new TokenFieldValue([]) as V),
    options.onChange,
  );
  const [isComposing, setComposing] = createSignal(false);

  // A write is published at the next flush. Two edits in one tick — an input
  // and the caret move it causes — must build on each other, not both on the
  // value from before the first.
  let staged: StagedValue<V> | null = null;

  return {
    value,
    isComposing,
    setComposing,
    setValue(next) {
      const published = untrack(value);
      const base = staged !== null && staged.base === published ? staged.next : published;
      const resolved = typeof next === "function" ? next(base) : next;
      staged = { base: published, next: resolved };
      write(resolved);
      queueMicrotask(() => {
        staged = null;
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Between the value and the DOM
// ---------------------------------------------------------------------------

/** Marks a selection this hook set, so the `selectionchange` it causes is not read back. */
const PROGRAMMATIC = Symbol("barq.tokenfield.programmaticSelection");

interface Marked {
  [PROGRAMMATIC]?: boolean;
}

/** The data type a copied selection carries its tokens under. */
const CLIPBOARD_MIME_TYPE = "application/vnd.barq.tokens+json";

const ZERO_WIDTH_SPACE = "\u200b";

function indexOfNode(node: Node): number {
  let index = 0;
  let at: Node | null = node.previousSibling;
  while (at !== null) {
    index++;
    at = at.previousSibling;
  }
  return index;
}

/**
 * A DOM position as a value position.
 *
 * The root's children are the segments, one node each: a text node for text,
 * and for a token a wrapper holding a zero-width space, the token and another.
 * Several DOM positions are one value position, around a token most of all,
 * and each is normalised to the end of the text before or the start of the
 * text after.
 */
function getPosition(container: Element, node: Node, offset: number, isRangeEnd = false): Position {
  if (node === container) return { index: offset, offset: 0 };

  const original = node;
  let top = node;
  while (top.parentNode !== null && top.parentNode !== container) top = top.parentNode;

  let index = indexOfNode(top);
  let at = offset;
  if (top.nodeType === Node.ELEMENT_NODE) {
    const tokenNode = top.childNodes[1] ?? null;
    let atEnd: boolean;
    let endOffset = 0;
    if (original === tokenNode) {
      atEnd = isRangeEnd || offset > 0;
    } else if (original === top) {
      atEnd = offset > 1;
    } else {
      atEnd = original !== tokenNode?.previousSibling;
      // Text typed into the trailing zero-width space lands in the next text node.
      endOffset = atEnd && offset > 1 ? offset - 1 : 0;
    }

    at = atEnd ? (tokenNode?.textContent?.length ?? 0) : 0;
    if (at === 0 && top.previousSibling?.nodeType === Node.TEXT_NODE) {
      index--;
      at = top.previousSibling.textContent?.length ?? 0;
    } else if (atEnd) {
      index++;
      at = endOffset;
    }
  }
  return { index, offset: at };
}

function rangeToPositions(container: Element, range: AbstractRange): [Position, Position] {
  return [
    getPosition(container, range.startContainer, range.startOffset, false),
    getPosition(container, range.endContainer, range.endOffset, !range.collapsed),
  ];
}

function selectionOf(container: Element): Selection | null {
  return container.ownerDocument.defaultView?.getSelection() ?? null;
}

/** The selection, as two value positions in order, if it is in the field. */
export function getTokenFieldSelection(container: Element): [Position, Position] | null {
  const selection = selectionOf(container);
  if (selection === null || selection.rangeCount === 0) return null;
  return rangeToPositions(container, selection.getRangeAt(0));
}

/** The selection, as a {@link SelectedRange} keeping its direction, if it is in the field. */
export function getTokenFieldSelectedRange(container: Element): SelectedRange | null {
  const selection = selectionOf(container);
  if (
    selection === null ||
    selection.anchorNode === null ||
    selection.focusNode === null ||
    !contains(container, selection.anchorNode) ||
    !contains(container, selection.focusNode)
  ) {
    return null;
  }
  return new SelectedRange(
    getPosition(container, selection.anchorNode, selection.anchorOffset, false),
    getPosition(container, selection.focusNode, selection.focusOffset, !selection.isCollapsed),
  );
}

/** A value position as a DOM position: beside a token's wrapper, never inside it. */
function getDOMPosition(root: Element, position: Position): [Node, number] {
  const index = Math.max(0, Math.min(root.childNodes.length, position.index));
  const child = root.childNodes[index];
  if (child === undefined) return [root, index];
  if (child.nodeType === Node.ELEMENT_NODE) {
    // Outside the wrapper, which is where an input method has to start.
    return position.offset > 0 ? [root, index + 1] : [root, index];
  }
  return [child, Math.max(0, Math.min(child.textContent?.length ?? 0, position.offset))];
}

function createDOMRange(root: Element, start: Position, end: Position): Range {
  const range = root.ownerDocument.createRange();
  const [startContainer, startOffset] = getDOMPosition(root, start);
  const [endContainer, endOffset] = getDOMPosition(root, end);
  range.setStart(startContainer, startOffset);
  range.setEnd(endContainer, endOffset);
  return range;
}

/** Put the selection on the DOM, keeping its direction. */
export function setTokenFieldSelection(
  root: Element,
  selectedRange: SelectedRange,
  fireEvent = false,
): void {
  const selection = selectionOf(root);
  if (selection === null) return;
  const [anchorNode, anchorOffset] = getDOMPosition(root, selectedRange.anchor);
  const [focusNode, focusOffset] = getDOMPosition(root, selectedRange.current);
  // Only when it moves: setting it anyway can flip the direction the user
  // extended it in, and no `selectionchange` would come to clear the mark.
  if (
    selection.anchorNode !== anchorNode ||
    selection.anchorOffset !== anchorOffset ||
    selection.focusNode !== focusNode ||
    selection.focusOffset !== focusOffset
  ) {
    (root as Element & Marked)[PROGRAMMATIC] = !fireEvent;
    selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
  }
}

function getDOMRectPosition(root: Element, position: Position): [Node, number] {
  const child = root.childNodes[position.index];
  const lastText = root.lastChild?.lastChild ?? null;
  if (position.index >= root.childNodes.length && lastText?.nodeType === Node.TEXT_NODE) {
    return [lastText, lastText.textContent?.length ?? 0];
  }
  if (child !== undefined && child.nodeType === Node.ELEMENT_NODE && child.firstChild !== null) {
    // Inside the zero-width spaces, so the range has a box.
    return position.offset > 0 && child.lastChild !== null
      ? [child.lastChild, 1]
      : [child.firstChild, 0];
  }
  return getDOMPosition(root, position);
}

/**
 * A collapsed range at a value position, for MEASURING: to place a popover at
 * the caret, say. Inside a token's wrapper, unlike the caret's own position,
 * because only there does a position beside a token have a box.
 */
export function tokenFieldPositionToDOMRange(root: Element, position: Position): Range {
  const range = root.ownerDocument.createRange();
  const [container, offset] = getDOMRectPosition(root, position);
  range.setStart(container, offset);
  range.setEnd(container, offset);
  return range;
}

function isEmptyRect(rect: DOMRect): boolean {
  return rect.top === 0 && rect.bottom === 0 && rect.left === 0 && rect.right === 0;
}

/** Scroll one scroller the least that brings `rect` into it. */
function scrollRectIntoView(scroller: Element, rect: DOMRect): void {
  const bounds = scroller.getBoundingClientRect();
  if (rect.top < bounds.top) scroller.scrollTop -= bounds.top - rect.top;
  else if (rect.bottom > bounds.bottom) scroller.scrollTop += rect.bottom - bounds.bottom;
  if (rect.left < bounds.left) scroller.scrollLeft -= bounds.left - rect.left;
  else if (rect.right > bounds.right) scroller.scrollLeft += rect.right - bounds.right;
}

/**
 * Bring the caret into view, which the browser would have done for an edit it
 * made itself and does not for one cancelled in `beforeinput`.
 */
function scrollCaretIntoView(root: HTMLElement): void {
  const selection = selectionOf(root);
  if (
    getInteractionModality() !== "keyboard" ||
    selection === null ||
    selection.rangeCount === 0 ||
    !contains(root, selection.focusNode)
  ) {
    return;
  }

  let range = selection.getRangeAt(0);
  if (range.collapsed && range.endContainer === root) {
    range = tokenFieldPositionToDOMRange(root, { index: range.endOffset, offset: 0 });
  }
  let rect = range.getBoundingClientRect();

  // A collapsed range on an empty line has no box; measure what is beside it.
  if (isEmptyRect(rect)) {
    let node: Node | null = range.endContainer;
    if (node.nodeType === Node.TEXT_NODE && range.endOffset < (node.nodeValue?.length ?? 0)) {
      range = range.cloneRange();
      range.setEnd(node, range.endOffset + 1);
      rect = range.getBoundingClientRect();
    } else if (root.firstChild === null) {
      rect = root.getBoundingClientRect();
    } else {
      let sibling: Node | null =
        node === root ? (root.childNodes[range.endOffset] ?? null) : node.nextSibling;
      while (node !== null && node !== root && sibling === null) {
        node = node.parentNode;
        sibling = node !== null && node !== root ? node.nextSibling : null;
      }
      if (sibling?.nodeType === Node.ELEMENT_NODE) {
        rect = (sibling as Element).getBoundingClientRect();
      }
    }
  }

  for (const scroller of scrollParents(root, true)) {
    const top = scroller.scrollTop;
    const left = scroller.scrollLeft;
    scrollRectIntoView(scroller, rect);
    // An inner scroller moving moves the caret for every scroller outside it.
    const dy = scroller.scrollTop - top;
    const dx = scroller.scrollLeft - left;
    if (dx !== 0 || dy !== 0) rect = new DOMRect(rect.x - dx, rect.y - dy, rect.width, rect.height);
  }
}

interface MaybeSegment {
  type?: unknown;
  text?: unknown;
}

function isValidSegment(segment: unknown): segment is TokenFieldSegment {
  if (typeof segment !== "object" || segment === null) return false;
  const candidate = segment as MaybeSegment;
  return (
    (candidate.type === "text" || candidate.type === "token") && typeof candidate.text === "string"
  );
}

/** Segments from clipboard or drag data, or `null` for anything not shaped like them. */
function parseSegments(json: string): TokenFieldSegment[] | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  return Array.isArray(data) && data.length > 0 && data.every(isValidSegment) ? data : null;
}

/**
 * Record what the browser does to `element` until the returned function is
 * called, which undoes all of it.
 */
function trackMutations(element: Element): () => void {
  const mutations: MutationRecord[] = [];
  const observer = new MutationObserver((records) => {
    mutations.push(...records);
  });
  observer.observe(element, {
    childList: true,
    subtree: true,
    characterData: true,
    characterDataOldValue: true,
  });

  return () => {
    mutations.push(...observer.takeRecords());
    observer.disconnect();
    for (const record of mutations.toReversed()) {
      if (record.type === "childList") {
        for (const node of record.removedNodes)
          record.target.insertBefore(node, record.nextSibling);
        for (const node of record.addedNodes) record.target.removeChild(node);
      } else if (record.type === "characterData") {
        record.target.nodeValue = record.oldValue;
      }
    }
  };
}

/** Say the token beside the caret, or the one token selected. */
function announceToken(value: TokenFieldValue, range: SelectedRange = value.selectedRange): void {
  if (range.isCollapsed) {
    let segment = value.segments[range.current.index];
    if (segment !== undefined && segment.type !== "token") {
      if (range.current.offset === 0) segment = value.segments[range.current.index - 1];
      else if (range.current.offset === segment.text.length) {
        segment = value.segments[range.current.index + 1];
      }
    }
    if (segment?.type === "token") announce(segment.text, "assertive");
    return;
  }
  const selected = value.slice(range.start, range.end).segments;
  const only = selected[0];
  if (selected.length === 1 && only?.type === "token") announce(only.text, "assertive");
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export type TokenFieldRole = "textbox" | "searchbox" | "combobox";

export interface TokenFieldOptions extends FieldOptions, FocusableOptions {
  /** @default "textbox" */
  role?: MaybeAccessor<TokenFieldRole | undefined>;
  /** Enter and Shift+Enter write a line break. Without it the field is one line. */
  allowsNewlines?: MaybeAccessor<boolean | undefined>;
  isReadOnly?: MaybeAccessor<boolean | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  "aria-details"?: MaybeAccessor<string | undefined>;
  /** Called on Enter, which then writes no line break. */
  onSubmit?: () => void;
  onCopy?: (event: ClipboardEvent) => void;
  onCut?: (event: ClipboardEvent) => void;
  onPaste?: (event: ClipboardEvent) => void;
}

export interface TokenFieldResult {
  /** For the editable element. */
  tokenFieldProps: DOMProps;
  labelProps: DOMProps;
  descriptionProps: DOMProps;
  errorMessageProps: DOMProps;
}

type InputWithRanges = InputEvent & { getTargetRanges?: () => StaticRange[] };

type ModifiableSelection = Selection & {
  modify?: (alter: "move" | "extend", direction: "left" | "right", granularity: string) => void;
};

interface CaretDocument {
  caretPositionFromPoint?: (x: number, y: number) => CaretPoint | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
}

interface CaretPoint {
  offsetNode: Node;
  offset: number;
}

export function tokenField<V extends TokenFieldValue>(
  options: TokenFieldOptions,
  state: TokenFieldState<V>,
  ref: ElementRef<HTMLElement>,
): TokenFieldResult {
  const locale = useLocale();
  const graphemes = createMemo(
    () => new Intl.Segmenter(locale().locale, { granularity: "grapheme" }),
  );
  const words = createMemo(() => new Intl.Segmenter(locale().locale, { granularity: "word" }));

  function element(): HTMLElement | null {
    return (access(ref) as HTMLElement | null) ?? null;
  }
  function isDisabled(): boolean {
    return access(options.isDisabled) === true;
  }
  function isReadOnly(): boolean {
    return access(options.isReadOnly) === true;
  }
  function multiline(): boolean {
    return access(options.allowsNewlines) === true;
  }

  let dropPosition: Position | null = null;
  let transferred: TokenFieldSegment[] | null = null;
  // The value this field last produced, so a different one arriving while
  // composing is known to have come from outside.
  let expected: TokenFieldValue | null = null;

  function apply(edit: (value: V) => TokenFieldValue): void {
    state.setValue((value) => {
      const next = edit(value) as V;
      expected = next;
      return next;
    });
  }

  let stopTracking: (() => void) | null = null;
  function startComposition(): void {
    const root = element();
    // Android sometimes starts twice without ending in between.
    if (stopTracking === null && root !== null) stopTracking = trackMutations(root);
    state.setComposing(true);
  }
  function stopComposition(): void {
    stopTracking?.();
    stopTracking = null;
    state.setComposing(false);
  }
  onCleanup(() => {
    stopTracking?.();
    stopTracking = null;
  });

  function editAt(
    event: InputEvent,
    root: HTMLElement,
  ): [Position, Position, AbstractRange] | null {
    let range: AbstractRange | undefined = (event as InputWithRanges).getTargetRanges?.()[0];
    if (range === undefined) {
      const selection = selectionOf(root);
      if (selection === null || selection.rangeCount === 0) return null;
      range = selection.getRangeAt(0);
    }
    const [start, end] = rangeToPositions(root, range);
    return [start, end, range];
  }

  function onBeforeInput(event: InputEvent): void {
    const root = element();
    if (root === null) return;
    // Android sometimes skips `compositionend` before an ordinary input.
    if (untrack(state.isComposing) && !event.isComposing) stopComposition();

    const at = editAt(event, root);
    if (at === null) return;
    let [start, end] = at;
    const range = at[2];

    switch (event.inputType) {
      case "insertText":
      case "insertReplacementText":
      case "insertCompositionText":
      case "insertFromComposition":
      case "insertFromPaste":
      case "insertFromYank":
      case "insertFromDrop": {
        let data: TokenFieldSegment[] = [textSegment(event.data ?? "")];
        if (transferred !== null) {
          data = transferred;
          transferred = null;
        } else if (event.dataTransfer !== null) {
          const types = new Set(event.dataTransfer.types);
          const parsed = types.has(CLIPBOARD_MIME_TYPE)
            ? parseSegments(event.dataTransfer.getData(CLIPBOARD_MIME_TYPE))
            : null;
          if (parsed !== null) data = parsed;
          else if (types.has("text/plain")) {
            data = [textSegment(event.dataTransfer.getData("text/plain"))];
          }
        }
        if (event.inputType === "insertFromDrop" && dropPosition !== null) {
          start = dropPosition;
          end = dropPosition;
          dropPosition = null;
        }
        if (!multiline()) {
          data = data.map((segment) => ({
            ...segment,
            text: segment.text.replace(/[\r\n]+/g, " "),
          }));
        }
        const typed =
          event.inputType === "insertText" ||
          event.inputType === "insertCompositionText" ||
          event.inputType === "insertFromComposition";
        const from = start;
        const to = end;
        // A paste or a drop is a step of its own in the undo history.
        apply((value) => value.replaceRangeWithSegments(from, to, data, typed));
        break;
      }
      case "insertParagraph":
      case "insertLineBreak": {
        if (event.inputType === "insertParagraph" && options.onSubmit !== undefined) {
          options.onSubmit();
          break;
        }
        const from = start;
        const to = end;
        if (multiline()) apply((value) => value.replaceRange(from, to, "\n"));
        break;
      }
      case "deleteContentBackward":
      case "deleteContentForward":
      case "deleteWordBackward":
      case "deleteWordForward":
      case "deleteHardLineForward":
      case "deleteHardLineBackward":
      case "deleteSoftLineForward":
      case "deleteSoftLineBackward":
      case "deleteContent":
      case "deleteByCut":
      case "deleteCompositionText": {
        const from = start;
        const to = end;
        if (!range.collapsed && !isSamePosition(from, to)) {
          apply((value) => value.replaceRange(from, to, ""));
          break;
        }
        const back = TokenDirection.Backward;
        const forward = TokenDirection.Forward;
        switch (event.inputType) {
          case "deleteContentBackward":
            apply((value) => value.delete(from, untrack(graphemes), back));
            break;
          case "deleteContentForward":
            apply((value) => value.delete(from, untrack(graphemes), forward));
            break;
          case "deleteWordBackward":
            apply((value) => value.delete(from, untrack(words), back));
            break;
          case "deleteWordForward":
            apply((value) => value.delete(from, untrack(words), forward));
            break;
          case "deleteHardLineForward":
          case "deleteSoftLineForward":
            apply((value) => value.deleteLine(from, forward));
            break;
          case "deleteHardLineBackward":
          case "deleteSoftLineBackward":
            apply((value) => value.deleteLine(from, back));
            break;
          default:
            break;
        }
        break;
      }
      case "deleteByDrag": {
        const from = start;
        const to = end;
        apply((value) => {
          const endOffset =
            from.index === to.index ? to.offset : (value.segments[from.index]?.text.length ?? 0);
          const change = value.replaceRange(from, to, "");
          // The drop lands in text that this deletion just shortened.
          if (
            dropPosition !== null &&
            dropPosition.index === from.index &&
            dropPosition.offset >= from.offset
          ) {
            dropPosition = {
              ...dropPosition,
              offset: dropPosition.offset - (endOffset - from.offset),
            };
          }
          return change;
        });
        break;
      }
      default:
        break;
    }

    event.preventDefault();
  }

  function writeClipboard(event: ClipboardEvent | DragEvent): void {
    const root = element();
    if (root === null) return;
    if ("clipboardData" in event) event.preventDefault();
    const selection = getTokenFieldSelection(root);
    if (selection === null) return;
    const [start, end] = selection;
    const slice = untrack(state.value).slice(start, end);
    const transfer = "clipboardData" in event ? event.clipboardData : event.dataTransfer;
    transfer?.setData(CLIPBOARD_MIME_TYPE, JSON.stringify(slice.segments));
    transfer?.setData("text/plain", slice.toString());
    if (event.type === "cut") apply((value) => value.replaceRange(start, end, "", false));
  }

  function onPasteCapture(event: ClipboardEvent): void {
    // Safari hands `beforeinput` only the plain text, so the tokens are read here.
    const data = event.clipboardData;
    if (data !== null && [...data.types].includes(CLIPBOARD_MIME_TYPE)) {
      transferred = parseSegments(data.getData(CLIPBOARD_MIME_TYPE));
    }
  }

  function onDrop(event: DragEvent): void {
    const root = element();
    if (root === null) return;
    const doc = root.ownerDocument as Document & CaretDocument;
    if (typeof doc.caretPositionFromPoint === "function") {
      const position = doc.caretPositionFromPoint(event.clientX, event.clientY);
      if (position !== null) dropPosition = getPosition(root, position.offsetNode, position.offset);
    } else if (typeof doc.caretRangeFromPoint === "function") {
      const range = doc.caretRangeFromPoint(event.clientX, event.clientY);
      if (range !== null) dropPosition = getPosition(root, range.startContainer, range.startOffset);
    }
    const data = event.dataTransfer;
    if (data !== null && [...data.types].includes(CLIPBOARD_MIME_TYPE)) {
      transferred = parseSegments(data.getData(CLIPBOARD_MIME_TYPE));
    }
  }

  function onBlur(event: FocusEvent): void {
    // A blur the page dispatched itself is not the user leaving.
    if (!event.isTrusted) return;
    const root = element();
    const selection = root === null ? null : selectionOf(root);
    if (
      root !== null &&
      selection !== null &&
      selection.containsNode(root, true) &&
      !selection.isCollapsed
    ) {
      selection.removeAllRanges();
      state.setValue((value) => value.withSelectedRange(new SelectedRange(value.caretPosition)));
    }
  }

  function onMouseDown(event: MouseEvent): void {
    // A triple click selects the line, tokens included; some browsers stop at a token.
    if (event.detail !== 3) return;
    const root = element();
    const selection = root === null ? null : getTokenFieldSelection(root);
    if (root === null || selection === null) return;
    const value = untrack(state.value);
    const start = value.findLineBoundary(selection[0], TokenDirection.Backward);
    const end = value.findLineBoundary(selection[1], TokenDirection.Forward);
    if (start === null || end === null) return;
    event.preventDefault();
    setTokenFieldSelection(root, new SelectedRange(start, end), true);
  }

  if (!isServer) {
    createEffect(element, (root) => {
      if (root === null) return undefined;
      const onCompositionStart: () => void = () => {
        startComposition();
        const selection = selectionOf(root);
        if (selection === null || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        const [start, end] = rangeToPositions(root, range);
        // Never inside a token, or the composed text is written into it.
        const normal = createDOMRange(root, start, end);
        if (
          normal.startContainer !== range.startContainer ||
          normal.startOffset !== range.startOffset
        ) {
          range.setStart(normal.startContainer, normal.startOffset);
        }
        if (normal.endContainer !== range.endContainer || normal.endOffset !== range.endOffset) {
          range.setEnd(normal.endContainer, normal.endOffset);
        }
      };
      const listeners: [string, EventListener][] = [
        ["compositionstart", onCompositionStart],
        ["compositionend", stopComposition],
        ["beforeinput", onBeforeInput as EventListener],
        ["copy", writeClipboard as EventListener],
        ["cut", writeClipboard as EventListener],
        ["dragstart", writeClipboard as EventListener],
        ["paste", onPasteCapture as EventListener],
        ["drop", onDrop as EventListener],
        ["blur", onBlur as EventListener],
        ["mousedown", onMouseDown as EventListener],
      ];
      for (const [type, listener] of listeners) root.addEventListener(type, listener);
      return () => {
        for (const [type, listener] of listeners) root.removeEventListener(type, listener);
      };
    });

    // A value arriving from outside mid-composition ends it, so it is drawn.
    createEffect(state.value, (value) => {
      if (untrack(state.isComposing) && value !== expected) stopComposition();
      expected = value;
    });

    // The caret follows the value, once the DOM has been drawn from it.
    let applied: SelectedRange | null = null;
    createEffect(
      () => ({ value: state.value(), root: element(), composing: state.isComposing() }),
      ({ value, root, composing }) => {
        if (root === null || composing || value.selectedRange === applied) return;
        applied = value.selectedRange;
        // Only when focused: a value set while the user is elsewhere must not
        // take the selection, or focus, away from there.
        if (root !== activeElement(ownerDocument(root))) return;
        setTokenFieldSelection(root, value.selectedRange);
        announceToken(value);
        scrollCaretIntoView(root);
      },
    );

    createEffect(element, (root) => {
      if (root === null) return undefined;
      const doc = ownerDocument(root);
      const onSelectionChange: () => void = () => {
        const marked = root as HTMLElement & Marked;
        if (marked[PROGRAMMATIC] === true) {
          marked[PROGRAMMATIC] = false;
          return;
        }
        const selection = selectionOf(root);
        if (selection === null || selection.rangeCount === 0) return;
        if (!selection.getRangeAt(0).intersectsNode(root)) return;
        if (untrack(state.isComposing)) return;

        const value = untrack(state.value);
        value.endCoalescing();
        const range = getTokenFieldSelectedRange(root);
        if (range === null) return;
        announceToken(value, range);
        state.setValue((current) => current.withSelectedRange(range));
      };
      doc.addEventListener("selectionchange", onSelectionChange);
      return () => doc.removeEventListener("selectionchange", onSelectionChange);
    });
  }

  /** Move the caret as the browser would, but past a token in one step. */
  function moveSelection(
    direction: "left" | "right",
    granularity: "character" | "word",
    extend = false,
  ): boolean {
    const root = element();
    const selection: ModifiableSelection | null = root === null ? null : selectionOf(root);
    if (
      root === null ||
      selection === null ||
      typeof selection.modify !== "function" ||
      selection.rangeCount === 0 ||
      selection.focusNode === null ||
      selection.anchorNode === null
    ) {
      return false;
    }
    // A selection collapses to its edge on an arrow, which the browser does itself.
    if (!extend && !selection.isCollapsed) return false;

    const from = getPosition(root, selection.focusNode, selection.focusOffset);
    // The browser's own movement, for bidirectional text, repeated until the
    // value position changes: the zero-width spaces are positions too.
    for (;;) {
      const focusNode: Node | null = selection.focusNode;
      const focusOffset: number = selection.focusOffset;
      selection.modify(extend ? "extend" : "move", direction, granularity);
      if (selection.focusNode === focusNode && selection.focusOffset === focusOffset) return false;
      if (selection.focusNode === null) return false;
      const to = getPosition(root, selection.focusNode, selection.focusOffset);
      if (!isSamePosition(from, to)) return true;
    }
  }

  function toLineEdge(direction: TokenDirection): boolean {
    const root = element();
    const selection = root === null ? null : getTokenFieldSelection(root);
    if (root === null || selection === null) return false;
    const boundary = untrack(state.value).findLineBoundary(
      direction === TokenDirection.Backward ? selection[0] : selection[1],
      direction,
    );
    if (boundary === null) return false;
    setTokenFieldSelection(root, new SelectedRange(boundary), true);
    return true;
  }

  function history(step: "undo" | "redo"): boolean {
    // The browser's own undo is the one that knows about the composition.
    if (untrack(state.isComposing)) return false;
    apply((value) => (step === "undo" ? value.undo() : value.redo()));
    return true;
  }

  const word = isMac() ? "Alt" : "Control";
  const shortcuts: KeyboardShortcutBindings = {
    ...(isMac()
      ? {
          "Control+a": () => toLineEdge(TokenDirection.Backward),
          "Control+e": () => toLineEdge(TokenDirection.Forward),
          "Control+f": () => moveSelection("right", "character"),
          "Control+b": () => moveSelection("left", "character"),
        }
      : {}),
    "Mod+z": () => history("undo"),
    [isMac() ? "Shift+Meta+z" : "Control+y"]: () => history("redo"),
    ArrowLeft: () => moveSelection("left", "character"),
    [`${word}+ArrowLeft`]: () => moveSelection("left", "word"),
    "Shift+ArrowLeft": () => moveSelection("left", "character", true),
    [`Shift+${word}+ArrowLeft`]: () => moveSelection("left", "word", true),
    ArrowRight: () => moveSelection("right", "character"),
    [`${word}+ArrowRight`]: () => moveSelection("right", "word"),
    "Shift+ArrowRight": () => moveSelection("right", "character", true),
    [`Shift+${word}+ArrowRight`]: () => moveSelection("right", "word", true),
    Home: () => toLineEdge(TokenDirection.Backward),
    End: () => toLineEdge(TokenDirection.Forward),
  };

  const { keyboardProps } = keyboard({
    isDisabled: () => isDisabled() || isReadOnly(),
    onKeyDown: options.onKeyDown,
    onKeyUp: options.onKeyUp,
    shortcuts,
    allowRepeats: true,
  });

  const { focusableProps } = focusable(
    { ...options, onKeyDown: undefined, onKeyUp: undefined },
    ref,
  );
  const { labelProps, fieldProps, descriptionProps, errorMessageProps } = field({
    ...options,
    labelElementType: "span",
  });

  return {
    descriptionProps,
    errorMessageProps,
    labelProps: mergeProps(labelProps, {
      onClick: () => {
        if (isDisabled()) return;
        element()?.focus();
        // The ring, so the user can see where the click sent them.
        setInteractionModality("keyboard");
      },
    }),
    tokenFieldProps: mergeProps(focusableProps, keyboardProps, fieldProps, {
      onPaste: options.onPaste,
      onCopy: options.onCopy,
      onCut: options.onCut,
      contenteditable: () => (isDisabled() || isReadOnly() ? "false" : "true"),
      role: () => access(options.role) ?? "textbox",
      "aria-multiline": () => multiline(),
      "aria-details": () => access(options["aria-details"]),
      "aria-readonly": () => isReadOnly() || undefined,
      "aria-disabled": () => isDisabled() || undefined,
      tabIndex: () =>
        isDisabled()
          ? undefined
          : access(focusableProps.tabIndex as MaybeAccessor<number | undefined>),
      style: { "white-space": "pre-wrap" },
    }),
  };
}

export interface TokenResult {
  tokenProps: DOMProps;
  isSelected: Accessor<boolean>;
}

/** One token: not editable, selected whole, and selected by a screen reader's click. */
export function token(ref: ElementRef<HTMLElement>): TokenResult {
  const [isSelected, setSelected] = createSignal(false);

  if (!isServer) {
    createEffect(
      () => (access(ref) as HTMLElement | null) ?? null,
      (element) => {
        if (element === null) return undefined;
        const doc = ownerDocument(element);
        const onSelectionChange: () => void = () => {
          const selection = selectionOf(element);
          const range =
            selection === null || selection.rangeCount === 0 ? null : selection.getRangeAt(0);
          setSelected(range !== null && !range.collapsed && range.intersectsNode(element));
        };
        doc.addEventListener("selectionchange", onSelectionChange);
        return () => doc.removeEventListener("selectionchange", onSelectionChange);
      },
    );
  }

  return {
    isSelected,
    tokenProps: {
      contenteditable: "false",
      style: {
        "user-select": "all",
        "-webkit-user-select": "all",
        "-webkit-tap-highlight-color": "transparent",
      },
      onClick: (event: MouseEvent) => {
        if (untrack(isSelected) || !isVirtualClick(event)) return;
        const element = (access(ref) as HTMLElement | null) ?? null;
        const wrapper = element?.parentNode ?? null;
        const selection = element === null ? null : selectionOf(element);
        if (element === null || wrapper === null || selection === null) return;
        const range = element.ownerDocument.createRange();
        range.setStartBefore(wrapper);
        range.setEndAfter(wrapper);
        selection.removeAllRanges();
        selection.addRange(range);
      },
    },
  };
}

interface AdoptingRoot {
  adoptedStyleSheets?: CSSStyleSheet[];
}

/**
 * Hide the browser's highlight of a selected token, which `user-select: all`
 * draws over the token's own styling. A nearly transparent colour, because
 * Firefox ignores a fully transparent one.
 */
function insertSelectionStyle(element: Element): (() => void) | undefined {
  if (typeof CSSStyleSheet !== "function") return undefined;
  const root = element.getRootNode() as (Document | ShadowRoot) & AdoptingRoot;
  if (root.adoptedStyleSheets === undefined) return undefined;
  const marker = Symbol.for("barq.tokenfield.selectionStyle");
  if (
    root.adoptedStyleSheets.some((sheet) => (sheet as unknown as Record<symbol, boolean>)[marker])
  ) {
    return undefined;
  }
  const sheet = new CSSStyleSheet();
  (sheet as unknown as Record<symbol, boolean>)[marker] = true;
  sheet.replaceSync(
    "[data-barq-token]::selection,[data-barq-token]>*::selection{background:#ffffff01}",
  );
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  return () => {
    const sheets = root.adoptedStyleSheets ?? [];
    root.adoptedStyleSheets = sheets.filter((each) => each !== sheet);
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface TokenInputValue {
  tokenFieldProps: DOMProps;
  /** An enclosing autocomplete's props for its field, merged after the field's own. */
  autocompleteProps: DOMProps;
  autocompleteRef: ((element: Element | null) => void) | undefined;
  state: TokenFieldState;
  isDisabled: Accessor<boolean>;
  isReadOnly: Accessor<boolean>;
  ref: ReturnType<typeof makeRef<HTMLDivElement>>;
}

const TokenInputContext = createContext<TokenInputValue | null>(null);

function useTokenInput(): TokenInputValue {
  const value = getContext(TokenInputContext);
  if (value === null || value === undefined) {
    throw new Error("A TokenInput and its Tokens must be rendered inside a TokenField.");
  }
  return value;
}

export interface TokenFieldComponentProps<
  V extends TokenFieldValue = TokenFieldValue,
> extends StyleProps {
  /** A {@link TokenInput}, with whatever else belongs inside the field. */
  children?: Child;
  label?: Child;
  description?: Child;
  errorMessage?: Child;
  value?: V;
  defaultValue?: V;
  /** @default "textbox" */
  role?: TokenFieldRole;
  allowsNewlines?: boolean;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isInvalid?: boolean;
  autoFocus?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-details"?: string;
  ref?: RefTarget<HTMLDivElement>;
  onChange?: (value: V) => void;
  onSubmit?: () => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  onKeyUp?: (event: KeyboardEvent) => void;
  onCopy?: (event: ClipboardEvent) => void;
  onCut?: (event: ClipboardEvent) => void;
  onPaste?: (event: ClipboardEvent) => void;
}

/**
 * ```tsx
 * <TokenField label="Message" defaultValue={new TokenFieldValue([{ type: "text", text: "Hi " }])}>
 *   <TokenInput>{(segment) => <Token>{segment.text}</Token>}</TokenInput>
 * </TokenField>
 * ```
 */
export function TokenField<V extends TokenFieldValue = TokenFieldValue>(
  props: TokenFieldComponentProps<V>,
) {
  const inputRef = makeRef<HTMLDivElement>();
  const options = fromProps(cells(props));
  // Inside an autocomplete, the text is its query. Only a change to the text
  // is one: a caret moving is a change to the value and not to the query.
  const autocomplete = useAutocompleteInput();
  let query = untrack(() => props.value ?? props.defaultValue)?.toString() ?? "";
  const state = tokenFieldState<V>({
    value: () => props.value,
    defaultValue: () => props.defaultValue,
    onChange: (value) => {
      props.onChange?.(value);
      const text = value.toString();
      if (autocomplete === null || text === query) return;
      query = text;
      autocomplete.inputOptions.onChange(text);
    },
  });

  const { tokenFieldProps, labelProps, descriptionProps, errorMessageProps } = tokenField(
    {
      ...(options as TokenFieldOptions),
      onSubmit: props.onSubmit === undefined ? undefined : () => props.onSubmit?.(),
    },
    state,
    inputRef,
  );

  const value: TokenInputValue = {
    tokenFieldProps,
    autocompleteProps: autocomplete?.inputProps ?? {},
    autocompleteRef: autocomplete?.ref,
    state: state as unknown as TokenFieldState,
    isDisabled: () => props.isDisabled === true,
    isReadOnly: () => props.isReadOnly === true,
    ref: inputRef,
  };

  const elementProps = mergeProps(
    filterDOMProps(options, { global: true, id: false }),
    styleProps(cells(props)),
    {
      "data-disabled": () => props.isDisabled === true,
      "data-readonly": () => props.isReadOnly === true,
      "data-testid": () => props["data-testid"],
    },
  );

  return (
    <div {...elementProps} ref={mergeRefs(props.ref)}>
      <span {...labelProps}>{props.label}</span>
      <TokenInputProvider value={value}>{props.children}</TokenInputProvider>
      <span {...descriptionProps}>{props.description}</span>
      <span {...errorMessageProps}>{props.errorMessage}</span>
    </div>
  );
}

function TokenInputProvider(props: ProviderProps<TokenInputValue>) {
  return provide(
    TokenInputContext,
    () => props.value,
    () => props.children as unknown,
  );
}

type SegmentRender = (segment: TokenSegment) => Child;

/** What the editable element holds: each segment, and a `<br>` after a trailing newline. */
type Drawn = TokenFieldSegment | { type: "break"; text: "" };

const BREAK: Drawn = { type: "break", text: "" };

export interface TokenInputComponentProps extends StyleProps {
  /** How a token is drawn. Return a {@link Token}. */
  children: SegmentRender;
  ref?: RefTarget<HTMLDivElement>;
  onHoverStart?: (event: HoverEvent) => void;
  onHoverEnd?: (event: HoverEvent) => void;
  onHoverChange?: (isHovered: boolean) => void;
}

/** The editable area of a {@link TokenField}. */
export function TokenInput(props: TokenInputComponentProps) {
  const held = useTokenInput();
  const { hoverProps, isHovered } = hover({
    onHoverStart: (event) => props.onHoverStart?.(event),
    onHoverEnd: (event) => props.onHoverEnd?.(event),
    onHoverChange: (isOver) => props.onHoverChange?.(isOver),
  });
  const { focusProps, isFocused, isFocusVisible } = focusRing();
  const render = props.children;

  // Nothing is redrawn while an input method composes: the DOM is the
  // browser's until it is done, and is put back and redrawn after.
  const drawn = createMemo((previous: Drawn[] | undefined): Drawn[] => {
    const segments = held.state.value().segments;
    if (previous !== undefined && held.state.isComposing()) return previous;
    const list: Drawn[] = [...segments];
    if (segments.at(-1)?.text.endsWith("\n") === true) list.push(BREAK);
    return list;
  });

  if (!isServer) {
    createEffect(held.ref, (element) =>
      element === null ? undefined : insertSelectionStyle(element),
    );
  }

  const elementProps = mergeProps(
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    focusProps,
    hoverProps,
    held.tokenFieldProps,
    held.autocompleteProps,
    {
      "data-hovered": isHovered,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-disabled": held.isDisabled,
      "data-readonly": held.isReadOnly,
      "data-testid": () => props["data-testid"],
      style: () => ({ ...props.style, "white-space": "pre-wrap" }),
    },
  );

  return (
    <div {...elementProps} ref={mergeRefs(held.ref.set, held.autocompleteRef, props.ref)}>
      <For each={drawn()}>
        {(segment: Drawn) =>
          segment.type === "text" ? (
            segment.text
          ) : segment.type === "break" ? (
            <br />
          ) : (
            // The zero-width spaces give the caret somewhere to stand.
            <span data-barq-token="">
              {ZERO_WIDTH_SPACE}
              {render(segment)}
              {ZERO_WIDTH_SPACE}
            </span>
          )
        }
      </For>
    </div>
  );
}

export interface TokenComponentProps extends StyleProps {
  children?: Child;
  ref?: RefTarget<HTMLSpanElement>;
}

/** A token inside a {@link TokenInput}. */
export function Token(props: TokenComponentProps) {
  const held = useTokenInput();
  const domRef = makeRef<HTMLSpanElement>();
  const { tokenProps, isSelected } = token(domRef);

  const elementProps = mergeProps(
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    tokenProps,
    {
      "data-selected": isSelected,
      "data-disabled": held.isDisabled,
      "data-testid": () => props["data-testid"],
      style: () => ({ ...props.style, ...(tokenProps.style as Record<string, string>) }),
    },
  );

  return (
    <span {...elementProps} ref={mergeRefs(domRef.set, props.ref)}>
      {props.children}
    </span>
  );
}
