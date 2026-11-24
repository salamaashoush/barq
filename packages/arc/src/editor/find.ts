/**
 * Finding words in a document's text. Arabic is written with optional vowel
 * marks and several forms of alef, so both what is sought and the text are
 * folded before comparing: a search for محمد finds مُحَمَّد. The fold keeps a
 * map back to the text's own offsets, so a match is shown and replaced where
 * it really is.
 */

import { $dfs } from "@lexical/utils";
import {
  $createRangeSelection,
  $isElementNode,
  $isTextNode,
  $setSelection,
  type NodeKey,
  type RangeSelection,
  type TextNode,
} from "lexical";

const MARKS = /[ً-ٰٟۖ-ۭـ]/u;
const ALEF = /[آأإٱ]/u;
const WORD = /[\p{L}\p{N}\p{M}\p{Pc}]/u;

export interface FindOptions {
  matchCase?: boolean;
  /** A match counts only where no letter or digit runs on either side of it. */
  wholeWords?: boolean;
}

interface Folded {
  text: string;
  /** For each folded character, where it starts in the original text. */
  starts: number[];
  /** For each folded character, where it ends in the original text. */
  ends: number[];
  /** For each folded character, whether it is part of a word. */
  words: boolean[];
}

function fold(text: string, matchCase: boolean): Folded {
  let folded = "";
  const starts: number[] = [];
  const ends: number[] = [];
  const words: boolean[] = [];
  let at = 0;
  for (const character of text) {
    const from = at;
    at += character.length;
    if (MARKS.test(character)) continue;
    const word = WORD.test(character);
    let kept = ALEF.test(character) ? "ا" : character === "ى" ? "ي" : character;
    if (!matchCase) {
      const lower = kept.toLocaleLowerCase();
      // A letter whose small form is longer would shift every offset after it.
      if (lower.length === kept.length) kept = lower;
    }
    for (let index = 0; index < kept.length; index++) {
      folded += kept[index];
      starts.push(from);
      ends.push(at);
      words.push(word);
    }
  }
  return { text: folded, starts, ends, words };
}

export interface TextRange {
  start: number;
  end: number;
}

/** Where a search is found in a text, as offsets into the text itself, none overlapping. */
export function findIn(
  text: string,
  query: string,
  { matchCase = false, wholeWords = false }: FindOptions = {},
): TextRange[] {
  const search = fold(query, matchCase);
  const sought = search.text;
  if (sought === "") return [];
  const folded = fold(text, matchCase);
  // Only an edge of the search that is itself a word needs a word's edge in
  // the text, so a search ending in a space or a full stop still finds.
  const openStart = wholeWords && search.words[0] === true;
  const openEnd = wholeWords && search.words.at(-1) === true;
  const found: TextRange[] = [];
  let from = folded.text.indexOf(sought);
  while (from >= 0) {
    const after = from + sought.length;
    const whole =
      !(openStart && folded.words[from - 1] === true) && !(openEnd && folded.words[after] === true);
    if (whole) found.push({ start: folded.starts[from] ?? 0, end: folded.ends[after - 1] ?? 0 });
    from = folded.text.indexOf(sought, whole ? after : from + 1);
  }
  return found;
}

interface Point {
  key: NodeKey;
  offset: number;
}

/** A match in the document, from where it starts to where it ends. */
export interface Found {
  anchor: Point;
  focus: Point;
}

/**
 * Every match in the document, in reading order. Text is searched a run at a
 * time, the neighbouring pieces of one line read together whether or not a
 * link holds some of them, so a word half in bold or half linked is found.
 */
export function $findInDocument(query: string, options: FindOptions = {}): Found[] {
  const runs: TextNode[][] = [];
  // Whether the text next met carries on the run before it: only a link's
  // own edges come between them, never a line break, a block or an object.
  let carries = false;
  for (const { node } of $dfs()) {
    if ($isTextNode(node)) {
      if (carries) runs.at(-1)?.push(node);
      else runs.push([node]);
      carries = true;
    } else carries &&= $isElementNode(node) && node.isInline();
  }
  const found: Found[] = [];
  for (const run of runs) {
    const starts: number[] = [];
    let text = "";
    for (const node of run) {
      starts.push(text.length);
      text += node.getTextContent();
    }
    // An end on the edge between two pieces belongs to the piece before it.
    function pointAt(at: number, end: boolean): Point {
      const index = Math.max(
        0,
        starts.findLastIndex((start) => (end ? start < at : start <= at)),
      );
      return { key: run[index]?.getKey() ?? "", offset: at - (starts[index] ?? 0) };
    }
    for (const { start, end } of findIn(text, query, options)) {
      found.push({ anchor: pointAt(start, false), focus: pointAt(end, true) });
    }
  }
  return found;
}

/** Selects a match in the text. */
export function $selectFound(match: Found): RangeSelection {
  const selection = $createRangeSelection();
  selection.anchor.set(match.anchor.key, match.anchor.offset, "text");
  selection.focus.set(match.focus.key, match.focus.offset, "text");
  $setSelection(selection);
  return selection;
}

/** Puts new words in place of matches, from the last, so each before it is still where it was found. */
export function $replaceFound(found: readonly Found[], replacement: string): void {
  for (const match of found.toReversed()) $selectFound(match).insertText(replacement);
}
