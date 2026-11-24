import { afterEach, describe, expect, test } from "bun:test";
import { type Child } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { arabicEmoji, emojiDataset, englishEmoji, searchEmoji, withTone } from "./emoji-data.ts";
import { EmojiPicker } from "./emoji-picker.tsx";
import { type CompactEmoji } from "./emoji-data.ts";
import { SAMPLE_EMOJI, sampleSource, scrollViewport, sizeViewport } from "./test-chat.ts";

afterEach(() => localStorage.clear());

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

function count(name: string): number {
  return document.querySelectorAll(`[data-slot="${name}"]`).length;
}

/** The picker once its emoji are in and its grid is given a browser's height. */
async function opened(height = 360): Promise<HTMLElement> {
  await waitFor(() => expect(count("emoji-picker-viewport")).toBe(1));
  const viewport = slot("emoji-picker-viewport");
  sizeViewport(viewport, { height });
  scrollViewport(viewport, 0);
  await settle();
  return viewport;
}

const search = (): HTMLInputElement => screen.getByRole<HTMLInputElement>("combobox");
const activeLabel = (): string | null => {
  const id = search().getAttribute("aria-activedescendant");
  return id === null ? null : (document.getElementById(id)?.getAttribute("aria-label") ?? null);
};

describe("EmojiPicker", () => {
  test("loads its emoji on mount, then lists them under their groups", async () => {
    render(() => <EmojiPicker source={sampleSource()} onSelect={() => {}} />);
    expect(slot("emoji-picker-loading").textContent).toContain("Loading emoji");
    await opened();
    expect(
      [...document.querySelectorAll('[data-slot="emoji-picker-heading"]')].map(
        (one) => one.textContent,
      ),
    ).toEqual(["Smileys & emotion", "People & body", "Animals & nature", "Food & drink"]);
    // The bare tone swatches are not offered as emoji.
    expect(screen.queryAllByRole("option", { name: "light skin tone" })).toHaveLength(0);
    expect(screen.getByRole("listbox", { name: "Choose an emoji" })).toBeDefined();
    expect(screen.getAllByRole("button", { name: /Smileys|People|Animals|Food/u }).length).toBe(4);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a search narrows to what matches, and Enter chooses the first", async () => {
    const chosen: string[] = [];
    render(() => <EmojiPicker source={sampleSource()} onSelect={(emoji) => chosen.push(emoji)} />);
    await opened();
    await user.type(search(), "cat");
    await settle();
    expect(screen.getAllByRole("option").map((one) => one.getAttribute("aria-label"))).toEqual([
      "cat face",
      "cat",
    ]);
    expect(activeLabel()).toBe("cat face");
    user.keyboard("{Enter}");
    expect(chosen).toEqual(["🐱"]);
    await user.clear(search());
    await user.type(search(), "zebra");
    await settle();
    expect(slot("emoji-picker-empty").textContent).toBe("No emoji found");
  });

  test("the arrows move through the grid, a row at a time up and down", async () => {
    render(() => <EmojiPicker source={sampleSource()} columns={4} onSelect={() => {}} />);
    await opened();
    search().focus();
    user.keyboard("{ArrowDown}");
    expect(activeLabel()).toBe("grinning face");
    user.keyboard("{ArrowRight}{ArrowRight}");
    expect(activeLabel()).toBe("grinning face with smiling eyes");
    user.keyboard("{ArrowDown}");
    expect(activeLabel()).toBe("rolling on the floor laughing");
    user.keyboard("{ArrowLeft}");
    expect(activeLabel()).toBe("grinning face with sweat");
    // Past the end of a row is the start of the next.
    user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(activeLabel()).toBe("slightly smiling face");
    user.keyboard("{ArrowUp}");
    expect(activeLabel()).toBe("grinning squinting face");
  });

  test("right to left, the arrows follow the reading direction", async () => {
    function Arabic(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <EmojiPicker source={sampleSource()} columns={4} onSelect={() => {}} />
      </Arabic>
    ));
    await opened();
    search().focus();
    user.keyboard("{ArrowDown}{ArrowLeft}");
    expect(activeLabel()).toBe("grinning face with big eyes");
    user.keyboard("{ArrowRight}");
    expect(activeLabel()).toBe("grinning face");
  });

  test("a skin tone chosen once is used for every emoji that takes one, and remembered", async () => {
    const chosen: string[] = [];
    render(() => (
      <EmojiPicker
        source={sampleSource()}
        storageKey="t"
        onSelect={(emoji) => chosen.push(emoji)}
      />
    ));
    await opened();
    await user.click(screen.getByRole("button", { name: "Skin tone: Default" }));
    await settle();
    await user.click(screen.getByRole("menuitemradio", { name: "Medium" }));
    await settle();
    const hand = screen.getByRole("option", { name: "waving hand" });
    expect(hand.textContent).toBe("👋🏽");
    await user.click(hand);
    expect(chosen).toEqual(["👋🏽"]);
    expect(JSON.parse(localStorage.getItem("t:tone") ?? "0")).toBe(3);
  });

  test("what was chosen comes first next time, under Recently used", async () => {
    localStorage.setItem("r:recent", JSON.stringify(["🍕", "🐶"]));
    render(() => <EmojiPicker source={sampleSource()} storageKey="r" onSelect={() => {}} />);
    await opened();
    const headings = document.querySelectorAll('[data-slot="emoji-picker-heading"]');
    expect(headings[0]?.textContent).toBe("Recently used");
    const first = screen.getAllByRole("option").slice(0, 2);
    expect(first.map((one) => one.textContent)).toEqual(["🍕", "🐶"]);
  });

  test("draws only the rows on screen, and a category jumps to its group", async () => {
    const many: CompactEmoji[] = Array.from({ length: 400 }, (_, at) => ({
      unicode: String.fromCodePoint(0x1f300 + at),
      label: `symbol ${String(at)}`,
      hexcode: (0x1f300 + at).toString(16),
      group: at < 200 ? 0 : 7,
      order: at,
    }));
    render(() => <EmojiPicker source={sampleSource(many)} onSelect={() => {}} />);
    const viewport = await opened(180);
    const drawn = screen.getAllByRole("option").length;
    expect(drawn).toBeGreaterThan(0);
    expect(drawn).toBeLessThan(120);
    const objects = screen.getByRole("button", { name: "Objects" });
    await user.click(objects);
    viewport.dispatchEvent(new Event("scroll"));
    await settle();
    // 200 emoji in rows of 8 under one heading is 26 rows of 36px.
    expect(viewport.scrollTop).toBe(26 * 36);
    expect(objects.getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("option", { name: "symbol 200" })).toBeDefined();
    scrollViewport(viewport, 0);
    await settle();
    expect(screen.queryAllByRole("option", { name: "symbol 300" })).toHaveLength(0);
  });

  test("takes a class per part", async () => {
    render(() => (
      <EmojiPicker
        source={sampleSource()}
        onSelect={() => {}}
        class="mine"
        classes={{
          root: "r",
          header: "h",
          categories: "c",
          viewport: "v",
          cell: "e",
          heading: "g",
        }}
      />
    ));
    await opened();
    const pairs = [
      ["emoji-picker", "r"],
      ["emoji-picker-header", "h"],
      ["emoji-picker-categories", "c"],
      ["emoji-picker-viewport", "v"],
      ["emoji-picker-emoji", "e"],
      ["emoji-picker-heading", "g"],
    ] as const;
    for (const [name, cls] of pairs) expect(slot(name).classList.contains(cls)).toBe(true);
    expect(slot("emoji-picker").classList.contains("mine")).toBe(true);
  });

  test("a server writes the search and the loading state, which the browser hydrates", async () => {
    const result = await hydrates(`
      import { EmojiPicker } from ${JSON.stringify(new URL("./index.ts", import.meta.url).pathname)};
      export function Page() {
        return <EmojiPicker source={new Promise(() => {})} onSelect={() => {}} />;
      }
    `);
    expect(result.container.querySelector('[data-slot="emoji-picker-loading"]')).not.toBeNull();
    result.unmount();
  });
});

