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
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

import { Glob } from "bun";

import {
  type Duplicate,
  type Literal,
  type Place,
  duplicates,
  literalsIn,
  placesIn,
  treatmentFor,
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
const ALLOWED: readonly { readonly between: readonly [string, string]; readonly why: string }[] =
  [];

/** Literals one component writes for several of its own parts' states, with the reason. */
const ALLOWED_LITERALS: readonly {
  readonly value: string;
  readonly file: string;
  readonly why: string;
}[] = [
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

const UI_GROUPS = [
  "shared-box.ts",
  "shared-contrast.ts",
  "shared-icon.ts",
  "shared-ring-slot.ts",
  "shared-ring.ts",
  "shared-text.ts",
  "shared-touch.ts",
  "shared-when.ts",
];

function where(place: Place): string {
  return place.line === 0 ? place.file : `${place.file}:${String(place.line)} (${place.label})`;
}

function advice(found: Duplicate): string {
  const { first, second } = found;
  const treatment = [first, second].find(
    (place) =>
      place.file.startsWith("@barqjs/ui") ||
      TREATMENT_MODULES.some((prefix) => place.file.startsWith(prefix)),
  );
  return treatment?.name === undefined
    ? "move the group into @barqjs/arc/style and compose it from both"
    : `compose ${treatment.name} from ${treatment.file.startsWith("@barqjs/ui") ? treatment.file : "@barqjs/arc/style"}`;
}

function report(found: readonly Duplicate[]): string[] {
  return found
    .filter(
      (one) =>
        !ALLOWED.some(
          (allowed) =>
            allowed.between.includes(one.first.file) && allowed.between.includes(one.second.file),
        ),
    )
    .map(
      (one) =>
        `${where(one.first)} and ${where(one.second)} both write ${one.shared.join("; ")}: ${advice(one)}`,
    );
}

function repeatedLiterals(literals: readonly Literal[]): string[] {
  const byValue = new Map<string, Literal[]>();
  for (const one of literals) byValue.set(one.value, [...(byValue.get(one.value) ?? []), one]);
  const out: string[] = [];
  for (const [value, found] of byValue) {
    if (found.length < 2) continue;
    const files = new Set(found.map((one) => one.file));
    const allowed = ALLOWED_LITERALS.find((one) => one.value === value);
    if (allowed !== undefined && files.size === 1 && files.has(allowed.file)) continue;
    const [first, second] = found;
    out.push(
      `${value} is written at ${first?.file ?? ""}:${String(first?.line)} and ${second?.file ?? ""}:${String(second?.line)}` +
        `${found.length > 2 ? ` and ${String(found.length - 2)} more` : ""}: use ${treatmentFor(value)}`,
    );
  }
  return out;
}

describe("duplication", () => {
  test("no declaration group is written in two places, in arc or against ui's treatments", () => {
    const places = modules().flatMap((path) => placesIn(join(root, path), root, path));
    expect(places.length).toBeGreaterThan(50);
    const treatments = places.filter(
      (place) => place.file === "style/index.ts" && place.name !== undefined,
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
      const treatments = placesIn(join(root, "style/index.ts"), root, "style/index.ts").filter(
        (place) => place.name !== undefined,
      );
      const found = report(duplicates(places, uiGroups(ui, root, UI_GROUPS), treatments));
      const pair = found.find((one) => one.startsWith("one.ts:3 (card) and two.ts:3 (card)"));
      expect(pair).toContain("{ display:flex }");
      expect(pair).toContain("{ padding:1px }");
      expect(pair).toContain("move the group into @barqjs/arc/style");
      expect(found).toContain(
        "one.ts:3 (card) and style/index.ts:" +
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
});
