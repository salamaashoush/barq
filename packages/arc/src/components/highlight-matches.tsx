import { For } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { filter } from "@barqjs/aria/i18n";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, type } from "../style/index.ts";

export const highlightMatchesStyles = variants({
  slots: {
    root: arc({}),
    mark: arc(fg.inherit, type.strong, { backgroundColor: "var(--selection)" }),
  },
});

type Slots = ReturnType<typeof highlightMatchesStyles>;

/** `[start, end)` offsets into a text, as a search marks them. */
export type MatchRange = readonly [number, number];

interface Piece {
  text: string;
  marked: boolean;
}

/** Overlapping and touching ranges as one, in order. */
function merged(ranges: readonly MatchRange[]): MatchRange[] {
  const sorted = ranges.toSorted((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = out.at(-1);
    if (last !== undefined && start <= last[1]) last[1] = Math.max(last[1], end);
    else out.push([start, end]);
  }
  return out;
}

function pieces(text: string, ranges: readonly MatchRange[]): Piece[] {
  const out: Piece[] = [];
  let at = 0;
  for (const [start, end] of merged(ranges)) {
    const from = Math.max(start, at);
    const to = Math.min(end, text.length);
    if (from >= to) continue;
    if (from > at) out.push({ text: text.slice(at, from), marked: false });
    out.push({ text: text.slice(from, to), marked: true });
    at = to;
  }
  if (at < text.length) out.push({ text: text.slice(at), marked: false });
  return out;
}

export interface HighlightMatchesProps extends Customisable<Slots> {
  text: string;
  /** What was searched for. Each word is marked wherever it matches. */
  query?: string;
  /** Ranges a search service already found, marked instead of matching `query`. */
  ranges?: readonly MatchRange[];
}

/**
 * A text with what a search matched marked, as a `<mark>` a screen reader
 * passes over and a forced-colours mode still shows.
 *
 * ```tsx
 * <HighlightMatches text={result.title} query={search()} />
 * ```
 *
 * Each word of `query` matches in the locale's own way, so "resume" marks
 * "Résumé"; `ranges` takes a search service's own.
 */
export function HighlightMatches(props: HighlightMatchesProps) {
  const cls = (): Slots => parts(highlightMatchesStyles(), props.classes);
  const match = filter({ sensitivity: "base" });
  const text = (): string => props.text.normalize("NFC");
  const found = (): MatchRange[] => {
    if (props.ranges !== undefined) return [...props.ranges];
    const words = (props.query ?? "").trim().split(/\s+/u);
    return words.flatMap((word) => match.matches(text(), word));
  };
  return (
    <span class={arc(cls().root, props.class, props.className)} data-slot="highlight-matches">
      <For each={pieces(text(), found())}>
        {(piece: Piece) =>
          piece.marked ? (
            <mark class={cls().mark} data-slot="highlight-matches-mark">
              {piece.text}
            </mark>
          ) : (
            piece.text
          )
        }
      </For>
    </span>
  );
}
