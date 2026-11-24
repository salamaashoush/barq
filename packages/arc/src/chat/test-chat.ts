/**
 * What the chat suites share: a viewport given the geometry happy-dom does
 * not lay out, and emoji small enough to read in a failure.
 */

import type { CompactEmoji, EmojiSource } from "./emoji-data.ts";

export interface ViewportSize {
  height: number;
  width?: number;
  scrollHeight?: () => number;
}

/** A scroller with a height, a width and a position a browser would report. */
export function sizeViewport(element: HTMLElement, size: ViewportSize): void {
  let top = 0;
  Object.defineProperty(element, "clientHeight", { value: size.height, configurable: true });
  Object.defineProperty(element, "clientWidth", { value: size.width ?? 320, configurable: true });
  Object.defineProperty(element, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (next: number) => {
      const most =
        size.scrollHeight === undefined
          ? Number.POSITIVE_INFINITY
          : Math.max(0, size.scrollHeight() - size.height);
      top = Math.max(0, Math.min(most, next));
    },
  });
  if (size.scrollHeight !== undefined) {
    const read = size.scrollHeight;
    Object.defineProperty(element, "scrollHeight", { configurable: true, get: read });
  }
}

/** Move a scroller as a person would, and tell its listeners. */
export function scrollViewport(element: HTMLElement, top: number): void {
  element.scrollTop = top;
  element.dispatchEvent(new Event("scroll"));
}

function face(unicode: string, label: string, order: number, tags: string[] = []): CompactEmoji {
  return {
    unicode,
    label,
    hexcode: unicode.codePointAt(0)?.toString(16).toUpperCase() ?? "",
    group: 0,
    order,
    tags,
  };
}

export const SAMPLE_EMOJI: CompactEmoji[] = [
  face("😀", "grinning face", 1, ["smile", "happy"]),
  face("😃", "grinning face with big eyes", 2, ["smile"]),
  face("😄", "grinning face with smiling eyes", 3, ["smile"]),
  face("😁", "beaming face", 4, ["grin"]),
  face("😆", "grinning squinting face", 5, ["laugh"]),
  face("😅", "grinning face with sweat", 6, ["hot"]),
  face("🤣", "rolling on the floor laughing", 7, ["laugh"]),
  face("😂", "face with tears of joy", 8, ["laugh"]),
  face("🙂", "slightly smiling face", 9, ["smile"]),
  {
    unicode: "👋",
    label: "waving hand",
    hexcode: "1F44B",
    group: 1,
    order: 20,
    tags: ["hello", "wave"],
    skins: ["1F3FB", "1F3FC", "1F3FD", "1F3FE", "1F3FF"].map((tone, at) => ({
      unicode: `👋${String.fromCodePoint(Number.parseInt(tone, 16))}`,
      label: `waving hand: tone ${String(at + 1)}`,
      hexcode: `1F44B-${tone}`,
      group: 1,
      order: 21 + at,
    })),
  },
  { unicode: "🏻", label: "light skin tone", hexcode: "1F3FB", group: 2, order: 30 },
  { unicode: "🐱", label: "cat face", hexcode: "1F431", group: 3, order: 40, tags: ["cat", "pet"] },
  { unicode: "🐈", label: "cat", hexcode: "1F408", group: 3, order: 41, tags: ["pet"] },
  { unicode: "🐶", label: "dog face", hexcode: "1F436", group: 3, order: 42, tags: ["dog", "pet"] },
  { unicode: "🍕", label: "pizza", hexcode: "1F355", group: 4, order: 50, tags: ["cheese"] },
];

/** A source that resolves on the next tick, as an import would. */
export function sampleSource(emoji: readonly CompactEmoji[] = SAMPLE_EMOJI): EmojiSource {
  return (_locale: string) => new Promise((resolve) => setTimeout(() => resolve(emoji), 0));
}
