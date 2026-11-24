/**
 * Nothing in arc is written twice.
 *
 * arc is one design system for every product, and a declaration group copied
 * into a second component is a second place to change it, which is how two
 * cards end up with two corners. Every group is written once, as a treatment
 * in `@barqjs/arc/style` or in `@barqjs/ui`'s `lib/shared-*.ts`, and composed
 * everywhere else. This fails the suite when that stops being true, naming
 * both places and what to compose instead.
 *
 * It reads what the compiler produces rather than the source text, so a group
 * written in two spellings (`"0"` and `0`, `padding` and its four longhands)
 * is still caught, and a group composed from a treatment is not mistaken for
 * one written out.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

import { Glob } from "bun";

import {
  type AllowedLiteral,
  type AllowedPair,
  UI_GROUPS,
  buildErrors,
  duplicates,
  literalsIn,
  placesIn,
  repeatedLiterals as repeated,
  report as reported,
  uiGroups,
} from "./test-duplication.ts";

const root = import.meta.dir;
const ui = join(dirname(Bun.resolveSync("@barqjs/ui/package.json", root)), "src/lib");

/** Where a treatment or a token is declared, and so may be written out. */
const TREATMENT_MODULES = ["style/", "theme/", "code/style.ts", "code/editor-theme.ts"];

/**
 * Pairs whose repetition belongs to each component, with the reason. Empty is
 * the goal; an entry has to say why composing a treatment would be wrong.
 */
const ALLOWED: readonly AllowedPair[] = [
  {
    between: ["components/indicator.tsx", "components/rating.tsx"],
    why: "a badge pinned over its anchor's top corner and a rating's fill laid over its stars from the top meet on two declarations by coincidence; each is that component's own placement",
  },
];

/** Literals one component writes for several of its own parts' states, with the reason. */
const ALLOWED_LITERALS: readonly AllowedLiteral[] = [
  {
    value: "var(--border)",
    file: "components/data-table.tsx",
    why: "the header's rule is an inset shadow so it stays put while rows scroll under it, and the resize handle is drawn in the same line colour; neither is an edge",
  },
  {
    value: "var(--foreground)",
    file: "components/data-table.tsx",
    why: "a sorted column's header, a sortable one under the pointer and a row's header cell brighten from the muted table text, each under its own state selector",
  },
];

function modules(): string[] {
  return [...new Glob("**/*.{ts,tsx}").scanSync({ cwd: root })]
    .filter(
      (path) =>
        !path.includes(".test.") &&
        !path.split("/").at(-1)?.startsWith("test-") &&
        !path.endsWith("-harness.ts") &&
        !["compile-setup.ts", "register-dom.ts", "test-setup.ts"].includes(path),
    )
    .toSorted();
}

function report(found: Parameters<typeof reported>[0]): string[] {
  return reported(found, TREATMENT_MODULES, ALLOWED);
}

function repeatedLiterals(literals: Parameters<typeof repeated>[0]): string[] {
  return repeated(literals, ALLOWED_LITERALS);
}

describe("a build", () => {
  // arc's own suite runs the runtime fallback for a style call the compiler
  // declines, so an object a build refuses under `strictCss` (a spread, a
  // value it cannot read) only showed up as a 500 from an app's dev server.
  test("compiles every module with no error under strictCss", () => {
    expect(modules().flatMap((path) => buildErrors(join(root, path), root, path))).toEqual([]);
  });
});

