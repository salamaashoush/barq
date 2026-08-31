/**
 * The published entries must share ONE module instance each.
 *
 * A great deal of this package is module state, and all of it exists so that a
 * page pays for one of something rather than one per component: the focus
 * scope tree in `focus.ts`, the modality listeners and the patched
 * `HTMLElement.prototype.focus` in `interactions/modality.ts`, the single
 * `aria-live` region in `live.ts`, the description nodes reference-counted in
 * `interactions/description.ts`, and the overlay stack in `overlays.ts`.
 *
 * Bundle `@barqjs/aria` and `@barqjs/aria/focus` separately and every one of
 * those doubles. Two scope trees mean a nested modal restores focus to the
 * wrong place; two announcer regions mean a screen reader hears everything
 * twice; two overlay stacks mean Escape closes nothing.
 *
 * This package publishes SOURCE — a compiled component is specific to one
 * backend and one `hydratable`, so a consumer compiles it — and every entry
 * therefore resolves to one file on disk. That is what makes the property hold,
 * and this is what says it still does: two entries reached separately must hand
 * back the same binding and touch the same module state.
 *
 * It used to run against `dist` and skip when the package was not built. When
 * `dist` stopped existing the whole file went quiet rather than failing, which
 * is the worse of the two.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

const ENTRIES = [
  "index",
  "breadcrumbs",
  "button",
  "calendar",
  "checkbox",
  "collections",
  "color",
  "colorpicker",
  "combobox",
  "date",
  "datefield",
  "datepicker",
  "dialog",
  "disclosure",
  "dom",
  "focus",
  "form",
  "gridlist",
  "i18n",
  "interactions",
  "label",
  "link",
  "listbox",
  "live",
  "menu",
  "numberfield",
  "overlays",
  "platform",
  "presence",
  "radio",
  "select",
  "selection",
  "slider",
  "switch",
  "table",
  "tabs",
  "tag",
  "textfield",
  "toggle",
  "toolbar",
  "tooltip",
  "utils",
  "validation",
  "virtualizer",
] as const;

/**
 * Where an entry actually lives, out of the export map rather than guessed.
 *
 * Half of these are `.tsx`, and the map is the published surface — so reading
 * it here means the test checks the entries a consumer can reach rather than a
 * list that has to be kept in step by hand.
 */
const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
) as { exports: Record<string, { barq?: string }> };

const entryOf = (entry: string): string => {
  const key = entry === "index" ? "." : `./${entry}`;
  const source = manifest.exports[key]?.barq;
  if (source === undefined) throw new Error(`${key} is not in the export map`);
  return fileURLToPath(new URL(`../${source}`, import.meta.url));
};

describe("the published entries share one runtime", () => {
  test("a name exported by two entries is the SAME binding in both", async () => {
    const loaded = await Promise.all(
      ENTRIES.map(async (entry) => [entry, await import(entryOf(entry))] as const),
    );

    const split: string[] = [];
    for (const [index, [leftName, left]] of loaded.entries()) {
      for (const [rightName, right] of loaded.slice(index + 1)) {
        const exports = left as Record<string, unknown>;
        for (const name of Object.keys(exports)) {
          if (!(name in right)) continue;
          const value = exports[name];
          if (typeof value !== "function" && typeof value !== "symbol") continue;
          if (value !== (right as Record<string, unknown>)[name]) {
            split.push(`${name}: ${leftName} !== ${rightName}`);
          }
        }
      }
    }

    expect(split, "these entries were bundled separately and hold separate state").toEqual([]);
  });

  test("the announcer reached through two entries is one region", async () => {
    const root = (await import(entryOf("index"))) as unknown as {
      announce: (message: string) => void;
      destroyAnnouncer: () => void;
    };
    const live = (await import(entryOf("live"))) as typeof root;

    // Counted as a DELTA. Other suites in this process announce and do not
    // always tear down, so the absolute number says nothing.
    root.destroyAnnouncer();
    const before = document.querySelectorAll("[aria-live]").length;
    try {
      root.announce("first");
      const afterRoot = document.querySelectorAll("[aria-live]").length;
      live.announce("second");
      const afterLive = document.querySelectorAll("[aria-live]").length;

      expect(afterRoot, "the root barrel did not build the announcer").toBeGreaterThan(before);
      expect(afterLive, "./live built a SECOND announcer").toBe(afterRoot);
    } finally {
      root.destroyAnnouncer();
    }
  });

  test("the root barrel re-exports every entry's own names", async () => {
    const root = (await import(entryOf("index"))) as Record<string, unknown>;

    const missing: string[] = [];
    for (const entry of ENTRIES) {
      if (entry === "index") continue;
      const module_ = (await import(entryOf(entry))) as Record<string, unknown>;
      for (const name of Object.keys(module_)) {
        if (!(name in root)) missing.push(`${entry}: ${name}`);
      }
    }

    expect(missing, "src/index.ts is out of date with these modules").toEqual([]);
  });
});
