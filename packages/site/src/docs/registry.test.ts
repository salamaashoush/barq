import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { slugOf } from "../docs.tsx";
import { PAGES } from "./guides/index.ts";
import { GUIDES } from "./guides/registry-data.ts";
import { COMPONENTS, docNamed } from "./index.ts";

const examples = fileURLToPath(new URL("./examples/", import.meta.url));
const guides = fileURLToPath(new URL("./guides/", import.meta.url));

/** The pages whose examples are files, one each, under `examples/<slug>/`. */
const ported = readdirSync(examples).filter((name) => existsSync(join(examples, name, "index.ts")));

describe("the component pages", () => {
  test("a slug is an address, so no two pages share one, and the rail is alphabetical", () => {
    const slugs = COMPONENTS.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toEqual(slugs.toSorted());
    for (const entry of COMPONENTS) expect(docNamed(entry.slug)).toBe(entry);
  });

  test("every directory of examples is a page's, and has a test beside it", () => {
    const pages = new Set(COMPONENTS.map((entry) => entry.slug));
    for (const slug of ported) {
      expect(pages.has(slug), `${slug} has examples and no page`).toBe(true);
      expect(existsSync(join(examples, slug, `${slug}.test.tsx`)), `${slug} has no test`).toBe(
        true,
      );
    }
  });

  test("the first example is the hero and every other one has a heading of its own", () => {
    for (const entry of COMPONENTS) {
      const [hero, ...rest] = entry.demos;
      expect(hero?.title, `${entry.slug}: the hero has a title`).toBeUndefined();
      const anchors = rest.map((demo) => slugOf(demo.title ?? ""));
      expect(anchors.includes(""), `${entry.slug}: an example has no title`).toBe(false);
      expect(new Set(anchors).size, `${entry.slug}: two examples share an anchor`).toBe(
        anchors.length,
      );
      for (const reserved of ["installation", "usage"]) {
        expect(anchors.includes(reserved), `${entry.slug}: ${reserved} is the page's own`).toBe(
          false,
        );
      }
    }
  });

  test("the code under an example is the text of the file it runs, and no file is left out", () => {
    for (const entry of COMPONENTS.filter((each) => ported.includes(each.slug))) {
      const directory = join(examples, entry.slug);
      const files = readdirSync(directory).filter(
        (name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"),
      );
      const sources = new Map(
        files.map((name) => [readFileSync(join(directory, name), "utf8"), name] as const),
      );
      const shown = new Set<string>();
      for (const demo of entry.demos) {
        const file = sources.get(demo.code);
        expect(
          file,
          `${entry.slug}: "${demo.title ?? "hero"}" shows code no file holds`,
        ).toBeDefined();
        expect(typeof demo.component).toBe("function");
        if (file !== undefined) shown.add(file);
      }
      expect(
        files.filter((name) => !shown.has(name)),
        `${entry.slug}: files no example shows`,
      ).toEqual([]);
    }
  });
});

describe("the guides", () => {
  test("every guide the rail lists has a page", () => {
    expect(PAGES.map((guide) => guide.slug)).toEqual(GUIDES.map((guide) => guide.slug));
    for (const guide of GUIDES) {
      expect(existsSync(join(guides, `${guide.slug}.tsx`)), `${guide.slug} has no module`).toBe(
        true,
      );
    }
  });

  test("a guide's contents are its headings, each with an anchor of its own", () => {
    for (const guide of PAGES) {
      const ids = guide.sections.map((section) => section.id);
      expect(ids.length, `${guide.slug} has no sections`).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