describe("duplication", () => {
  test("no declaration group is written in two places, in arc or against ui's treatments", () => {
    const places = modules().flatMap((path) => placesIn(join(root, path), root, path));
    expect(places.length).toBeGreaterThan(50);
    const treatments = places.filter(
      (place) => place.file.startsWith("style/") && place.name !== undefined,
    );
    expect(report(duplicates(places, uiGroups(ui, root, UI_GROUPS), treatments))).toEqual([]);
  });

  test("no colour, spacing or radius is spelled out twice outside the treatments", () => {
    const literals = modules()
      .filter((path) => !TREATMENT_MODULES.some((prefix) => path.startsWith(prefix)))
      .flatMap((path) => literalsIn(join(root, path), path));
    expect(repeatedLiterals(literals)).toEqual([]);
  });

  test("and it does fail, naming both places, when a group is written twice", () => {
    const dir = mkdtempSync(join(tmpdir(), "arc-duplication-"));
    try {
      const layer = relative(dir, join(root, "layer.ts"));
      for (const name of ["one.ts", "two.ts"]) {
        writeFileSync(
          join(dir, name),
          `import { arcLayer as arc } from "${layer}";\n\n` +
            `export const card = arc({ display: "flex", alignItems: "center", padding: "1px" });\n`,
        );
      }
      writeFileSync(
        join(dir, "three.ts"),
        `import { arcLayer as arc } from "${layer}";\n\n` +
          `export const label = arc({ fontSize: "var(--text-sm)", lineHeight: "var(--ui-leading, var(--text-sm--line-height))", color: "var(--muted-foreground)" });\n` +
          `export const hint = arc({ color: "var(--muted-foreground)" });\n`,
      );
      const places = ["one.ts", "two.ts", "three.ts"].flatMap((name) =>
        placesIn(join(dir, name), root, name),
      );
      const treatments = modules()
        .filter((path) => path.startsWith("style/"))
        .flatMap((path) => placesIn(join(root, path), root, path))
        .filter((place) => place.name !== undefined);
      const found = report(duplicates(places, uiGroups(ui, root, UI_GROUPS), treatments));
      const pair = found.find((one) => one.startsWith("one.ts:3 (card) and two.ts:3 (card)"));
      expect(pair).toContain("{ display:flex }");
      expect(pair).toContain("{ padding:1px }");
      expect(pair).toContain("move the group into @barqjs/arc/style");
      expect(found).toContain(
        "one.ts:3 (card) and style/layout.ts:" +
          String(treatments.find((one) => one.name === "layout.row")?.line) +
          " (layout.row) both write & { display:flex }; & { align-items:center }: compose layout.row from @barqjs/arc/style",
      );
      expect(
        found.some(
          (one) =>
            one.startsWith("three.ts:3 (label) and @barqjs/ui/shared-text") &&
            one.endsWith("compose text.sm from @barqjs/ui/shared-text"),
        ),
      ).toBe(true);
      expect(found).toHaveLength(4);

      const literals = repeatedLiterals(
        ["three.ts"].flatMap((name) => literalsIn(join(dir, name), name)),
      );
      expect(literals).toEqual([
        "var(--muted-foreground) is written at three.ts:3 and three.ts:4: use a colour role (fg, bg, edge, surface, interaction) from @barqjs/arc/style",
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("reads every family the style entry exports, and composes what moved into them", () => {
    const families = [
      ...readFileSync(join(root, "style/index.ts"), "utf8").matchAll(/from "\.\/([\w-]+)\.ts"/g),
    ].map((match) => `style/${match[1] ?? ""}.ts`);
    const places = modules()
      .filter((path) => path.startsWith("style/"))
      .flatMap((path) => placesIn(join(root, path), root, path));
    const scanned = new Set(places.map((place) => place.file));
    // `tokens.ts` holds values, not groups.
    expect(families.filter((family) => !scanned.has(family))).toEqual(["style/tokens.ts"]);

    const treatments = places.filter((place) => place.name !== undefined);
    const dir = mkdtempSync(join(tmpdir(), "arc-duplication-"));
    try {
      const layer = relative(dir, join(root, "layer.ts"));
      writeFileSync(
        join(dir, "four.ts"),
        `import { arcLayer as arc } from "${layer}";\n\n` +
          `export const swatch = arc({ width: "calc(var(--spacing) * 6)", height: "calc(var(--spacing) * 6)" });\n` +
          `export const items = arc({ margin: "0", padding: "0px", listStyle: "none" });\n` +
          `export const layer = arc({ position: "absolute", inset: "0" });\n` +
          `export const link = arc({ textDecorationLine: "none", "[aria-current]": { color: "var(--foreground)" } });\n`,
      );
      const found = report(
        duplicates(
          placesIn(join(dir, "four.ts"), root, "four.ts"),
          uiGroups(ui, root, UI_GROUPS),
          treatments,
        ),
      );
      for (const treatment of ["square.x6", "plainList", "place.cover", "type.navLink"]) {
        expect(
          found.some((one) => one.endsWith(`compose ${treatment} from @barqjs/arc/style`)),
        ).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