describe("the emoji dataset", () => {
  test("emojibase's English file, grouped, with every tone of a hand", async () => {
    const data = emojiDataset(await englishEmoji());
    expect(data.groups.map((group) => group.key)).toEqual([
      "smileys-emotion",
      "people-body",
      "animals-nature",
      "food-drink",
      "travel-places",
      "activities",
      "objects",
      "symbols",
      "flags",
    ]);
    const hand = data.byEmoji.get("👋");
    expect(hand?.skins).toHaveLength(5);
    expect(withTone(hand ?? { emoji: "", label: "", group: "", terms: [] }, 5)).toBe("👋🏿");
    expect(data.byEmoji.get("👋🏽")?.emoji).toBe("👋");
    expect(searchEmoji(data, "thumbs up")[0]?.emoji).toBe("👍");
  });

  test("a sample builds the same way", () => {
    const data = emojiDataset(SAMPLE_EMOJI);
    expect(searchEmoji(data, "pet").map((one) => one.emoji)).toEqual(["🐱", "🐈", "🐶"]);
    expect(searchEmoji(data, "  ")).toEqual([]);
  });
});

describe("Arabic emoji names", () => {
  test("CLDR's Arabic names over emojibase's list, found as people type them", async () => {
    const [english, arabic] = await Promise.all([englishEmoji(), arabicEmoji()]);
    expect(arabic).toHaveLength(english.length);
    const dataset = emojiDataset(arabic);
    const wave = dataset.byEmoji.get("👋");
    expect(wave?.label).toBe("تلويح باليد");
    expect(wave?.skins).toHaveLength(5);
    // Typed with or without the hamza, the keyword is the same word.
    expect(searchEmoji(dataset, "أهلا").map((one) => one.emoji)).toContain("👋");
    expect(searchEmoji(dataset, "اهلا").map((one) => one.emoji)).toContain("👋");
    expect(searchEmoji(dataset, "قطة").length).toBeGreaterThan(0);
  });

  test("a picker in Arabic reads them", async () => {
    function Arabic() {
      provideLocale("ar-EG");
      return (
        <div dir="rtl">
          <EmojiPicker source={arabicEmoji} onSelect={() => {}} />
        </div>
      );
    }
    render(() => <Arabic />);
    await opened();
    await user.type(search(), "تلويح");
    await settle();
    expect(screen.getAllByRole("option")[0]?.getAttribute("aria-label")).toBe("تلويح باليد");
  });
});
