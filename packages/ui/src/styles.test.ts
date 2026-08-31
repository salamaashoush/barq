/**
 * The eight stylesheets, and the parse that produces them.
 *
 * `tools/styles.ts` translates 3,360 semantic classes across eight styles, and
 * a utility that resolves to nothing is invisible from the outside — the
 * component simply loses part of its look. The tool fails when Tailwind
 * answers with nothing; this checks the files it wrote are still whole.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { parseStyle } from "../tools/styles.ts";

const STYLES = resolve(import.meta.dir, "../styles");
const names = readdirSync(STYLES)
  .filter((entry) => entry.endsWith(".css"))
  .toSorted();

describe("parseStyle", () => {
  test("reads a slot's whole class list", () => {
    const parsed = parseStyle(
      [
        ".style-vega {",
        "  /* MARK: Button */",
        "  .cn-button {",
        "    @apply rounded-md border text-sm;",
        "  }",
        "",
        "  .cn-button-variant-ghost {",
        "    @apply hover:bg-muted;",
        "    @apply hover:text-foreground;",
        "  }",
        "}",
      ].join("\n"),
    );

    expect([...parsed.keys()]).toEqual(["cn-button", "cn-button-variant-ghost"]);
    expect(parsed.get("cn-button")).toBe("rounded-md border text-sm");
    // Two `@apply` lines are one class list: upstream splits them for reading.
    expect(parsed.get("cn-button-variant-ghost")).toBe("hover:bg-muted hover:text-foreground");
  });

  test("a class with no `@apply` of its own is not a slot", () => {
    expect(parseStyle(".style-vega {\n  .cn-empty {\n  }\n}").size).toBe(0);
  });
});

describe("the generated stylesheets", () => {
  test("are all eight of shadcn's styles", () => {
    expect(names).toEqual([
      "luma.css",
      "lyra.css",
      "maia.css",
      "mira.css",
      "nova.css",
      "rhea.css",
      "sera.css",
      "vega.css",
    ]);
  });

  for (const file of names) {
    test(`${file} is scoped, layered and full`, () => {
      const sheet = readFileSync(join(STYLES, file), "utf8");
      const style = file.replace(/\.css$/, "");

      // `barq.style` and not `barq.ui`: a style is a second opinion about how
      // every component looks and has to beat the component's own rules, which
      // a LATER layer does without either side counting specificity.
      expect(sheet).toContain("@layer barq.style {");
      expect(sheet).toContain(`.style-${style} {`);

      // `[data-slot]` and not `.cn-*`. Upstream writes the look against a
      // semantic class it puts on the element; this package has put a
      // `data-slot` on every element since before styles existed, and they name
      // the same thing — so a style needs no component change at all.
      expect(sheet).toContain('[data-slot="button"] {');
      expect(sheet).not.toContain(".cn-button {");

      // Two hundred-odd rules, not an empty shell from a failed run. Fewer than
      // the four hundred upstream declares, because a class naming a slot no
      // component here renders reaches nothing and `tools/styles.ts` says which.
      const rules = [...sheet.matchAll(/^ {4}\[data-slot="[a-z0-9-]+"\]/gm)];
      expect(rules.length).toBeGreaterThan(150);

      // And the rules themselves, rather than the `@apply` they came from,
      // still reaching the theme. Not `--radius`: lyra rounds nothing.
      expect(sheet).not.toContain("@apply");
      expect(sheet).toContain("var(--");
    });
  }
});
