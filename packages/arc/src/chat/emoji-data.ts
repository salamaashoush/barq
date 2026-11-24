/**
 * The emoji the picker offers, from emojibase.
 *
 * emojibase is the dataset that follows Unicode's emoji list and CLDR's
 * annotations release by release, as plain JSON with no framework in it: each
 * emoji's group in Unicode's order, its name and search keywords, and its
 * skin-tone variations, in two dozen languages. Its compact file for one
 * language is loaded only when a picker first opens, so an app that never
 * shows one ships none of it, and one that does pays once.
 */

/** One emoji as emojibase's compact file writes it. */
export interface CompactEmoji {
  unicode: string;
  label: string;
  hexcode: string;
  group?: number;
  order?: number;
  tags?: readonly string[];
  skins?: readonly CompactEmoji[];
}

/**
 * Where a picker's emoji come from: a language's compact file, loaded on
 * demand for the locale the picker is read in, or the file's promise itself.
 */
export type EmojiSource =
  | ((locale: string) => Promise<readonly CompactEmoji[]>)
  | Promise<readonly CompactEmoji[]>;

/** One emoji the picker draws. */
export interface EmojiEntry {
  emoji: string;
  label: string;
  /** The group's key: `smileys-emotion`, `animals-nature`, ... */
  group: string;
  /** What a search matches: the name's words and the keywords, lowercased. */
  terms: readonly string[];
  /** The five skin tones, light to dark, where the emoji takes one. */
  skins?: readonly string[];
}

export interface EmojiGroup {
  key: string;
  emojis: readonly EmojiEntry[];
}

export interface EmojiDataset {
  groups: readonly EmojiGroup[];
  /** Every emoji by its default form and each of its toned forms. */
  byEmoji: ReadonlyMap<string, EmojiEntry>;
}

/** emojibase's groups by their index. `component` holds the bare tone swatches and is left out. */
const GROUPS = [
  "smileys-emotion",
  "people-body",
  "component",
  "animals-nature",
  "food-drink",
  "travel-places",
  "activities",
  "objects",
  "symbols",
  "flags",
] as const;

/** The five Fitzpatrick modifiers, light to dark. */
const TONES = ["1F3FB", "1F3FC", "1F3FD", "1F3FE", "1F3FF"] as const;

/**
 * English, emojibase's own. Another language is
 * `(locale) => import(\`emojibase-data/${locale}/compact.json\`)`, which a
 * bundler splits per file.
 */
export const englishEmoji = async (): Promise<readonly CompactEmoji[]> =>
  ((await import("emojibase-data/en/compact.json")) as { default: readonly CompactEmoji[] })
    .default;

/** The variation with exactly one tone, the `tone`th, if the emoji has one. */
function toned(skins: readonly CompactEmoji[], tone: string): string | undefined {
  for (const skin of skins) {
    const parts = skin.hexcode.split("-");
    const tones = parts.filter((part) => (TONES as readonly string[]).includes(part));
    if (tones.length === 1 && tones[0] === tone) return skin.unicode;
  }
  return undefined;
}

const words = (text: string): string[] =>
  text
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((one) => one !== "");

/** A compact file as the picker's groups, in Unicode's order. */
export function emojiDataset(compact: readonly CompactEmoji[]): EmojiDataset {
  const groups = new Map<string, EmojiEntry[]>();
  const byEmoji = new Map<string, EmojiEntry>();
  const sorted = compact.toSorted((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const one of sorted) {
    if (one.group === undefined) continue;
    const key = GROUPS[one.group];
    if (key === undefined || key === "component") continue;
    let skins: string[] | undefined;
    if (one.skins !== undefined && one.skins.length > 0) {
      const found = TONES.map((tone) => toned(one.skins ?? [], tone));
      if (found.every((skin): skin is string => skin !== undefined)) skins = found;
    }
    const entry: EmojiEntry = {
      emoji: one.unicode,
      label: one.label,
      group: key,
      terms: [...new Set([...words(one.label), ...(one.tags ?? []).flatMap(words)])],
      ...(skins === undefined ? {} : { skins }),
    };
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
    byEmoji.set(entry.emoji, entry);
    for (const skin of skins ?? []) byEmoji.set(skin, entry);
  }
  return {
    groups: GROUPS.filter((key) => groups.has(key)).map((key) => ({
      key,
      emojis: groups.get(key) ?? [],
    })),
    byEmoji,
  };
}

const loaded = new Map<EmojiSource, Map<string, Promise<EmojiDataset>>>();

/** A source's dataset for a locale, loaded and built once however many pickers ask. */
export function loadEmoji(
  source: EmojiSource = englishEmoji,
  locale = "en",
): Promise<EmojiDataset> {
  const byLocale = loaded.get(source) ?? new Map<string, Promise<EmojiDataset>>();
  loaded.set(source, byLocale);
  let held = byLocale.get(locale);
  if (held === undefined) {
    held = (typeof source === "function" ? source(locale) : source).then(emojiDataset);
    byLocale.set(locale, held);
    // A failed load is asked again next time rather than remembered.
    held.catch(() => byLocale.delete(locale));
  }
  return held;
}

/**
 * The emoji whose every query word starts one of its terms: "thumb up" finds
 * 👍, "cat" finds every cat.
 */
export function searchEmoji(dataset: EmojiDataset, query: string): EmojiEntry[] {
  const wanted = words(query);
  if (wanted.length === 0) return [];
  const out: EmojiEntry[] = [];
  for (const group of dataset.groups) {
    for (const entry of group.emojis) {
      if (wanted.every((word) => entry.terms.some((term) => term.startsWith(word)))) {
        out.push(entry);
      }
    }
  }
  return out;
}

/** The emoji in a skin tone, 0 for its default. */
export function withTone(entry: EmojiEntry, tone: number): string {
  if (tone <= 0) return entry.emoji;
  return entry.skins?.[tone - 1] ?? entry.emoji;
}
